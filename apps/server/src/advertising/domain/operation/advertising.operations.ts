import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';
import {
  AdvertisingCompetitorCatalogInputSchema,
  AdvertisingTrackedWingProductsInputSchema,
} from '@kiditem/shared/sourcing';

export const ADVERTISING_PROFITABILITY_OPERATION = {
  key: 'advertising.refresh_profitability_spend',
  version: 1,
  title: '광고비 데이터 갱신',
  ownerDomain: 'advertising',
  engineType: 'browser',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'extension_coupang',
  executionTimeoutMs: 900_000,
  inputSchema: z.object({}).strict(),
} as const satisfies OperationDefinition;

export const ADVERTISING_TRACKED_WING_PRODUCTS_OPERATION = {
  key: 'advertising.refresh_tracked_wing_products',
  version: 1,
  title: 'Wing 추적 상품 지표 갱신',
  ownerDomain: 'advertising',
  engineType: 'browser',
  allowedTriggers: ['dashboard', 'domain_screen'],
  scheduleSupported: false,
  maxAttempts: 3,
  resourceClass: 'extension_coupang',
  executionTimeoutMs: 15 * 60_000,
  inputSchema: AdvertisingTrackedWingProductsInputSchema,
} as const satisfies OperationDefinition;

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
  ADVERTISING_PROFITABILITY_OPERATION,
  ADVERTISING_TRACKED_WING_PRODUCTS_OPERATION,
  ADVERTISING_COMPETITOR_CATALOG_OPERATION,
] as const satisfies readonly OperationDefinition[];
