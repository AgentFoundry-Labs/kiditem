import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuthSession } from '../AuthProvider';

const getAuthSessionMock = vi.hoisted(() => vi.fn());
const subscribeAuthSessionMock = vi.hoisted(() => vi.fn());
const clearAuthSessionMock = vi.hoisted(() => vi.fn());
const syncExtensionAuthMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const browserCollectionEnabledMock = vi.hoisted(() => vi.fn());
const sellpiaSyncMountedMock = vi.hoisted(() => vi.fn());

type SessionListener = (session: Session | null, reason: 'manual' | 'session_expired' | null) => void;
type Session = { token: string; expiresAt: string };

const SESSION: Session = {
  token: 'a'.repeat(43),
  expiresAt: '2026-08-29T03:00:00.000Z',
};

let sessionListener: SessionListener | null = null;
const unsubscribeMock = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getAuthSession: () => getAuthSessionMock(),
  subscribeAuthSession: (listener: SessionListener) => subscribeAuthSessionMock(listener),
  clearAuthSession: (...args: unknown[]) => clearAuthSessionMock(...args),
}));

vi.mock('@/lib/extension-auth', () => ({
  EXTENSION_AUTH_REQUIRED_EVENT: 'kiditem:extension-auth-required',
  syncExtensionAuth: (...args: unknown[]) => syncExtensionAuthMock(...args),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => apiGetMock(...args) },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('../BrowserCollectionProvider', () => ({
  BrowserCollectionProvider: ({ children, enabled }: { children: React.ReactNode; enabled: boolean }) => {
    browserCollectionEnabledMock(enabled);
    return children;
  },
}));

vi.mock('../SellpiaInventorySyncProvider', () => ({
  SellpiaInventorySyncProvider: ({ children }: { children: React.ReactNode }) => {
    sellpiaSyncMountedMock();
    return children;
  },
}));

function renderWithProvider(ui: React.ReactNode, queryClient = new QueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{ui}</AuthProvider>
      </QueryClientProvider>,
    ),
  };
}

function setPath(pathname: string, search = '') {
  Object.defineProperty(window, 'location', {
    value: { pathname, search },
    configurable: true,
  });
}

describe('AuthProvider local sessions', () => {
  beforeEach(() => {
    getAuthSessionMock.mockReset();
    getAuthSessionMock.mockReturnValue(SESSION);
    subscribeAuthSessionMock.mockReset();
    subscribeAuthSessionMock.mockImplementation((listener: SessionListener) => {
      sessionListener = listener;
      return unsubscribeMock;
    });
    unsubscribeMock.mockReset();
    clearAuthSessionMock.mockReset();
    syncExtensionAuthMock.mockReset();
    syncExtensionAuthMock.mockResolvedValue({});
    apiGetMock.mockReset();
    apiGetMock.mockResolvedValue({ id: 'user-id' });
    replaceMock.mockReset();
    browserCollectionEnabledMock.mockReset();
    sellpiaSyncMountedMock.mockReset();
    setPath('/dashboard');
  });

  afterEach(() => {
    sessionListener = null;
    vi.useRealTimers();
  });

  it('loads the stored session, enables authenticated providers, and syncs extensions', async () => {
    let observed: ReturnType<typeof useAuthSession> | null = null;
    function Probe() {
      observed = useAuthSession();
      return null;
    }
    renderWithProvider(<Probe />);

    await waitFor(() => expect(observed).toEqual({ session: SESSION, isLoading: false }));
    expect(syncExtensionAuthMock).toHaveBeenCalledWith(SESSION);
    expect(browserCollectionEnabledMock).toHaveBeenLastCalledWith(true);
  });

  it('handles an expired session event with cache clear and a return-path redirect', async () => {
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');
    setPath('/inventory', '?page=2');
    renderWithProvider(<div />, queryClient);
    await waitFor(() => expect(sessionListener).not.toBeNull());

    act(() => sessionListener?.(null, 'session_expired'));

    expect(clearSpy).toHaveBeenCalled();
    await waitFor(() => expect(syncExtensionAuthMock).toHaveBeenCalledWith(null));
    expect(replaceMock).toHaveBeenCalledWith(
      `/login?reason=session_expired&next=${encodeURIComponent('/inventory?page=2')}`,
    );
  });

  it('redirects a manual/cross-tab sign-out cleanly', async () => {
    renderWithProvider(<div />);
    await waitFor(() => expect(sessionListener).not.toBeNull());

    act(() => sessionListener?.(null, 'manual'));

    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('validates and resyncs the current token when an extension reports 401', async () => {
    renderWithProvider(<div />);
    await waitFor(() => expect(sessionListener).not.toBeNull());
    syncExtensionAuthMock.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('kiditem:extension-auth-required'));
    });

    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith('/api/auth/me'));
    expect(syncExtensionAuthMock).toHaveBeenCalledWith(SESSION);
  });

  it('clears the session at its absolute expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T03:00:00.000Z'));
    getAuthSessionMock.mockReturnValue({
      ...SESSION,
      expiresAt: '2026-07-30T03:00:01.000Z',
    });
    renderWithProvider(<div />);
    await act(async () => vi.advanceTimersByTime(1_000));

    expect(clearAuthSessionMock).toHaveBeenCalledWith('session_expired');
  });

  it('unsubscribes local and storage listeners on unmount', async () => {
    const { unmount } = renderWithProvider(<div />);
    await waitFor(() => expect(sessionListener).not.toBeNull());
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledOnce();
  });
});
