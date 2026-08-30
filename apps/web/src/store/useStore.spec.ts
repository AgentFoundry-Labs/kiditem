import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './useStore';

type RightSurfaceStoreContract = {
  activeRightSurface?: 'notifications' | 'ai_chat' | null;
  selectRightSurface?: (surface: 'notifications' | 'ai_chat') => void;
  closeRightSurface?: () => void;
  resetRightSurface?: () => void;
};

describe('app right auxiliary surface state', () => {
  beforeEach(() => {
    const state = useStore.getState() as RightSurfaceStoreContract;
    state.closeRightSurface?.();
  });

  it('toggles the selected surface and atomically replaces a different surface', () => {
    const state = useStore.getState() as RightSurfaceStoreContract;

    expect(state.selectRightSurface).toEqual(expect.any(Function));
    expect(state.closeRightSurface).toEqual(expect.any(Function));

    state.selectRightSurface?.('notifications');
    expect(useStore.getState().activeRightSurface).toBe('notifications');

    state.selectRightSurface?.('ai_chat');
    expect(useStore.getState().activeRightSurface).toBe('ai_chat');

    state.selectRightSurface?.('ai_chat');
    expect(useStore.getState().activeRightSurface).toBeNull();

    state.selectRightSurface?.('notifications');
    state.closeRightSurface?.();
    expect(useStore.getState().activeRightSurface).toBeNull();
  });

  it('clears the right surface through its explicit reset action', () => {
    const state = useStore.getState() as RightSurfaceStoreContract;

    expect(state.resetRightSurface).toEqual(expect.any(Function));
    state.selectRightSurface?.('ai_chat');
    state.resetRightSurface?.();

    expect(useStore.getState().activeRightSurface).toBeNull();
  });
});
