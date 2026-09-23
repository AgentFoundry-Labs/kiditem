import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';

export const ANALYTICS_CAPABILITIES = [
  {
    key: 'analytics.readOverview', ownerDomain: 'analytics', ownerInputPort: 'analytics.readOverview',
    description:
      'Read the organization overview for today or the current month: revenue and order count, out-of-stock SKU ' +
      'count and SKUs needing mapping attention, and when data was last synced. Nullable numbers mean the source ' +
      'has not published a complete figure yet, not zero. It reads only and is a summary, not a per-product ' +
      'report.',
    resultSummary: '운영 현황을 확인했습니다.',
    inputSchema: z.object({ period: z.enum(['today', 'month']).optional() }).strict(),
    outputSchema: z.object({
      sales: z.object({
        revenue: z.number().nullable(),
        orders: z.number().int().nonnegative().nullable(),
      }).strict(),
      inventory: z.object({
        outOfStockSkus: z.number().int().nonnegative().nullable(),
        mappingAttentionSkus: z.number().int().nonnegative(),
      }).strict(),
      freshness: z.object({ lastSync: z.string().datetime().nullable() }).strict(),
    }).strict(),
    effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
] as const satisfies readonly CapabilityDefinition[];
