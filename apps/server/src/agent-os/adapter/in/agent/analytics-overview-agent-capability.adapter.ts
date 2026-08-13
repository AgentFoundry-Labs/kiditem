import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  ANALYTICS_OVERVIEW_CAPABILITY_PORT,
  type AnalyticsOverviewCapabilityPort,
} from '../../../../analytics/dashboard/application/port/in/analytics-overview-capability.port';
import { AgentCapabilityRegistry } from '../../../application/service/agent-capability-registry.service';
import type { AgentCapabilityHandler } from '../../../application/port/out/capability/agent-capability-handler.port';

const InputSchema = z.object({ period: z.enum(['today', 'month']).optional() }).strict();
const OutputSchema = z.object({
  sales: z.object({ revenue: z.number(), orders: z.number().int().nonnegative() }).strict(),
  inventory: z.object({
    outOfStockSkus: z.number().int().nonnegative(),
    mappingAttentionSkus: z.number().int().nonnegative(),
  }).strict(),
  freshness: z.object({
    lastSync: z.string().datetime().nullable(),
    confirmedUntil: z.string().nullable(),
  }).strict(),
}).strict();

@Injectable()
export class AnalyticsOverviewAgentCapabilityAdapter implements OnModuleInit {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(ANALYTICS_OVERVIEW_CAPABILITY_PORT)
    private readonly analytics: AnalyticsOverviewCapabilityPort,
  ) {}

  onModuleInit(): void {
    const handler: AgentCapabilityHandler<z.infer<typeof InputSchema>> = {
      key: 'analytics.readOverview', ownerDomain: 'analytics', executionKind: 'tool',
      inputSchema: InputSchema, outputSchema: OutputSchema,
      sideEffects: ['read'], approvalRisk: 'none', idempotencyKey: () => null,
      execute: async ({ organizationId, input }) => ({
        resourceType: 'analytics_overview',
        outputSummary: await this.analytics.readOverview({
          organizationId, now: new Date(), period: input.period,
        }),
      }),
    };
    this.registry.register(handler);
  }
}
