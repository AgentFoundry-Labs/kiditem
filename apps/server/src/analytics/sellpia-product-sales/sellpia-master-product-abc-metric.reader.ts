import { Injectable } from '@nestjs/common';
import type {
  MasterProductAbcEligibilityReason,
  MasterProductAbcMetric,
  MasterProductAbcPeriodDays,
} from '@kiditem/shared/product-abc';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  MasterProductAbcMetricEvidence,
  MasterProductAbcMetricReadPort,
  MasterProductAbcMetricSnapshot,
} from '../application/port/in/master-product-abc-metric-read.port';
import { createSellpiaProductInventoryResolver } from './sellpia-product-inventory-resolver';
import { detectAnomaly } from './sellpia-product-sales.metrics';

const MAX_OBSERVATION_MONTHS = 12;

type SalesFact = Readonly<{
  productCode: string;
  optionCode: string;
  yearMonth: string;
  orderQty: number;
  orderAmount: number;
  inAmount: number;
  costBasis: string;
  vatIncluded: boolean | null;
  barcode: string | null;
  salePrice: number;
  capturedAt: Date;
}>;

type SkuMetricEvidence = Readonly<{
  periodMetricValue: number | null;
  grossRevenue: number;
  grossCost: number;
  grossProfit: number;
  monthsWithFacts: ReadonlySet<string>;
  earliestPositiveSalesMonth: string | null;
  missingCost: boolean;
}>;

@Injectable()
export class SellpiaMasterProductAbcMetricReader
  implements MasterProductAbcMetricReadPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readMetricSnapshot(input: {
    organizationId: string;
    metric: MasterProductAbcMetric;
    periodDays: MasterProductAbcPeriodDays;
  }): Promise<MasterProductAbcMetricSnapshot> {
    const periodMonths = completedYearMonths(input.periodDays / 30);
    const observationMonths = completedYearMonths(Math.max(
      input.periodDays / 30,
      MAX_OBSERVATION_MONTHS,
    ));
    const [masters, variants, candidates, queriedFacts, allQueriedFacts] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where: { organizationId: input.organizationId },
        select: { id: true, isActive: true, createdAt: true },
      }),
      this.prisma.productVariant.findMany({
        where: { organizationId: input.organizationId, isActive: true },
        select: {
          id: true,
          masterProductId: true,
          components: {
            where: { organizationId: input.organizationId },
            select: { sellpiaInventorySkuId: true },
          },
        },
      }),
      this.prisma.sellpiaInventorySku.findMany({
        where: { organizationId: input.organizationId },
        select: { id: true, code: true, barcode: true, isActive: true },
      }),
      this.prisma.sellpiaProductMonthlySales.findMany({
        where: {
          organizationId: input.organizationId,
          yearMonth: { in: observationMonths },
        },
        select: {
          productCode: true,
          optionCode: true,
          yearMonth: true,
          orderQty: true,
          orderAmount: true,
          inAmount: true,
          costBasis: true,
          vatIncluded: true,
          barcode: true,
          salePrice: true,
          capturedAt: true,
        },
      }),
      this.prisma.sellpiaProductMonthlySales.findMany({
        where: { organizationId: input.organizationId },
        select: {
          productCode: true,
          optionCode: true,
          yearMonth: true,
          orderQty: true,
          orderAmount: true,
          inAmount: true,
          costBasis: true,
          vatIncluded: true,
          barcode: true,
          salePrice: true,
          capturedAt: true,
        },
      }),
    ]);
    const observationMonthSet = new Set(observationMonths);
    const facts = (queriedFacts as SalesFact[]).filter((row) =>
      observationMonthSet.has(row.yearMonth));
    const earliestPositiveSales = earliestPositiveSalesBySku({
      facts: allQueriedFacts as SalesFact[],
      candidates,
    });
    const sourceCapturedAt = latestCapturedAt(facts);
    const skuMetrics = aggregateSkuMetrics({
      facts,
      periodMonths,
      metric: input.metric,
      candidates,
    });
    const evidence = buildMasterProductEvidence({
      masters,
      variants,
      candidates,
      skuMetrics,
      observationMonths,
      periodMonths,
      metric: input.metric,
      earliestPositiveSales,
    });
    return { sourceCapturedAt, evidence };
  }
}

