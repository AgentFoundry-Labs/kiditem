import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';

export const ANALYTICS_CAPABILITIES = [
  {
    key: 'analytics.readOverview', ownerDomain: 'analytics', ownerInputPort: 'analytics.readOverview',
    description: 'Read the current organization sales, inventory attention, and freshness overview.',
    inputSchema: z.object({ period: z.enum(['today', 'month']).optional() }).strict(),
    outputSchema: z.object({
      sales: z.object({ revenue: z.number(), orders: z.number().int().nonnegative() }).strict(),
      inventory: z.object({ outOfStockSkus: z.number().int().nonnegative(), mappingAttentionSkus: z.number().int().nonnegative() }).strict(),
      freshness: z.object({ lastSync: z.string().datetime().nullable(), confirmedUntil: z.string().nullable() }).strict(),
    }).strict(),
    effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
] as const satisfies readonly CapabilityDefinition[];
