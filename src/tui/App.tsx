/**
 * PRISM TUI — Terminal User Interface
 * Beautiful React/Ink-based terminal chat interface.
 * Input handling is done ONLY by TextInput — no useInput in parent to avoid doubling.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
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

// ==================== Message Bubble ====================

interface MessageBubbleProps {
  message: Message;
  colors: ReturnType<typeof getThemeColors>;
  isStreaming?: boolean;
}

function MessageBubble({ message, colors, isStreaming }: MessageBubbleProps) {
  if (message.role === 'tool') return null;

  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const roleLabel = isUser ? 'You' : 'PRISM';
  const roleColor = isUser ? colors.primaryHex : colors.accentHex;
  const provider = message.provider ? ` (${message.provider}/${message.model})` : '';

  return (
    <Box flexDirection="column" marginY={0} paddingX={1}>
      <Box>
        <Text bold color={roleColor}>{roleLabel}</Text>
        <Text dimColor>{provider}</Text>
        <Text dimColor> {time}</Text>
        {isStreaming && <Text> <Spinner type="dots" /></Text>}
      </Box>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box marginTop={0}>
          {message.toolCalls.map((tc) => (
            <Box key={tc.id} paddingX={1} borderStyle="round" borderColor="yellow" marginY={0}>
              <Text color="yellow">🔧 {tc.name}</Text>
              <Text dimColor> {JSON.stringify(tc.arguments).slice(0, 100)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {message.content && (
        <Box flexDirection="column" paddingX={1}>
          <Text>{message.content}</Text>
        </Box>
      )}

      {message.tokens && (message.tokens.input > 0 || message.tokens.output > 0) && (
        <Box marginTop={0}>
          <Text dimColor>📊 {message.tokens.input.toLocaleString()} in / {message.tokens.output.toLocaleString()} out</Text>
        </Box>
      )}
    </Box>
  );
}

// ==================== Help Panel ====================
// This is the ONLY component that uses useInput — to capture Escape/q when visible

interface HelpPanelProps {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof getThemeColors>;
}

function HelpPanel({ visible, onClose, colors }: HelpPanelProps) {
  // isActive=false prevents this from capturing input when hidden
  useInput((_input, key) => {
    if (key.escape) {
      onClose();
    }
  }, { isActive: visible });

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
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.primaryHex}>Slash Commands:</Text>
        <Text>  /help        — Show this help</Text>
        <Text>  /model       — Change AI model</Text>
        <Text>  /provider    — List providers</Text>
        <Text>  /new         — New chat session</Text>
        <Text>  /clear       — Clear messages</Text>
        <Text>  /sessions    — List sessions</Text>
        <Text>  /export      — Export session</Text>
        <Text>  /mcp         — MCP server info</Text>
        <Text>  /theme       — Show themes</Text>
        <Text>  /cost        — Token usage stats</Text>
        <Text>  /quit        — Exit PRISM</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Escape to close</Text>
      </Box>
    </Box>
  );
}

// ==================== Welcome Screen ====================

function WelcomeScreen({ colors }: { colors: ReturnType<typeof getThemeColors> }) {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>
      <Box flexDirection="column" alignItems="center">
        <Text bold color={colors.accentHex}>{'  ╔══════════════════════════╗'}</Text>
        <Text bold color={colors.accentHex}>{'  ║'}</Text>
        <Text bold color={colors.primaryHex}>{'  ◆ PRISM AI v1.0.0'}</Text>
        <Text bold color={colors.accentHex}>{'  ║'}</Text>
        <Text bold color={colors.accentHex}>{'  ║'}</Text>
        <Text color={colors.primaryHex}>{'  Multi-Provider AI CLI'}</Text>
        <Text bold color={colors.accentHex}>{'  ║'}</Text>
        <Text bold color={colors.accentHex}>{'  ╚══════════════════════════╝'}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text color={colors.mutedHex}>{'  OpenAI • Anthropic • Gemini • Ollama • DeepSeek • Groq'}</Text>
        <Text color={colors.mutedHex}>{'  MCP • Cross-platform • Web UI'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'  Type a message to start, or /help for commands'}</Text>
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

export function PrismTUI({ agent, sessionManager, providerRegistry, config, colors }: PrismTUIProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [inputValue, setInputValue] = useState('');
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
          break;
        case 'done':
          setIsStreaming(false);
          break;
        case 'error':
          setIsStreaming(false);
          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${event.content}`,
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
    return () => { unsubscribe(); };
  }, [agent]);

  // Handle submit from TextInput
  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Handle slash commands
    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }

    // Add user message to display
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Send to agent
    const session = currentSession || sessionManager.createSession();
    sessionManager.addMessage(session.id, userMsg);
    agent.start();
    await agent.sendMessage(text);
  }, [agent, currentSession, sessionManager]);

  const handleCommand = async (text: string) => {
    const [command, ...args] = text.slice(1).split(' ');

    switch (command) {
      case 'help':
      case 'h':
        setShowHelp(true);
        break;

      case 'new':
      case 'n':
        sessionManager.createSession();
        setMessages([]);
        break;

      case 'clear':
        setMessages([]);
        if (currentSession) sessionManager.clearMessages(currentSession.id);
        break;

      case 'quit':
      case 'q':
      case 'exit':
        agent.stop();
        exit();
        break;

      case 'model': {
        if (args.length > 0) {
          agent.switchModel(args.join(' '));
          addBotMessage(`Model switched to: ${args.join(' ')}`);
        } else {
          const models = await providerRegistry.getAllModels();
          const modelList = models.slice(0, 20).map((m) => `  ${m.provider}/${m.id}`).join('\n');
          addBotMessage(`Available models:\n${modelList}\n\nUsage: /model <provider/model-id>`);
        }
        break;
      }

      case 'provider': {
        const providers = Array.from(providerRegistry.getAllProviders().keys());
        addBotMessage(`Providers:\n${providers.map((n) => `  • ${n}`).join('\n')}`);
        break;
      }

      case 'sessions': {
        const sessions = await sessionManager.listSessions();
        const list = sessions.slice(0, 10).map(
          (s) => `  [${s.id.slice(0, 8)}] ${s.title} (${s.provider}/${s.model})`
        ).join('\n');
        addBotMessage(`Sessions:\n${list || '  No sessions yet'}`);
        break;
      }

      case 'export': {
        if (currentSession) {
          addBotMessage(sessionManager.exportSession(currentSession.id, 'markdown'));
        }
        break;
      }

      case 'theme':
        addBotMessage('Available themes: dark, light, midnight, nord, tokyo\nSet PRISM_THEME env var to change.');
        break;

      case 'cost': {
        let totalInput = 0;
        let totalOutput = 0;
        for (const msg of messages) {
          if (msg.tokens) {
            totalInput += msg.tokens.input;
            totalOutput += msg.tokens.output;
          }
        }
        addBotMessage(`Token Usage:\n  Input: ${totalInput.toLocaleString()}\n  Output: ${totalOutput.toLocaleString()}\n  Total: ${(totalInput + totalOutput).toLocaleString()}`);
        break;
      }

      case 'mcp':
        addBotMessage('MCP: No MCP servers configured.\nAdd to ~/.prism/config.json under "mcpServers"');
        break;

      case 'compact':
        setMessages((prev) => {
          if (prev.length > 10) {
            return [{
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: 'Context compacted.',
              timestamp: Date.now(),
            }, ...prev.slice(-5)];
          }
          return prev;
        });
        break;

      default:
        addBotMessage(`Unknown command: /${command}\nType /help for available commands.`);
    }
  };

  const addBotMessage = (content: string) => {
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
    }]);
  };

  // Helper: provider/model label
  const providerLabel = currentSession
    ? `${currentSession.provider}/${currentSession.model}`
    : `${config.defaultProvider}/${config.defaultModel}`;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box justifyContent="center" paddingY={0}>
        <Text bold color={colors.accentHex}>{'◆ PRISM '}</Text>
        <Text dimColor>{'AI Coding Agent'}</Text>
        <Text dimColor>{' │ '}</Text>
        <Text color={colors.primaryHex}>{providerLabel}</Text>
        <Text dimColor>{' │ '}</Text>
        {isStreaming
          ? <Text color="yellow"><Spinner type="dots" /> Generating</Text>
          : <Text color={colors.successHex}>● Ready</Text>
        }
      </Box>

      {/* Messages */}
      <Box flexDirection="column" paddingX={0}>
        {messages.length === 0
          ? <WelcomeScreen colors={colors} />
          : messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                colors={colors}
                isStreaming={isStreaming && msg === messages[messages.length - 1]}
              />
            ))
        }
        {isStreaming && messages.length > 0 && messages[messages.length - 1].role !== 'assistant' && (
          <Box paddingX={1}><Text color="yellow"><Spinner type="dots" /></Text></Box>
        )}
      </Box>

      {/* Input */}
      <Box paddingY={0}>
        <Box borderStyle="round" borderColor={colors.primaryHex} paddingX={1}>
          <Text color={colors.primaryHex}>{'❯ '}</Text>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
          />
        </Box>
      </Box>

      {/* Status */}
      <Box paddingX={0}>
        <Text dimColor>{'Ctrl+C quit │ /help commands │ /model switch'}</Text>
      </Box>

      {/* Help overlay */}
      <HelpPanel visible={showHelp} onClose={() => setShowHelp(false)} colors={colors} />
    </Box>
  );
}
