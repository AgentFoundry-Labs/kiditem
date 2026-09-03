import { beforeEach, describe, expect, it } from 'vitest';
import {
  agentConversationKeys,
  openConversation,
  useConversationSurfaceState,
} from './conversation-surface-state';
import { useStore } from '@/store/useStore';

describe('conversation surface state', () => {
  beforeEach(() => {
    useConversationSurfaceState.getState().reset();
    useStore.setState({ activeRightSurface: null } as never);
  });

  it('uses General plus only the exact five fixed Agent keys and stores only a disposable draft key', () => {
    const draft = openConversation({ fixedAgentKey: null, draft: 'General question' });

    expect(agentConversationKeys).toEqual([
      'sourcing', 'merchandising', 'supply', 'channel_operations', 'advertising',
    ]);
    expect(draft.draftId).toMatch(/^draft-\d+$/);
    expect(useConversationSurfaceState.getState().selectedContext).toBeNull();
    expect(useConversationSurfaceState.getState().activeConversationId).toBeNull();
    expect(useConversationSurfaceState.getState().pendingDraft).toEqual({
      draftId: draft.draftId,
      agentKey: null,
      provider: null,
      model: null,
      reasoningEffort: null,
      message: 'General question',
    });
    expect(Object.keys(useConversationSurfaceState.getState()).sort()).toEqual([
      'activeConversationId',
      'closeSettings',
      'completePromotedDraft',
      'discardDraft',
      'ensureDraft',
      'openConversation',
      'openSettings',
      'pendingDraft',
      'promoteDraft',
      'reset',
      'selectContext',
      'selectConversation',
      'selectedContext',
      'settingsOpen',
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

  it('retains a promoted draft until explicit disposal and gives the next draft a fresh key', () => {
    const first = openConversation({ fixedAgentKey: 'sourcing', draft: 'First message' });
    useConversationSurfaceState.getState().promoteDraft(first.draftId, {
      id: 'server-conversation-1', agentKey: 'sourcing',
    });

    expect(useConversationSurfaceState.getState()).toMatchObject({
      activeConversationId: 'server-conversation-1',
      pendingDraft: { draftId: first.draftId },
    });
    useConversationSurfaceState.getState().discardDraft();
    const second = openConversation({ fixedAgentKey: null });

    expect(second.draftId).not.toBe(first.draftId);
  });

  it('completes only the matching promoted draft while retaining its server conversation', () => {
    const draft = openConversation({ fixedAgentKey: 'sourcing', draft: 'First message' });
    useConversationSurfaceState.getState().promoteDraft(draft.draftId, {
      id: 'server-conversation-1', agentKey: 'sourcing',
    });

    useConversationSurfaceState.getState().completePromotedDraft(draft.draftId);

    expect(useConversationSurfaceState.getState()).toMatchObject({
      activeConversationId: 'server-conversation-1',
      pendingDraft: null,
      selectedContext: 'sourcing',
    });
  });

  it('opens the exact draft context in the global AI chat surface', () => {
    openConversation({ fixedAgentKey: 'sourcing', draft: '소싱 질문' });

    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      draftId: expect.stringMatching(/^draft-\d+$/),
      agentKey: 'sourcing',
      message: '소싱 질문',
    });
    expect(useStore.getState().activeRightSurface).toBe('ai_chat');
  });

  it('keeps the AI chat surface selected when a new draft is started from the open panel', () => {
    useStore.setState({ activeRightSurface: 'ai_chat' } as never);

    openConversation({ fixedAgentKey: 'advertising' });

    expect(useConversationSurfaceState.getState().pendingDraft?.agentKey).toBe('advertising');
    expect(useStore.getState().activeRightSurface).toBe('ai_chat');
  });

  it('clears an unsent draft and its navigation coordinates through reset', () => {
    openConversation({ fixedAgentKey: 'sourcing', draft: 'Keep this private' });

    useConversationSurfaceState.getState().reset();

    expect(useConversationSurfaceState.getState()).toMatchObject({
      selectedContext: null,
      activeConversationId: null,
      pendingDraft: null,
      settingsOpen: false,
    });
  });

  it('stores only the disposable settings coordinate for the shared settings dialog', () => {
    const state = useConversationSurfaceState.getState() as {
      settingsOpen?: boolean;
      openSettings?: () => void;
      closeSettings?: () => void;
    };

    expect(state.openSettings).toEqual(expect.any(Function));
    expect(state.closeSettings).toEqual(expect.any(Function));
    state.openSettings?.();
    expect(useConversationSurfaceState.getState().settingsOpen).toBe(true);
    state.closeSettings?.();
    expect(useConversationSurfaceState.getState().settingsOpen).toBe(false);
  });
});
