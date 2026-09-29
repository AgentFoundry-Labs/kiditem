import { describe, expect, it } from 'vitest';
import { buildDailyStats } from './OrderCollectionDailyPanel';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

function file(id: string, collectionDate: string, orderNumbers: string[]): StoredOrderCollectionFile {
  return {
    id,
    sourceName: `${id}.xlsx`,
    fileName: `${id}.xlsx`,
    blob: new Blob(['test']),
    previewRows: [],
    sourceRows: orderNumbers.length,
    outputRows: orderNumbers.length,
    productRows: 0,
    skippedRows: 0,
    convertedAt: Date.UTC(2026, 6, 14, 1, 0),
    collectionDate,
    mallKey: 'onch',
    orderNumbers,
  };
}

describe('OrderCollectionDailyPanel buildDailyStats (KID-234)', () => {
  it("today's bar is the Orders server total; past days stay on this browser's file history", () => {
    const stats = buildDailyStats(
      [file('today', '2026-07-14', ['A', 'B']), file('yesterday', '2026-07-13', ['C', 'D', 'E'])],
      { key: '2026-07-14', orderRows: 9 },
    );
    expect(stats.map(({ key, orderRows }) => ({ key, orderRows }))).toEqual([
      { key: '2026-07-14', orderRows: 9 },
      { key: '2026-07-13', orderRows: 3 },
    ]);
  });

  it("adds a today bar from the server even when this browser converted nothing today, and shows 0 — not this browser's files — until the server answers", () => {
    const history = [file('yesterday', '2026-07-13', ['C'])];
    expect(buildDailyStats(history, { key: '2026-07-14', orderRows: 4 }).map((stat) => [stat.key, stat.orderRows])).toEqual([
      ['2026-07-14', 4],
      ['2026-07-13', 1],
    ]);
    expect(buildDailyStats([file('today', '2026-07-14', ['A']), ...history], { key: '2026-07-14', orderRows: null })
      .map((stat) => [stat.key, stat.orderRows])).toEqual([
      ['2026-07-14', 0],
      ['2026-07-13', 1],
    ]);
  });
});
