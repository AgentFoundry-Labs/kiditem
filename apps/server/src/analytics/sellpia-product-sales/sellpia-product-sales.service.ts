import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LEAD_TIME_MONTHS,
  computeSeasonTag,
  computeTrend,
  detectAnomaly,
} from './sellpia-product-sales.metrics';
import { SellpiaProductInventoryReader } from './sellpia-product-inventory-reader';
import { buildProductDepletionProjections } from './sellpia-product-depletion-projection';
import {
  SELLPIA_PRODUCT_SALES_EVENTS,
  type SellpiaProductSalesIngestedEvent,
} from './sellpia-product-sales.events';
import type { SellpiaProductDepletionReadPort } from './sellpia-product-depletion-read.port';
import type {
  SellpiaProductSalesIngestBodyDto,
} from './dto/sellpia-product-sales.dto';
import type {
  SellpiaProductSalesSummary,
  SellpiaProductSalesRow,
  SellpiaProductSalesMonthPoint,
  SellpiaProductSalesIngestResult,
} from '@kiditem/shared/dashboard';

const INT4_MAX = 2_147_483_647;
// 한 JSONB 파라미터를 set-based INSERT로 펼친다. 5천 행은 현재 office payload를
// 5개 안팎의 statement로 줄이면서 최대 48만 행 요청의 메모리 사용도 제한한다.
const JSONB_INSERT_CHUNK = 5_000;
// 실제 13개월 payload는 Prisma interactive transaction 기본 5초를 넘을 수 있다.
const INGEST_TRANSACTION_TIMEOUT_MS = 30_000;
const DEFAULT_MONTHS = 13; // 1년치(완결 12개월 + 진행 월) — 시즌 분류/추세 근거

interface ProductSalesBulkRow {
  productCode: string;
  optionCode: string;
  yearMonth: string;
  orderQty: number;
  orderAmount: number;
  inQty: number;
  inAmount: number;
  coverageStartDate: string;
  coverageEndDate: string;
  productName: string;
  optionName: string | null;
  providerName: string | null;
  salePrice: number;
  buyPrice: number;
  barcode: string | null;
}

/**
 * Sellpia 상품별 이익현황(stat_prd_profit) 월별 소진(판매수량) ingest + read.
 *
 * 확장이 stat_action.ajax.html(mode=stat_prd_profit)의 graph(월별 매입/판매/수량)에서
 * 상품×옵션×연월로 스크랩한 결과를 `sellpia_product_monthly_sales` 에 upsert(멱등)한다.
 * 재고 분석(/stock-ops)은 상품별 1개월/2개월 평균 소진량 + 월별 추이를 읽는다.
 * 평균은 현재 월(진행 중)을 제외한 완결 월에서 산정한다. 메이크샵 주문 기준.
 */
