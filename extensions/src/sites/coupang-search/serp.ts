import type { KeywordSerpItem } from '@kiditem/shared/advertising-operations';
import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import {
  checkPageUrl,
  hostWithin,
  leftForOperator,
  type AttentionListener,
  type PageGuard,
  type SiteAttention,
  type TabPage,
  type TabPages,
} from '../tab-page';

const ORIGIN = 'https://www.coupang.com';
const PAGE_TIMEOUT_MS = 60_000;
const EXTRACTION_TIMEOUT_MS = 20_000;
/** 검색 화면이 다 그려지기까지 기다림(옛 수집기 1.2초). */
const RENDER_WAIT_MS = 1_200;
/** 쪽 사이 1.5–3초, 키워드 사이 4–8초(옛 수집기 값). */
const PAGE_DELAY_MS: readonly [number, number] = [1_500, 3_000];
const KEYWORD_DELAY_MS: readonly [number, number] = [4_000, 8_000];
/** 보안문자 화면에서 운영자를 기다리는 동안 다시 보는 간격과 상한(1688 검증 대기와 같은 10분). */
const WALL_POLL_MS = 5_000;
const WALL_WAIT_MAX_MS = 10 * 60_000;
const WALL_REMIND_MS = 3 * 60_000;
const CONTENT_FILE = 'content/advertising/coupang-serp-page.js';

export const SITE_VERIFICATION_REQUIRED = 'SITE_VERIFICATION_REQUIRED' as const;

/** 쿠팡 검색 탭이 있어도 되는 곳: coupang.com(로그인 화면 제외). */
export const COUPANG_SERP_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['coupang.com']),
  isLogin: (url) => hostWithin(url, ['login.coupang.com']),
  loginMessage: '쿠팡 로그인 화면으로 옮겨 갔습니다. 열려 있는 쿠팡 탭을 확인한 뒤 다시 수집해 주세요.',
};

export function buildCoupangSerpUrl(keyword: string, page: number): string {
  return `${ORIGIN}/np/search?q=${encodeURIComponent(keyword)}&channel=user&page=${page}&listSize=36`;
}

/** 우리가 연 그 쪽의 검색 화면인가(q·channel·page·listSize가 같다). 아니면 보안 확인·다른 화면으로 옮겨 간 것이다. */
export function isExpectedSerpUrl(actual: string, expected: string): boolean {
  try {
    const left = new URL(actual);
    const right = new URL(expected);
    if (left.protocol !== 'https:' || left.hostname !== 'www.coupang.com' || left.pathname !== '/np/search') return false;
    return ['q', 'channel', 'page', 'listSize'].every((name) => left.searchParams.get(name) === right.searchParams.get(name));
  } catch {
    return false;
  }
}

interface PageRead {
  ok?: boolean;
  error?: string;
  url?: string;
  wall?: 'captcha' | 'login' | null;
  resultListObserved?: boolean;
  items?: unknown[];
}

export interface CoupangSerpResult {
  pagesScanned: number;
  stopReason: 'page_limit' | 'empty_page' | 'provider_wall' | 'invalid_result';
  items: KeywordSerpItem[];
}

export interface CoupangSerpDeps {
  sleep(ms: number): Promise<void>;
  now(): number;
  random(): number;
}

/**
 * 쿠팡 검색 결과(SERP) 읽기(KID-362, `advertising.keyword_serp`). 백그라운드 탭 하나를 쪽·키워드마다 옮겨 가며
 * content script(`coupang-serp-page.js`)에 상품 카드를 묻는다. 보안문자·보안 확인 화면이면 실패하지 않고 탭을 연 채
 * 운영자를 기다렸다가(`onAttention`) 같은 쪽을 다시 읽는다(1688과 같다) — 10분 안에 풀리지 않으면
 * `SITE_VERIFICATION_REQUIRED`. 로그인 화면·사이트 밖 주소는 탭을 남기고 멈춘다. 읽기만 한다.
 */
