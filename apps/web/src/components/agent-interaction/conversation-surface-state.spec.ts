import { beforeEach, describe, expect, it } from 'vitest';
import {
  agentConversationKeys,
  openConversation,
  useConversationSurfaceState,
} from './conversation-surface-state';

describe('conversation surface state', () => {
  beforeEach(() => useConversationSurfaceState.getState().reset());

  it('uses General plus only the exact five fixed Agent keys', () => {
    expect(agentConversationKeys).toEqual([
      'sourcing', 'merchandising', 'supply', 'channel_operations', 'advertising',
    ]);
    openConversation({ fixedAgentKey: null, draft: 'General question' });
    expect(useConversationSurfaceState.getState().selectedContext).toBeNull();
    expect(useConversationSurfaceState.getState().pendingOpen).toMatchObject({ draft: 'General question' });
  });

  it('changes navigation context without mutating an existing conversation binding', () => {
    const existing = { id: 'conversation-1', agentKey: 'sourcing' as const };
    useConversationSurfaceState.getState().selectConversation(existing);
    useConversationSurfaceState.getState().selectContext('advertising');

    expect(existing.agentKey).toBe('sourcing');
    expect(useConversationSurfaceState.getState().selectedContext).toBe('advertising');
    expect(useConversationSurfaceState.getState().activeConversationId).toBeNull();
  });
});
