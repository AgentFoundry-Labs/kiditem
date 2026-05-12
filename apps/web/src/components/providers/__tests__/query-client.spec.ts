import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { makeQueryClient } from '../query-client';

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock },
}));

describe('makeQueryClient → onError', () => {
  beforeEach(() => {
    toastErrorMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  function fireError(error: unknown) {
    const qc = makeQueryClient();
    // QueryCache.onError 를 직접 트리거하기 위해 QueryCache 의 notify 메커니즘 활용.
    // 가장 단순한 방법: QueryCache 의 config.onError 를 추출하여 호출.
    const cache = qc.getQueryCache();
    // @ts-expect-error: private config access for test isolation
    const onError = cache.config?.onError;
    if (!onError) throw new Error('onError not registered');
    onError(error, /* query */ {} as never);
  }

  it('swallows 401 auth_required ApiError (no toast — apiClient + AuthProvider handle UI)', () => {
    fireError(new ApiError(401, 'auth_required', '세션이 만료되었습니다. 다시 로그인해주세요.'));

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('still toasts other 401 codes (no_organization_context, etc.)', () => {
    fireError(
      new ApiError(401, 'no_organization_context', '조직에 속해있지 않습니다. 관리자에게 문의해주세요.'),
    );

    expect(toastErrorMock).toHaveBeenCalledWith(
      '조직에 속해있지 않습니다. 관리자에게 문의해주세요.',
    );
  });

  it('toasts non-401 ApiError using detail', () => {
    fireError(new ApiError(500, 'INTERNAL', 'database down'));

    expect(toastErrorMock).toHaveBeenCalledWith('database down');
  });

  it('silently ignores AbortError (transient)', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    fireError(err);

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('silently ignores "Failed to fetch" (transient)', () => {
    fireError(new Error('Failed to fetch'));

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('toasts unknown errors with generic message (non-ApiError fallback)', () => {
    fireError(new Error('weird thing'));

    expect(toastErrorMock).toHaveBeenCalledWith('요청 처리 중 오류가 발생했습니다.');
  });
});
