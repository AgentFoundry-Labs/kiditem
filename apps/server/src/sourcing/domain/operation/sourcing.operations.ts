import type { OperationDefinition } from '../../../common/operation-definition';
import { z } from 'zod';

export const SourcingDailyTrendInputSchema = z
  .object({
    sources: z.array(z.enum(['naver', '1688', 'shorts'])).min(1).max(3).optional(),
  })
  .strict();

export const SOURCING_OPERATIONS = [
  {
    key: 'sourcing.collect_daily_trends',
    version: 1,
    title: '일일 트렌드 수집',
    ownerDomain: 'sourcing',
    engineType: 'composite',
    allowedTriggers: ['dashboard', 'domain_screen', 'schedule'],
    scheduleSupported: true,
    maxAttempts: 3,
    inputSchema: SourcingDailyTrendInputSchema,
  },
] as const satisfies readonly OperationDefinition[];
