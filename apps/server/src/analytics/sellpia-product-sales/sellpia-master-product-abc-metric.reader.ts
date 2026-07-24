import { Injectable } from '@nestjs/common';
import type {
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

type SalesFact = Readonly<{
  productCode: string;
  optionCode: string;
  yearMonth: string;
  orderQty: number;
  orderAmount: number;
  barcode: string | null;
  salePrice: number;
  capturedAt: Date;
}>;

type SkuMetricEvidence = Readonly<{
  metricValue: number;
  complete: boolean;
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
    const expectedMonths = completedYearMonths(input.periodDays / 30);
    const [masters, variants, candidates, queriedFacts] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where: { organizationId: input.organizationId },
        select: { id: true, isActive: true },
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
          yearMonth: { in: expectedMonths },
        },
        select: {
          productCode: true,
          optionCode: true,
          yearMonth: true,
          orderQty: true,
          orderAmount: true,
          barcode: true,
          salePrice: true,
          capturedAt: true,
        },
      }),
    ]);
    const expectedMonthSet = new Set(expectedMonths);
    const facts = (queriedFacts as SalesFact[]).filter((row) =>
      expectedMonthSet.has(row.yearMonth));
    const sourceCapturedAt = latestCapturedAt(facts);
    const skuMetrics = aggregateSkuMetrics({
      facts,
      expectedMonths,
      metric: input.metric,
      candidates,
    });
    const evidence = buildMasterProductEvidence({
      masters,
      variants,
      candidates,
      skuMetrics,
    });
    return { sourceCapturedAt, evidence };
  }
}

function aggregateSkuMetrics(input: {
  facts: readonly SalesFact[];
  expectedMonths: readonly string[];
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

    const rowsByMonth = new Map(rows.map((row) => [row.yearMonth, row]));
    const complete = input.expectedMonths.every((month) => rowsByMonth.has(month));
    const monthlyQuantity = input.expectedMonths.map((yearMonth) => ({
      yearMonth,
      orderQty: rowsByMonth.get(yearMonth)?.orderQty ?? 0,
    }));
    const anomalyMonths = new Set(
      detectAnomaly(monthlyQuantity, latest.salePrice).anomalyMonths,
    );
    const metricValue = input.expectedMonths.reduce((sum, month) => {
      const row = rowsByMonth.get(month);
      if (!row || anomalyMonths.has(month)) return sum;
      return sum + (input.metric === 'SALES_AMOUNT' ? row.orderAmount : row.orderQty);
    }, 0);
    const prior = bySku.get(resolution.sellpiaInventorySkuId);
    bySku.set(resolution.sellpiaInventorySkuId, {
      metricValue: (prior?.metricValue ?? 0) + metricValue,
      complete: (prior?.complete ?? true) && complete,
    });
  }
  return bySku;
}

function buildMasterProductEvidence(input: {
  masters: ReadonlyArray<{ id: string; isActive: boolean }>;
  variants: ReadonlyArray<{
    id: string;
    masterProductId: string;
    components: ReadonlyArray<{ sellpiaInventorySkuId: string }>;
  }>;
  candidates: ReadonlyArray<{ id: string; isActive: boolean }>;
  skuMetrics: ReadonlyMap<string, SkuMetricEvidence>;
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
      const eligible = master.isActive
        && completeRecipe
        && [...skuIds].every((skuId) => {
          const candidate = candidateById.get(skuId);
          const metric = input.skuMetrics.get(skuId);
          return candidate?.isActive === true
            && ownersBySku.get(skuId)?.size === 1
            && metric?.complete === true;
        });
      return {
        masterProductId: master.id,
        metricValue: eligible
          ? [...skuIds].reduce(
            (sum, skuId) => sum + input.skuMetrics.get(skuId)!.metricValue,
            0,
          )
          : null,
        eligible,
      } satisfies MasterProductAbcMetricEvidence;
    });
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

function latestCapturedAt(facts: readonly SalesFact[]): Date | null {
  return facts.reduce<Date | null>((latest, fact) =>
    !latest || fact.capturedAt > latest ? fact.capturedAt : latest, null);
}
