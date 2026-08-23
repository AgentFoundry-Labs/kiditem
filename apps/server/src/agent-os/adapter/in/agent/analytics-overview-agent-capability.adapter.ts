import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  ANALYTICS_OVERVIEW_CAPABILITY_PORT,
  type AnalyticsOverviewCapabilityPort,
} from '../../../../analytics/dashboard/application/port/in/analytics-overview-capability.port';
import { AGENT_CAPABILITY_REGISTRY_PORT, type AgentCapabilityRegistryPort } from '../../../application/port/in/capability/agent-capability-registry.port';
import type { AgentCapabilityHandler } from '../../../application/port/out/capability/agent-capability-handler.port';
import { ownerCapabilityContext } from '../../../application/port/out/capability/agent-capability-owner-context';

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
    @Inject(AGENT_CAPABILITY_REGISTRY_PORT)
    private readonly registry: AgentCapabilityRegistryPort,
    @Inject(ANALYTICS_OVERVIEW_CAPABILITY_PORT)
    private readonly analytics: AnalyticsOverviewCapabilityPort,
  ) {}

  onModuleInit(): void {
    const execute = async (execution: { input: z.infer<typeof InputSchema>; organization: Parameters<typeof ownerCapabilityContext>[0]['organization'] }) => ({
      resourceType: 'analytics_overview',
      outputSummary: await this.analytics.readOverview({
        organizationId: ownerCapabilityContext(execution as Parameters<typeof ownerCapabilityContext>[0]).organizationId,
        now: new Date(), period: execution.input.period,
      }),
    });
    const handler: AgentCapabilityHandler<z.infer<typeof InputSchema>> = {
      key: 'analytics.readOverview', ownerDomain: 'analytics', executionKind: 'tool',
      inputSchema: InputSchema, outputSchema: OutputSchema,
      sideEffects: ['read'], approvalRisk: 'none', idempotencyKey: () => null,
      execute,
      executeInteractive: execute,
    };
    this.registry.register(handler);
  }
}
