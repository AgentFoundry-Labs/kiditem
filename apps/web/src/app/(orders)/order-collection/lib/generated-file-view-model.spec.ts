import { describe, expect, it } from 'vitest';
import {
  buildGeneratedFileMallOptions,
  filterAndSortGeneratedFiles,
  paginateGeneratedFiles,
} from './generated-file-view-model';
import type { StoredOrderCollectionFile } from './order-generated-file-store';

function generatedFile(
  id: string,
  overrides: Partial<StoredOrderCollectionFile> = {},
): StoredOrderCollectionFile {
  return {
    id,
    fileName: overrides.fileName ?? `${id}.xlsx`,
    sourceName: overrides.sourceName ?? `${id}-source.csv`,
    mimeType: overrides.mimeType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    blob: overrides.blob ?? new Blob([id]),
    previewRows: overrides.previewRows ?? [],
    sourceRows: overrides.sourceRows ?? 0,
    convertedAt: overrides.convertedAt ?? 100,
    productRows: overrides.productRows ?? 0,
    outputRows: overrides.outputRows ?? 0,
    skippedRows: overrides.skippedRows ?? 0,
    collectionDate: overrides.collectionDate,
    collectionMode: overrides.collectionMode,
    collectedRows: overrides.collectedRows,
    mallKey: overrides.mallKey,
    mallName: overrides.mallName,
    orderNumbers: overrides.orderNumbers,
    transmissionRequestedAt: overrides.transmissionRequestedAt,
  };
}

describe('generated file view model', () => {
  it('searches normalized file metadata, order numbers, and preview cells', () => {
    const items = [
      generatedFile('metadata', {
        sourceName: 'Á이스크림-RAW.csv',
        fileName: 'converted.xlsx',
      }),
      generatedFile('order', { orderNumbers: ['ORDER-2026-0714'] }),
      generatedFile('preview', { previewRows: [['수령인', '홍길동']] }),
      generatedFile('miss'),
    ];

    expect(filterAndSortGeneratedFiles(items, { search: 'á이스크림' }).map((item) => item.id)).toEqual([
      'metadata',
    ]);
    expect(filterAndSortGeneratedFiles(items, { search: 'order-2026' }).map((item) => item.id)).toEqual([
      'order',
    ]);
    expect(filterAndSortGeneratedFiles(items, { search: '홍길동' }).map((item) => item.id)).toEqual([
      'preview',
    ]);
  });

  it('filters by inferred mall and Sellpia transmission request status', () => {
    const items = [
      generatedFile('sent', {
        mallKey: 'icecream-mall',
        mallName: '아이스크림몰',
        transmissionRequestedAt: 200,
      }),
      generatedFile('unsent', {
        sourceName: '키드키즈_주문.xlsx',
        fileName: 'kidkids-output.xlsx',
      }),
      generatedFile('other'),
    ];

    expect(
      filterAndSortGeneratedFiles(items, { mallKey: 'kidkids', sendFilter: 'waiting' }).map(
        (item) => item.id,
      ),
    ).toEqual(['unsent']);
    expect(
      filterAndSortGeneratedFiles(items, { sendFilter: 'requested' }).map((item) => item.id),
    ).toEqual(['sent']);
  });

  it('sorts immutably and preserves input order for ties', () => {
    const items = [
      generatedFile('a', { convertedAt: 100, productRows: 3, outputRows: 8 }),
      generatedFile('b', { convertedAt: 300, productRows: 7, outputRows: 8 }),
      generatedFile('c', { convertedAt: 200, productRows: 3, outputRows: 8 }),
    ];

    expect(filterAndSortGeneratedFiles(items, { sortKey: 'newest' }).map((item) => item.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(filterAndSortGeneratedFiles(items, { sortKey: 'oldest' }).map((item) => item.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(
      filterAndSortGeneratedFiles(items, { sortKey: 'orders-desc' }).map((item) => item.id),
    ).toEqual(['a', 'c', 'b']);
    expect(
      filterAndSortGeneratedFiles(items, { sortKey: 'products-desc' }).map((item) => item.id),
    ).toEqual(['b', 'a', 'c']);
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('builds unique sorted mall options and omits unclassified files', () => {
    const items = [
      generatedFile('kidkids', { mallKey: 'kidkids' }),
      generatedFile('icecream', { mallKey: 'icecream-mall', mallName: '아이스크림몰' }),
      generatedFile('kidkids-legacy', { sourceName: '키드키즈 주문.xlsx' }),
      generatedFile('manual'),
    ];

    expect(buildGeneratedFileMallOptions(items)).toEqual([
      { key: 'icecream-mall', name: '아이스크림몰' },
      { key: 'kidkids', name: '키드키즈' },
    ]);
  });

  it('clamps pagination to valid bounds', () => {
    const items = Array.from({ length: 45 }, (_, index) => generatedFile(String(index)));

    expect(paginateGeneratedFiles(items, 9, 20)).toMatchObject({
      page: 3,
      pageCount: 3,
      total: 45,
      items: items.slice(40),
    });
    expect(paginateGeneratedFiles([], 0, 0)).toEqual({
      page: 1,
      pageCount: 1,
      pageSize: 1,
      total: 0,
      items: [],
    });
  });
});
