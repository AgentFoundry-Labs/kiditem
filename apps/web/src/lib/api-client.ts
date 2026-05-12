import { ZodType, ZodError } from 'zod';
import { API_BASE } from './api';
import { ApiError } from './api-error';
import { createSupabaseBrowserClient } from './supabase/client';
import { refreshOrFail, triggerSignOut } from './supabase/refresh';

/**
 * Supabase 세션 access token 을 `Authorization: Bearer <token>` 헤더로 첨부.
 *
 * `credentials: 'include'` 는 local cross-origin 개발(web:3000 → server:4000)과
 * staging/prod same-origin `/api/*` routing 양쪽에서 cookie 전달을 일관되게 둔다.
 * Authorization 헤더가 없는 SSE/EventSource 요청도 같은 cookie 를 사용해 인증한다
 * (SupabaseAuthMiddleware 가 SSR auth-token cookie session 을 읽음).
 *
 * 401 `auth_required` 응답 시:
 *   1. `refreshOrFail()` 로 한 번 refresh 시도 (mutex 가 동시 401 들을 1회로 직렬화).
 *   2. 성공 → 원 요청 1회 재시도.
 *   3. 실패 → `triggerSignOut('session_expired')` 호출. AuthProvider 의 SIGNED_OUT
 *      핸들러가 `/login?reason=session_expired&next=...` redirect 를 단독 소유.
 *
 * FormData body 는 stream 소진 문제로 자동 재시도 대상에서 제외 — 즉시 signOut.
 * `no_organization_context` 401 은 인증은 유효하나 조직 미할당 상태이므로 refresh 도,
 * signOut 도 일으키지 않고 caller 가 결정한다 (토스트 등).
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

function isFormDataBody(init: RequestInit | undefined): boolean {
  return typeof FormData !== 'undefined' && init?.body instanceof FormData;
}

async function read401Message(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as Record<string, unknown>;
    const msg = body?.message;
    return typeof msg === 'string' ? msg : null;
  } catch {
    return null;
  }
}

async function requestWithRetry<T>(
  path: string,
  init: RequestInit | undefined,
  attempt: 1 | 2,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, await withAuthHeaders(init));

  if (res.status === 401) {
    const message = await read401Message(res);

    if (message === 'auth_required') {
      if (attempt === 1 && !isFormDataBody(init)) {
        const refreshed = await refreshOrFail();
        if (refreshed) return requestWithRetry<T>(path, init, 2);
      }
      await triggerSignOut('session_expired');
      throw new ApiError(401, 'auth_required', '세션이 만료되었습니다. 다시 로그인해주세요.');
    }

    if (message === 'no_organization_context') {
      // 인증은 유효하지만 조직 멤버십이 없음. signOut 하지 않고 caller 가 안내.
      throw new ApiError(
        401,
        'no_organization_context',
        '조직에 속해있지 않습니다. 관리자에게 문의해주세요.',
      );
    }
    // 기타 401 (희귀) → 일반 ApiError flow 로 fall through
  }

  if (!res.ok) {
    // 비-401 path 는 기존 의미 유지: code = body.error (HTTP error category 식별자).
    const body = await res.json().catch(() => ({}));
    const record = body as Record<string, unknown>;
    const code = typeof record.error === 'string' ? record.error : null;
    const messageRaw = record.message;
    const detailRaw = record.detail;
    const detail =
      typeof messageRaw === 'string'
        ? messageRaw
        : typeof detailRaw === 'string'
          ? detailRaw
          : `API error: ${res.status}`;
    throw new ApiError(res.status, code, detail);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestWithRetry<T>(path, init, 1);
}

async function fetchRawWithRetry(
  path: string,
  init: RequestInit | undefined,
  attempt: 1 | 2,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, await withAuthHeaders(init));
  if (res.status === 401) {
    const message = await read401Message(res);
    if (message === 'auth_required') {
      if (attempt === 1 && !isFormDataBody(init)) {
        const refreshed = await refreshOrFail();
        if (refreshed) return fetchRawWithRetry(path, init, 2);
      }
      await triggerSignOut('session_expired');
      // raw Response 반환 contract 유지. AuthProvider 의 SIGNED_OUT handler 는
      // 비동기로 redirect 하므로 caller 가 짧은 윈도우 동안 401 Response 를 받을
      // 수 있다. fetchRaw 사용처는 `res.status === 401` 체크 책임.
    }
  }
  return res;
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
  /**
   * Response 객체 직접 반환 (blob, stream 등 non-JSON 응답용).
   * 401 auth_required 시 refresh + retry 가 자동 작동하지만 사후 signOut path 에서
   * raw Response 가 그대로 반환될 수 있으므로 caller 는 `res.status === 401` 체크 책임.
   * (DetailPagePreview, DetailPageEditorToolbar, ChatBot 의 /api/chat POST 가 사용처.)
   */
  fetchRaw: async (path: string, init?: RequestInit): Promise<Response> =>
    fetchRawWithRetry(path, init, 1),
};
