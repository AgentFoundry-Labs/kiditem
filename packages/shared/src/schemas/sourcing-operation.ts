import { z } from 'zod';
import {
  SourcingKeywordSuggestionInputSchema,
  SourcingWingCatalogBatchInputSchema,
} from '../sourcing/browser-operations.js';

/**
 * 소싱 수집을 실행 계약(ADR-0025) kind로 옮긴 이름표(KID-360). 옛 run 표(`sourcing_evidence_ingestion_runs`)의
 * (sourceKey, scopeKey, targetKey)는 원장 스냅샷의 키로 남고, 실행은 kind + scope로 시작한다.
 * kind 이름은 `owner.work` 형식이라 점 뒤에 숫자가 올 수 없다(`1688_trend` → `trend_1688`).
 */
export const SOURCING_OPERATION_KINDS = {
  // 확장 구동 (PR I-a)
  wingCatalog: 'sourcing.wing_catalog',
  coupangKeywordSuggestion: 'sourcing.coupang_keyword_suggestion',
  trend1688: 'sourcing.trend_1688',
  liveCommerce: 'sourcing.live_commerce',
  tiktokCreative: 'sourcing.tiktok_creative',
  productExtension: 'sourcing.product_extension',
  // 서버 구동 (PR I-b)
  naverTrend: 'sourcing.naver_trend',
  shortstrendTrend: 'sourcing.shortstrend_trend',
  taobaoLive: 'sourcing.taobao_live',
  marketShadow: 'sourcing.market_shadow',
  naverKeywordAnalysis: 'sourcing.naver_keyword_analysis',
  keywordSearch1688: 'sourcing.keyword_search_1688',
  imageSearch1688: 'sourcing.image_search_1688',
  scrapeUrl: 'sourcing.scrape_url',
} as const;
export type SourcingOperationKind = (typeof SOURCING_OPERATION_KINDS)[keyof typeof SOURCING_OPERATION_KINDS];

export const SOURCING_EXTENSION_KINDS = [
  SOURCING_OPERATION_KINDS.wingCatalog,
  SOURCING_OPERATION_KINDS.coupangKeywordSuggestion,
  SOURCING_OPERATION_KINDS.trend1688,
  SOURCING_OPERATION_KINDS.liveCommerce,
  SOURCING_OPERATION_KINDS.tiktokCreative,
  SOURCING_OPERATION_KINDS.productExtension,
] as const;

/** kind → 옛 sourceKey(원장 스냅샷·관측의 키). 플랫폼이 갈리는 kind는 scope.platform으로 정한다. */
export const SOURCING_SOURCE_KEY_BY_KIND: Readonly<Record<SourcingOperationKind, string | ((platform: string) => string)>> = {
  'sourcing.wing_catalog': 'coupang.wing_catalog',
  'sourcing.coupang_keyword_suggestion': 'coupang.keyword_suggestion',
  'sourcing.trend_1688': '1688.hot_product',
  'sourcing.live_commerce': (platform) => `${platform}.live_commerce`,
  'sourcing.tiktok_creative': 'tiktok.creative',
  'sourcing.product_extension': (platform) => `${platform}.product_extension`,
  'sourcing.naver_trend': 'naver.trend',
  'sourcing.shortstrend_trend': 'shortstrend.trend',
  'sourcing.taobao_live': 'taobao.live',
  'sourcing.market_shadow': 'market_shadow_signals',
  'sourcing.naver_keyword_analysis': 'naver.keyword_analysis',
  'sourcing.keyword_search_1688': '1688.hot_product',
  'sourcing.image_search_1688': '1688.image_search',
  'sourcing.scrape_url': (platform) => `${platform}.scrape_url`,
};

/**
 * Wing 검색 소싱: 옛 attempt plan(키워드 ≤12·키워드당 쪽수·용도)에 그 계정을 더한다. 계정의 Wing 로그인을 쓰므로
 * lockKey는 `account:<channelAccountId>`(카탈로그 동기화와 서로 막음)다.
 */
