import { Inject, Injectable } from '@nestjs/common';
import {
  SELLPIA_PRODUCT_SALES_SUMMARY_READ_PORT,
  type SellpiaProductSalesSummaryReadPort,
} from '../../../sellpia-product-sales/sellpia-product-sales-summary-read.port';
import {
  DASHBOARD_FINDINGS_REPOSITORY_PORT,
  type DashboardFindingsRepositoryPort,
} from '../port/out/repository/dashboard-findings.repository.port';
import {
  findReorderSuggestions,
  findSalesDecline,
} from '../../domain/findings/dashboard-findings';
import { businessDateText } from '../../domain/period/dashboard-period';
import {
  CHANNEL_LISTINGS_SOURCE,
  SELLPIA_INVENTORY_SOURCE,
  SELLPIA_PRODUCT_SALES_SOURCE,
  metricBasisMap,
  snapshotEvidence,
} from '../../domain/evidence';
import { kstMonthEnd } from '../../../../common/kst';
import type { DashboardContext } from '../../domain/context';
import type { DashboardFindings } from '@kiditem/shared/dashboard';

/**
 * 'AI가 발견한 문제' · 'AI 제안' — what the dashboard flags for an operator.
 *
 * Read-only. Each finding is an owner's verdict picked and counted; the
 * dashboard links to the owner screen that acts on it.
 */
@Injectable()
export class DashboardFindingsService {
  constructor(
    @Inject(SELLPIA_PRODUCT_SALES_SUMMARY_READ_PORT)
    private readonly productSales: SellpiaProductSalesSummaryReadPort,
    @Inject(DASHBOARD_FINDINGS_REPOSITORY_PORT)
    private readonly repository: DashboardFindingsRepositoryPort,
  ) {}

  async getFindings(ctx: DashboardContext, organizationId: string): Promise<DashboardFindings> {
    const [summary, rejected] = await Promise.all([
      this.productSales.getSummary(organizationId),
      this.repository.readRejectedListings(organizationId),
    ]);
    const salesDecline = findSalesDecline(summary);
    const reorderSuggestions = findReorderSuggestions(summary);
    const readAsOf = businessDateText(ctx.anchor);

    return {
      productSalesCapturedAt: summary.hasData ? summary.lastCapturedAt : null,
      salesDecline,
      reorderSuggestions,
      registrationFailures: {
        count: rejected.reduce((sum, row) => sum + row.count, 0),
        byChannel: rejected.map((row) => ({ channel: row.channel, mallName: row.mallName, count: row.count })),
      },
      metricBasis: metricBasisMap({
        // The trend compares the last complete month, so the month that just
        // closed is the one it needs; an older month is a stale verdict.
        'salesDecline.count': snapshotEvidence({
          asOf: salesDecline.month ? kstMonthEnd(salesDecline.month) : null,
          requiredAsOf: kstMonthEnd(`${ctx.prevYear}-${String(ctx.prevMonthNum).padStart(2, '0')}`),
          observedAt: summary.lastCapturedAt,
          sources: [SELLPIA_PRODUCT_SALES_SOURCE],
          measured: salesDecline.count !== null,
        }),
        // A forecast is as old as the stock it divides.
        reorderSuggestions: snapshotEvidence({
          asOf: summary.stockCapturedAt ? businessDateText(new Date(summary.stockCapturedAt)) : null,
          requiredAsOf: readAsOf,
          observedAt: summary.stockCapturedAt,
          sources: [SELLPIA_INVENTORY_SOURCE, SELLPIA_PRODUCT_SALES_SOURCE],
          measured: reorderSuggestions !== null,
        }),
        // Listing states are read as stored, now.
        'registrationFailures.count': snapshotEvidence({
          asOf: readAsOf,
          requiredAsOf: readAsOf,
          observedAt: ctx.now,
          sources: [CHANNEL_LISTINGS_SOURCE],
        }),
      }),
    };
  }
}
