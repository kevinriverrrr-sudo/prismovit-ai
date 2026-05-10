/**
 * PRISM TUI — Terminal User Interface
 * OpenCode-inspired design with thick left borders, horizontal separators,
 * interactive provider setup, and model selection.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import type { Message, AgentEvent, ProviderName, PrismConfig } from '../types/index.js';
import type { AgentLoop } from '../agent/index.js';
import type { SessionManager } from '../session/index.js';
import type { ProviderRegistry } from '../providers/index.js';

// ==================== Constants ====================

const SEPARATOR = '─────────────────────────────────────────────────────────';
const THICK_SEP = '═══════════════════════════════════════════════════════════';
const THIN_SEP  = '─────────────────────────────────────────────────────────';

const ALL_PROVIDERS = [
  { id: 'anthropic' as ProviderName, name: 'Anthropic',   env: 'ANTHROPIC_API_KEY',      models: ['claude-sonnet-4-20250514','claude-opus-4-20250514','claude-3-5-sonnet-20241022','claude-3-5-haiku-20241022','claude-3-opus-20240229'] },
  { id: 'openai' as ProviderName,    name: 'OpenAI',      env: 'OPENAI_API_KEY',          models: ['gpt-4.1','gpt-4.1-mini','gpt-4.1-nano','gpt-4o','gpt-4o-mini','o3','o3-mini','o4-mini'] },
  { id: 'gemini' as ProviderName,    name: 'Gemini',      env: 'GEMINI_API_KEY',          models: ['gemini-2.5-pro-preview-06-05','gemini-2.5-flash-preview-05-20','gemini-2.0-flash'] },
  { id: 'openrouter' as ProviderName, name: 'OpenRouter', env: 'OPENROUTER_API_KEY',      models: ['anthropic/claude-sonnet-4','openai/gpt-4.1','google/gemini-2.5-pro-preview','deepseek/deepseek-r1'] },
  { id: 'deepseek' as ProviderName,  name: 'DeepSeek',    env: 'DEEPSEEK_API_KEY',        models: ['deepseek-chat','deepseek-reasoner'] },
  { id: 'groq' as ProviderName,      name: 'Groq',        env: 'GROQ_API_KEY',            models: ['llama-3.3-70b-versatile','mixtral-8x7b-32768','qwen-qwq-32b'] },
  { id: 'xai' as ProviderName,       name: 'xAI',         env: 'XAI_API_KEY',             models: ['grok-3-beta','grok-3-mini-beta'] },
  { id: 'ollama' as ProviderName,    name: 'Ollama',      env: '',                        models: ['llama3','codellama','mistral','qwen2.5-coder','deepseek-coder'] },
  { id: 'copilot' as ProviderName,   name: 'Copilot',     env: 'GITHUB_TOKEN',            models: ['gpt-4o','claude-3.5-sonnet','gpt-4.1'] },
  { id: 'bedrock' as ProviderName,   name: 'Bedrock',     env: 'AWS_ACCESS_KEY_ID',       models: ['anthropic.claude-sonnet-4','anthropic.claude-3-5-sonnet'] },
  { id: 'custom' as ProviderName,    name: 'Custom',      env: 'CUSTOM_API_KEY',          models: [] },
];

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

// ==================== Message Bubble (OpenCode style) ====================

interface MessageBubbleProps {
  message: Message;
  colors: ReturnType<typeof getThemeColors>;
  isStreaming?: boolean;
  isLast?: boolean;
}

function MessageBubble({ message, colors, isStreaming, isLast }: MessageBubbleProps) {
  if (message.role === 'tool') return null;

  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // OpenCode style: thick left border (║) for assistant, muted for user
  const borderColor = isUser ? 'gray' : colors.primaryHex;
  const borderChar = isUser ? '│' : '║';

  const roleLabel = isUser ? 'You' : 'PRISM';
  const roleColor = isUser ? colors.secondaryHex : colors.accentHex;

  // Model info for assistant messages
  const modelInfo = !isUser && message.provider
    ? `${message.provider}/${message.model} (${time})`
    : time;

  return (
    <Box flexDirection="column">
      {/* Top separator line */}
      <Box paddingLeft={1}>
        <Text dimColor>{THIN_SEP}</Text>
      </Box>

      {/* Role label + model info */}
      <Box paddingLeft={1}>
        <Text bold color={roleColor}>{roleLabel}</Text>
        {!isUser && <Text>{' '}</Text>}
        {!isUser && <Text dimColor>{modelInfo}</Text>}
        {isUser && <Text dimColor>{' '}{time}</Text>}
        {isStreaming && <Text color="yellow"> {'...'}</Text>}
      </Box>

      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box flexDirection="column" paddingLeft={1}>
          {message.toolCalls.map((tc) => (
            <Box key={tc.id}>
              <Text color={colors.warningHex}>{'║ '}</Text>
              <Text color={colors.warningHex}>{'🔧 '}{tc.name}</Text>
              <Text dimColor>{' '}{JSON.stringify(tc.arguments).slice(0, 80)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Message content with left border */}
      {message.content && (
        <Box flexDirection="column">
          {message.content.split('\n').map((line, i) => (
            <Box key={i}>
              <Text color={borderColor}>{borderChar}</Text>
              <Text>{' '}{line}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Token usage footer */}
      {message.tokens && (message.tokens.input > 0 || message.tokens.output > 0) && (
        <Box paddingLeft={1}>
          <Text dimColor>
            {'  '}{message.tokens.input.toLocaleString()} in / {message.tokens.output.toLocaleString()} out tokens
          </Text>
        </Box>
      )}

      {/* Bottom separator */}
      {isLast && (
        <Box paddingLeft={1}>
          <Text dimColor>{THIN_SEP}</Text>
        </Box>
      )}
    </Box>
  );
}

// ==================== Provider Setup Panel ====================

interface SetupPanelProps {
  colors: ReturnType<typeof getThemeColors>;
  onComplete: () => void;
}

function SetupPanel({ colors, onComplete }: SetupPanelProps) {
  const [step, setStep] = useState<'provider' | 'model' | 'apikey' | 'done'>('provider');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<typeof ALL_PROVIDERS[0] | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [configDir, setConfigDir] = useState('');

  useEffect(() => {
    // Try to detect existing config
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const dir = home + '/.prism';
    setConfigDir(dir);
  }, []);

  useInput((input, key) => {
    if (step === 'provider') {
      if (key.upArrow || (key.ctrl && input === 'p')) {
        setSelectedIndex((p) => Math.max(0, p - 1));
      } else if (key.downArrow || (key.ctrl && input === 'n')) {
        setSelectedIndex((p) => Math.min(ALL_PROVIDERS.length - 1, p + 1));
      } else if (key.return) {
        const prov = ALL_PROVIDERS[selectedIndex];
        setSelectedProvider(prov);
        // Check if env var already has key
        if (prov.env && process.env[prov.env]) {
          setApiKey('(from env)');
          if (prov.models.length > 0) {
            setSelectedModel(prov.models[0]);
            setStep('done');
            saveConfig(prov, prov.models[0], true);
          } else {
            setStep('model');
          }
        } else if (prov.id === 'ollama') {
          setSelectedModel('llama3');
          setStep('done');
          saveConfig(prov, 'llama3', true);
        } else {
          setStep('apikey');
        }
      }
    } else if (step === 'apikey') {
      if (key.return && apiKey.length > 3) {
        if (selectedProvider && selectedProvider.models.length > 0) {
          setSelectedModel(selectedProvider.models[0]);
          saveConfig(selectedProvider, selectedProvider.models[0], false, apiKey);
          setStep('done');
        } else {
          setStep('model');
        }
      } else if (key.backspace || key.delete) {
        setApiKey((prev) => {
          const chars = [...prev];
          chars.pop();
          return chars.join('');
        });
      } else if (key.escape) {
        setStep('provider');
        setApiKey('');
      } else if (input && !key.ctrl && !key.meta && !key.tab && !key.return && !key.escape && !key.backspace && !key.delete) {
        setApiKey((prev) => prev + input);
      }
    } else if (step === 'model') {
      if (!selectedProvider) return;
      if (key.upArrow) {
        setSelectedIndex((p) => Math.max(0, p - 1));
      } else if (key.downArrow) {
        setSelectedIndex((p) => Math.min(selectedProvider.models.length - 1, p + 1));
      } else if (key.return) {
        const model = selectedProvider.models[selectedIndex];
        setSelectedModel(model);
        saveConfig(selectedProvider, model, false, apiKey.length > 3 ? apiKey : undefined);
        setStep('done');
      }
    } else if (step === 'done') {
      if (key.return || key.escape) {
        onComplete();
      }
    }
  });

  const saveConfig = (prov: typeof ALL_PROVIDERS[0], model: string, fromEnv: boolean, key?: string) => {
    try {
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      const dir = configDir || (process.env.HOME + '/.prism');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const cfgPath = path.join(dir, 'config.json');
      let cfg: Record<string, any> = {};
      if (fs.existsSync(cfgPath)) {
        cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      }
      cfg.defaultProvider = prov.id;
      cfg.defaultModel = model;
      if (!cfg.providers) cfg.providers = {};
      if (!cfg.providers[prov.id]) cfg.providers[prov.id] = {};
      if (key) cfg.providers[prov.id].apiKey = key;
      if (!cfg.providers[prov.id].baseUrl && prov.id !== 'ollama' && prov.id !== 'custom') {
        const urlMap: Record<string, string> = {
          openai: 'https://api.openai.com/v1',
          anthropic: 'https://api.anthropic.com/v1',
          gemini: 'https://generativelanguage.googleapis.com/v1beta',
          openrouter: 'https://openrouter.ai/api/v1',
          deepseek: 'https://api.deepseek.com/v1',
          groq: 'https://api.groq.com/openai/v1',
          xai: 'https://api.x.ai/v1',
          ollama: 'http://localhost:11434',
        };
        if (urlMap[prov.id]) cfg.providers[prov.id].baseUrl = urlMap[prov.id];
      }
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch {
      // Config save failed - non-critical
    }
  };

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      {/* Title */}
      <Box borderStyle="round" borderColor={colors.accentHex} paddingX={3} paddingY={1}>
        <Text bold color={colors.accentHex}>{'◆ PRISM Setup'}</Text>
      </Box>
      <Text dimColor>{' Configure your AI provider to get started'}</Text>

      <Box marginTop={1} />

      {/* Step: Provider Selection */}
      {step === 'provider' && (
        <Box flexDirection="column" borderStyle="round" borderColor={colors.borderHex} paddingX={2} paddingY={1}>
          <Text bold color={colors.primaryHex}>{'Select Provider (↑/↓ navigate, Enter select):'}</Text>
          <Box marginTop={1} flexDirection="column">
            {ALL_PROVIDERS.map((prov, i) => {
              const hasKey = !prov.env || !!process.env[prov.env];
              const selected = i === selectedIndex;
              return (
                <Box key={prov.id}>
                  <Text color={selected ? colors.accentHex : colors.mutedHex}>
                    {selected ? '▸ ' : '  '}
                  </Text>
                  <Text bold color={selected ? colors.accentHex : undefined}>
                    {prov.name}
                  </Text>
                  <Text dimColor>{'  '}</Text>
                  {hasKey
                    ? <Text color={colors.successHex}>{'✓ key found'}</Text>
                    : <Text dimColor>{prov.env || 'local'}</Text>
                  }
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>{'Tip: Set API keys as env vars (e.g. export OPENAI_API_KEY=...) to auto-detect'}</Text>
          </Box>
        </Box>
      )}

      {/* Step: API Key Input */}
      {step === 'apikey' && selectedProvider && (
        <Box flexDirection="column" borderStyle="round" borderColor={colors.warningHex} paddingX={2} paddingY={1}>
          <Text bold color={colors.warningHex}>{`Enter ${selectedProvider.name} API Key:`}</Text>
          <Text dimColor>{`  export ${selectedProvider.env}=your_key_here`}</Text>
          <Box marginTop={1} borderStyle="single" borderColor={colors.primaryHex} paddingX={1}>
            <Text>{'🔑 '}</Text>
            <Text>{'•'.repeat(apiKey.length)}</Text>
            <Text color={colors.mutedHex}>{apiKey.length > 0 ? '▎' : ''}</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>{'  Enter to confirm'}</Text>
            <Text dimColor>{'  Escape to go back'}</Text>
          </Box>
        </Box>
      )}

      {/* Step: Model Selection */}
      {step === 'model' && selectedProvider && (
        <Box flexDirection="column" borderStyle="round" borderColor={colors.borderHex} paddingX={2} paddingY={1}>
          <Text bold color={colors.primaryHex}>{`Select ${selectedProvider.name} Model:`}</Text>
          <Box marginTop={1} flexDirection="column">
            {selectedProvider.models.map((model, i) => {
              const selected = i === selectedIndex;
              return (
                <Box key={model}>
                  <Text color={selected ? colors.accentHex : colors.mutedHex}>
                    {selected ? '▸ ' : '  '}
                  </Text>
                  <Text color={selected ? colors.accentHex : undefined}>{model}</Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Step: Done */}
      {step === 'done' && selectedProvider && (
        <Box flexDirection="column" borderStyle="round" borderColor={colors.successHex} paddingX={3} paddingY={2}>
          <Text bold color={colors.successHex}>{'✓ Configuration Saved!'}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>{'  Provider: '}</Text>
            <Text bold>{selectedProvider.name}</Text>
            <Text>{'  Model:    '}</Text>
            <Text bold>{selectedModel}</Text>
            <Text>{'  Config:   '}</Text>
            <Text dimColor>{configDir + '/config.json'}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>{'Press Enter to start chatting...'}</Text>
          </Box>
        </Box>
      )}
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
  useInput((_input, key) => {
    if (key.escape) onClose();
  }, { isActive: visible });

  if (!visible) return null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accentHex} paddingX={2} paddingY={1}>
      <Text bold color={colors.accentHex}>{'◆ PRISM — Commands & Shortcuts'}</Text>
      <Box paddingLeft={1}><Text dimColor>{SEPARATOR}</Text></Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={colors.primaryHex}>{'Keyboard:'}</Text>
        <Text>{'  Enter          Send message'}</Text>
        <Text>{'  Escape         Clear input / Close panel'}</Text>
        <Text>{'  Ctrl+C         Cancel generation / Quit'}</Text>
        <Text>{'  Ctrl+U         Clear input line'}</Text>
        <Text>{'  Backspace      Delete character'}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={colors.primaryHex}>{'Slash Commands:'}</Text>
        <Text>{'  /help           Show this help'}</Text>
        <Text>{'  /model [name]   Change model (list / set)'}</Text>
        <Text>{'  /provider       List all providers'}</Text>
        <Text>{'  /setup          Re-run provider setup'}</Text>
        <Text>{'  /new            New chat session'}</Text>
        <Text>{'  /clear          Clear messages'}</Text>
        <Text>{'  /sessions       List sessions'}</Text>
        <Text>{'  /export         Export session (markdown)'}</Text>
        <Text>{'  /compact        Compact context'}</Text>
        <Text>{'  /mcp            MCP server info'}</Text>
        <Text>{'  /theme          List themes'}</Text>
        <Text>{'  /cost           Token usage stats'}</Text>
        <Text>{'  /web            Start web interface'}</Text>
        <Text>{'  /config         Edit config file'}</Text>
        <Text>{'  /quit           Exit PRISM'}</Text>
      </Box>

      <Box paddingLeft={1}><Text dimColor>{SEPARATOR}</Text></Box>
      <Box marginTop={1}>
        <Text dimColor>{'Press Escape to close'}</Text>
      </Box>
    </Box>
  );
}

// ==================== Welcome Screen ====================

function WelcomeScreen({ colors, cwd }: { colors: ReturnType<typeof getThemeColors>; cwd: string }) {
  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      {/* Logo */}
      <Box borderStyle="double" borderColor={colors.accentHex} paddingX={4} paddingY={1}>
        <Text bold color={colors.accentHex}>{'  ◆ PRISM AI v1.1.0'}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text color={colors.mutedHex}>{'Multi-Provider AI Coding Agent'}</Text>
        <Text dimColor>{'Inspired by OpenCode + Pi + OpenClaude'}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text dimColor>{THIN_SEP}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text dimColor>{'Providers: Anthropic · OpenAI · Gemini · OpenRouter · DeepSeek · Groq · xAI · Ollama · Copilot · Bedrock'}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box paddingLeft={1}><Text dimColor>{'cwd: '}</Text><Text>{cwd}</Text></Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{'Type a message to start, or /help for commands'}</Text>
      </Box>
    </Box>
  );
}

// ==================== Model Picker ====================

interface ModelPickerProps {
  providerRegistry: ProviderRegistry;
  colors: ReturnType<typeof getThemeColors>;
  onSelect: (provider: string, model: string) => void;
  onClose: () => void;
}

function ModelPicker({ providerRegistry, colors, onSelect, onClose }: ModelPickerProps) {
  const [providers, setProviders] = useState<Array<{id: string; models: string[]}>>([]);
  const [provIdx, setProvIdx] = useState(0);
  const [modelIdx, setModelIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const allModels = await providerRegistry.getAllModels();
      const grouped: Record<string, string[]> = {};
      for (const m of allModels) {
        if (!grouped[m.provider]) grouped[m.provider] = [];
        grouped[m.provider].push(m.id);
      }
      setProviders(Object.entries(grouped).map(([id, models]) => ({ id, models })));
      setLoading(false);
    })();
  }, [providerRegistry]);

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (providers.length === 0) return;

    if (key.leftArrow) {
      setProvIdx((p) => Math.max(0, p - 1));
      setModelIdx(0);
    } else if (key.rightArrow) {
      setProvIdx((p) => Math.min(providers.length - 1, p + 1));
      setModelIdx(0);
    } else if (key.upArrow) {
      setModelIdx((p) => Math.max(0, p - 1));
    } else if (key.downArrow) {
      const prov = providers[provIdx];
      if (prov) setModelIdx((p) => Math.min(prov.models.length - 1, p + 1));
    } else if (key.return) {
      const prov = providers[provIdx];
      if (prov && prov.models[modelIdx]) {
        onSelect(prov.id, prov.models[modelIdx]);
      }
    }
  });

  const currentProv = providers[provIdx];

  if (loading) {
    return (
      <Box borderStyle="round" borderColor={colors.borderHex} paddingX={2} paddingY={1}>
        <Text color="yellow"><Spinner type="dots" /> Loading models...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accentHex} paddingX={2} paddingY={1}>
      <Text bold color={colors.accentHex}>{'◆ Select Model (←/→ provider, ↑/↓ model, Enter select):'}</Text>
      <Box paddingLeft={1}><Text dimColor>{THIN_SEP}</Text></Box>

      {/* Provider tabs */}
      <Box marginTop={1}>
        {providers.map((prov, i) => (
          <Box key={prov.id}>
            {i === provIdx
              ? <Text bold color={colors.accentHex}>{` [${prov.id}] `}</Text>
              : <Text dimColor>{`  ${prov.id}  `}</Text>
            }
          </Box>
        ))}
      </Box>

      {/* Model list */}
      {currentProv && (
        <Box flexDirection="column" marginTop={1}>
          {currentProv.models.map((model, i) => (
            <Box key={model}>
              <Text color={i === modelIdx ? colors.primaryHex : colors.mutedHex}>
                {i === modelIdx ? '▸ ' : '  '}
              </Text>
              <Text color={i === modelIdx ? colors.primaryHex : undefined}>{model}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box paddingLeft={1}><Text dimColor>{THIN_SEP}</Text></Box>
      <Box marginTop={1}>
        <Text dimColor>{'Escape to cancel'}</Text>
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

type AppState = 'setup' | 'chat' | 'modelpicker';

export function PrismTUI({ agent, sessionManager, providerRegistry, config, colors }: PrismTUIProps) {
  const { exit } = useApp();
  const [appState, setAppState] = useState<AppState>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [setupDone, setSetupDone] = useState(false);
  const currentSession = sessionManager.getCurrentSession();

  // Check if any API key is configured
  useEffect(() => {
    const hasProvider = ALL_PROVIDERS.some(p => !p.env || !!process.env[p.env]);
    if (!hasProvider) {
      // Check config file
      try {
        const fs = require('fs');
        const path = require('path');
        const cfgPath = path.join(process.env.HOME || '', '.prism', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          const provs = cfg.providers || {};
          const hasKey = Object.values(provs).some((p: any) => p.apiKey);
          if (hasKey) setSetupDone(true);
          else setAppState('setup');
        } else {
          setAppState('setup');
        }
      } catch {
        setAppState('setup');
      }
    } else {
      setSetupDone(true);
    }
  }, []);

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
              updated[updated.length - 1] = { ...last, content: last.content + event.content };
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
                updated[updated.length - 1] = { ...last, tokens: event.usage };
              }
              return updated;
            });
          }
          break;
      }
    });
    return () => { unsubscribe(); };
  }, [agent]);

  // Handle submit
  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }
    const userMsg: Message = {
      id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    const session = currentSession || sessionManager.createSession();
    sessionManager.addMessage(session.id, userMsg);
    agent.start();
    await agent.sendMessage(text);
  }, [agent, currentSession, sessionManager]);

  const handleCommand = async (text: string) => {
    const [command, ...args] = text.slice(1).split(' ');

    switch (command) {
      case 'help': case 'h':
        setShowHelp(true); break;
      case 'setup':
        setAppState('setup'); break;
      case 'new': case 'n':
        sessionManager.createSession(); setMessages([]); break;
      case 'clear':
        setMessages([]);
        if (currentSession) sessionManager.clearMessages(currentSession.id);
        break;
      case 'quit': case 'q': case 'exit':
        agent.stop(); exit(); break;
      case 'model':
        if (args.length > 0) {
          agent.switchModel(args.join(' '));
          addBotMessage(`Model switched to: ${args.join(' ')}`);
        } else {
          setAppState('modelpicker');
        }
        break;
      case 'provider': {
        const list = ALL_PROVIDERS.map(p => {
          const hasKey = !p.env || !!process.env[p.env];
          return `  ${hasKey ? '✓' : '○'} ${p.name.padEnd(14)} ${p.env || '(local)'}`;
        }).join('\n');
        addBotMessage(`Providers:\n${list}\n\nCurrent: ${config.defaultProvider}/${config.defaultModel}`);
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
      case 'export':
        if (currentSession) addBotMessage(sessionManager.exportSession(currentSession.id, 'markdown'));
        break;
      case 'theme':
        addBotMessage('Available themes: dark, light, midnight, nord, tokyo\nSet PRISM_THEME env var to change.');
        break;
      case 'cost': {
        let ti = 0, to = 0;
        for (const msg of messages) { if (msg.tokens) { ti += msg.tokens.input; to += msg.tokens.output; } }
        addBotMessage(`Token Usage:\n  Input:  ${ti.toLocaleString()}\n  Output: ${to.toLocaleString()}\n  Total:  ${(ti + to).toLocaleString()}`);
        break;
      }
      case 'mcp':
        addBotMessage('MCP: No MCP servers configured.\nAdd to ~/.prism/config.json under "mcpServers"');
        break;
      case 'compact':
        setMessages((prev) => prev.length > 10
          ? [{ id: crypto.randomUUID(), role: 'assistant' as const, content: 'Context compacted.', timestamp: Date.now() }, ...prev.slice(-5)]
          : prev);
        break;
      case 'config': {
        const home = process.env.HOME || '';
        addBotMessage(`Config: ${home}/.prism/config.json\nEdit with your preferred editor.`);
        break;
      }
      case 'web':
        addBotMessage('Start web interface with: prism --web\nOr: prism --web --web-port 3141');
        break;
      default:
        addBotMessage(`Unknown command: /${command}\nType /help for available commands.`);
    }
  };

  const addBotMessage = (content: string) => {
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(), role: 'assistant', content, timestamp: Date.now(),
    }]);
  };

  const handleModelSelect = (provider: string, model: string) => {
    agent.switchModel(model);
    agent.switchProvider(provider as ProviderName);
    addBotMessage(`Switched to: ${provider}/${model}`);
    setAppState('chat');
  };

  // ==================== Input Handling ====================
  useInput((input, key) => {
    if (showHelp || appState !== 'chat') return;
    if (isStreaming && !key.escape) return;

    if (key.return) {
      const text = inputValue;
      setInputValue('');
      handleSubmit(text);
    } else if (key.escape) {
      setInputValue('');
    } else if (key.backspace || key.delete) {
      setInputValue((prev) => { const c = [...prev]; c.pop(); return c.join(''); });
    } else if (key.ctrl && input === 'c') {
      if (isStreaming) { agent.stop(); setIsStreaming(false); }
      else { agent.stop(); exit(); }
    } else if (key.ctrl && input === 'u') {
      setInputValue('');
    } else if (input && !key.tab && !key.shift && !key.meta && !key.ctrl && !key.return && !key.escape && !key.backspace && !key.delete) {
      setInputValue((prev) => prev + input);
    }
  });

  const providerLabel = currentSession
    ? `${currentSession.provider}/${currentSession.model}`
    : `${config.defaultProvider}/${config.defaultModel}`;

  const cwd = process.cwd();

  // ==================== Setup Screen ====================
  if (appState === 'setup') {
    return (
      <Box flexDirection="column">
        <SetupPanel
          colors={colors}
          onComplete={() => { setSetupDone(true); setAppState('chat'); }}
        />
      </Box>
    );
  }

  // ==================== Model Picker ====================
  if (appState === 'modelpicker') {
    return (
      <Box flexDirection="column">
        <ModelPicker
          providerRegistry={providerRegistry}
          colors={colors}
          onSelect={handleModelSelect}
          onClose={() => setAppState('chat')}
        />
      </Box>
    );
  }

  // ==================== Main Chat ====================
  const displayInput = inputValue.length > 120 ? inputValue.slice(-120) : inputValue;

  return (
    <Box flexDirection="column">
      {/* Header bar */}
      <Box paddingLeft={1}>
        <Text dimColor>{THICK_SEP}</Text>
      </Box>
      <Box paddingLeft={1}>
        <Text bold color={colors.accentHex}>{'◆ PRISM'}</Text>
        <Text dimColor>{' │ '}</Text>
        <Text color={colors.primaryHex}>{providerLabel}</Text>
        <Text dimColor>{' │ cwd: '}</Text>
        <Text>{cwd}</Text>
        <Text dimColor>{' │ '}</Text>
        {isStreaming
          ? <Text color="yellow"><Spinner type="dots" /> generating</Text>
          : <Text color={colors.successHex}>{'● ready'}</Text>
        }
      </Box>
      <Box paddingLeft={1}>
        <Text dimColor>{THICK_SEP}</Text>
      </Box>

      {/* Messages area */}
      <Box flexDirection="column" paddingX={0}>
        {messages.length === 0
          ? <WelcomeScreen colors={colors} cwd={cwd} />
          : messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                colors={colors}
                isStreaming={isStreaming && msg === messages[messages.length - 1]}
                isLast={i === messages.length - 1}
              />
            ))
        }
        {isStreaming && messages.length > 0 && messages[messages.length - 1].role !== 'assistant' && (
          <Box paddingLeft={1}>
            <Text color="yellow"><Spinner type="dots" />{' thinking...'}</Text>
          </Box>
        )}
      </Box>

      {/* Separator before input */}
      <Box paddingLeft={1}>
        <Text dimColor>{THICK_SEP}</Text>
      </Box>

      {/* Input area */}
      <Box paddingLeft={1}>
        <Text bold color={colors.accentHex}>{'❯ '}</Text>
        <Text>{displayInput}</Text>
        <Text color={colors.mutedHex}>{inputValue.length > 0 ? '▎' : ''}</Text>
      </Box>

      {/* Status bar */}
      <Box paddingLeft={1}>
        <Text dimColor>{'ctrl+c quit │ /help commands │ /model switch │ /setup configure'}</Text>
      </Box>

      {/* Help overlay */}
      <HelpPanel visible={showHelp} onClose={() => setShowHelp(false)} colors={colors} />
    </Box>
  );
}
