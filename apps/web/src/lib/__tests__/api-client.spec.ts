import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { apiClient } from '../api-client';
import { normalizeLoopbackApiBase } from '../api';
import { ApiError, isApiError } from '../api-error';

const getAuthSessionMock = vi.fn();
const clearAuthSessionMock = vi.fn();

vi.mock('../auth/session', () => ({
  getAuthSession: () => getAuthSessionMock(),
  clearAuthSession: (...args: unknown[]) => clearAuthSessionMock(...args),
}));

const DataSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().int(),
});

function jsonResponse(status: number, body: unknown, ok = status < 400): Response {
  return {
    ok,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    clone() {
      return jsonResponse(status, body, ok);
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  } as unknown as Response;
}

describe('apiClient.getParsed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    getAuthSessionMock.mockReset();
    getAuthSessionMock.mockReturnValue(null);
    clearAuthSessionMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed data on valid response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { id: '11111111-1111-1111-1111-111111111111', amount: 42 }),
    );
    const result = await apiClient.getParsed('/api/test', DataSchema);
    expect(result).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      amount: 42,
    });
    expect(fetch).toHaveBeenCalledWith('/api/test', expect.any(Object));
  });

  it('throws ZodError on invalid response shape', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { id: 'not-uuid', amount: 'not-number' }),
    );
    await expect(apiClient.getParsed('/api/test', DataSchema)).rejects.toThrowError(
      /ZodError|invalid/i,
    );
  });

  it('parses array schema', async () => {
    const ArraySchema = z.array(DataSchema);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, [{ id: '11111111-1111-1111-1111-111111111111', amount: 1 }]),
    );
    const result = await apiClient.getParsed('/api/test', ArraySchema);
    expect(result).toHaveLength(1);
  });

  it('attaches the KidItem browser session token as Authorization', async () => {
    getAuthSessionMock.mockReturnValue({
      token: 'a'.repeat(43),
      expiresAt: '2026-08-29T03:00:00.000Z',
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiClient.post('/api/test');

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${'a'.repeat(43)}`);
  });
});

describe('apiClient HTTP method envelopes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    getAuthSessionMock.mockReset();
    getAuthSessionMock.mockReturnValue(null);
    clearAuthSessionMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET sends credentials and returns parsed JSON', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { data: 'ok' }),
    );

    await expect(apiClient.get('/api/products')).resolves.toEqual({ data: 'ok' });

    expect(fetch).toHaveBeenCalledWith(
      '/api/products',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('POST sends JSON body only when a body is provided', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiClient.post('/api/orders', { item: 'a' })).resolves.toEqual({ id: 1 });
    await expect(apiClient.post('/api/trigger')).resolves.toEqual({ ok: true });

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(firstInit.method).toBe('POST');
    expect(new Headers(firstInit.headers).get('Content-Type')).toBe('application/json');
    expect(firstInit.body).toBe(JSON.stringify({ item: 'a' }));

    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(secondInit.method).toBe('POST');
    expect(secondInit.body).toBeUndefined();
  });

  it('POST preserves caller response-profile headers alongside JSON content type', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiClient.post('/api/purchase-orders', { action: 'listSavedRocketPos' }, {
      headers: { 'X-KidItem-Response-Profile': 'rocket-saved-po-v2' },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-KidItem-Response-Profile')).toBe('rocket-saved-po-v2');
  });

  it('PATCH, PUT, and DELETE use the expected HTTP methods and JSON envelopes', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, {}));

    await apiClient.patch('/api/products/1', { name: 'new' });
    await apiClient.put('/api/products/1', { name: 'next' });
    await apiClient.delete('/api/products/1');
    await apiClient.delete('/api/products/1', { reason: 'duplicate' });

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('PATCH');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBe(JSON.stringify({ name: 'new' }));
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('PUT');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(JSON.stringify({ name: 'next' }));
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).method).toBe('DELETE');
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).body).toBeUndefined();
    expect((fetchMock.mock.calls[3]?.[1] as RequestInit).method).toBe('DELETE');
    expect((fetchMock.mock.calls[3]?.[1] as RequestInit).body).toBe(JSON.stringify({ reason: 'duplicate' }));
  });

  it('uses message, detail, then status fallback when building non-401 ApiError details', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: 'COMMON_BAD_REQUEST', message: 'Invalid input' }))
      .mockResolvedValueOnce(jsonResponse(422, { error: 'VALIDATION', detail: 'Field X required' }))
      .mockResolvedValueOnce(jsonResponse(503, { error: 'Service Unavailable', message: '' }))
      .mockResolvedValueOnce(jsonResponse(500, {}, false));

    await expect(apiClient.get('/api/message')).rejects.toMatchObject({
      status: 400,
      code: 'COMMON_BAD_REQUEST',
      detail: 'Invalid input',
    });
    await expect(apiClient.post('/api/detail', {})).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION',
      detail: 'Field X required',
    });
    await expect(apiClient.get('/api/blank-message')).rejects.toMatchObject({
      status: 503,
      code: 'Service Unavailable',
      detail: 'API error: 503',
    });
    await expect(apiClient.get('/api/fallback')).rejects.toMatchObject({
      status: 500,
      code: null,
      detail: 'API error: 500',
    });
  });

  it('wraps network/CORS fetch failures with an actionable ApiError', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(apiClient.get('/api/products')).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
      detail: 'API 서버에 연결하지 못했습니다. 백엔드 실행 상태 또는 CORS 설정을 확인해주세요.',
    });
    expect(error).toHaveBeenCalledWith(
      '[apiClient] Network request failed',
      expect.objectContaining({ path: '/api/products' }),
    );
    error.mockRestore();
  });

  it('can suppress only the console log for a best-effort POST while preserving network_error', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      apiClient.post('/api/best-effort', undefined, {
        suppressNetworkErrorLog: true,
      }),
    ).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('apiClient — 본문 없는 200 처리', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    getAuthSessionMock.mockReset();
    getAuthSessionMock.mockReturnValue(null);
    clearAuthSessionMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Nest 핸들러가 `null` 을 반환하면 본문 없는 200 이 나간다.
  function emptyResponse(): Response {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      clone() {
        return emptyResponse();
      },
      async json() {
        throw new SyntaxError('Unexpected end of JSON input');
      },
      async text() {
        return '';
      },
    } as unknown as Response;
  }

  it('get 은 빈 본문을 계속 `{}` 로 돌려준다', async () => {
    // 기본값을 바꾸면 `{}` 를 조용한 falsy 로 처리하던 기존 호출부가 크래시한다.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyResponse());

    await expect(apiClient.get('/api/anything')).resolves.toEqual({});
  });

  it('getNullable 은 빈 본문을 null 로 정규화한다', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyResponse());

    await expect(apiClient.getNullable('/api/anything')).resolves.toBeNull();
  });

  it('getNullable 은 본문이 있으면 그대로 파싱해 돌려준다', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { id: 'batch-1' }),
    );

    await expect(apiClient.getNullable('/api/anything')).resolves.toEqual({
      id: 'batch-1',
    });
  });
});

describe('apiClient — 401 interceptor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    getAuthSessionMock.mockReset();
    getAuthSessionMock.mockReturnValue(null);
    clearAuthSessionMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC1: GET 401 auth_required clears the absolute session without retrying', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'auth_required',
        timestamp: '2026-05-12T00:00:00Z',
        path: '/api/foo',
      }),
    );
    await expect(apiClient.get('/api/foo')).rejects.toMatchObject({
      status: 401,
      code: 'auth_required',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearAuthSessionMock).toHaveBeenCalledWith('session_expired');
  });

  it('AC2: POST FormData follows the same single-attempt expiry path', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'auth_required',
        timestamp: '2026-05-12T00:00:00Z',
        path: '/api/upload',
      }),
    );

    const formData = new FormData();
    formData.append('file', new Blob(['hello']), 'test.txt');

    await expect(apiClient.upload('/api/upload', formData)).rejects.toMatchObject({
      status: 401,
      code: 'auth_required',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearAuthSessionMock).toHaveBeenCalledWith('session_expired');
  });

  it('AC3: GET 401 no_organization_context does not clear a valid session', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'no_organization_context',
        timestamp: '2026-05-12T00:00:00Z',
        path: '/api/foo',
      }),
    );

    await expect(apiClient.get('/api/foo')).rejects.toMatchObject({
      status: 401,
      code: 'no_organization_context',
    });

    expect(clearAuthSessionMock).not.toHaveBeenCalled();
  });

  it('AC4: GET 401 unknown_message throws a generic ApiError without clearing', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'some_other_reason',
        timestamp: '2026-05-12T00:00:00Z',
        path: '/api/foo',
      }),
    );

    let caught: unknown;
    try {
      await apiClient.get('/api/foo');
    } catch (e) {
      caught = e;
    }

    expect(isApiError(caught)).toBe(true);
    expect((caught as ApiError).status).toBe(401);
    expect((caught as ApiError).code).toBe('Unauthorized');
    expect(clearAuthSessionMock).not.toHaveBeenCalled();
  });

  it('AC5: GET 500 preserves the backend error code', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, {
        statusCode: 500,
        error: 'INTERNAL',
        message: 'database connection lost',
        timestamp: '2026-05-12T00:00:00Z',
        path: '/api/foo',
      }),
    );

    let caught: unknown;
    try {
      await apiClient.get('/api/foo');
    } catch (e) {
      caught = e;
    }

    expect(isApiError(caught)).toBe(true);
    expect((caught as ApiError).status).toBe(500);
    expect((caught as ApiError).code).toBe('INTERNAL');
    expect((caught as ApiError).detail).toBe('database connection lost');
    expect(clearAuthSessionMock).not.toHaveBeenCalled();
  });

  it('AC6: fetchRaw 401 clears the session and returns the original response', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'auth_required',
        timestamp: '2026-05-12T00:00:00Z',
        path: '/api/render-image',
      }),
    );
    const res = await apiClient.fetchRaw('/api/render-image', { method: 'POST' });

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(clearAuthSessionMock).toHaveBeenCalledWith('session_expired');
  });
});

describe('api base helpers', () => {
  it('keeps loopback API requests on the browser host for host-only auth cookies', () => {
    expect(normalizeLoopbackApiBase('http://localhost:4000', '127.0.0.1'))
      .toBe('http://127.0.0.1:4000');
    expect(normalizeLoopbackApiBase('http://127.0.0.1:4000', 'localhost'))
      .toBe('http://localhost:4000');
    expect(normalizeLoopbackApiBase('http://localhost:4000', '0.0.0.0'))
      .toBe('http://localhost:4000');
    expect(normalizeLoopbackApiBase('https://api.kiditem.local', 'localhost'))
      .toBe('https://api.kiditem.local');
  });
});

describe('apiClient request deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    getAuthSessionMock.mockReset();
    getAuthSessionMock.mockReturnValue(null);
    clearAuthSessionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function installAbortableNeverSettlingFetch() {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
          once: true,
        });
      }));
    return fetchMock;
  }

  it('turns the default GET deadline into request_timeout and clears the timer', async () => {
    const fetchMock = installAbortableNeverSettlingFetch();

    const pending = apiClient.get('/api/slow');
    await vi.advanceTimersByTimeAsync(0);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(vi.getTimerCount()).toBe(1);

    const rejected = expect(pending).rejects.toMatchObject({
      status: 0,
      code: 'request_timeout',
    });
    await vi.advanceTimersByTimeAsync(15_000);

    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors an explicit GET deadline for a never-settling fetch', async () => {
    installAbortableNeverSettlingFetch();

    const pending = apiClient.get('/api/slow', { timeoutMs: 10 });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'request_timeout' });
    await vi.advanceTimersByTimeAsync(10);

    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves caller abort identity instead of reporting request_timeout', async () => {
    installAbortableNeverSettlingFetch();
    const caller = new AbortController();
    const reason = new DOMException('route changed', 'AbortError');

    const pending = apiClient.get('/api/slow', {
      signal: caller.signal,
      timeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    caller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves an already-aborted caller signal without allocating a timer', async () => {
    const caller = new AbortController();
    const reason = new DOMException('already left', 'AbortError');
    caller.abort(reason);
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) =>
      Promise.reject(init?.signal?.reason));

    await expect(apiClient.get('/api/slow', {
      signal: caller.signal,
      timeoutMs: 10_000,
    })).rejects.toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans its timer when fetch rejects before the deadline', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError('offline'));

    await expect(apiClient.get('/api/fail-fast', { timeoutMs: 10_000 }))
      .rejects.toMatchObject({ code: 'network_error' });

    expect(vi.getTimerCount()).toBe(0);
    error.mockRestore();
  });

  it('cleans its timer on an HTTP error response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(503, { error: 'unavailable', message: 'try later' }),
    );

    await expect(apiClient.get('/api/http-error', { timeoutMs: 10_000 }))
      .rejects.toMatchObject({ status: 503, code: 'unavailable' });

    expect(vi.getTimerCount()).toBe(0);
  });
});
