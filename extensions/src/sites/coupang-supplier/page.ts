import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { hostWithin, leftForOperator, type InjectFiles, type PageGuard, type TabPage } from '../tab-page';

/**
 * supplier.coupang.com 탭 한 장에서 같은 출처 주소를 그 탭의 세션으로 읽는다(KID-359). 서비스워커에는 DOMParser가 없어
 * HTML 표는 탭에 주입한 읽기 다리(`content/orders/coupang-supplier-page.js`)가 칸 단위로 펴서 돌려준다.
 * 다리는 필요할 때만 파일로 주입한다(`func.toString()` 주입 없음 — README).
 */
export const COUPANG_SUPPLIER_ORIGIN = 'https://supplier.coupang.com';

export const COUPANG_SUPPLIER_PAGE_FILES: InjectFiles = { isolated: ['content/orders/coupang-supplier-page.js'] };

/** 쿠키가 커져 supplier(Tomcat)가 요청 헤더 과다로 거절(400/413/431). 다시 시도해도 쿠키가 그대로라 풀리지 않는다. */
export const SITE_COOKIE_BLOAT = 'SITE_COOKIE_BLOAT' as const;
export const COOKIE_BLOAT_MESSAGE =
  '쿠팡 접속이 많아 supplier.coupang.com 쿠키가 커져(HTTP 400) 요청이 거부됐습니다. 쿠팡 쿠키를 정리하거나 다시 로그인한 뒤 조회하세요.';
export const SUPPLIER_LOGIN_MESSAGE =
  '쿠팡 서플라이어 허브 로그인이 필요합니다. supplier.coupang.com에 로그인한 뒤 다시 조회해 주세요.';

/** 서플라이어 탭이 있어도 되는 곳: supplier 호스트. 로그인은 쿠팡 통합 로그인(xauth) 또는 supplier의 로그인 경로다. */
export const COUPANG_SUPPLIER_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['supplier.coupang.com']),
  isLogin: isSupplierLoginUrl,
  loginMessage: SUPPLIER_LOGIN_MESSAGE,
};

export function isSupplierLoginUrl(url: URL): boolean {
  return hostWithin(url, ['xauth.coupang.com']) || /\/(?:login|sign-in|signin)(?:[/?#]|$)/i.test(url.pathname);
}

export interface PageCell {
  text: string;
  rowSpan: number;
  header: boolean;
}
export interface PageRow {
  /** `thead`·`tbody`·`tfoot`·`table`. */
  section: string;
  cells: PageCell[];
}
export interface PageTable {
  id: string | null;
  text: string;
  rows: PageRow[];
}

/** 다리가 돌려준 응답. `tables`는 표를 달라고 했을 때만. */
export interface PageFetch {
  status: number;
  redirected: boolean;
  url: string;
  text: string;
  tables: PageTable[] | null;
}

interface FetchAnswer {
  ok?: boolean;
  error?: string;
  status?: number;
  redirected?: boolean;
  url?: string;
  text?: string;
  tables?: PageTable[] | null;
}

/** 요청 하나의 시간 상한. 멈춘 응답이 heartbeat로 잠금을 끝없이 연장하지 않게 끊는다. */
export const SUPPLIER_REQUEST_TIMEOUT_MS = 60_000;

export interface SupplierPage {
  /** 같은 출처 경로(`/ibs/...`)를 읽는다. 다리 실패는 `SITE_REQUEST_FAILED`, 로그인 화면으로 옮겨 간 탭은 `SITE_LOGIN_REQUIRED`. */
  fetch(path: string, options?: { headers?: Record<string, string>; tables?: boolean; timeoutMs?: number }): Promise<PageFetch>;
  /** 탭 본문 앞 400자(쿠키 과다 400 화면 판별). */
  bodyText(): Promise<string>;
  readonly tab: TabPage;
}

export function supplierPage(tab: TabPage): SupplierPage {
  return {
    tab,
    async fetch(path, options = {}) {
      const answer = await tab.ask<FetchAnswer>(
        { type: 'KIDITEM_COUPANG_SUPPLIER_FETCH', url: path, headers: options.headers ?? {}, tables: options.tables === true },
        { timeoutMs: options.timeoutMs ?? SUPPLIER_REQUEST_TIMEOUT_MS, inject: COUPANG_SUPPLIER_PAGE_FILES, guard: COUPANG_SUPPLIER_PAGE_GUARD },
      );
      // 세션이 끊긴 supplier는 로그인 화면으로 리다이렉트해 페이지 fetch가 'Failed to fetch'로 끝난다(옛 수집의 판정).
      if (answer.ok !== true && /failed to fetch/i.test(answer.error ?? '')) throw loginRequired(path);
      if (answer.ok !== true || typeof answer.status !== 'number' || typeof answer.text !== 'string') {
        const reason = answer.error === 'timeout' ? 'timeout' : 'network';
        throw new RuntimeError(SITE_REQUEST_FAILED, reason === 'timeout' ? '서플라이어 허브가 제때 응답하지 않았습니다.' : '서플라이어 허브를 읽지 못했습니다.', {
          status: null,
          url: path,
          reason,
          bodyHead: answer.error ?? null,
        });
      }
      return {
        status: answer.status,
        redirected: answer.redirected === true,
        url: answer.url ?? path,
        text: answer.text,
        tables: Array.isArray(answer.tables) ? answer.tables : null,
      };
    },
    async bodyText() {
      const answer = await tab.ask<{ ok?: boolean; text?: string }>(
        { type: 'KIDITEM_COUPANG_SUPPLIER_BODY_TEXT' },
        { timeoutMs: 10_000, inject: COUPANG_SUPPLIER_PAGE_FILES },
      );
      return typeof answer.text === 'string' ? answer.text : '';
    },
  };
}

export function loginRequired(url: string): RuntimeError {
  return new RuntimeError(SITE_LOGIN_REQUIRED, SUPPLIER_LOGIN_MESSAGE, { url });
}

export function cookieBloat(url: string, status: number | null): RuntimeError {
  return new RuntimeError(SITE_COOKIE_BLOAT, COOKIE_BLOAT_MESSAGE, { url, status });
}

export function responseInvalid(url: string, message: string): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, message, { status: null, url, reason: 'response_invalid', bodyHead: null });
}

/** 탭을 운영자에게 남길 실패인가(로그인·예상 밖 주소). */
export function keepTabFor(error: unknown): boolean {
  return leftForOperator(error);
}
