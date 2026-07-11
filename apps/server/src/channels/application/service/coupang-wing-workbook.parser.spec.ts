import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  MAX_COUPANG_WING_IMPORT_ROWS,
  parseCoupangWingWorkbook,
} from './coupang-wing-workbook.parser';

const REQUIRED_HEADERS = [
  '등록상품ID',
  '등록상품명',
  '쿠팡 노출상품명',
  '카테고리',
  '제조사',
  '브랜드',
  '승인상태',
  '옵션 ID',
  '등록 옵션명',
  '판매상태',
  '모델번호',
  '바코드',
] as const;

const PARENT_COLUMN_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;

type WorkbookOptions = {
  anotherSheetFirst?: boolean;
  configureTemplate?: (sheet: XLSX.WorkSheet) => void;
};

function workbookBuffer(rows: unknown[][], options: WorkbookOptions = {}): Buffer {
  const workbook = XLSX.utils.book_new();
  if (options.anotherSheetFirst) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['not the catalog']]),
      'Instructions',
    );
  }
  const template = XLSX.utils.aoa_to_sheet(rows);
  options.configureTemplate?.(template);
  XLSX.utils.book_append_sheet(workbook, template, 'Template');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

function withoutTemplateBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['nothing']]), 'Sheet1');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

function staleTemplateRef(buffer: Buffer, staleRef: string): Buffer {
  const container = XLSX.CFB.read(buffer, { type: 'buffer' });
  const worksheet = XLSX.CFB.find(
    container,
    'Root Entry/xl/worksheets/sheet1.xml',
  );
  if (!worksheet?.content) throw new Error('worksheet XML not found');

  const xml = Buffer.from(worksheet.content).toString('utf8');
  const rewritten = xml.replace(
    /<dimension ref="[^"]+"\/>/,
    `<dimension ref="${staleRef}"/>`,
  );
  if (rewritten === xml) throw new Error('worksheet dimension was not rewritten');
  worksheet.content = Buffer.from(rewritten);
  worksheet.size = worksheet.content.length;
  return Buffer.from(
    XLSX.CFB.write(container, { type: 'buffer', fileType: 'zip' }),
  );
}

