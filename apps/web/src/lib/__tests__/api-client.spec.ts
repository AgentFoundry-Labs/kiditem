import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { apiClient } from '../api-client';
import { normalizeLoopbackApiBase } from '../api';
import { ApiError, isApiError } from '../api-error';

const notifyAuthRequiredMock = vi.fn();

vi.mock('../auth/browser-auth', () => ({
  notifyAuthRequired: (...args: unknown[]) => notifyAuthRequiredMock(...args),
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
    notifyAuthRequiredMock.mockReset();
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

  it('uses only cookie credentials and never attaches a browser bearer token', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiClient.post('/api/test');

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });
});

describe('apiClient HTTP method envelopes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    notifyAuthRequiredMock.mockReset();
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

  it('GET preserves an owner admission lookup header without sending a body', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(200, { attempts: [] }));
    await apiClient.get('/api/ads/keyword-rank/wing/batch-attempts', {
      headers: { 'Idempotency-Key': 'rank-admission' },
    });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('rank-admission');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
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

  it("keeps a source owner's code and attempt id beside the HTTP error category", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(409, {
        statusCode: 409,
        error: 'Conflict',
        message: 'Conflict',
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: '11111111-1111-4111-8111-111111111111',
      }))
      .mockResolvedValueOnce(jsonResponse(400, { error: 'COMMON_BAD_REQUEST', message: 'Invalid input' }));

    await expect(apiClient.post('/api/owner/attempts', {})).rejects.toMatchObject({
      status: 409,
      code: 'Conflict',
      details: {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: '11111111-1111-4111-8111-111111111111',
      },
    });
    await expect(apiClient.get('/api/plain')).rejects.toMatchObject({ details: {} });
  });

  it('keeps the existing draft a duplicate refusal names', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      statusCode: 409,
      message: '이미 수집한 원본입니다.',
      reason: 'duplicate_source_record',
      existing: { sourceRecordId: 'record-1', salesProductId: 'draft-1', salesProductStatus: 'draft' },
    }));

    await expect(apiClient.post('/api/sourcing/scrape-url', {})).rejects.toMatchObject({
      status: 409,
      detail: '이미 수집한 원본입니다.',
      details: { existingSalesProductId: 'draft-1', existingSalesProductStatus: 'draft' },
    });
  });

  /**
   * 전역 throttler 는 429 와 함께 언제 다시 물어도 되는지 알려 준다. 그 시간을 오류에
   * 실어야 상태 읽기가 짐작한 간격으로 다시 두드리지 않는다(KID-170 D2).
   */
  it("carries the throttler's Retry-After wait, in seconds or as an HTTP date", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const throttled = (retryAfter?: string) => Response.json(
      { message: '요청이 너무 많습니다.' },
      { status: 429, ...(retryAfter ? { headers: { 'Retry-After': retryAfter } } : {}) },
    );
    fetchMock
      .mockResolvedValueOnce(throttled('37'))
      .mockResolvedValueOnce(throttled(new Date(Date.now() + 25_000).toUTCString()))
      .mockResolvedValueOnce(throttled(new Date(Date.now() - 60_000).toUTCString()))
      .mockResolvedValueOnce(throttled('whenever'))
      .mockResolvedValueOnce(throttled());

    await expect(apiClient.get('/api/seconds')).rejects.toMatchObject({
      status: 429,
      details: { retryAfterMs: 37_000 },
    });
    const httpDate = await apiClient.get('/api/http-date').catch((error: unknown) => error);
    expect((httpDate as ApiError).details.retryAfterMs).toBeGreaterThan(23_000);
    expect((httpDate as ApiError).details.retryAfterMs).toBeLessThanOrEqual(25_000);
    // 이미 지난 시각은 기다릴 것이 없다는 뜻이다.
    await expect(apiClient.get('/api/past')).rejects.toMatchObject({ details: { retryAfterMs: 0 } });
    await expect(apiClient.get('/api/unreadable')).rejects.toMatchObject({ details: {} });
    await expect(apiClient.get('/api/no-header')).rejects.toMatchObject({ details: {} });
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
    notifyAuthRequiredMock.mockReset();
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
    notifyAuthRequiredMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC1: GET 401 auth_required notifies the cookie-backed auth owner without retrying', async () => {
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
    expect(notifyAuthRequiredMock).toHaveBeenCalledOnce();
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
    expect(notifyAuthRequiredMock).toHaveBeenCalledOnce();
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

    expect(notifyAuthRequiredMock).not.toHaveBeenCalled();
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
    expect(notifyAuthRequiredMock).not.toHaveBeenCalled();
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
    expect(notifyAuthRequiredMock).not.toHaveBeenCalled();
  });

  it('AC6: fetchRaw 401 notifies auth and returns the original response', async () => {
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
    expect(notifyAuthRequiredMock).toHaveBeenCalledOnce();
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

  it('follows a private LAN browser host so a phone keeps one origin host for the session cookie', () => {
    expect(normalizeLoopbackApiBase('http://localhost:4000', '192.168.0.28'))
      .toBe('http://192.168.0.28:4000');
    expect(normalizeLoopbackApiBase('http://localhost:4000', '10.1.2.3'))
      .toBe('http://10.1.2.3:4000');
    expect(normalizeLoopbackApiBase('http://localhost:4000', '203.0.113.5'))
      .toBe('http://localhost:4000');
  });
});

