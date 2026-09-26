import { z } from 'zod';

/**
 * Advertising owner의 확장 구동 실행 kind(ADR-0025, KID-362 wave3). scope는 웹이 begin에 싣는 입력이고 owner
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

/** 한 실행에서 여는 상품 상세 상한(옛 attempt와 같다). */
export const COMPETITOR_SELLER_IDENTITY_MAX_TARGETS = 200;

/**
 * 경쟁 판매자 확인: 최근 SERP에서 판매자를 아직 모르는 경쟁 상품의 상세(www.coupang.com/vp/products)를 열어 판매자 상점
 * 링크를 읽는다. `keywords`를 주면 그 키워드의 SERP 상품만(SERP 순위 실행이 이어서 시작할 때), 없으면 최근 30일 전체에서
 * 고른다. lockKey `org`.
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
