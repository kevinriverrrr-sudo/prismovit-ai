/**
 * PRISM Provider Registry
 * Unified LLM provider abstraction supporting OpenAI, Anthropic, Gemini, Ollama, OpenRouter, DeepSeek, Groq, and custom providers.
 * Design inspired by Pi's lazy-loading + OpenClaude's multi-tier registry.
 */

import type {
  ProviderName,
  ModelConfig,
  Message,
  StreamChunk,
  TokenUsage,
  ChatOptions,
} from '../types/index.js';
import { ConfigManager } from '../config/index.js';

export interface ProviderInstance {
  name: ProviderName;
  chat(messages: Message[], model: string, options?: ChatOptions): AsyncIterable<StreamChunk>;
  listModels(): Promise<ModelConfig[]>;
  validateApiKey(): Promise<boolean>;
}

// ==================== Base Provider ====================

export abstract class BaseProvider implements ProviderInstance {
  abstract name: ProviderName;
  protected apiKey: string;
  protected baseUrl: string;
  protected models: ModelConfig[];

  constructor(protected config: ConfigManager, providerName: ProviderName) {
    this.apiKey = config.getProviderApiKey(providerName);
    this.baseUrl = config.getProviderBaseUrl(providerName);
    this.models = this.getModelConfigs(providerName);
  }

  abstract chat(messages: Message[], model: string, options?: ChatOptions): AsyncIterable<StreamChunk>;
  abstract listModels(): Promise<ModelConfig[]>;
  abstract validateApiKey(): Promise<boolean>;

  protected getModelConfigs(providerName: ProviderName): ModelConfig[] {
    const providerConfig = this.config.get('providers')[providerName] as { models?: ModelConfig[] } | undefined;
    if (providerConfig && Array.isArray(providerConfig.models)) {
      return providerConfig.models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: providerName,
        maxTokens: m.maxTokens || 4096,
        contextWindow: m.contextWindow || 8192,
        supportsStreaming: m.supportsStreaming ?? true,
        supportsVision: m.supportsVision ?? false,
        supportsTools: m.supportsTools ?? true,
      }));
    }
    return [];
  }

  protected buildMessages(messages: Message[], systemPrompt?: string): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'tool') continue;

      const content: Array<Record<string, unknown>> = [];

      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      if (msg.images && msg.images.length > 0) {
        for (const img of msg.images) {
          content.push({
            type: 'image_url',
            image_url: { url: img.startsWith('data:') ? img : `data:image/png;base64,${img}` },
          });
        }
      }

      const message: Record<string, unknown> = {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: content.length === 1 && content[0].type === 'text' ? msg.content : content,
      };

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        message.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
      }

      result.push(message);

      // Add tool results
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          const toolResult = msg.toolResults?.find((tr) => tr.toolCallId === tc.id);
          result.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResult?.content || 'No result',
          });
        }
      }
    }

    return result;
  }
}

// ==================== OpenAI-Compatible Provider ====================
// Handles: OpenAI, OpenRouter, DeepSeek, Groq, and any OpenAI-compatible API

export class OpenAIProvider extends BaseProvider {
  name: ProviderName = 'openai';

  constructor(config: ConfigManager, providerOverride?: ProviderName) {
    super(config, providerOverride || 'openai');
  }

