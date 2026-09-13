import type { Prisma } from '@prisma/client';
import {
  buildPeriodBasis,
  COUPANG_ADS_SOURCE,
  ORDERS_SOURCE,
  type DashboardPeriodBasis,
} from '@kiditem/shared/dashboard';
import type {
  FinanceCostInputsBasis,
  FinanceWindowBasis,
  FinanceWindowTotals,
} from '@kiditem/shared/finance';
import {
  addDays,
  businessDateKey,
  clipToClosedKstDays,
  datesInclusive,
  kstBusinessDate,
  kstWindowDateRange,
  type KstQueryWindow,
} from './kst';
import {
  adSweepCoversChannelAccount,
  advertisingApplies,
  advertisingAppliesToSale,
  readAdWindowFacts,
  readListingAdWindowFacts,
} from './ad-window-facts';
import { resolveOrderLineSalesCosts, resolveUnitCost } from './option-pricing-resolver';
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
 * - Cost (KID-114). Purchase cost is the option recipe priced at Sellpia
 *   purchase prices; an unpriced recipe is unavailable, not zero. Whether a
 *   sales commission and other per-sale cost apply is the order's channel
 *   account rule (`channelAccountSalesCosts`): Rocket direct purchase applies
 *   neither (Not applied, 0), and an account that applies them has no measured
 *   source yet, so they are unavailable. Option cost columns are not inputs. A
 *   listing with any unavailable line cost has no measured profit, and a
 *   window containing one has no measured total.
 * - Advertising. A date the campaign sweep never measured is absent, never a
 *   cost of zero. Whether advertising applies at all is account-level
 *   evidence passed in as `AccountAdEvidence`; for a listing it is
 *   Advertising's rule (`advertisingAppliesToSale`): measured spend always
 *   applies, and otherwise it applies to a listing on an account the sweep
 *   covers. Elsewhere advertising is Not applied.
 * - Dates. Revenue and every line cost share the collected order dates. The
 *   ad reader only sums a whole window, so when advertising applies a profit
 *   exists only when the orders cover that whole window too.
 *
 * A finance window read evaluates the requested window clipped to the KST
 * business days closed at the read's `now` (ADR-0001): an ended month keeps
 * every day, the month containing today keeps the days through yesterday, and
 * a month with no closed day evaluates nothing.
 */

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

/** One collected order line, priced by its recipe and its order's channel account. */
export interface ProfitLineFact {
  orderId: string;
  listing: ProfitListingIdentity;
  revenue: number;
  /** The line's revenue-weighted share of its order's shipping price. */
  shippingCost: number;
  costOfGoods: number | null;
  /** Whether the order's channel account carries a sales commission. */
  commissionApplies: boolean;
  /** Whether the order's channel account carries an other per-sale cost. */
  otherCostApplies: boolean;
  /** 0 when the commission does not apply; `null` when it applies without a source. */
  commission: number | null;
  /** 0 when the other cost does not apply; `null` when it applies without a source. */
  otherCost: number | null;
}

/** A collected line sold under no listing option: no recipe, but its order's account is known. */
export interface UnmappedLineFact {
  orderId: string;
  commissionApplies: boolean;
  otherCostApplies: boolean;
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
  unmappedLines: readonly UnmappedLineFact[];
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
): Promise<Pick<
  ProfitWindowFacts,
  'orderWindow' | 'orderShipping' | 'lines' | 'unmappedLineCount' | 'unmappedLines'
>> {
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
  // The order's channel account decides whether a commission and other
  // per-sale cost apply to its lines (KID-114).
  const accountIds = [...new Set(facts.orders.map((order) => order.channelAccountId))];
  const orderAccounts = accountIds.length === 0 ? [] : await tx.channelAccount.findMany({
    where: { organizationId, id: { in: accountIds } },
    select: { id: true, channel: true },
  });
  const salesCostsByAccountId = new Map(orderAccounts.map((account) => [
    account.id,
    resolveOrderLineSalesCosts(account),
  ]));
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
      adSweepCovers: adSweepCoversChannelAccount(listing.channelAccount),
      masterProductId: listing.masterProduct?.id ?? null,
      masterCode: listing.masterProduct?.code ?? listing.externalId,
      masterName: listing.masterProduct?.name
        ?? listing.displayName
        ?? listing.channelName
        ?? listing.externalId,
      category: listing.masterProduct?.category ?? listing.category,
      thumbnailUrl: listing.thumbnails[0]?.imageUrl ?? null,
    };
    const unitCost = resolveUnitCost({
      inventoryComponents: option.inventoryComponents.map((component) => ({
        quantity: component.quantity,
        // A component whose Sellpia SKU the Inventory reader does not return
        // has no recorded purchase price.
        purchasePrice: purchasePriceBySkuId.get(component.sellpiaInventorySkuId) ?? null,
      })),
    });
    return [option.id, { identity, unitCost }] as const;
  }));

  const lines: ProfitLineFact[] = [];
  const unmappedLines: UnmappedLineFact[] = [];
  let orderShipping = 0;
  for (const order of facts.orders) {
    orderShipping += order.shippingPrice;
    const salesCosts = salesCostsByAccountId.get(order.channelAccountId)
      ?? resolveOrderLineSalesCosts(null);
    const orderRevenue = order.lines.reduce((sum, line) => sum + line.revenue, 0);
    for (const line of order.lines) {
      const option = line.listingOptionId ? optionById.get(line.listingOptionId) : undefined;
      if (!option) {
        unmappedLines.push({
          orderId: order.orderId,
          commissionApplies: salesCosts.commissionApplies,
          otherCostApplies: salesCosts.otherCostApplies,
        });
        continue;
      }
      lines.push({
        orderId: order.orderId,
        listing: option.identity,
        revenue: line.revenue,
        // Revenue-weighted shipping; a zero-revenue order has nothing to weigh by.
        shippingCost: orderRevenue > 0 && order.shippingPrice > 0
          ? Math.round(order.shippingPrice * (line.revenue / orderRevenue))
          : 0,
        costOfGoods: option.unitCost === null ? null : option.unitCost * line.quantity,
        commissionApplies: salesCosts.commissionApplies,
        otherCostApplies: salesCosts.otherCostApplies,
        commission: salesCosts.commission,
        otherCost: salesCosts.otherCost,
      });
    }
  }
  return {
    orderWindow: facts.window,
    orderShipping,
    lines,
    unmappedLineCount: unmappedLines.length,
    unmappedLines,
  };
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
 * Whether advertising is an input to a listing's profit, by Advertising's rule
 * (`advertisingAppliesToSale`): measured spend for the listing always applies;
 * otherwise the organization must advertise and the listing must sell on an
 * account the sweep covers.
 */
