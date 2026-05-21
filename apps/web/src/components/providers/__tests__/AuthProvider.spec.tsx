import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuthSession } from '../AuthProvider';

type AuthChangeHandler = (event: string, session: unknown) => void;

const getSessionMock = vi.hoisted(() => vi.fn());
const onAuthStateChangeMock = vi.hoisted(() => vi.fn());
const unsubscribeMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const consumeSignOutReasonMock = vi.hoisted(() => vi.fn());
const syncSourcingExtensionAuthMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  }),
}));

vi.mock('@/lib/supabase/refresh', () => ({
  consumeSignOutReason: () => consumeSignOutReasonMock(),
}));

vi.mock('@/lib/sourcing-extension-auth', () => ({
  syncSourcingExtensionAuth: (session: unknown) => syncSourcingExtensionAuthMock(session),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

function renderWithProvider(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}

function setPath(pathname: string, search = '') {
  Object.defineProperty(window, 'location', {
    value: { pathname, search, assign: vi.fn() },
    writable: true,
  });
}

describe('AuthProvider', () => {
  let lastHandler: AuthChangeHandler | null = null;

  beforeEach(() => {
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    unsubscribeMock.mockReset();
    replaceMock.mockReset();
    consumeSignOutReasonMock.mockReset();
    syncSourcingExtensionAuthMock.mockReset();

    getSessionMock.mockResolvedValue({ data: { session: null } });
    onAuthStateChangeMock.mockImplementation((handler: AuthChangeHandler) => {
      lastHandler = handler;
      return { data: { subscription: { unsubscribe: unsubscribeMock } } };
    });
    consumeSignOutReasonMock.mockReturnValue('manual');
    setPath('/dashboard');
  });

  afterEach(() => {
    lastHandler = null;
  });

  it('AP1: mount triggers getSession and updates context state', async () => {
    const session = { access_token: 'abc', user: { id: 'u1' } };
    getSessionMock.mockResolvedValue({ data: { session } });

    let observed: { session: unknown; isLoading: boolean } | null = null;
    function Probe() {
      observed = useAuthSession();
      return null;
    }
    renderWithProvider(<Probe />);

    await waitFor(() => {
      expect(observed?.session).toEqual(session);
      expect(observed?.isLoading).toBe(false);
    });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(syncSourcingExtensionAuthMock).toHaveBeenCalledWith(session);
  });

  it('AP2a: SIGNED_OUT + reason="session_expired" → queryClient.clear + replace(/login?reason=...)', async () => {
    consumeSignOutReasonMock.mockReturnValue('session_expired');
    setPath('/inventory', '?page=2');

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, 'clear');
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <div />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());
    await act(async () => {
      lastHandler?.('SIGNED_OUT', null);
    });

    expect(syncSourcingExtensionAuthMock).toHaveBeenCalledWith(null);
    expect(clearSpy).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith(
      `/login?reason=session_expired&next=${encodeURIComponent('/inventory?page=2')}`,
    );
  });

  it('AP2b: SIGNED_OUT + reason="manual" → replace(/login) without query', async () => {
    consumeSignOutReasonMock.mockReturnValue('manual');
    setPath('/inventory');

    renderWithProvider(<div />);
    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());

    await act(async () => {
      lastHandler?.('SIGNED_OUT', null);
    });

    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('AP2c: consecutive SIGNED_OUT events — second uses default "manual" after reset', async () => {
    // 첫번째 콜에서만 'session_expired', 그 다음부터 'manual' (실제 consumeSignOutReason 동작 흉내).
    consumeSignOutReasonMock
      .mockReturnValueOnce('session_expired')
      .mockReturnValue('manual');
    setPath('/inventory');

    renderWithProvider(<div />);
    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());

    await act(async () => {
      lastHandler?.('SIGNED_OUT', null);
    });
    expect(replaceMock).toHaveBeenLastCalledWith(
      `/login?reason=session_expired&next=${encodeURIComponent('/inventory')}`,
    );

    replaceMock.mockClear();
    await act(async () => {
      lastHandler?.('SIGNED_OUT', null);
    });
    expect(replaceMock).toHaveBeenLastCalledWith('/login');
  });

  it('AP3: TOKEN_REFRESHED only updates state, no router/cache side-effects', async () => {
    const newSession = { access_token: 'rotated', user: { id: 'u1' } };

    let observed: { session: unknown } | null = null;
    function Probe() {
      observed = useAuthSession();
      return null;
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(qc, 'clear');
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());

    await act(async () => {
      lastHandler?.('TOKEN_REFRESHED', newSession);
    });

    await waitFor(() => {
      expect(observed?.session).toEqual(newSession);
    });
    expect(syncSourcingExtensionAuthMock).toHaveBeenCalledWith(newSession);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('AP4: SIGNED_OUT on /login path skips redirect but still consumes reason', async () => {
    consumeSignOutReasonMock.mockReturnValue('session_expired');
    setPath('/login');

    renderWithProvider(<div />);
    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());

    await act(async () => {
      lastHandler?.('SIGNED_OUT', null);
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(consumeSignOutReasonMock).toHaveBeenCalledTimes(1);
  });

  it('AP5: useAuthSession outside provider returns default { session: null, isLoading: true }', async () => {
    let observed: { session: unknown; isLoading: boolean } | null = null;
    function Probe() {
      observed = useAuthSession();
      return null;
    }
    render(<Probe />);

    expect(observed).toEqual({ session: null, isLoading: true });
  });

  it('AP6: unmount unsubscribes from onAuthStateChange', async () => {
    const { unmount } = renderWithProvider(<div />);
    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});
