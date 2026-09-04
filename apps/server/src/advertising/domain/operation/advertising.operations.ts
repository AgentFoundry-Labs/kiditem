import { AdvertisingCompetitorCatalogInputSchema } from '@kiditem/shared/sourcing';
import type { OperationDefinition } from '../../../common/operation-definition';

export const ADVERTISING_COMPETITOR_CATALOG_OPERATION = {
  key: 'advertising.collect_competitor_catalog',
  version: 1,
  title: '경쟁 판매자 카탈로그 수집',
  ownerDomain: 'advertising',
  engineType: 'browser',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'extension_coupang',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: AdvertisingCompetitorCatalogInputSchema,
} as const satisfies OperationDefinition;

export const ADVERTISING_OPERATIONS = [
  ADVERTISING_COMPETITOR_CATALOG_OPERATION,
] as const satisfies readonly OperationDefinition[];
