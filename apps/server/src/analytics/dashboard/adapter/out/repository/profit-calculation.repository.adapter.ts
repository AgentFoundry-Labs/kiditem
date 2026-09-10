// Period profit aggregation — v2 I3 canonical on `OrderLineItem.totalPrice`
// (not `Order.totalPrice`). The Plan A.5 schema removed `Order.product` and
// `Order.quantity`; revenue/costs sum per line item.
//
// Invariants applied:
//   - I3: revenue = SUM(OrderLineItem.totalPrice) (lineItem-level canonical)
//   - I7: organizationId filter (multi-tenant isolation)
//   - I8: half-open range `orderedAt >= from && orderedAt < to` (never `lte`)
//   - C-08: v2 nested-only resolver — `resolvePricing({ option })`
//   - R-1 (Plan D.1 T4): shipping accumulates from `Order.shippingPrice`
//     once per order (outer loop), not per line item.
//
// Ad metrics are read only through the Advertising owner publication port.
// ChannelListingDailySnapshot is deliberately not an account-ad source: its
// listing/traffic rows cannot prove complete account coverage.

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { kstBusinessDate } from '../../../../../common/kst';
import {
  AD_ACCOUNT_DAILY_KPI_READ_PORT,
  type AdAccountDailyKpiReadPort,
} from '../../../../../advertising/application/port/in/ad-account-daily-kpi-source.port';
import type { AdAccountDailyKpiPublishedRow } from '@kiditem/shared/advertising';
import type {
  DailyProfitMetrics,
  ProfitCostIncompleteReason,
  ProfitEvidenceError,
  ProfitCalculationRepositoryPort,
  RangeProfitMetrics,
} from '../../../application/port/out/repository/profit-calculation.repository.port';