  async *chat(messages: Message[], model: string, options?: ChatOptions): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model,
      messages: this.buildMessages(messages, options?.systemPrompt),
      stream: true,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
    };

    if (options?.tools) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', content: `OpenAI API Error (${response.status}): ${error}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', content: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          yield { type: 'done', content: '' };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          if (delta?.content) {
            yield { type: 'text', content: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              yield {
                type: 'tool_call',
                content: '',
                toolCall: {
                  id: tc.id,
                  name: tc.function?.name,
                  arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
                },
              };
            }
          }

          if (choice.finish_reason === 'stop') {
            const usage = parsed.usage;
            if (usage) {
              yield {
                type: 'done',
                content: '',
                usage: {
                  input: usage.prompt_tokens || 0,
                  output: usage.completion_tokens || 0,
                  cacheRead: usage.prompt_tokens_details?.cached_tokens,
                },
              };
            } else {
              yield { type: 'done', content: '' };
            }
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  }

  async listModels(): Promise<ModelConfig[]> {
    if (this.models.length > 0) return this.models;

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) return this.models;

      const data = await response.json() as { data?: Array<Record<string, unknown>> };
      if (Array.isArray(data.data)) {
        this.models = data.data
          .slice(0, 50)
          .map((m) => ({
            id: m.id as string,
            name: (m.id as string).split('/').pop() || (m.id as string),
            provider: this.name as ProviderName,
            maxTokens: 4096,
            contextWindow: 8192,
            supportsStreaming: true,
            supportsVision: (m.id as string).includes('vision'),
            supportsTools: true,
          }));
      }
    } catch {
      // Use defaults
    }
    return this.models;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ==================== Anthropic Provider ====================

export class AnthropicProvider extends BaseProvider {
  name: ProviderName = 'anthropic';

  constructor(config: ConfigManager, providerOverride?: ProviderName) {
    super(config, providerOverride || 'anthropic');
  }

  async *chat(messages: Message[], model: string, options?: ChatOptions): AsyncIterable<StreamChunk> {
    // Build messages (Anthropic format: system separate, no system in messages array)
    const anthropicMessages: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      const content: Array<Record<string, unknown>> = [];

      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      if (msg.images && msg.images.length > 0) {
        for (const img of msg.images) {
          const isBase64 = img.startsWith('data:');
          const base64 = isBase64 ? img.split(',')[1] : img;
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64,
            },
          });
        }
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const toolResults: Array<Record<string, unknown>> = [];
        for (const tc of msg.toolCalls) {
          const toolResult = msg.toolResults?.find((tr) => tr.toolCallId === tc.id);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: toolResult?.content || 'No result',
          });
        }
        anthropicMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      anthropicMessages.push({ role: msg.role, content });
    }

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens || 8192,
      stream: true,
      temperature: options?.temperature ?? 0.7,
    };

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options?.tools) {
      body.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', content: `Anthropic API Error (${response.status}): ${error}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', content: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolName = '';
    let currentToolId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        try {
          const parsed = JSON.parse(data);
          const eventType = parsed.type;

          if (eventType === 'content_block_delta') {
            const delta = parsed.delta;
            if (delta.type === 'text_delta') {
              yield { type: 'text', content: delta.text };
            } else if (delta.type === 'input_json_delta') {
              yield {
                type: 'tool_call',
                content: '',
                toolCall: {
                  id: currentToolId,
                  name: currentToolName,
                  arguments: delta.partial_json ? JSON.parse(delta.partial_json) : {},
                },
              };
            } else if (delta.type === 'thinking_delta') {
              yield { type: 'thinking', content: delta.thinking };
            }
          } else if (eventType === 'content_block_start') {
            if (parsed.content_block?.type === 'tool_use') {
              currentToolId = parsed.content_block.id;
              currentToolName = parsed.content_block.name;
            }
          } else if (eventType === 'message_stop') {
            const usage = parsed.usage;
            if (usage) {
              yield {
                type: 'done',
                content: '',
                usage: {
                  input: usage.input_tokens || 0,
                  output: usage.output_tokens || 0,
                  cacheRead: usage.cache_read_input_tokens,
                  cacheWrite: usage.cache_creation_input_tokens,
                },
              };
            } else {
              yield { type: 'done', content: '' };
            }
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  }

  async listModels(): Promise<ModelConfig[]> {
    return this.models.length > 0
      ? this.models
      : [
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', maxTokens: 16384, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsTools: true },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', maxTokens: 16384, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsTools: true },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', maxTokens: 8192, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsTools: true },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', maxTokens: 8192, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsTools: true },
        ];
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      });
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }
}

// ==================== Ollama Provider (Local) ====================

export class OllamaProvider extends BaseProvider {
  name: ProviderName = 'ollama';

  constructor(config: ConfigManager, providerOverride?: ProviderName) {
    super(config, providerOverride || 'ollama');
  }

