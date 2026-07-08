import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSellpiaWorkbook } from './sellpia-workbook.parser';

function workbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

function legacyCp949XlsBuffer(): Buffer {
  const bof = Buffer.from('090808000000100000000000', 'hex');
  const eof = Buffer.from('0a000000', 'hex');
  const label = (row: number, column: number, bytes: Buffer): Buffer => {
    const length = 8 + bytes.length;
    const record = Buffer.alloc(4 + length);
    record.writeUInt16LE(0x0204, 0);
    record.writeUInt16LE(length, 2);
    record.writeUInt16LE(row, 4);
    record.writeUInt16LE(column, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(bytes.length, 10);
    bytes.copy(record, 12);
    return record;
  };

  return Buffer.concat([
    bof,
    label(0, 0, Buffer.from('bbf3c7b0c4dab5e5', 'hex')),
    label(0, 1, Buffer.from('bbf3c7b0b8ed', 'hex')),
    label(0, 2, Buffer.from('c0e7b0ed', 'hex')),
    label(0, 3, Buffer.from('bec8c0fcc0e7b0ed', 'hex')),
    label(1, 0, Buffer.from('92-1')),
    label(1, 1, Buffer.from('TEST')),
    label(1, 2, Buffer.from('39')),
    label(1, 3, Buffer.from('3')),
    eof,
  ]);
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

  it('flags rows with missing 상품명 without rejecting the import', () => {
    const parsed = parseSellpiaWorkbook(workbookBuffer([
      { 상품코드: 'SP-NAMELESS', 상품명: '', 재고: '3' },
    ]));

    expect(parsed.rows[0]).toMatchObject({
      sellpiaProductCode: 'SP-NAMELESS',
      sellpiaProductName: null,
      sellpiaStock: 3,
      warnings: ['missing_product_name'],
    });
  });

  it('parses legacy CP949 XLS exports without a codepage record', () => {
    const parsed = parseSellpiaWorkbook(legacyCp949XlsBuffer());

    expect(parsed.headers.slice(0, 4)).toEqual(['상품코드', '상품명', '재고', '안전재고']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      sellpiaProductCode: '92-1',
      sellpiaProductName: 'TEST',
      sellpiaStock: 39,
      safetyStock: 3,
      warnings: [],
    });
  });

  it('normalizes Excel text formulas used to preserve code-shaped values', () => {
    const parsed = parseSellpiaWorkbook(workbookBuffer([
      {
        상품코드: '="92-1"',
        상품명: '테스트 상품',
        재고: '="39"',
        안전재고: '="3"',
        자사상품코드: '="OWN-1"',
        바코드: '="8801234567890"',
        모델명: '="MODEL-1"',
      },
    ]));

    expect(parsed.rows[0]).toMatchObject({
      sellpiaProductCode: '92-1',
      sellpiaStock: 39,
      safetyStock: 3,
      ownProductCode: 'OWN-1',
      barcode: '8801234567890',
      modelName: 'MODEL-1',
      warnings: [],
    });
  });

  it('canonicalizes known Sellpia headers before validation and row mapping', () => {
    const parsed = parseSellpiaWorkbook(workbookBuffer([
      {
        '상품 코드': 'SP-001',
        '상품 명': '공백 헤더 상품',
        '재 고': '5',
        '안전 재고': '2',
        '자사 상품 코드': '8801111111111',
      },
    ]));

    expect(parsed.headers.slice(0, 5)).toEqual([
      '상품코드',
      '상품명',
      '재고',
      '안전재고',
      '자사상품코드',
    ]);
    expect(parsed.rows[0]).toMatchObject({
      sellpiaProductCode: 'SP-001',
      sellpiaProductName: '공백 헤더 상품',
      sellpiaStock: 5,
      safetyStock: 2,
      ownProductCode: '8801111111111',
      sourceBarcode: '8801111111111',
      warnings: [],
    });
  });

  it('derives source barcode from own code, barcode, then barcode-like model name', () => {
    const parsed = parseSellpiaWorkbook(workbookBuffer([
      {
        상품코드: 'SP-OWN',
        상품명: '자사 코드 우선',
        재고: '1',
        자사상품코드: '8801111111111',
        바코드: '8802222222222',
        모델명: '8803333333333',
      },
      {
        상품코드: 'SP-BARCODE',
        상품명: '바코드 사용',
        재고: '1',
        바코드: '8802222222222',
        모델명: '8803333333333',
      },
      {
        상품코드: 'SP-MODEL',
        상품명: '모델명에서 추출',
        재고: '1',
        모델명: '8803333333333',
      },
      {
        상품코드: 'SP-NONE',
        상품명: '바코드 없음',
        재고: '1',
        모델명: 'MODEL-1',
      },
    ]));

    expect(parsed.rows.map((row) => row.sourceBarcode)).toEqual([
      '8801111111111',
      '8802222222222',
      '8803333333333',
      null,
    ]);
  });

  it('parses UTF-8 CSV exports without a byte order mark', () => {
    const parsed = parseSellpiaWorkbook(Buffer.from('상품코드,상품명,재고\n92-1,테스트,39\n'));

    expect(parsed.headers).toEqual(['상품코드', '상품명', '재고']);
    expect(parsed.rows[0]).toMatchObject({
      sellpiaProductCode: '92-1',
      sellpiaProductName: '테스트',
      sellpiaStock: 39,
      warnings: [],
    });
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
