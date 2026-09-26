import { z } from 'zod';
import { resourceLockKey, type OperationLockKey } from './operation.js';

/**
 * Advertising owner의 확장 구동 실행 kind(ADR-0025, KID-362 wave3). K-a(K1–K5 키워드·경쟁사)와 K-b(K6·K7 Wing 일별 사실)
 * 두 블록이 있다. scope는 웹이 begin에 싣는 입력이고 owner
 * `plan(scope)`가 검증한다. 청크 항목·result 모양은 서버 owner와 확장 수집기가 함께 쓰므로 여기에 둔다.
 * 모든 kind는 읽기 전용이다 — Wing 검색·www.coupang.com·shop.coupang.com을 읽을 뿐 광고센터에 쓰지 않는다.
 */

// ── K-a: 키워드·경쟁사 계열 (KID-362 K-a) ─────────────────────────────────────────

export const WING_TRACKED_PRODUCTS_KIND = 'advertising.wing_tracked_products' as const;
export const WING_RANK_KIND = 'advertising.wing_rank' as const;
export const KEYWORD_SERP_KIND = 'advertising.keyword_serp' as const;
export const COMPETITOR_SELLER_IDENTITY_KIND = 'advertising.competitor_seller_identity' as const;
export const COMPETITOR_CATALOG_KIND = 'advertising.competitor_catalog' as const;

export const ADVERTISING_KEYWORD_OPERATION_KINDS = [
  WING_TRACKED_PRODUCTS_KIND,
  WING_RANK_KIND,
  KEYWORD_SERP_KIND,
  COMPETITOR_SELLER_IDENTITY_KIND,
  COMPETITOR_CATALOG_KIND,
] as const;
export type AdvertisingKeywordOperationKind = (typeof ADVERTISING_KEYWORD_OPERATION_KINDS)[number];

/** 이 kind들을 도는 확장 빌드가 `ping`에 싣는 표시. 웹은 이것으로 옛 빌드를 가려낸다. */
export const ADVERTISING_KEYWORD_OPERATION_CAPABILITY = 'advertisingKeywordOperationKindsV1' as const;

/** 키워드 표기: 앞뒤 공백을 떼고 연속 공백을 하나로, NFC. */
export function canonicalAdvertisingKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').normalize('NFC');
}

/** 같은 키워드인지 가리는 값(대소문자 무시). 잠금 키 `resource:keyword:<identity>`에도 쓴다. */
export function advertisingKeywordIdentity(value: string): string {
  return canonicalAdvertisingKeyword(value).toLocaleLowerCase('en-US');
}

const keyword = z.string().transform(canonicalAdvertisingKeyword).pipe(z.string().min(1).max(100));
const productId = z.string().trim().min(1).max(40);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/** 키워드 목록: 같은 키워드(대소문자 무시)는 앞의 것 하나만 남긴다. */
function keywordList(max: number) {
  return z.array(keyword).min(1).max(max).transform((values) => {
    const seen = new Set<string>();
    return values.filter((value) => {
      const identity = advertisingKeywordIdentity(value);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  });
}

// ── K1 advertising.wing_tracked_products ──

/** 한 번에 수집하는 키워드·추적 상품 상한(옛 attempt와 같다). */
export const WING_TRACKED_PRODUCTS_MAX_KEYWORDS = 12;
export const WING_TRACKED_PRODUCTS_MAX_PRODUCTS = 300;
/** 키워드 하나에서 읽는 Wing 검색 쪽 수(옛 수집기 `WING_CATALOG_MAX_PAGES`). */
export const WING_TRACKED_PRODUCTS_MAX_PAGES = 5;

/** 추적 상품 지표: 그 계정의 Wing 로그인으로 키워드를 검색한다. lockKey `account:<channelAccountId>`. */
export const WingTrackedProductsScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  keywords: keywordList(WING_TRACKED_PRODUCTS_MAX_KEYWORDS),
}).strict();
export type WingTrackedProductsScope = z.infer<typeof WingTrackedProductsScopeSchema>;

/** plan: begin 때 고정한 업무일·키워드·추적 대상(상품과 그 수집 키워드). finalize는 이 대상이 그대로인지 본다. */
export const WingTrackedProductsPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  businessDate: isoDay,
  keywords: z.array(z.string().min(1).max(100)).min(1).max(WING_TRACKED_PRODUCTS_MAX_KEYWORDS),
  maxPages: z.number().int().min(1).max(10),
  products: z.array(z.object({
    productId,
    sourceKeyword: z.string().min(1).max(100).nullable(),
  }).strict()).max(WING_TRACKED_PRODUCTS_MAX_PRODUCTS),
}).strict();
export type WingTrackedProductsPlan = z.infer<typeof WingTrackedProductsPlanSchema>;