function aggregateSkuMetrics(input: {
  facts: readonly SalesFact[];
  periodMonths: readonly string[];
  metric: MasterProductAbcMetric;
  candidates: ReadonlyArray<{
    id: string;
    code: string;
    barcode: string | null;
    isActive: boolean;
  }>;
}): Map<string, SkuMetricEvidence> {
  const resolve = createSellpiaProductInventoryResolver(input.candidates);
  const identities = new Map<string, SalesFact[]>();
  for (const fact of input.facts) {
    const key = `${fact.productCode}\u0000${fact.optionCode}`;
    const rows = identities.get(key) ?? [];
    rows.push(fact);
    identities.set(key, rows);
  }
  const bySku = new Map<string, SkuMetricEvidence>();
  for (const rows of identities.values()) {
    rows.sort((left, right) =>
      left.yearMonth.localeCompare(right.yearMonth)
      || left.capturedAt.getTime() - right.capturedAt.getTime());
    const latest = rows.reduce((selected, row) =>
      row.capturedAt >= selected.capturedAt ? row : selected);
    const resolution = resolve({
      productCode: latest.productCode,
      optionCode: latest.optionCode,
      barcode: latest.barcode,
    });
    if (resolution.status !== 'matched') continue;

    const rowsByMonth = new Map<string, SalesFact>();
    for (const row of rows) {
      const prior = rowsByMonth.get(row.yearMonth);
      if (!prior || row.capturedAt >= prior.capturedAt) rowsByMonth.set(row.yearMonth, row);
    }
    const monthlyQuantity = input.periodMonths.map((yearMonth) => ({
      yearMonth,
      orderQty: rowsByMonth.get(yearMonth)?.orderQty ?? 0,
    }));
    const anomalyMonths = new Set(
      detectAnomaly(monthlyQuantity, latest.salePrice).anomalyMonths,
    );
    const period = input.periodMonths.reduce((sum, month) => {
      const row = rowsByMonth.get(month);
      if (!row || anomalyMonths.has(month)) return sum;
      return {
        orderQty: sum.orderQty + row.orderQty,
        orderAmount: sum.orderAmount + row.orderAmount,
        inAmount: sum.inAmount + row.inAmount,
      };
    }, { orderQty: 0, orderAmount: 0, inAmount: 0 });
    const missingCost = input.metric === 'GROSS_PROFIT'
      && input.periodMonths.some((month) => {
        const row = rowsByMonth.get(month);
        return Boolean(
          row
          && !anomalyMonths.has(month)
          && row.orderAmount > 0
          && (
            row.inAmount <= 0
            || row.costBasis !== 'ORDER_TIME_SUPPLY_COST'
            || row.vatIncluded !== true
          ),
        );
      });
    const periodMetricValue = missingCost
      ? null
      : input.metric === 'SALES_QUANTITY'
        ? period.orderQty
        : input.metric === 'SALES_AMOUNT'
          ? period.orderAmount
          : period.orderAmount - period.inAmount;
    const incoming: SkuMetricEvidence = {
      periodMetricValue,
      grossRevenue: period.orderAmount,
      grossCost: period.inAmount,
      grossProfit: period.orderAmount - period.inAmount,
      monthsWithFacts: new Set(rowsByMonth.keys()),
      earliestPositiveSalesMonth: rows.find((row) =>
        row.orderQty > 0 || row.orderAmount > 0)?.yearMonth ?? null,
      missingCost,
    };
    const prior = bySku.get(resolution.sellpiaInventorySkuId);
    bySku.set(resolution.sellpiaInventorySkuId, mergeSkuMetricEvidence(prior, incoming));
  }
  return bySku;
}

