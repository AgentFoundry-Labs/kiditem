import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  SellpiaProductSalesSummary,
  SellpiaProductSalesRow,
  SellpiaProductSalesMonthPoint,
  SellpiaProductSalesIngestResult,
} from '@kiditem/shared/dashboard';
import type {
  SellpiaProductSalesIngestBodyDto,
} from './dto/sellpia-product-sales.dto';
import {
  LEAD_TIME_MONTHS,
  assignAbcGrades,
  computeDeadStock,
  computeReorder,
  computeSeasonTag,
  computeTrend,
  detectAnomaly,
} from './sellpia-product-sales.metrics';

const INT4_MAX = 2_147_483_647;
// createMany 벌크 청크. 14열 × 2000행 = 28k 바인드 < PG 65535 파라미터 한도.
const INSERT_CHUNK = 2000;
const DEFAULT_MONTHS = 13; // 1년치(완결 12개월 + 진행 월) — 시즌 분류/추세 근거

/**
 * Sellpia 상품별 이익현황(stat_prd_profit) 월별 소진(판매수량) ingest + read.
 *
 * 확장이 stat_action.ajax.html(mode=stat_prd_profit)의 graph(월별 매입/판매/수량)에서
 * 상품×옵션×연월로 스크랩한 결과를 `sellpia_product_monthly_sales` 에 upsert(멱등)한다.
 * 재고 분석(/stock-ops)은 상품별 1개월/2개월 평균 소진량 + 월별 추이를 읽는다.
 * 평균은 현재 월(진행 중)을 제외한 완결 월에서 산정한다. 메이크샵 주문 기준.
 */
