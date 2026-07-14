import { describe, expect, it } from 'vitest';
import { isDuplicateGeneratedFile } from './generated-file-dedup';
import type { ConversionHistoryItem } from './order-collection-page-model';

function generatedFile(
  id: string,
  overrides: Partial<ConversionHistoryItem> = {},
): ConversionHistoryItem {
  return {
    id,
    fileName: `${id}.xlsx`,
    sourceName: `${id}.csv`,
    blob: new Blob([id]),
    previewRows: [],
    sourceRows: 2,
    productRows: 1,
    outputRows: 2,
    skippedRows: 0,
    convertedAt: Date.UTC(2026, 6, 14),
    collectionDate: '2026-07-14',
    mallKey: 'icecream-mall',
    orderNumbers: ['ORDER-1'],
    ...overrides,
  };
}

describe('isDuplicateGeneratedFile', () => {
  it('matches the same mall, day, and normalized order-number set', () => {
    const existing = generatedFile('existing', { orderNumbers: ['ORDER-2', 'ORDER-1'] });
    const incoming = generatedFile('incoming', { orderNumbers: ['ORDER-1', 'ORDER-2', 'ORDER-1'] });

    expect(isDuplicateGeneratedFile([existing], incoming)).toBe(true);
  });

  it('does not collapse the same order numbers across different malls', () => {
    const existing = generatedFile('existing', { mallKey: 'icecream-mall' });
    const incoming = generatedFile('incoming', { mallKey: 'kidkids' });

    expect(isDuplicateGeneratedFile([existing], incoming)).toBe(false);
  });
});
