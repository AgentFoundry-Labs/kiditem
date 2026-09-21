import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LEAD_TIME_MONTHS,
  computeSeasonTag,
  computeTrend,
  detectAnomaly,
} from './sellpia-product-sales.metrics';
import { SellpiaProductInventoryReader } from './sellpia-product-inventory-reader';
import { buildProductDepletionProjections } from './sellpia-product-depletion-projection';
import { readCurrentSellpiaProductMonthlyFacts } from './read/sellpia-product-monthly-facts';
import type { SellpiaProductDepletionReadPort } from './sellpia-product-depletion-read.port';
import type {
  SellpiaProductSalesSummary,
  SellpiaProductSalesRow,
  SellpiaProductSalesMonthPoint,
} from '@kiditem/shared/dashboard';
import { businessDateKey, kstBusinessDate, kstMonthEnd } from '../../common/kst';

const DEFAULT_MONTHS = 13; // 1년치(완결 12개월 + 진행 월) — 시즌 분류/추세 근거

/**
 * Sellpia 상품별 이익현황(stat_prd_profit) 월별 소진 read.
 *
 * Source writes belong to SellpiaProfitabilitySourceService. This service reads
 * only the newest COMPLETE generation for depletion reporting.
 * 재고 분석(/stock-ops)은 상품별 1개월/2개월 평균 소진량 + 월별 추이를 읽는다.
 * 평균은 현재 월(진행 중)을 제외한 완결 월에서 산정한다. 메이크샵 주문 기준.
 */
