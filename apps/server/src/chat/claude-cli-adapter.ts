import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  CopilotServiceAdapter,
  CopilotRuntimeChatCompletionRequest,
  CopilotRuntimeChatCompletionResponse,
} from '@copilotkit/runtime';
import { buildClaudeCliEnv } from './claude-cli-env';

const FALLBACK_PROMPT = `당신은 KIDITEM 운영 AI 어시스턴트입니다.
사용자의 질문에 실시간 데이터를 기반으로 답변합니다.
DB 조회는 psql "$AGENT_DATABASE_URL"로 직접 수행합니다.
쓰기 작업은 절대 불가. 한국어, 간결하게 답변.`;

const TIMEOUT_MS = 120_000;
const GRACE_MS = 10_000;

/**
 * CopilotKit adapter that delegates to the Claude CLI process.
 * Loads system prompt from agent-config/prompts/agents/chat.md.
 */
export class ClaudeCliAdapter implements CopilotServiceAdapter {
  provider = 'anthropic';
  model = 'claude';

  get name() {
    return 'ClaudeCliAdapter';
  }

  private async loadPrompt(): Promise<string> {
    try {
      return await readFile(
        join(process.cwd(), 'agent-config/prompts/agents/chat.md'),
        'utf-8',
      );
    } catch {
      return FALLBACK_PROMPT;
    }
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

    // Extract user text from messages
    let userText = '';
    for (const msg of messages) {
      if (!msg.isTextMessage()) continue;
      const text = (msg as any).content ?? '';
      if (msg.role === 'user') userText = text;
    }

    const systemPrompt = await this.loadPrompt();
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userText}`;

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
            env: buildClaudeCliEnv(),
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
