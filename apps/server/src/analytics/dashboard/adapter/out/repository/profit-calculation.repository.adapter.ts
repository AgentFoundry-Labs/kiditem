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
// Ad metrics come from the advertising target-day ledger through the one
// listing-day ad reader (`common/ad-window-facts`). A business date the
// campaign sweep reported is a measured day; a date it never reported is
// absent evidence.
//
// Whether advertising applies at all is a property of the organization: no
// Coupang channel account means advertising is not a required input, so ad
// cost is a genuine 0 and profit is still publishable. An account whose sweep
// published nothing for a requested day withholds profit. A failed read is
// distinct from both and keeps `adEvidenceError`.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  businessDateText,
  type ResolvedDashboardPeriod,
} from '../../../domain/period/dashboard-period';
import {
  advertisingApplies,
  dayAfter,
  readAdWindowFacts,
  type AdWindowDay,
} from '../../../../../common/ad-window-facts';
import type {
  DailyProfitMetrics,
  ProfitCostIncompleteReason,
  ProfitEvidenceError,
  ProfitCalculationRepositoryPort,
  ProfitSourceCoverage,
  RangeProfitMetrics,
} from '../../../application/port/out/repository/profit-calculation.repository.port';

@Injectable()
export class ProfitCalculationRepositoryAdapter
  implements ProfitCalculationRepositoryPort
{
  private readonly logger = new Logger(ProfitCalculationRepositoryAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async calculateForRange(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<RangeProfitMetrics> {
    const { from, to } = period.queryWindow;
    if (from.getTime() >= to.getTime()) {
      return emptyRangeProfitMetrics();
    }
    // The caller resolved which KST business dates this window covers; the
    // adapter reads that set instead of re-deriving date keys of its own.
    const requestedDates = period.selectedDates;
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

    let revenue = 0;
    let costOfGoods = 0;
    let commission = 0;
    let shippingCost = 0;
    let otherCost = 0;
    const orderCount = orders.length;
    const costIncompleteReasons = new Set<ProfitCostIncompleteReason>();
    const orderedDates = new Set<string>();

    for (const o of orders) {
      // Channel ingestion stores a missing provider shipping value as 0.
      // A positive order-level value is actual order evidence and must not be
      // combined with the configured per-option fallback.
      const hasOrderShippingEvidence = o.shippingPrice > 0;
      // An admitted order is date evidence even when it carries no line item
      // or a collected zero; the row itself proves the date was observed.
      orderedDates.add(businessDateText(o.orderedAt));
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

    const published = await this.readAds(organizationId, requestedDates);
    const adRows = published.rows;
    const hasAdAccount = published.hasAdAccount;
    const adEvidenceError = published.error;
    const adTotals = sumAdRows(adRows);
    const costComplete = costIncompleteReasons.size === 0;
    const sourceCoverage: ProfitSourceCoverage = {
      requestedDates,
      orderDates: coveredDates(requestedDates, orderedDates),
      // A failed ad read leaves `adRows` empty, and so does having no account.
      // `hasAdAccount` is what keeps those apart from an account that published
      // nothing; no date is ever synthesized to close the equality below.
      adDates: coveredDates(requestedDates, adRows.map((row) => row.businessDate)),
      hasAdAccount,
    };
    const adEvidenceComplete = isAdEvidenceComplete(sourceCoverage);
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
      sourceCoverage,
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
    period: ResolvedDashboardPeriod,
  ): Promise<DailyProfitMetrics[]> {
    const { from, to } = period.queryWindow;
    if (from.getTime() >= to.getTime()) return [];
    const requestedDates = period.selectedDates;
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
    const published = await this.readAds(organizationId, requestedDates);
    const adRows = published.rows;
    const hasAdAccount = published.hasAdAccount;
    const adEvidenceError = published.error;

    const requested = new Set(requestedDates);
    const byDate = new Map<string, MutableDailyProfitMetrics>();
    for (const order of orders) {
      const date = businessDateText(order.orderedAt);
      if (!requested.has(date)) continue;
      const metrics = byDate.get(date) ?? createDailyProfitMetrics(date, hasAdAccount);
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
      for (const date of requestedDates) {
        const metrics = byDate.get(date) ?? createDailyProfitMetrics(date, hasAdAccount);
        metrics.adEvidenceError = adEvidenceError;
        byDate.set(date, metrics);
      }
    }

    if (!hasAdAccount) {
      // No advertising account exists, so no ad fact can ever be published for
      // these days. That is a genuine zero rather than an unknown: the additive
      // ad metrics settle at 0 while `hasAdEvidence` stays false, because there
      // is still no ad row behind them.
      for (const metrics of byDate.values()) {
        metrics.adCost = 0;
        metrics.adRevenue = 0;
        metrics.adImpressions = 0;
        metrics.adClicks = 0;
        metrics.adConversions = 0;
      }
    }

    for (const adRow of adRows) {
      const date = adRow.businessDate;
      if (!requested.has(date)) continue;
      const metrics = byDate.get(date) ?? createDailyProfitMetrics(date, hasAdAccount);
      metrics.adEvidenceError = adEvidenceError;
      metrics.hasAdEvidence = true;
      metrics.adCost = (metrics.adCost ?? 0) + adRow.spend;
      metrics.adRevenue = (metrics.adRevenue ?? 0) + adRow.revenue;
      metrics.adImpressions = (metrics.adImpressions ?? 0) + adRow.impressions;
      metrics.adClicks = (metrics.adClicks ?? 0) + adRow.clicks;
      metrics.adConversions = (metrics.adConversions ?? 0) + adRow.conversions;
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
        // No advertising account satisfies the ad input without an ad row; an
        // account still needs same-date evidence, so an unpublished day withholds.
        const adSatisfied = !metrics.hasAdAccount || metrics.hasAdEvidence;
        const complete = metrics.hasOrderEvidence
          && adSatisfied
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

  /**
   * The measured ad days inside the requested window, and whether advertising
   * applies to this organization at all. An organization without a Coupang
   * channel account has nothing to collect, so its ad input is satisfied at
   * zero; one with an account needs a measured row for every requested day.
   */
  private async readAds(
    organizationId: string,
    requestedDates: readonly string[],
  ): Promise<{
    rows: readonly AdWindowDay[];
    hasAdAccount: boolean;
    error?: ProfitEvidenceError;
  }> {
    if (requestedDates.length === 0) {
      // A degenerate window asks the ledger nothing, so it proves nothing:
      // absent evidence, exactly like an account that published nothing.
      return { rows: [], hasAdAccount: true };
    }
    const from = new Date(`${requestedDates[0]}T00:00:00.000Z`);
    const to = dayAfter(new Date(`${requestedDates[requestedDates.length - 1]}T00:00:00.000Z`));
    try {
      const [applies, facts] = await Promise.all([
        advertisingApplies(this.prisma, organizationId),
        readAdWindowFacts(this.prisma, { organizationId, from, to }),
      ]);
      return { rows: facts.days, hasAdAccount: applies };
    } catch (error) {
      this.logger.warn({
        msg: 'dashboard-profit.ad-evidence-unavailable',
        organizationId,
        error: error instanceof Error ? error.message : 'unknown error',
      });
      return { rows: [], hasAdAccount: true, error: 'AD_EVIDENCE_READ_FAILED' };
    }
  }
}

/**
 * Advertising is a satisfied input when the owner published a row for every
 * requested business day, or when the organization has no advertising account
 * at all. An account that published nothing, or a window the owner was never
 * asked about, is not satisfied: it is not an advertising cost of zero.
 */
function isAdEvidenceComplete(coverage: ProfitSourceCoverage): boolean {
  if (coverage.requestedDates.length === 0) return false;
  if (!coverage.hasAdAccount) return true;
  return coverage.adDates.length === coverage.requestedDates.length;
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
  hasAdAccount: boolean;
  adEvidenceError?: ProfitEvidenceError;
}

function createDailyProfitMetrics(
  date: string,
  hasAdAccount: boolean,
): MutableDailyProfitMetrics {
  return {
    date,
    hasAdAccount,
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

function sumAdRows(rows: readonly AdWindowDay[]) {
  return rows.reduce(
    (totals, row) => ({
      adCost: totals.adCost + row.spend,
      adRevenue: totals.adRevenue + row.revenue,
      adImpressions: totals.adImpressions + row.impressions,
      adClicks: totals.adClicks + row.clicks,
      adConversions: totals.adConversions + row.conversions,
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

/**
 * Project observed dates onto the requested window. Filtering the enumeration
 * keeps the result sorted, unique, and inside `[from, to]` — the partition the
 * period-basis contract asserts on.
 */
function coveredDates(
  requestedDates: readonly string[],
  observed: Iterable<string>,
): string[] {
  const available = new Set(observed);
  return requestedDates.filter((date) => available.has(date));
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
    sourceCoverage: {
      requestedDates: [],
      orderDates: [],
      adDates: [],
      hasAdAccount: true,
    },
  };
}
