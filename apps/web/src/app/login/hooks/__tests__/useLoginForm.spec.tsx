import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastInfoMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const apiPostMock = vi.hoisted(() => vi.fn());
const setAuthSessionMock = vi.hoisted(() => vi.fn());
const clearAuthSessionMock = vi.hoisted(() => vi.fn());
const searchParamsValue = vi.hoisted(() => ({
  current: new URLSearchParams() as URLSearchParams,
}));

const LOGIN_RESPONSE = {
  session: { token: 'a'.repeat(43), expiresAt: '2026-08-29T03:00:00.000Z' },
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

vi.mock('@/lib/auth/session', () => ({
  setAuthSession: (...args: unknown[]) => setAuthSessionMock(...args),
  clearAuthSession: (...args: unknown[]) => clearAuthSessionMock(...args),
}));

vi.mock('@/lib/auth-redirect', () => ({
  sanitizeInternalRedirectPath: (path: string | null) => path ?? '/',
}));

describe('useLoginForm', () => {
  beforeEach(() => {
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    apiPostMock.mockReset();
    apiPostMock.mockResolvedValue(LOGIN_RESPONSE);
    setAuthSessionMock.mockReset();
    clearAuthSessionMock.mockReset();
    window.localStorage.clear();
  });

  it('shows the absolute-expiry message only for session_expired redirects', async () => {
    searchParamsValue.current = new URLSearchParams('reason=session_expired');
    const { useLoginForm } = await import('../useLoginForm');
    renderHook(() => useLoginForm());

    expect(toastInfoMock).toHaveBeenCalledWith(
      '세션이 만료되어 다시 로그인이 필요합니다.',
      { duration: 5000 },
    );
  });

  it('posts credentials, persists the returned KidItem session, and navigates', async () => {
    searchParamsValue.current = new URLSearchParams('next=/dashboard');
    const { useLoginForm } = await import('../useLoginForm');
    const { result } = renderHook(() => useLoginForm());

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
    expect(setAuthSessionMock).toHaveBeenCalledWith(LOGIN_RESPONSE.session);
    expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(toastSuccessMock).toHaveBeenCalledWith('로그인 성공');
  });

  it('revokes and clears a newly issued session when the user has no organization', async () => {
    searchParamsValue.current = new URLSearchParams('next=/dashboard');
    apiPostMock
      .mockResolvedValueOnce({
        ...LOGIN_RESPONSE,
        user: { ...LOGIN_RESPONSE.user, organizationId: null, membershipId: null },
      })
      .mockResolvedValueOnce({});
    const { useLoginForm } = await import('../useLoginForm');
    const { result } = renderHook(() => useLoginForm());

    await act(async () => {
      await result.current.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(apiPostMock).toHaveBeenNthCalledWith(2, '/api/auth/logout');
    expect(clearAuthSessionMock).toHaveBeenCalledWith('manual');
    expect(replaceMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      '조직에 속해있지 않습니다. 관리자에게 문의해주세요.',
    );
  });
});
