/**
 * PRISM Agent Loop
 * Core agent that manages the conversation loop, tool execution, and LLM interaction.
 * Combines patterns from OpenCode's agent system, Pi's event-driven architecture, and OpenClaude's tool loop.
 */

import { randomUUID } from 'crypto';
import type { Message, StreamChunk, ToolCall, ToolResult, ProviderName, ChatOptions } from '../types/index.js';
import { ProviderRegistry } from '../providers/index.js';
import { ToolRegistry } from '../tools/index.js';
import { MCPManager } from '../mcp/index.js';
import { SessionManager } from '../session/index.js';
import { ConfigManager } from '../config/index.js';

export type AgentEventType = 'start' | 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error' | 'usage';

export interface AgentEvent {
  type: AgentEventType;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  usage?: { input: number; output: number };
}

export type AgentEventHandler = (event: AgentEvent) => void;

const SYSTEM_PROMPT = `You are PRISM, a powerful AI coding assistant. You have access to tools that help you read, write, and edit files, execute shell commands, search code, and more.

When helping users:
- Be thorough and detailed in your responses
- Use tools when you need to read files, execute commands, or modify code
- Think step by step for complex problems
- Provide code examples when relevant
- Ask for clarification when the request is ambiguous

Available tools:
- read: Read file contents
- write: Create or overwrite files
- edit: Find and replace text in files
- bash: Execute shell commands
- glob: Find files by pattern
- grep: Search file contents
- ls: List directory contents`;

