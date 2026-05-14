import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { apiClient } from '../api-client';
import { normalizeLoopbackApiBase } from '../api';
import { ApiError, isApiError } from '../api-error';

const refreshOrFailMock = vi.fn();
const triggerSignOutMock = vi.fn();

vi.mock('../supabase/refresh', () => ({
  refreshOrFail: (...args: unknown[]) => refreshOrFailMock(...args),
  triggerSignOut: (...args: unknown[]) => triggerSignOutMock(...args),
}));

vi.mock('../supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
  }),
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
    refreshOrFailMock.mockReset();
    triggerSignOutMock.mockReset();
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

  it('falls back to Supabase SSR cookie when attaching Authorization', async () => {
    const session = JSON.stringify({ access_token: 'cookie-token' });
    const encoded = `base64-${Buffer.from(session, 'utf8').toString('base64url')}`;
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      cookie: `sb-test-ref-auth-token=${encodeURIComponent(encoded)}`,
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiClient.post('/api/test');

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer cookie-token');
  });
});

describe('apiClient HTTP method envelopes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    refreshOrFailMock.mockReset();
    triggerSignOutMock.mockReset();
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
    await expect(apiClient.get('/api/fallback')).rejects.toMatchObject({
      status: 500,
      code: null,
      detail: 'API error: 500',
    });
  });
});

describe('apiClient — 401 interceptor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    refreshOrFailMock.mockReset();
    triggerSignOutMock.mockReset();
    triggerSignOutMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC1: GET 401 auth_required -> refresh success -> retry -> 200 body returned', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'auth_required',
          timestamp: '2026-05-12T00:00:00Z',
          path: '/api/foo',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    refreshOrFailMock.mockResolvedValueOnce(true);

    const result = await apiClient.get<{ ok: boolean }>('/api/foo');

    expect(result).toEqual({ ok: true });
    expect(refreshOrFailMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(triggerSignOutMock).not.toHaveBeenCalled();
  });

  it('AC2: GET 401 auth_required -> refresh fail -> triggerSignOut("session_expired") + throw', async () => {
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
    refreshOrFailMock.mockResolvedValueOnce(false);

    await expect(apiClient.get('/api/foo')).rejects.toMatchObject({
      status: 401,
      code: 'auth_required',
    });

    expect(refreshOrFailMock).toHaveBeenCalledTimes(1);
    expect(triggerSignOutMock).toHaveBeenCalledWith('session_expired');
  });

  it('AC3: POST FormData 401 auth_required -> refresh SKIP -> triggerSignOut + throw', async () => {
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

    expect(refreshOrFailMock).not.toHaveBeenCalled();
    expect(triggerSignOutMock).toHaveBeenCalledWith('session_expired');
  });

  it('AC4: GET 401 no_organization_context -> NO signOut, throw ApiError', async () => {
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

    expect(refreshOrFailMock).not.toHaveBeenCalled();
    expect(triggerSignOutMock).not.toHaveBeenCalled();
  });

  it('AC5: GET 401 unknown_message -> NO refresh, throw generic ApiError', async () => {
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
    expect(refreshOrFailMock).not.toHaveBeenCalled();
    expect(triggerSignOutMock).not.toHaveBeenCalled();
  });

  it('AC6: GET 500 -> code === body.error (no drift)', async () => {
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
    expect(refreshOrFailMock).not.toHaveBeenCalled();
  });

  it('AC7: fetchRaw 401 auth_required -> refresh + retry path, then 200 Response', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'auth_required',
          timestamp: '2026-05-12T00:00:00Z',
          path: '/api/render-image',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { imageUrl: 'https://...' }));
    refreshOrFailMock.mockResolvedValueOnce(true);

    const res = await apiClient.fetchRaw('/api/render-image', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(refreshOrFailMock).toHaveBeenCalledTimes(1);
    expect(triggerSignOutMock).not.toHaveBeenCalled();
  });

  it('AC7b: fetchRaw 401 auth_required -> refresh fail -> signOut -> raw 401 Response returned', async () => {
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
    refreshOrFailMock.mockResolvedValueOnce(false);

    const res = await apiClient.fetchRaw('/api/render-image', { method: 'POST' });

    expect(res.status).toBe(401);
    expect(triggerSignOutMock).toHaveBeenCalledWith('session_expired');
  });

  it('AC8: each independent 401 invokes refreshOrFail (mutex coalescing verified in refresh.spec R3)', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const body401 = {
      statusCode: 401,
      error: 'Unauthorized',
      message: 'auth_required',
      timestamp: '2026-05-12T00:00:00Z',
      path: '/api/foo',
    };
    for (let i = 0; i < 3; i++) {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(401, body401))
        .mockResolvedValueOnce(jsonResponse(200, { ok: i }));
    }
    refreshOrFailMock.mockResolvedValue(true);

    await apiClient.get<{ ok: number }>('/api/foo');
    await apiClient.get<{ ok: number }>('/api/foo');
    await apiClient.get<{ ok: number }>('/api/foo');

    expect(refreshOrFailMock).toHaveBeenCalledTimes(3);
    expect(triggerSignOutMock).not.toHaveBeenCalled();
  });
});

describe('api base helpers', () => {
  it('normalizes loopback API host to the browser host', () => {
    expect(normalizeLoopbackApiBase('http://localhost:4000', '127.0.0.1'))
      .toBe('http://127.0.0.1:4000');
    expect(normalizeLoopbackApiBase('http://127.0.0.1:4000', 'localhost'))
      .toBe('http://localhost:4000');
    expect(normalizeLoopbackApiBase('https://api.kiditem.local', 'localhost'))
      .toBe('https://api.kiditem.local');
  });
});