/** 추적 상품 하나의 Wing 28일 지표(옛 제출 항목과 같다). */
export const WingTrackedProductItemSchema = z.object({
  productId,
  salePriceKrw: z.number().int().nonnegative().max(2_147_483_647).nullable(),
  ratingCount: z.number().int().nonnegative().max(2_147_483_647).nullable(),
  ratingAverage: z.number().min(0).max(5).nullable(),
  pvLast28Day: z.number().int().nonnegative().max(2_147_483_647).nullable(),
  salesLast28d: z.number().int().nonnegative().max(2_147_483_647).nullable(),
  estimatedRevenue28d: z.number().nonnegative().max(2_147_483_647).nullable(),
  conversionRate28d: z.number().min(0).max(1).nullable(),
}).strict();
export type WingTrackedProductItem = z.infer<typeof WingTrackedProductItemSchema>;

/** 청크 `wing_tracked_search`: 키워드 하나를 끝까지 읽고 찾은 추적 상품들(키워드마다 한 장, 못 찾아도 한 장). */
export const WING_TRACKED_PRODUCTS_CHUNK_KIND = 'wing_tracked_search' as const;
export const WingTrackedSearchChunkItemSchema = z.object({
  keyword: z.string().min(1).max(100),
  items: z.array(WingTrackedProductItemSchema).max(WING_TRACKED_PRODUCTS_MAX_PRODUCTS),
}).strict();
export type WingTrackedSearchChunkItem = z.infer<typeof WingTrackedSearchChunkItemSchema>;

export const WingTrackedProductsResultSchema = z.object({
  businessDate: isoDay,
  expectedProductCount: z.number().int().nonnegative(),
  capturedProductCount: z.number().int().nonnegative(),
}).strict();
export type WingTrackedProductsResult = z.infer<typeof WingTrackedProductsResultSchema>;

// ── K2 advertising.wing_rank ──

/** 키워드 하나의 순위 슬롯 잠금 키. Wing 순위(K2)와 SERP(K3)가 같은 키워드를 동시에 돌리지 않게 같은 키를 잡는다. */
export function keywordLockKey(value: string): `resource:keyword:${string}` {
  return `resource:keyword:${advertisingKeywordIdentity(value).replace(/\s+/gu, '_')}`;
}

/** Wing 판매순위 한 키워드에서 읽는 쪽 수(옛 attempt와 같다). */
export const WING_RANK_MAX_PAGES = 5;
/** 한 실행이 돌 수 있는 키워드 상한(잠금 키 수). */
export const WING_RANK_MAX_KEYWORDS = 200;

/**
 * Wing 판매순위: 그 계정의 Wing 상품등록 검색으로 자사 상품의 대표 키워드 판매순위를 본다. `keywords`가 없으면 서버가
 * 오늘 아직 수집하지 않은 키워드부터(모두 수집했으면 전체) 고른다(옛 batch와 같다). 주면 그 키워드만.
 * lockKey `account:<channelAccountId>` + 키워드마다 `resource:keyword:<kw>`.
 */
export const WingRankScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  keywords: keywordList(WING_RANK_MAX_KEYWORDS).optional(),
}).strict();
export type WingRankScope = z.infer<typeof WingRankScopeSchema>;

export const WingRankTargetSchema = z.object({
  vendorItemId: z.string().min(1).max(40),
  productName: z.string().max(500),
  category: z.string().max(1_000).nullable(),
  candidateIndex: z.number().int().nonnegative(),
}).strict();
export type WingRankTarget = z.infer<typeof WingRankTargetSchema>;

