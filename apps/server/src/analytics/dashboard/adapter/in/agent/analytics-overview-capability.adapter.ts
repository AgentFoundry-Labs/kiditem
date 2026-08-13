import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DashboardContextService } from '../../../application/service/dashboard-context.service';
import { DashboardInventoryService } from '../../../application/service/dashboard-inventory.service';
import { DashboardSalesService } from '../../../application/service/dashboard-sales.service';
import type {
  AnalyticsOverview,
  AnalyticsOverviewCapabilityPort,
} from '../../../application/port/in/analytics-overview-capability.port';

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
export class AnalyticsOverviewCapabilityAdapter
implements AnalyticsOverviewCapabilityPort {
  constructor(
    private readonly context: DashboardContextService,
    private readonly sales: DashboardSalesService,
    private readonly inventory: DashboardInventoryService,
  ) {}

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

}