export function createCoupangSerp(tabs: TabPages, deps: CoupangSerpDeps) {
  let page: TabPage | null = null;
  let keepOpen = false;
  let keywordsRead = 0;
  const between = ([low, high]: readonly [number, number]) => deps.sleep(Math.floor(low + deps.random() * (high - low)));

  async function read(current: TabPage, url: string): Promise<{ landed: string; read: PageRead | null }> {
    const landed = await current.navigate(url, { timeoutMs: PAGE_TIMEOUT_MS, continueOnTimeout: true });
    if (!isExpectedSerpUrl(landed, url)) return { landed, read: null };
    await deps.sleep(RENDER_WAIT_MS);
    try {
      const answer = await current.ask<PageRead>(
        { type: 'KIDITEM_COUPANG_SERP_ITEMS' },
        { timeoutMs: EXTRACTION_TIMEOUT_MS, inject: { isolated: [CONTENT_FILE] }, guard: COUPANG_SERP_PAGE_GUARD },
      );
      return { landed, read: answer };
    } catch (error) {
      if (leftForOperator(error)) keepOpen = true;
      throw error;
    }
  }

  /** 보안 화면이 풀릴 때까지 같은 쪽을 다시 읽는다. 풀리면 그 읽기, 상한을 넘으면 실패. */
  async function waitThroughWall(current: TabPage, url: string, attention: SiteAttention, onAttention?: AttentionListener) {
    const started = deps.now();
    let remindedAt = started;
    await onAttention?.(attention);
    for (;;) {
      if (deps.now() - started >= WALL_WAIT_MAX_MS) {
        keepOpen = true;
        throw new RuntimeError(SITE_VERIFICATION_REQUIRED, '쿠팡이 보안 확인을 요구합니다. 열려 있는 쿠팡 탭에서 확인한 뒤 다시 수집해 주세요.', { keyword: attention.label });
      }
      await deps.sleep(WALL_POLL_MS);
      if (deps.now() - remindedAt >= WALL_REMIND_MS) {
        remindedAt = deps.now();
        await onAttention?.(attention);
      }
      const here = await current.currentUrl().catch(() => '');
      // 운영자가 보안 확인을 통과하면 쿠팡이 검색 화면으로 돌려보낸다(아니면 우리가 다시 연다).
      const again = isExpectedSerpUrl(here, url) ? await readInPlace(current) : await read(current, url).then((result) => result.read);
      if (again && again.ok && again.wall !== 'captcha') {
        await onAttention?.(null);
        return again;
      }
    }
  }

  async function readInPlace(current: TabPage): Promise<PageRead | null> {
    return current.ask<PageRead>(
      { type: 'KIDITEM_COUPANG_SERP_ITEMS' },
      { timeoutMs: EXTRACTION_TIMEOUT_MS, inject: { isolated: [CONTENT_FILE] }, guard: COUPANG_SERP_PAGE_GUARD },
    ).catch(() => null);
  }

  return {
    async serp(keyword: string, maxPages: number, options: { onAttention?: AttentionListener } = {}): Promise<CoupangSerpResult> {
      if (keywordsRead > 0) await between(KEYWORD_DELAY_MS);
      keywordsRead += 1;
      page ??= await tabs.open('about:blank');
      const current = page;
      const attention: SiteAttention = { kind: 'verification', site: '쿠팡', label: keyword };
      const items: KeywordSerpItem[] = [];
      let stopReason: CoupangSerpResult['stopReason'] = 'page_limit';
      let pagesScanned = 0;
      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
        const url = buildCoupangSerpUrl(keyword, pageNumber);
        const first = await read(current, url);
        let answer = first.read;
        if (answer === null) failIfLeftSite(first.landed, () => { keepOpen = true; });
        if (answer === null || answer.wall === 'captcha') {
          // 보안 확인 화면(주소가 바뀌었거나 검색 화면 위 보안문자) — 운영자가 풀 때까지 기다린다.
          answer = await waitThroughWall(current, url, attention, options.onAttention);
        }
        if (!answer?.ok) {
          throw new RuntimeError(SITE_REQUEST_FAILED, `쿠팡 검색 '${keyword}' 결과를 읽지 못했습니다(${answer?.error ?? '알 수 없음'}).`, { status: null, keyword });
        }
        const pageItems = normalizeSerpItems(answer.items ?? [], pageNumber, items.length);
        if (pageItems.length === 0) {
          if (pageNumber === 1) {
            throw new RuntimeError(SITE_REQUEST_FAILED, `쿠팡 검색 '${keyword}' 결과가 비어 있습니다 — 상품 목록을 찾지 못했습니다.`, { status: null, keyword, reason: 'empty_first_page' });
          }
          stopReason = answer.wall ? 'provider_wall' : answer.resultListObserved === true ? 'empty_page' : 'invalid_result';
          break;
        }
        items.push(...pageItems);
        pagesScanned = pageNumber;
        if (pageNumber < maxPages) await between(PAGE_DELAY_MS);
      }
      return { pagesScanned, stopReason, items };
    },
    /** 수집이 끝나면 탭을 닫는다. 보안 확인·로그인에서 멈췄으면 운영자가 볼 수 있게 남긴다. */
    async closeSerp() {
      if (page && !keepOpen) await page.close();
      page = null;
    },
  };
}

/** 로그인 화면이나 쿠팡 밖 주소면 탭을 운영자에게 남기고 멈춘다(기다리지 않는다 — 세션 문제다). */
function failIfLeftSite(landed: string, keep: () => void): void {
  let url: URL;
  try {
    url = new URL(landed);
  } catch {
    return;
  }
  if (!COUPANG_SERP_PAGE_GUARD.isLogin(url) && COUPANG_SERP_PAGE_GUARD.allows(url)) return;
  keep();
  checkPageUrl(COUPANG_SERP_PAGE_GUARD, landed);
}

/** content script 한 쪽 → SERP 항목(전체 순번 `rank`는 앞 쪽들 뒤로 이어서). 서버 계약의 길이·범위를 넘는 값은 버린다. */
export function normalizeSerpItems(raw: readonly unknown[], page: number, offset: number): KeywordSerpItem[] {
  const items: KeywordSerpItem[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== 'object') continue;
    const row = candidate as Record<string, unknown>;
    const productId = text(row.productId, 40);
    if (!productId) continue;
    const position = items.length + 1;
    items.push({
      rank: offset + position,
      page,
      positionInPage: position,
      isAd: row.isAd === true,
      productId,
      itemId: text(row.itemId, 40),
      vendorItemId: text(row.vendorItemId, 40),
      name: text(row.name, 300),
      priceKrw: count(row.priceKrw),
      reviewCount: count(row.reviewCount),
      ratingScore: typeof row.ratingScore === 'number' && row.ratingScore >= 0 && row.ratingScore <= 5 ? row.ratingScore : null,
      imageUrl: text(row.imageUrl, 2_000),
      link: text(row.link, 2_000),
    });
  }
  return items;
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}
