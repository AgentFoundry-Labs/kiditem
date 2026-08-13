import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AgentCapabilityRegistry } from '../../../../../agent-os/application/service/agent-capability-registry.service';
import { DashboardContextService } from '../../../application/service/dashboard-context.service';
import { DashboardInventoryService } from '../../../application/service/dashboard-inventory.service';
import { DashboardSalesService } from '../../../application/service/dashboard-sales.service';
import type {
  AnalyticsOverview,
  AnalyticsOverviewCapabilityPort,
} from '../../../application/port/in/analytics-overview-capability.port';
import type { AgentCapabilityHandler } from '../../../../../agent-os/application/port/out/capability/agent-capability-handler.port';

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

type OverviewInput = z.infer<typeof InputSchema>;

@Injectable()
export class AnalyticsOverviewCapabilityAdapter
implements AnalyticsOverviewCapabilityPort, OnModuleInit {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    private readonly context: DashboardContextService,
    private readonly sales: DashboardSalesService,
    private readonly inventory: DashboardInventoryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.handler());
  }

  async readOverview(input: {
    organizationId: string;
    now: Date;
    period?: 'today' | 'month';
  }): Promise<AnalyticsOverview> {
    const period = input.period ?? 'month';
    const context = await this.context.buildForQuery(input.organizationId, period);
    const [sales, inventory] = await Promise.all([
      this.sales.getSummary(context, input.organizationId),
      this.inventory.getSummary(context, input.organizationId),
    ]);
    const selectedSales = period === 'today'
      ? { revenue: sales.today.revenue, orders: sales.today.orders }
      : { revenue: sales.monthly.revenue, orders: sales.profitDetail?.orderCount ?? 0 };
    return OutputSchema.parse({
      sales: selectedSales,
      inventory: {
        outOfStockSkus: inventory.warnings.outOfStockSkus,
        mappingAttentionSkus: inventory.warnings.mappingAttentionSkus,
      },
      freshness: {
        lastSync: inventory.dataFreshness?.lastSync ?? sales.lastSyncAt,
        confirmedUntil: inventory.dataFreshness?.confirmedUntil ?? null,
      },
    });
  }

  private handler(): AgentCapabilityHandler<OverviewInput, AnalyticsOverview> {
    return {
      key: 'analytics.readOverview',
      ownerDomain: 'analytics',
      executionKind: 'tool',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      sideEffects: ['read'],
      approvalRisk: 'none',
      idempotencyKey: () => null,
      execute: async ({ organizationId, input }) => ({
        resourceType: 'analytics_overview',
        outputSummary: await this.readOverview({
          organizationId,
          now: new Date(),
          period: input.period,
        }),
      }),
    };
  }
}