export const WingRankPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  maxPages: z.number().int().min(1).max(WING_RANK_MAX_PAGES),
  keywords: z.array(z.object({
    keyword: z.string().min(1).max(100),
    targets: z.array(WingRankTargetSchema).min(1),
  }).strict()).min(1).max(WING_RANK_MAX_KEYWORDS),
  selection: z.object({
    productCount: z.number().int().nonnegative(),
    keywordCount: z.number().int().nonnegative(),
    resumed: z.boolean(),
    pendingProductCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type WingRankPlan = z.infer<typeof WingRankPlanSchema>;

const nullableMetric = z.number().finite().nullable();

/** Wing 검색 결과 한 줄(28일 판매량 내림차순, `salesRank` 1부터). */
export const WingRankItemSchema = z.object({
  productId: z.string().min(1).max(40),
  itemId: z.string().max(40).nullable(),
  vendorItemId: z.string().max(40).nullable(),
  productName: z.string().max(500).nullable(),
  categoryHierarchy: z.string().max(1_000).nullable(),
  salesRank: z.number().int().min(1),
  salePrice: nullableMetric,
  ratingCount: nullableMetric,
  pvLast28Day: nullableMetric,
  salesLast28d: nullableMetric,
  estimatedRevenue28d: nullableMetric,
  conversionRate28d: nullableMetric,
}).strict();
export type WingRankItem = z.infer<typeof WingRankItemSchema>;

/** 청크 `wing_rank_keyword`: 키워드 하나를 끝까지 읽은 결과(키워드마다 한 장). */
export const WING_RANK_CHUNK_KIND = 'wing_rank_keyword' as const;
export const WingRankChunkItemSchema = z.object({
  keyword: z.string().min(1).max(100),
  capturedAt: z.string().datetime(),
  pagesScanned: z.number().int().nonnegative().max(WING_RANK_MAX_PAGES),
  items: z.array(WingRankItemSchema).max(2_000),
}).strict();
export type WingRankChunkItem = z.infer<typeof WingRankChunkItemSchema>;

export const WingRankResultSchema = z.object({
  keywords: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  rankedCount: z.number().int().nonnegative(),
}).strict();
export type WingRankResult = z.infer<typeof WingRankResultSchema>;

// ── K3 advertising.keyword_serp ──

/** 쿠팡 검색 한 키워드에서 읽는 쪽 수 상한(옛 수집기 MAX_PAGES). */
export const KEYWORD_SERP_MAX_PAGES = 3;
export const KEYWORD_SERP_MAX_KEYWORDS = 100;

/** SERP 순위: www.coupang.com 검색 결과를 키워드마다 최대 3쪽 읽는다. lockKey 키워드마다 `resource:keyword:<kw>`(Wing 순위와 같은 슬롯). */
export const KeywordSerpScopeSchema = z.object({
  keywords: keywordList(KEYWORD_SERP_MAX_KEYWORDS),
}).strict();
export type KeywordSerpScope = z.infer<typeof KeywordSerpScopeSchema>;

/** plan: 키워드마다 쪽 수와 명시 추적 옵션(트래커), 자사 옵션 목록(순위 행을 만들 대상). */
export const KeywordSerpPlanSchema = z.object({
  keywords: z.array(z.object({
    keyword: z.string().min(1).max(100),
    maxPages: z.number().int().min(1).max(KEYWORD_SERP_MAX_PAGES),
    explicitVendorItemIds: z.array(z.string().min(1).max(40)).max(500),
  }).strict()).min(1).max(KEYWORD_SERP_MAX_KEYWORDS),
  ownItems: z.array(z.object({ vendorItemId: z.string().min(1).max(40), productName: z.string().max(500) }).strict()),
}).strict();
export type KeywordSerpPlan = z.infer<typeof KeywordSerpPlanSchema>;

/** 검색 결과 한 줄(DOM 순서, 광고 포함). `rank`는 1부터 전체 순번. */
export const KeywordSerpItemSchema = z.object({
  rank: z.number().int().min(1),
  page: z.number().int().min(1).max(KEYWORD_SERP_MAX_PAGES),
  positionInPage: z.number().int().min(1),
  isAd: z.boolean(),
  productId: z.string().min(1).max(40),
  itemId: z.string().max(40).nullable(),
  vendorItemId: z.string().max(40).nullable(),
  name: z.string().max(300).nullable(),
  priceKrw: z.number().int().nonnegative().nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
  ratingScore: z.number().min(0).max(5).nullable(),
  imageUrl: z.string().max(2_000).nullable(),
  link: z.string().max(2_000).nullable(),
}).strict();
export type KeywordSerpItem = z.infer<typeof KeywordSerpItemSchema>;

/**
 * 쪽 읽기가 멈춘 까닭. 서버는 `page_limit`(계획한 쪽을 다 읽음)·`empty_page`(그 전에 빈 쪽)만 완결로 받는다 —
 * `provider_wall`·`invalid_result`는 확장이 사실대로 보고하고 서버가 거절하도록 남겨 둔다.
 */
export const KEYWORD_SERP_STOP_REASONS = ['page_limit', 'empty_page', 'provider_wall', 'invalid_result'] as const;

/** 청크 `keyword_serp`: 키워드 하나를 읽은 결과(키워드마다 한 장). 첫 쪽이 비면 수집기가 실패한다. */
export const KEYWORD_SERP_CHUNK_KIND = 'keyword_serp' as const;
export const KeywordSerpChunkItemSchema = z.object({
  keyword: z.string().min(1).max(100),
  capturedAt: z.string().datetime(),
  pagesScanned: z.number().int().min(1).max(KEYWORD_SERP_MAX_PAGES),
  stopReason: z.enum(KEYWORD_SERP_STOP_REASONS),
  items: z.array(KeywordSerpItemSchema).min(1).max(1_000),
}).strict();
export type KeywordSerpChunkItem = z.infer<typeof KeywordSerpChunkItemSchema>;

export const KeywordSerpResultSchema = z.object({
  keywords: z.number().int().nonnegative(),
  items: z.number().int().nonnegative(),
  rankRows: z.number().int().nonnegative(),
}).passthrough();
export type KeywordSerpResult = z.infer<typeof KeywordSerpResultSchema>;

// ── K4 advertising.competitor_seller_identity ──

/**
 * 판매자 확인(K4)과 경쟁사 카탈로그(K5)가 함께 쥐는 잠금 키. 둘 다 최신 SERP 행을 고치므로 한 번에 하나다. 잠금은 조직 범위라
 * 조직에 하나지만 `org`와 달리 조직 잠금을 쓰는 다른 owner의 kind(배송요약 등)와 겹치지 않는다.
 */
export const COMPETITOR_ENRICHMENT_LOCK_KEY = 'resource:competitor:serp-enrichment' as const;

/** 한 실행에서 여는 상품 상세 상한(옛 attempt와 같다). */
export const COMPETITOR_SELLER_IDENTITY_MAX_TARGETS = 200;

/**
 * 경쟁 판매자 확인: 최근 SERP에서 판매자를 아직 모르는 경쟁 상품의 상세(www.coupang.com/vp/products)를 열어 판매자 상점
 * 링크를 읽는다. `keywords`를 주면 그 키워드의 SERP 상품만(SERP 순위 실행이 이어서 시작할 때), 없으면 최근 30일 전체에서
 * 고른다. lockKey `resource:competitor:serp-enrichment`.
 */
export const CompetitorSellerIdentityScopeSchema = z.object({
  keywords: keywordList(KEYWORD_SERP_MAX_KEYWORDS).optional(),
}).strict();
export type CompetitorSellerIdentityScope = z.infer<typeof CompetitorSellerIdentityScopeSchema>;

export const CompetitorSellerIdentityTargetSchema = z.object({
  keyword: z.string().min(1).max(100),
  productKey: z.string().min(1).max(2_100),
  productId: z.string().max(40).nullable(),
  vendorItemId: z.string().max(40).nullable(),
  name: z.string().max(300),
  link: z.string().url().max(2_000),
  rank: z.number().int().positive(),
  matchScore: z.number().finite(),
}).strict();
export type CompetitorSellerIdentityTarget = z.infer<typeof CompetitorSellerIdentityTargetSchema>;

/** plan: 열 상품 상세(상품 상세 주소만 — 그 밖의 대상은 계획에서 뺀다)와 뺀 수. */
export const CompetitorSellerIdentityPlanSchema = z.object({
  targets: z.array(CompetitorSellerIdentityTargetSchema).max(COMPETITOR_SELLER_IDENTITY_MAX_TARGETS),
  excludedTargetCount: z.number().int().nonnegative(),
}).strict();
export type CompetitorSellerIdentityPlan = z.infer<typeof CompetitorSellerIdentityPlanSchema>;

/** 판매자 상점 주소: `https://shop.coupang.com/<id>` 또는 `/vid/<id>`. */
export function isSellerStoreUrl(value: string, sellerId: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'shop.coupang.com'
      && (url.pathname === `/${sellerId}` || url.pathname === `/vid/${sellerId}`);
  } catch {
    return false;
  }
}

/** 청크 `seller_identity`: 상품 상세 하나에서 읽은 판매자(계획한 대상마다 한 원소). */
export const COMPETITOR_SELLER_IDENTITY_CHUNK_KIND = 'seller_identity' as const;
export const CompetitorSellerIdentityItemSchema = z.object({
  keyword: z.string().min(1).max(100),
  productKey: z.string().min(1).max(2_100),
  productId: z.string().max(40).nullable(),
  vendorItemId: z.string().max(40).nullable(),
  link: z.string().url().max(2_000),
  sellerName: z.string().min(1).max(120),
  sellerId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  sellerStoreUrl: z.string().url().max(200),
  capturedAt: z.string().datetime(),
}).strict().refine((item) => isSellerStoreUrl(item.sellerStoreUrl, item.sellerId), { message: 'sellerStoreUrl은 그 판매자의 shop.coupang.com 주소여야 합니다', path: ['sellerStoreUrl'] });
export type CompetitorSellerIdentityItem = z.infer<typeof CompetitorSellerIdentityItemSchema>;

export const CompetitorSellerIdentityResultSchema = z.object({
  targets: z.number().int().nonnegative(),
  identities: z.number().int().nonnegative(),
  resolvedProductCount: z.number().int().nonnegative(),
}).passthrough();
export type CompetitorSellerIdentityResult = z.infer<typeof CompetitorSellerIdentityResultSchema>;

// ── K5 advertising.competitor_catalog ──

/** 한 실행이 여는 판매자샵 상한과 판매자 하나에서 읽는 상품 상한(연쇄 보강 500, 그 밖 100 — 옛 attempt와 같다). */
export const COMPETITOR_CATALOG_MAX_TARGETS = 20;
export const COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS = 500;
export const COMPETITOR_CATALOG_MAX_PRODUCTS = 100;

const sellerId = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/u);
const sellerStoreUrl = z.string().trim().url().max(2_000).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'shop.coupang.com';
  } catch {
    return false;
  }
}, '판매자샵 주소는 shop.coupang.com이어야 합니다');
const boundedCount = z.number().int().nonnegative().max(2_147_483_647);

