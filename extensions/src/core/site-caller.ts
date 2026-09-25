import { RuntimeError } from './errors';

/**
 * 사이트 호출기 — 사이트 API를 부를 때 공용으로 지키는 것: 요청 간격(pacing), XSRF 쿠키 → 헤더,
 * 봇 센서·로그인 만료 감지. `sites/*`는 fetch를 직접 쓰지 않고 이 포트만 쓴다.
 */
/** `requireXsrf`: XSRF 쿠키가 없으면 보내지 않는다(윙 엑셀 요청처럼 헤더가 꼭 필요한 요청). */
export type SiteRequestInit = RequestInit & { requireXsrf?: boolean };

export interface SiteCaller {
  json<T = unknown>(url: string, init?: SiteRequestInit): Promise<T>;
  text(url: string, init?: SiteRequestInit): Promise<string>;
  /** 본문 바이트(파일 내려받기). */
  bytes(url: string, init?: SiteRequestInit): Promise<Uint8Array>;
}

export interface SiteCallerOptions {
  /** 같은 호출기로 보내는 요청 사이 최소 간격. 옛 수집기 값: 윙 검색 2200, 카탈로그 상세 2000, 리뷰 350, 키워드 1500. */
  minIntervalMs: number;
  /** 쿠키 이름 → 헤더 이름. 윙은 `XSRF-TOKEN` → `X-XSRF-TOKEN`. */
  xsrf?: { cookieUrl: string; cookieName: string; headerName: string };
  /** 운영자에게 보이는 사이트 이름(`쿠팡 윙`). 로그인 문장이 어디에 로그인할지 말한다. */
  displayName?: string;
}

/**
 * 다음 요청까지 기다릴 시간. 순수 규칙, 스펙으로 잠근다.
 * 첫 요청(lastSentAt null)은 0. 이미 간격이 지났으면 0.
 */
export function delayUntilNext(input: { lastSentAt: number | null; now: number; minIntervalMs: number }): number {
  if (input.lastSentAt === null) return 0;
  return Math.max(0, input.lastSentAt + input.minIntervalMs - input.now);
}

export const SITE_REQUEST_FAILED = 'SITE_REQUEST_FAILED' as const;
export const SITE_LOGIN_REQUIRED = 'SITE_LOGIN_REQUIRED' as const;

/** 호출기가 쓰는 바깥 경계. 입구가 `fetch`·`chrome.cookies`·시계를 묶어 준다. */
export interface SiteCallerDeps {
  fetch(input: string, init?: RequestInit): Promise<Response>;
  cookies: { get(details: { url: string; name: string }): Promise<{ value: string } | null> };
  now(): number;
  sleep(ms: number): Promise<void>;
}

/**
 * 간격·XSRF·로그인 만료를 지키는 사이트 호출기. XSRF 헤더는 쿠키가 있을 때 싣는다. 요청은 한 줄로 보내 동시에 불러도 간격이 유지된다.
 * 리다이렉트는 따라가지 않는다(`redirect: 'manual'`) — 로그인 페이지로 튕기면 `SITE_LOGIN_REQUIRED`.
 */
export function createSiteCaller(options: SiteCallerOptions, deps: SiteCallerDeps): SiteCaller {
  let lastSentAt: number | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const loginMessage = options.displayName ? `${options.displayName} 로그인이 필요합니다.` : '사이트 로그인이 필요합니다.';

  async function send(url: string, { requireXsrf = false, ...init }: SiteRequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (options.xsrf) {
      // 쿠키가 있으면 헤더로 싣는다. 로그인 판정은 응답으로만 한다 — 헤더가 꼭 필요한 요청만 여기서 멈춘다.
      const cookie = await deps.cookies.get({ url: options.xsrf.cookieUrl, name: options.xsrf.cookieName });
      const token = decodeCookie(cookie?.value);
      if (token) headers.set(options.xsrf.headerName, token);
      else if (requireXsrf) throw new RuntimeError(SITE_LOGIN_REQUIRED, loginMessage, { url, reason: 'xsrf_cookie_missing' });
    }
    const wait = delayUntilNext({ lastSentAt, now: deps.now(), minIntervalMs: options.minIntervalMs });
    if (wait > 0) await deps.sleep(wait);
    lastSentAt = deps.now();
    let response: Response;
    try {
      response = await deps.fetch(url, { credentials: 'include', redirect: 'manual', ...init, headers });
    } catch (error) {
      throw new RuntimeError(SITE_REQUEST_FAILED, '사이트에 연결하지 못했습니다.', { status: null, url }, error);
    }
    if (response.status === 401 || response.status === 403 || response.type === 'opaqueredirect') {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, loginMessage, { status: response.status, url });
    }
    if (!response.ok) {
      throw new RuntimeError(SITE_REQUEST_FAILED, `사이트 요청이 실패했습니다(${response.status}).`, { status: response.status, url });
    }
    return response;
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task);
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    json: <T>(url: string, init?: SiteRequestInit) =>
      enqueue(async () => {
        const response = await send(url, init);
        try {
          return (await response.json()) as T;
        } catch (error) {
          throw new RuntimeError(SITE_REQUEST_FAILED, '사이트 응답이 JSON이 아닙니다.', { status: response.status, url }, error);
        }
      }),
    text: (url, init) => enqueue(async () => (await send(url, init)).text()),
    bytes: (url, init) => enqueue(async () => new Uint8Array(await (await send(url, init)).arrayBuffer())),
  };
}

function decodeCookie(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value) || null;
  } catch {
    return null;
  }
}
