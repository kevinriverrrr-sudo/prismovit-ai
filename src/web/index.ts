/**
 * PRISM Web Interface
 * Local web server that provides a browser-based chat interface for PRISM.
 * Accessible at http://localhost:3141 (π ≈ 3.141)
 */

import { createServer } from 'http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { AgentLoop, AgentEvent } from '../agent/index.js';
import type { SessionManager } from '../session/index.js';
import type { ProviderRegistry } from '../providers/index.js';
import type { PrismConfig } from '../types/index.js';

const WEB_PORT = 3141;
const WS_UPGRADE_HEADER = 'upgrade';
const WS_PROTOCOL = 'websocket';

export function generateWebClientHTML(config: PrismConfig): string {
  const c = config.theme.colors;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PRISM AI</title>
  <style>
    :root {
      --primary: ${c.primary};
      --secondary: ${c.secondary};
      --accent: ${c.accent};
      --error: ${c.error};
      --warning: ${c.warning};
      --success: ${c.success};
      --muted: ${c.muted};
      --bg: ${c.background};
      --user-bubble: ${c.userBubble};
      --assistant-bubble: ${c.assistantBubble};
      --border: ${c.border};
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
      background: var(--bg);
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      background: linear-gradient(135deg, ${c.background}, ${c.userBubble});
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header h1 {
      font-size: 18px;
      color: var(--accent);
    }
    .header .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--primary);
      color: #000;
    }
    .header .status {
      margin-left: auto;
      font-size: 12px;
      color: var(--muted);
    }
    .header .status.online { color: var(--success); }

    /* Messages */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 12px;
      line-height: 1.6;
      font-size: 14px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .message.user {
      align-self: flex-end;
      background: var(--user-bubble);
      border: 1px solid var(--border);
    }
    .message.assistant {
      align-self: flex-start;
      background: var(--assistant-bubble);
      border: 1px solid var(--border);
    }
    .message .role {
      font-size: 11px;
      font-weight: bold;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .message.user .role { color: var(--primary); }
    .message.assistant .role { color: var(--accent); }

    .message code {
      background: rgba(255,255,255,0.05);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
    .message pre {
      background: rgba(0,0,0,0.3);
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 8px 0;
      border: 1px solid var(--border);
    }
    .message pre code {
      background: none;
      padding: 0;
    }

    .tool-call {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 8px;
      padding: 8px 12px;
      margin: 4px 0;
      font-size: 12px;
    }
    .tool-call .tool-name {
      color: var(--warning);
      font-weight: bold;
    }

    .typing-indicator {
      align-self: flex-start;
      padding: 12px 16px;
      color: var(--muted);
      font-size: 13px;
    }
    .typing-indicator span {
      animation: blink 1.4s infinite;
    }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes blink {
      0%, 20% { opacity: 0.2; }
      50% { opacity: 1; }
      80%, 100% { opacity: 0.2; }
    }

    /* Input */
    .input-area {
      border-top: 1px solid var(--border);
      padding: 16px 20px;
      display: flex;
      gap: 12px;
      background: var(--bg);
    }
    .input-area input {
      flex: 1;
      background: var(--assistant-bubble);
      border: 1px solid var(--border);
      color: #e0e0e0;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .input-area input:focus {
      border-color: var(--primary);
    }
    .input-area input::placeholder { color: var(--muted); }
    .input-area button {
      background: var(--primary);
      color: #000;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .input-area button:hover { opacity: 0.85; }
    .input-area button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Welcome */
    .welcome {
      text-align: center;
      padding: 60px 20px;
    }
    .welcome h2 {
      color: var(--accent);
      font-size: 28px;
      margin-bottom: 12px;
    }
    .welcome p {
      color: var(--muted);
      max-width: 500px;
      margin: 0 auto 8px;
      line-height: 1.6;
    }
    .welcome .providers {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 20px;
    }
    .welcome .providers span {
      background: rgba(255,255,255,0.05);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      border: 1px solid var(--border);
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    /* Usage bar */
    .usage {
      font-size: 11px;
      color: var(--muted);
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>◆ PRISM</h1>
    <span class="badge">v1.0.0</span>
    <span class="status online">● Connected</span>
    <span class="status" id="provider-status">${config.defaultProvider}/${config.defaultModel}</span>
  </div>

  <div class="messages" id="messages">
    <div class="welcome">
      <h2>◆ PRISM AI</h2>
      <p>Multi-provider AI coding assistant combining the best of OpenCode, Pi, and OpenClaude.</p>
      <p>Type a message to start, or use slash commands: /help, /model, /new, /clear</p>
      <div class="providers">
        <span>OpenAI</span>
        <span>Anthropic</span>
        <span>Gemini</span>
        <span>Ollama</span>
        <span>OpenRouter</span>
        <span>DeepSeek</span>
        <span>Groq</span>
        <span>Custom</span>
      </div>
    </div>
  </div>

  <div class="input-area">
    <input type="text" id="input" placeholder="Type a message... (or /help for commands)" autofocus />
    <button id="send" onclick="sendMessage()">Send</button>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    let isStreaming = false;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    function sendMessage() {
      const text = input.value.trim();
      if (!text || isStreaming) return;
      input.value = '';

      if (text.startsWith('/')) {
        handleCommand(text);
        return;
      }

      addUserMessage(text);

      // Send via WebSocket or API
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      }).then(response => {
        if (!response.ok) throw new Error('Failed to send');
        return response.body;
      }).then(body => {
        if (!body) return;
        const reader = body.getReader();
        const decoder = new TextDecoder();
        isStreaming = true;
        sendBtn.disabled = true;
        showTyping();

        function read() {
          reader.read().then(({ done, value }) => {
            if (done) {
              isStreaming = false;
              sendBtn.disabled = false;
              hideTyping();
              return;
            }
            const text = decoder.decode(value, { stream: true });
            processStreamChunk(text);
            read();
          });
        }
        read();
      }).catch(err => {
        addAssistantMessage('Error: ' + err.message);
      });
    }

    function processStreamChunk(chunk) {
      try {
        const events = chunk.split('\\n').filter(Boolean);
        for (const event of events) {
          if (event.startsWith('data: ')) {
            const data = JSON.parse(event.slice(6));
            if (data.type === 'text') {
              appendToLastAssistant(data.content);
            } else if (data.type === 'tool_call') {
              addToolCall(data.toolName, data.toolArgs);
            } else if (data.type === 'done') {
              if (data.usage) {
                updateUsage(data.usage);
              }
            } else if (data.type === 'error') {
              addAssistantMessage('⚠️ ' + data.content);
            }
          }
        }
      } catch (e) {
        // Non-JSON response - treat as plain text
        appendToLastAssistant(chunk);
      }
    }

    function addUserMessage(text) {
      // Remove welcome
      const welcome = messagesDiv.querySelector('.welcome');
      if (welcome) welcome.remove();

      const div = document.createElement('div');
      div.className = 'message user';
      div.innerHTML = '<div class="role">You</div>' + escapeHtml(text);
      messagesDiv.appendChild(div);
      scrollToBottom();
    }

    function addAssistantMessage(text) {
      const welcome = messagesDiv.querySelector('.welcome');
      if (welcome) welcome.remove();

      const div = document.createElement('div');
      div.className = 'message assistant';
      div.id = 'current-assistant';
      div.innerHTML = '<div class="role">PRISM</div>' + formatMarkdown(text);
      messagesDiv.appendChild(div);
      scrollToBottom();
    }

    function appendToLastAssistant(text) {
      let current = document.getElementById('current-assistant');
      if (!current) {
        addAssistantMessage(text);
        return;
      }
      // Append text (before any usage element)
      const usageEl = current.querySelector('.usage');
      if (usageEl) {
        const textNode = document.createTextNode(text);
        current.insertBefore(textNode, usageEl);
      } else {
        current.innerHTML = '<div class="role">PRISM</div>' + formatMarkdown(
          current.textContent.replace('PRISM', '').trim() + text
        );
      }
      scrollToBottom();
    }

    function addToolCall(name, args) {
      const div = document.createElement('div');
      div.className = 'tool-call';
      div.innerHTML = '<span class="tool-name">🔧 ' + escapeHtml(name) + '</span> ' + escapeHtml(JSON.stringify(args).slice(0, 100));
      messagesDiv.appendChild(div);
      scrollToBottom();
    }

    function updateUsage(usage) {
      let current = document.getElementById('current-assistant');
      if (current) {
        current.id = '';
      }
    }

    function showTyping() {
      const div = document.createElement('div');
      div.className = 'typing-indicator';
      div.id = 'typing';
      div.innerHTML = '<span>●</span><span>●</span><span>●</span> Thinking...';
      messagesDiv.appendChild(div);
      scrollToBottom();
    }

    function hideTyping() {
      const typing = document.getElementById('typing');
      if (typing) typing.remove();
    }

    function handleCommand(text) {
      const [cmd, ...args] = text.slice(1).split(' ');
      addUserMessage(text);

      fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, args }),
      }).then(r => r.json()).then(data => {
        addAssistantMessage(data.response || 'Command executed.');
      }).catch(err => {
        addAssistantMessage('Error: ' + err.message);
      });
    }

    function scrollToBottom() {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function escapeHtml(text) {
      return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function formatMarkdown(text) {
      return text
        .replace(/\\\`\\\`\\\`([\\s\\S]*?)\\\`\\\`\\\`/g, '<pre><code>$1</code></pre>')
        .replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>')
        .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\n/g, '<br>');
    }
  </script>
</body>
</html>`;
}

export class WebServer {
  private server: ReturnType<typeof createServer> | null = null;
  private agent: AgentLoop;
  private sessionManager: SessionManager;
  private providerRegistry: ProviderRegistry;
  private config: PrismConfig;
  private port: number;

  constructor(
    agent: AgentLoop,
    sessionManager: SessionManager,
    providerRegistry: ProviderRegistry,
    config: PrismConfig,
    port?: number,
  ) {
    this.agent = agent;
    this.sessionManager = sessionManager;
    this.providerRegistry = providerRegistry;
    this.config = config;
    this.port = port || WEB_PORT;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const html = generateWebClientHTML(this.config);

      this.server = createServer((req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        // Serve HTML
        if (req.url === '/' || req.url === '/index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        // API: Chat
        if (req.url === '/api/chat' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { message } = JSON.parse(body);
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
              });

              const session = this.sessionManager.getCurrentSession();
              if (!session) {
                this.sessionManager.createSession();
              }

              // Listen to agent events and stream them
              const eventHandler = (event: AgentEvent) => {
                try {
                  res.write(`data: ${JSON.stringify(event)}\n\n`);
                  if (event.type === 'done' || event.type === 'error') {
                    res.end();
                  }
                } catch {
                  // Client disconnected
                }
              };

              this.agent.onEvent(eventHandler);
              this.agent.start();
              await this.agent.sendMessage(message);
            } catch (error: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: (error as Error).message }));
            }
          });
          return;
        }

        // API: Command
        if (req.url === '/api/command' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { command, args } = JSON.parse(body);
              let response = '';

              switch (command) {
                case 'help':
                  response = 'Commands: /help, /model, /new, /clear, /compact, /sessions, /export, /mcp, /theme, /cost';
                  break;
                case 'model':
                  if (args.length > 0) {
                    this.agent.switchModel(args.join(' '));
                    response = `Model switched to: ${args.join(' ')}`;
                  } else {
                    const models = await this.providerRegistry.getAllModels();
                    response = models.slice(0, 20).map((m) => `${m.provider}/${m.id}`).join('\n');
                  }
                  break;
                case 'new':
                  this.sessionManager.createSession();
                  response = 'New session created';
                  break;
                case 'clear':
                  response = 'Messages cleared';
                  break;
                default:
                  response = `Unknown command: /${command}`;
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ response }));
            } catch (error: unknown) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: (error as Error).message }));
            }
          });
          return;
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getUrl(): string {
    return `http://localhost:${this.port}`;
  }
}
