import type { OperationDefinition } from '../../../common/operation-definition';
import { z } from 'zod';
import { SourcingWingCatalogBatchInputSchema } from '@kiditem/shared/sourcing';

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
] as const satisfies readonly OperationDefinition[];
