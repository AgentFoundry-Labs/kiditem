import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      'closeSettings',
      'completePromotedDraft',
      'discardDraft',
      'ensureDraft',
      'openConversation',
      'openSettings',
      'pendingDraft',
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

  it('completes only the matching promoted draft while retaining its selected conversation', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'conversation-promoted') });
    openConversation({ fixedAgentKey: 'sourcing', draft: 'First message' });
    useConversationSurfaceState.getState().selectConversation({
      id: 'conversation-promoted', agentKey: 'sourcing',
    });

    useConversationSurfaceState.getState().completePromotedDraft('conversation-promoted');

    expect(useConversationSurfaceState.getState()).toMatchObject({
      activeConversationId: 'conversation-promoted',
      pendingDraft: null,
      selectedContext: 'sourcing',
    });
  });

  it('opens the exact draft context in the global AI chat surface', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'conversation-sourcing') });

    openConversation({ fixedAgentKey: 'sourcing', draft: '소싱 질문' });

    expect(useConversationSurfaceState.getState().pendingDraft).toMatchObject({
      conversationId: 'conversation-sourcing',
      agentKey: 'sourcing',
      message: '소싱 질문',
    });
    expect(useStore.getState().activeRightSurface).toBe('ai_chat');
  });

  it('keeps the AI chat surface selected when a new draft is started from the open panel', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'conversation-advertising') });
    useStore.setState({ activeRightSurface: 'ai_chat' } as never);

    openConversation({ fixedAgentKey: 'advertising' });

    expect(useConversationSurfaceState.getState().pendingDraft?.agentKey).toBe('advertising');
    expect(useStore.getState().activeRightSurface).toBe('ai_chat');
  });

  it('clears an unsent draft and its navigation coordinates through reset', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'conversation-private-draft') });
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
