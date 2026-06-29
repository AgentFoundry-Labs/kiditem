import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSellpiaWorkbook } from './sellpia-workbook.parser';

function workbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('parseSellpiaWorkbook', () => {
  it('uses 상품코드 as identity, 재고 as stock, and ignores Sellpia status columns', () => {
    const parsed = parseSellpiaWorkbook(workbookBuffer([
      {
        상품코드: 'SP-001',
        상품명: '테스트 상품',
        재고: '12',
        안전재고: '3',
        바코드: '8801234567890',
        모델명: 'MODEL-1',
        상품분류: 'ignored',
        품절: 'Y',
        품절일: '2026-01-01',
        단종: 'Y',
        단종일: '2026-02-01',
      },
    ]));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 2,
      sellpiaProductCode: 'SP-001',
      sellpiaProductName: '테스트 상품',
      sellpiaStock: 12,
      safetyStock: 3,
      barcode: '8801234567890',
      modelName: 'MODEL-1',
    });
    expect(parsed.ignoredColumns).toEqual(['상품분류', '품절', '품절일', '단종', '단종일']);
  });

  it('flags duplicate 상품코드 rows and invalid stock values', () => {
    const parsed = parseSellpiaWorkbook(workbookBuffer([
      { 상품코드: 'SP-001', 상품명: 'A', 재고: '1' },
      { 상품코드: 'SP-001', 상품명: 'B', 재고: '-1' },
      { 상품코드: 'SP-002', 상품명: 'C', 재고: 'abc' },
    ]));

    expect(parsed.rows[0]?.warnings).toContain('duplicate_code');
    expect(parsed.rows[1]?.warnings).toEqual(expect.arrayContaining(['duplicate_code', 'invalid_stock']));
    expect(parsed.rows[2]?.warnings).toContain('invalid_stock');
  });

  it('rejects empty workbooks and workbooks over the Sellpia row limit', () => {
    expect(() => parseSellpiaWorkbook(workbookBuffer([]))).toThrow('비어 있습니다');

    const rows = Array.from({ length: 20_001 }, (_, index) => ({
      상품코드: `SP-${index}`,
      상품명: '상품',
      재고: '1',
    }));
    expect(() => parseSellpiaWorkbook(workbookBuffer(rows))).toThrow('행 수가 너무 많습니다');
  });
});
