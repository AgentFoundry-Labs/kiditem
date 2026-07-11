import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  MAX_SELLPIA_INVENTORY_IMPORT_ROWS,
  parseSellpiaInventoryWorkbook,
} from './sellpia-inventory-workbook.parser';

function workbookBuffer(rows: unknown[][], configure?: (sheet: XLSX.WorkSheet) => void): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  configure?.(sheet);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
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

function errorMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).message;
  }
  throw new Error('Expected parser to reject the workbook');
}

describe('parseSellpiaInventoryWorkbook', () => {
  it('reads legacy CP949 XLS files that omit the codepage record', () => {
    const parsed = parseSellpiaInventoryWorkbook(legacyCp949XlsBuffer());

    expect(parsed.headers.slice(0, 4)).toEqual(['상품코드', '상품명', '재고', '안전재고']);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 2,
        sellpiaProductCode: '92-1',
        name: 'TEST',
        optionName: null,
        barcode: null,
        reportedStock: 39,
        purchasePrice: null,
        salePrice: null,
        rawJson: {
          상품코드: '92-1',
          상품명: 'TEST',
          재고: '39',
          안전재고: '3',
        },
      },
    ]);
  });

  it('detects a BOM/whitespace-normalized header row in the first 20 rows', () => {
    const parsed = parseSellpiaInventoryWorkbook(workbookBuffer([
      ['Sellpia export'],
      [],
      [' \uFEFF 상품 코드 ', ' 상품 명 ', ' 옵션 명 ', ' 재 고 ', ' 매입 가 ', ' 판매 가 '],
      [' SP-001 ', '테스트', ' 블루 ', '1,234', '10,000', '20,000'],
    ]));

    expect(parsed.headers).toEqual(['상품코드', '상품명', '옵션명', '재고', '매입가', '판매가']);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 4,
        sellpiaProductCode: 'SP-001',
        name: '테스트',
        optionName: '블루',
        barcode: null,
        reportedStock: 1_234,
        purchasePrice: 10_000,
        salePrice: 20_000,
        rawJson: {
          상품코드: ' SP-001 ',
          상품명: '테스트',
          옵션명: ' 블루 ',
          재고: '1,234',
          매입가: '10,000',
          판매가: '20,000',
        },
      },
    ]);
  });

  it('returns all six normalized values, null blank prices, and product-code name fallback', () => {
    const parsed = parseSellpiaInventoryWorkbook(workbookBuffer([
      ['상품코드', '상품명', '옵션명', '재고', '매입가', '판매가', '추가정보'],
      ['SP-NAMELESS', '', '', '7', '', '12,300', 'preserved'],
    ]));

    expect(parsed.rows[0]).toEqual({
      rowNumber: 2,
      sellpiaProductCode: 'SP-NAMELESS',
      name: 'SP-NAMELESS',
      optionName: null,
      barcode: null,
      reportedStock: 7,
      purchasePrice: null,
      salePrice: 12_300,
      rawJson: {
        상품코드: 'SP-NAMELESS',
        상품명: '',
        옵션명: '',
        재고: '7',
        매입가: '',
        판매가: '12,300',
        추가정보: 'preserved',
      },
    });
  });

  it('uses formatted identifier text and prioritizes 모델명, 바코드, then 자사상품코드', () => {
    const parsed = parseSellpiaInventoryWorkbook(workbookBuffer([
      ['상품코드', '상품명', '재고', '모델명', '바코드', '자사상품코드'],
      [1_234_567, 'formatted code', 1, 'MODEL 001-2345-6789', '880-2222222222', '8803333333333'],
      ['SP-BARCODE', 'barcode fallback', 1, 'MODEL-123', '(02) 1234-5678', '8803333333333'],
      ['SP-OWN', 'own-code fallback', 1, '1234567', '123456789012345', 'OWN 0000-1234-5678'],
      ['SP-NONE', 'invalid identifiers', 1, '1234567', '123456789012345', 'abc'],
    ], (sheet) => {
      const productCodeCell = sheet.A2;
      productCodeCell.z = '00000000';
      productCodeCell.w = '01234567';
    }));

    expect(parsed.rows.map((row) => [row.sellpiaProductCode, row.barcode])).toEqual([
      ['01234567', '00123456789'],
      ['SP-BARCODE', '0212345678'],
      ['SP-OWN', '000012345678'],
      ['SP-NONE', null],
    ]);
  });

  it('rejects duplicate product codes and reports every duplicate row number', () => {
    const message = errorMessage(() => parseSellpiaInventoryWorkbook(workbookBuffer([
      ['상품코드', '재고'],
      ['SP-DUP', 1],
      ['SP-OK', 2],
      ['SP-DUP', 3],
    ])));

    expect(message).toContain('SP-DUP');
    expect(message).toContain('2');
    expect(message).toContain('4');
  });

  it('accumulates blank-code, stock, and present-price validation errors', () => {
    const message = errorMessage(() => parseSellpiaInventoryWorkbook(workbookBuffer([
      ['상품코드', '재고', '매입가', '판매가'],
      ['', '-1', '', ''],
      ['SP-STOCK', '1.5', '', ''],
      ['SP-PURCHASE', '1', '-10', ''],
      ['SP-SALE', '1', '', '2.5'],
    ])));

    for (const rowNumber of ['2', '3', '4', '5']) expect(message).toContain(rowNumber);
    expect(message).toContain('상품코드');
    expect(message).toContain('재고');
    expect(message).toContain('매입가');
    expect(message).toContain('판매가');
  });

  it('rejects empty, no-sheet, missing-column, and over-limit workbooks', () => {
    expect(() => parseSellpiaInventoryWorkbook(workbookBuffer([
      ['상품코드', '재고'],
    ]))).toThrow('비어');

    const globalsOnlyBiff = Buffer.from('0908080000060500000000000a000000', 'hex');
    expect(() => parseSellpiaInventoryWorkbook(globalsOnlyBiff)).toThrow('시트');

    expect(() => parseSellpiaInventoryWorkbook(workbookBuffer([
      ['상품코드', '상품명'],
      ['SP-001', '상품'],
    ]))).toThrow('필수 컬럼');

    const rows = Array.from({ length: MAX_SELLPIA_INVENTORY_IMPORT_ROWS + 1 }, (_, index) => [
      `SP-${index}`,
      1,
    ]);
    expect(() => parseSellpiaInventoryWorkbook(workbookBuffer([
      ['상품코드', '재고'],
      ...rows,
    ]))).toThrow('행 수');
  });

  it('does not search for the required header row after row 20', () => {
    const preamble = Array.from({ length: 20 }, (_, index) => [`preamble ${index}`]);
    expect(() => parseSellpiaInventoryWorkbook(workbookBuffer([
      ...preamble,
      ['상품코드', '재고'],
      ['SP-LATE', 1],
    ]))).toThrow('필수 컬럼');
  });
});
