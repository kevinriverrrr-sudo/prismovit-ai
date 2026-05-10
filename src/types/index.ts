/**
 * PRISM Core Types
 * Unified type definitions across all modules.
 */

// ==================== Provider Types ====================

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter' | 'deepseek' | 'groq' | 'xai' | 'copilot' | 'bedrock' | 'custom';

export interface ProviderConfig {
  name: ProviderName;
  displayName: string;
  baseUrl?: string;
  apiKey?: string;
  models: ModelConfig[];
  enabled: boolean;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderName;
  maxTokens: number;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsThinking?: boolean;
  inputCostPer1M?: number;
  outputCostPer1M?: number;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: number;
  model?: string;
  provider?: ProviderName;
  tokens?: TokenUsage;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ProviderResponse {
  message: Message;
  done: boolean;
  usage?: TokenUsage;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'thinking' | 'done' | 'error';
  content: string;
  toolCall?: Partial<ToolCall>;
  usage?: TokenUsage;
}

// ==================== Tool Types ====================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
  permission?: 'read' | 'write' | 'execute' | 'admin';
}

export interface ToolContext {
  cwd: string;
  sessionId: string;
  config: PrismConfig;
}

// ==================== Command Types ====================

export interface CommandDefinition {
  name: string;
  description: string;
  usage?: string;
  handler: (args: string[], context: CommandContext) => Promise<string | void>;
  alias?: string[];
}

export interface CommandContext {
  config: PrismConfig;
  sessions: unknown;
  providers: unknown;
  mcp: unknown;
}

// ==================== Session Types ====================

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  provider: ProviderName;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface SessionSummary {
  id: string;
  title: string;
  model: string;
  provider: ProviderName;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

// ==================== MCP Types ====================

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

// ==================== Config Types ====================

export interface PrismConfig {
  version: string;
  defaultProvider: ProviderName;
  defaultModel: string;
  providers: Record<ProviderName, Omit<ProviderConfig, 'name'>>;
  mcpServers: Record<string, MCPServerConfig>;
  theme: ThemeConfig;
  keybindings: KeybindingConfig;
  permissions: PermissionConfig;
  features: FeatureConfig;
}

export interface ThemeConfig {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    error: string;
    warning: string;
    success: string;
    muted: string;
    userBubble: string;
    assistantBubble: string;
    border: string;
    background: string;
  };
}

export interface KeybindingConfig {
  submit: string;
  cancel: string;
  newSession: string;
  switchModel: string;
  clear: string;
  help: string;
  quit: string;
}

export interface PermissionConfig {
  autoApprove: string[];
  requireConfirmation: string[];
  deny: string[];
}

export interface FeatureConfig {
  mcp: boolean;
  webInterface: boolean;
  sessionPersistence: boolean;
  autoCompact: boolean;
  maxContextTokens: number;
  streamResponses: boolean;
}

// ==================== Platform Types ====================

export type Platform = 'windows' | 'macos' | 'linux' | 'android';

export interface PlatformInfo {
  platform: Platform;
  isTermux: boolean;
  isWSL: boolean;
  arch: string;
  nodeVersion: string;
  homeDir: string;
  configDir: string;
  dataDir: string;
}

// ==================== Agent Types ====================

export type AgentEventType = 'start' | 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error' | 'usage';

export interface AgentEvent {
  type: AgentEventType;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  usage?: { input: number; output: number };
}
