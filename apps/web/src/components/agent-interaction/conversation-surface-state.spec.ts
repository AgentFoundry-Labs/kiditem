import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentConversationKeys,
  openConversation,
  useConversationSurfaceState,
} from './conversation-surface-state';

describe('conversation surface state', () => {
  beforeEach(() => useConversationSurfaceState.getState().reset());
  afterEach(() => vi.unstubAllGlobals());

  it('uses General plus only the exact five fixed Agent keys and stores only a disposable reserved draft', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'conversation-reserved') });
    expect(agentConversationKeys).toEqual([
      'sourcing', 'merchandising', 'supply', 'channel_operations', 'advertising',
    ]);
    openConversation({ fixedAgentKey: null, draft: 'General question' });
    expect(useConversationSurfaceState.getState().selectedContext).toBeNull();
    expect(useConversationSurfaceState.getState().activeConversationId).toBe('conversation-reserved');
    expect(useConversationSurfaceState.getState().pendingDraft).toEqual({
      conversationId: 'conversation-reserved',
      agentKey: null,
      provider: null,
      model: null,
      reasoningEffort: null,
      message: 'General question',
    });
    expect(Object.keys(useConversationSurfaceState.getState()).sort()).toEqual([
      'activeConversationId',
      'discardDraft',
      'openConversation',
      'pendingDraft',
      'reset',
      'selectContext',
      'selectConversation',
      'selectedContext',
      'updateDraft',
    ]);
  });

  it('changes navigation context without mutating an existing conversation binding', () => {
    const existing = { id: 'conversation-1', agentKey: 'sourcing' as const };
    useConversationSurfaceState.getState().selectConversation(existing);
    useConversationSurfaceState.getState().selectContext('advertising');

    expect(existing.agentKey).toBe('sourcing');
    expect(useConversationSurfaceState.getState().selectedContext).toBe('advertising');
    expect(useConversationSurfaceState.getState().activeConversationId).toBeNull();
  });

  it('keeps a promoted reserved draft until explicit disposal, then gives the next draft a fresh opaque ID', () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('conversation-reserved-1')
      .mockReturnValueOnce('conversation-reserved-2');
    vi.stubGlobal('crypto', { randomUUID });
    openConversation({ fixedAgentKey: 'sourcing', draft: 'First message' });
    useConversationSurfaceState.getState().selectConversation({
      id: 'conversation-reserved-1', agentKey: 'sourcing',
    });

    expect(useConversationSurfaceState.getState().pendingDraft?.conversationId)
      .toBe('conversation-reserved-1');
    useConversationSurfaceState.getState().discardDraft();
    openConversation({ fixedAgentKey: null });

    expect(useConversationSurfaceState.getState().pendingDraft?.conversationId)
      .toBe('conversation-reserved-2');
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });
});