export const SourcingWingCatalogScopeSchema = SourcingWingCatalogBatchInputSchema.innerType().extend({
  channelAccountId: z.string().uuid(),
}).strict();

/** 쿠팡 검색창 추천 키워드: 옛 attempt plan 그대로(키워드·결과 상한). */
export const SourcingCoupangKeywordSuggestionScopeSchema = SourcingKeywordSuggestionInputSchema;

/** 1688 인기상품: 키워드는 조직의 트렌드 시드에서 서버가 정한다(옛 attempt와 같다). */
export const SourcingTrend1688ScopeSchema = z.object({}).strict();

export const SourcingLiveCommerceScopeSchema = z.object({
  platform: z.enum(['1688', 'douyin']),
  url: z.string().url().max(500),
}).strict();

/** TikTok Creative Center: 대상은 트렌드 시드에서 서버가 정하고, 실행마다 고르는 값은 상한·지역뿐이다. */
export const SourcingTiktokCreativeScopeSchema = z.object({
  maxItems: z.number().int().min(1).max(100).optional(),
  region: z.string().min(2).max(8).optional(),
}).strict();

export const SourcingProductExtensionScopeSchema = z.object({
  platform: z.enum(['1688', 'alibaba']),
  url: z.string().url().max(2000),
}).strict();

export const SOURCING_EXTENSION_SCOPE_SCHEMAS = {
  'sourcing.wing_catalog': SourcingWingCatalogScopeSchema,
  'sourcing.coupang_keyword_suggestion': SourcingCoupangKeywordSuggestionScopeSchema,
  'sourcing.trend_1688': SourcingTrend1688ScopeSchema,
  'sourcing.live_commerce': SourcingLiveCommerceScopeSchema,
  'sourcing.tiktok_creative': SourcingTiktokCreativeScopeSchema,
  'sourcing.product_extension': SourcingProductExtensionScopeSchema,
} as const;

/** 청크 종류(chunkKind). 원소 모양은 옛 attempt 청크의 항목과 같다(owner가 kind별 Zod로 검증). */
export const SOURCING_CHUNK_KINDS = {
  /** wing_catalog: 키워드 하나의 검색 결과(원소 = 상품 행). */
  wingSearchPage: 'wing_search_page',
  /** coupang_keyword_suggestion: 추천 키워드 문서 1개(청크 1장). */
  keywordSuggestions: 'keyword_suggestions',
  /** trend_1688: 키워드 하나의 offer 목록. */
  offers1688: 'offers_1688',
  /** live_commerce: 방송 1 + 상품들. */
  liveBroadcast: 'live_broadcast',
  liveProducts: 'live_products',
  /** tiktok_creative: 대상별 트렌드 항목. */
  creativeTrends: 'creative_trends',
  /** product_extension: 상품 1개 원본 문서. */
  productDocument: 'product_document',
} as const;

/** 실행 result(finalize가 돌려줌): 스냅샷 요약. 화면은 실행 reader로 이것만 본다. */
export const SourcingOperationResultSchema = z.object({
  sourceKey: z.string(),
  scopeKey: z.string(),
  targetKey: z.string(),
  discoveredCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  coverage: z.object({ numerator: z.number().int().nonnegative(), denominator: z.number().int().positive() }).nullable(),
  /** 발행의 원천 관측 창(timestamptz ISO). 진실은 발행 이력 표이고 이것은 화면용 요약이다. */
  windowStartAt: z.string().datetime({ offset: true }).nullable(),
  windowEndAt: z.string().datetime({ offset: true }).nullable(),
  /** product_extension: 이 수집이 입장시킨 원본 기록과 그 초안. */
  admitted: z.array(z.object({ sourceRecordId: z.string().uuid(), salesProductId: z.string().uuid() }).strict()).optional(),
}).strict();
export type SourcingOperationResult = z.infer<typeof SourcingOperationResultSchema>;