function mergeSkuMetricEvidence(
  prior: SkuMetricEvidence | undefined,
  incoming: SkuMetricEvidence,
): SkuMetricEvidence {
  if (!prior) return incoming;
  return {
    periodMetricValue: prior.periodMetricValue === null || incoming.periodMetricValue === null
      ? null
      : prior.periodMetricValue + incoming.periodMetricValue,
    grossRevenue: prior.grossRevenue + incoming.grossRevenue,
    grossCost: prior.grossCost + incoming.grossCost,
    grossProfit: prior.grossProfit + incoming.grossProfit,
    monthsWithFacts: new Set([...prior.monthsWithFacts, ...incoming.monthsWithFacts]),
    earliestPositiveSalesMonth: earliestMonth(
      prior.earliestPositiveSalesMonth,
      incoming.earliestPositiveSalesMonth,
    ),
    missingCost: prior.missingCost || incoming.missingCost,
  };
}

function buildMasterProductEvidence(input: {
  masters: ReadonlyArray<{ id: string; isActive: boolean; createdAt: Date }>;
  variants: ReadonlyArray<{
    id: string;
    masterProductId: string;
    components: ReadonlyArray<{ sellpiaInventorySkuId: string }>;
  }>;
  candidates: ReadonlyArray<{ id: string; isActive: boolean }>;
  skuMetrics: ReadonlyMap<string, SkuMetricEvidence>;
  observationMonths: readonly string[];
  periodMonths: readonly string[];
  metric: MasterProductAbcMetric;
  earliestPositiveSales: ReadonlyMap<string, string>;
}): MasterProductAbcMetricEvidence[] {
  const activeMasterIds = new Set(
    input.masters.filter((master) => master.isActive).map((master) => master.id),
  );
  const variantsByMaster = new Map<string, typeof input.variants>();
  const ownersBySku = new Map<string, Set<string>>();
  for (const variant of input.variants) {
    const variants = variantsByMaster.get(variant.masterProductId) ?? [];
    variantsByMaster.set(variant.masterProductId, [...variants, variant]);
    if (!activeMasterIds.has(variant.masterProductId)) continue;
    for (const component of variant.components) {
      const owners = ownersBySku.get(component.sellpiaInventorySkuId) ?? new Set();
      owners.add(variant.masterProductId);
      ownersBySku.set(component.sellpiaInventorySkuId, owners);
    }
  }
  const candidateById = new Map(input.candidates.map((candidate) => [
    candidate.id,
    candidate,
  ]));

  return [...input.masters]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((master) => {
      const variants = variantsByMaster.get(master.id) ?? [];
      const skuIds = new Set(variants.flatMap((variant) =>
        variant.components.map((component) => component.sellpiaInventorySkuId)));
      const completeRecipe = variants.length > 0
        && variants.every((variant) => variant.components.length > 0)
        && skuIds.size > 0;
      const observationStartMonth = earliestMonth(
        ...[...skuIds].map((skuId) => input.earliestPositiveSales.get(skuId) ?? null),
      ) ?? kstYearMonth(master.createdAt);
      const observationWindow = completedMonthsFrom(
        observationStartMonth,
        input.observationMonths,
      );
      const observedCompleteMonths = observationWindow.filter((month) =>
        [...skuIds].every((skuId) => input.skuMetrics.get(skuId)?.monthsWithFacts.has(month)),
      ).length;
      const noObservation = [...skuIds].every((skuId) =>
        input.skuMetrics.get(skuId) === undefined);
      const incompleteMonths = observationWindow.length > 0
        && observedCompleteMonths !== observationWindow.length;
      const inactiveSku = [...skuIds].some((skuId) =>
        candidateById.get(skuId)?.isActive !== true);
      const sharedSku = [...skuIds].some((skuId) => ownersBySku.get(skuId)?.size !== 1);
      const missingCost = input.metric === 'GROSS_PROFIT'
        && [...skuIds].some((skuId) => input.skuMetrics.get(skuId)?.missingCost === true);
      const eligibilityReason: MasterProductAbcEligibilityReason = !master.isActive
        ? 'INACTIVE_PRODUCT'
        : !completeRecipe
          ? 'MISSING_RECIPE'
          : sharedSku
            ? 'SHARED_SKU'
            : inactiveSku
              ? 'INACTIVE_SKU'
              : noObservation
                ? 'NO_OBSERVATION'
                : incompleteMonths
                  ? 'INCOMPLETE_MONTHS'
                  : missingCost
                    ? 'MISSING_COST'
                    : 'ELIGIBLE';
      const grossRevenue = sumSkuMetric(skuIds, input.skuMetrics, 'grossRevenue');
      const grossCost = sumSkuMetric(skuIds, input.skuMetrics, 'grossCost');
      const grossProfit = sumSkuMetric(skuIds, input.skuMetrics, 'grossProfit');
      const periodMetricValue = eligibilityReason === 'ELIGIBLE'
        ? sumSkuMetric(skuIds, input.skuMetrics, 'periodMetricValue')
        : null;
      return {
        masterProductId: master.id,
        periodMetricValue,
        rankingValue: periodMetricValue,
        grossRevenue: noObservation ? null : grossRevenue,
        grossCost: noObservation ? null : grossCost,
        grossProfit: noObservation ? null : grossProfit,
        observedCompleteMonths,
        observationStartMonth,
        eligible: eligibilityReason === 'ELIGIBLE',
        eligibilityReason,
        riskFlags: [],
      } satisfies MasterProductAbcMetricEvidence;
    });
}

