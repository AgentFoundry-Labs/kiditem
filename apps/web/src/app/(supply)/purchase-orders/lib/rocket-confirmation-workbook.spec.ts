import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildRocketConfirmationWorkbook,
  fillRocketConfirmationWorkbook,
} from './rocket-confirmation-workbook';

const PO_LINE_ID = '1001:P-1:8801234567890:1';

function sourceRow() {
  return {
    poLineId: PO_LINE_ID,
    poNumber: '1001',
    vendorId: 'VENDOR-1',
    productNo: 'P-1',
    barcode: '8801234567890',
    productName: 'Rocket item',
    orderQty: 4,
    plannedDeliveryDate: '2026-07-20',
    confirmation: {
      center: '덕평1센터',
      inboundType: '택배',
      poStatus: '거래처확인요청',
      returnManager: '담당자',
      returnContact: '010-0000-0000',
      returnAddress: '서울시',
      purchasePrice: 1_000,
      supplyPrice: 900,
      vat: 90,
      totalPurchase: 3_960,
      poRegisteredAt: '2026-07-17 09:00:00',
      xdock: 'N',
    },
  } as const;
}

const TEMPLATE_HEADER = [
  '발주번호', '물류센터', '입고유형', '발주상태', '상품번호', '상품바코드', '상품이름',
  '발주수량', '확정수량', '유통(소비)기한', '제조일자', '생산년도', '납품부족사유',
];

function templateBytes({
  productNo = 'P-1',
  includeExtraRow = false,
  duplicateMatchingRow = false,
  includeReasonHeader = true,
}: {
  productNo?: string;
  includeExtraRow?: boolean;
  duplicateMatchingRow?: boolean;
  includeReasonHeader?: boolean;
} = {}): ArrayBuffer {
  const header = includeReasonHeader ? TEMPLATE_HEADER : TEMPLATE_HEADER.slice(0, 12);
  const rows: (string | number)[][] = [
    header,
    [
      '1001', '원본센터', '원본입고', '거래처확인요청', productNo, '8801234567890',
      '원본 상품명', 4, '', '보존-유통기한', '보존-제조일자', '보존-생산년도', '',
    ],
  ];
  if (includeExtraRow) {
    rows.push([
      '1002', '원본센터', '원본입고', '거래처확인요청', 'P-2', '8800000000002',
      '추가 상품', 1, '', '', '', '', '',
    ]);
  }
  if (duplicateMatchingRow) {
    rows.push([
      '1001', '두 번째 원본센터', '원본입고', '거래처확인요청', productNo, '8801234567890',
      '두 번째 원본 상품명', 4, '', '', '', '', '',
    ]);
  }
  const workbook = XLSX.utils.book_new();
  const productSheet = XLSX.utils.aoa_to_sheet(rows);
  productSheet['!cols'] = [{ wch: 28 }, { wch: 19 }];
  XLSX.utils.book_append_sheet(workbook, productSheet, '상품목록');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['보존값'], ['원본 안내 문구']]),
    '안내',
  );
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }) as ArrayBuffer;
}

