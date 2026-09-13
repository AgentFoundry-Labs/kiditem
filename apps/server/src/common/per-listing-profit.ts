import type { Prisma } from '@prisma/client';
import { buildPeriodBasis, type DashboardPeriodBasis } from '@kiditem/shared/dashboard';
import type { FinanceWindowBasis, FinanceWindowTotals } from '@kiditem/shared/finance';
import {
  addDays,
  businessDateKey,
  clipToClosedKstDays,
  datesInclusive,
  kstBusinessDate,
  kstWindowDateRange,
  type KstQueryWindow,
} from './kst';
import { advertisingApplies, readAdWindowFacts, readListingAdWindowFacts } from './ad-window-facts';
import { resolvePricing } from './option-pricing-resolver';
import { readInventorySkuIdentities } from '../inventory/read/inventory-availability';
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readOrderLineWindowFacts,
  type OrderWindowFacts,
} from '../orders/read/order-facts.reader';
import { readPublishedProductAbcGrades } from '../products/read/product-abc-publication.reader';

/**
 * Per-listing and window profit over live owner facts, shared by finance
 * (profit/loss, settlements, sales plans, sales analysis), statistics, the
 * dashboard and ad strategy.
 *
 * Every input comes from its owner's reader: order lines from a completed
 * Orders collection, purchase prices from Inventory, advertising from the
 * target-day ledger and grades from the current Products publication. The
 * reads run in the caller's transaction; this module owns no state.
 *
 * ADR-0006 on both sides of a profit:
 * - Cost. A purchase price, commission rate or other cost nobody recorded is
 *   unavailable, not zero. A listing with any such line has no measured
 *   profit, and a window containing one has no measured total.
 * - Advertising. A date the campaign sweep never measured is absent, never a
 *   cost of zero. Whether advertising applies at all is account-level
 *   evidence passed in as `AccountAdEvidence`, and it applies only to a
 *   listing on an account the target-day sweep covers; on any other channel
 *   advertising is Not applied.
 * - Dates. Revenue and every line cost share the collected order dates. The
 *   ad reader only sums a whole window, so when advertising applies a profit
 *   exists only when the orders cover that whole window too.
 *
 * A finance window read evaluates the requested window clipped to the KST
 * business days closed at the read's `now` (ADR-0001): an ended month keeps
 * every day, the month containing today keeps the days through yesterday, and
 * a month with no closed day evaluates nothing.
 */

// Must match the dashboard source names until a shared source-key constant exists.
const ORDERS_SOURCE = 'orders';
const COUPANG_ADS_SOURCE = 'coupang_ads';

/** One listing's order lines over a window. `null` is unavailable, never zero. */
export interface PerListingProfit {
  listingId: string;
  externalId: string;
  channelName: string | null;
  channel: string;
  masterId: string;
  masterCode: string;
  masterName: string;
  category: string | null;
  grade: string | null;
  thumbnailUrl: string | null;
  revenue: number;
  costOfGoods: number | null;
  commission: number | null;
  shippingCost: number;
  adCost: number | null;
  otherCost: number | null;
  netProfit: number | null;
  /** Percent with one decimal; `null` over zero revenue. */
  profitRate: number | null;
  orderCount: number;
}

/** A `PerListingProfit` whose every input was measured, so its profit is too. */
export interface PerListingMetrics extends PerListingProfit {
  costOfGoods: number;
  commission: number;
  adCost: number;
  otherCost: number;
  netProfit: number;
  profitRate: number;
}

/**
 * The account-level answer for one window, as the ledger states it: whether
 * advertising applies at all, how many business dates the sweep measured, what
 * it spent across them, and whether those dates cover the whole window. "No
 * spend on every date you asked about" is a measured zero; "no spend on the
 * three dates I happen to have" is not, and only `coversWindow` tells them
 * apart.
 */
export interface AccountAdEvidence {
  /** False when the organization has no Coupang channel account, so advertising does not apply. */
  hasAdAccount: boolean;
  /** Business dates the sweep measured inside the window. */
  publishedDates: number;
  /** Ad spend summed over those measured dates. */
  accountSpend: number;
  /** Whether the sweep measured **every** business date in the window. */
  coversWindow: boolean;
}

/** `AccountAdEvidence` with the business dates behind it, for a published basis. */
export interface AdWindowEvidence extends AccountAdEvidence {
  requestedDates: readonly string[];
  measuredDates: readonly string[];
}