function headerAndRow(overrides: Record<string, unknown> = {}): unknown[][] {
  const values: Record<string, unknown> = {
    등록상품ID: 'P-001',
    등록상품명: '등록 상품',
    '쿠팡 노출상품명': '노출 상품',
    카테고리: '완구',
    제조사: '제조사',
    브랜드: '브랜드',
    승인상태: '승인완료',
    '옵션 ID': 'S-001',
    '등록 옵션명': '블루',
    판매상태: '판매중',
    모델번호: 'MODEL-1',
    바코드: '001234567890',
    ...overrides,
  };
  return [
    ['Coupang Wing catalog'],
    [],
    [],
    [...REQUIRED_HEADERS],
    REQUIRED_HEADERS.map((header) => values[header]),
  ];
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

describe('parseCoupangWingWorkbook', () => {
  it('selects Template, finds row-4 headers, maps exact fields, and preserves formatted IDs', () => {
    const buffer = workbookBuffer(headerAndRow({
      등록상품ID: 1234,
      '옵션 ID': 5678,
      추가필드: 'not used',
    }), {
      anotherSheetFirst: true,
      configureTemplate: (sheet) => {
        sheet.A5.z = '00000000';
        sheet.H5.z = '00000000';
      },
    });

    const parsed = parseCoupangWingWorkbook(buffer);

    expect(parsed.headers).toEqual(REQUIRED_HEADERS);
    expect(parsed.skippedRows).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        rowNumber: 5,
        externalProductId: '00001234',
        registeredName: '등록 상품',
        displayName: '노출 상품',
        category: '완구',
        manufacturer: '제조사',
        brand: '브랜드',
        productStatus: '승인완료',
        externalSkuId: '00005678',
        optionName: '블루',
        skuStatus: '판매중',
        modelNumber: 'MODEL-1',
        barcode: '001234567890',
        rawJson: {
          등록상품ID: '00001234',
          등록상품명: '등록 상품',
          '쿠팡 노출상품명': '노출 상품',
          카테고리: '완구',
          제조사: '제조사',
          브랜드: '브랜드',
          승인상태: '승인완료',
          '옵션 ID': '00005678',
          '등록 옵션명': '블루',
          판매상태: '판매중',
          모델번호: 'MODEL-1',
          바코드: '001234567890',
        },
      },
    ]);
    expect(parsed.rows[0]).not.toHaveProperty('sellerSku');
    expect(parsed.rows[0]).not.toHaveProperty('salePrice');
  });

  it('repairs stale Template !ref before parsing cells through row 2248', () => {
    const rows = headerAndRow();
    rows.push(...Array.from({ length: 2_243 }, () => []));
    rows[2_247] = REQUIRED_HEADERS.map((header) => ({
      등록상품ID: 'P-LAST',
      '옵션 ID': 'S-LAST',
    })[header] ?? '');
    const buffer = staleTemplateRef(workbookBuffer(rows), 'A1:HW4');

    const parsed = parseCoupangWingWorkbook(buffer);

    expect(parsed.rows.at(-1)).toMatchObject({
      rowNumber: 2_248,
      externalProductId: 'P-LAST',
      externalSkuId: 'S-LAST',
    });
  });

  it('expands only blank cells inside the seven explicit parent merge ranges', () => {
    const rows = headerAndRow();
    rows.push(
      ['', '', '', '', '', '', '', 'S-002', '', '판매중', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', 'S-ORPHAN', 'orphan', '', '', ''],
    );
    const buffer = workbookBuffer(rows, {
      configureTemplate: (sheet) => {
        sheet['!merges'] = PARENT_COLUMN_INDEXES.map((column) => ({
          s: { r: 4, c: column },
          e: { r: 6, c: column },
        }));
      },
    });

    const parsed = parseCoupangWingWorkbook(buffer);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1]).toMatchObject({
      rowNumber: 6,
      externalProductId: 'P-001',
      externalSkuId: 'S-002',
      registeredName: '등록 상품',
      optionName: null,
      modelNumber: null,
      barcode: null,
    });
    expect(parsed.skippedRows).toEqual([
      { rowNumber: 7, reason: 'missing_sku_id' },
      { rowNumber: 8, reason: 'missing_product_id' },
    ]);
  });

  it('preserves all 231 source columns in rawJson', () => {
    const extraHeaders = Array.from(
      { length: 231 - REQUIRED_HEADERS.length },
      (_, index) => `추가필드-${index}`,
    );
    const headers = [...REQUIRED_HEADERS, ...extraHeaders];
    const sourceRow = headers.map((header, index) => {
      if (header === '등록상품ID') return 'P-231';
      if (header === '옵션 ID') return 'S-231';
      return `값-${index}`;
    });

    const parsed = parseCoupangWingWorkbook(workbookBuffer([
      ['title'],
      [],
      [],
      headers,
      sourceRow,
    ]));

    expect(parsed.headers).toHaveLength(231);
    expect(Object.keys(parsed.rows[0].rawJson)).toHaveLength(231);
    expect(parsed.rows[0].rawJson['추가필드-218']).toBe('값-230');
  });

  it('returns rows missing either required ID as skipped rows', () => {
    const rows = headerAndRow();
    rows.push(
      REQUIRED_HEADERS.map((header) => header === '등록상품ID' ? '' : header === '옵션 ID' ? 'S-NO-PARENT' : ''),
      REQUIRED_HEADERS.map((header) => header === '등록상품ID' ? 'P-NO-SKU' : ''),
    );

    const parsed = parseCoupangWingWorkbook(workbookBuffer(rows));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.skippedRows).toEqual([
      { rowNumber: 6, reason: 'missing_product_id' },
      { rowNumber: 7, reason: 'missing_sku_id' },
    ]);
  });

  it('rejects duplicate option IDs, including one option under two parents', () => {
    const sameParentRows = headerAndRow();
    sameParentRows.push(REQUIRED_HEADERS.map((header) => {
      if (header === '등록상품ID') return 'P-001';
      if (header === '옵션 ID') return 'S-001';
      return '';
    }));
    const sameParentMessage = errorMessage(() =>
      parseCoupangWingWorkbook(workbookBuffer(sameParentRows)),
    );
    expect(sameParentMessage).toContain('S-001');
    expect(sameParentMessage).toContain('5');
    expect(sameParentMessage).toContain('6');

    const twoParentRows = headerAndRow();
    twoParentRows.push(REQUIRED_HEADERS.map((header) => {
      if (header === '등록상품ID') return 'P-002';
      if (header === '옵션 ID') return 'S-001';
      return '';
    }));
    expect(errorMessage(() =>
      parseCoupangWingWorkbook(workbookBuffer(twoParentRows)),
    )).toContain('서로 다른 등록상품');
  });

  it('rejects conflicting nonblank normalized parent metadata but allows raw exposure IDs to differ', () => {
    const headers = [...REQUIRED_HEADERS, '노출상품ID'];
    const row = (name: string, skuId: string, exposureId: string) =>
      headers.map((header) => {
        if (header === '등록상품ID') return 'P-SHARED';
        if (header === '등록상품명') return name;
        if (header === '옵션 ID') return skuId;
        if (header === '노출상품ID') return exposureId;
        return '';
      });

    const accepted = parseCoupangWingWorkbook(workbookBuffer([
      ['title'], [], [], headers,
      row('same', 'S-A', 'EXPOSURE-A'),
      row('same', 'S-B', 'EXPOSURE-B'),
    ]));
    expect(accepted.rows.map((item) => item.rawJson['노출상품ID']))
      .toEqual(['EXPOSURE-A', 'EXPOSURE-B']);

    expect(errorMessage(() => parseCoupangWingWorkbook(workbookBuffer([
      ['title'], [], [], headers,
      row('first', 'S-A', 'EXPOSURE-A'),
      row('conflict', 'S-B', 'EXPOSURE-B'),
    ])))).toContain('등록상품명');
  });

  it('freezes the approved 1,225-parent/2,241-SKU/three-skip merge shape', () => {
    const { rows, merges } = representativeRows();
    const buffer = staleTemplateRef(workbookBuffer(rows, {
      configureTemplate: (sheet) => {
        sheet['!merges'] = merges;
      },
    }), 'A1:HW4');

    const parsed = parseCoupangWingWorkbook(buffer);

    expect(parsed.rows).toHaveLength(2_241);
    expect(new Set(parsed.rows.map((row) => row.externalProductId))).toHaveLength(1_225);
    expect(parsed.skippedRows).toEqual([
      { rowNumber: 56, reason: 'missing_sku_id' },
      { rowNumber: 2_213, reason: 'missing_sku_id' },
      { rowNumber: 2_248, reason: 'missing_sku_id' },
    ]);
    expect(merges).toHaveLength(137 * PARENT_COLUMN_INDEXES.length);
  });

  it('rejects empty, no-Template, missing-column, late-header, and over-limit files', () => {
    expect(() => parseCoupangWingWorkbook(workbookBuffer([
      ['title'], [], [], [...REQUIRED_HEADERS],
    ]))).toThrow('비어');
    expect(() => parseCoupangWingWorkbook(withoutTemplateBuffer())).toThrow('Template');
    expect(() => parseCoupangWingWorkbook(workbookBuffer([
      ['title'], [], [], REQUIRED_HEADERS.filter((header) => header !== '바코드'),
      ['P-1'],
    ]))).toThrow('필수 컬럼');

    const preamble = Array.from({ length: 20 }, (_, index) => [`preamble-${index}`]);
    expect(() => parseCoupangWingWorkbook(workbookBuffer([
      ...preamble,
      [...REQUIRED_HEADERS],
      REQUIRED_HEADERS.map((header) => header === '등록상품ID' ? 'P-LATE' : header === '옵션 ID' ? 'S-LATE' : ''),
    ]))).toThrow('필수 컬럼');

    const overLimitRows = Array.from(
      { length: MAX_COUPANG_WING_IMPORT_ROWS + 1 },
      (_, index) => REQUIRED_HEADERS.map((header) => {
        if (header === '등록상품ID') return `P-${index}`;
        if (header === '옵션 ID') return `S-${index}`;
        return '';
      }),
    );
    expect(() => parseCoupangWingWorkbook(workbookBuffer([
      ['title'], [], [], [...REQUIRED_HEADERS], ...overLimitRows,
    ]))).toThrow('행 수');
  });
});