/**
 * 경쟁사 카탈로그: 확인된 경쟁 판매자샵(shop.coupang.com)을 최신순으로 읽는다. `sellerId`를 주면 그 판매자 하나(추적 중인
 * 판매자여야 한다), `rankEnrichment`면 판매자 확인이 이어서 시작한 보강(상품 500개까지). lockKey `resource:competitor:serp-enrichment`.
 */
export const CompetitorCatalogScopeSchema = z.object({
  sellerId: sellerId.optional(),
  rankEnrichment: z.boolean().optional(),
}).strict().refine((scope) => !(scope.sellerId && scope.rankEnrichment), { message: '판매자 하나 수집은 보강 연쇄가 아닙니다', path: ['rankEnrichment'] });
export type CompetitorCatalogScope = z.infer<typeof CompetitorCatalogScopeSchema>;

export const CompetitorCatalogTargetSchema = z.object({
  sellerId,
  sellerName: z.string().trim().min(1).max(300),
  sellerStoreUrl,
  keyword: z.string().min(1).max(100),
}).strict();
export type CompetitorCatalogTarget = z.infer<typeof CompetitorCatalogTargetSchema>;

export const CompetitorCatalogPlanSchema = z.object({
  targets: z.array(CompetitorCatalogTargetSchema).max(COMPETITOR_CATALOG_MAX_TARGETS),
  productLimit: z.union([z.literal(COMPETITOR_CATALOG_MAX_PRODUCTS), z.literal(COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS)]),
}).strict();
export type CompetitorCatalogPlan = z.infer<typeof CompetitorCatalogPlanSchema>;

