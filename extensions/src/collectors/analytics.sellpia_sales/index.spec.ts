import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { sellpiaSalesCollector, type SellpiaSalesRow, type SellpiaSalesSite } from './index';

const PLAN = { sourceOrigin: 'https://kiditem.sellpia.com', sourcePath: '/sale_summary.html?mode=main_link', range: { from: '2026-07-01', to: '2026-07-18' } };
const row = (index: number): SellpiaSalesRow => ({ sellerId: String(100 + (index % 7)), sellerName: `몰 ${index % 7}`, date: `2026-07-${String((index % 18) + 1).padStart(2, '0')}`, price: index * 100, amount: index, buyPrice: index * 60 });

function fakeSellpia(rows: SellpiaSalesRow[]) {
  const asked: Array<{ startDate: string; endDate: string }> = [];
  const site: SellpiaSalesSite = {
    async sales(input) {
      asked.push(input);
      return { rows, sellers: 7 };
    },
  };
  return { site, asked };
}

async function collectAll(plan: Record<string, unknown>, site: SellpiaSalesSite) {
  const chunks: CollectedChunk[] = [];
  const summary = { value: null as unknown };
  for await (const chunk of sellpiaSalesCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
  summary.value = sellpiaSalesCollector.summarize?.({ chunks: chunks.length, items: 0 }) ?? null;
  return { chunks, summary: summary.value };
}

describe('collectors/analytics.sellpia_sales', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓴다', () => {
    expect(collectorFor('analytics.sellpia_sales')).toBe(sellpiaSalesCollector);
    expect(sellpiaSalesCollector.site).toBe('sellpia');
  });

  it('plan 범위를 한 번 읽어 판매처·일 줄을 sales_rows 청크로 내고 progress에 줄·판매처 수를 싣는다', async () => {
    const rows = Array.from({ length: 1_203 }, (_, index) => row(index));
    const sellpia = fakeSellpia(rows);
    const { chunks } = await collectAll(PLAN, sellpia.site);
    expect(sellpia.asked).toEqual([{ startDate: '2026-07-01', endDate: '2026-07-18' }]);
    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length])).toEqual([
      ['sales_rows', 500],
      ['sales_rows', 500],
      ['sales_rows', 203],
    ]);
    expect(chunks.flatMap((chunk) => chunk.payload)).toEqual(rows);
    expect(chunks.at(-1)?.progress).toEqual({ rows: 1_203, sellers: 7 });
  });

  it('빈 판매현황이면 청크 없이 끝나고 서버가 창을 매출 0으로 덮는다', async () => {
    await expect(collectAll(PLAN, fakeSellpia([]).site)).resolves.toMatchObject({ chunks: [] });
  });

  it('plan이 틀리면 읽지 않고 RUNTIME_PLAN_INVALID', async () => {
    const sellpia = fakeSellpia([row(1)]);
    const error = await collectAll({ range: { from: '2026-07-01' } }, sellpia.site).then(() => null, (caught: unknown) => caught);
    expect(isRuntimeError(error) && error.code).toBe('RUNTIME_PLAN_INVALID');
    expect(sellpia.asked).toEqual([]);
  });
});
