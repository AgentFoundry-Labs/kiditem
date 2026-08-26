import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNewConversationDraft } from '../useNewConversationDraft';
import { useConversationSurfaceState } from '../conversation-surface-state';

describe('useNewConversationDraft', () => {
  beforeEach(() => {
    useConversationSurfaceState.getState().reset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reserves one opaque UUID when opening, keeps it through retry, and allocates a new one after close', () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('conversation-reserved-1')
      .mockReturnValueOnce('conversation-reserved-2');
    vi.stubGlobal('crypto', { randomUUID });
    const { result } = renderHook(() => useNewConversationDraft());

    act(() => result.current.openConversation({
      fixedAgentKey: 'sourcing',
      draft: '  Review the supplier evidence. ',
    }));

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(result.current.draft).toEqual({
      conversationId: 'conversation-reserved-1',
      agentKey: 'sourcing',
      provider: null,
      model: null,
      reasoningEffort: null,
      message: '  Review the supplier evidence. ',
    });

    act(() => result.current.updateDraft({ model: 'gpt-5.6' }));
    expect(result.current.draft?.conversationId).toBe('conversation-reserved-1');
    expect(randomUUID).toHaveBeenCalledTimes(1);

    act(() => result.current.discardDraft());
    act(() => result.current.openConversation({ fixedAgentKey: null }));
    expect(result.current.draft?.conversationId).toBe('conversation-reserved-2');
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it('fails explicitly when cryptographic UUID allocation is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const { result } = renderHook(() => useNewConversationDraft());

    expect(() => act(() => result.current.openConversation({ fixedAgentKey: null })))
      .toThrow('conversation_id_unavailable');
    expect(result.current.draft).toBeNull();
  });
});
