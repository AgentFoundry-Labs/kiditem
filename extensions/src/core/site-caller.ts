/**
 * 사이트 호출기 — 사이트 API를 부를 때 공용으로 지키는 것: 요청 간격(pacing), XSRF 쿠키 → 헤더,
 * 봇 센서·로그인 만료 감지. `sites/*`는 fetch를 직접 쓰지 않고 이 포트만 쓴다.
 */
export interface SiteCaller {
  json<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  text(url: string, init?: RequestInit): Promise<string>;
}

export interface SiteCallerOptions {
  /** 같은 호출기로 보내는 요청 사이 최소 간격. 옛 수집기 값: 윙 검색 2200, 카탈로그 상세 2000, 리뷰 350, 키워드 1500. */
  minIntervalMs: number;
  /** 쿠키 이름 → 헤더 이름. 윙은 `XSRF-TOKEN` → `X-XSRF-TOKEN`. */
  xsrf?: { cookieUrl: string; cookieName: string; headerName: string };
}

/**
 * 다음 요청까지 기다릴 시간. 순수 규칙, 스펙으로 잠근다.
 * 첫 요청(lastSentAt null)은 0. 이미 간격이 지났으면 0.
 */
export function delayUntilNext(input: { lastSentAt: number | null; now: number; minIntervalMs: number }): number {
  if (input.lastSentAt === null) return 0;
  return Math.max(0, input.lastSentAt + input.minIntervalMs - input.now);
}
