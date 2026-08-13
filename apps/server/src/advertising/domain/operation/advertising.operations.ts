import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

export const ADVERTISING_OPERATIONS = [
  {
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
  },
] as const satisfies readonly OperationDefinition[];
