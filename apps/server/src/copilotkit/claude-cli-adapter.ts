import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import type {
  CopilotServiceAdapter,
  CopilotRuntimeChatCompletionRequest,
  CopilotRuntimeChatCompletionResponse,
} from '@copilotkit/runtime';

const SYSTEM_PROMPT = `당신은 KIDITEM 이커머스 운영 AI 어시스턴트입니다.
쿠팡 키즈용품 셀러의 광고, 재고, 가격, 매출 전략을 도와줍니다.
한국어로 간결하게 답변하세요.
사용자가 제공하는 컨텍스트 데이터를 참고하여 인사이트를 제공하세요.
DB 조회는 psql "$AGENT_DATABASE_URL"로 직접 수행합니다.
쓰기 작업은 절대 불가.`;

const TIMEOUT_MS = 120_000;
const GRACE_MS = 10_000;

/**
 * CopilotKit adapter that delegates to the Claude CLI process.
 * Mirrors the pattern from apps/server/src/chat/chat.service.ts.
 */
export class ClaudeCliAdapter implements CopilotServiceAdapter {
  provider = 'anthropic';
  model = 'claude';

  get name() {
    return 'ClaudeCliAdapter';
  }

  async process(
    request: CopilotRuntimeChatCompletionRequest,
  ): Promise<CopilotRuntimeChatCompletionResponse> {
    const {
      eventSource,
      messages,
      threadId: threadIdFromRequest,
    } = request;

    const threadId = threadIdFromRequest || randomUUID();

    // Extract user text and context from messages
    let userText = '';
    const contextParts: string[] = [];

    for (const msg of messages) {
      if (!msg.isTextMessage()) continue;
      const text = (msg as any).content ?? '';
      if (msg.role === 'user') userText = text;
      else if (msg.role === 'system') contextParts.push(text);
    }

    const fullPrompt = [
      SYSTEM_PROMPT,
      ...contextParts.length > 0 ? [`\n--- 컨텍스트 ---\n${contextParts.join('\n')}`] : [],
      `\n--- 사용자 질문 ---\n${userText}`,
    ].join('\n');

    await eventSource.stream(async (eventStream$) => {
      return new Promise<void>((resolve) => {
        const messageId = randomUUID();

        const args = [
          '-p', fullPrompt,
          '--output-format', 'stream-json',
          '--print',
          '--permission-mode', 'bypassPermissions',
          '--allowedTools', 'Bash(psql:*) Read Grep',
        ];

        let child;
        try {
          child = spawn('claude', args, {
            cwd: process.cwd(),
            env: {
              ...process.env,
              AGENT_DATABASE_URL:
                process.env.AGENT_DATABASE_URL ||
                process.env.DATABASE_URL ||
                '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (err) {
          eventStream$.sendTextMessage(messageId, `오류: ${err}`);
          eventStream$.complete();
          resolve();
          return;
        }

        let buffer = '';
        let started = false;
        let killed = false;

        const timeoutRef = setTimeout(() => {
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
              if (
                parsed.type === 'content_block_delta' &&
                parsed.delta?.text
              ) {
                if (!started) {
                  eventStream$.sendTextMessageStart({ messageId });
                  started = true;
                }
                eventStream$.sendTextMessageContent({
                  messageId,
                  content: parsed.delta.text,
                });
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        });

        child.stderr?.on('data', () => {
          // Suppress stderr noise
        });

        child.on('close', () => {
          clearTimeout(timeoutRef);
          killed = true;

          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              if (
                parsed.type === 'content_block_delta' &&
                parsed.delta?.text
              ) {
                if (!started) {
                  eventStream$.sendTextMessageStart({ messageId });
                  started = true;
                }
                eventStream$.sendTextMessageContent({
                  messageId,
                  content: parsed.delta.text,
                });
              }
            } catch {
              // ignore
            }
          }

          if (!started) {
            eventStream$.sendTextMessageStart({ messageId });
            eventStream$.sendTextMessageContent({
              messageId,
              content: '응답을 생성하지 못했습니다.',
            });
          }
          eventStream$.sendTextMessageEnd({ messageId });
          eventStream$.complete();
          resolve();
        });

        child.on('error', (err) => {
          clearTimeout(timeoutRef);
          killed = true;

          if (!started) {
            eventStream$.sendTextMessageStart({ messageId });
          }
          eventStream$.sendTextMessageContent({
            messageId,
            content: `프로세스 오류: ${err.message}`,
          });
          eventStream$.sendTextMessageEnd({ messageId });
          eventStream$.complete();
          resolve();
        });
      });
    });

    return { threadId };
  }
}
