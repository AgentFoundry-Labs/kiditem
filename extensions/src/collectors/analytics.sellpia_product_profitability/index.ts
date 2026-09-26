import { SELLPIA_PRODUCT_PROFITABILITY_KIND, SELLPIA_PROFIT_CHUNK_KIND } from '@kiditem/shared/sellpia-operations';
import { z } from 'zod';
import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 한 번 조회한 상품 한 줄(`sites/sellpia`의 `SellpiaProfitRowProduct`와 같은 모양). */
export interface SellpiaProfitRowProduct {
  productCode: string;
  optionCode: string;
  productName: string;
  optionName?: string;
  providerName?: string;
  salePrice: number;
  buyPrice: number;
  barcode?: string;
  months: Array<{ yearMonth: string; inAmount: number; orderAmount: number; orderQty: number }>;
  totalOrderAmount: number;
  totalOrderQty: number;
  totalInAmount: number;
  totalInQty: number;
}

export interface SellpiaProfitRows {
  products: SellpiaProfitRowProduct[];
  skippedAdjustmentCount: number;
}

/** 이 수집기가 셀피아에서 쓰는 것(`sites/sellpia`가 구현). */
export interface SellpiaProfitSite {
  productProfit(
    input: { start: string; end: string; periods: ReadonlyArray<{ yearMonth: string; from: string; to: string }> },
    onProgress?: (done: number, total: number) => Promise<void>,
  ): Promise<{ baseline: SellpiaProfitRows; periods: Array<{ yearMonth: string; rows: SellpiaProfitRows }> }>;
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PlanSchema = z.object({
  from: isoDay,
  to: isoDay,
  coveredMonths: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).min(1),
}).passthrough();
export type SellpiaProductProfitabilityPlan = z.infer<typeof PlanSchema>;

const CHUNK_PRODUCTS = 500;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const MISMATCH_MESSAGE = '셀피아 상품별 이익현황 구매기간 응답이 401일 판매 증거와 일치하지 않습니다.';

/** 상품 손익 제출 상품 하나(서버 `SellpiaProfitProductSchema`). */
export interface SellpiaProfitProduct {
  productCode: string;
  optionCode: string;
  productName: string;
  optionName?: string;
  providerName?: string;
  salePrice: number;
  buyPrice: number;
  barcode?: string;
  totalOrderAmount: number;
  totalOrderQty: number;
  totalInAmount: number;
  totalInQty: number;
  months: Array<{ yearMonth: string; orderQty: number; orderAmount: number; inQty: number; inAmount: number }>;
}

