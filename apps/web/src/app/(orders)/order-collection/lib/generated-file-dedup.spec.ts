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

  it('keeps both files when the same number of different orders is collected twice — the mall-given order identity wins over renumbered file numbers (KID-234)', () => {
    // 키드키즈 변환기는 파일마다 주문일+순번(…0001)을 새로 매긴다. A·B·C 출고 뒤 B·C·D를 걷으면 파일 번호는 같지만 다른 주문이다.
    const fileNumbers = ['202607140001', '202607140002', '202607140003'];
    const existing = generatedFile('existing', { mallKey: 'kidkids', orderNumbers: fileNumbers, capturedOrderNumbers: ['A', 'B', 'C'] });
    const incoming = generatedFile('incoming', { mallKey: 'kidkids', orderNumbers: fileNumbers, capturedOrderNumbers: ['B', 'C', 'D'] });

    expect(isDuplicateGeneratedFile([existing], incoming)).toBe(false);
    expect(isDuplicateGeneratedFile([existing], generatedFile('again', { mallKey: 'kidkids', orderNumbers: fileNumbers, capturedOrderNumbers: ['C', 'B', 'A'] }))).toBe(true);
  });

  it('does not collapse the same order numbers across different malls', () => {
    const existing = generatedFile('existing', { mallKey: 'icecream-mall' });
    const incoming = generatedFile('incoming', { mallKey: 'kidkids' });

    expect(isDuplicateGeneratedFile([existing], incoming)).toBe(false);
  });
});
