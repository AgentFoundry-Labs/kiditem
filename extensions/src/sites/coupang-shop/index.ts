import type { CompetitorCatalogItem, CompetitorCatalogProduct, CompetitorCatalogTarget } from '@kiditem/shared/advertising-operations';
import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { SiteDefinition } from '../site';
import {
  checkPageUrl,
  hostWithin,
  leftForOperator,
  waitForOperator,
  type AttentionListener,
  type PageGuard,
  type TabPage,
  type TabPages,
} from '../tab-page';
import { registerSite } from '../registry';

const ORIGIN = 'https://shop.coupang.com';
const PAGE_TIMEOUT_MS = 60_000;
/** 스크롤이 최대 45번 × 0.65초라 읽기 한 번은 길다. */
const CATALOG_TIMEOUT_MS = 90_000;
const SORT_TIMEOUT_MS = 20_000;
/** 판매자샵이 다 그려지기까지·최신순을 누른 뒤 기다림(옛 수집기 1.2초). */
const RENDER_WAIT_MS = 1_200;
const CONTENT_FILE = 'content/advertising/coupang-shop-catalog.js';

export const SITE_VERIFICATION_REQUIRED = 'SITE_VERIFICATION_REQUIRED' as const;

/** 쿠팡 판매자샵(shop.coupang.com). 탭은 이 사이트가 열고 닫는다(잠금 키 `org`는 탭을 잡지 않는다). */
export const COUPANG_SHOP_SITE: SiteDefinition = {
  name: 'coupang-shop',
  origin: ORIGIN,
  caller: { minIntervalMs: 0, displayName: '쿠팡 판매자샵' },
};

export const COUPANG_SHOP_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['coupang.com']),
  isLogin: (url) => hostWithin(url, ['login.coupang.com']),
  loginMessage: '쿠팡 로그인 화면으로 옮겨 갔습니다. 열려 있는 쿠팡 탭을 확인한 뒤 다시 수집해 주세요.',
};

/** 서버가 고른 판매자샵 주소인가(경로·쿼리가 같다). 그 밖의 주소는 열지 않는다(임의 주소 이동 금지). */
export function isExpectedShopUrl(actual: string, expected: string): boolean {
  try {
    const left = new URL(actual);
    const right = new URL(expected);
    return left.protocol === 'https:' && left.hostname === 'shop.coupang.com' && right.hostname === 'shop.coupang.com'
      && /^\/(?:vid\/)?[A-Za-z0-9_-]+\/?$/.test(right.pathname) && left.pathname === right.pathname && left.search === right.search;
  } catch {
    return false;
  }
}

interface CatalogAnswer {
  ok?: boolean;
  error?: string;
  sellerName?: unknown;
  totalProductCount?: unknown;
  products?: unknown[];
}

/**
 * 판매자샵 카탈로그 읽기(KID-362, `advertising.competitor_catalog`). 백그라운드 탭 하나를 판매자마다 옮겨 가며, 최신순을
 * 누르고 끝까지 스크롤해 상품 카드를 읽는다(content script `coupang-shop-catalog.js`). 판매자샵이 아닌 쿠팡 화면(보안 확인)으로
 * 옮겨 가면 운영자를 기다렸다가 같은 판매자를 다시 연다. 목록을 못 읽으면 그 판매자에서 실패한다. 읽기만 한다.
 */
