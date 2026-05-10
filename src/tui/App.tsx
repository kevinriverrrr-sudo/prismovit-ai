/**
 * PRISM TUI — Terminal User Interface
 * Beautiful React/Ink-based terminal chat interface.
 * Combines: OpenCode's OpenTUI component model, Pi's differential rendering concept, OpenClaude's Ink/React approach.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import type { Message, AgentEvent, ProviderName, PrismConfig } from '../types/index.js';
import type { AgentLoop } from '../agent/index.js';
import type { SessionManager } from '../session/index.js';
import type { ProviderRegistry } from '../providers/index.js';

// ==================== Theme Helper ====================

export function getThemeColors(config: PrismConfig) {
  const c = config.theme.colors;
  return {
    primaryHex: c.primary,
    secondaryHex: c.secondary,
    accentHex: c.accent,
    errorHex: c.error,
    warningHex: c.warning,
    successHex: c.success,
    mutedHex: c.muted,
    borderHex: c.border,
    bgHex: c.background,
    primary: chalk.hex(c.primary),
    secondary: chalk.hex(c.secondary),
    accent: chalk.hex(c.accent),
    error: chalk.hex(c.error),
    warning: chalk.hex(c.warning),
    success: chalk.hex(c.success),
    muted: chalk.hex(c.muted),
    border: chalk.hex(c.border),
    bg: chalk.hex(c.background),
  };
}

// ==================== Markdown Renderer ====================

function renderMarkdown(text: string, colors: ReturnType<typeof getThemeColors>): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <Box key={`code-${i}`} flexDirection="column" marginY={1}>
          {lang && <Text dimColor>{lang}</Text>}
          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            <Text dimColor>{codeLines.join('\n')}</Text>
          </Box>
        </Box>
      );
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      nodes.push(<Text key={i} bold color="cyan">{line.slice(4)}</Text>);
      continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(<Text key={i} bold color="cyan">{line.slice(3)}</Text>);
      continue;
    }
    if (line.startsWith('# ')) {
      nodes.push(<Text key={i} bold color="cyan">{line.slice(2)}</Text>);
      continue;
    }

    // Lists
    if (line.match(/^[-*] /)) {
      nodes.push(
        <Text key={i}>
          <Text color="yellow">  • </Text>
          <Text>{renderInlineFormatting(line.slice(2), colors)}</Text>
        </Text>
      );
      continue;
    }

    // Numbered lists
    if (line.match(/^\d+\. /)) {
      const match = line.match(/^(\d+)\. (.*)/);
      if (match) {
        nodes.push(
          <Text key={i}>
            <Text color="yellow">{match[1]}. </Text>
            <Text>{renderInlineFormatting(match[2], colors)}</Text>
          </Text>
        );
        continue;
      }
    }

    // Empty lines
    if (line.trim() === '') {
      nodes.push(<Text key={i}> </Text>);
      continue;
    }

    // Regular text
    nodes.push(<Text key={i}>{renderInlineFormatting(line, colors)}</Text>);
  }

  return nodes;
}

function renderInlineFormatting(text: string, colors: ReturnType<typeof getThemeColors>): React.ReactNode {
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, (match) => chalk.bold(match.replace(/\*\*/g, '')));
  // Inline code
  text = text.replace(/`([^`]+)`/g, (_, code) => colors.muted(code));
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, _url) => colors.primary(label));

  return text;
}

// ==================== Message Bubble ====================

interface MessageBubbleProps {
  message: Message;
  colors: ReturnType<typeof getThemeColors>;
  isStreaming?: boolean;
}

function MessageBubble({ message, colors, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  if (isTool) return null;

  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const roleLabel = isUser ? 'You' : 'PRISM';
  const roleColor = isUser ? colors.primaryHex : colors.accentHex;
  const provider = message.provider ? ` (${message.provider}/${message.model})` : '';

  return (
    <Box flexDirection="column" marginY={1} paddingX={1}>
      {/* Role header */}
      <Box>
        <Text bold color={roleColor}>
          {roleLabel}
        </Text>
        <Text dimColor>{provider}</Text>
        <Text dimColor> {time}</Text>
        {isStreaming && (
          <Text> <Spinner type="dots" /></Text>
        )}
      </Box>

      {/* Content */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box marginTop={1}>
          {message.toolCalls.map((tc) => (
            <Box key={tc.id} paddingX={1} borderStyle="round" borderColor="yellow" marginY={1}>
              <Text color="yellow">🔧 {tc.name}</Text>
              <Text dimColor> {JSON.stringify(tc.arguments).slice(0, 100)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {message.content && (
        <Box flexDirection="column" paddingX={1}>
          {renderMarkdown(message.content, colors)}
        </Box>
      )}

      {/* Token usage */}
      {message.tokens && (message.tokens.input > 0 || message.tokens.output > 0) && (
        <Box marginTop={1}>
          <Text dimColor>
            📊 {message.tokens.input.toLocaleString()} in / {message.tokens.output.toLocaleString()} out
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ==================== Input Bar ====================

interface InputBarProps {
  onSubmit: (text: string) => void;
  onFocus: () => void;
  colors: ReturnType<typeof getThemeColors>;
}

function InputBar({ onSubmit, onFocus, colors }: InputBarProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<any>(null);

  useEffect(() => {
    onFocus();
  }, [onFocus]);

  const handleSubmit = (text: string) => {
    if (text.trim()) {
      onSubmit(text);
      setValue('');
    }
  };

  return (
    <Box borderStyle="round" borderColor={colors.primaryHex} paddingX={1}>
      <Text color={colors.primaryHex}>❯ </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="Type a message... (Tab for autocomplete)"
        focus={true}
      />
    </Box>
  );
}

// ==================== Status Bar ====================

interface StatusBarProps {
  session: { model: string; provider: ProviderName } | null;
  isStreaming: boolean;
  colors: ReturnType<typeof getThemeColors>;
  mcpServers: string[];
}

function StatusBar({ session, isStreaming, colors, mcpServers }: StatusBarProps) {
  const providerLabel = session ? `${session.provider}/${session.model}` : 'no session';

  return (
    <Box borderStyle="single" borderColor={colors.borderHex} paddingX={1}>
      <Text>
        <Text bold color={colors.accentHex}>PRISM</Text>
        <Text dimColor> │ </Text>
        <Text color={colors.primaryHex}>{providerLabel}</Text>
        <Text dimColor> │ </Text>
        {isStreaming ? (
          <Text color="yellow"><Spinner type="dots" /> Generating</Text>
        ) : (
          <Text color={colors.successHex}>● Ready</Text>
        )}
        {mcpServers.length > 0 && (
          <>
            <Text dimColor> │ </Text>
            <Text color={colors.secondaryHex}>MCP: {mcpServers.length}</Text>
          </>
        )}
        <Text dimColor> │ </Text>
        <Text dimColor>Ctrl+H help │ Ctrl+N new │ Ctrl+M model │ Ctrl+C quit</Text>
      </Text>
    </Box>
  );
}

// ==================== Help Panel ====================

interface HelpPanelProps {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof getThemeColors>;
}

function HelpPanel({ visible, onClose, colors }: HelpPanelProps) {
  useInput((input, key) => {
    if (visible && (key.escape || input === 'q')) {
      onClose();
    }
  });

  if (!visible) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={colors.accentHex}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={colors.accentHex}>PRISM — Keyboard Shortcuts & Commands</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.primaryHex}>Shortcuts:</Text>
        <Text>  Enter       — Send message</Text>
        <Text>  Escape      — Cancel / Close panel</Text>
        <Text>  Ctrl+C      — Cancel generation / Quit</Text>
        <Text>  Ctrl+N      — New session</Text>
        <Text>  Ctrl+M      — Switch model</Text>
        <Text>  Ctrl+H      — Toggle this help</Text>
        <Text>  Ctrl+L      — Clear screen</Text>
        <Text>  Ctrl+W      — Toggle web interface</Text>
        <Text>  Tab         — Autocomplete commands</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.primaryHex}>Slash Commands:</Text>
        <Text>  /help        — Show this help</Text>
        <Text>  /model       — Change AI model</Text>
        <Text>  /provider    — Switch provider</Text>
        <Text>  /new         — New chat session</Text>
        <Text>  /clear       — Clear messages</Text>
        <Text>  /compact     — Compact context</Text>
        <Text>  /sessions    — List sessions</Text>
        <Text>  /resume      — Resume session</Text>
        <Text>  /export      — Export session</Text>
        <Text>  /mcp         — MCP server management</Text>
        <Text>  /config      — Edit configuration</Text>
        <Text>  /theme       — Change theme</Text>
        <Text>  /web         — Start/stop web interface</Text>
        <Text>  /cost        — Token usage stats</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Escape or q to close</Text>
      </Box>
    </Box>
  );
}

// ==================== Welcome Screen ====================

function WelcomeScreen({ colors }: { colors: ReturnType<typeof getThemeColors> }) {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={4}>
      <Box>
        <Text bold color={colors.accentHex}>
          {'     ╔══════════════════════════╗\n'}
        </Text>
        <Text bold color={colors.accentHex}>
          {'     ║'}
        </Text>
        <Text bold color={colors.primaryHex}>
          {'  ◆ PRISM AI v1.0.0 '}
        </Text>
        <Text bold color={colors.accentHex}>
          {'  ║\n'}
        </Text>
        <Text bold color={colors.accentHex}>
          {'     ║'}
        </Text>
        <Text color={colors.primaryHex}>
          {' Multi-Provider AI CLI '}
        </Text>
        <Text bold color={colors.accentHex}>
          {'  ║\n'}
        </Text>
        <Text bold color={colors.accentHex}>
          {'     ╚══════════════════════════╝\n'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={colors.mutedHex}>
          {'  Combining the best of OpenCode + Pi + OpenClaude\n'}
        </Text>
        <Text color={colors.mutedHex}>
          {'  Multi-provider • MCP • Cross-platform • Web UI\n'}
        </Text>
      </Box>
      <Box marginTop={2} flexDirection="column">
        <Text color={colors.successHex}>
          {'  🔗 Supported Providers:\n'}
        </Text>
        <Text>
          {'    OpenAI • Anthropic • Gemini • Ollama • OpenRouter\n'}
          {'    DeepSeek • Groq • Custom endpoints\n'}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {'  Type a message to start, or /help for commands\n'}
          {'  Press Ctrl+H for keyboard shortcuts\n'}
        </Text>
      </Box>
    </Box>
  );
}

// ==================== Main TUI App ====================

interface PrismTUIProps {
  agent: AgentLoop;
  sessionManager: SessionManager;
  providerRegistry: ProviderRegistry;
  config: PrismConfig;
  colors: ReturnType<typeof getThemeColors>;
}

const DEFAULT_THEMES = ['dark', 'light', 'midnight', 'nord', 'tokyo'];

export function PrismTUI({ agent, sessionManager, providerRegistry, config, colors }: PrismTUIProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const messagesEndRef = useRef<any>(null);
  const currentSession = sessionManager.getCurrentSession();

  // Listen to agent events
  useEffect(() => {
    const unsubscribe = agent.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case 'start':
          setIsStreaming(true);
          break;
        case 'text':
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant' && !last.toolCalls?.length) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
            } else {
              updated.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: event.content,
                timestamp: Date.now(),
              });
            }
            return updated;
          });
          break;
        case 'tool_call':
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            toolCalls: [{ id: crypto.randomUUID(), name: event.toolName || '', arguments: event.toolArgs || {} }],
            timestamp: Date.now(),
          }]);
          break;
        case 'tool_result':
          // Tool result displayed inline
          break;
        case 'done':
          setIsStreaming(false);
          break;
        case 'error':
          setIsStreaming(false);
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `⚠️ ${event.content}`,
            timestamp: Date.now(),
          }]);
          break;
        case 'usage':
          if (event.usage) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  tokens: event.usage,
                };
              }
              return updated;
            });
          }
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [agent]);

  // Key bindings
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (isStreaming) {
        agent.stop();
      } else {
        exit();
      }
      return;
    }

    if (key.ctrl && input === 'h') {
      setShowHelp((prev) => !prev);
      return;
    }

    if (key.ctrl && input === 'n') {
      sessionManager.createSession();
      setMessages([]);
      return;
    }

    if (key.ctrl && input === 'l') {
      setMessages([]);
      return;
    }

    if (showHelp && (key.escape || input === 'q')) {
      setShowHelp(false);
      return;
    }
  });

  const handleSubmit = useCallback(async (text: string) => {
    // Handle slash commands
    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);

    // Add to session and send to agent
    if (currentSession) {
      sessionManager.addMessage(currentSession.id, userMsg);
      agent.start();
      await agent.sendMessage(text);
    } else {
      const session = sessionManager.createSession();
      sessionManager.addMessage(session.id, userMsg);
      agent.start();
      await agent.sendMessage(text);
    }
  }, [agent, currentSession, sessionManager]);

  const handleCommand = async (text: string) => {
    const [command, ...args] = text.slice(1).split(' ');

    switch (command) {
      case 'help':
      case 'h':
        setShowHelp(true);
        break;

      case 'new':
      case 'n': {
        sessionManager.createSession();
        setMessages([]);
        break;
      }

      case 'clear':
        setMessages([]);
        if (currentSession) {
          sessionManager.clearMessages(currentSession.id);
        }
        break;

      case 'compact':
        setMessages((prev) => {
          if (prev.length > 10) {
            const kept = prev.slice(-5);
            return [{
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '🧹 Context compacted. Previous messages summarized.',
              timestamp: Date.now(),
            }, ...kept];
          }
          return prev;
        });
        break;

      case 'model': {
        if (args.length > 0) {
          agent.switchModel(args.join(' '));
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `✅ Model switched to: ${args.join(' ')}`,
            timestamp: Date.now(),
          }]);
        } else {
          const models = await providerRegistry.getAllModels();
          const modelList = models.slice(0, 20).map((m) => `  ${m.provider}/${m.id}`).join('\n');
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `📊 Available models:\n${modelList}\n\nUsage: /model <provider/model-id>`,
            timestamp: Date.now(),
          }]);
        }
        break;
      }

      case 'provider': {
        const providers = Array.from(providerRegistry.getAllProviders().entries());
        const list = providers.map(([name, _]) => `  • ${name}`).join('\n');
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `📊 Providers:\n${list}\n\nUsage: /model <provider>/<model>`,
          timestamp: Date.now(),
        }]);
        break;
      }

      case 'sessions': {
        const sessions = await sessionManager.listSessions();
        const list = sessions.slice(0, 10).map(
          (s) => `  [${s.id.slice(0, 8)}] ${s.title} (${s.provider}/${s.model}, ${s.messageCount} msgs)`
        ).join('\n');
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `📋 Sessions:\n${list || '  No sessions yet'}`,
          timestamp: Date.now(),
        }]);
        break;
      }

      case 'export': {
        if (currentSession) {
          const exported = sessionManager.exportSession(currentSession.id, 'markdown');
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `📝 Session exported:\n\n${exported}`,
            timestamp: Date.now(),
          }]);
        }
        break;
      }

      case 'theme': {
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `🎨 Available themes: ${DEFAULT_THEMES.join(', ')}\n\nSet PRISM_THEME env var or edit config to change theme.`,
          timestamp: Date.now(),
        }]);
        break;
      }

      case 'cost': {
        let totalInput = 0;
        let totalOutput = 0;
        for (const msg of messages) {
          if (msg.tokens) {
            totalInput += msg.tokens.input;
            totalOutput += msg.tokens.output;
          }
        }
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `💰 Token Usage (this session):\n  Input: ${totalInput.toLocaleString()}\n  Output: ${totalOutput.toLocaleString()}\n  Total: ${(totalInput + totalOutput).toLocaleString()}`,
          timestamp: Date.now(),
        }]);
        break;
      }

      case 'mcp': {
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `🔌 MCP Servers:\n${mcpServers.length > 0 ? mcpServers.map((s) => `  ● ${s} (connected)`).join('\n') : '  No MCP servers configured'}\n\nConfigure in ~/.prism/config.json under "mcpServers"`,
          timestamp: Date.now(),
        }]);
        break;
      }

      default:
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❓ Unknown command: /${command}\nType /help for available commands.`,
          timestamp: Date.now(),
        }]);
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box
        justifyContent="center"
        paddingY={1}
        borderBottom={false}
      >
        <Text bold color={colors.accentHex}>◆ PRISM </Text>
        <Text dimColor>AI Coding Agent</Text>
      </Box>

      {/* Messages area */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflowY="hidden">
        {messages.length === 0 ? (
          <WelcomeScreen colors={colors} />
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              colors={colors}
              isStreaming={isStreaming && msg === messages[messages.length - 1]}
            />
          ))
        )}
        {isStreaming && (
          <Box marginTop={1}>
            <Text color="yellow"><Spinner type="dots" /></Text>
          </Box>
        )}
      </Box>

      {/* Input bar */}
      <Box paddingY={1}>
        <InputBar onSubmit={handleSubmit} onFocus={() => {}} colors={colors} />
      </Box>

      {/* Status bar */}
      <StatusBar
        session={currentSession ? { model: currentSession.model, provider: currentSession.provider } : null}
        isStreaming={isStreaming}
        colors={colors}
        mcpServers={mcpServers}
      />

      {/* Help panel overlay */}
      <HelpPanel visible={showHelp} onClose={() => setShowHelp(false)} colors={colors} />
    </Box>
  );
}
