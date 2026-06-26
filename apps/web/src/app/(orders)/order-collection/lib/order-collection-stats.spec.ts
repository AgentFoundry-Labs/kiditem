import { describe, expect, it } from 'vitest';
import { buildOrderCollectionSummary } from './order-collection-stats';
import type { StoredOrderCollectionFile } from './order-generated-file-store';

function historyItem(overrides: Partial<StoredOrderCollectionFile>): StoredOrderCollectionFile {
  return {
    id: overrides.id ?? 'item',
    sourceName: overrides.sourceName ?? 'source.xlsx',
    fileName: overrides.fileName ?? 'source.xlsx',
    blob: overrides.blob ?? new Blob(['test'], { type: 'application/vnd.ms-excel' }),
    previewRows: overrides.previewRows ?? [],
    sourceRows: overrides.sourceRows ?? 0,
    outputRows: overrides.outputRows ?? 0,
    productRows: overrides.productRows ?? 0,
    skippedRows: overrides.skippedRows ?? 0,
    convertedAt: overrides.convertedAt ?? Date.UTC(2026, 5, 26, 2, 30),
    collectionDate: overrides.collectionDate,
    collectionMode: overrides.collectionMode,
    collectedRows: overrides.collectedRows,
    mallKey: overrides.mallKey,
    mallName: overrides.mallName,
  };
}

describe('buildOrderCollectionSummary', () => {
  it('aggregates totals, daily rows, and mall lookup in one summary', () => {
    const summary = buildOrderCollectionSummary([
      historyItem({
        id: 'browser-icecream',
        mallKey: 'icecream-mall',
        mallName: '아이스크림몰',
        outputRows: 15,
        productRows: 5,
        convertedAt: Date.UTC(2026, 5, 26, 8, 0),
        collectionDate: '2026-06-26',
        collectionMode: 'browser',
      }),
      historyItem({
        id: 'legacy-icecream',
        sourceName: '아이스크림몰_legacy.xlsx',
        fileName: '아이스크림몰_legacy.xlsx',
        outputRows: 9,
        productRows: 4,
        convertedAt: Date.UTC(2026, 5, 25, 8, 0),
        collectionDate: '2026-06-25',
        collectionMode: 'manual-upload',
      }),
    ]);

    expect(summary.latestAt).toBe(Date.UTC(2026, 5, 26, 8, 0));
    expect(summary.totals).toEqual({ orders: 15, products: 9 });
    expect(summary.dailyStats.map((stat) => stat.key)).toEqual(['2026-06-26', '2026-06-25']);
    expect(summary.dailyStats[0]).toMatchObject({
      orderRows: 10,
      productRows: 5,
      browserFiles: 1,
      manualFiles: 0,
      malls: ['아이스크림몰'],
    });
    expect(summary.mallStats).toHaveLength(1);
    expect(summary.mallStatsByKey.get('icecream-mall')).toMatchObject({
      name: '아이스크림몰',
      files: 2,
      orderRows: 15,
      productRows: 9,
    });
  });

  it('uses zero order count when output rows are smaller than product rows', () => {
    const summary = buildOrderCollectionSummary([
      historyItem({
        mallKey: 'kidkids',
        outputRows: 2,
        productRows: 5,
      }),
    ]);

    expect(summary.totals.orders).toBe(0);
    expect(summary.mallStatsByKey.get('kidkids')?.orderRows).toBe(0);
  });
});
