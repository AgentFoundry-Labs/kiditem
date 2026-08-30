import { describe, expect, it } from 'vitest';
import { bulkDeleteConversations } from '../conversation-bulk-delete';

const conversations = Array.from({ length: 5 }, (_, index) => ({
  id: `conversation-${index + 1}`,
  runtime: 'codex_cli' as const,
  agentKey: null,
  title: `Conversation ${index + 1}`,
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: `2026-08-26T00:0${index}:00.000Z`,
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('bulkDeleteConversations', () => {
  it('uses exactly three concurrent provider deletes at most and returns exact successful and failed rows', async () => {
    const pending = new Map<string, ReturnType<typeof deferred>>();
    let inFlight = 0;
    let peak = 0;
    const remove = async (conversationId: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const next = deferred();
      pending.set(conversationId, next);
      try {
        await next.promise;
      } finally {
        inFlight -= 1;
      }
    };

    const deleting = bulkDeleteConversations(conversations, remove);
    await Promise.resolve();
    expect(peak).toBe(3);
    expect([...pending.keys()]).toEqual(['conversation-1', 'conversation-2', 'conversation-3']);

    pending.get('conversation-1')?.resolve();
    pending.get('conversation-2')?.reject(new Error('provider unavailable'));
    pending.get('conversation-3')?.resolve();
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    expect(pending.get('conversation-4')).toBeDefined();
    expect(pending.get('conversation-5')).toBeDefined();
    pending.get('conversation-4')?.resolve();
    pending.get('conversation-5')?.resolve();

    await expect(deleting).resolves.toEqual({
      succeededIds: ['conversation-1', 'conversation-3', 'conversation-4', 'conversation-5'],
      failed: [{ conversationId: 'conversation-2', message: '대화를 삭제할 수 없습니다.' }],
    });
    expect(peak).toBe(3);
  });
});
