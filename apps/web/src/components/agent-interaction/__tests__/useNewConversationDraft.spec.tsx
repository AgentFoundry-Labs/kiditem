import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNewConversationDraft } from '../useNewConversationDraft';
import { useConversationSurfaceState } from '../conversation-surface-state';

describe('useNewConversationDraft', () => {
  beforeEach(() => {
    useConversationSurfaceState.getState().reset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps one browser-only draft key through retry and allocates a new one after close', () => {
    const { result } = renderHook(() => useNewConversationDraft());

    act(() => result.current.openConversation({
      fixedAgentKey: 'sourcing',
      draft: '  Review the supplier evidence. ',
    }));

    const firstDraftId = result.current.draft?.draftId;
    expect(firstDraftId).toMatch(/^draft-\d+$/);
    expect(result.current.draft).toMatchObject({
      agentKey: 'sourcing',
      provider: null,
      model: null,
      reasoningEffort: null,
      message: '  Review the supplier evidence. ',
    });

    act(() => result.current.updateDraft({ model: 'gpt-5.6' }));
    expect(result.current.draft?.draftId).toBe(firstDraftId);

    act(() => result.current.discardDraft());
    act(() => result.current.openConversation({ fixedAgentKey: null }));
    expect(result.current.draft?.draftId).toMatch(/^draft-\d+$/);
    expect(result.current.draft?.draftId).not.toBe(firstDraftId);
  });

  it('does not require browser cryptographic APIs before the server assigns a conversation ID', () => {
    vi.stubGlobal('crypto', undefined);
    const { result } = renderHook(() => useNewConversationDraft());

    expect(() => act(() => result.current.openConversation({ fixedAgentKey: null })))
      .not.toThrow();
    expect(result.current.draft?.draftId).toMatch(/^draft-\d+$/);
    expect(result.current.draft).not.toHaveProperty('conversationId');
  });
});
