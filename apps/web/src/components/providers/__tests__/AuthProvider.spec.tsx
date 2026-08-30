import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuthContext } from '../AuthProvider';

const apiGetMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const clearExtensionAuthMock = vi.hoisted(() => vi.fn());
const syncExtensionAuthMock = vi.hoisted(() => vi.fn());
const purgePersistedBrowserCredentialMock = vi.hoisted(() => vi.fn());
const publishAuthChangedMock = vi.hoisted(() => vi.fn());
const subscribeAuthChangedMock = vi.hoisted(() => vi.fn());
const browserCollectionEnabledMock = vi.hoisted(() => vi.fn());

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'kiditem@example.com',
  name: 'KidItem',
  role: 'owner',
  type: 'human',
  organizationId: '22222222-2222-4222-8222-222222222222',
  membershipId: '33333333-3333-4333-8333-333333333333',
};

let authChangedListener: ((reason: 'login' | 'logout') => void) | null = null;
const unsubscribeMock = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: (...args: unknown[]) => apiPostMock(...args),
  },
}));

vi.mock('@/lib/auth/browser-auth', () => ({
  AUTH_ME_QUERY_KEY: ['auth', 'me'],
  AUTH_REQUIRED_EVENT: 'kiditem:auth-required',
  publishAuthChanged: (...args: unknown[]) => publishAuthChangedMock(...args),
  purgePersistedBrowserCredential: () => purgePersistedBrowserCredentialMock(),
  subscribeAuthChanged: (listener: (reason: 'login' | 'logout') => void) => {
    authChangedListener = listener;
    subscribeAuthChangedMock(listener);
    return unsubscribeMock;
  },
}));

vi.mock('@/lib/extension-auth', () => ({
  EXTENSION_AUTH_REQUIRED_EVENT: 'kiditem:extension-auth-required',
  clearExtensionAuth: (...args: unknown[]) => clearExtensionAuthMock(...args),
  syncExtensionAuth: (...args: unknown[]) => syncExtensionAuthMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('../BrowserCollectionProvider', () => ({
  BrowserCollectionProvider: ({ children, enabled }: {
    children: React.ReactNode;
    enabled: boolean;
  }) => {
    browserCollectionEnabledMock(enabled);
    return children;
  },
}));

vi.mock('../SellpiaInventorySyncProvider', () => ({
  SellpiaInventorySyncProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithProvider(ui: React.ReactNode, queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
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

describe('AuthProvider cookie sessions', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiGetMock.mockResolvedValue(USER);
    apiPostMock.mockReset();
    apiPostMock.mockResolvedValue({});
    replaceMock.mockReset();
    clearExtensionAuthMock.mockReset();
    clearExtensionAuthMock.mockResolvedValue({});
    syncExtensionAuthMock.mockReset();
    syncExtensionAuthMock.mockResolvedValue({});
    purgePersistedBrowserCredentialMock.mockReset();
    publishAuthChangedMock.mockReset();
    subscribeAuthChangedMock.mockReset();
    browserCollectionEnabledMock.mockReset();
    unsubscribeMock.mockReset();
    authChangedListener = null;
    setPath('/dashboard');
  });

  it('derives ready state from /auth/me and never syncs extensions on mount', async () => {
    let observed: ReturnType<typeof useAuthContext> | null = null;
    function Probe() {
      observed = useAuthContext();
      return null;
    }
    renderWithProvider(<Probe />);

    await waitFor(() => expect(observed?.status).toBe('ready'));
    expect(observed?.user).toEqual(USER);
    expect(apiGetMock).toHaveBeenCalledWith('/api/auth/me', {
      suppressNetworkErrorLog: true,
    });
    expect(browserCollectionEnabledMock).toHaveBeenLastCalledWith(true);
    expect(purgePersistedBrowserCredentialMock).toHaveBeenCalled();
    expect(syncExtensionAuthMock).not.toHaveBeenCalled();
  });

  it('clears projections and redirects when an API reports auth_required', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clearSpy = vi.spyOn(queryClient, 'clear');
    setPath('/inventory', '?page=2');
    renderWithProvider(<div />, queryClient);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

    act(() => window.dispatchEvent(new Event('kiditem:auth-required')));

    expect(clearSpy).toHaveBeenCalled();
    expect(clearExtensionAuthMock).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith(
      `/login?reason=session_expired&next=${encodeURIComponent('/inventory?page=2')}`,
    );
  });

  it('performs the explicit extension handoff only after an extension request', async () => {
    renderWithProvider(<div />);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(new Event('kiditem:extension-auth-required'));
    });

    await waitFor(() => expect(syncExtensionAuthMock).toHaveBeenCalledOnce());
  });

  it('revalidates the cookie on cross-tab auth changes', async () => {
    renderWithProvider(<div />);
    await waitFor(() => expect(authChangedListener).not.toBeNull());
    apiGetMock.mockClear();

    act(() => authChangedListener?.('login'));

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
  });

  it('logs out the cookie session and clears extension auth', async () => {
    let observed: ReturnType<typeof useAuthContext> | null = null;
    function Probe() {
      observed = useAuthContext();
      return null;
    }
    renderWithProvider(<Probe />);
    await waitFor(() => expect(observed?.status).toBe('ready'));

    await act(async () => observed?.logout());

    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/logout');
    expect(clearExtensionAuthMock).toHaveBeenCalled();
    expect(publishAuthChangedMock).toHaveBeenCalledWith('logout');
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('unsubscribes cross-tab listeners on unmount', async () => {
    const { unmount } = renderWithProvider(<div />);
    await waitFor(() => expect(authChangedListener).not.toBeNull());
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledOnce();
  });
});