  async *chat(messages: Message[], model: string, options?: ChatOptions): AsyncIterable<StreamChunk> {
    const ollamaMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: true,
      options: {
        num_predict: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
      },
    };

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        yield { type: 'error', content: `Ollama Error (${response.status}): ${await response.text()}` };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: 'error', content: 'No response body' };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.message?.content) {
              yield { type: 'text', content: parsed.message.content };
            }
            if (parsed.done) {
              yield {
                type: 'done',
                content: '',
                usage: {
                  input: parsed.prompt_eval_count || 0,
                  output: parsed.eval_count || 0,
                },
              };
            }
          } catch {
            // skip
          }
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        content: `Cannot connect to Ollama at ${this.baseUrl}. Make sure Ollama is running.`,
      };
    }
  }

  async listModels(): Promise<ModelConfig[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return this.models;

      const data = await response.json() as { models?: Array<Record<string, unknown>> };
      if (Array.isArray(data.models)) {
        this.models = data.models.map((m) => ({
          id: m.name as string,
          name: m.name as string,
          provider: 'ollama' as ProviderName,
          maxTokens: 4096,
          contextWindow: 32768,
          supportsStreaming: true,
          supportsVision: (m.name as string).includes('vision') || (m.name as string).includes('llava'),
          supportsTools: false,
        }));
      }
    } catch {
      // Ollama not running
    }
    return this.models.length > 0 ? this.models : [
      { id: 'llama3', name: 'LLaMA 3', provider: 'ollama', maxTokens: 4096, contextWindow: 8192, supportsStreaming: true, supportsVision: false, supportsTools: false },
      { id: 'codellama', name: 'Code LLaMA', provider: 'ollama', maxTokens: 4096, contextWindow: 16384, supportsStreaming: true, supportsVision: false, supportsTools: false },
    ];
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ==================== Provider Registry ====================

export class ProviderRegistry {
  private providers = new Map<ProviderName, ProviderInstance>();
  private config: ConfigManager;

  constructor(config: ConfigManager) {
    this.config = config;

    // Register built-in providers
    this.register('openai', new OpenAIProvider(config));
    this.register('anthropic', new AnthropicProvider(config));
    this.register('ollama', new OllamaProvider(config));

    // OpenAI-compatible providers (reuse OpenAI provider with different config)
    this.registerOpenAICompatible('openrouter', 'OpenRouter');
    this.registerOpenAICompatible('deepseek', 'DeepSeek');
    this.registerOpenAICompatible('groq', 'Groq');
    this.registerOpenAICompatible('gemini', 'Gemini');
    this.registerOpenAICompatible('xai', 'xAI');
    this.registerOpenAICompatible('copilot', 'Copilot');
    this.registerOpenAICompatible('bedrock', 'Bedrock');
    this.registerOpenAICompatible('custom', 'Custom');
  }

  private registerOpenAICompatible(name: ProviderName, _displayName: string): void {
    class CompatibleProvider extends OpenAIProvider {
      override name = name as ProviderName;
    }
    const provider = new CompatibleProvider(this.config, name);
    this.providers.set(name, provider);
  }

  private register(name: ProviderName, provider: ProviderInstance): void {
    this.providers.set(name, provider);
  }

  get(name: ProviderName): ProviderInstance | undefined {
    return this.providers.get(name);
  }

  getDefaultProvider(): ProviderInstance {
    const name = this.config.get('defaultProvider');
    return this.providers.get(name) || this.providers.get('openai')!;
  }

  getDefaultModel(): string {
    return this.config.get('defaultModel');
  }

  getAllProviders(): Map<ProviderName, ProviderInstance> {
    return new Map(this.providers);
  }

  async getAllModels(): Promise<ModelConfig[]> {
    const allModels: ModelConfig[] = [];
    for (const [_name, provider] of this.providers) {
      try {
        const models = await provider.listModels();
        allModels.push(...models);
      } catch {
        // Skip providers that fail
      }
    }
    return allModels;
  }

  async validateProvider(name: ProviderName): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) return false;
    return provider.validateApiKey();
  }
}