/** The window a finance read was asked for, and the closed days it evaluates. */
export interface FinanceWindow {
  requested: KstQueryWindow;
  effective: KstQueryWindow;
}

/**
 * Resolve the window a finance read evaluates: `requested` clipped to the KST
 * business days already closed at `now`. The caller supplies `now`.
 */
export function resolveFinanceWindow(requested: KstQueryWindow, now: Date): FinanceWindow {
  return { requested, effective: clipToClosedKstDays(now, requested) };
}

/** One collected order line, priced with what its listing option recorded. */
export interface ProfitLineFact {
  orderId: string;
  listing: ProfitListingIdentity;
  revenue: number;
  /** The line's revenue-weighted share of its order's shipping price. */
  shippingCost: number;
  costOfGoods: number | null;
  commission: number | null;
  otherCost: number | null;
}

export interface ProfitListingIdentity {
  listingId: string;
  externalId: string;
  channelName: string | null;
  channel: string;
  /**
   * Whether the listing sells on an account the Coupang target-day ad sweep
   * covers. Elsewhere no target-day spend can exist, so advertising is Not
   * applied to it rather than unmeasured.
   */
  adSweepCovers: boolean;
  masterProductId: string | null;
  masterCode: string;
  masterName: string;
  category: string | null;
  thumbnailUrl: string | null;
}

/** The facts one finance window is computed from, read in one caller-owned transaction. */
export interface ProfitWindowFacts {
  window: FinanceWindow;
  /** Order facts over the evaluated window. */
  orderWindow: OrderWindowFacts;
  /** Shipping price summed over every collected order of the window. */
  orderShipping: number;
  lines: readonly ProfitLineFact[];
  /** Collected lines sold under no listing option, so no recorded cost exists. */
  unmappedLineCount: number;
  ad: AdWindowEvidence;
  listingAdSpend: ReadonlyMap<string, number>;
  gradeByProductId: ReadonlyMap<string, string>;
}

type ProfitRowFacts = Pick<
  ProfitWindowFacts,
  'orderWindow' | 'lines' | 'listingAdSpend' | 'gradeByProductId'
> & { ad: AccountAdEvidence };

