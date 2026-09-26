import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import type { TabPages } from '../tab-page';
import { parseCoupangSearchEvidence, type CoupangSearchEvidence, type CoupangSuggestionItem } from './parse';
import { registerSite } from '../registry';

const ORIGIN = 'https://www.coupang.com';
const PAGE_TIMEOUT_MS = 60_000;
const EVIDENCE_TIMEOUT_MS = 30_000;
/** 검색 화면이 다 그려진 뒤 연관 링크가 붙기까지 기다림(옛 수집기 값). */
const SETTLE_MS = 1_500;
const CONTENT_FILE = 'content/sourcing/coupang-search-page.js';

/** 쿠팡 검색(www.coupang.com/np/search). 탭은 이 사이트가 열고 닫는다(잠금 키 `resource:coupang:*`는 탭을 잡지 않는다). */
export const COUPANG_SEARCH_SITE: SiteDefinition = {
  name: 'coupang-search',
  origin: ORIGIN,
  caller: { minIntervalMs: SETTLE_MS, displayName: '쿠팡' },
};

export interface CoupangKeywordSuggestions {
  items: CoupangSuggestionItem[];
  productNameTokens: Array<{ keyword: string; count: number }>;
  warnings: string[];
}

export function buildCoupangSearchUrl(keyword: string): string {
  return `${ORIGIN}/np/search?component=&q=${encodeURIComponent(keyword)}&channel=user`;
}

export function isCoupangSearchUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'www.coupang.com' && url.port === ''
      && url.username === '' && url.password === '' && /^\/np\/search\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * 키워드 하나의 추천 키워드: 검색 탭을 백그라운드로 열고, 로그인 화면으로 튕기면 `SITE_LOGIN_REQUIRED`,
 * 다 그려지면 content script(`coupang-search-page.js`, 없으면 주입)에게 근거를 묻고 규칙대로 거른다.
 */
export function createCoupangSearchSite(tabs: TabPages, deps: { sleep(ms: number): Promise<void> }) {
  return {
    async keywordSuggestions(keyword: string, maxResults: number): Promise<CoupangKeywordSuggestions> {
      const url = buildCoupangSearchUrl(keyword);
      const page = await tabs.open('about:blank');
      try {
        const landed = await page.navigate(url, { timeoutMs: PAGE_TIMEOUT_MS });
        if (!isCoupangSearchUrl(landed)) {
          throw new RuntimeError(SITE_LOGIN_REQUIRED, '쿠팡 로그인이 필요합니다. 쿠팡에 로그인한 뒤 다시 수집해 주세요.', { url: landed });
        }
        await deps.sleep(SETTLE_MS);
        const evidence = await page.ask<Partial<CoupangSearchEvidence> & { ok?: boolean; error?: string }>(
          { type: 'KIDITEM_COUPANG_SEARCH_EVIDENCE', keyword },
          { timeoutMs: EVIDENCE_TIMEOUT_MS, inject: { isolated: [CONTENT_FILE] } },
        );
        if (!evidence.links || !evidence.productNames) {
          throw new RuntimeError(SITE_REQUEST_FAILED, `쿠팡 검색 화면을 읽지 못했습니다(${evidence.error}).`, { status: null, url });
        }
        const parsed = parseCoupangSearchEvidence({ autocomplete: evidence.autocomplete ?? null, links: evidence.links, productNames: evidence.productNames }, keyword, maxResults);
        if (!parsed.ok) {
          // 인증 거절(401·403)만 로그인이다. 429는 잠시 뒤 다시 할 요청 실패, 근거 없음도 요청 실패다.
          throw new RuntimeError(parsed.reason === 'provider_denied' ? SITE_LOGIN_REQUIRED : SITE_REQUEST_FAILED, parsed.message,
            { status: parsed.reason === 'rate_limited' ? 429 : null, url, reason: parsed.reason, warnings: parsed.warnings });
        }
        return { items: parsed.items, productNameTokens: parsed.productNameTokens, warnings: parsed.warnings };
      } finally {
        await page.close();
      }
    },
  };
}

export type CoupangSearchSite = ReturnType<typeof createCoupangSearchSite>;

registerSite({ name: COUPANG_SEARCH_SITE.name, create: (deps) => createCoupangSearchSite(deps.tabs, { sleep: deps.sleep }) });
