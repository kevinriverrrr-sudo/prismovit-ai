/**
 * PRISM MCP (Model Context Protocol) Client Manager
 * Full MCP client implementation using @modelcontextprotocol/sdk.
 * Inspired by OpenClaude's MCP integration and OpenCode's built-in MCP.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { MCPServerConfig, MCPTool, ToolContext, ToolResult } from '../types/index.js';

export class MCPManager {
  private servers = new Map<string, { client: Client; transport: StdioClientTransport }>();
  private tools = new Map<string, MCPTool>();
  private serverConfigs: Record<string, MCPServerConfig>;

  constructor(serverConfigs: Record<string, MCPServerConfig>) {
    this.serverConfigs = serverConfigs;
  }

  async connectAll(): Promise<void> {
    const enabledServers = Object.entries(this.serverConfigs).filter(
      ([, config]) => config.enabled
    );

    for (const [name, config] of enabledServers) {
      try {
        await this.connectServer(name, config);
      } catch (error: unknown) {
        console.error(`Failed to connect MCP server "${name}": ${(error as Error).message}`);
      }
    }
  }

  async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), ...config.env },
    });

    const client = new Client(
      { name: 'prism', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.servers.set(name, { client, transport });

    // List available tools from the server
    try {
      const toolList = await client.listTools();
      if (toolList.tools) {
        for (const tool of toolList.tools) {
          this.tools.set(`${name}:${tool.name}`, {
            name: tool.name,
            description: tool.description || '',
            inputSchema: (tool.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
            serverName: name,
          });
        }
      }
    } catch (error: unknown) {
      console.error(`Failed to list tools from MCP server "${name}": ${(error as Error).message}`);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [name, { client, transport }] of this.servers) {
      try {
        await client.close();
        await transport.close();
      } catch (error: unknown) {
        console.error(`Error disconnecting MCP server "${name}": ${(error as Error).message}`);
      }
    }
    this.servers.clear();
    this.tools.clear();
  }

  async disconnectServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (server) {
      await server.client.close();
      await server.transport.close();
      this.servers.delete(name);

      // Remove tools from this server
      for (const [key, tool] of this.tools) {
        if (tool.serverName === name) {
          this.tools.delete(key);
        }
      }
    }
  }

  async addServer(name: string, config: MCPServerConfig): Promise<void> {
    this.serverConfigs[name] = config;
    if (config.enabled) {
      await this.connectServer(name, config);
    }
  }

  removeServer(name: string): void {
    delete this.serverConfigs[name];
    this.disconnectServer(name);
  }

  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.getAllTools().map((t) => ({
      name: `mcp__${t.serverName}__${t.name}`,
      description: `[MCP:${t.serverName}] ${t.description}`,
      parameters: t.inputSchema,
    }));
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const server = this.servers.get(serverName);
    if (!server) {
      return { toolCallId: '', content: `MCP server "${serverName}" not connected`, isError: true };
    }

    try {
      const result = await server.client.callTool({ name: toolName, arguments: args });

      const content = Array.isArray(result.content)
        ? result.content.map((c: Record<string, unknown>) => c.text || '').join('\n')
        : String(result.content || '');

      return {
        toolCallId: '',
        content,
        isError: result.isError as boolean | undefined,
      };
    } catch (error: unknown) {
      return {
        toolCallId: '',
        content: `MCP tool error: ${(error as Error).message}`,
        isError: true,
      };
    }
  }

  isToolMCP(toolName: string): { isMCP: boolean; serverName: string; toolName: string } {
    if (toolName.startsWith('mcp__')) {
      const parts = toolName.split('__');
      return {
        isMCP: true,
        serverName: parts[1],
        toolName: parts.slice(2).join('__'),
      };
    }
    return { isMCP: false, serverName: '', toolName: '' };
  }

  async callToolByName(fullName: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const parsed = this.isToolMCP(fullName);
    if (parsed.isMCP) {
      return this.callTool(parsed.serverName, parsed.toolName, args, context);
    }
    return { toolCallId: '', content: `Not an MCP tool: ${fullName}`, isError: true };
  }

  getServerConfigs(): Record<string, MCPServerConfig> {
    return { ...this.serverConfigs };
  }
}