@Injectable()
export class ProfitCalculationRepositoryAdapter
  implements ProfitCalculationRepositoryPort
{
  private readonly logger = new Logger(ProfitCalculationRepositoryAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AD_ACCOUNT_DAILY_KPI_READ_PORT)
    private readonly adAccountDailyKpiRead: AdAccountDailyKpiReadPort,
  ) {}

  async calculateForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RangeProfitMetrics> {
    if (from.getTime() >= to.getTime()) {
      return emptyRangeProfitMetrics();
    }
    const { from: businessFrom, to: businessTo } = businessDateBounds(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        organizationId,
        orderedAt: { gte: from, lt: to },
        status: { notIn: ['cancelled', 'returned', 'refunded'] },
      },
      select: {
        shippingPrice: true,
        lineItems: {
          select: {
            quantity: true,
            totalPrice: true,
            listingOption: {
              select: {
                costPriceOverride: true,
                commissionRate: true,
                shippingCost: true,
                otherCost: true,
                inventoryComponents: {
                  select: {
                    quantity: true,
                    sellpiaInventorySku: {
                      select: { purchasePrice: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    let revenue = 0;
    let costOfGoods = 0;
    let commission = 0;
    let shippingCost = 0;
    let otherCost = 0;
    const orderCount = orders.length;
    const costIncompleteReasons = new Set<ProfitCostIncompleteReason>();

    for (const o of orders) {
      // Channel ingestion stores a missing provider shipping value as 0.
      // A positive order-level value is actual order evidence and must not be
      // combined with the configured per-option fallback.
      const hasOrderShippingEvidence = o.shippingPrice > 0;
      if (hasOrderShippingEvidence) shippingCost += o.shippingPrice;
      for (const li of o.lineItems) {
        revenue += li.totalPrice || 0;
        const costs = resolveLineItemCosts(li, hasOrderShippingEvidence);
        for (const reason of costs.reasons) costIncompleteReasons.add(reason);
        costOfGoods += costs.costOfGoods;
        commission += costs.commission;
        otherCost += costs.otherCost;
        shippingCost += costs.shippingCost;
      }
    }

    let adRows: AdAccountDailyKpiPublishedRow[] = [];
    let adEvidenceError: ProfitEvidenceError | undefined;
    try {
      adRows = await this.readPublishedAds(
        organizationId,
        businessDateRange(businessFrom, businessTo),
      );
    } catch (error) {
      this.logger.warn({
        msg: 'dashboard-profit.ad-evidence-unavailable',
        organizationId,
        error: error instanceof Error ? error.message : 'unknown error',
      });
      adEvidenceError = 'AD_EVIDENCE_READ_FAILED';
    }
    const adTotals = sumAdRows(adRows);
    const costComplete = costIncompleteReasons.size === 0;
    const adEvidenceComplete = !adEvidenceError && hasCompleteAdCoverage(
      businessFrom,
      businessTo,
      adRows,
    );
    const netProfit = costComplete && adEvidenceComplete
      ? revenue - costOfGoods - commission - shippingCost - adTotals.adCost - otherCost
      : null;
    const profitRate = netProfit !== null && revenue > 0
      ? Math.round((netProfit / revenue) * 1000) / 10
      : null;

    return {
      revenue: Math.round(revenue),
      costOfGoods: Math.round(costOfGoods),
      commission: Math.round(commission),
      shippingCost: Math.round(shippingCost),
      adCost: Math.round(adTotals.adCost),
      otherCost: Math.round(otherCost),
      netProfit: netProfit === null ? null : Math.round(netProfit),
      profitRate,
      orderCount,
      adImpressions: adTotals.adImpressions,
      adClicks: adTotals.adClicks,
      adConversions: adTotals.adConversions,
      adRevenue: Math.round(adTotals.adRevenue),
      costComplete,
      costIncompleteReasons: [...costIncompleteReasons],
      adEvidenceComplete,
      ...(adEvidenceError ? { adEvidenceError } : {}),
    } satisfies RangeProfitMetrics;
  }

  /**
   * Returns actual per-day order and ad evidence for dashboard trend/profit
   * consumers. A day is emitted when either source has a row; missing source
   * values stay null so callers can intersect valid dates instead of
   * prorating a whole-range margin over revenue.
   */
  async calculateDailyForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<DailyProfitMetrics[]> {
    if (from.getTime() >= to.getTime()) return [];
    const { from: businessFrom, to: businessTo } = businessDateBounds(from, to);
    const businessFromText = dateText(businessFrom);
    const businessToText = dateText(businessTo);
    const orders = await this.prisma.order.findMany({
        where: {
          organizationId,
          orderedAt: { gte: from, lt: to },
          status: { notIn: ['cancelled', 'returned', 'refunded'] },
        },
        select: {
          orderedAt: true,
          shippingPrice: true,
          lineItems: {
            select: {
              quantity: true,
              totalPrice: true,
              listingOption: {
                select: {
                  costPriceOverride: true,
                  commissionRate: true,
                  shippingCost: true,
                  otherCost: true,
                  inventoryComponents: {
                    select: {
                      quantity: true,
                      sellpiaInventorySku: {
                        select: { purchasePrice: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
    let adRows: AdAccountDailyKpiPublishedRow[] = [];
    let adEvidenceError: ProfitEvidenceError | undefined;
    try {
      adRows = await this.readPublishedAds(
        organizationId,
        businessDateRange(businessFrom, businessTo),
      );
    } catch (error) {
      this.logger.warn({
        msg: 'dashboard-profit.ad-evidence-unavailable',
        organizationId,
        error: error instanceof Error ? error.message : 'unknown error',
      });
      adEvidenceError = 'AD_EVIDENCE_READ_FAILED';
    }

    const byDate = new Map<string, MutableDailyProfitMetrics>();
    for (const order of orders) {
      const date = kstDateText(order.orderedAt);
      if (date < businessFromText || date >= businessToText) continue;
      const metrics = byDate.get(date) ?? createDailyProfitMetrics(date);
      metrics.hasOrderEvidence = true;
      metrics.orderCount += 1;
      if (order.shippingPrice > 0) {
        metrics.shippingCost += order.shippingPrice;
      }
      for (const lineItem of order.lineItems) {
        const quantity = lineItem.quantity;
        metrics.qty += quantity;
        metrics.revenue += lineItem.totalPrice || 0;
        const costs = resolveLineItemCosts(lineItem, order.shippingPrice > 0);
        for (const reason of costs.reasons) metrics.costIncompleteReasons.add(reason);
        metrics.costOfGoods += costs.costOfGoods;
        metrics.commission += costs.commission;
        metrics.otherCost += costs.otherCost;
        metrics.shippingCost += costs.shippingCost;
      }
      byDate.set(date, metrics);
    }

    if (adEvidenceError) {
      // Preserve the failed source even when there are no orders (and hence
      // no natural daily row). Synthetic evidence rows are deliberately
      // order/ad-empty; the dashboard uses the error marker only to publish
      // unverified basis metadata, never as a zero-valued metric.
      for (
        let cursor = businessFrom;
        cursor.getTime() < businessTo.getTime();
        cursor = new Date(cursor.getTime() + 86_400_000)
      ) {
        const date = dateText(cursor);
        const metrics = byDate.get(date) ?? createDailyProfitMetrics(date);
        metrics.adEvidenceError = adEvidenceError;
        byDate.set(date, metrics);
      }
    }

    for (const adRow of adRows) {
      const date = adRow.businessDate;
      if (date < businessFromText || date >= businessToText) continue;
      const metrics = byDate.get(date) ?? createDailyProfitMetrics(date);
      metrics.adEvidenceError = adEvidenceError;
      metrics.hasAdEvidence = true;
      metrics.adCost = (metrics.adCost ?? 0) + adRow.normalized.adSpend;
      metrics.adRevenue = (metrics.adRevenue ?? 0) + adRow.normalized.adRevenue;
      metrics.adImpressions = (metrics.adImpressions ?? 0) + adRow.normalized.impressions;
      metrics.adClicks = (metrics.adClicks ?? 0) + adRow.normalized.clicks;
      metrics.adConversions = (metrics.adConversions ?? 0) + adRow.normalized.conversions;
      byDate.set(date, metrics);
    }

    return [...byDate.values()]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((metrics) => {
        const cost = metrics.costOfGoods
          + metrics.commission
          + metrics.shippingCost
          + metrics.otherCost;
        const costComplete = metrics.costIncompleteReasons.size === 0;
        const complete = metrics.hasOrderEvidence
          && metrics.hasAdEvidence
          && costComplete
          && !metrics.adEvidenceError;
        const netProfit = complete
          ? metrics.revenue - cost - (metrics.adCost ?? 0)
          : null;
        const profitRate = netProfit !== null && metrics.revenue > 0
          ? Math.round((netProfit / metrics.revenue) * 1000) / 10
          : null;
        return {
          ...metrics,
          cost: Math.round(cost),
          revenue: Math.round(metrics.revenue),
          qty: Math.round(metrics.qty),
          costOfGoods: Math.round(metrics.costOfGoods),
          commission: Math.round(metrics.commission),
          shippingCost: Math.round(metrics.shippingCost),
          otherCost: Math.round(metrics.otherCost),
          adCost: metrics.adCost === null ? null : Math.round(metrics.adCost),
          adRevenue: metrics.adRevenue === null ? null : Math.round(metrics.adRevenue),
          adImpressions: metrics.adImpressions === null ? null : Math.round(metrics.adImpressions),
          adClicks: metrics.adClicks === null ? null : Math.round(metrics.adClicks),
          adConversions: metrics.adConversions === null ? null : Math.round(metrics.adConversions),
          netProfit: netProfit === null ? null : Math.round(netProfit),
          profitRate,
          costComplete,
          costIncompleteReasons: [...metrics.costIncompleteReasons],
          ...(metrics.adEvidenceError ? { adEvidenceError: metrics.adEvidenceError } : {}),
        } satisfies DailyProfitMetrics;
      });
  }

  private async readPublishedAds(
    organizationId: string,
    range: { from: string; to: string },
  ): Promise<AdAccountDailyKpiPublishedRow[]> {
    try {
      return (
        await this.adAccountDailyKpiRead.readPublished({
          organizationId,
          from: range.from,
          to: range.to,
        })
      ).rows;
    } catch (error) {
      if (
        error instanceof NotFoundException
        && error.message === 'COUPANG_ACCOUNT_NOT_FOUND'
      ) {
        return [];
      }
      throw error;
    }
  }
}

interface MutableDailyProfitMetrics {
  date: string;
  revenue: number;
  qty: number;
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  otherCost: number;
  adCost: number | null;
  adRevenue: number | null;
  adImpressions: number | null;
  adClicks: number | null;
  adConversions: number | null;
  orderCount: number;
  hasOrderEvidence: boolean;
  hasAdEvidence: boolean;
  costIncompleteReasons: Set<ProfitCostIncompleteReason>;
  adEvidenceError?: ProfitEvidenceError;
}

function createDailyProfitMetrics(date: string): MutableDailyProfitMetrics {
  return {
    date,
    revenue: 0,
    qty: 0,
    costOfGoods: 0,
    commission: 0,
    shippingCost: 0,
    otherCost: 0,
    adCost: null,
    adRevenue: null,
    adImpressions: null,
    adClicks: null,
    adConversions: null,
    orderCount: 0,
    hasOrderEvidence: false,
    hasAdEvidence: false,
    costIncompleteReasons: new Set(),
  };
}

function kstDateText(value: Date): string {
  return kstBusinessDate(value).toISOString().slice(0, 10);
}

function dateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Convert timestamp half-open bounds to the inclusive business-date keys they touch. */
function businessDateBounds(from: Date, to: Date): { from: Date; to: Date } {
  const first = kstBusinessDate(from);
  const last = kstBusinessDate(new Date(to.getTime() - 1));
  const exclusive = new Date(last.getTime() + 86_400_000);
  return { from: first, to: exclusive };
}

function businessDateRange(
  from: Date,
  toExclusive: Date,
): { from: string; to: string } {
  return {
    from: dateText(from),
    to: dateText(new Date(toExclusive.getTime() - 86_400_000)),
  };
}

interface LineItemCostResolution {
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  otherCost: number;
  reasons: ProfitCostIncompleteReason[];
}

interface CostLineItem {
  quantity: number;
  totalPrice: number;
  listingOption: {
    costPriceOverride: number | null;
    commissionRate: unknown;
    shippingCost: number | null;
    otherCost: number | null;
    inventoryComponents: Array<{
      quantity: number;
      sellpiaInventorySku: { purchasePrice: number | null };
    }>;
  } | null;
}

/** Resolve costs without upgrading absent nullable fields into measured zeroes. */
function resolveLineItemCosts(
  lineItem: CostLineItem,
  hasOrderShippingEvidence: boolean,
): LineItemCostResolution {
  const reasons = new Set<ProfitCostIncompleteReason>();
  const option = lineItem.listingOption;
  if (!option) {
    return {
      costOfGoods: 0,
      commission: 0,
      shippingCost: 0,
      otherCost: 0,
      reasons: ['MISSING_LISTING_OPTION'],
    };
  }

  let costOfGoods = 0;
  if (option.costPriceOverride !== null) {
    costOfGoods = option.costPriceOverride * lineItem.quantity;
  } else if (option.inventoryComponents.length === 0) {
    reasons.add('MISSING_COST_PRICE');
  } else {
    let completeComponents = true;
    for (const component of option.inventoryComponents) {
      if (component.sellpiaInventorySku.purchasePrice === null) {
        completeComponents = false;
        continue;
      }
      costOfGoods += component.sellpiaInventorySku.purchasePrice
        * component.quantity
        * lineItem.quantity;
    }
    if (!completeComponents) reasons.add('MISSING_PURCHASE_PRICE');
  }

  const commissionRate = option.commissionRate === null
    || option.commissionRate === undefined
    ? null
    : Number(option.commissionRate);
  if (commissionRate === null || !Number.isFinite(commissionRate)) {
    reasons.add('MISSING_COMMISSION_RATE');
  }

  let commission = 0;
  if (commissionRate !== null && Number.isFinite(commissionRate)) {
    commission = lineItem.totalPrice * commissionRate;
  }

  let shippingCost = 0;
  if (!hasOrderShippingEvidence) {
    if (option.shippingCost === null) reasons.add('MISSING_SHIPPING_COST');
    else shippingCost = option.shippingCost * lineItem.quantity;
  }

  let otherCost = 0;
  if (option.otherCost === null) reasons.add('MISSING_OTHER_COST');
  else otherCost = option.otherCost * lineItem.quantity;

  return { costOfGoods, commission, shippingCost, otherCost, reasons: [...reasons] };
}

function sumAdRows(rows: readonly AdAccountDailyKpiPublishedRow[]) {
  return rows.reduce(
    (totals, row) => ({
      adCost: totals.adCost + row.normalized.adSpend,
      adRevenue: totals.adRevenue + row.normalized.adRevenue,
      adImpressions: totals.adImpressions + row.normalized.impressions,
      adClicks: totals.adClicks + row.normalized.clicks,
      adConversions: totals.adConversions + row.normalized.conversions,
    }),
    {
      adCost: 0,
      adRevenue: 0,
      adImpressions: 0,
      adClicks: 0,
      adConversions: 0,
    },
  );
}

function hasCompleteAdCoverage(
  from: Date,
  toExclusive: Date,
  rows: readonly AdAccountDailyKpiPublishedRow[],
): boolean {
  const available = new Set(rows.map((row) => row.businessDate));
  for (
    let cursor = from;
    cursor.getTime() < toExclusive.getTime();
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    if (!available.has(dateText(cursor))) return false;
  }
  return from.getTime() < toExclusive.getTime();
}

function emptyRangeProfitMetrics(): RangeProfitMetrics {
  return {
    revenue: 0,
    costOfGoods: 0,
    commission: 0,
    shippingCost: 0,
    adCost: 0,
    otherCost: 0,
    netProfit: null,
    profitRate: null,
    orderCount: 0,
    adRevenue: 0,
    adImpressions: 0,
    adClicks: 0,
    adConversions: 0,
    costComplete: false,
    costIncompleteReasons: [],
    adEvidenceComplete: false,
  };
}
