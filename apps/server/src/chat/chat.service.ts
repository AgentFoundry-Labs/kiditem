import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { spawn, ChildProcess } from 'child_process';

const SYSTEM_PROMPT = `당신은 KIDITEM 운영 AI 어시스턴트입니다.
사용자의 질문에 실시간 데이터를 기반으로 답변합니다.

## 능력
- MCP 도구로 DB 읽기 전용 조회 (항상 가능)
- 등록된 에이전트가 있으면 분석 능력 파악 가능 (실행은 불가)

## 제약
- DB 수정, 에이전트 실행, 광고/상품 변경 등 쓰기 작업 절대 불가
- 실행이 필요한 작업은 "~을 실행하려면 [페이지명]에서 처리하세요" 형태로 안내
- 데이터 없이 추측 금지

## 동작 방식
1. 질문을 받으면 MCP 도구로 관련 데이터 조회
2. 조회한 데이터 기반으로 분석/답변
3. 실행이 필요하면 구체적 제안 + 페이지 안내
4. 한국어, 간결, 숫자와 상품명 직접 언급`;

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

  stream(message: string, sessionId?: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${message}`;

      const args = [
        '-p', fullPrompt,
        '--output-format', 'stream-json',
        '--print',
        '--permission-mode', 'bypassPermissions',
        ...(sessionId ? ['--session-id', sessionId] : []),
      ];

      let child: ChildProcess;
      try {
        child = spawn('claude', args, {
          cwd: process.cwd(),
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        this.emit(subscriber, { type: 'error', error: `Spawn error: ${err}` });
        subscriber.complete();
        return;
      }

      let buffer = '';
      let resultEmitted = false;
      let killed = false;

      const timeout = setTimeout(() => {
        this.logger.warn('Chat process timed out');
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!killed) child.kill('SIGKILL');
        }, GRACE_MS);
      }, TIMEOUT_MS);

      child.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        // Keep incomplete last line in buffer
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

      child.on('close', (code) => {
        clearTimeout(timeout);
        killed = true;

        // Process remaining buffer
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
        clearTimeout(timeout);
        killed = true;
        this.emit(subscriber, { type: 'error', error: `Process error: ${err.message}` });
        subscriber.complete();
      });

      // Cleanup on unsubscribe
      return () => {
        clearTimeout(timeout);
        if (!killed) {
          child.kill('SIGTERM');
          killed = true;
        }
      };
    });
  }

  private emit(subscriber: { next: (value: MessageEvent) => void }, data: SseData): void {
    subscriber.next({ data } as MessageEvent);
  }
}