@Injectable()
export class SellpiaProductSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    organizationId: string,
    body: SellpiaProductSalesIngestBodyDto,
  ): Promise<SellpiaProductSalesIngestResult> {
    const capturedAt = new Date();
    const months = new Set<string>();
    // (productCode, optionCode, yearMonth) 유니크 키로 중복 제거(마지막 값 우선) —
    // createMany 유니크 위반 방지 + 페이로드 내 중복 방어.
    const byKey = new Map<string, {
      organizationId: string; productCode: string; optionCode: string; yearMonth: string;
      orderQty: number; orderAmount: number; inQty: number; inAmount: number;
      productName: string; optionName: string | null; providerName: string | null;
      salePrice: number; buyPrice: number; barcode: string | null; capturedAt: Date;
    }>();
    for (const p of body.products) {
      for (const m of p.months) {
        if (!/^\d{4}-\d{2}$/.test(m.yearMonth)) continue;
        months.add(m.yearMonth);
        byKey.set(`${p.productCode} ${p.optionCode} ${m.yearMonth}`, {
          organizationId,
          productCode: p.productCode,
          optionCode: p.optionCode,
          yearMonth: m.yearMonth,
          orderQty: clampInt(m.orderQty),
          orderAmount: clampInt(m.orderAmount),
          inQty: clampInt(m.inQty),
          inAmount: clampInt(m.inAmount),
          productName: p.productName,
          optionName: p.optionName ?? null,
          providerName: p.providerName ?? null,
          salePrice: clampInt(p.salePrice),
          buyPrice: clampInt(p.buyPrice),
          barcode: p.barcode ?? null,
          capturedAt,
        });
      }
    }
    const rows = [...byKey.values()];
    const payloadMonths = [...months];

    // 원자적 월-범위 교체. 청크 upsert(느려서 동시 read 를 굶김) 대신
    // deleteMany(페이로드에 담긴 연월만) + 벌크 createMany 를 한 트랜잭션으로.
    // - 조회는 커밋 전까지 이전 데이터를 보므로 빈 창이 없다.
    // - 삭제를 크롤 창(연월)으로 한정하므로 더 짧은 창의 수집이 그 밖의 과거 월을
    //   지우지 않는다(1년 히스토리 보존). 같은 창의 재수집은 그 월들만 새로 채운다.
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.sellpiaProductMonthlySales.deleteMany({
        where: { organizationId, yearMonth: { in: payloadMonths } },
      }),
    ];
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      ops.push(this.prisma.sellpiaProductMonthlySales.createMany({ data: rows.slice(i, i + INSERT_CHUNK) }));
    }
    await this.prisma.$transaction(ops);

    return {
      upserted: rows.length,
      productCount: body.products.length,
      months: [...months].sort(),
    } satisfies SellpiaProductSalesIngestResult;
  }

  async getSummary(
    organizationId: string,
    monthsWindow = DEFAULT_MONTHS,
  ): Promise<SellpiaProductSalesSummary> {
    const currentYm = currentKstYearMonth();
    const cutoffYm = addMonths(currentYm, -(monthsWindow - 1));

    const rows = await this.prisma.sellpiaProductMonthlySales.findMany({
      where: { organizationId, yearMonth: { gte: cutoffYm } },
      select: {
        productCode: true,
        optionCode: true,
        yearMonth: true,
        orderQty: true,
        productName: true,
        optionName: true,
        providerName: true,
        salePrice: true,
        buyPrice: true,
        barcode: true,
        capturedAt: true,
      },
    });

    // PR 330의 활성 Sellpia 상품코드 스냅샷을 재고 단일 원본으로 사용한다.
    const stockRows = await this.prisma.sellpiaInventorySku.findMany({
      where: { organizationId, isActive: true },
      select: {
        code: true,
        barcode: true,
        currentStock: true,
        lastImportRun: { select: { lastVerifiedAt: true } },
      },
    });
    const stockByCode = new Map<string, number>();
    const stockByBarcode = new Map<string, number | null>();
    let stockCapturedAt: Date | null = null;
    for (const s of stockRows) {
      const code = s.code.trim();
      if (code) stockByCode.set(code, s.currentStock);

      const barcode = s.barcode?.trim();
      if (barcode) {
        stockByBarcode.set(
          barcode,
          stockByBarcode.has(barcode) ? null : s.currentStock,
        );
      }

      const verifiedAt = s.lastImportRun?.lastVerifiedAt ?? null;
      if (verifiedAt && (!stockCapturedAt || verifiedAt > stockCapturedAt)) {
        stockCapturedAt = verifiedAt;
      }
    }
    const hasStock = stockRows.length > 0;

    const months = [...new Set(rows.map((r) => r.yearMonth))].sort();
    const completeMonths = months.filter((m) => m < currentYm);
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

    // 1) 기본 행. 이상치(일회성 벌크/저가 대량)를 감지해 평균/ABC/발주는 clean(이상치 제외)로,
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

    // 2) ABC 등급(이상치 제외 소진량 파레토) — 정렬 전 원래 순서 기준
    const abcGrades = assignAbcGrades(bases.map((b) => b.cleanTotal));

    // 3) 파생 지표.
    let reorderCount = 0;
    let deadStockCount = 0;
    let anomalyCount = 0;
    const abcCounts = { a: 0, b: 0, c: 0 };
    const products: SellpiaProductSalesRow[] = bases.map((b, i) => {
      const { a } = b;
      const abcGrade = abcGrades[i];
      const trend = computeTrend(b.completeQtys);
      // 재고 미수집이면 null(계산 보류), 수집됐으면 매칭 없으면 0(품절).
      const currentStock: number | null = hasStock
        ? (resolveCurrentStock(a, stockByCode, stockByBarcode) ?? 0)
        : null;
      const { deadStock, deadStockReason } = computeDeadStock(b.completeQtys, currentStock);
      const seasonTag = computeSeasonTag(b.completeMonthly, completeMonthCount);
      const { monthsOfStockLeft, reorderPoint, needsReorder } = computeReorder(
        currentStock,
        b.avg2m,
      );
      if (deadStock) deadStockCount++;
      if (needsReorder) reorderCount++;
      if (b.anomaly) anomalyCount++;
      if (abcGrade === 'A') abcCounts.a++;
      else if (abcGrade === 'B') abcCounts.b++;
      else abcCounts.c++;
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
        abcGrade,
        trend,
        deadStock,
        deadStockReason,
        seasonTag,
        anomaly: b.anomaly,
        anomalyReason: b.anomalyReason,
        currentStock,
        monthsOfStockLeft,
        reorderPoint,
        needsReorder,
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
      hasStock,
      stockCapturedAt: stockCapturedAt ? stockCapturedAt.toISOString() : null,
      reorderCount,
      deadStockCount,
      anomalyCount,
      abcCounts,
      leadTimeMonths: LEAD_TIME_MONTHS,
    } satisfies SellpiaProductSalesSummary;
  }
}

function resolveCurrentStock(
  product: { productCode: string; optionCode: string; barcode: string | null },
  stockByCode: ReadonlyMap<string, number>,
  stockByBarcode: ReadonlyMap<string, number | null>,
): number | undefined {
  const productCode = product.productCode.trim();
  if (productCode && stockByCode.has(productCode)) {
    return stockByCode.get(productCode);
  }

  const optionCode = product.optionCode.trim();
  if (optionCode && stockByCode.has(optionCode)) {
    return stockByCode.get(optionCode);
  }

  const barcode = product.barcode?.trim();
  if (!barcode) return undefined;
  const byBarcode = stockByBarcode.get(barcode);
  return byBarcode === null ? undefined : byBarcode;
}

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.round(n);
  if (v <= 0) return 0;
  return v > INT4_MAX ? INT4_MAX : v;
}

function currentKstYearMonth(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
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