/** plan 창과 달마다 겹치는 구매기간(옛 `purchasePeriods`). */
export function purchasePeriods(plan: { from: string; to: string; coveredMonths: readonly string[] }) {
  return plan.coveredMonths.map((yearMonth) => {
    const [year, month] = yearMonth.split('-').map(Number) as [number, number];
    const monthStart = `${yearMonth}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return {
      yearMonth,
      from: monthStart > plan.from ? monthStart : plan.from,
      to: monthEnd < plan.to ? monthEnd : plan.to,
    };
  });
}

/**
 * 판매 창 응답과 달마다의 구매기간 응답을 대조해 제출 상품을 만든다(옛 수집기 규칙 그대로). 구매기간 응답마다 상품 수·
 * 판매 합계·달별 판매 값이 창과 같아야 하고, 달별 매입 합이 창의 매입 합계와 같아야 하며, 판매가 없는 달에 매입이 있으면
 * 안 된다. 하나라도 어긋나면 한 줄도 내지 않는다.
 */
export function assembleProfitProducts(
  baseline: SellpiaProfitRows,
  periods: ReadonlyArray<{ yearMonth: string; rows: SellpiaProfitRows }>,
): SellpiaProfitProduct[] {
  const identity = (product: SellpiaProfitRowProduct) => `${product.productCode}\u0000${product.optionCode}`;
  const periodCosts = new Map<string, Map<string, { inAmount: number; inQty: number }>>();
  for (const period of periods) {
    if (period.rows.products.length !== baseline.products.length) throw mismatch();
    const byIdentity = new Map(period.rows.products.map((product) => [identity(product), product]));
    for (const base of baseline.products) {
      const current = byIdentity.get(identity(base));
      if (!current
        || current.totalOrderAmount !== base.totalOrderAmount
        || current.totalOrderQty !== base.totalOrderQty
        || current.months.length !== base.months.length) {
        throw mismatch();
      }
      const currentMonths = new Map(current.months.map((month) => [month.yearMonth, month]));
      for (const month of base.months) {
        const currentMonth = currentMonths.get(month.yearMonth);
        if (!currentMonth || currentMonth.orderAmount !== month.orderAmount || currentMonth.orderQty !== month.orderQty) throw mismatch();
      }
      const productPeriods = periodCosts.get(identity(base)) ?? new Map<string, { inAmount: number; inQty: number }>();
      if (productPeriods.has(period.yearMonth)) throw mismatch();
      productPeriods.set(period.yearMonth, { inAmount: current.totalInAmount, inQty: current.totalInQty });
      periodCosts.set(identity(base), productPeriods);
    }
  }
  return baseline.products.map((base) => {
    const productPeriods = periodCosts.get(identity(base)) ?? new Map<string, { inAmount: number; inQty: number }>();
    const baseMonths = new Set(base.months.map((month) => month.yearMonth));
    let totalInAmount = 0;
    let totalInQty = 0;
    for (const period of periods) {
      const values = productPeriods.get(period.yearMonth);
      if (!values) throw mismatch();
      totalInAmount += values.inAmount;
      totalInQty += values.inQty;
      if (!baseMonths.has(period.yearMonth) && (values.inAmount !== 0 || values.inQty !== 0)) throw mismatch();
    }
    if (totalInAmount !== base.totalInAmount || totalInQty !== base.totalInQty) throw mismatch();
    const months = [...base.months]
      .sort((left, right) => left.yearMonth.localeCompare(right.yearMonth))
      .map((month) => {
        const period = productPeriods.get(month.yearMonth);
        if (!period) throw mismatch();
        return { yearMonth: month.yearMonth, orderQty: month.orderQty, orderAmount: month.orderAmount, inQty: period.inQty, inAmount: period.inAmount };
      });
    return {
      productCode: base.productCode,
      optionCode: base.optionCode,
      productName: base.productName,
      ...(base.optionName !== undefined ? { optionName: base.optionName } : {}),
      ...(base.providerName !== undefined ? { providerName: base.providerName } : {}),
      salePrice: base.salePrice,
      buyPrice: base.buyPrice,
      ...(base.barcode !== undefined ? { barcode: base.barcode } : {}),
      totalOrderAmount: base.totalOrderAmount,
      totalOrderQty: base.totalOrderQty,
      totalInAmount: base.totalInAmount,
      totalInQty: base.totalInQty,
      months,
    };
  });
}

function mismatch(): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, MISMATCH_MESSAGE, { status: null, reason: 'not_json', detail: 'purchase_period_mismatch' });
}

/**
 * `analytics.sellpia_product_profitability`(KID-361 J3): 서버 plan의 판매 창(어제까지 401일)을 한 번, 덮는 달마다 구매기간을
 * 한 번씩 읽어(달마다 진행을 올린다) 대조한 뒤, 상품 하나씩 `profit_months` 청크로 낸다. 발행·매핑은 서버 finalize가 한다.
 * 판매 창이 비면 청크 없이 끝나고 서버가 빈 세대로 받는다.
 */
export const sellpiaProductProfitabilityCollector: Collector<SellpiaProductProfitabilityPlan, Record<string, unknown>, SellpiaProfitSite> = {
  kind: SELLPIA_PRODUCT_PROFITABILITY_KIND,
  site: 'sellpia',
  async *collect(rawPlan, site, { signal, report }) {
    const parsed = PlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 상품 손익 수집 계획이 올바르지 않습니다.', { kind: SELLPIA_PRODUCT_PROFITABILITY_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 사이트를 쓸 수 없습니다.', { kind: SELLPIA_PRODUCT_PROFITABILITY_KIND });
    const periods = purchasePeriods(parsed.data);
    const read = await site.productProfit(
      { start: parsed.data.from, end: parsed.data.to, periods },
      async (done, total) => { await report?.({ months: total, monthsRead: done }); },
    );
    if (signal.aborted) return;
    const products = assembleProfitProducts(read.baseline, read.periods);
    const progress = { months: periods.length, monthsRead: periods.length, products: products.length, skippedAdjustments: read.baseline.skippedAdjustmentCount };
    const buffer = new ChunkBuffer<SellpiaProfitProduct>({ maxItems: CHUNK_PRODUCTS, label: '셀피아 상품 손익 한 상품' });
    for (const product of products) {
      const full = buffer.push(product);
      if (full) yield { chunkKind: SELLPIA_PROFIT_CHUNK_KIND, payload: full, progress };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: SELLPIA_PROFIT_CHUNK_KIND, payload: rest, progress };
  },
};

registerCollector(sellpiaProductProfitabilityCollector);
