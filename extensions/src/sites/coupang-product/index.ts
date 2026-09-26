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

const ORIGIN = 'https://www.coupang.com';
const PAGE_TIMEOUT_MS = 60_000;
const ASK_TIMEOUT_MS = 20_000;
/** 상세가 다 그려지기까지 기다림, 못 찾으면 한 번 더 기다렸다 다시 본다(옛 수집기 1.2초). */
const RENDER_WAIT_MS = 1_200;
/** 상품 사이 0.9–1.5초(옛 수집기 값). */
const PRODUCT_DELAY_MS: readonly [number, number] = [900, 1_500];
const CONTENT_FILE = 'content/advertising/coupang-product-seller.js';

export const SITE_VERIFICATION_REQUIRED = 'SITE_VERIFICATION_REQUIRED' as const;

/** 쿠팡 상품 상세(www.coupang.com/vp/products). 탭은 이 사이트가 열고 닫는다(잠금 키 `org`는 탭을 잡지 않는다). */
export const COUPANG_PRODUCT_SITE: SiteDefinition = {
  name: 'coupang-product',
  origin: ORIGIN,
  caller: { minIntervalMs: 0, displayName: '쿠팡' },
};

export const COUPANG_PRODUCT_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['coupang.com']),
  isLogin: (url) => hostWithin(url, ['login.coupang.com']),
  loginMessage: '쿠팡 로그인 화면으로 옮겨 갔습니다. 열려 있는 쿠팡 탭을 확인한 뒤 다시 수집해 주세요.',
};

export interface SellerIdentity {
  sellerName: string;
  sellerId: string;
  sellerStoreUrl: string;
}

export function isProductDetailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.coupang.com' && url.port === '' && url.username === ''
      && /^\/vp\/products\/\d+$/.test(url.pathname);
  } catch {
    return false;
  }
}

/** 우리가 연 그 상품 상세인가(경로, 그리고 연 주소에 있던 itemId·vendorItemId가 같다). */
export function isExpectedProductUrl(actual: string, expected: string): boolean {
  if (!isProductDetailUrl(actual) || !isProductDetailUrl(expected)) return false;
  const left = new URL(actual);
  const right = new URL(expected);
  if (left.pathname !== right.pathname) return false;
  return ['itemId', 'vendorItemId'].every((name) => right.searchParams.get(name) === null || left.searchParams.get(name) === right.searchParams.get(name));
}

/**
 * 판매자 상점 링크 → 판매자(옛 `KidItemCoupangSellerDetail.extractCoupangSellerShopLink`). 주소는
 * `shop.coupang.com/<id>` 또는 `/vid/<id>`, 이름은 "판매자 상품 보러가기" 꼬리를 떼고 120자. 이름이 비거나 일반어면 null.
 */
export function parseSellerShopLink(value: { href?: unknown; text?: unknown } | null | undefined): SellerIdentity | null {
  const href = typeof value?.href === 'string' ? value.href.trim() : '';
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'shop.coupang.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const vid = parts[0] === 'vid';
  const sellerId = vid ? parts[1] : parts[0];
  if (!sellerId || !/^[A-Za-z0-9_-]{1,80}$/.test(sellerId)) return null;
  const sellerName = String(value?.text ?? '')
    .replace(/\s*판매자\s*상품\s*보러가기\s*$/i, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (!sellerName || /^(판매자|쿠팡|로켓배송)$/i.test(sellerName)) return null;
  return { sellerName, sellerId, sellerStoreUrl: `https://shop.coupang.com${vid ? `/vid/${sellerId}` : `/${sellerId}`}` };
}

export interface CoupangProductDeps {
  sleep(ms: number): Promise<void>;
  random(): number;
}

/**
 * 쿠팡 상품 상세의 판매자 확인(KID-362, `advertising.competitor_seller_identity`). 백그라운드 탭 하나를 상품마다 옮겨 가며
 * content script(`coupang-product-seller.js`)에 판매자 상점 링크를 묻는다. 상품 상세가 아닌 쿠팡 화면(보안 확인)으로
 * 옮겨 가면 운영자를 기다렸다가 같은 상품을 다시 연다. 판매자를 못 읽은 상품은 null — 끝까지 확인했는지는 서버가 본다.
 */
export function createCoupangProductSite(tabs: TabPages, deps: CoupangProductDeps) {
  let page: TabPage | null = null;
  let keepOpen = false;
  let productsRead = 0;
  const ask = (current: TabPage) => current.ask<{ ok?: boolean; error?: string; seller?: { href?: unknown; text?: unknown } | null }>(
    { type: 'KIDITEM_COUPANG_PRODUCT_SELLER' },
    { timeoutMs: ASK_TIMEOUT_MS, inject: { isolated: [CONTENT_FILE] }, guard: COUPANG_PRODUCT_PAGE_GUARD },
  );
  return {
    async sellerIdentity(link: string, options: { label: string; onAttention?: AttentionListener }): Promise<SellerIdentity | null> {
      if (!isProductDetailUrl(link)) {
        throw new RuntimeError(SITE_REQUEST_FAILED, '상품 상세 주소가 아닙니다.', { status: null, reason: 'not_product_detail', url: link });
      }
      if (productsRead > 0) {
        const [low, high] = PRODUCT_DELAY_MS;
        await deps.sleep(Math.floor(low + deps.random() * (high - low)));
      }
      productsRead += 1;
      page ??= await tabs.open('about:blank');
      const current = page;
      for (;;) {
        const landed = await current.navigate(link, { timeoutMs: PAGE_TIMEOUT_MS, continueOnTimeout: true });
        if (!isExpectedProductUrl(landed, link)) {
          try {
            checkPageUrl(COUPANG_PRODUCT_PAGE_GUARD, landed);
          } catch (error) {
            if (leftForOperator(error)) keepOpen = true;
            throw error;
          }
          // 쿠팡 안의 다른 화면(보안 확인) — 운영자가 풀 때까지 기다린 뒤 같은 상품을 다시 연다.
          const cleared = await waitForOperator(current, (url) => !isExpectedProductUrl(url, link) && !isProductDetailUrl(url),
            { kind: 'verification', site: '쿠팡', label: options.label }, options.onAttention);
          if (!cleared) {
            keepOpen = true;
            throw new RuntimeError(SITE_VERIFICATION_REQUIRED, '쿠팡이 보안 확인을 요구합니다. 열려 있는 쿠팡 탭에서 확인한 뒤 다시 수집해 주세요.', { url: landed });
          }
          continue;
        }
        await deps.sleep(RENDER_WAIT_MS);
        let answer = await ask(current).catch((error: unknown) => {
          if (leftForOperator(error)) keepOpen = true;
          throw error;
        });
        let seller = answer?.ok ? parseSellerShopLink(answer.seller) : null;
        if (!seller) {
          await deps.sleep(RENDER_WAIT_MS);
          answer = await ask(current);
          seller = answer?.ok ? parseSellerShopLink(answer.seller) : null;
        }
        return seller;
      }
    },
    /** 수집이 끝나면 탭을 닫는다. 보안 확인·로그인에서 멈췄으면 운영자가 볼 수 있게 남긴다. */
    async close() {
      if (page && !keepOpen) await page.close();
      page = null;
    },
  };
}

export type CoupangProductSite = ReturnType<typeof createCoupangProductSite>;

registerSite({ name: COUPANG_PRODUCT_SITE.name, create: (deps) => createCoupangProductSite(deps.tabs, { sleep: deps.sleep, random: () => Math.random() }) });