export class AgentLoop {
  private providerRegistry: ProviderRegistry;
  private toolRegistry: ToolRegistry;
  private mcpManager: MCPManager | null;
  private sessionManager: SessionManager;
  private config: ConfigManager;
  private eventHandlers: Set<AgentEventHandler> = new Set();
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(
    providerRegistry: ProviderRegistry,
    toolRegistry: ToolRegistry,
    sessionManager: SessionManager,
    config: ConfigManager,
    mcpManager?: MCPManager,
  ) {
    this.providerRegistry = providerRegistry;
    this.toolRegistry = toolRegistry;
    this.sessionManager = sessionManager;
    this.config = config;
    this.mcpManager = mcpManager || null;
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: AgentEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Skip failing handlers
      }
    }
  }

  async sendMessage(userMessage: string, images?: string[]): Promise<void> {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      this.emit({ type: 'error', content: 'No active session. Create a new session first.' });
      return;
    }

    // Add user message
    const userMsg: Message = {
      id: randomUUID(),
      role: 'user',
      content: userMessage,
      images,
      timestamp: Date.now(),
      model: session.model,
      provider: session.provider,
    };

    session.messages.push(userMsg);
    this.sessionManager.addMessage(session.id, userMsg);
    this.emit({ type: 'start', content: '' });

    // Build tool definitions
    const allTools = [
      ...this.toolRegistry.getToolDefinitions(),
    ];

    if (this.mcpManager) {
      allTools.push(...this.mcpManager.getToolDefinitions());
    }

    // Agent loop with tool calling
    let continueLoop = true;
    const maxIterations = 20;
    let iteration = 0;

    while (continueLoop && iteration < maxIterations && this.isRunning) {
      iteration++;
      continueLoop = false;

      const provider = this.providerRegistry.get(session.provider);
      if (!provider) {
        this.emit({ type: 'error', content: `Provider "${session.provider}" not found` });
        break;
      }

      const options: ChatOptions = {
        systemPrompt: SYSTEM_PROMPT,
        tools: allTools.length > 0 ? allTools : undefined,
      };

      const assistantContent: string[] = [];
      const assistantToolCalls: ToolCall[] = [];
      let currentToolCall: Partial<ToolCall> | null = null;
      let totalUsage: { input: number; output: number } = { input: 0, output: 0 };

      try {
        const stream = provider.chat(session.messages, session.model, options);

        for await (const chunk of stream) {
          if (!this.isRunning) break;

          switch (chunk.type) {
            case 'text':
              assistantContent.push(chunk.content);
              this.emit({ type: 'text', content: chunk.content });
              break;

            case 'thinking':
              this.emit({ type: 'thinking', content: chunk.content });
              break;

            case 'tool_call':
              if (chunk.toolCall?.id && chunk.toolCall?.name) {
                // Finalize previous tool call if any
                if (currentToolCall && currentToolCall.id && currentToolCall.name) {
                  assistantToolCalls.push(currentToolCall as ToolCall);
                }
                const prevArgs: Record<string, unknown> = (currentToolCall && currentToolCall.arguments) ? currentToolCall.arguments : {};
                currentToolCall = {
                  id: chunk.toolCall.id,
                  name: chunk.toolCall.name,
                  arguments: { ...prevArgs, ...(chunk.toolCall.arguments || {}) },
                };
              } else if (currentToolCall && chunk.toolCall?.arguments) {
                // Merge arguments into current tool call
                currentToolCall.arguments = {
                  ...(currentToolCall.arguments || {}),
                  ...chunk.toolCall.arguments,
                };
              }
              break;

            case 'done':
              if (chunk.usage) {
                totalUsage.input += chunk.usage.input;
                totalUsage.output += chunk.usage.output;
              }
              break;

            case 'error':
              this.emit({ type: 'error', content: chunk.content });
              break;
          }
        }

        // Finalize last tool call
        if (currentToolCall && currentToolCall.id && currentToolCall.name) {
          assistantToolCalls.push(currentToolCall as ToolCall);
        }

        // Add assistant message to session
        const assistantMsg: Message = {
          id: randomUUID(),
          role: 'assistant',
          content: assistantContent.join(''),
          toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
          timestamp: Date.now(),
          model: session.model,
          provider: session.provider,
          tokens: totalUsage,
        };

        session.messages.push(assistantMsg);
        this.sessionManager.addMessage(session.id, assistantMsg);

        // Emit usage
        if (totalUsage.input > 0 || totalUsage.output > 0) {
          this.emit({ type: 'usage', content: '', usage: totalUsage });
        }

        // Execute tool calls if any
        if (assistantToolCalls.length > 0) {
          const toolResults: ToolResult[] = [];

          for (const toolCall of assistantToolCalls) {
            this.emit({
              type: 'tool_call',
              content: '',
              toolName: toolCall.name,
              toolArgs: toolCall.arguments,
            });

            // Check if it's an MCP tool
            const mcpInfo = this.mcpManager?.isToolMCP(toolCall.name);
            let result: ToolResult;

            if (mcpInfo?.isMCP && this.mcpManager) {
              result = await this.mcpManager.callTool(
                mcpInfo.serverName,
                mcpInfo.toolName,
                toolCall.arguments,
                { cwd: process.cwd(), sessionId: session.id, config: this.config.getConfig() },
              );
            } else {
              result = await this.toolRegistry.executeTool(
                toolCall.name,
                toolCall.arguments,
                { cwd: process.cwd(), sessionId: session.id, config: this.config.getConfig() },
              );
            }

            toolResults.push(result);

            this.emit({
              type: 'tool_result',
              content: result.content.slice(0, 500) + (result.content.length > 500 ? '...' : ''),
              toolName: toolCall.name,
            });
          }

          // Add tool results as a user message (for the next iteration)
          const toolMsg: Message = {
            id: randomUUID(),
            role: 'user',
            content: '',
            toolResults,
            timestamp: Date.now(),
          };

          session.messages.push(toolMsg);
          this.sessionManager.addMessage(session.id, toolMsg);

          continueLoop = true;
        }
      } catch (error: unknown) {
        this.emit({ type: 'error', content: `Agent error: ${(error as Error).message}` });
        break;
      }
    }

    this.emit({ type: 'done', content: '' });
  }

  start(): void {
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  switchProvider(provider: ProviderName): boolean {
    const providerInst = this.providerRegistry.get(provider);
    if (!providerInst) return false;

    const session = this.sessionManager.getCurrentSession();
    if (session) {
      session.provider = provider;
    }
    return true;
  }

  switchModel(model: string): boolean {
    const session = this.sessionManager.getCurrentSession();
    if (!session) return false;
    session.model = model;
    return true;
  }
}
