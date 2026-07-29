import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { extractSellpiaOrderNumbers } from './sellpia-order-targets';

function workbookBlob(rows: unknown[][]): Blob {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    '주문목록',
  );
  const bytes = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;
  return new Blob([bytes]);
}

describe('extractSellpiaOrderNumbers', () => {
  it('extracts the exact unique order numbers from a Sellpia workbook', async () => {
    const blob = workbookBlob([
      ['주문 수집 파일'],
      ['No', '주문번호', '상품명'],
      [1, 'ORDER-1', '상품 A'],
      [2, 'ORDER-1', '택배비'],
      [3, 'ORDER-2', '상품 B'],
    ]);

    await expect(extractSellpiaOrderNumbers(blob)).resolves.toEqual([
      'ORDER-1',
      'ORDER-2',
    ]);
  });

  it('supports provider order-code and spaced seller-order headers', async () => {
    const providerBlob = workbookBlob([
      ['주문 코드', '상품명'],
      ['ONCH-1', '상품 A'],
    ]);
    const sellerBlob = workbookBlob([
      ['발주번호', '판매처 주문번호'],
      ['PO-1', '20260729_01'],
    ]);

    await expect(extractSellpiaOrderNumbers(providerBlob)).resolves.toEqual([
      'ONCH-1',
    ]);
    await expect(extractSellpiaOrderNumbers(sellerBlob)).resolves.toEqual([
      '20260729_01',
    ]);
  });

  it('returns no targets when the workbook has no supported order identity', async () => {
    const blob = workbookBlob([
      ['수취인', '상품명'],
      ['홍길동', '상품 A'],
    ]);

    await expect(extractSellpiaOrderNumbers(blob)).resolves.toEqual([]);
  });
});
