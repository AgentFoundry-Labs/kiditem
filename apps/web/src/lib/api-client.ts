import { ZodType, ZodTypeDef, ZodError } from 'zod';
import { getApiBase } from './api';
import { ApiError } from './api-error';
import { notifyAuthRequired } from './auth/browser-auth';
import { composeRequestSignal } from './request-deadline';

const DEFAULT_READ_TIMEOUT_MS = 15_000;

/**
 * Browser authentication is exclusively the HttpOnly cookie. The API client
 * always includes cookie credentials and never reads or attaches a bearer.
 * A 401 `auth_required` notifies AuthProvider and is never retried.
 * `no_organization_context` 401 은 인증은 유효하나 조직 미할당 상태이므로 refresh 도,
 * signOut 도 일으키지 않고 caller 가 결정한다 (토스트 등).
 */
function withCookieCredentials(init?: RequestInit): RequestInit {
  return { credentials: 'include', ...init };
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'name' in err
    && err.name === 'AbortError';
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number | null;
  suppressNetworkErrorLog?: boolean;
}

interface RequestOptions extends ApiRequestOptions {
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

class RequestSignalAbort extends Error {
  constructor(readonly reason: unknown) {
    super('Request aborted');
    this.name = 'RequestSignalAbort';
  }
}

async function raceWithSignal<T>(
  signal: AbortSignal | undefined,
  action: () => T | PromiseLike<T>,
): Promise<T> {
  if (!signal) return action();
  if (signal.aborted) throw new RequestSignalAbort(signal.reason);

  let onAbort: (() => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new RequestSignalAbort(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  let operation: Promise<T>;
  try {
    operation = Promise.resolve(action());
  } catch (error) {
    operation = Promise.reject(error);
  }

  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (onAbort !== null) signal.removeEventListener('abort', onAbort);
  }
}

function callerAbortError(reason: unknown): Error {
  if (isAbortError(reason)) return reason as Error;
  const error = new DOMException('The operation was aborted.', 'AbortError');
  Object.defineProperty(error, 'cause', {
    configurable: true,
    value: reason,
  });
  return error;
}

function timeoutError(): ApiError {
  return new ApiError(
    0,
    'request_timeout',
    '요청 시간이 초과되었습니다. 다시 시도해주세요.',
  );
}

async function fetchApiResponse(
  path: string,
  init: RequestInit | undefined,
  signal: AbortSignal,
  suppressNetworkErrorLog: boolean,
): Promise<Response> {
  const authenticatedInit = await raceWithSignal(signal, () => withCookieCredentials(init));
  try {
    return await raceWithSignal(signal, () => fetch(`${getApiBase()}${path}`, {
      ...authenticatedInit,
      signal,
    }));
  } catch (error) {
    if (error instanceof RequestSignalAbort || isAbortError(error)) throw error;
    if (!suppressNetworkErrorLog) {
      console.error('[apiClient] Network request failed', { path, error });
    }
    throw new ApiError(
      0,
      'network_error',
      'API 서버에 연결하지 못했습니다. 백엔드 실행 상태 또는 CORS 설정을 확인해주세요.',
    );
  }
}

async function read401Message(
  res: Response,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const body = (await raceWithSignal(signal, () => res.clone().json())) as Record<string, unknown>;
    const msg = body?.message;
    return typeof msg === 'string' ? msg : null;
  } catch (error) {
    if (error instanceof RequestSignalAbort) throw error;
    return null;
  }
}

async function consumeResponse<T>(
  res: Response,
  signal: AbortSignal,
  path: string,
  options?: RequestOptions,
): Promise<T> {
  if (res.status === 401) {
    const message = await read401Message(res, signal);

    if (message === 'auth_required') {
      if (path !== '/api/auth/me') notifyAuthRequired();
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
    let body: unknown = {};
    try {
      body = await raceWithSignal(signal, () => res.json());
    } catch (error) {
      if (error instanceof RequestSignalAbort) throw error;
    }
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

  const text = await raceWithSignal(signal, () => res.text());
  if (text) return JSON.parse(text) as T;
  return (options?.emptyBodyAs === 'null' ? null : {}) as T;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const callerSignal = options?.signal ?? init?.signal ?? undefined;
  const composedSignal = composeRequestSignal(
    callerSignal,
    options?.timeoutMs === undefined ? null : options.timeoutMs,
  );
  try {
    const response = await fetchApiResponse(
      path,
      init,
      composedSignal.signal,
      options?.suppressNetworkErrorLog === true,
    );
    return await consumeResponse<T>(response, composedSignal.signal, path, options);
  } catch (error) {
    if (error instanceof RequestSignalAbort) {
      throw composedSignal.didTimeout
        ? timeoutError()
        : callerAbortError(callerSignal?.reason ?? error.reason);
    }
    if (composedSignal.didTimeout && isAbortError(error)) throw timeoutError();
    if (isAbortError(error) && callerSignal?.aborted) {
      throw callerAbortError(callerSignal.reason);
    }
    throw error;
  } finally {
    composedSignal.cleanup();
  }
}

async function fetchRaw(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const signal = init?.signal ?? undefined;
  try {
    const authenticatedInit = await raceWithSignal(signal, () => withCookieCredentials(init));
    const res = await raceWithSignal(signal, () => fetch(
      `${getApiBase()}${path}`,
      authenticatedInit,
    ));
    if (res.status === 401) {
      const message = await read401Message(res, signal);
      if (message === 'auth_required') {
        if (path !== '/api/auth/me') notifyAuthRequired();
      }
    }
    return res;
  } catch (error) {
    if (error instanceof RequestSignalAbort) throw callerAbortError(error.reason);
    if (isAbortError(error) && signal?.aborted) {
      throw callerAbortError(signal.reason);
    }
    if (isAbortError(error)) throw error;
    console.error('[apiClient] Network request failed', { path, error });
    throw new ApiError(
      0,
      'network_error',
      'API 서버에 연결하지 못했습니다. 백엔드 실행 상태 또는 CORS 설정을 확인해주세요.',
    );
  }
}

export const apiClient = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, undefined, {
      ...options,
      timeoutMs: options?.timeoutMs === undefined
        ? DEFAULT_READ_TIMEOUT_MS
        : options.timeoutMs,
    }),
  /**
   * "없을 수도 있는 단일 리소스" 읽기. 본문 없는 200 을 `{}` 가 아니라 `null` 로
   * 돌려주므로 호출부의 `if (!x)` 가드가 실제로 동작한다.
   *
   * 백엔드 핸들러가 `null` 을 반환할 수 있는 GET 은 `get` 대신 이걸 쓴다.
   */
  getNullable: <T>(path: string, options?: ApiRequestOptions): Promise<T | null> =>
    request<T | null>(path, undefined, {
      ...options,
      timeoutMs: options?.timeoutMs === undefined
        ? DEFAULT_READ_TIMEOUT_MS
        : options.timeoutMs,
      emptyBodyAs: 'null',
    }),
  /**
   * GET + Zod parse at the client boundary (Plan D spec § I1).
   * Surfaces API schema drift as a runtime ZodError rather than a silent type cast.
   */
  getParsed: async <Output, Input>(
    path: string,
    schema: ZodType<Output, ZodTypeDef, Input>,
    options?: ApiRequestOptions,
  ): Promise<Output> => {
    const raw = await request<unknown>(path, undefined, {
      ...options,
      timeoutMs: options?.timeoutMs === undefined
        ? DEFAULT_READ_TIMEOUT_MS
        : options.timeoutMs,
    });
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
    options?: ApiRequestOptions & {
      headers?: HeadersInit;
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
      },
      options,
    );
  },
  patch: <T>(path: string, body: unknown, options?: ApiRequestOptions) =>
    request<T>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, options),
  /**
   * PATCH + Zod parse at the client boundary. Mirrors `getParsed` so write paths
   * that depend on server-returned envelope shapes (e.g. `{ images }`) surface
   * drift as a ZodError rather than a silent type cast.
   */
  patchParsed: async <T>(
    path: string,
    schema: ZodType<T>,
    body: unknown,
    options?: ApiRequestOptions,
  ): Promise<T> => {
    const raw = await request<unknown>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, options);
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
  put: <T>(path: string, body: unknown, options?: ApiRequestOptions) =>
    request<T>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, options),
  delete: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(
      path,
      body === undefined
        ? { method: 'DELETE' }
        : {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
      options,
    ),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  /**
   * Response 객체 직접 반환 (blob, stream 등 non-JSON 응답용).
   * 401 auth_required 시 AuthProvider 에 알리고 raw Response 를 그대로 반환하므로 caller 는
   * `res.status === 401` 체크 책임.
   */
  fetchRaw: async (path: string, init?: RequestInit): Promise<Response> =>
    fetchRaw(path, init),
};
