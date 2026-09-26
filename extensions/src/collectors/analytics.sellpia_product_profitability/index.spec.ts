import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import {
  sellpiaProductProfitabilityCollector,
  type SellpiaProfitRowProduct,
  type SellpiaProfitRows,
  type SellpiaProfitSite,
} from './index';

// 옛 수집기 테스트(sellpia-product-profit)의 기록: 판매 창 2025-05-26~2026-06-30, 4월·6월 판매, 구매기간마다 매입 합계.
const PLAN = {
  parserVersion: 'sellpia-profitability-v2',
  from: '2025-05-26',
  to: '2026-06-30',
  coveredMonths: ['2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
  mappingGeneration: '0',
};

function rowProduct(inAmount: number, inQty: number, overrides: Partial<SellpiaProfitRowProduct> = {}): SellpiaProfitRowProduct {
  return {
    productCode: 'SKU-1',
    optionCode: 'OPTION-1',
    productName: '상품',
    salePrice: 0,
    buyPrice: 0,
    months: [
      { yearMonth: '2026-04', inAmount: 400, orderAmount: 1000, orderQty: 2 },
      { yearMonth: '2026-06', inAmount: 600, orderAmount: 1500, orderQty: 3 },
    ],
    totalOrderAmount: 2500,
    totalOrderQty: 5,
    totalInAmount: inAmount,
    totalInQty: inQty,
    ...overrides,
  };
}
const rows = (products: SellpiaProfitRowProduct[]): SellpiaProfitRows => ({ products, skippedAdjustmentCount: 0 });

function fakeSellpia(periodRows: (yearMonth: string) => SellpiaProfitRows, baseline = rows([rowProduct(1000, 5)])) {
  const asked: Array<{ start: string; end: string; periods: ReadonlyArray<{ yearMonth: string; from: string; to: string }> }> = [];
  const site: SellpiaProfitSite = {
    async productProfit(input, onProgress) {
      asked.push(input);
      const periods = [];
      for (const period of input.periods) {
        periods.push({ yearMonth: period.yearMonth, rows: periodRows(period.yearMonth) });
        await onProgress?.(periods.length, input.periods.length);
      }
      return { baseline, periods };
    },
  };
  return { site, asked };
}

const purchase = (yearMonth: string) => rows([rowProduct(yearMonth === '2026-04' ? 400 : yearMonth === '2026-06' ? 600 : 0, yearMonth === '2026-04' ? 2 : yearMonth === '2026-06' ? 3 : 0)]);

async function collectAll(plan: Record<string, unknown>, site: SellpiaProfitSite) {
  const chunks: CollectedChunk[] = [];
  const reports: Array<Record<string, unknown>> = [];
  const context = { signal: new AbortController().signal, tabId: null, report: async (progress: Record<string, unknown>) => { reports.push(progress); } };
  for await (const chunk of sellpiaProductProfitabilityCollector.collect(plan as never, site, context)) chunks.push(chunk);
  return { chunks, reports };
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('collectors/analytics.sellpia_product_profitability', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓴다', () => {
    expect(collectorFor('analytics.sellpia_product_profitability')).toBe(sellpiaProductProfitabilityCollector);
    expect(sellpiaProductProfitabilityCollector.site).toBe('sellpia');
  });

  it('plan 창과 달마다의 구매기간(창과 겹치는 부분)을 읽고, 달마다 진행을 올리고, 상품 하나씩 profit_months로 낸다', async () => {
    const sellpia = fakeSellpia(purchase);
    const { chunks, reports } = await collectAll(PLAN, sellpia.site);
    expect(sellpia.asked[0]).toMatchObject({ start: '2025-05-26', end: '2026-06-30' });
    expect(sellpia.asked[0]!.periods[0]).toEqual({ yearMonth: '2025-05', from: '2025-05-26', to: '2025-05-31' });
    expect(sellpia.asked[0]!.periods.at(-1)).toEqual({ yearMonth: '2026-06', from: '2026-06-01', to: '2026-06-30' });
    expect(sellpia.asked[0]!.periods).toHaveLength(14);
    expect(reports.at(-1)).toEqual({ months: 14, monthsRead: 14 });
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['profit_months']);
    expect(chunks[0]!.payload).toEqual([{
      productCode: 'SKU-1',
      optionCode: 'OPTION-1',
      productName: '상품',
      salePrice: 0,
      buyPrice: 0,
      totalOrderAmount: 2500,
      totalOrderQty: 5,
      totalInAmount: 1000,
      totalInQty: 5,
      months: [
        { yearMonth: '2026-04', orderQty: 2, orderAmount: 1000, inQty: 2, inAmount: 400 },
        { yearMonth: '2026-06', orderQty: 3, orderAmount: 1500, inQty: 3, inAmount: 600 },
      ],
    }]);
    expect(chunks[0]!.progress).toMatchObject({ products: 1, skippedAdjustments: 0 });
  });

  it('중단 신호를 사이트에 넘겨 달 사이에서 멈추고, 청크를 내지 않는다', async () => {
    const controller = new AbortController();
    let monthsRead = 0;
    const site: SellpiaProfitSite = {
      async productProfit(input, onProgress) {
        for (const period of input.periods) {
          input.signal?.throwIfAborted();
          monthsRead += 1;
          await onProgress?.(monthsRead, input.periods.length);
          void period;
        }
        return { baseline: rows([]), periods: [] };
      },
    };
    const context = { signal: controller.signal, tabId: null, report: async () => { controller.abort(); } };
    const chunks: CollectedChunk[] = [];
    const collecting = (async () => {
      for await (const chunk of sellpiaProductProfitabilityCollector.collect(PLAN as never, site, context)) chunks.push(chunk);
    })();
    await expect(collecting).rejects.toMatchObject({ name: 'AbortError' });
    expect(monthsRead).toBe(1);
    expect(chunks).toEqual([]);
  });

  it('구매기간 응답에 상품이 빠지면 0원 매입을 지어내지 않고 실패한다', async () => {
    const error = await failure(collectAll(PLAN, fakeSellpia((yearMonth) => (yearMonth === '2026-06' ? rows([]) : purchase(yearMonth))).site));
    expect(error).toMatchObject({ code: 'SITE_REQUEST_FAILED', details: { detail: 'purchase_period_mismatch' } });
    expect(error.message).toContain('구매기간 응답');
  });

  it('판매 값이 창과 다른 구매기간 응답(섞인 판매 스냅샷)은 매입 합계가 맞아도 실패한다', async () => {
    const mixed = (yearMonth: string) => (yearMonth === '2026-04'
      ? rows([rowProduct(400, 2, { totalOrderAmount: 2600, months: [{ yearMonth: '2026-04', inAmount: 400, orderAmount: 1100, orderQty: 2 }, { yearMonth: '2026-06', inAmount: 600, orderAmount: 1500, orderQty: 3 }] })])
      : purchase(yearMonth));
    expect(await failure(collectAll(PLAN, fakeSellpia(mixed).site))).toMatchObject({ details: { detail: 'purchase_period_mismatch' } });
  });

  it('달별 매입 합이 창 합계와 다르거나 판매 없는 달에 매입이 있으면 실패한다', async () => {
    const short = (yearMonth: string) => (yearMonth === '2026-06' ? rows([rowProduct(599, 3)]) : purchase(yearMonth));
    expect(await failure(collectAll(PLAN, fakeSellpia(short).site))).toMatchObject({ details: { detail: 'purchase_period_mismatch' } });
    const stray = (yearMonth: string) => (yearMonth === '2026-05' ? rows([rowProduct(1, 0)]) : purchase(yearMonth));
    expect(await failure(collectAll(PLAN, fakeSellpia(stray, rows([rowProduct(1001, 5)])).site))).toMatchObject({ details: { detail: 'purchase_period_mismatch' } });
  });

  it('빈 판매 창이면 청크 없이 끝나고(서버가 빈 세대로 받는다), plan이 틀리면 읽지 않는다', async () => {
    const empty = fakeSellpia(() => rows([]), rows([]));
    await expect(collectAll(PLAN, empty.site)).resolves.toMatchObject({ chunks: [] });
    const untouched = fakeSellpia(purchase);
    const error = await failure(collectAll({ from: '2025-05-26' }, untouched.site));
    expect(error.code).toBe('RUNTIME_PLAN_INVALID');
    expect(untouched.asked).toEqual([]);
  });
});
