import { ZodType, ZodTypeDef, ZodError } from 'zod';
import { getApiBase } from './api';
import { FieldErrorSchema, resolveErrorCode, type FieldError } from '@kiditem/shared/errors';
import { ApiError, type ApiErrorDetails } from './api-error';
import { notifyAuthRequired } from './auth/browser-auth';
import { composeRequestSignal } from './request-deadline';

const DEFAULT_READ_TIMEOUT_MS = 15_000;

/**
 * Browser authentication is exclusively the HttpOnly cookie. The API client
 * always includes cookie credentials and never reads or attaches a bearer.
 * A 401 `AUTH_REQUIRED` notifies AuthProvider and is never retried.
 * `NO_ORGANIZATION_CONTEXT` 401 은 인증은 유효하나 조직 미할당 상태이므로 refresh 도,
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
  return new ApiError(0, 'REQUEST_TIMEOUT');
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
    throw new ApiError(0, 'NETWORK_FAILED');
  }
}

/** 401 본문의 등록 코드. ADR-0023 봉투는 `code`, 옛 봉투는 `message`(`auth_required`)에 담겼다. */
async function read401Code(
  res: Response,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const body = (await raceWithSignal(signal, () => res.clone().json())) as Record<string, unknown>;
    return resolveErrorCode(body?.code) ?? resolveErrorCode(body?.message);
  } catch (error) {
    if (error instanceof RequestSignalAbort) throw error;
    return null;
  }
}

/**
 * How long `Retry-After` says to wait, in either form the header allows: whole
 * seconds, or an HTTP date. A moment already past means nothing is left to
 * wait for; a header the client cannot read leaves the caller its own cadence.
 */
function retryAfterDetail(res: Response): { retryAfterMs?: number } {
  const header = res.headers.get('Retry-After')?.trim();
  if (!header) return {};
  if (/^\d+$/.test(header)) return { retryAfterMs: Number(header) * 1_000 };
  const until = Date.parse(header);
  return Number.isNaN(until) ? {} : { retryAfterMs: Math.max(0, until - Date.now()) };
}

async function consumeResponse<T>(
  res: Response,
  signal: AbortSignal,
  path: string,
  options?: RequestOptions,
): Promise<T> {
  if (res.status === 401) {
    const code = await read401Code(res, signal);

    if (code === 'AUTH_REQUIRED') {
      if (path !== '/api/auth/me') notifyAuthRequired();
      throw new ApiError(401, 'AUTH_REQUIRED');
    }

    if (code === 'NO_ORGANIZATION_CONTEXT') {
      // 인증은 유효하지만 조직 멤버십이 없음. signOut 하지 않고 caller 가 안내.
      throw new ApiError(401, 'NO_ORGANIZATION_CONTEXT');
    }

    // 기타 401 (희귀) → 일반 ApiError flow 로 fall through
  }

  if (!res.ok) {
    let body: unknown = {};
    try {
      body = await raceWithSignal(signal, () => res.json());
    } catch (error) {
      if (error instanceof RequestSignalAbort) throw error;
    }
    throw apiErrorFromBody(res, body);
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
      if (await read401Code(res, signal) === 'AUTH_REQUIRED') {
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
    throw new ApiError(0, 'NETWORK_FAILED');
  }
}

export const apiClient = {
  get: <T>(path: string, options?: ApiRequestOptions & { headers?: HeadersInit }) =>
    request<T>(path, options?.headers ? { headers: options.headers } : undefined, {
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

/**
 * 오류 응답 → `ApiError`. ADR-0023 봉투(`code`·`kind`·`message`·`errors`·`details`)를 읽고, 옛 봉투
 * (`error`·영어 `message`·최상위 `attemptId`/`existing`)는 `resolveErrorCode(body.code ?? body.error)`로
 * 이행한다. 문장이 한국어가 아니면 `ApiError`가 코드의 레지스트리 문장으로 바꾼다.
 */
function apiErrorFromBody(res: Response, body: unknown): ApiError {
  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const details = (record.details && typeof record.details === 'object' ? record.details : {}) as Record<string, unknown>;
  const rawCode = typeof record.code === 'string' ? record.code : typeof record.error === 'string' ? record.error : null;
  const attemptId = details.attemptId ?? record.attemptId;
  const reason = details.reason ?? record.reason;
  const parsed: ApiErrorDetails = {
    ...(typeof attemptId === 'string' && attemptId ? { attemptId } : {}),
    ...(typeof reason === 'string' && reason ? { reason } : {}),
    ...existingSalesProductDetail(details.existing ?? record.existing),
    ...retryAfterDetail(res),
  };
  return new ApiError(
    res.status,
    rawCode,
    typeof record.message === 'string' ? record.message : null,
    parsed,
    fieldErrors(record.errors),
  );
}

function fieldErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = FieldErrorSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** 중복 거절(409)이 가리키는 기존 판매 상품. 화면이 그 초안으로 가는 링크를 낸다(KID-313). */
function existingSalesProductDetail(
  existing: unknown,
): { existingSalesProductId?: string; existingSalesProductStatus?: string } {
  if (!existing || typeof existing !== 'object') return {};
  const { salesProductId, salesProductStatus } = existing as Record<string, unknown>;
  if (typeof salesProductId !== 'string' || !salesProductId) return {};
  return {
    existingSalesProductId: salesProductId,
    ...(typeof salesProductStatus === 'string' && salesProductStatus ? { existingSalesProductStatus: salesProductStatus } : {}),
  };
}
