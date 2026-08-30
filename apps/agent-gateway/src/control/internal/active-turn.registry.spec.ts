import { describe, expect, it } from 'vitest';

describe('ActiveTurnRegistry', () => {
  it('admits exactly four parent turns across providers and rejects the fifth without a queue', () => {
    return import('./active-turn.registry').then(({ ActiveTurnCapacityError, ActiveTurnRegistry }) => {
    const registry = new ActiveTurnRegistry();
    for (const index of [1, 2, 3, 4]) registry.admit({ conversationId: `conversation-${index}`, turnId: `turn-${index}` });

    expect(registry.size).toBe(4);
    expect(() => registry.admit({ conversationId: 'conversation-5', turnId: 'turn-5' }))
      .toThrow(ActiveTurnCapacityError);
    expect(registry.size).toBe(4);
    });
  });

  it('requires the exact conversation and turn pair for live input or interrupt', () => {
    return import('./active-turn.registry').then(({ ActiveTurnNotFoundError, ActiveTurnRegistry }) => {
    const registry = new ActiveTurnRegistry();
    registry.admit({ conversationId: 'conversation-1', turnId: 'turn-1' });

    expect(registry.require({ conversationId: 'conversation-1', turnId: 'turn-1' }))
      .toEqual({ conversationId: 'conversation-1', turnId: 'turn-1' });
    expect(() => registry.require({ conversationId: 'conversation-1', turnId: 'turn-2' }))
      .toThrow(ActiveTurnNotFoundError);
    expect(() => registry.require({ conversationId: 'conversation-2', turnId: 'turn-1' }))
      .toThrow(ActiveTurnNotFoundError);
    });
  });

  it('allows only one live turn per provider conversation and reports duplicate admission accurately', () => {
    return import('./active-turn.registry').then(({
      ActiveTurnAlreadyLiveError,
      ActiveTurnRegistry,
    }) => {
      const registry = new ActiveTurnRegistry();
      registry.admit({ conversationId: 'conversation-1', turnId: 'turn-1' });

      expect(() => registry.admit({ conversationId: 'conversation-1', turnId: 'turn-1' }))
        .toThrow(ActiveTurnAlreadyLiveError);
      expect(() => registry.admit({ conversationId: 'conversation-1', turnId: 'turn-2' }))
        .toThrow(ActiveTurnAlreadyLiveError);
      expect(registry.size).toBe(1);
    });
  });

  it('reports whether any exact conversation currently owns a live turn', () => {
    return import('./active-turn.registry').then(({ ActiveTurnRegistry }) => {
      const registry = new ActiveTurnRegistry();
      registry.admit({ conversationId: 'conversation-1', turnId: 'turn-1' });

      expect(registry.hasConversation('conversation-1')).toBe(true);
      expect(registry.hasConversation('conversation-2')).toBe(false);
      registry.release({ conversationId: 'conversation-1', turnId: 'turn-1' });
      expect(registry.hasConversation('conversation-1')).toBe(false);
    });
  });

  it('releases terminal turns once and clears all transient slots on a Gateway disconnect', () => {
    return import('./active-turn.registry').then(({ ActiveTurnRegistry }) => {
    const registry = new ActiveTurnRegistry();
    registry.admit({ conversationId: 'conversation-1', turnId: 'turn-1' });
    registry.admit({ conversationId: 'conversation-2', turnId: 'turn-2' });

    expect(registry.release({ conversationId: 'conversation-1', turnId: 'turn-1' })).toBe(true);
    expect(registry.release({ conversationId: 'conversation-1', turnId: 'turn-1' })).toBe(false);
    expect(registry.clear()).toEqual([{ conversationId: 'conversation-2', turnId: 'turn-2' }]);
    expect(registry.size).toBe(0);
    });
  });
});