function representativeRows(): { rows: unknown[][]; merges: XLSX.Range[] } {
  const rows: unknown[][] = [['title'], [], [], [...REQUIRED_HEADERS]];
  const merges: XLSX.Range[] = [];
  const missingSkuRows = new Set([56, 2_213, 2_248]);
  let dataRowIndex = 0;

  const appendRow = (parentIndex: number, includeParent: boolean) => {
    const worksheetRow = dataRowIndex + 5;
    rows.push(REQUIRED_HEADERS.map((header) => {
      if (includeParent) {
        if (header === '등록상품ID') return `P-${String(parentIndex).padStart(4, '0')}`;
        if (header === '등록상품명') return `상품 ${parentIndex}`;
        if (header === '쿠팡 노출상품명') return `노출 상품 ${parentIndex}`;
        if (header === '카테고리') return `카테고리 ${parentIndex % 10}`;
        if (header === '제조사') return `제조사 ${parentIndex % 5}`;
        if (header === '브랜드') return `브랜드 ${parentIndex % 7}`;
        if (header === '승인상태') return '승인완료';
      }
      if (header === '옵션 ID') {
        return missingSkuRows.has(worksheetRow)
          ? ''
          : `S-${String(worksheetRow).padStart(5, '0')}`;
      }
      if (header === '등록 옵션명') return `옵션 ${worksheetRow}`;
      if (header === '판매상태') return '판매중';
      return '';
    }));
    dataRowIndex += 1;
  };

  for (let parentIndex = 0; parentIndex < 137; parentIndex += 1) {
    const followOnCount = parentIndex < 58 ? 8 : 7;
    const startRow = dataRowIndex + 4;
    appendRow(parentIndex, true);
    for (let optionIndex = 0; optionIndex < followOnCount; optionIndex += 1) {
      appendRow(parentIndex, false);
    }
    const endRow = dataRowIndex + 3;
    for (const column of PARENT_COLUMN_INDEXES) {
      merges.push({ s: { r: startRow, c: column }, e: { r: endRow, c: column } });
    }
  }

  for (let parentIndex = 137; parentIndex < 1_225; parentIndex += 1) {
    appendRow(parentIndex, true);
  }
  // Row 2213 is the only row for parent 1191 and intentionally has no SKU.
  // Repeat that parent on a valid row so the imported shape still has 1,225 parents.
  appendRow(1_191, true);
  appendRow(0, true);

  expect(dataRowIndex).toBe(2_244);
  return { rows, merges };
}
