import { ZodType, ZodTypeDef, ZodError } from 'zod';
import { getApiBase } from './api';
import { ApiError } from './api-error';
import { clearAuthSession, getAuthSession } from './auth/session';

/**
 * KidItem opaque session token 을 `Authorization: Bearer <token>` 헤더로 첨부.
 *
 * `credentials: 'include'` 는 local cross-origin 개발(web:3000 → server:4000)과
 * local/Office same-origin `/api/*` routing 양쪽에서 cookie 전달을 일관되게 둔다.
 * Authorization 헤더가 없는 요청도 같은 HttpOnly cookie 를 사용할 수 있다.
 *
 * 30일 절대 만료 세션은 refresh token 이 없다. 401 `auth_required` 는 저장된
 * 세션을 즉시 지우고 AuthProvider 가 로그인 화면 전환을 소유하며 원 요청은
 * 재시도하지 않는다.
 * `no_organization_context` 401 은 인증은 유효하나 조직 미할당 상태이므로 refresh 도,
 * signOut 도 일으키지 않고 caller 가 결정한다 (토스트 등).
 */
async function getAccessToken(): Promise<string | null> {
  return getAuthSession()?.token ?? null;
}

async function withAuthHeaders(init?: RequestInit): Promise<RequestInit> {
  const headers = new Headers(init?.headers);
  const token = await getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return { credentials: 'include', ...init, headers };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

interface RequestDiagnostics {
  suppressNetworkErrorLog?: boolean;
}

interface RequestOptions extends RequestDiagnostics {
  /**
   * 본문 없는 200 을 무엇으로 볼지 정한다.
   *
   * Nest 컨트롤러가 `null` 을 반환하면 본문 없는 200 이 나간다. 기본값
   * `'empty-object'` 는 그것을 `{}` 로 만드는데, `{}` 는 truthy 라서 호출부의
   * `if (!x)` null 가드를 그냥 통과하고 필수 필드가 `undefined` 로 읽힌다.
   * nullable 을 선언한 읽기는 `'null'` 을 써서 계약을 실제와 맞춘다
   * (`apiClient.getNullable`).
   *
   * 기본값을 `'null'` 로 바꾸지 말 것. `{}` 를 받아 조용히 falsy 로 처리하는
   * 기존 호출부가 400개 규모라, 일괄 변경은 그 자리들을 런타임 크래시로 만든다.
   */
  emptyBodyAs?: 'empty-object' | 'null';
}

async function fetchApi(
  path: string,
  init?: RequestInit,
  diagnostics?: RequestDiagnostics,
): Promise<Response> {
  try {
    return await fetch(`${getApiBase()}${path}`, await withAuthHeaders(init));
  } catch (err) {
    if (isAbortError(err)) throw err;
    if (!diagnostics?.suppressNetworkErrorLog) {
      console.error('[apiClient] Network request failed', { path, error: err });
    }
    throw new ApiError(
      0,
      'network_error',
      'API 서버에 연결하지 못했습니다. 백엔드 실행 상태 또는 CORS 설정을 확인해주세요.',
    );
  }
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

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const res = await fetchApi(path, init, options);

  if (res.status === 401) {
    const message = await read401Message(res);

    if (message === 'auth_required') {
      clearAuthSession('session_expired');
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
      typeof messageRaw === 'string' && messageRaw.trim()
        ? messageRaw.trim()
        : typeof detailRaw === 'string' && detailRaw.trim()
          ? detailRaw.trim()
          : `API error: ${res.status}`;
    throw new ApiError(res.status, code, detail);
  }

  const text = await res.text();
  if (text) return JSON.parse(text) as T;
  return (options?.emptyBodyAs === 'null' ? null : {}) as T;
}

async function fetchRaw(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetchApi(path, init);
  if (res.status === 401) {
    const message = await read401Message(res);
    if (message === 'auth_required') {
      clearAuthSession('session_expired');
    }
  }
  return res;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  /**
   * "없을 수도 있는 단일 리소스" 읽기. 본문 없는 200 을 `{}` 가 아니라 `null` 로
   * 돌려주므로 호출부의 `if (!x)` 가드가 실제로 동작한다.
   *
   * 백엔드 핸들러가 `null` 을 반환할 수 있는 GET 은 `get` 대신 이걸 쓴다.
   */
  getNullable: <T>(path: string): Promise<T | null> =>
    request<T | null>(path, undefined, { emptyBodyAs: 'null' }),
  /**
   * GET + Zod parse at the client boundary (Plan D spec § I1).
   * Surfaces API schema drift as a runtime ZodError rather than a silent type cast.
   */
  getParsed: async <Output, Input>(
    path: string,
    schema: ZodType<Output, ZodTypeDef, Input>,
  ): Promise<Output> => {
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
  post: <T>(
    path: string,
    body?: unknown,
    options?: {
      signal?: AbortSignal;
      headers?: HeadersInit;
      suppressNetworkErrorLog?: boolean;
    },
  ) => {
    const headers = new Headers(options?.headers);
    headers.set('Content-Type', 'application/json');
    return request<T>(
      path,
      {
        method: 'POST',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: options?.signal,
      },
      { suppressNetworkErrorLog: options?.suppressNetworkErrorLog },
    );
  },
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
   * 401 auth_required 시 세션을 지우고 raw Response 를 그대로 반환하므로 caller 는
   * `res.status === 401` 체크 책임.
   */
  fetchRaw: async (path: string, init?: RequestInit): Promise<Response> =>
    fetchRaw(path, init),
};
