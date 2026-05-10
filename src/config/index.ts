/**
 * PRISM Configuration Manager
 * Handles loading, saving, and validating configuration.
 * Config stored as JSON in ~/.prism/config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { PrismConfig, ProviderName, ThemeConfig, KeybindingConfig, FeatureConfig } from '../types/index.js';
import { getPlatformInfo } from '../utils/platform.js';

const DEFAULT_THEMES: Record<string, ThemeConfig> = {
  dark: {
    name: 'dark',
    colors: {
      primary: '#60a5fa',
      secondary: '#a78bfa',
      accent: '#f472b6',
      error: '#f87171',
      warning: '#fbbf24',
      success: '#34d399',
      muted: '#6b7280',
      userBubble: '#1e3a5f',
      assistantBubble: '#1a1a2e',
      border: '#374151',
      background: '#0f0f1a',
    },
  },
  light: {
    name: 'light',
    colors: {
      primary: '#2563eb',
      secondary: '#7c3aed',
      accent: '#db2777',
      error: '#dc2626',
      warning: '#d97706',
      success: '#059669',
      muted: '#9ca3af',
      userBubble: '#dbeafe',
      assistantBubble: '#f3f4f6',
      border: '#d1d5db',
      background: '#ffffff',
    },
  },
  midnight: {
    name: 'midnight',
    colors: {
      primary: '#818cf8',
      secondary: '#c084fc',
      accent: '#f0abfc',
      error: '#fca5a5',
      warning: '#fcd34d',
      success: '#6ee7b7',
      muted: '#4b5563',
      userBubble: '#312e81',
      assistantBubble: '#1e1b4b',
      border: '#4338ca',
      background: '#0c0a1d',
    },
  },
  nord: {
    name: 'nord',
    colors: {
      primary: '#88c0d0',
      secondary: '#b48ead',
      accent: '#a3be8c',
      error: '#bf616a',
      warning: '#ebcb8b',
      success: '#a3be8c',
      muted: '#4c566a',
      userBubble: '#2e3440',
      assistantBubble: '#3b4252',
      border: '#434c5e',
      background: '#242933',
    },
  },
  tokyo: {
    name: 'tokyo',
    colors: {
      primary: '#7aa2f7',
      secondary: '#bb9af7',
      accent: '#f7768e',
      error: '#f7768e',
      warning: '#e0af68',
      success: '#9ece6a',
      muted: '#565f89',
      userBubble: '#1a1b26',
      assistantBubble: '#24283b',
      border: '#3b4261',
      background: '#1a1b26',
    },
  },
};

const DEFAULT_KEYBINDINGS: KeybindingConfig = {
  submit: 'enter',
  cancel: 'escape',
  newSession: 'ctrl+n',
  switchModel: 'ctrl+m',
  clear: 'ctrl+l',
  help: 'ctrl+h',
  quit: 'ctrl+c',
};

const DEFAULT_FEATURES: FeatureConfig = {
  mcp: true,
  webInterface: true,
  sessionPersistence: true,
  autoCompact: true,
  maxContextTokens: 128000,
  streamResponses: true,
};

const DEFAULT_PROVIDERS: Record<ProviderName, { displayName: string; baseUrl?: string; models: Array<{ id: string; name: string; maxTokens: number; contextWindow: number }> }> = {
  openai: {
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4.1', name: 'GPT 4.1', maxTokens: 32768, contextWindow: 1047576 },
      { id: 'gpt-4.1-mini', name: 'GPT 4.1 Mini', maxTokens: 16384, contextWindow: 1047576 },
      { id: 'gpt-4.1-nano', name: 'GPT 4.1 Nano', maxTokens: 16384, contextWindow: 1047576 },
      { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 16384, contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 16384, contextWindow: 128000 },
      { id: 'o3', name: 'O3', maxTokens: 100000, contextWindow: 200000 },
      { id: 'o3-mini', name: 'O3 Mini', maxTokens: 65536, contextWindow: 200000 },
      { id: 'o4-mini', name: 'O4 Mini', maxTokens: 100000, contextWindow: 200000 },
    ],
  },
  anthropic: {
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', maxTokens: 16384, contextWindow: 200000 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', maxTokens: 16384, contextWindow: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', maxTokens: 8192, contextWindow: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', maxTokens: 8192, contextWindow: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', maxTokens: 4096, contextWindow: 200000 },
    ],
  },
  gemini: {
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro', maxTokens: 65536, contextWindow: 1000000 },
      { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', maxTokens: 65536, contextWindow: 1000000 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', maxTokens: 8192, contextWindow: 1000000 },
    ],
  },
  ollama: {
    displayName: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434',
    models: [
      { id: 'llama3', name: 'LLaMA 3', maxTokens: 4096, contextWindow: 8192 },
      { id: 'codellama', name: 'Code LLaMA', maxTokens: 4096, contextWindow: 16384 },
      { id: 'mistral', name: 'Mistral', maxTokens: 4096, contextWindow: 32768 },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', maxTokens: 8192, contextWindow: 32768 },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', maxTokens: 4096, contextWindow: 16384 },
    ],
  },
  openrouter: {
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', maxTokens: 16384, contextWindow: 200000 },
      { id: 'openai/gpt-4.1', name: 'GPT 4.1', maxTokens: 32768, contextWindow: 1047576 },
      { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', maxTokens: 65536, contextWindow: 1000000 },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', maxTokens: 8192, contextWindow: 65536 },
      { id: 'deepseek/deepseek-r1-free', name: 'DeepSeek R1 Free', maxTokens: 8192, contextWindow: 65536 },
    ],
  },
  deepseek: {
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', maxTokens: 8192, contextWindow: 65536 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', maxTokens: 8192, contextWindow: 65536 },
    ],
  },
  groq: {
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'qwen-qwq-32b', name: 'Qwen QwQ 32B', maxTokens: 32768, contextWindow: 131072 },
      { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3.3 70B', maxTokens: 32768, contextWindow: 131072 },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', maxTokens: 32768, contextWindow: 32768 },
    ],
  },
  xai: {
    displayName: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-3-beta', name: 'Grok 3 Beta', maxTokens: 16384, contextWindow: 131072 },
      { id: 'grok-3-mini-beta', name: 'Grok 3 Mini Beta', maxTokens: 16384, contextWindow: 131072 },
    ],
  },
  copilot: {
    displayName: 'GitHub Copilot',
    baseUrl: 'https://api.githubcopilot.com',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (Copilot)', maxTokens: 16384, contextWindow: 128000 },
      { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Copilot)', maxTokens: 8192, contextWindow: 200000 },
      { id: 'gpt-4.1', name: 'GPT 4.1 (Copilot)', maxTokens: 32768, contextWindow: 1047576 },
    ],
  },
  bedrock: {
    displayName: 'AWS Bedrock',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    models: [
      { id: 'anthropic.claude-sonnet-4-20250514-v1:0', name: 'Claude Sonnet 4 (Bedrock)', maxTokens: 16384, contextWindow: 200000 },
      { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet (Bedrock)', maxTokens: 8192, contextWindow: 200000 },
    ],
  },
  custom: {
    displayName: 'Custom Provider',
    baseUrl: 'http://localhost:8080/v1',
    models: [],
  },
};

export function getDefaultConfig(): PrismConfig {
  const providers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(DEFAULT_PROVIDERS)) {
    providers[key] = {
      displayName: value.displayName,
      baseUrl: value.baseUrl,
      apiKey: '',
      models: value.models.map((m) => ({
        ...m,
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
      })),
      enabled: key === 'openai',
    };
  }

  return {
    version: '1.0.0',
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o',
    providers: providers as PrismConfig['providers'],
    mcpServers: {},
    theme: DEFAULT_THEMES.dark,
    keybindings: DEFAULT_KEYBINDINGS,
    permissions: {
      autoApprove: ['read', 'glob', 'grep', 'find', 'ls'],
      requireConfirmation: ['write', 'edit', 'bash'],
      deny: [],
    },
    features: DEFAULT_FEATURES,
  };
}

export class ConfigManager {
  private config: PrismConfig;
  private configPath: string;
  private platformInfo: ReturnType<typeof getPlatformInfo>;

  constructor(configDir?: string) {
    this.platformInfo = getPlatformInfo();
    const dir = configDir || this.platformInfo.configDir;
    this.configPath = join(dir, 'config.json');
    this.config = this.load();
  }

  private load(): PrismConfig {
    if (existsSync(this.configPath)) {
      try {
        const raw = readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...getDefaultConfig(), ...parsed };
      } catch (error) {
        console.error(`Failed to parse config at ${this.configPath}:`, error);
      }
    }
    return getDefaultConfig();
  }

  save(): void {
    const dir = this.platformInfo.configDir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  get<K extends keyof PrismConfig>(key: K): PrismConfig[K] {
    return this.config[key];
  }

  set<K extends keyof PrismConfig>(key: K, value: PrismConfig[K]): void {
    this.config[key] = value;
  }

  getProviderApiKey(provider: ProviderName): string {
    const envMap: Record<ProviderName, string[]> = {
      openai: ['OPENAI_API_KEY', 'PRISM_OPENAI_KEY'],
      anthropic: ['ANTHROPIC_API_KEY', 'PRISM_ANTHROPIC_KEY'],
      gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'PRISM_GEMINI_KEY'],
      ollama: [],
      openrouter: ['OPENROUTER_API_KEY', 'PRISM_OPENROUTER_KEY'],
      deepseek: ['DEEPSEEK_API_KEY', 'PRISM_DEEPSEEK_KEY'],
      groq: ['GROQ_API_KEY', 'PRISM_GROQ_KEY'],
      xai: ['XAI_API_KEY', 'PRISM_XAI_KEY'],
      copilot: ['GITHUB_TOKEN', 'PRISM_COPILOT_KEY'],
      bedrock: ['AWS_ACCESS_KEY_ID', 'PRISM_BEDROCK_KEY'],
      custom: ['CUSTOM_API_KEY', 'PRISM_CUSTOM_KEY'],
    };

    // Priority: env var > config
    const envVars = envMap[provider] || [];
    for (const envVar of envVars) {
      const val = process.env[envVar];
      if (val) return val;
    }

    return this.config.providers[provider]?.apiKey || '';
  }

  getProviderBaseUrl(provider: ProviderName): string {
    const envVarMap: Record<ProviderName, string> = {
      openai: 'OPENAI_BASE_URL',
      anthropic: 'ANTHROPIC_BASE_URL',
      gemini: 'GEMINI_BASE_URL',
      ollama: 'OLLAMA_HOST',
      openrouter: 'OPENROUTER_BASE_URL',
      deepseek: 'DEEPSEEK_BASE_URL',
      groq: 'GROQ_BASE_URL',
      xai: 'XAI_BASE_URL',
      copilot: 'COPILOT_BASE_URL',
      bedrock: 'BEDROCK_BASE_URL',
      custom: 'CUSTOM_BASE_URL',
    };

    const envVal = process.env[envVarMap[provider]];
    if (envVal) return envVal;

    return this.config.providers[provider]?.baseUrl || DEFAULT_PROVIDERS[provider]?.baseUrl || '';
  }

  setProviderApiKey(provider: ProviderName, key: string): void {
    if (this.config.providers[provider]) {
      (this.config.providers[provider] as Record<string, unknown>).apiKey = key;
    }
  }

  getAllThemes(): Record<string, ThemeConfig> {
    return DEFAULT_THEMES;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getConfigDir(): string {
    return this.platformInfo.configDir;
  }

  getDataDir(): string {
    return this.platformInfo.dataDir;
  }

  getConfig(): PrismConfig {
    return { ...this.config };
  }
}