export const CompetitorCatalogProductSchema = z.object({
  sourceRank: z.number().int().min(1).max(COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS),
  productId: z.string().trim().min(1).max(200).nullable(),
  itemId: z.string().trim().min(1).max(200).nullable(),
  vendorItemId: z.string().trim().min(1).max(200).nullable(),
  name: z.string().trim().min(1).max(500),
  priceKrw: boundedCount.nullable(),
  reviewCount: boundedCount.nullable(),
  imageUrl: z.string().trim().max(2_000).nullable(),
  link: z.string().trim().max(2_000).nullable(),
}).strict().refine((product) => Boolean(product.productId || product.itemId || product.vendorItemId), {
  message: '경쟁사 상품은 상품·아이템·옵션 ID 중 하나가 있어야 합니다', path: ['productId'],
});
export type CompetitorCatalogProduct = z.infer<typeof CompetitorCatalogProductSchema>;

/** 청크 `seller_catalog`: 판매자샵 하나(최신순)를 읽은 결과(계획한 판매자마다 한 원소). */
export const COMPETITOR_CATALOG_CHUNK_KIND = 'seller_catalog' as const;
export const CompetitorCatalogItemSchema = z.object({
  keyword: z.string().min(1).max(100),
  sellerId,
  sellerName: z.string().trim().min(1).max(300),
  sellerStoreUrl,
  totalProductCount: boundedCount.nullable(),
  collectedProductCount: z.number().int().min(1).max(COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS),
  isTruncated: z.boolean(),
  sort: z.literal('newest'),
  capturedAt: z.string().datetime(),
  products: z.array(CompetitorCatalogProductSchema).min(1).max(COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS),
}).strict().refine((catalog) => catalog.collectedProductCount === catalog.products.length, {
  message: 'collectedProductCount는 읽은 상품 수와 같아야 합니다', path: ['collectedProductCount'],
});
export type CompetitorCatalogItem = z.infer<typeof CompetitorCatalogItemSchema>;

export const CompetitorCatalogResultSchema = z.object({
  targets: z.number().int().nonnegative(),
  captured: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
}).passthrough();
export type CompetitorCatalogResult = z.infer<typeof CompetitorCatalogResultSchema>;

// ── K-b: Wing 일별 사실 계열(트래픽 · 아이템위너) ──────────────────────────────────────

/**
 * 확장 수집기가 로그인한 Wing 세션의 판매자 식별자(업체코드)가 plan 계정 것과 다를 때 내는 런타임 코드(KID-362 M1).
 * 서버 finalize도 청크 표식의 식별자로 같은 대조를 한다(`vendor_identity_mismatch`).
 */
export const WING_VENDOR_IDENTITY_MISMATCH = 'WING_VENDOR_IDENTITY_MISMATCH' as const;

/**
 * Wing 일별 사실(`ChannelListingDailySnapshot` 트래픽·아이템위너 열)을 쓰는 kind는 계정마다 하나씩만 돈다.
 * 옛 advisory `lockListingTraffic`("listing-day 트래픽을 쓰는 쪽은 한 번에 하나")을 대신하는 잠금 키다 — K6·K7이 같은 키를 잡는다.
 */
export function wingDailyLockKey(channelAccountId: string): OperationLockKey {
  return resourceLockKey('wing-daily', channelAccountId);
}

