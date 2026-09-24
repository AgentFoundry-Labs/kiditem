import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { buildDashboardContext } from '../../../../domain/dashboard/context';
import { DashboardInventoryService } from '../../../../application/service/dashboard/dashboard-inventory.service';
import { DashboardSalesService } from '../../../../application/service/dashboard/dashboard-sales.service';
import type {
  AnalyticsOverview,
  AnalyticsOverviewCapabilityPort,
} from '../../../../application/port/in/dashboard/analytics-overview-capability.port';

const OutputSchema = z.object({
  sales: z.object({
    revenue: z.number().nullable(),
    orders: z.number().int().nonnegative().nullable(),
  }).strict(),
  inventory: z.object({
    outOfStockSkus: z.number().int().nonnegative().nullable(),
    mappingAttentionSkus: z.number().int().nonnegative(),
  }).strict(),
  freshness: z.object({
    lastSync: z.string().datetime().nullable(),
  }).strict(),
}).strict();

@Injectable()
export class AnalyticsOverviewCapabilityAdapter
implements AnalyticsOverviewCapabilityPort {
  constructor(
    private readonly sales: DashboardSalesService,
    private readonly inventory: DashboardInventoryService,
  ) {}

  async readOverview(input: {
    organizationId: string;
    now: Date;
    period?: 'today' | 'month';
  }): Promise<AnalyticsOverview> {
    const period = input.period ?? 'month';
    const context = buildDashboardContext(
      period === 'today' ? 'day' : 'month',
      undefined,
      undefined,
      input.now,
    );
    const [sales, inventory] = await Promise.all([
      this.sales.getSummary(context, input.organizationId),
      this.inventory.getSummary(context, input.organizationId),
    ]);
    const selectedSales = period === 'today'
      ? { revenue: sales.today.revenue, orders: sales.today.orders }
      : { revenue: sales.monthly.revenue, orders: sales.profitDetail?.orderCount ?? null };
    return OutputSchema.parse({
      sales: selectedSales,
      inventory: {
        outOfStockSkus: inventory.warnings.outOfStockSkus,
        mappingAttentionSkus: inventory.warnings.mappingAttentionSkus,
      },
      freshness: {
        lastSync: sales.lastSyncAt,
      },
    });
  }

}
