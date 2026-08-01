import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

export const SellpiaInventoryRefreshInputSchema = z.object({
  reason: z.enum(['manual_request', 'retry']).optional(),
}).strict();

export const INVENTORY_OPERATIONS = [
  {
    key: 'inventory.refresh_sellpia_snapshot',
    version: 1,
    title: 'Sellpia 현재고 동기화',
    ownerDomain: 'inventory',
    engineType: 'browser',
    allowedTriggers: ['dashboard', 'domain_screen', 'schedule'],
    scheduleSupported: true,
    maxAttempts: 3,
    inputSchema: SellpiaInventoryRefreshInputSchema,
  },
] as const satisfies readonly OperationDefinition[];
