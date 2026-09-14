import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readOrderLineWindowFacts,
} from '../../../../../orders/read/order-facts.reader';
import type {
  DashboardTrendRepositoryPort,
  TrendRevenueRow,
} from '../../../application/port/out/repository/dashboard-trend.repository.port';

/**
 * Trend projection over Orders' canonical line facts and coverage.
 */
@Injectable()
export class DashboardTrendRepositoryAdapter
  implements DashboardTrendRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async fetchTrendRevenueRows(
    organizationId: string,
    since: Date,
    until: Date,
  ): Promise<TrendRevenueRow[]> {
    const facts = await this.prisma.$transaction(
      (tx) => readOrderLineWindowFacts(tx, {
        organizationId,
        from: since,
        to: until,
        excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
    const revenueByDate = new Map<string, number>(
      facts.window.includedDates.map((date) => [date, 0] as const),
    );
    for (const line of facts.orders.flatMap((order) => order.lines)) {
      if (!revenueByDate.has(line.businessDate)) continue;
      revenueByDate.set(
        line.businessDate,
        (revenueByDate.get(line.businessDate) ?? 0) + line.revenue,
      );
    }
    return [...revenueByDate].map(([date, revenue]) => ({ date, revenue }));
  }
}