@Injectable()
export class SellpiaProductSalesService implements SellpiaProductDepletionReadPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryReader: SellpiaProductInventoryReader,
  ) {}

  async getSummary(
    organizationId: string,
    monthsWindow = DEFAULT_MONTHS,
  ): Promise<SellpiaProductSalesSummary> {
    const currentYm = currentKstYearMonth();
    const cutoffYm = addMonths(currentYm, -(monthsWindow - 1));

    const { facts: rows } = await this.prisma.$transaction((tx) =>
      readCurrentSellpiaProductMonthlyFacts(tx, {
        organizationId,
        scope: { fromYearMonth: cutoffYm },
      }));

    const months = [...new Set(rows.map((r) => r.yearMonth))].sort();
    const fullMonthCoverage = new Map<string, boolean>();
    for (const row of rows) {
      const isFullMonth = isFullCalendarMonth(
        row.yearMonth,
        row.coverageStartDate,
        row.coverageEndDate,
      );
      fullMonthCoverage.set(
        row.yearMonth,
        (fullMonthCoverage.get(row.yearMonth) ?? true) && isFullMonth,
      );
    }
    // Keep raw boundary months visible, but do not use a partial source month
    // as a complete month for averages, trends, or stock projections.
    const completeMonths = months.filter((m) =>
      m < currentYm && fullMonthCoverage.get(m) === true);
    const last1 = new Set(completeMonths.slice(-1));
    const last2 = new Set(completeMonths.slice(-2));

    interface Agg {
      productCode: string;
      optionCode: string;
      productName: string;
      optionName: string | null;
      providerName: string | null;
      salePrice: number;
      buyPrice: number;
      barcode: string | null;
      latestCapturedAt: Date;
      monthMap: Map<string, number>;
      totalQty: number;
      qty1m: number;
      qty2m: number;
    }
    const byProduct = new Map<string, Agg>();
    let grandTotalQty = 0;
    let lastCapturedAt: Date | null = null;

    for (const r of rows) {
      const key = `${r.productCode} ${r.optionCode}`;
      let agg = byProduct.get(key);
      if (!agg) {
        agg = {
          productCode: r.productCode,
          optionCode: r.optionCode,
          productName: r.productName,
          optionName: r.optionName,
          providerName: r.providerName,
          salePrice: r.salePrice,
          buyPrice: r.buyPrice,
          barcode: r.barcode,
          latestCapturedAt: r.capturedAt,
          monthMap: new Map(),
          totalQty: 0,
          qty1m: 0,
          qty2m: 0,
        };
        byProduct.set(key, agg);
      }
      // 최신 스냅샷 메타 우선
      if (r.capturedAt >= agg.latestCapturedAt) {
        agg.latestCapturedAt = r.capturedAt;
        agg.productName = r.productName;
        agg.optionName = r.optionName;
        agg.providerName = r.providerName;
        agg.salePrice = r.salePrice;
        agg.buyPrice = r.buyPrice;
        agg.barcode = r.barcode;
      }
      agg.monthMap.set(r.yearMonth, (agg.monthMap.get(r.yearMonth) ?? 0) + r.orderQty);
      agg.totalQty += r.orderQty;
      if (last1.has(r.yearMonth)) agg.qty1m += r.orderQty;
      if (last2.has(r.yearMonth)) agg.qty2m += r.orderQty;
      grandTotalQty += r.orderQty;
      if (!lastCapturedAt || r.capturedAt > lastCapturedAt) lastCapturedAt = r.capturedAt;
    }

    const complete2Count = Math.min(2, completeMonths.length);
    const completeMonthCount = completeMonths.length;
    const last1Ym = completeMonths.slice(-1)[0];

    // 1) 기본 행. 이상치(일회성 벌크/저가 대량)를 감지해 평균/발주는 clean(이상치 제외)로,
    //    월별 컬럼은 raw + 이상치 표시로 낸다.
    const bases = [...byProduct.values()].map((a) => {
      const rawMonthly = months.map((m) => ({ yearMonth: m, orderQty: a.monthMap.get(m) ?? 0 }));
      const { anomalyMonths, anomalyReason } = detectAnomaly(rawMonthly, a.salePrice);
      const anomalySet = new Set(anomalyMonths);
      const cleanOf = (m: string) => (anomalySet.has(m) ? 0 : (a.monthMap.get(m) ?? 0));

      const monthly: SellpiaProductSalesMonthPoint[] = rawMonthly.map((p) => ({
        yearMonth: p.yearMonth,
        orderQty: p.orderQty,
        anomaly: anomalySet.has(p.yearMonth) ? true : undefined,
      }));
      const completeMonthly: SellpiaProductSalesMonthPoint[] = completeMonths.map((m) => ({
        yearMonth: m,
        orderQty: cleanOf(m), // 시즌 판단도 clean 기준
      }));
      const completeQtys = completeMonthly.map((p) => p.orderQty);
      const cleanTotal = months.reduce((s, m) => s + cleanOf(m), 0);
      const cleanQty1m = last1Ym ? cleanOf(last1Ym) : 0;
      const cleanQty2m = completeMonths.slice(-2).reduce((s, m) => s + cleanOf(m), 0);
      return {
        key: `${a.productCode} ${a.optionCode}`,
        a,
        monthly,
        completeMonthly,
        completeQtys,
        cleanTotal,
        qty1m: cleanQty1m,
        qty2m: cleanQty2m,
        avg2m: complete2Count > 0 ? Math.round(cleanQty2m / complete2Count) : 0,
        anomaly: anomalyMonths.length > 0,
        anomalyReason,
      };
    });

    const inventoryInputs = bases.map((base) => ({
      key: base.key,
      evidence: {
        productCode: base.a.productCode,
        optionCode: base.a.optionCode,
        barcode: base.a.barcode,
      },
      completeMonthly: base.completeMonthly,
    }));
    const { availability, projection: inventoryProjection } =
      await this.inventoryReader.project(organizationId, inventoryInputs);

    // 3) 파생 지표.
    let anomalyCount = 0;
    const products: SellpiaProductSalesRow[] = bases.map((b) => {
      const { a } = b;
      const inventory = inventoryProjection.byProductKey.get(b.key)!;
      const trend = computeTrend(b.completeQtys);
      const seasonTag = computeSeasonTag(b.completeMonthly, completeMonthCount);
      if (b.anomaly) anomalyCount++;
      return {
        productCode: a.productCode,
        optionCode: a.optionCode,
        productName: a.productName,
        optionName: a.optionName,
        providerName: a.providerName,
        salePrice: a.salePrice,
        buyPrice: a.buyPrice,
        barcode: a.barcode,
        monthly: b.monthly,
        qty1m: b.qty1m,
        qty2m: b.qty2m,
        avg2m: b.avg2m,
        totalQty: b.cleanTotal,
        trend,
        deadStock: inventory.deadStock,
        deadStockReason: inventory.deadStockReason,
        seasonTag,
        anomaly: b.anomaly,
        anomalyReason: b.anomalyReason,
        inventoryResolution: inventory.inventoryResolution,
        monthlyOutflow: inventory.monthlyOutflow,
        outflowMonthCount: inventory.outflowMonthCount,
        monthsOfAvailableStockLeft: inventory.monthsOfAvailableStockLeft,
        reorderPoint: inventory.reorderPoint,
        needsReorder: inventory.needsReorder,
      } satisfies SellpiaProductSalesRow;
    });
    products.sort((x, y) => y.avg2m - x.avg2m || y.totalQty - x.totalQty);
    return {
      range: { from: months[0] ?? cutoffYm, to: months[months.length - 1] ?? currentYm },
      months,
      completeMonths,
      products,
      productCount: products.length,
      totalQty: grandTotalQty,
      lastCapturedAt: lastCapturedAt ? lastCapturedAt.toISOString() : null,
      hasData: rows.length > 0,
      hasStock: availability.snapshot.collected,
      stockCapturedAt: availability.snapshot.verifiedAt,
      stockGeneration: availability.snapshot.generation,
      inventoryResolutionCounts: {
        matchedSalesRows: inventoryProjection.summary.matchedSalesRows,
        mappingRequiredSalesRows:
          inventoryProjection.summary.mappingRequiredSalesRows,
        matchedSkus: inventoryProjection.summary.matchedSkus,
        unlinkedSkus: inventoryProjection.summary.unlinkedSkus,
      },
      reorderCount: inventoryProjection.summary.reorderCount,
      deadStockCount: inventoryProjection.summary.deadStockCount,
      anomalyCount,
      abcCounts: inventoryProjection.summary.abcCounts,
      abcStatusCounts: inventoryProjection.summary.abcStatusCounts,
      abcContributionProfitByGrade: inventoryProjection.summary.abcContributionProfitByGrade,
      classifiedProductCount: inventoryProjection.summary.classifiedProductCount,
      unclassifiedProductCount: inventoryProjection.summary.unclassifiedProductCount,
      leadTimeMonths: LEAD_TIME_MONTHS,
    } satisfies SellpiaProductSalesSummary;
  }

  async findByMasterProductIds(input: {
    organizationId: string;
    masterProductIds: string[];
    monthsWindow?: number;
  }) {
    const masterProductIds = [...new Set(input.masterProductIds)];
    if (masterProductIds.length === 0) return new Map();
    const summary = await this.getSummary(
      input.organizationId,
      input.monthsWindow,
    );
    return buildProductDepletionProjections(masterProductIds, summary.products);
  }

}

function currentKstYearMonth(): string {
  const kst = kstBusinessDate(new Date());
  const p = (x: number) => String(x).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}`;
}

// "YYYY-MM" 에 delta 개월을 더한 "YYYY-MM" (delta 음수 가능).
function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12 + 12) % 12;
  const p = (x: number) => String(x).padStart(2, '0');
  return `${ny}-${p(nm + 1)}`;
}

function isFullCalendarMonth(
  yearMonth: string,
  coverageStartDate: Date | null,
  coverageEndDate: Date | null,
): boolean {
  if (!coverageStartDate || !coverageEndDate) return false;
  const monthStart = `${yearMonth}-01`;
  const monthEnd = kstMonthEnd(yearMonth);
  return businessDateKey(coverageStartDate) === monthStart
    && businessDateKey(coverageEndDate) === monthEnd;
}
