import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiGetMock = vi.hoisted(() => vi.fn());
const useAuthSessionMock = vi.hoisted(() => vi.fn());
const triggerSignOutMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: apiGetMock },
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuthSession: () => useAuthSessionMock(),
}));

vi.mock('@/lib/supabase/refresh', () => ({
  triggerSignOut: (...args: unknown[]) => triggerSignOutMock(...args),
}));

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useAuth', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    useAuthSessionMock.mockReset();
    triggerSignOutMock.mockReset();
    triggerSignOutMock.mockResolvedValue(undefined);
  });

  it('UA2: query is disabled when session is null', async () => {
    useAuthSessionMock.mockReturnValue({ session: null, isLoading: false });
    apiGetMock.mockResolvedValue({ id: 'u1' });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { useAuth } = await import('../useAuth');

    renderHook(() => useAuth(), { wrapper: wrapper(qc) });

    // give microtasks a chance
    await new Promise((r) => setTimeout(r, 5));
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it('UA3: query runs when session present, returns user', async () => {
    useAuthSessionMock.mockReturnValue({
      session: { access_token: 'a', user: { id: 'u1' } },
      isLoading: false,
    });
    apiGetMock.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      type: 'human',
      organizationId: 'org-1',
      membershipId: 'm-1',
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { useAuth } = await import('../useAuth');

    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(qc) });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });
    expect(result.current.user?.email).toBe('a@b.com');
    expect(apiGetMock).toHaveBeenCalledWith('/api/auth/me');
  });

  it('UA1: logout calls triggerSignOut("manual") and clears cached user query', async () => {
    useAuthSessionMock.mockReturnValue({
      session: { access_token: 'a', user: { id: 'u1' } },
      isLoading: false,
    });
    apiGetMock.mockResolvedValue({ id: 'u1' });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const removeQueriesSpy = vi.spyOn(qc, 'removeQueries');
    const { useAuth } = await import('../useAuth');

    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(qc) });

    await result.current.logout();

    expect(triggerSignOutMock).toHaveBeenCalledWith('manual');
    expect(removeQueriesSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
  });

  it('isLoading: true while session is initial-loading', async () => {
    useAuthSessionMock.mockReturnValue({ session: null, isLoading: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { useAuth } = await import('../useAuth');

    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(qc) });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
  });
});