export function advertisingAppliesToListing(
  ad: Pick<AccountAdEvidence, 'hasAdAccount'>,
  listing: Pick<ProfitListingIdentity, 'adSweepCovers' | 'listingId'>,
  listingAdSpend: ReadonlyMap<string, number>,
): boolean {
  return advertisingAppliesToSale({
    organizationAdvertises: ad.hasAdAccount,
    sweepCoversAccount: listing.adSweepCovers,
    hasMeasuredSpend: listingAdSpend.has(listing.listingId),
  });
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
 * - Advertising does not apply to the listing — no advertising account, or a
 *   listing on an account the sweep cannot cover and with no measured spend.
 *   It is Not applied, a satisfied input at zero.
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
  if (!advertisingAppliesToListing(ad, listing, listingAdSpend)) return 0;
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
      advertisingAppliesToListing(facts.ad, identity, facts.listingAdSpend),
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
  // What no product row carries: spend on listings that sold nothing, and the
  // shipping of orders with no revenue to weigh it by (or no listing option).
  const rowAdCost = totalOrUnavailable(perListingProfitRows(facts).map((row) => row.adCost));
  const rowShipping = facts.lines.reduce((sum, line) => sum + line.shippingCost, 0);
  return {
    revenue,
    orderCount: facts.orderWindow.orderCount,
    cost,
    adCost,
    netProfit,
    profitRate: profitRatePercent(netProfit, revenue),
    adCostRate: revenue === null || adCost === null || revenue <= 0
      ? null
      : Math.round((adCost / revenue) * 1000) / 10,
    unallocatedAdCost: adCost === null || rowAdCost === null ? null : Math.round(adCost - rowAdCost),
    unallocatedShipping: revenue === null ? null : facts.orderShipping - rowShipping,
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
 * Per cost component, the collected lines of the window it does not apply to
 * (Not applied) and the lines it applies to but nobody measured. A line sold
 * under no listing option has no recipe, so its purchase cost is unmeasured,
 * and names no listing, so only the organization's advertising answer decides
 * its advertising.
 */
function costInputsBasis(facts: ProfitWindowFacts): FinanceCostInputsBasis {
  const lines = facts.lines.length + facts.unmappedLines.length;
  const salesLines = [...facts.lines, ...facts.unmappedLines];
  const advertisingMeasured = facts.ad.publishedDates > 0 && facts.ad.coversWindow;
  let advertisingNotApplied = 0;
  let advertisingUnmeasured = 0;
  for (const line of facts.lines) {
    if (!advertisingAppliesToListing(facts.ad, line.listing, facts.listingAdSpend)) {
      advertisingNotApplied += 1;
    } else if (!advertisingMeasured) {
      advertisingUnmeasured += 1;
    }
  }
  for (let index = 0; index < facts.unmappedLines.length; index += 1) {
    if (!facts.ad.hasAdAccount) advertisingNotApplied += 1;
    else if (!advertisingMeasured) advertisingUnmeasured += 1;
  }
  return {
    purchaseCost: {
      lines,
      notAppliedLines: 0,
      unmeasuredLines: facts.lines.filter((line) => line.costOfGoods === null).length
        + facts.unmappedLines.length,
    },
    commission: {
      lines,
      notAppliedLines: salesLines.filter((line) => !line.commissionApplies).length,
      unmeasuredLines: facts.lines.filter((line) => line.commission === null).length
        + facts.unmappedLines.filter((line) => line.commissionApplies).length,
    },
    otherCost: {
      lines,
      notAppliedLines: salesLines.filter((line) => !line.otherCostApplies).length,
      unmeasuredLines: facts.lines.filter((line) => line.otherCost === null).length
        + facts.unmappedLines.filter((line) => line.otherCostApplies).length,
    },
    advertising: {
      lines,
      notAppliedLines: advertisingNotApplied,
      unmeasuredLines: advertisingUnmeasured,
    },
  };
}

/**
 * The evidence behind a finance window, as measured facts: the requested
 * window, over the evaluated window the dates orders and advertising covered,
 * and per cost component the lines it does not apply to and the lines nobody
 * measured. Profit is measured on the dates both covered; a window with a line
 * lacking a cost refuses every date for profit.
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
    costInputs: costInputsBasis(facts),
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
  /** Limit the population to these listings; every sold listing when omitted. */
  listingIds?: ReadonlySet<string>,
): Promise<PerListingMetricsCoverage> {
  const rows = (await buildPerListingProfit(tx, organizationId, from, to, accountAdEvidence))
    .filter((row) => listingIds === undefined || listingIds.has(row.listingId));
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
