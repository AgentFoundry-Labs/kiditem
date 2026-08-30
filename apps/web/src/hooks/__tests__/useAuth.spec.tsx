import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../useAuth';

const useAuthContextMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuthContext: () => useAuthContextMock(),
}));

describe('useAuth', () => {
  beforeEach(() => {
    useAuthContextMock.mockReset();
  });

  it('exposes the cookie-backed AuthProvider projection unchanged', () => {
    const auth = {
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'kiditem@example.com',
      },
      status: 'ready',
      error: null,
      isLoading: false,
      logout: vi.fn(),
    };
    useAuthContextMock.mockReturnValue(auth);

    const { result } = renderHook(() => useAuth());

    expect(result.current).toBe(auth);
  });
});
