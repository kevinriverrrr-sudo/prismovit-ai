/**
 * PRISM Tool System
 * Built-in tools for file operations, shell execution, and code search.
 * Inspired by all three projects: OpenCode's tool registry, Pi's minimal tool set, OpenClaude's 50+ tools.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { execSync, spawn } from 'child_process';
import { glob } from 'glob';
import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

// ==================== File Read Tool ====================
const ReadTool: ToolDefinition = {
  name: 'read',
  description: 'Read file contents. Returns the content of the specified file. Supports specifying line ranges with offset and limit.',
  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Absolute or relative path to the file to read' },
      offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
      limit: { type: 'number', description: 'Maximum number of lines to read' },
    },
    required: ['filepath'],
  },
  permission: 'read',
  handler: async (args, _context): Promise<ToolResult> => {
    try {
      const filepath = resolve(args.filepath as string);
      if (!existsSync(filepath)) {
        return { toolCallId: '', content: `File not found: ${filepath}`, isError: true };
      }

      const content = readFileSync(filepath, 'utf-8');
      const lines = content.split('\n');
      const offset = (args.offset as number) || 1;
      const limit = (args.limit as number) || lines.length;

      const selectedLines = lines.slice(offset - 1, offset - 1 + limit);
      const numbered = selectedLines.map((line, i) => `${String(offset + i).padStart(6)}\t${line}`).join('\n');

      return {
        toolCallId: '',
        content: numbered,
      };
    } catch (error: unknown) {
      return { toolCallId: '', content: `Error reading file: ${(error as Error).message}`, isError: true };
    }
  },
};

// ==================== File Write Tool ====================
const WriteTool: ToolDefinition = {
  name: 'write',
  description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. Creates parent directories as needed.',
  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Absolute or relative path to the file' },
      content: { type: 'string', description: 'Content to write to the file' },
    },
    required: ['filepath', 'content'],
  },
  permission: 'write',
  handler: async (args, _context): Promise<ToolResult> => {
    try {
      const filepath = resolve(args.filepath as string);
      const dir = join(filepath, '..');

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(filepath, args.content as string, 'utf-8');
      return { toolCallId: '', content: `File written successfully: ${filepath}` };
    } catch (error: unknown) {
      return { toolCallId: '', content: `Error writing file: ${(error as Error).message}`, isError: true };
    }
  },
};

// ==================== File Edit Tool ====================
const EditTool: ToolDefinition = {
  name: 'edit',
  description: 'Edit a file by replacing an exact text match with new text. The old_str must match exactly (including whitespace). Use replace_all to replace all occurrences.',
  parameters: {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'Path to the file to edit' },
      old_str: { type: 'string', description: 'Exact text to find and replace' },
      new_str: { type: 'string', description: 'Replacement text' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences instead of just the first' },
    },
    required: ['filepath', 'old_str', 'new_str'],
  },
  permission: 'write',
  handler: async (args, _context): Promise<ToolResult> => {
    try {
      const filepath = resolve(args.filepath as string);
      if (!existsSync(filepath)) {
        return { toolCallId: '', content: `File not found: ${filepath}`, isError: true };
      }

      let content = readFileSync(filepath, 'utf-8');
      const oldStr = args.old_str as string;
      const newStr = args.new_str as string;
      const replaceAll = args.replace_all as boolean;

      if (!content.includes(oldStr)) {
        return {
          toolCallId: '',
          content: `Text not found in file. Make sure old_str matches exactly, including whitespace and indentation.`,
          isError: true,
        };
      }

      if (replaceAll) {
        content = content.split(oldStr).join(newStr);
      } else {
        content = content.replace(oldStr, newStr);
      }

      writeFileSync(filepath, content, 'utf-8');
      return { toolCallId: '', content: `File edited successfully: ${filepath}` };
    } catch (error: unknown) {
      return { toolCallId: '', content: `Error editing file: ${(error as Error).message}`, isError: true };
    }
  },
};

// ==================== Bash/Shell Tool ====================
const BashTool: ToolDefinition = {
  name: 'bash',
  description: 'Execute a shell command and return the output. Use for running build commands, git operations, package managers, etc. Timeout: 120 seconds.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      cwd: { type: 'string', description: 'Working directory for the command (default: project root)' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default: 120000)' },
    },
    required: ['command'],
  },
  permission: 'execute',
  handler: async (args, context): Promise<ToolResult> => {
    return new Promise((resolve) => {
      const command = args.command as string;
      const cwd = (args.cwd as string) || context.cwd;
      const timeout = (args.timeout as number) || 120000;

      try {
        const child = spawn('bash', ['-c', command], {
          cwd,
          timeout,
          env: { ...process.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
        child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

        child.on('close', (code) => {
          const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
          resolve({
            toolCallId: '',
            content: output || `Command exited with code ${code}`,
            isError: code !== 0,
          });
        });

        child.on('error', (error) => {
          resolve({ toolCallId: '', content: `Shell error: ${error.message}`, isError: true });
        });
      } catch (error: unknown) {
        resolve({ toolCallId: '', content: `Error executing command: ${(error as Error).message}`, isError: true });
      }
    });
  },
};

// ==================== Glob Tool ====================
const GlobTool: ToolDefinition = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns matching file paths sorted by modification time.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")' },
      cwd: { type: 'string', description: 'Directory to search in (default: project root)' },
    },
    required: ['pattern'],
  },
  permission: 'read',
  handler: async (args, context): Promise<ToolResult> => {
    try {
      const cwd = (args.cwd as string) || context.cwd;
      const pattern = args.pattern as string;
      const matches = await glob(pattern, { cwd, absolute: true });

      if (matches.length === 0) {
        return { toolCallId: '', content: 'No files matched the pattern.' };
      }

      const limited = matches.slice(0, 200);
      return { toolCallId: '', content: limited.join('\n') };
    } catch (error: unknown) {
      return { toolCallId: '', content: `Glob error: ${(error as Error).message}`, isError: true };
    }
  },
};

// ==================== Grep Tool ====================
const GrepTool: ToolDefinition = {
  name: 'grep',
  description: 'Search for a pattern in file contents. Supports regex patterns. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (supports regex)' },
      path: { type: 'string', description: 'File or directory to search in' },
      include: { type: 'string', description: 'File glob to include (e.g. "*.ts")' },
      maxResults: { type: 'number', description: 'Maximum number of results (default: 50)' },
    },
    required: ['pattern'],
  },
  permission: 'read',
  handler: async (args, context): Promise<ToolResult> => {
    try {
      const pattern = args.pattern as string;
      const searchPath = (args.path as string) || context.cwd;
      const include = args.include as string | undefined;
      const maxResults = (args.maxResults as number) || 50;

      // Simple grep implementation using ripgrep if available, fallback to Node.js
      try {
        const rgArgs = ['--line-number', '--no-heading', '--color=never', pattern, searchPath];
        if (include) rgArgs.splice(1, 0, '--glob', include);
        rgArgs.splice(1, 0, `--max-count=${maxResults}`);

        const result = execSync(`rg ${rgArgs.join(' ')}`, {
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });

        return { toolCallId: '', content: result.trim() || 'No matches found.' };
      } catch {
        // Fallback: simple file search
        return { toolCallId: '', content: grepFallback(pattern, searchPath, include, maxResults) };
      }
    } catch (error: unknown) {
      return { toolCallId: '', content: `Grep error: ${(error as Error).message}`, isError: true };
    }
  },
};

function grepFallback(pattern: string, searchPath: string, include: string | undefined, maxResults: number): string {
  const results: string[] = [];
  const regex = new RegExp(pattern, 'g');
  const ext = include?.replace('*.', '.');

  function searchDir(dir: string): void {
    if (results.length >= maxResults) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          searchDir(fullPath);
        } else {
          if (ext && !entry.name.endsWith(ext)) continue;
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
              if (regex.test(lines[i])) {
                results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                regex.lastIndex = 0;
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  searchDir(searchPath);
  return results.length > 0 ? results.join('\n') : 'No matches found.';
}

// ==================== List Directory Tool ====================
const ListDirTool: ToolDefinition = {
  name: 'ls',
  description: 'List files and directories at a given path. Returns directory contents with type indicators.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path to list (default: current working directory)' },
    },
  },
  permission: 'read',
  handler: async (args, _context): Promise<ToolResult> => {
    try {
      const dirPath = resolve((args.path as string) || process.cwd());
      if (!existsSync(dirPath)) {
        return { toolCallId: '', content: `Directory not found: ${dirPath}`, isError: true };
      }

      const entries = readdirSync(dirPath, { withFileTypes: true });
      const listing = entries.map((entry) => {
        const type = entry.isDirectory() ? 'DIR ' : entry.isSymbolicLink() ? 'LINK' : 'FILE';
        return `${type}  ${entry.name}`;
      });

      return { toolCallId: '', content: listing.join('\n') || '(empty directory)' };
    } catch (error: unknown) {
      return { toolCallId: '', content: `Error listing directory: ${(error as Error).message}`, isError: true };
    }
  },
};

// ==================== Tool Registry ====================

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  constructor() {
    this.register(ReadTool);
    this.register(WriteTool);
    this.register(EditTool);
    this.register(BashTool);
    this.register(GlobTool);
    this.register(GrepTool);
    this.register(ListDirTool);
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async executeTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { toolCallId: '', content: `Unknown tool: ${name}`, isError: true };
    }
    return tool.handler(args, context);
  }
}
