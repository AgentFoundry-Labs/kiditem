import type { OperationDefinition } from '../../../common/operation-definition';
import { z } from 'zod';
import {
  Sourcing1688ImageMatchInputSchema,
  Sourcing1688KeywordBatchInputSchema,
  SourcingKeywordSuggestionInputSchema,
  SourcingWingCatalogBatchInputSchema,
} from '@kiditem/shared/sourcing';

export const SourcingDailyTrendInputSchema = z
  .object({
    sources: z.array(z.enum(['naver', '1688', 'shorts'])).min(1).max(3).optional(),
  })
  .strict();

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
  {
    key: 'sourcing.collect_daily_trends',
    version: 1,
    title: '일일 트렌드 수집',
    ownerDomain: 'sourcing',
    engineType: 'composite',
    allowedTriggers: ['dashboard', 'domain_screen', 'agent', 'schedule'],
    scheduleSupported: true,
    maxAttempts: 3,
    resourceClass: 'default',
    executionTimeoutMs: 900_000,
    inputSchema: SourcingDailyTrendInputSchema,
  },
  SOURCING_WING_CATALOG_OPERATION,
  SOURCING_KEYWORD_SUGGESTION_OPERATION,
  SOURCING_1688_KEYWORD_BATCH_OPERATION,
  SOURCING_1688_IMAGE_MATCH_OPERATION,
] as const satisfies readonly OperationDefinition[];
