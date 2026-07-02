import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const toastInfoMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const signInWithPasswordMock = vi.hoisted(() => vi.fn());
const apiGetMock = vi.hoisted(() => vi.fn());
const triggerSignOutMock = vi.hoisted(() => vi.fn());
const localStorageMock = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}));
const searchParamsValue = vi.hoisted(() => ({
  current: new URLSearchParams() as URLSearchParams,
}));

vi.mock('sonner', () => ({
  toast: {
    info: toastInfoMock,
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => searchParamsValue.current,
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => apiGetMock(...args),
  },
}));

vi.mock('@/lib/supabase/refresh', () => ({
  triggerSignOut: (...args: unknown[]) => triggerSignOutMock(...args),
}));

vi.mock('@/lib/auth-redirect', () => ({
  sanitizeInternalRedirectPath: (p: string | null) => p ?? '/',
}));

describe('useLoginForm — reason banner', () => {
  beforeEach(() => {
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    signInWithPasswordMock.mockReset();
    signInWithPasswordMock.mockResolvedValue({ error: null });
    apiGetMock.mockReset();
    apiGetMock.mockResolvedValue({
      id: 'user-1',
      email: 'kiditem@example.com',
      name: 'KidItem',
      role: 'admin',
      type: 'human',
      organizationId: 'org-1',
      membershipId: 'membership-1',
    });
    triggerSignOutMock.mockReset();
    triggerSignOutMock.mockResolvedValue(undefined);
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
    localStorageMock.removeItem.mockReset();
    localStorageMock.clear.mockReset();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });
  });

  it('L1: mounts with ?reason=session_expired → toast.info fires once', async () => {
    searchParamsValue.current = new URLSearchParams('reason=session_expired');
    const { useLoginForm } = await import('../useLoginForm');

    renderHook(() => useLoginForm());

    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    expect(toastInfoMock).toHaveBeenCalledWith(
      '세션이 만료되어 다시 로그인이 필요합니다.',
      { duration: 5000 },
    );
  });

  it('L2: mounts without reason → no toast', async () => {
    searchParamsValue.current = new URLSearchParams();
    const { useLoginForm } = await import('../useLoginForm');

    renderHook(() => useLoginForm());

    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it('L3: ?reason=session_expired&next=/inventory → toast fires (next is still honored separately)', async () => {
    searchParamsValue.current = new URLSearchParams('reason=session_expired&next=/inventory');
    const { useLoginForm } = await import('../useLoginForm');

    renderHook(() => useLoginForm());

    expect(toastInfoMock).toHaveBeenCalledTimes(1);
  });

  it('ignores other reason values (e.g. ?reason=manual or unknown)', async () => {
    searchParamsValue.current = new URLSearchParams('reason=manual');
    const { useLoginForm } = await import('../useLoginForm');

    renderHook(() => useLoginForm());

    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it('waits for KidItem /api/auth/me before navigating after password login', async () => {
    searchParamsValue.current = new URLSearchParams('next=/dashboard');
    const { useLoginForm } = await import('../useLoginForm');
    const { result } = renderHook(() => useLoginForm());

    await act(async () => {
      await result.current.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);
    expect(apiGetMock).toHaveBeenCalledWith('/api/auth/me');
    expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith('로그인 성공');
  });

  it('does not navigate into the protected app when KidItem identity handshake fails', async () => {
    searchParamsValue.current = new URLSearchParams('next=/dashboard');
    apiGetMock.mockRejectedValue(new Error('조직에 속해있지 않습니다. 관리자에게 문의해주세요.'));
    const { useLoginForm } = await import('../useLoginForm');
    const { result } = renderHook(() => useLoginForm());

    await act(async () => {
      await result.current.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(apiGetMock).toHaveBeenCalledWith('/api/auth/me');
    expect(replaceMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(triggerSignOutMock).toHaveBeenCalledWith('manual');
    expect(toastErrorMock).toHaveBeenCalledWith(
      '조직에 속해있지 않습니다. 관리자에게 문의해주세요.',
    );
  });
});