describe('apiClient request deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    notifyAuthRequiredMock.mockReset();
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

  function installResponseWithNeverSettlingBody(
    status = 200,
    ok = status < 400,
  ) {
    const body = () => new Promise<never>(() => undefined);
    const response = {
      ok,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      clone() {
        return response;
      },
      json: body,
      text: body,
    } as unknown as Response;
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(response);
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

  it('keeps schema parsing and caller deadline options on the same GET boundary', async () => {
    installAbortableNeverSettlingFetch();
    const schema = z.string().transform((value) => value.length);

    const pending = apiClient.getParsed('/api/slow-parsed', schema, {
      timeoutMs: 11,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'request_timeout',
    });
    await vi.advanceTimersByTimeAsync(11);

    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['successful JSON body', () => apiClient.get('/api/body-slow'), 200, true],
    ['HTTP error body', () => apiClient.get('/api/body-slow'), 503, false],
    ['nullable empty-body decision', () => apiClient.getNullable('/api/body-slow'), 200, true],
  ])('keeps the default GET deadline through a never-settling %s', async (
    _label,
    request,
    status,
    ok,
  ) => {
    installResponseWithNeverSettlingBody(status, ok);

    const pending = request();
    const rejected = expect(pending).rejects.toMatchObject({
      status: 0,
      code: 'request_timeout',
    });
    await vi.advanceTimersByTimeAsync(15_000);

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

  it.each([
    ['Error', new Error('navigation')],
    ['string', 'navigation'],
    ['custom object', { code: 'route_changed' }],
  ])('normalizes an active caller %s reason during body consumption to AbortError', async (
    _label,
    reason,
  ) => {
    installResponseWithNeverSettlingBody();
    const caller = new AbortController();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const pending = apiClient.get('/api/body-slow', {
      signal: caller.signal,
      timeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    caller.abort(reason);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError', cause: reason });
    expect(errorLog).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    errorLog.mockRestore();
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

  it.each([
    ['Error', new Error('navigation')],
    ['string', 'navigation'],
    ['custom object', { code: 'route_changed' }],
  ])('normalizes an already-aborted caller %s reason without logging a network error', async (
    _label,
    reason,
  ) => {
    const caller = new AbortController();
    caller.abort(reason);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(apiClient.get('/api/already-left', {
      signal: caller.signal,
      timeoutMs: 10_000,
    })).rejects.toMatchObject({ name: 'AbortError', cause: reason });

    expect(fetch).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    errorLog.mockRestore();
  });

  it('keeps an already-aborted DOM AbortError as caller cancellation', async () => {
    const caller = new AbortController();
    const reason = new DOMException('route changed', 'AbortError');
    caller.abort(reason);

    await expect(apiClient.get('/api/already-left', {
      signal: caller.signal,
      timeoutMs: 10_000,
    })).rejects.toBe(reason);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not reclassify a first-settled network rejection when the caller aborts later', async () => {
    const caller = new AbortController();
    const networkError = new TypeError('offline first');
    let rejectFetch!: (reason: unknown) => void;
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFetch = reject; }),
    );
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const pending = apiClient.get('/api/fail-first', {
      signal: caller.signal,
      timeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    rejectFetch(networkError);
    caller.abort(new Error('navigation after failure'));

    await expect(pending).rejects.toMatchObject({ code: 'network_error' });
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    errorLog.mockRestore();
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
