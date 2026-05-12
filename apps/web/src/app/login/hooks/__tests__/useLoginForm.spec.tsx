import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const toastInfoMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const searchParamsValue = vi.hoisted(() => ({
  current: new URLSearchParams() as URLSearchParams,
}));

vi.mock('sonner', () => ({
  toast: {
    info: toastInfoMock,
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => searchParamsValue.current,
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signInWithPassword: vi.fn(async () => ({ error: null })) },
  }),
}));

vi.mock('@/lib/auth-redirect', () => ({
  sanitizeInternalRedirectPath: (p: string | null) => p ?? '/',
}));

describe('useLoginForm — reason banner', () => {
  beforeEach(() => {
    toastInfoMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    // localStorage is per-jsdom-tab; clear stale data between tests
    if (typeof localStorage !== 'undefined') localStorage.clear();
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
});
