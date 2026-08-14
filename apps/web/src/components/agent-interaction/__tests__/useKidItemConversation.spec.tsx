import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetInteractionStore, useInteractionStore } from '../interaction-store';
import { useKidItemConversation } from '../useKidItemConversation';
import { bootstrap, existingSession } from './test-fixtures';

describe('useKidItemConversation', () => {
  beforeEach(() => {
    resetInteractionStore();
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333');
  });

  it('chooses the single declared default without writing control state', () => {
    const { result } = renderHook(() => useKidItemConversation(bootstrap));
    expect(result.current.agentId).toBe('operator');
    expect(bootstrap.agents.filter((agent) => agent.isDefault)).toHaveLength(1);
    expect(result.current.session).toBeNull();
  });

  it('allows pre-submit agent choice, then locks it after first send', () => {
    const { result } = renderHook(() => useKidItemConversation(bootstrap));

    act(() => result.current.selectAgent('analyst'));
    expect(result.current.agentId).toBe('analyst');

    act(() => result.current.markSubmitted());
    act(() => result.current.selectAgent('operator'));
    expect(result.current.agentId).toBe('analyst');
    expect(result.current.agentLocked).toBe(true);
  });

  it('reconnects an existing session by its canonical agent and thread', () => {
    const { result } = renderHook(() => useKidItemConversation(bootstrap));

    act(() => result.current.selectSession(existingSession.name));

    expect(result.current.session).toEqual(existingSession);
    expect(result.current.agentId).toBe('operator');
    expect(result.current.threadId).toBe(existingSession.copilotThreadId);
    expect(result.current.agentLocked).toBe(true);
  });

  it('creates only a local external thread for each new empty conversation', () => {
    const { result } = renderHook(() => useKidItemConversation(bootstrap));

    act(() => result.current.startNewConversation());
    expect(result.current.threadId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.current.session).toBeNull();

    act(() => result.current.startNewConversation());
    expect(result.current.threadId).toBe('33333333-3333-4333-8333-333333333333');
    expect(useInteractionStore.getState()).not.toHaveProperty('messages');
    expect(useInteractionStore.getState()).not.toHaveProperty('events');
    expect(useInteractionStore.getState()).not.toHaveProperty('replay');
  });
});
