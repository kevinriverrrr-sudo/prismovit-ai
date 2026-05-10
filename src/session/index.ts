/**
 * PRISM Session Manager
 * Manages chat sessions with persistence (JSONL format inspired by Pi).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Session, SessionSummary, Message, ProviderName } from '../types/index.js';

export class SessionManager {
  private sessionsDir: string;
  private currentSession: Session | null = null;
  private sessionsCache = new Map<string, Session>();

  constructor(dataDir: string) {
    this.sessionsDir = join(dataDir, 'sessions');
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  createSession(title?: string, model?: string, provider?: ProviderName): Session {
    const session: Session = {
      id: randomUUID(),
      title: title || 'New Chat',
      messages: [],
      model: model || 'gpt-4o',
      provider: provider || 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.currentSession = session;
    this.sessionsCache.set(session.id, session);
    this.saveSession(session);

    return session;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  setCurrentSession(session: Session): void {
    this.currentSession = session;
  }

  addMessage(sessionId: string, message: Message): void {
    const session = this.sessionsCache.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.updatedAt = Date.now();

      // Auto-generate title from first user message
      if (session.title === 'New Chat' && message.role === 'user' && session.messages.filter((m) => m.role === 'user').length === 1) {
        session.title = message.content.slice(0, 60) + (message.content.length > 60 ? '...' : '');
      }

      this.saveSession(session);
    }
  }

  clearMessages(sessionId: string): void {
    const session = this.sessionsCache.get(sessionId);
    if (session) {
      session.messages = [];
      session.updatedAt = Date.now();
      this.saveSession(session);
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    try {
      if (!existsSync(this.sessionsDir)) return summaries;

      const files = readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = readFileSync(join(this.sessionsDir, file), 'utf-8');
          const session = JSON.parse(raw) as Session;
          summaries.push({
            id: session.id,
            title: session.title,
            model: session.model,
            provider: session.provider,
            messageCount: session.messages.length,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          });
        } catch {
          // Skip corrupted files
        }
      }
    } catch {
      // Return empty
    }

    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const cached = this.sessionsCache.get(sessionId);
    if (cached) return cached;

    const filePath = join(this.sessionsDir, `${sessionId}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const session = JSON.parse(raw) as Session;
      this.sessionsCache.set(session.id, session);
      return session;
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const filePath = join(this.sessionsDir, `${sessionId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    this.sessionsCache.delete(sessionId);
    if (this.currentSession?.id === sessionId) {
      this.currentSession = null;
    }
  }

  private saveSession(session: Session): void {
    const filePath = join(this.sessionsDir, `${session.id}.json`);
    writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  exportSession(sessionId: string, format: 'json' | 'markdown' | 'html'): string {
    const session = this.sessionsCache.get(sessionId);
    if (!session) return 'Session not found';

    switch (format) {
      case 'json':
        return JSON.stringify(session, null, 2);

      case 'markdown': {
        let md = `# ${session.title}\n\n`;
        md += `**Model:** ${session.provider}/${session.model}\n`;
        md += `**Date:** ${new Date(session.createdAt).toLocaleString()}\n\n---\n\n`;

        for (const msg of session.messages) {
          const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
          md += `### ${role}\n\n${msg.content}\n\n`;
        }
        return md;
      }

      case 'html': {
        let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${session.title}</title>`;
        html += `<style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;background:#1a1a2e;color:#e0e0e0;}`;
        html += `.msg{margin:16px 0;padding:12px 16px;border-radius:8px;}`;
        html += `.user{background:#1e3a5f;}.assistant{background:#2a2a3e;}`;
        html += `.role{font-weight:bold;margin-bottom:4px;}</style></head><body>`;
        html += `<h1>${session.title}</h1><p>Model: ${session.provider}/${session.model}</p><hr>`;

        for (const msg of session.messages) {
          html += `<div class="msg ${msg.role}"><div class="role">${msg.role}</div><pre>${escapeHtml(msg.content)}</pre></div>`;
        }

        html += `</body></html>`;
        return html;
      }

      default:
        return 'Unsupported format';
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
