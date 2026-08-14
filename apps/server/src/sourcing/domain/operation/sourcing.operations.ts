import { z } from 'zod';
import {
  Sourcing1688ImageMatchInputSchema,
  Sourcing1688KeywordBatchInputSchema,
  SourcingKeywordSuggestionInputSchema,
  SourcingWingCatalogBatchInputSchema,
} from '@kiditem/shared/sourcing';
import type { OperationDefinition } from '../../../common/operation-definition';

export const SourcingDailyTrendInputSchema = z
  .object({
    sources: z.array(z.enum(['naver', '1688', 'shorts'])).min(1).max(3).optional(),
  })
  .strict();

const SourcingTrendSourceInputSchema = z.object({}).strict();

export const Sourcing1688TrendInputSchema = z
  .object({
    // The parent captures the server-owned target set at child creation. An
    // empty snapshot is a valid no-work browser run; a missing one is not.
    keywords: z.array(z.string().trim().min(1).max(120)).max(20),
  })
  .strict();

export const SourcingTiktokCcTrendInputSchema = z
  .object({
    maxItems: z.number().int().min(1).max(100).optional(),
    region: z.string().trim().min(2).max(12).optional(),
  })
  .strict();

export const SourcingLiveCommerceUrlInputSchema = z
  .object({
    url: z.string().url().refine(
      (value) => {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:') return false;
        const hostname = parsed.hostname.toLowerCase();
        return hostname === 'live.douyin.com'
          || hostname.endsWith('.live.douyin.com')
          || hostname === 'zb.1688.com'
          || hostname.endsWith('.zb.1688.com');
      },
      { message: 'live_commerce_url_host_invalid' },
    ),
  })
  .strict();

export const SourcingTaobaoLiveInputSchema = z
  .object({
    liveIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    queryDate: z.string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .transform((value) => value.replaceAll('-', ''))
      .optional(),
  })
  .strict();

const SourcingShadowSignalInputSchema = z.object({}).strict();

export const SourcingRisingProductInputSchema = z
  .object({
    windowDays: z.number().int().min(2).max(60).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export const SOURCING_DAILY_TREND_OPERATION = {
  key: 'sourcing.collect_daily_trends',
  version: 1,
  title: '일일 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'composite',
  allowedTriggers: ['dashboard', 'domain_screen', 'agent', 'schedule'],
  scheduleSupported: true,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingDailyTrendInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_NAVER_TREND_OPERATION = {
  key: 'sourcing.collect_naver_trends',
  version: 1,
  title: '네이버 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'domain',
  allowedTriggers: ['dashboard', 'domain_screen', 'agent', 'schedule'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'naver_api',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingTrendSourceInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_1688_TREND_OPERATION = {
  key: 'sourcing.collect_1688_trends',
  version: 1,
  title: '1688 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'browser',
  allowedTriggers: ['dashboard', 'domain_screen', 'agent', 'schedule'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'playwright_1688',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: Sourcing1688TrendInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_SHORTS_TREND_OPERATION = {
  key: 'sourcing.collect_shorts_trends',
  version: 1,
  title: '쇼츠 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'domain',
  allowedTriggers: ['dashboard', 'domain_screen', 'agent', 'schedule'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingTrendSourceInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_TIKTOK_CC_TREND_OPERATION = {
  key: 'sourcing.collect_tiktok_cc_trends',
  version: 1,
  title: '틱톡 크리에이티브 센터 트렌드 수집',
  ownerDomain: 'sourcing',
  engineType: 'browser',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingTiktokCcTrendInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_LIVE_COMMERCE_URL_OPERATION = {
  key: 'sourcing.collect_live_commerce_url',
  version: 1,
  title: '중국 라이브 방송 수집',
  ownerDomain: 'sourcing',
  engineType: 'browser',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingLiveCommerceUrlInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_TAOBAO_LIVE_OPERATION = {
  key: 'sourcing.collect_taobao_live',
  version: 1,
  title: '타오바오 라이브 수집',
  ownerDomain: 'sourcing',
  engineType: 'domain',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'default',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingTaobaoLiveInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_SHADOW_SIGNAL_OPERATION = {
  key: 'sourcing.collect_shadow_signals',
  version: 1,
  title: '시장 shadow 신호 수집',
  ownerDomain: 'sourcing',
  engineType: 'domain',
  allowedTriggers: ['dashboard', 'domain_screen', 'agent'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'snapshot_compute',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingShadowSignalInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_RISING_PRODUCT_OPERATION = {
  key: 'sourcing.detect_rising_products',
  version: 1,
  title: '급상승 상품 탐지',
  ownerDomain: 'sourcing',
  engineType: 'domain',
  allowedTriggers: ['dashboard', 'domain_screen', 'agent'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'snapshot_compute',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingRisingProductInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_TREND_OPERATIONS = [
  SOURCING_DAILY_TREND_OPERATION,
  SOURCING_NAVER_TREND_OPERATION,
  SOURCING_1688_TREND_OPERATION,
  SOURCING_SHORTS_TREND_OPERATION,
] as const satisfies readonly OperationDefinition[];

export const SOURCING_SERVER_TREND_OPERATIONS = [
  SOURCING_DAILY_TREND_OPERATION,
  SOURCING_NAVER_TREND_OPERATION,
  SOURCING_SHORTS_TREND_OPERATION,
] as const satisfies readonly OperationDefinition[];

export const SOURCING_WING_CATALOG_OPERATION = {
  key: 'sourcing.collect_wing_catalog_batch',
  version: 1,
  title: 'Wing 카탈로그 수집',
  ownerDomain: 'sourcing',
  engineType: 'browser',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'extension_coupang',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingWingCatalogBatchInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_KEYWORD_SUGGESTION_OPERATION = {
  key: 'sourcing.collect_keyword_suggestions',
  version: 1,
  title: '쿠팡 키워드 제안 수집',
  ownerDomain: 'sourcing',
  engineType: 'browser',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'extension_coupang',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: SourcingKeywordSuggestionInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_1688_KEYWORD_BATCH_OPERATION = {
  key: 'sourcing.search_1688_keyword_batch',
  version: 1,
  title: '1688 키워드 배치 검색',
  ownerDomain: 'sourcing',
  engineType: 'domain',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'playwright_1688',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: Sourcing1688KeywordBatchInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_1688_IMAGE_MATCH_OPERATION = {
  key: 'sourcing.match_wholesale_images',
  version: 1,
  title: '1688 이미지 매칭',
  ownerDomain: 'sourcing',
  engineType: 'domain',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'playwright_1688',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: Sourcing1688ImageMatchInputSchema,
} as const satisfies OperationDefinition;

export const SOURCING_OPERATIONS = [
  ...SOURCING_TREND_OPERATIONS,
  SOURCING_TIKTOK_CC_TREND_OPERATION,
  SOURCING_LIVE_COMMERCE_URL_OPERATION,
  SOURCING_TAOBAO_LIVE_OPERATION,
  SOURCING_SHADOW_SIGNAL_OPERATION,
  SOURCING_RISING_PRODUCT_OPERATION,
  SOURCING_WING_CATALOG_OPERATION,
  SOURCING_KEYWORD_SUGGESTION_OPERATION,
  SOURCING_1688_KEYWORD_BATCH_OPERATION,
  SOURCING_1688_IMAGE_MATCH_OPERATION,
] as const satisfies readonly OperationDefinition[];
