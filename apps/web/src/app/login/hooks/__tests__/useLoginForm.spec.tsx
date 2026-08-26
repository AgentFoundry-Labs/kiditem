import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ME_QUERY_KEY } from '@/lib/auth/browser-auth';

const toastInfoMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const publishAuthChangedMock = vi.hoisted(() => vi.fn());
const searchParamsValue = vi.hoisted(() => ({
  current: new URLSearchParams() as URLSearchParams,
}));

const LOGIN_RESPONSE = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'kiditem@example.com',
    name: 'KidItem',
    role: 'admin',
    type: 'human',
    organizationId: '22222222-2222-4222-8222-222222222222',
    membershipId: '33333333-3333-4333-8333-333333333333',
  },
};

vi.mock('sonner', () => ({
  toast: { info: toastInfoMock, success: toastSuccessMock, error: toastErrorMock },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => searchParamsValue.current,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => apiPostMock(...args) },
}));

vi.mock('@/lib/auth/browser-auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auth/browser-auth')>(),
  publishAuthChanged: (...args: unknown[]) => publishAuthChangedMock(...args),
}));

vi.mock('@/lib/auth-redirect', () => ({
  sanitizeInternalRedirectPath: (path: string | null) => path ?? '/',
}));

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useLoginForm', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    apiPostMock.mockReset();
    apiPostMock.mockResolvedValue(LOGIN_RESPONSE);
    publishAuthChangedMock.mockReset();
    window.localStorage.clear();
  });

  it('shows the absolute-expiry message only for session_expired redirects', async () => {
    searchParamsValue.current = new URLSearchParams('reason=session_expired');
    const { useLoginForm } = await import('../useLoginForm');
    renderHook(() => useLoginForm(), { wrapper: wrapper(queryClient) });

    expect(toastInfoMock).toHaveBeenCalledWith(
      '세션이 만료되어 다시 로그인이 필요합니다.',
      { duration: 5000 },
    );
  });

  it('posts credentials, projects the cookie session through /auth/me data, and navigates', async () => {
    searchParamsValue.current = new URLSearchParams('next=/dashboard');
    const { useLoginForm } = await import('../useLoginForm');
    const { result } = renderHook(() => useLoginForm(), {
      wrapper: wrapper(queryClient),
    });

    act(() => {
      result.current.setEmail('kiditem@example.com');
      result.current.setPassword('correct password');
    });
    await act(async () => {
      await result.current.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/login', {
      email: 'kiditem@example.com',
      password: 'correct password',
    });
    expect(queryClient.getQueryData(AUTH_ME_QUERY_KEY)).toEqual(LOGIN_RESPONSE.user);
    expect(window.localStorage.getItem('kiditem.auth.session.v1')).toBeNull();
    expect(publishAuthChangedMock).toHaveBeenCalledWith('login');
    expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(toastSuccessMock).toHaveBeenCalledWith('로그인 성공');
  });

  it('revokes a newly issued cookie when the user has no organization', async () => {
    searchParamsValue.current = new URLSearchParams('next=/dashboard');
    apiPostMock
      .mockResolvedValueOnce({
        user: { ...LOGIN_RESPONSE.user, organizationId: null, membershipId: null },
      })
      .mockResolvedValueOnce({});
    const { useLoginForm } = await import('../useLoginForm');
    const { result } = renderHook(() => useLoginForm(), {
      wrapper: wrapper(queryClient),
    });

    await act(async () => {
      await result.current.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(apiPostMock).toHaveBeenNthCalledWith(2, '/api/auth/logout');
    expect(queryClient.getQueryData(AUTH_ME_QUERY_KEY)).toBeUndefined();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      '조직에 속해있지 않습니다. 관리자에게 문의해주세요.',
    );
  });
});