async function readAdWindowEvidence(
  tx: Prisma.TransactionClient,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<AdWindowEvidence> {
  const businessDateFrom = kstBusinessDate(from);
  const businessDateTo = kstBusinessDate(to);
  const requestedDates = datesInclusive(businessDateFrom, addDays(businessDateTo, -1))
    .map(businessDateKey);
  const hasAdAccount = await advertisingApplies(tx, organizationId);
  const days = requestedDates.length === 0
    ? []
    : (await readAdWindowFacts(tx, { organizationId, from: businessDateFrom, to: businessDateTo })).days;
  return {
    hasAdAccount,
    publishedDates: days.length,
    accountSpend: days.reduce((sum, day) => sum + day.spend, 0),
    coversWindow: requestedDates.length > 0 && days.length === requestedDates.length,
    requestedDates,
    measuredDates: days.map((day) => day.businessDate),
  };
}

/**
 * The window answer, read from the advertising ledger: whether advertising
 * applies (no Coupang account, nothing to collect), how many business dates
 * of the window the campaign sweep measured, what it spent across them, and
 * whether every date in the window was measured.
 */
export async function readAdEvidenceFromLedger(
  tx: Prisma.TransactionClient,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<AccountAdEvidence> {
  const { hasAdAccount, publishedDates, accountSpend, coversWindow } =
    await readAdWindowEvidence(tx, organizationId, from, to);
  return { hasAdAccount, publishedDates, accountSpend, coversWindow };
}

async function readProfitLines(
  tx: Prisma.TransactionClient,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<Pick<ProfitWindowFacts, 'orderWindow' | 'orderShipping' | 'lines' | 'unmappedLineCount'>> {
  const facts = await readOrderLineWindowFacts(tx, {
    organizationId,
    from,
    to,
    excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
  });
  const optionIds = [...new Set(facts.orders.flatMap((order) =>
    order.lines.flatMap((line) => (line.listingOptionId ? [line.listingOptionId] : []))))];
  const options = optionIds.length === 0 ? [] : await tx.channelListingOption.findMany({
    where: { organizationId, id: { in: optionIds } },
    select: {
      id: true,
      costPriceOverride: true,
      commissionRate: true,
      otherCost: true,
      inventoryComponents: {
        where: { organizationId },
        select: { quantity: true, sellpiaInventorySkuId: true },
      },
      listing: {
        select: {
          id: true,
          externalId: true,
          channelName: true,
          displayName: true,
          category: true,
          masterProduct: { select: { id: true, code: true, name: true, category: true } },
          channelAccount: { select: { channel: true, status: true } },
          thumbnails: {
            where: { status: 'active' },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { imageUrl: true },
          },
        },
      },
    },
  });
  const inventorySkuIds = [...new Set(options.flatMap((option) =>
    option.inventoryComponents.map((component) => component.sellpiaInventorySkuId)))];
  const inventorySkus = await readInventorySkuIdentities(tx, {
    organizationId,
    selector: { kind: 'ids', values: inventorySkuIds },
  });
  const purchasePriceBySkuId = new Map(inventorySkus.map((sku) => [
    sku.sellpiaInventorySkuId,
    sku.purchasePrice,
  ]));
  const optionById = new Map(options.map((option) => {
    const listing = option.listing;
    const identity: ProfitListingIdentity = {
      listingId: listing.id,
      externalId: listing.externalId,
      channelName: listing.channelName ?? null,
      channel: listing.channelAccount.channel,
      adSweepCovers: adSweepCoversAccount(listing.channelAccount),
      masterProductId: listing.masterProduct?.id ?? null,
      masterCode: listing.masterProduct?.code ?? listing.externalId,
      masterName: listing.masterProduct?.name
        ?? listing.displayName
        ?? listing.channelName
        ?? listing.externalId,
      category: listing.masterProduct?.category ?? listing.category,
      thumbnailUrl: listing.thumbnails[0]?.imageUrl ?? null,
    };
    const pricing = resolvePricing({
      option: {
        costPriceOverride: option.costPriceOverride,
        commissionRate: option.commissionRate,
        otherCost: option.otherCost,
        inventoryComponents: option.inventoryComponents.map((component) => ({
          quantity: component.quantity,
          // A component whose Sellpia SKU the Inventory reader does not return
          // has no recorded purchase price.
          purchasePrice: purchasePriceBySkuId.get(component.sellpiaInventorySkuId) ?? null,
        })),
      },
    });
    return [option.id, { identity, pricing }] as const;
  }));

  const lines: ProfitLineFact[] = [];
  let unmappedLineCount = 0;
  let orderShipping = 0;
  for (const order of facts.orders) {
    orderShipping += order.shippingPrice;
    const orderRevenue = order.lines.reduce((sum, line) => sum + line.revenue, 0);
    for (const line of order.lines) {
      const option = line.listingOptionId ? optionById.get(line.listingOptionId) : undefined;
      if (!option) {
        unmappedLineCount += 1;
        continue;
      }
      const { unitCost, commissionRate, otherCost } = option.pricing;
      lines.push({
        orderId: order.orderId,
        listing: option.identity,
        revenue: line.revenue,
        // Revenue-weighted shipping; a zero-revenue order has nothing to weigh by.
        shippingCost: orderRevenue > 0 && order.shippingPrice > 0
          ? Math.round(order.shippingPrice * (line.revenue / orderRevenue))
          : 0,
        costOfGoods: unitCost === null ? null : unitCost * line.quantity,
        commission: commissionRate === null ? null : line.revenue * commissionRate,
        otherCost: otherCost === null ? null : otherCost * line.quantity,
      });
    }
  }
  return { orderWindow: facts.window, orderShipping, lines, unmappedLineCount };
}

async function readListingAdSpend(
  tx: Prisma.TransactionClient,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<ReadonlyMap<string, number>> {
  const rows = await readListingAdWindowFacts(tx, {
    organizationId,
    from: kstBusinessDate(from),
    to: kstBusinessDate(to),
  });
  return new Map(rows.map((row) => [row.listingId, row.spend]));
}

async function readGrades(
  tx: Prisma.TransactionClient,
  organizationId: string,
  lines: readonly ProfitLineFact[],
): Promise<ReadonlyMap<string, string>> {
  return readPublishedProductAbcGrades(tx, {
    organizationId,
    masterProductIds: [...new Set(lines.flatMap((line) =>
      line.listing.masterProductId ? [line.listing.masterProductId] : []))],
  });
}

/**
 * Read every fact one finance window needs over its evaluated (closed-day)
 * window, in the caller's transaction: collected order lines priced from their
 * options, the advertising evidence and per-listing spend for the same
 * business dates, and current grades.
 */
export async function readProfitWindowFacts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  window: FinanceWindow,
): Promise<ProfitWindowFacts> {
  const { from, to } = window.effective;
  const ad = await readAdWindowEvidence(tx, organizationId, from, to);
  const lineFacts = await readProfitLines(tx, organizationId, from, to);
  const listingAdSpend = await readListingAdSpend(tx, organizationId, from, to);
  const gradeByProductId = await readGrades(tx, organizationId, lineFacts.lines);
  return { ...lineFacts, window, ad, listingAdSpend, gradeByProductId };
}

/**
 * The accounts the Coupang target-day ad sweep covers, as Advertising's
 * `advertisingApplies` and its ledger's active-account rule decide them:
 * active Coupang accounts.
 */
function adSweepCoversAccount(account: { channel: string; status: string }): boolean {
  return account.channel === 'coupang' && account.status === 'active';
}

/**
 * Whether advertising is an input to a listing's profit: the organization has
 * an advertising account and the listing sells where its sweep looks.
 */
export function advertisingAppliesToListing(
  ad: Pick<AccountAdEvidence, 'hasAdAccount'>,
  listing: Pick<ProfitListingIdentity, 'adSweepCovers'>,
): boolean {
  return ad.hasAdAccount && listing.adSweepCovers;
}

/** Whether a completed Orders collection covered every business date of the window. */
export function isOrderWindowComplete(orderWindow: OrderWindowFacts): boolean {
  return orderWindow.revenue !== null;
}

/** A total over values that may be unavailable: any unavailable member makes it unavailable. */
export function totalOrUnavailable(values: Iterable<number | null>): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

/** Profit as a percent of revenue with one decimal; no ratio over zero revenue. */
export function profitRatePercent(netProfit: number | null, revenue: number | null): number | null {
  if (netProfit === null || revenue === null || revenue <= 0) return null;
  return Math.round((netProfit / revenue) * 1000) / 10;
}

export function roundOrUnavailable(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

/** Accumulates a value that may be unavailable; once unavailable, the total stays so. */
export function addOrUnavailable(total: number | null, value: number | null): number | null {
  return total === null || value === null ? null : total + value;
}

/**
 * A listing's ad cost, answered at account level first because only the
 * account separates an organization that runs no ads from one whose ad
 * collection failed:
 *
 * - No advertising account — no collection can exist either. Advertising is a
 *   satisfied input at zero for every listing.
 * - A listing on a channel the sweep cannot cover — no target-day row can
 *   exist for it, so advertising is Not applied to it at zero.
 * - A window the sweep measured no date of, or only part of. A sum over 3 of
 *   30 requested days proves nothing about the other 27, so the cost is
 *   unavailable.
 * - A fully measured window. The sweep looked at every listing on every
 *   measured date, so a listing's cost is the sum of its rows and a listing
 *   without a row spent nothing.
 */
function listingAdCost(
  ad: AccountAdEvidence,
  listingAdSpend: ReadonlyMap<string, number>,
  listing: ProfitListingIdentity,
): number | null {
  if (!advertisingAppliesToListing(ad, listing)) return 0;
  if (ad.publishedDates === 0 || !ad.coversWindow) return null;
  return listingAdSpend.has(listing.listingId) ? listingAdSpend.get(listing.listingId)! : 0;
}

/**
 * Whether profit inputs cover the same dates. Revenue and line costs share
 * the collected order dates; advertising, when it applies, is a whole-window
 * sum, so the orders must cover that whole window as well.
 */
function profitDatesAligned(adApplies: boolean, orderWindow: OrderWindowFacts): boolean {
  return !adApplies || isOrderWindowComplete(orderWindow);
}

/** Per-listing rows over the collected lines of a window. */
export function perListingProfitRows(facts: ProfitRowFacts): PerListingProfit[] {
  type Group = {
    identity: ProfitListingIdentity;
    revenue: number;
    shippingCost: number;
    costOfGoods: number | null;
    commission: number | null;
    otherCost: number | null;
    orderIds: Set<string>;
  };
  const groups = new Map<string, Group>();
  for (const line of facts.lines) {
    const group = groups.get(line.listing.listingId) ?? {
      identity: line.listing,
      revenue: 0,
      shippingCost: 0,
      costOfGoods: 0,
      commission: 0,
      otherCost: 0,
      orderIds: new Set<string>(),
    };
    group.revenue += line.revenue;
    group.shippingCost += line.shippingCost;
    group.costOfGoods = addOrUnavailable(group.costOfGoods, line.costOfGoods);
    group.commission = addOrUnavailable(group.commission, line.commission);
    group.otherCost = addOrUnavailable(group.otherCost, line.otherCost);
    group.orderIds.add(line.orderId);
    groups.set(line.listing.listingId, group);
  }

  return Array.from(groups.values()).map((group) => {
    const { identity } = group;
    const costOfGoods = roundOrUnavailable(group.costOfGoods);
    const commission = roundOrUnavailable(group.commission);
    const otherCost = roundOrUnavailable(group.otherCost);
    const adCost = listingAdCost(facts.ad, facts.listingAdSpend, identity);
    const costs = totalOrUnavailable([costOfGoods, commission, otherCost, adCost]);
    const datesAligned = profitDatesAligned(
      advertisingAppliesToListing(facts.ad, identity),
      facts.orderWindow,
    );
    const netProfit = !datesAligned || costs === null
      ? null
      : group.revenue - group.shippingCost - costs;
    return {
      listingId: identity.listingId,
      externalId: identity.externalId,
      channelName: identity.channelName,
      channel: identity.channel,
      masterId: identity.masterProductId ?? identity.listingId,
      masterCode: identity.masterCode,
      masterName: identity.masterName,
      category: identity.category,
      grade: identity.masterProductId
        ? facts.gradeByProductId.get(identity.masterProductId) ?? null
        : null,
      thumbnailUrl: identity.thumbnailUrl,
      revenue: group.revenue,
      costOfGoods,
      commission,
      shippingCost: group.shippingCost,
      adCost,
      otherCost,
      netProfit,
      profitRate: profitRatePercent(netProfit, group.revenue),
      orderCount: group.orderIds.size,
    } satisfies PerListingProfit;
  });
}

function lineCostsComplete(facts: Pick<ProfitWindowFacts, 'lines' | 'unmappedLineCount'>): boolean {
  return facts.unmappedLineCount === 0 && facts.lines.every((line) =>
    line.costOfGoods !== null && line.commission !== null && line.otherCost !== null);
}

/**
 * The organization's totals for the evaluated window. Each is published only
 * when the window has a closed date, the Orders collection covered every one
 * of them, and every input it depends on was measured; a line with no recorded
 * cost, or advertising the sweep did not measure, leaves cost and profit
 * unavailable.
 */
export function profitWindowTotals(facts: ProfitWindowFacts): FinanceWindowTotals {
  const revenue = facts.orderWindow.revenue;
  const hasClosedDates = facts.orderWindow.requestedDates.length > 0;
  const adCost = !hasClosedDates
    ? null
    : !facts.ad.hasAdAccount
      ? 0
      : facts.ad.coversWindow ? Math.round(facts.ad.accountSpend) : null;
  const lineCosts = lineCostsComplete(facts)
    ? Math.round(facts.lines.reduce(
      (sum, line) => sum + line.costOfGoods! + line.commission! + line.otherCost!,
      0,
    ))
    : null;
  const cost = revenue === null || lineCosts === null || adCost === null
    ? null
    : lineCosts + facts.orderShipping + adCost;
  const netProfit = revenue === null || cost === null ? null : revenue - cost;
  return {
    revenue,
    orderCount: facts.orderWindow.orderCount,
    cost,
    adCost,
    netProfit,
    profitRate: profitRatePercent(netProfit, revenue),
  } satisfies FinanceWindowTotals;
}

/** The basis of values counted from collected order lines alone, over the evaluated window. */
export function orderWindowBasis(orderWindow: OrderWindowFacts, window: FinanceWindow): DashboardPeriodBasis {
  return buildPeriodBasis({
    ...kstWindowDateRange(window.effective),
    includedDates: orderWindow.includedDates,
    sources: [ORDERS_SOURCE],
  });
}

/**
 * The evidence behind a finance window, as measured facts: the requested
 * window, and over the evaluated window the dates orders and advertising
 * covered. Profit is measured on the dates both covered; a window with a line
 * lacking a recorded cost refuses every date for profit.
 */
export function profitWindowBasis(facts: ProfitWindowFacts): FinanceWindowBasis {
  const range = kstWindowDateRange(facts.window.effective);
  const adDates = facts.ad.hasAdAccount ? facts.ad.measuredDates : facts.orderWindow.requestedDates;
  const adDateSet = new Set(adDates);
  return {
    requestedWindow: kstWindowDateRange(facts.window.requested),
    revenue: orderWindowBasis(facts.orderWindow, facts.window),
    adCost: buildPeriodBasis({ ...range, includedDates: adDates, sources: [COUPANG_ADS_SOURCE] }),
    profit: buildPeriodBasis({
      ...range,
      includedDates: facts.orderWindow.includedDates.filter((date) => adDateSet.has(date)),
      invalidDates: lineCostsComplete(facts) ? [] : facts.orderWindow.requestedDates,
      sources: facts.ad.hasAdAccount ? [ORDERS_SOURCE, COUPANG_ADS_SOURCE] : [ORDERS_SOURCE],
    }),
  } satisfies FinanceWindowBasis;
}

/** Narrows to the listings whose every profit input was measured. */
export function hasMeasuredProfit(
  row: PerListingProfit,
): row is PerListingMetrics {
  return row.costOfGoods !== null
    && row.commission !== null
    && row.otherCost !== null
    && row.adCost !== null
    && row.netProfit !== null
    && row.profitRate !== null;
}

/**
 * @param accountAdEvidence how Advertising says this window's account-level
 *   coverage should be read — obtain it with `readAdEvidenceFromLedger` for
 *   the same `[from, to)` window. It is required because its absence is what
 *   made "this organization runs no ads" and "ad collection failed for the
 *   whole window" the same computed zero.
 */
export async function buildPerListingProfit(
  tx: Prisma.TransactionClient,
  organizationId: string,
  from: Date,
  to: Date,
  accountAdEvidence: AccountAdEvidence,
): Promise<PerListingProfit[]> {
  const lineFacts = await readProfitLines(tx, organizationId, from, to);
  const listingAdSpend = await readListingAdSpend(tx, organizationId, from, to);
  const gradeByProductId = await readGrades(tx, organizationId, lineFacts.lines);
  return perListingProfitRows({
    orderWindow: lineFacts.orderWindow,
    lines: lineFacts.lines,
    ad: accountAdEvidence,
    listingAdSpend,
    gradeByProductId,
  });
}

/**
 * The measured per-listing rows, and how much of the window's population they
 * left out. A caller that publishes a calculation basis needs both: the count
 * it can compute, and the fact that it counted a subset.
 */
export interface PerListingMetricsCoverage {
  /** Listings whose every profit input was measured. */
  metrics: PerListingMetrics[];
  /** Listings withheld because an input was not measured. */
  withheldListings: number;
}

/**
 * Per-listing rows whose profit is measured, with the withheld population.
 *
 * A listing with an unmeasured input is **withheld** rather than published
 * with a partial figure. Withholding shrinks the population a rollup counts,
 * so the size of what was withheld travels with it; `withheldListings > 0`
 * with an empty `metrics` is an empty computable subset, not a counted zero.
 */
export async function buildPerListingMetricsCoverage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  from: Date,
  to: Date,
  accountAdEvidence: AccountAdEvidence,
): Promise<PerListingMetricsCoverage> {
  const rows = await buildPerListingProfit(tx, organizationId, from, to, accountAdEvidence);
  const metrics = rows.filter(hasMeasuredProfit);
  return { metrics, withheldListings: rows.length - metrics.length };
}

/**
 * The measured projection alone, for callers that publish no calculation
 * basis and so have nowhere to say a listing was withheld.
 */
export async function buildPerListingMetrics(
  tx: Prisma.TransactionClient,
  organizationId: string,
  from: Date,
  to: Date,
  accountAdEvidence: AccountAdEvidence,
): Promise<PerListingMetrics[]> {
  const coverage = await buildPerListingMetricsCoverage(tx, organizationId, from, to, accountAdEvidence);
  return coverage.metrics;
}