function earliestPositiveSalesBySku(input: {
  facts: readonly SalesFact[];
  candidates: ReadonlyArray<{
    id: string;
    code: string;
    barcode: string | null;
    isActive: boolean;
  }>;
}): Map<string, string> {
  const resolve = createSellpiaProductInventoryResolver(input.candidates);
  const earliestBySku = new Map<string, string>();
  for (const row of input.facts) {
    if (row.orderQty <= 0 && row.orderAmount <= 0) continue;
    const resolution = resolve({
      productCode: row.productCode,
      optionCode: row.optionCode,
      barcode: row.barcode,
    });
    if (resolution.status !== 'matched') continue;
    const current = earliestBySku.get(resolution.sellpiaInventorySkuId);
    if (!current || row.yearMonth < current) {
      earliestBySku.set(resolution.sellpiaInventorySkuId, row.yearMonth);
    }
  }
  return earliestBySku;
}

function sumSkuMetric(
  skuIds: ReadonlySet<string>,
  metrics: ReadonlyMap<string, SkuMetricEvidence>,
  field: 'periodMetricValue' | 'grossRevenue' | 'grossCost' | 'grossProfit',
): number | null {
  let total = 0;
  for (const skuId of skuIds) {
    const value = metrics.get(skuId)?.[field];
    if (value === undefined || value === null) return null;
    total += value;
  }
  return total;
}

function completedMonthsFrom(startMonth: string, observationMonths: readonly string[]): string[] {
  return observationMonths.filter((month) => month >= startMonth);
}

function completedYearMonths(monthCount: number): string[] {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentIndex = nowKst.getUTCFullYear() * 12 + nowKst.getUTCMonth();
  return Array.from({ length: monthCount }, (_, index) => {
    const monthIndex = currentIndex - monthCount + index;
    const year = Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12 + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  });
}

function kstYearMonth(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
}

function earliestMonth(...months: Array<string | null>): string | null {
  return months.filter((month): month is string => month !== null)
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
}

function latestCapturedAt(facts: readonly SalesFact[]): Date | null {
  return facts.reduce<Date | null>((latest, fact) =>
    !latest || fact.capturedAt > latest ? fact.capturedAt : latest, null);
}