describe('buildRocketConfirmationWorkbook', () => {
  it('renders the canonical 23-column Coupang sheet from confirmed source evidence', async () => {
    const result = await buildRocketConfirmationWorkbook({
      sourceRows: [sourceRow()],
      workbookRows: [{
        poLineId: PO_LINE_ID,
        workbookQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
      now: new Date('2026-07-17T00:00:00.000Z'),
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(await result.blob.arrayBuffer() as never);
    const productSheet = workbook.getWorksheet('상품목록')!;
    const rows = productSheet.getSheetValues()
      .slice(1)
      .map((row) => (row as (string | number)[]).slice(1));

    expect(rows[0]).toHaveLength(23);
    expect(rows[0]?.[8]).toBe('확정수량');
    expect(rows[1]).toEqual([
      '1001', '덕평1센터', '택배', '거래처확인요청', 'P-1', '8801234567890',
      'Rocket item', 4, 2, undefined, undefined, undefined,
      '협력사 재고부족 - 수요예측 오류',
      '담당자', '010-0000-0000', '서울시', 1_000, 900, 90, 3_960,
      '20260720', '2026-07-17 09:00:00', 'N',
    ]);
    expect(result).toMatchObject({
      fileName: '쿠팡_로켓_20260717.xlsx',
      summary: { totalRows: 1, workbookQuantity: 2, shortRows: 1 },
    });
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['상품목록', 'hiddenSheet']);
  });

  it('matches Coupang styling, dimensions, validation, and hidden reason sheet', async () => {
    const result = await buildRocketConfirmationWorkbook({
      sourceRows: [sourceRow()],
      workbookRows: [{
        poLineId: PO_LINE_ID,
        workbookQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(await result.blob.arrayBuffer() as never);
    const productSheet = workbook.getWorksheet('상품목록')!;
    const reasonSheet = workbook.getWorksheet('hiddenSheet')!;

    expect(productSheet.columns.map((column) => column.width)).toEqual([
      16, 16, 16, 16, 16, 20, 40, 16, 16, 32, 16, 16,
      64, 20, 36, 65, 12, 12, 12, 28, 20, 24, 20,
    ]);
    expect(productSheet.properties.defaultRowHeight).toBe(15);
    expect(productSheet.pageSetup.margins).toEqual({
      left: 0.7,
      right: 0.7,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3,
    });
    expect(productSheet.getCell('A1')).toMatchObject({
      font: { name: '나눔고딕', size: 12 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0C0C0' } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: {
        top: { style: 'medium' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    });
    for (const address of ['C2', 'I2', 'M2', 'N2', 'O2', 'P2']) {
      expect(productSheet.getCell(address).fill).toMatchObject({
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' },
      });
    }
    expect(productSheet.getCell('B2').fill).toMatchObject({
      type: 'pattern',
      pattern: 'none',
    });
    expect(productSheet.getCell('A2').border.left?.style).toBe('medium');
    expect(productSheet.getCell('C2').dataValidation).toMatchObject({
      type: 'list',
      allowBlank: true,
      formulae: ['"쉽먼트,밀크런"'],
    });
    expect(productSheet.getCell('M2').dataValidation).toMatchObject({
      type: 'list',
      allowBlank: true,
      formulae: ['hiddenSheet!$A$1:$A$20'],
    });
    expect(reasonSheet.state).toBe('hidden');
    expect(reasonSheet.getCell('A4').value).toBe('협력사 재고부족 - 수요예측 오류');
  });

  it('rejects rows collected without the confirmation metadata capability', async () => {
    const { confirmation: _confirmation, ...legacyRow } = sourceRow();
    await expect(buildRocketConfirmationWorkbook({
      sourceRows: [legacyRow],
      workbookRows: [{
        poLineId: PO_LINE_ID,
        workbookQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    })).rejects.toThrow(/metadata/i);
  });
});

describe('fillRocketConfirmationWorkbook', () => {
  it('fills only confirmation outputs in the original Coupang workbook', async () => {
    const result = await fillRocketConfirmationWorkbook({
      template: templateBytes(),
      templateFileName: '쿠팡_원본.xlsx',
      sourceRows: [sourceRow()],
      workbookRows: [{
        poLineId: PO_LINE_ID,
        workbookQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
      now: new Date('2026-07-17T00:00:00.000Z'),
    });
    const workbook = XLSX.read(await result.blob.arrayBuffer(), { cellStyles: true });
    const productSheet = workbook.Sheets['상품목록']!;

    expect(productSheet['A2']?.v).toBe('1001');
    expect(productSheet['B2']?.v).toBe('원본센터');
    expect(productSheet['G2']?.v).toBe('원본 상품명');
    expect(productSheet['I2']?.v).toBe(2);
    expect(productSheet['J2']?.v).toBe('보존-유통기한');
    expect(productSheet['M2']?.v).toBe('협력사 재고부족 - 수요예측 오류');
    expect(productSheet['!cols']?.[0]?.wch).toBeGreaterThan(27);
    expect(workbook.Sheets['안내']?.['A1']?.v).toBe('보존값');
    expect(workbook.Sheets['안내']?.['A2']?.v).toBe('원본 안내 문구');
    const roundTrippedWorkbook = new Workbook();
    await roundTrippedWorkbook.xlsx.load(await result.blob.arrayBuffer() as never);
    expect(Object.keys(
      roundTrippedWorkbook.model.themes as unknown as Record<string, string>,
    )).toContain('theme1');
    expect(result).toMatchObject({
      fileName: '쿠팡_원본_쿠팡제출_20260717.xlsx',
      summary: { totalRows: 1, workbookQuantity: 2, shortRows: 1 },
    });
  });

  it('fails closed when required headers or one-to-one source rows do not match', async () => {
    const input = {
      templateFileName: '쿠팡_원본.xlsx',
      sourceRows: [sourceRow()],
      workbookRows: [{
        poLineId: PO_LINE_ID,
        workbookQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류' as const,
      }],
    };

    await expect(fillRocketConfirmationWorkbook({
      ...input,
      template: templateBytes({ includeReasonHeader: false }),
    })).rejects.toThrow(/납품부족사유/);
    await expect(fillRocketConfirmationWorkbook({
      ...input,
      template: templateBytes({ productNo: 'WRONG' }),
    })).rejects.toThrow(/match/i);
    await expect(fillRocketConfirmationWorkbook({
      ...input,
      template: templateBytes({ includeExtraRow: true }),
    })).rejects.toThrow(/match/i);
  });

  it('matches duplicate source identifiers by occurrence order', async () => {
    const secondSource = {
      ...sourceRow(),
      poLineId: '1001:P-1:8801234567890:2',
    };
    const result = await fillRocketConfirmationWorkbook({
      template: templateBytes({ duplicateMatchingRow: true }),
      templateFileName: '쿠팡_원본.xlsx',
      sourceRows: [sourceRow(), secondSource],
      workbookRows: [
        { poLineId: PO_LINE_ID, workbookQuantity: 1, shortageReason: null },
        { poLineId: secondSource.poLineId, workbookQuantity: 3, shortageReason: null },
      ],
    });
    const workbook = XLSX.read(await result.blob.arrayBuffer());
    const productSheet = workbook.Sheets['상품목록']!;

    expect(productSheet['I2']?.v).toBe(1);
    expect(productSheet['I3']?.v).toBe(3);
  });
});