// K7 — Wing 아이템위너(`seller-price-management/getProductList`, 읽기 전용)

export const WING_ITEMWINNER_KIND = 'advertising.wing_itemwinner' as const;

/** 시작은 계정만 고른다. 페이지·업무일은 owner plan이 정한다. */
export const WingItemwinnerScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
}).strict();
export type WingItemwinnerScope = z.infer<typeof WingItemwinnerScopeSchema>;

/** 한 번에 읽는 상한(옛 `ITEMWINNER_MAX_ITEMS`). 넘으면 잘린 목록을 완결로 보지 않고 실패한다. */
export const WING_ITEMWINNER_MAX_ITEMS = 1_000;

/** 행 청크(확장 → owner finalize). */
export const WING_ITEMWINNER_CHUNK_KIND = 'itemwinner_rows' as const;
/** 응답 하나의 표식 {totalSize, observedAt}. finalize가 행 수와 대조해 완결을 판정한다. */
export const WING_ITEMWINNER_PAGE_CHUNK_KIND = 'itemwinner_page' as const;

/** Wing 아이템위너 한 행(옛 `normalizeItemwinnerRow`). `isWinner`는 노출제한이 아닌 위너만 true. */
export const WingItemwinnerRowSchema = z.object({
  vendorItemId: z.string().regex(/^\d+$/),
  productName: z.string().min(1).max(80),
  isWinner: z.boolean(),
  myPrice: z.number().int(),
  winnerPrice: z.number().int(),
  salesQty: z.number().int().nonnegative(),
  suppressed: z.boolean(),
  providerWinnerStatus: z.boolean(),
}).strict();
export type WingItemwinnerRow = z.infer<typeof WingItemwinnerRowSchema>;

/** Wing 판매자 식별자(업체코드). 확장이 읽은 Wing 세션의 것 — owner가 plan의 계정 것과 대조한다. */
const vendorId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);

/** owner plan(확장 수집기가 받는 것). `vendorId`는 계정의 Wing 판매자 식별자다. */
export const WingItemwinnerPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  vendorId,
  businessDate: z.string().date(),
}).strict();
export type WingItemwinnerPlan = z.infer<typeof WingItemwinnerPlanSchema>;

export const WingItemwinnerPageSchema = z.object({
  totalSize: z.number().int().min(0).max(WING_ITEMWINNER_MAX_ITEMS),
  observedAt: z.string().datetime({ offset: true }),
  /** 확장이 이 목록을 읽은 Wing 세션의 판매자 식별자. */
  vendorId,
}).strict();
export type WingItemwinnerPage = z.infer<typeof WingItemwinnerPageSchema>;

/** 한 listing이 이 실행에서 관측된 위너 상태(상태 카드가 읽는다 — 매일 바뀌는 일별 행을 다시 읽지 않는다). */
export const WingItemwinnerListingObservationSchema = z.object({
  listingId: z.string().uuid(),
  isOfferWinner: z.boolean().nullable(),
  lastObservedAt: z.string().datetime({ offset: true }),
}).strict();
export type WingItemwinnerListingObservation = z.infer<typeof WingItemwinnerListingObservationSchema>;

/** owner가 행에서 센 KPI(옛 확장 `itemwinnerKpis`의 세 칸). */
export const WingItemwinnerKpisSchema = z.object({
  winners: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
  losers: z.number().int().nonnegative(),
}).strict();
export type WingItemwinnerKpis = z.infer<typeof WingItemwinnerKpisSchema>;

export const WingItemwinnerResultSchema = z.object({
  channelAccountId: z.string().uuid(),
  businessDate: z.string().date(),
  observedAt: z.string().datetime({ offset: true }),
  rowCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  unmatchedCount: z.number().int().nonnegative(),
  kpis: WingItemwinnerKpisSchema,
  listingObservations: z.array(WingItemwinnerListingObservationSchema),
}).strict();
export type WingItemwinnerResult = z.infer<typeof WingItemwinnerResultSchema>;

// K6 — Wing 일별 트래픽(`rfm-ss/api/business-insight`, 읽기 전용)

export const WING_TRAFFIC_KIND = 'advertising.wing_traffic' as const;

/** 한 번에 시작할 수 있는 가장 긴 범위(일). */
export const WING_TRAFFIC_MAX_COLLECTION_DAYS = 92;
/** 하루에 읽는 상세 쪽 상한(옛 `MAX_PAGES`, 100개씩). 넘으면 잘린 날을 완결로 보지 않는다. */
export const WING_TRAFFIC_MAX_PAGES_PER_DAY = 100;

const calendarDate = z.string().date();
const metric = z.number().finite().int().safe();
const providerRatio = z.number().finite().nullable();

