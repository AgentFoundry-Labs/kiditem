import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

export const CoupangRocketPurchaseOrderInputSchema = z.object({
  channelAccountId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export const CHANNELS_OPERATIONS = [
  {
    key: 'channels.collect_coupang_rocket_purchase_orders',
    version: 1,
    title: '쿠팡 로켓 PO 수집',
    ownerDomain: 'channels',
    engineType: 'browser',
    allowedTriggers: ['dashboard', 'domain_screen', 'schedule'],
    scheduleSupported: true,
    maxAttempts: 3,
    resourceClass: 'extension_coupang',
    executionTimeoutMs: 900_000,
    inputSchema: CoupangRocketPurchaseOrderInputSchema,
  },
] as const satisfies readonly OperationDefinition[];
