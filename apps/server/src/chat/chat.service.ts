import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { spawn, ChildProcess } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';

const FALLBACK_PROMPT = `당신은 KIDITEM 운영 AI 어시스턴트입니다.
사용자의 질문에 실시간 데이터를 기반으로 답변합니다.
DB 조회는 psql "$AGENT_DATABASE_URL"로 직접 수행합니다.
쓰기 작업은 절대 불가. 한국어, 간결하게 답변.`;

const TIMEOUT_MS = 120_000;
const GRACE_MS = 10_000;

interface SseData {
  type: 'text' | 'result' | 'error' | 'done';
  text?: string;
  sessionId?: string;
  usage?: Record<string, unknown>;
  error?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  private async loadPrompt(): Promise<string> {
    try {
      return await readFile(
        join(process.cwd(), 'agent-config/prompts/agents/chat.md'), 'utf-8',
      );
    } catch {
      this.logger.warn('chat.md not found, using fallback prompt');
      return FALLBACK_PROMPT;
    }
  }

  stream(message: string, sessionId?: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let childRef: ChildProcess | null = null;
      let timeoutRef: ReturnType<typeof setTimeout> | null = null;
      let killed = false;

      this.loadPrompt().then((systemPrompt) => {
        const fullPrompt = `${systemPrompt}\n\n---\n\n${message}`;

        const args = [
          '-p', fullPrompt,
          '--output-format', 'stream-json',
          '--print',
          '--permission-mode', 'bypassPermissions',
          '--allowedTools', 'Bash(psql:*) Read Grep',
          ...(sessionId ? ['--session-id', sessionId] : []),
        ];

        let child: ChildProcess;
        try {
          child = spawn('claude', args, {
            cwd: process.cwd(),
            env: {
              ...process.env,
              AGENT_DATABASE_URL: process.env.AGENT_DATABASE_URL || process.env.DATABASE_URL || '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (err) {
          this.emit(subscriber, { type: 'error', error: `Spawn error: ${err}` });
          subscriber.complete();
          return;
        }

        childRef = child;
        let buffer = '';
        let resultEmitted = false;

        timeoutRef = setTimeout(() => {
          this.logger.warn('Chat process timed out');
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!killed) child.kill('SIGKILL');
          }, GRACE_MS);
        }, TIMEOUT_MS);

        child.stdout?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                this.emit(subscriber, { type: 'text', text: parsed.delta.text });
              } else if (parsed.type === 'result') {
                resultEmitted = true;
                this.emit(subscriber, {
                  type: 'result',
                  sessionId: parsed.session_id,
                  usage: parsed.usage || null,
                });
              }
            } catch {
              // Not valid JSON line, skip
            }
          }
        });

        child.stderr?.on('data', (chunk: Buffer) => {
          this.logger.warn(`Claude stderr: ${chunk.toString().slice(0, 500)}`);
        });

        child.on('close', () => {
          if (timeoutRef) clearTimeout(timeoutRef);
          killed = true;

          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                this.emit(subscriber, { type: 'text', text: parsed.delta.text });
              } else if (parsed.type === 'result') {
                resultEmitted = true;
                this.emit(subscriber, {
                  type: 'result',
                  sessionId: parsed.session_id,
                  usage: parsed.usage || null,
                });
              }
            } catch {
              // ignore
            }
          }

          if (!resultEmitted) {
            this.emit(subscriber, { type: 'done' });
          }
          subscriber.complete();
        });

        child.on('error', (err) => {
          if (timeoutRef) clearTimeout(timeoutRef);
          killed = true;
          this.emit(subscriber, { type: 'error', error: `Process error: ${err.message}` });
          subscriber.complete();
        });
      }).catch((err) => {
        this.emit(subscriber, { type: 'error', error: `Prompt load error: ${err}` });
        subscriber.complete();
      });

      // Cleanup on unsubscribe
      return () => {
        if (timeoutRef) clearTimeout(timeoutRef);
        if (childRef && !killed) {
          childRef.kill('SIGTERM');
          killed = true;
        }
      };
    });
  }

  private emit(subscriber: { next: (value: MessageEvent) => void }, data: SseData): void {
    subscriber.next({ data } as MessageEvent);
  }
}