/** 시작: 계정과 (선택) 마감된 KST 날짜 범위. 비우면 plan이 어제까지 7일(옛 기본 범위)을 정한다. */
export const WingTrafficScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  startDate: calendarDate.optional(),
  endDate: calendarDate.optional(),
}).strict().refine((scope) => !scope.startDate || !scope.endDate || scope.startDate <= scope.endDate, {
  message: '시작일이 종료일보다 늦습니다',
  path: ['endDate'],
});
export type WingTrafficScope = z.infer<typeof WingTrafficScopeSchema>;

/** owner plan(확장 수집기가 받는 것). `vendorId`는 Wing 행의 판매자 식별자와 대조한다. */
export const WingTrafficPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  vendorId: z.string().min(1),
  startDate: calendarDate,
  endDate: calendarDate,
  expectedDates: z.array(calendarDate).min(1).max(366),
  maxPagesPerDay: z.number().int().min(1).max(WING_TRAFFIC_MAX_PAGES_PER_DAY),
  /** 실행이 시작된 시각. 그 뒤 카탈로그에 들어온 리스팅은 빠진 날을 0으로 채우지 않는다(owner가 쓴다). */
  startedAt: z.string().datetime({ offset: true }),
}).strict();
export type WingTrafficPlan = z.infer<typeof WingTrafficPlanSchema>;

/** 옵션(vendorItem)-일 행 청크. listing 맞춤은 owner finalize가 그때의 카탈로그로 한다. */
export const WING_TRAFFIC_ROWS_CHUNK_KIND = 'traffic_rows' as const;
/** 하루를 다 읽은 표식 {businessDate, pages, rows, explicitEmpty, capturedAt, accountSummary}. */
export const WING_TRAFFIC_DAY_CHUNK_KIND = 'traffic_days' as const;
/** 확정 창 전체의 계정 요약(대조용) 하나. 이 창이 실행이 확정한 날짜다. */
export const WING_TRAFFIC_PERIOD_CHUNK_KIND = 'traffic_period' as const;

export const WingTrafficRowSchema = z.object({
  businessDate: calendarDate,
  vendorItemId: z.string().regex(/^[1-9]\d*$/),
  /** Wing 등록상품 id(inventoryId). 옵션이 맞지 않을 때 listing으로 맞추는 근거. */
  productId: z.string().regex(/^[1-9]\d*$/).nullable(),
  visitors: metric,
  views: metric,
  cartAdds: metric,
  orders: metric,
  salesQty: metric,
  revenue: metric,
}).strict();
export type WingTrafficRow = z.infer<typeof WingTrafficRowSchema>;

export const AdTrafficAccountSummarySchema = z.object({
  visitors: metric,
  views: metric,
  cartAdds: metric,
  orders: metric,
  salesQty: metric,
  revenue: metric,
  providerConversionRate: providerRatio,
}).strict();
export type AdTrafficAccountSummary = z.infer<typeof AdTrafficAccountSummarySchema>;

export const WingTrafficDaySchema = z.object({
  businessDate: calendarDate,
  pages: z.number().int().min(1).max(WING_TRAFFIC_MAX_PAGES_PER_DAY),
  rows: z.number().int().nonnegative(),
  /** Wing이 그날 결과 0개라고 답했다(0행이 수집 실패가 아니라는 증거). */
  explicitEmpty: z.boolean(),
  capturedAt: z.string().datetime({ offset: true }),
  accountSummary: AdTrafficAccountSummarySchema,
}).strict();
export type WingTrafficDay = z.infer<typeof WingTrafficDaySchema>;

export const WingTrafficPeriodSchema = z.object({
  startDate: calendarDate,
  endDate: calendarDate,
  capturedAt: z.string().datetime({ offset: true }),
  /** 확장이 이 창을 읽은 Wing 세션의 판매자 식별자. 빈 날만 있는 창도 이것으로 계정을 확인한다. */
  vendorId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
  accountSummary: AdTrafficAccountSummarySchema,
}).strict();
export type WingTrafficPeriod = z.infer<typeof WingTrafficPeriodSchema>;

/** 확정된 하루의 계정 요약(Wing `vendor-summary`, 그날 하루). */
export const AdTrafficSourceAccountDailySchema = z.object({
  businessDate: calendarDate,
  observedAt: z.string().datetime({ offset: true }),
  operationId: z.string().uuid(),
  providerConversionRate: providerRatio,
  visitors: metric,
  views: metric,
  cartAdds: metric,
  orders: metric,
  salesQty: metric,
  revenue: metric,
}).strict();
export type AdTrafficSourceAccountDaily = z.infer<typeof AdTrafficSourceAccountDailySchema>;

export const WingTrafficPeriodSummarySchema = z.object({
  startDate: calendarDate,
  endDate: calendarDate,
  observedAt: z.string().datetime({ offset: true }),
  operationId: z.string().uuid(),
  accountSummary: AdTrafficAccountSummarySchema,
}).strict();
export type WingTrafficPeriodSummary = z.infer<typeof WingTrafficPeriodSummarySchema>;

