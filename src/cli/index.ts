/**
 * PRISM CLI Entry Point
 * Main command-line interface using Commander.js.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from '../config/index.js';
import { ProviderRegistry } from '../providers/index.js';
import { ToolRegistry } from '../tools/index.js';
import { MCPManager } from '../mcp/index.js';
import { SessionManager } from '../session/index.js';
import { AgentLoop } from '../agent/index.js';
import { WebServer } from '../web/index.js';
import { existsSync, mkdirSync } from 'fs';

const VERSION = '1.1.0';

// ==================== Print Mode ====================

async function printMode(agent: AgentLoop, prompt: string): Promise<void> {
  agent.start();

  const unsubscribe = agent.onEvent((event) => {
    switch (event.type) {
      case 'text':
        process.stdout.write(event.content);
        break;
      case 'tool_call':
        process.stdout.write(chalk.yellow(`\n🔧 ${event.toolName}(${JSON.stringify(event.toolArgs || {}).slice(0, 100)})...\n`));
        break;
      case 'tool_result':
        process.stdout.write(chalk.dim(`  → ${event.content.slice(0, 200)}\n`));
        break;
      case 'error':
        process.stderr.write(chalk.red(`\nError: ${event.content}\n`));
        break;
      case 'usage':
        if (event.usage) {
          process.stdout.write(chalk.dim(`\n\n📊 ${event.usage.input} in / ${event.usage.output} out tokens\n`));
        }
        break;
    }
  });

  await agent.sendMessage(prompt);
  agent.stop();
  unsubscribe();
}

// ==================== Interactive Mode ====================

async function startInteractiveMode(
  agent: AgentLoop,
  sessionManager: SessionManager,
  providerRegistry: ProviderRegistry,
  config: ConfigManager,
): Promise<void> {
  try {
    const React = await import('react');
    const { render } = await import('ink');
    const { PrismTUI, getThemeColors } = await import('../tui/App.js');

    const themeColors = getThemeColors(config.getConfig());

    const { waitUntilExit } = render(
      React.createElement(PrismTUI, {
        agent,
        sessionManager,
        providerRegistry,
        config: config.getConfig(),
        colors: themeColors,
      }),
    );

    await waitUntilExit();
  } catch (error: unknown) {
    console.error('TUI failed:', (error as Error).message);
    console.error('Falling back to REPL mode...\n');
    await simpleReplMode(agent);
  }
}

// ==================== Simple REPL Mode ====================

async function simpleReplMode(agent: AgentLoop): Promise<void> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.hex('#f472b6').bold('\n  ◆ PRISM AI v1.0.0'));
  console.log(chalk.dim('  Type messages to chat, /help for commands, /quit to exit\n'));

  agent.start();

  agent.onEvent((event) => {
    switch (event.type) {
      case 'text':
        process.stdout.write(event.content);
        break;
      case 'tool_call':
        process.stdout.write(chalk.yellow(`\n🔧 ${event.toolName}...\n`));
        break;
      case 'tool_result':
        process.stdout.write(chalk.dim(`${event.content.slice(0, 300)}\n`));
        break;
      case 'error':
        process.stderr.write(chalk.red(`\n⚠️ ${event.content}\n`));
        break;
      case 'done':
        process.stdout.write('\n\n');
        rl.prompt();
        break;
      case 'usage':
        if (event.usage) {
          process.stdout.write(chalk.dim(`📊 ${event.usage.input}+${event.usage.output} tokens\n`));
        }
        break;
    }
  });

  const ask = () => {
    rl.question(chalk.hex('#60a5fa')('❯ '), async (input) => {
      const text = input.trim();
      if (!text) { ask(); return; }

      if (text === '/quit' || text === '/exit' || text === '/q') {
        agent.stop();
        rl.close();
        process.exit(0);
        return;
      }

      if (text === '/help') {
        console.log(`
  Commands:
    /help      — Show this help
    /quit      — Exit
    /model     — List available models
    /new       — New session
    /clear     — Clear messages
    /cost      — Token usage
        `);
        ask();
        return;
      }

      if (text.startsWith('/model')) {
        const args = text.slice(7).trim();
        if (args) {
          agent.switchModel(args);
          console.log(chalk.green(`✅ Model: ${args}`));
        }
        ask();
        return;
      }

      if (text === '/new') {
        agent.stop();
        agent.start();
        console.log(chalk.green('✅ New session'));
        ask();
        return;
      }

      if (text === '/clear') {
        console.log(chalk.green('✅ Cleared'));
        ask();
        return;
      }

      await agent.sendMessage(text);
    });
  };

  ask();
}

// ==================== Web Mode ====================

async function startWebMode(config: ConfigManager, port: number): Promise<void> {
  const providerRegistry = new ProviderRegistry(config);
  const toolRegistry = new ToolRegistry();
  const sessionManager = new SessionManager(config.getDataDir());

  let mcpManager: MCPManager | null = null;
  const mcpConfigs = config.get('mcpServers');
  if (Object.keys(mcpConfigs).length > 0) {
    mcpManager = new MCPManager(mcpConfigs);
    await mcpManager.connectAll().catch(() => {});
  }

  const agent = new AgentLoop(providerRegistry, toolRegistry, sessionManager, config, mcpManager || undefined);
  const webServer = new WebServer(agent, sessionManager, providerRegistry, config.getConfig(), port);

  await webServer.start();

  console.log(`
  ◆ PRISM AI — Web Interface
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🌐  ${chalk.cyan(webServer.getUrl())}
  📡  Provider: ${config.get('defaultProvider')}/${config.get('defaultModel')}
  🔌  MCP: ${mcpManager ? `${mcpManager.getConnectedServers().length} servers` : 'disabled'}
  ⏹   Press Ctrl+C to stop
  `);

  process.on('SIGINT', async () => {
    console.log(chalk.dim('\n  Shutting down...'));
    await webServer.stop();
    if (mcpManager) await mcpManager.disconnectAll();
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

// ==================== Main CLI (exported) ====================

export async function runCLI(): Promise<void> {
  const program = new Command();

  program
    .name('prism')
    .description('◆ PRISM — Multi-provider AI Coding Agent CLI')
    .version(VERSION, '-v, --version', 'Show version')
    .helpOption('-h, --help', 'Show help')
    .argument('[prompt...]', 'Message to send')
    .option('-p, --provider <name>', 'LLM provider')
    .option('-m, --model <model>', 'Model to use')
    .option('--print', 'Non-interactive: print response and exit')
    .option('--web', 'Start web interface only')
    .option('--web-port <port>', 'Web interface port', '3141')
    .option('--no-mcp', 'Disable MCP servers')
    .option('-c, --continue', 'Continue last session')
    .option('-s, --session <id>', 'Resume specific session')
    .option('--theme <name>', 'Theme (dark, light, midnight, nord, tokyo)')
    .action(async (promptArgs: string[], opts: Record<string, unknown>) => {
      const config = new ConfigManager();

      // Ensure data directory exists
      if (!existsSync(config.getDataDir())) {
        mkdirSync(config.getDataDir(), { recursive: true });
      }

      // Apply options
      if (opts.provider) {
        config.set('defaultProvider', opts.provider as any);
      }
      if (opts.model) {
        config.set('defaultModel', opts.model as string);
      }
      if (opts.theme) {
        const themes = config.getAllThemes();
        if (themes[opts.theme as string]) {
          config.set('theme', themes[opts.theme as string]);
        }
      }

      // ===== Web mode =====
      if (opts.web) {
        await startWebMode(config, parseInt(opts.webPort as string));
        return;
      }

      // Initialize core
      const providerRegistry = new ProviderRegistry(config);
      const toolRegistry = new ToolRegistry();
      const sessionManager = new SessionManager(config.getDataDir());

      // MCP
      let mcpManager: MCPManager | null = null;
      if (opts.mcp !== false) {
        const mcpConfigs = config.get('mcpServers');
        if (Object.keys(mcpConfigs).length > 0) {
          mcpManager = new MCPManager(mcpConfigs);
          try {
            await mcpManager.connectAll();
          } catch {
            // MCP connection failures are non-fatal
          }
        }
      }

      const agent = new AgentLoop(providerRegistry, toolRegistry, sessionManager, config, mcpManager || undefined);

      // Session management
      if (opts.session) {
        const session = await sessionManager.getSession(opts.session as string);
        if (session) sessionManager.setCurrentSession(session);
      } else if (opts.continue) {
        const sessions = await sessionManager.listSessions();
        if (sessions.length > 0) {
          const lastSession = await sessionManager.getSession(sessions[0].id);
          if (lastSession) sessionManager.setCurrentSession(lastSession);
        }
      } else {
        sessionManager.createSession();
      }

      // ===== Print mode =====
      const prompt = (promptArgs || []).join(' ');

      if (opts.print || prompt) {
        if (!prompt) {
          console.error('Error: provide a message or use interactive mode');
          process.exit(1);
        }
        await printMode(agent, prompt);
        if (mcpManager) await mcpManager.disconnectAll();
        return;
      }

      // ===== Interactive TUI / REPL mode =====
      await startInteractiveMode(agent, sessionManager, providerRegistry, config);

      if (mcpManager) {
        await mcpManager.disconnectAll();
      }
    });

  await program.parseAsync(process.argv);
}
