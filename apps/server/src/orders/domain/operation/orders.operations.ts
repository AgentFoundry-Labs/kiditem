import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

export const MarketplaceOrderCollectionInputSchema = z.object({
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export const ORDERS_OPERATIONS = [
  {
    key: 'orders.collect_all_marketplace_orders',
    version: 1,
    title: '전체 몰 주문 수집',
    ownerDomain: 'orders',
    engineType: 'browser',
    allowedTriggers: ['dashboard', 'domain_screen', 'schedule'],
    scheduleSupported: true,
    maxAttempts: 3,
    inputSchema: MarketplaceOrderCollectionInputSchema,
  },
] as const satisfies readonly OperationDefinition[];