/** finish 결과. 확정 날짜·계정 일별 요약·기간 요약은 원장 읽기(`AD_TRAFFIC_READ_PORT`)와 커버리지의 근거다. */
export const WingTrafficResultSchema = z.object({
  channelAccountId: z.string().uuid(),
  requestedStartDate: calendarDate,
  requestedEndDate: calendarDate,
  /** 이 실행이 확정한 날짜(plan 순서). 쿠팡이 아직 공개하지 않은 뒷날은 빠진다. */
  confirmedDates: z.array(calendarDate).min(1),
  /** Wing이 0개라고 답한 확정 날짜. */
  providerBackedEmptyDates: z.array(calendarDate),
  accountDaily: z.array(AdTrafficSourceAccountDailySchema),
  periodSummary: WingTrafficPeriodSummarySchema,
  rowCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  unmatchedCount: z.number().int().nonnegative(),
  /**
   * 날짜마다 카탈로그에 맞지 않은 Wing 옵션 id(KID-217). 그 뒤 카탈로그에 그 옵션이 들어오면(늦게 커밋된 가져오기·
   * 다시 활성화) 그 계정의 그 날짜는 행이 합계에서 빠진 날이므로 수집 안 된 날로 친다.
   */
  unmatchedOptionIdsByDate: z.record(calendarDate, z.array(z.string())),
}).strict();
export type WingTrafficResult = z.infer<typeof WingTrafficResultSchema>;

/** 진행(화면·임대용). */
export const WingTrafficProgressSchema = z.object({
  current: calendarDate.nullable(),
  confirmedDays: z.number().int().nonnegative(),
  plannedDays: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
}).strict();
export type WingTrafficProgress = z.infer<typeof WingTrafficProgressSchema>;

// 원장 읽기(`AD_TRAFFIC_READ_PORT` — Analytics·Finance가 읽는다)

const reconciliationMetricSchema = z.object({
  dailySum: metric.nullable(),
  periodValue: metric.nullable(),
}).strict();

export const AdTrafficSourceReconciliationSchema = z.object({
  views: reconciliationMetricSchema,
  cartAdds: reconciliationMetricSchema,
  orders: reconciliationMetricSchema,
  salesQty: reconciliationMetricSchema,
  revenue: reconciliationMetricSchema,
}).strict();
export type AdTrafficSourceReconciliation = z.infer<typeof AdTrafficSourceReconciliationSchema>;

export type AdTrafficReconciliationStatus = 'MATCHED' | 'MISMATCH' | 'UNVERIFIED';

/** 일별 합과 쿠팡 기간 값의 대조 단어 하나. 한쪽이라도 미측정이면 미검증. */
export function adTrafficReconciliationStatus(metric: {
  dailySum: number | null;
  periodValue: number | null;
}): AdTrafficReconciliationStatus {
  if (metric.dailySum === null || metric.periodValue === null) return 'UNVERIFIED';
  return metric.dailySum === metric.periodValue ? 'MATCHED' : 'MISMATCH';
}

export const AdTrafficSourceCoverageSchema = z.object({
  from: calendarDate,
  to: calendarDate,
  targetDays: z.number().int().nonnegative(),
  completedDays: z.number().int().nonnegative(),
  missingDates: z.array(calendarDate),
}).strict();
export type AdTrafficSourceCoverage = z.infer<typeof AdTrafficSourceCoverageSchema>;

/** 한 계정의 Wing 트래픽 원장: 날짜마다 가장 최근 성공 실행의 계정 요약. */
export const AdTrafficSourcePublishedSchema = z.object({
  channelAccountId: z.string().uuid(),
  accountDaily: z.array(AdTrafficSourceAccountDailySchema),
  periodSummary: WingTrafficPeriodSummarySchema.nullable(),
  coverage: AdTrafficSourceCoverageSchema,
  reconciliation: AdTrafficSourceReconciliationSchema,
}).strict();
export type AdTrafficSourcePublished = z.infer<typeof AdTrafficSourcePublishedSchema>;
export const AdTrafficSourceDailyPublishedSchema = AdTrafficSourcePublishedSchema;
export type AdTrafficSourceDailyPublished = AdTrafficSourcePublished;

/**
 * 채널 일별 행의 트래픽 값을 누가 썼는가. Wing이 유일한 listing-day 트래픽 발행자다(CSV 업로드 경로는 KID-110에서
 * 은퇴). 행이 측정인지는 행의 `trafficObservedAt`이 말한다.
 */
export type DailyTrafficFactSource = 'wing';

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function dailyTrafficFactSource(metaJson: unknown): DailyTrafficFactSource | null {
  const root = jsonRecord(metaJson);
  if (!root) return null;
  const marker = root['traffic.currentSource'];
  if (marker !== undefined) return marker === 'wing.traffic' ? 'wing' : null;
  // 표식 이전에 쓴 행은 Wing 이름공간을 갖는다.
  return jsonRecord(root['wing.traffic']) !== null || root.source === 'wing.traffic' ? 'wing' : null;
}
