import { describe, expect, it, vi } from 'vitest';
import { ConversationFirstSendCoordinator } from '../conversation-first-send.coordinator';
import { conversationTitleFromMessage } from '../conversation-title';

const SUMMARY = {
  id: 'server-conversation-1',
  runtime: 'codex_cli' as const,
  agentKey: 'sourcing' as const,
  title: 'Review the supplier evidence',
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z',
};

const FIRST_SEND = {
  draftId: 'draft-1',
  runtime: SUMMARY.runtime,
  agentKey: SUMMARY.agentKey,
  title: SUMMARY.title,
  message: 'Review the supplier evidence',
  model: 'gpt-5.6',
  reasoningEffort: 'xhigh',
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function coordinator(overrides: Partial<ConstructorParameters<typeof ConversationFirstSendCoordinator>[0]> = {}) {
  const dependencies = {
    createConversation: vi.fn().mockResolvedValue(SUMMARY),
    cacheSummary: vi.fn(),
    promoteDraft: vi.fn(),
    handoff: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return {
    ...dependencies,
    coordinator: new ConversationFirstSendCoordinator(dependencies),
  };
}

describe('conversationTitleFromMessage', () => {
  it('normalizes whitespace by Unicode code point and reserves the ellipsis inside 48 characters', () => {
    expect(conversationTitleFromMessage(' \n Review\t  the\r\n supplier   evidence  '))
      .toBe('Review the supplier evidence');
    expect(conversationTitleFromMessage('😀'.repeat(48))).toHaveLength(96);
    expect(Array.from(conversationTitleFromMessage('😀'.repeat(49)))).toEqual([
      ...Array.from('😀'.repeat(47)),
      '…',
    ]);
    expect(() => conversationTitleFromMessage(' \n\t ')).toThrow('conversation_title_required');
  });
});

describe('ConversationFirstSendCoordinator', () => {
  it('lets the server assign the durable ID before promoting and handing off', async () => {
    const runtime = coordinator();

    await runtime.coordinator.send(FIRST_SEND);

    expect(runtime.createConversation).toHaveBeenCalledWith({
      runtime: 'codex_cli',
      agentKey: 'sourcing',
      title: 'Review the supplier evidence',
    });
    expect(runtime.cacheSummary).toHaveBeenCalledWith(SUMMARY);
    expect(runtime.promoteDraft).toHaveBeenCalledWith('draft-1', SUMMARY);
    expect(runtime.handoff).toHaveBeenCalledWith({
      ...FIRST_SEND,
      conversationId: 'server-conversation-1',
    });
  });

  it('shares one create and one already-mounted runtime handoff for concurrent identical sends', async () => {
    const create = deferred<typeof SUMMARY>();
    const runtime = coordinator({ createConversation: vi.fn().mockReturnValue(create.promise) });

    const first = runtime.coordinator.send(FIRST_SEND);
    const second = runtime.coordinator.send({ ...FIRST_SEND });

    expect(first).toBe(second);
    await Promise.resolve();
    expect(runtime.createConversation).toHaveBeenCalledTimes(1);
    expect(runtime.handoff).not.toHaveBeenCalled();

    create.resolve(SUMMARY);
    await first;
    expect(runtime.handoff).toHaveBeenCalledTimes(1);
  });

  it('clears only a failed create attempt so the same draft can retry', async () => {
    const createConversation = vi.fn()
      .mockRejectedValueOnce(new Error('gateway unavailable'))
      .mockResolvedValueOnce(SUMMARY);
    const runtime = coordinator({ createConversation });

    await expect(runtime.coordinator.send(FIRST_SEND)).rejects.toThrow('gateway unavailable');
    await runtime.coordinator.send(FIRST_SEND);

    expect(createConversation).toHaveBeenCalledTimes(2);
    expect(createConversation.mock.calls[0]?.[0]).toEqual(createConversation.mock.calls[1]?.[0]);
  });

  it('does not promote or hand off a draft disposed while its create is pending', async () => {
    const create = deferred<typeof SUMMARY>();
    const runtime = coordinator({ createConversation: vi.fn().mockReturnValue(create.promise) });
    const first = runtime.coordinator.send(FIRST_SEND);

    await Promise.resolve();
    runtime.coordinator.dispose(FIRST_SEND.draftId);
    create.resolve(SUMMARY);
    await first;

    expect(runtime.cacheSummary).toHaveBeenCalledWith(SUMMARY);
    expect(runtime.promoteDraft).not.toHaveBeenCalled();
    expect(runtime.handoff).not.toHaveBeenCalled();
  });

  it.each([
    ['runtime', { runtime: 'claude_cli' as const }],
    ['Agent', { agentKey: null }],
    ['derived title', { title: 'A different deterministic title' }],
    ['message', { message: 'A different message' }],
    ['model', { model: 'claude-opus' }],
    ['reasoning effort', { reasoningEffort: 'low' }],
  ])('rejects %s drift locally while the first send is in flight', async (_label, drift) => {
    const create = deferred<typeof SUMMARY>();
    const runtime = coordinator({ createConversation: vi.fn().mockReturnValue(create.promise) });
    const first = runtime.coordinator.send(FIRST_SEND);

    await expect(runtime.coordinator.send({ ...FIRST_SEND, ...drift })).rejects
      .toThrow('conversation_first_send_conflict');
    await Promise.resolve();
    expect(runtime.createConversation).toHaveBeenCalledTimes(1);
    expect(runtime.handoff).not.toHaveBeenCalled();

    create.resolve(SUMMARY);
    await first;
  });

  it('retains a consumed handoff after terminal failure until its draft is explicitly disposed', async () => {
    const handoff = vi.fn()
      .mockRejectedValueOnce(new Error('run ended'))
      .mockResolvedValueOnce(undefined);
    const runtime = coordinator({ handoff });
    const first = runtime.coordinator.send(FIRST_SEND);

    await expect(first).rejects.toThrow('run ended');
    const repeated = runtime.coordinator.send(FIRST_SEND);
    expect(repeated).toBe(first);
    await expect(repeated).rejects.toThrow('run ended');
    expect(runtime.createConversation).toHaveBeenCalledTimes(1);
    expect(handoff).toHaveBeenCalledTimes(1);

    runtime.coordinator.dispose(FIRST_SEND.draftId);
    await runtime.coordinator.send(FIRST_SEND);
    expect(runtime.createConversation).toHaveBeenCalledTimes(2);
  });
});
