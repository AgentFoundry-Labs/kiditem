import { ZodType, ZodError } from 'zod';
import { API_BASE } from './api';
import { ApiError } from './api-error';

// Dev 전용 — DevAuthMiddleware(ADR-0006)가 x-dev-user-id 헤더로 req.authUser 를 채움.
// 프로덕션 인증 전환 시 실제 토큰 로직으로 교체. EventSource 는 헤더를 못 보내서
// SSE URL 만 `?devUserId=` 쿼리로 대체.
const DEV_USER_ID = process.env.NEXT_PUBLIC_DEV_USER_ID;

function withAuthHeaders(init?: RequestInit): RequestInit | undefined {
  if (!DEV_USER_ID) return init;
  const headers = new Headers(init?.headers);
  if (!headers.has('x-dev-user-id')) {
    headers.set('x-dev-user-id', DEV_USER_ID);
  }
  return { ...init, headers };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, withAuthHeaders(init));
  if (!res.ok) {
    let code: string | null = null;
    let detail = `API error: ${res.status}`;
    try {
      const body = await res.json();
      code = body.error ?? null;
      detail = typeof body.message === 'string' ? body.message : body.detail ?? detail;
    } catch { /* text body or empty */ }
    throw new ApiError(res.status, code, detail);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  /**
   * GET + Zod parse at the client boundary (Plan D spec § I1).
   * Surfaces API schema drift as a runtime ZodError rather than a silent type cast.
   */
  getParsed: async <T>(path: string, schema: ZodType<T>): Promise<T> => {
    const raw = await request<unknown>(path);
    try {
      return schema.parse(raw);
    } catch (err) {
      if (err instanceof ZodError) {
        console.error('[apiClient.getParsed] ZodError', { path, issues: err.issues });
      }
      throw err;
    }
  },
  post: <T>(path: string, body?: unknown, options?: { signal?: AbortSignal }) =>
    request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  /**
   * PATCH + Zod parse at the client boundary. Mirrors `getParsed` so write paths
   * that depend on server-returned envelope shapes (e.g. `{ images }`) surface
   * drift as a ZodError rather than a silent type cast.
   */
  patchParsed: async <T>(path: string, schema: ZodType<T>, body: unknown): Promise<T> => {
    const raw = await request<unknown>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    try {
      return schema.parse(raw);
    } catch (err) {
      if (err instanceof ZodError) {
        console.error('[apiClient.patchParsed] ZodError', { path, issues: err.issues });
      }
      throw err;
    }
  },
  /**
   * Multipart upload + Zod parse of the server response envelope.
   */
  uploadParsed: async <T>(path: string, schema: ZodType<T>, formData: FormData): Promise<T> => {
    const raw = await request<unknown>(path, { method: 'POST', body: formData });
    try {
      return schema.parse(raw);
    } catch (err) {
      if (err instanceof ZodError) {
        console.error('[apiClient.uploadParsed] ZodError', { path, issues: err.issues });
      }
      throw err;
    }
  },
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(
      path,
      body === undefined
        ? { method: 'DELETE' }
        : {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    ),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  /** Response 객체 직접 반환 (blob, stream 등 non-JSON 응답용) */
  fetchRaw: (path: string, init?: RequestInit): Promise<Response> =>
    fetch(`${API_BASE}${path}`, withAuthHeaders(init)),
};
