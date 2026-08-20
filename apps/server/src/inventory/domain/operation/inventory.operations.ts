import { z } from 'zod';
import type { OperationDefinition } from '../../../common/operation-definition';

export const SellpiaInventoryRefreshInputSchema = z.object({
  reason: z.enum(['manual_request', 'retry']).optional(),
  scope: z.enum(['full', 'inventory']).optional(),
}).strict();

export const CoupangShipmentSummaryInputSchema = z.object({
  maxPages: z.number().int().min(1).max(60).optional(),
}).strict();

export const INVENTORY_OPERATIONS = [
  {
    key: 'inventory.refresh_sellpia_snapshot',
    version: 1,
    title: 'Sellpia 동기화',
    ownerDomain: 'inventory',
    engineType: 'browser',
    allowedTriggers: ['dashboard', 'domain_screen', 'schedule'],
    scheduleSupported: true,
    maxAttempts: 3,
    resourceClass: 'default',
    executionTimeoutMs: 900_000,
    inputSchema: SellpiaInventoryRefreshInputSchema,
  },
  {
    key: 'inventory.collect_coupang_shipment_summary',
    version: 1,
    title: '쿠팡 쉽먼트 조회',
    ownerDomain: 'inventory',
    engineType: 'browser',
    allowedTriggers: ['dashboard', 'domain_screen', 'schedule'],
    scheduleSupported: true,
    maxAttempts: 3,
    resourceClass: 'extension_coupang',
    executionTimeoutMs: 900_000,
    inputSchema: CoupangShipmentSummaryInputSchema,
  },
] as const satisfies readonly OperationDefinition[];
