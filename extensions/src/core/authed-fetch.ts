import type { ApiPort } from './api';
import type { AuthStore } from './auth-store';
import { requireEnvironment, type EnvironmentId, type EnvironmentProfile } from './environment';
import { RuntimeError } from './errors';

/**
 * KidItem API 호출(KID-366, 옛 `environment-context.js` `authedFetch`를 옮겼다). 환경의 API origin 안 경로만 부르고,
 * 저장소의 Bearer 토큰을 붙인다. 토큰이 없거나 401이면 그 환경의 웹 탭에 재로그인 힌트(`requestAuth`)를 보내고
 * 웹이 새 토큰을 보내 주길 잠시 기다렸다가 한 번만 다시 부른다. 어느 탭에 어떻게 힌트를 보낼지는 입구가 정한다.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
export const DEFAULT_AUTH_RESYNC_TIMEOUT_MS = 10_000;

export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export interface ApiDeps {
  store: AuthStore;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** 그 환경 웹 탭에 "토큰을 다시 보내 달라"는 힌트를 보낸다. 실패해도 던지지 않는다. */
  requestAuth(environment: EnvironmentProfile): void | Promise<void>;
  requestTimeoutMs?: number;
  resyncTimeoutMs?: number;
}

export interface ApiClient {
  /** 표에 없는 환경 id는 `VALIDATION_FAILED`로 던진다. */
  apiPort(environmentId: string): ApiPort;
}

export function createApiClient(deps: ApiDeps): ApiClient {
  const requestTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const resyncTimeoutMs = deps.resyncTimeoutMs ?? DEFAULT_AUTH_RESYNC_TIMEOUT_MS;
  // 같은 환경에서 동시에 막힌 호출은 힌트 하나를 함께 기다린다.
  const resyncs = new Map<EnvironmentId, Promise<string | null>>();

  function resync(environment: EnvironmentProfile, previous: string | null): Promise<string | null> {
    const active = resyncs.get(environment.environmentId);
    if (active) return active;
    const waiting = deps.store.waitForNewToken(environment.environmentId, previous, resyncTimeoutMs);
    Promise.resolve()
      .then(() => deps.requestAuth(environment))
      .catch(() => undefined);
    const shared = waiting.finally(() => {
      if (resyncs.get(environment.environmentId) === shared) resyncs.delete(environment.environmentId);
    });
    resyncs.set(environment.environmentId, shared);
    return shared;
  }

  async function fetchOnce(environment: EnvironmentProfile, url: string, init: ApiRequestInit, token: string): Promise<Response> {
    const { timeoutMs = requestTimeoutMs, signal: callerSignal, ...requestInit } = init;
    const headers = new Headers(requestInit.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    const controller = new AbortController();
    const forward = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) forward();
    else callerSignal?.addEventListener('abort', forward, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      controller.signal.throwIfAborted();
      return await deps.fetch(url, { ...requestInit, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', forward);
    }
  }

  function withCallerSignal<T>(work: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
    if (!signal) return work;
    signal.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  }

  return {
    apiPort(environmentId) {
      const environment = requireEnvironment(environmentId);
      return {
        async fetch(path, init: ApiRequestInit = {}) {
          const { environmentId: id } = environment;
          let url: string;
          try {
            url = new URL(path, `${environment.apiOrigin}/`).toString();
          } catch {
            url = '';
          }
          if (!url || new URL(url).origin !== environment.apiOrigin) {
            throw new RuntimeError('VALIDATION_FAILED', '서버 주소를 벗어난 요청입니다.', { environmentId: id });
          }
          let token = await deps.store.getAccessToken(id);
          if (!token) {
            token = await withCallerSignal(resync(environment, null), init.signal);
            if (!token) throw new RuntimeError('AUTH_REQUIRED', '로그인이 필요합니다. 다시 로그인해 주세요.', { environmentId: id });
          }
          const response = await fetchOnce(environment, url, init, token);
          if (response.status !== 401) return response;
          const next = await withCallerSignal(resync(environment, token), init.signal);
          if (!next || next === token) return response;
          return fetchOnce(environment, url, init, next);
        },
      };
    },
  };
}
