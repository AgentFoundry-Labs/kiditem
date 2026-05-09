import { ZodType, ZodError } from 'zod';
import { API_BASE } from './api';
import { ApiError } from './api-error';
import { createSupabaseBrowserClient } from './supabase/client';

/**
 * Supabase 세션 access token 을 `Authorization: Bearer <token>` 헤더로 첨부.
 * 토큰이 없으면 헤더 없이 요청 → 백엔드에서 401, 미들웨어가 `/login` 리다이렉트.
 *
 * `credentials: 'include'` 는 local cross-origin 개발(web:3000 → server:4000)과
 * staging/prod same-origin `/api/*` routing 양쪽에서 cookie 전달을 일관되게 둔다.
 * Authorization 헤더가 없는 SSE/EventSource 요청도 같은 cookie 를 사용해 인증한다
 * (SupabaseAuthMiddleware 가 SSR auth-token cookie session 을 읽음).
 */
async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function withAuthHeaders(init?: RequestInit): Promise<RequestInit> {
  const headers = new Headers(init?.headers);
  const token = await getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return { credentials: 'include', ...init, headers };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, await withAuthHeaders(init));
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
  fetchRaw: async (path: string, init?: RequestInit): Promise<Response> =>
    fetch(`${API_BASE}${path}`, await withAuthHeaders(init)),
};
