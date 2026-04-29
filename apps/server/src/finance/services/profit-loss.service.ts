import { Injectable, Logger } from '@nestjs/common';
import type { PLData } from '@kiditem/shared/finance';
import { PrismaService } from '../../prisma/prisma.service';
import { kstMonthStart } from '../../common/kst';
import { buildPerListingMetrics } from '../../common/per-listing-profit';

/**
 * Plan D.1 T5 (v2) — ADR-0016 live aggregation.
 * Plan F1 T1 — per-listing core extracted to common/per-listing-profit.ts so dashboard
 * can share the math. This service adds returnCount + maps PerListingMetrics → PLData.
 */
@Injectable()
export class ProfitLossService {
  private readonly logger = new Logger(ProfitLossService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    year: number,
    month: number,
  ): Promise<PLData[]> {
    const startedAt = Date.now();
    const from = kstMonthStart(year, month);
    const to = kstMonthStart(year, month + 1);

    const [metrics, returnRows] = await Promise.all([
      buildPerListingMetrics(this.prisma, companyId, from, to),
      this.prisma.orderReturnLineItem.findMany({
        where: {
          companyId,
          return: { requestedAt: { gte: from, lt: to } },
        },
        select: {
          orderLineItem: {
            select: { listingOption: { select: { listingId: true } } },
          },
        },
      }),
    ]);

    const returnMap = new Map<string, number>();
    for (const rli of returnRows) {
      const listingId = rli.orderLineItem?.listingOption?.listingId;
      if (!listingId) continue;
      returnMap.set(listingId, (returnMap.get(listingId) ?? 0) + 1);
    }

    const rows = metrics.map((m) => ({
      listingId: m.listingId,
      externalId: m.externalId,
      channelName: m.channelName,
      masterId: m.masterId,
      masterCode: m.masterCode,
      masterName: m.masterName,
      category: m.category,
      grade: m.grade,
      thumbnailUrl: m.thumbnailUrl,
      revenue: m.revenue,
      cogs: m.costOfGoods,                   // PLData uses `cogs`, helper uses `costOfGoods`
      commission: m.commission,
      shippingCost: m.shippingCost,
      adCost: m.adCost,
      otherCost: m.otherCost,
      netProfit: m.netProfit,
      profitRate: m.profitRate,
      orderCount: m.orderCount,
      returnCount: returnMap.get(m.listingId) ?? 0,
    } satisfies PLData)).sort((a, b) => b.revenue - a.revenue);

    this.logger.log({
      msg: 'profit-loss.findAll',
      companyId,
      year,
      month,
      listingCount: rows.length,
      latencyMs: Date.now() - startedAt,
    });

    return rows;
  }
}