@Injectable()
export class SellpiaProductSalesService implements SellpiaProductDepletionReadPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryReader: SellpiaProductInventoryReader,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async ingest(
    organizationId: string,
    body: SellpiaProductSalesIngestBodyDto,
  ): Promise<SellpiaProductSalesIngestResult> {
    const capturedAt = new Date();
    const authoritativeMonths = yearMonthsInRange(body.range);
    const authoritativeMonthSet = new Set(authoritativeMonths);
    // (productCode, optionCode, yearMonth) 유니크 키로 중복 제거(마지막 값 우선) —
    // 벌크 INSERT 유니크 위반 방지 + 페이로드 내 중복 방어.
    const byKey = new Map<string, ProductSalesBulkRow>();
    for (const p of body.products) {
      for (const m of p.months) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.yearMonth)) {
          throw new BadRequestException('Invalid Sellpia product-sales month');
        }
        if (!authoritativeMonthSet.has(m.yearMonth)) {
          throw new BadRequestException('Sellpia product-sales month is outside request range');
        }
        const coverage = monthCoverageIntersection(body.range, m.yearMonth);
        byKey.set(`${p.productCode} ${p.optionCode} ${m.yearMonth}`, {
          productCode: p.productCode,
          optionCode: p.optionCode,
          yearMonth: m.yearMonth,
          orderQty: clampInt(m.orderQty),
          orderAmount: clampInt(m.orderAmount),
          inQty: clampInt(m.inQty),
          inAmount: clampInt(m.inAmount),
          coverageStartDate: coverage.start.toISOString().slice(0, 10),
          coverageEndDate: coverage.end.toISOString().slice(0, 10),
          productName: p.productName,
          optionName: p.optionName ?? null,
          providerName: p.providerName ?? null,
          salePrice: clampInt(p.salePrice),
          buyPrice: clampInt(p.buyPrice),
          barcode: p.barcode ?? null,
        });
      }
    }
    const rows = [...byKey.values()];
    // 원자적 요청 범위 교체. 행별 upsert(느려서 동시 read 를 굶김) 대신
    // deleteMany(요청 range 의 연월) + JSONB set-based INSERT 를 한 트랜잭션으로.
    // - 조회는 커밋 전까지 이전 데이터를 보므로 빈 창이 없다.
    // - 삭제를 크롤 창(연월)으로 한정하므로 더 짧은 창의 수집이 그 밖의 과거 월을
    //   지우지 않는다(1년 히스토리 보존). 같은 창의 재수집은 그 월들만 새로 채운다.
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`
            -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`kiditem.sellpia-product-sales:${organizationId}`}, 0)
            )::text AS "lock"
          `,
        );
        await tx.sellpiaProductMonthlySales.deleteMany({
          where: {
            organizationId,
            yearMonth: { in: authoritativeMonths },
          },
        });
        for (let i = 0; i < rows.length; i += JSONB_INSERT_CHUNK) {
          const batch = rows.slice(i, i + JSONB_INSERT_CHUNK);
          const payload = JSON.stringify(batch);
          // 한 행의 모든 필드를 Prisma bind parameter로 확장하지 않고, 배치당 JSONB
          // 파라미터 하나를 PostgreSQL이 set으로 펼쳐 protocol/parse overhead를 줄인다.
          const inserted = await tx.$executeRaw(Prisma.sql`
            INSERT INTO sellpia_product_monthly_sales (
              id,
              organization_id,
              product_code,
              option_code,
              year_month,
              order_qty,
              order_amount,
              in_qty,
              in_amount,
              cost_basis,
              vat_included,
              coverage_start_date,
              coverage_end_date,
              product_name,
              option_name,
              provider_name,
              sale_price,
              buy_price,
              barcode,
              captured_at
            )
            SELECT
              gen_random_uuid(),
              ${organizationId}::uuid,
              record->>'productCode',
              record->>'optionCode',
              record->>'yearMonth',
              (record->>'orderQty')::integer,
              (record->>'orderAmount')::integer,
              (record->>'inQty')::integer,
              (record->>'inAmount')::integer,
              ${body.provenance.costBasis},
              ${body.provenance.vatIncluded},
              (record->>'coverageStartDate')::date,
              (record->>'coverageEndDate')::date,
              record->>'productName',
              record->>'optionName',
              record->>'providerName',
              (record->>'salePrice')::integer,
              (record->>'buyPrice')::integer,
              record->>'barcode',
              ${capturedAt}::timestamptz
            FROM jsonb_array_elements(${payload}::jsonb) AS record
          `);
          if (inserted !== batch.length) {
            throw new Error(
              `Sellpia product-sales bulk insert expected ${batch.length} rows, inserted ${inserted}`,
            );
          }
        }
      },
      { timeout: INGEST_TRANSACTION_TIMEOUT_MS },
    );

    await this.eventEmitter.emitAsync(
      SELLPIA_PRODUCT_SALES_EVENTS.INGESTED,
      { organizationId } satisfies SellpiaProductSalesIngestedEvent,
    );

    return {
      upserted: rows.length,
      productCount: body.products.length,
      months: authoritativeMonths,
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

function yearMonthsInRange(range: { from: string; to: string }): string[] {
  const fromDate = parseCalendarDate(range.from);
  const toDate = parseCalendarDate(range.to);
  if (
    fromDate === null
    || toDate === null
    || fromDate.timestamp > toDate.timestamp
    || toDate.yearMonthIndex - fromDate.yearMonthIndex + 1 > 24
  ) {
    throw new BadRequestException('Invalid Sellpia product-sales range');
  }
  const months: string[] = [];
  for (
    let index = fromDate.yearMonthIndex;
    index <= toDate.yearMonthIndex;
    index += 1
  ) {
    const year = Math.floor(index / 12);
    const month = index % 12 + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

function parseCalendarDate(value: string): {
  timestamp: number;
  yearMonthIndex: number;
} | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (date.toISOString().slice(0, 10) !== value) return null;
  return {
    timestamp,
    yearMonthIndex: date.getUTCFullYear() * 12 + date.getUTCMonth(),
  };
}

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.round(n);
  if (v <= 0) return 0;
  return v > INT4_MAX ? INT4_MAX : v;
}

function monthCoverageIntersection(
  range: { from: string; to: string },
  yearMonth: string,
): { start: Date; end: Date } {
  const start = parseCalendarDate(range.from);
  const end = parseCalendarDate(range.to);
  if (!start || !end) {
    throw new BadRequestException('Invalid Sellpia product-sales range');
  }
  const [year, month] = yearMonth.split('-').map(Number);
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEnd = Date.UTC(year, month, 0);
  const coverageStart = Math.max(start.timestamp, monthStart);
  const coverageEnd = Math.min(end.timestamp, monthEnd);
  if (coverageStart > coverageEnd) {
    throw new BadRequestException('Sellpia product-sales month does not intersect request range');
  }
  return { start: new Date(coverageStart), end: new Date(coverageEnd) };
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