export function createCoupangShopSite(tabs: TabPages, deps: { sleep(ms: number): Promise<void> }) {
  let page: TabPage | null = null;
  let keepOpen = false;
  const ask = <T>(current: TabPage, message: Record<string, unknown>, timeoutMs: number) =>
    current.ask<T & { ok?: boolean; error?: string }>(message, { timeoutMs, inject: { isolated: [CONTENT_FILE] }, guard: COUPANG_SHOP_PAGE_GUARD })
      .catch((error: unknown) => {
        if (leftForOperator(error)) keepOpen = true;
        throw error;
      });
  return {
    async catalog(target: CompetitorCatalogTarget, productLimit: number, options: { onAttention?: AttentionListener } = {}): Promise<CompetitorCatalogItem> {
      page ??= await tabs.open('about:blank');
      const current = page;
      for (;;) {
        const landed = await current.navigate(target.sellerStoreUrl, { timeoutMs: PAGE_TIMEOUT_MS, continueOnTimeout: true });
        if (isExpectedShopUrl(landed, target.sellerStoreUrl)) break;
        try {
          checkPageUrl(COUPANG_SHOP_PAGE_GUARD, landed);
        } catch (error) {
          if (leftForOperator(error)) keepOpen = true;
          throw error;
        }
        const cleared = await waitForOperator(current, (url) => !isExpectedShopUrl(url, target.sellerStoreUrl),
          { kind: 'verification', site: '쿠팡', label: target.sellerName }, options.onAttention);
        if (!cleared) {
          keepOpen = true;
          throw new RuntimeError(SITE_VERIFICATION_REQUIRED, '쿠팡이 보안 확인을 요구합니다. 열려 있는 쿠팡 탭에서 확인한 뒤 다시 수집해 주세요.', { url: landed });
        }
      }
      await deps.sleep(RENDER_WAIT_MS);
      const sorted = await ask<{ clicked?: boolean }>(current, { type: 'KIDITEM_COUPANG_SHOP_SORT_NEWEST' }, SORT_TIMEOUT_MS);
      if (sorted.clicked !== true) {
        throw new RuntimeError(SITE_REQUEST_FAILED, `'${target.sellerName}' 판매자샵의 최신순 정렬을 확인하지 못했습니다.`, { status: null, sellerId: target.sellerId });
      }
      await deps.sleep(RENDER_WAIT_MS);
      const answer = await ask<CatalogAnswer>(current, { type: 'KIDITEM_COUPANG_SHOP_CATALOG', maxItems: productLimit }, CATALOG_TIMEOUT_MS);
      const catalog = answer.ok ? toCatalog(answer, target, productLimit) : null;
      if (!catalog) {
        throw new RuntimeError(SITE_REQUEST_FAILED, `'${target.sellerName}' 판매자샵 상품 목록을 확인하지 못했습니다.`, { status: null, sellerId: target.sellerId });
      }
      return catalog;
    },
    /** 수집이 끝나면 탭을 닫는다. 보안 확인·로그인에서 멈췄으면 운영자가 볼 수 있게 남긴다. */
    async close() {
      if (page && !keepOpen) await page.close();
      page = null;
    },
  };
}

export type CoupangShopSite = ReturnType<typeof createCoupangShopSite>;

/** content script 답 → 카탈로그(서버 계약의 길이·범위 안으로). 상품이 하나도 없으면 null. */
export function toCatalog(answer: CatalogAnswer, target: CompetitorCatalogTarget, productLimit: number): CompetitorCatalogItem | null {
  const products: CompetitorCatalogProduct[] = [];
  for (const raw of answer.products ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const productId = text(row.productId, 200);
    const itemId = text(row.itemId, 200);
    const vendorItemId = text(row.vendorItemId, 200);
    const name = text(row.name, 500);
    if (!name || (!productId && !itemId && !vendorItemId)) continue;
    products.push({
      sourceRank: products.length + 1,
      productId,
      itemId,
      vendorItemId,
      name,
      priceKrw: count(row.priceKrw),
      reviewCount: count(row.reviewCount),
      imageUrl: text(row.imageUrl, 2_000),
      link: text(row.link, 2_000),
    });
    if (products.length >= productLimit) break;
  }
  if (products.length === 0) return null;
  const totalProductCount = count(answer.totalProductCount);
  return {
    keyword: target.keyword,
    sellerId: target.sellerId,
    sellerName: text(answer.sellerName, 300) ?? target.sellerName,
    sellerStoreUrl: target.sellerStoreUrl,
    totalProductCount,
    collectedProductCount: products.length,
    isTruncated: totalProductCount !== null && totalProductCount > products.length,
    sort: 'newest',
    capturedAt: new Date().toISOString(),
    products,
  };
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}

registerSite({ name: COUPANG_SHOP_SITE.name, create: (deps) => createCoupangShopSite(deps.tabs, { sleep: deps.sleep }) });
