import { KiditemError, KiditemPreconditionError } from '@kiditem/shared/errors';
import { z } from 'zod';
import {
  ROCKET_SHORTAGE_REASONS,
  RocketPoCatalogRowSchema,
  RocketShortageReasonSchema,
  type RocketPoCatalogRow,
  type RocketWorkbookExportResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import type { Cell, CellValue, Workbook, Worksheet } from 'exceljs';

const PRODUCT_SHEET = '상품목록';
const REASON_SHEET = 'hiddenSheet';
const HEADER = [
  '발주번호', '물류센터', '입고유형', '발주상태', '상품번호', '상품바코드', '상품이름',
  '발주수량', '확정수량', '유통(소비)기한', '제조일자', '생산년도', '납품부족사유',
  '회송담당자', '회송담당자 연락처', '회송지주소', '매입가', '공급가', '부가세',
  '총발주 매입금', '입고예정일', '발주등록일시', 'Xdock',
] as const;

export interface RocketConfirmationWorkbookResult {
  bytes: Buffer;
  fileName: string;
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  summary: {
    totalRows: number;
    workbookQuantity: number;
    fullyConfirmedRows: number;
    shortRows: number;
  };
}

export type RocketConfirmationWorkbookRows = RocketWorkbookExportResponse['rows'];

const RocketConfirmationWorkbookRowSchema = z.object({
  poLineId: z.string().trim().min(1).max(300),
  workbookQuantity: z.number().int().nonnegative(),
  shortageReason: RocketShortageReasonSchema.nullable(),
}).strict();

export const RocketConfirmationWorkbookConversionRequestSchema = z.object({
  sourceRows: z.array(RocketPoCatalogRowSchema).max(4_000),
  workbookRows: z.array(RocketConfirmationWorkbookRowSchema).max(4_000),
  templateFileName: z.string().trim().min(1).max(240).optional(),
  now: z.string().datetime().optional(),
}).strict();
export type RocketConfirmationWorkbookConversionRequest = z.infer<
  typeof RocketConfirmationWorkbookConversionRequestSchema
>;

const TEMPLATE_MATCH_HEADERS = [
  '발주번호',
  '상품번호',
  '상품바코드',
  '확정수량',
  '납품부족사유',
] as const;

const PRODUCT_COLUMN_WIDTHS = [
  16, 16, 16, 16, 16, 20, 40, 16, 16, 32, 16, 16,
  64, 20, 36, 65, 12, 12, 12, 28, 20, 24, 20,
] as const;
const COUPANG_REASON_SHEET_VALUES = [
  ...ROCKET_SHORTAGE_REASONS.slice(5, 8),
  ...ROCKET_SHORTAGE_REASONS.slice(0, 5),
  ...ROCKET_SHORTAGE_REASONS.slice(8),
];
const HIGHLIGHTED_DATA_COLUMNS = new Set([3, 9, 13, 14, 15, 16]);
const COUPANG_FONT = {
  name: '나눔고딕',
  size: 12,
  color: { argb: 'FF000000' },
} as const;
const COUPANG_ALIGNMENT = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
} as const;
const COUPANG_PAGE_MARGINS = {
  left: 0.7,
  right: 0.7,
  top: 0.75,
  bottom: 0.75,
  header: 0.3,
  footer: 0.3,
} as const;

export async function buildRocketConfirmationWorkbook(input: {
  sourceRows: RocketPoCatalogRow[];
  workbookRows: RocketConfirmationWorkbookRows;
  now?: Date;
}): Promise<RocketConfirmationWorkbookResult> {
  const workbookByLineId = validateWorkbookRows(input.sourceRows, input.workbookRows);
  let workbookQuantity = 0;
  let fullyConfirmedRows = 0;
  let shortRows = 0;
  const rows: (string | number | null)[][] = [];
  for (const source of input.sourceRows) {
    const confirmation = source.confirmation;
    const workbookRow = workbookByLineId.get(source.poLineId);
    if (!confirmation) {
      throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', {
        details: { reason: 'CONFIRMATION_METADATA_MISSING', poLineId: source.poLineId },
      });
    }
    if (!workbookRow) {
      throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', {
        details: { reason: 'WORKBOOK_LINE_MISSING', poLineId: source.poLineId },
      });
    }
    workbookQuantity += workbookRow.workbookQuantity;
    if (workbookRow.workbookQuantity < source.orderQty) shortRows += 1;
    else fullyConfirmedRows += 1;
    rows.push([
      source.poNumber,
      confirmation.center,
      confirmation.inboundType,
      confirmation.poStatus,
      source.productNo,
      source.barcode,
      source.productName,
      source.orderQty,
      workbookRow.workbookQuantity,
      null,
      null,
      null,
      workbookRow.shortageReason,
      confirmation.returnManager,
      confirmation.returnContact,
      confirmation.returnAddress,
      confirmation.purchasePrice,
      confirmation.supplyPrice,
      confirmation.vat,
      confirmation.totalPurchase,
      source.plannedDeliveryDate.replaceAll('-', ''),
      confirmation.poRegisteredAt,
      confirmation.xdock,
    ]);
  }

  const workbook = await createWorkbook();
  const productSheet = workbook.addWorksheet(PRODUCT_SHEET, {
    properties: { defaultRowHeight: 15 },
    pageSetup: { margins: COUPANG_PAGE_MARGINS },
  });
  productSheet.addRow(Array.from(HEADER));
  productSheet.addRows(rows);
  applyCoupangWorkbookFormat(productSheet, rows.length);

  const reasonSheet = workbook.addWorksheet(REASON_SHEET, {
    properties: { defaultRowHeight: 15 },
    pageSetup: { margins: COUPANG_PAGE_MARGINS },
    state: 'hidden',
  });
  reasonSheet.addRows(COUPANG_REASON_SHEET_VALUES.map((reason) => [reason]));
  reasonSheet.eachRow((row) => {
    const cell = row.getCell(1);
    cell.font = { ...COUPANG_FONT };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  });

  const bytes = await workbook.xlsx.writeBuffer();
  const now = input.now ?? new Date();
  return {
    bytes: workbookBytes(bytes),
    fileName: `쿠팡_로켓_${calendarStamp(now)}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    summary: {
      totalRows: input.sourceRows.length,
      workbookQuantity,
      fullyConfirmedRows,
      shortRows,
    },
  };
}

export async function fillRocketConfirmationWorkbook(input: {
  template: Buffer;
  templateFileName: string;
  sourceRows: RocketPoCatalogRow[];
  workbookRows: RocketConfirmationWorkbookRows;
  now?: Date;
}): Promise<RocketConfirmationWorkbookResult> {
  const workbookByLineId = validateWorkbookRows(input.sourceRows, input.workbookRows);
  const workbook = await createWorkbook();
  await workbook.xlsx.load(input.template as never);
  restoreDefaultThemeWhenTemplateOmitsIt(workbook);
  const sheet = workbook.getWorksheet(PRODUCT_SHEET);
  if (!sheet) {
    throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', { details: { reason: 'TEMPLATE_SHEET_MISSING' } });
  }

  let headerRow = -1;
  let headerIndex = new Map<string, number>();
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    const candidate = new Map<string, number>();
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      const value = plainCellValue(sheet.getCell(row, column).value);
      if (typeof value === 'string') candidate.set(value, column);
    }
    if (candidate.has('발주번호')) {
      headerRow = row;
      headerIndex = candidate;
      break;
    }
  }
  if (headerRow < 0) {
    throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', { details: { reason: 'TEMPLATE_HEADER_MISSING', header: '발주번호' } });
  }
  for (const header of TEMPLATE_MATCH_HEADERS) {
    if (!headerIndex.has(header)) {
      throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', { details: { reason: 'TEMPLATE_HEADER_MISSING', header } });
    }
  }

  const poColumn = headerIndex.get('발주번호')!;
  const productColumn = headerIndex.get('상품번호')!;
  const barcodeColumn = headerIndex.get('상품바코드')!;
  const quantityColumn = headerIndex.get('확정수량')!;
  const reasonColumn = headerIndex.get('납품부족사유')!;
  const templateRowsByKey = new Map<string, number[]>();
  let templateRowCount = 0;
  for (let row = headerRow + 1; row <= sheet.rowCount; row += 1) {
    const values = [poColumn, productColumn, barcodeColumn]
      .map((column) => plainCellValue(sheet.getCell(row, column).value));
    if (values.every(isBlankCellValue)) continue;
    if (values.some(isBlankCellValue)) {
      throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', { details: { reason: 'TEMPLATE_ROWS_MISMATCH' } });
    }
    const key = sourceMatchKey(values[0], values[1], values[2]);
    const matchingRows = templateRowsByKey.get(key) ?? [];
    matchingRows.push(row);
    templateRowsByKey.set(key, matchingRows);
    templateRowCount += 1;
  }
  if (templateRowCount !== input.sourceRows.length) {
    throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', { details: { reason: 'TEMPLATE_ROWS_MISMATCH' } });
  }

  const occurrenceByKey = new Map<string, number>();
  let workbookQuantity = 0;
  let fullyConfirmedRows = 0;
  let shortRows = 0;
  for (const source of input.sourceRows) {
    const key = sourceMatchKey(source.poNumber, source.productNo, source.barcode);
    const occurrence = occurrenceByKey.get(key) ?? 0;
    occurrenceByKey.set(key, occurrence + 1);
    const templateRow = templateRowsByKey.get(key)?.[occurrence];
    const workbookRow = workbookByLineId.get(source.poLineId);
    if (templateRow === undefined || !workbookRow) {
      throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', { details: { reason: 'TEMPLATE_ROWS_MISMATCH' } });
    }
    sheet.getCell(templateRow, quantityColumn).value = workbookRow.workbookQuantity;
    sheet.getCell(templateRow, reasonColumn).value = workbookRow.shortageReason;
    workbookQuantity += workbookRow.workbookQuantity;
    if (workbookRow.workbookQuantity < source.orderQty) shortRows += 1;
    else fullyConfirmedRows += 1;
  }

  const bytes = await workbook.xlsx.writeBuffer();
  const now = input.now ?? new Date();
  return {
    bytes: workbookBytes(bytes),
    fileName: `${templateFileStem(input.templateFileName)}_쿠팡제출_${calendarStamp(now)}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    summary: {
      totalRows: input.sourceRows.length,
      workbookQuantity,
      fullyConfirmedRows,
      shortRows,
    },
  };
}

async function createWorkbook(): Promise<Workbook> {
  type WorkbookConstructor = new () => Workbook;
  const module = await import('exceljs') as unknown as {
    Workbook?: WorkbookConstructor;
    default?: { Workbook?: WorkbookConstructor };
  };
  const ExcelWorkbook = module.Workbook ?? module.default?.Workbook;
  if (!ExcelWorkbook) throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'EXCEL_GENERATOR_UNAVAILABLE' } });
  return new ExcelWorkbook();
}

function restoreDefaultThemeWhenTemplateOmitsIt(workbook: Workbook): void {
  const themes = workbook.model.themes as unknown as Record<string, string> | undefined;
  if (!themes || Object.keys(themes).length > 0) return;
  (workbook as unknown as { _themes?: Record<string, string> })._themes = undefined;
}

function workbookBytes(
  bytes: Awaited<ReturnType<Workbook['xlsx']['writeBuffer']>>,
): Buffer {
  return Buffer.from(bytes as unknown as ArrayLike<number>);
}

function applyCoupangWorkbookFormat(sheet: Worksheet, dataRowCount: number): void {
  sheet.columns.forEach((column, index) => {
    column.width = PRODUCT_COLUMN_WIDTHS[index];
  });

  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { ...COUPANG_FONT };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC0C0C0' },
    };
    cell.alignment = { ...COUPANG_ALIGNMENT };
    cell.border = {
      top: { style: 'medium' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.protection = { locked: true };
  });

  for (let rowNumber = 2; rowNumber <= dataRowCount + 1; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let columnNumber = 1; columnNumber <= HEADER.length; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      applyCoupangDataCellFormat(cell, columnNumber);
    }
    row.getCell(3).dataValidation = coupangListValidation('"쉽먼트,밀크런"');
    row.getCell(13).dataValidation = coupangListValidation('hiddenSheet!$A$1:$A$20');
  }
}

function validateWorkbookRows(
  sourceRows: RocketPoCatalogRow[],
  workbookRows: RocketConfirmationWorkbookRows,
): Map<string, RocketConfirmationWorkbookRows[number]> {
  const workbookByLineId = new Map(workbookRows.map((row) => [row.poLineId, row]));
  if (
    workbookRows.length !== sourceRows.length
    || workbookByLineId.size !== sourceRows.length
    || sourceRows.some(({ poLineId }) => !workbookByLineId.has(poLineId))
  ) {
    throw new KiditemPreconditionError('SUPPLY_ROCKET_TEMPLATE_MISMATCH', { details: { reason: 'WORKBOOK_ROWS_MISMATCH' } });
  }
  return workbookByLineId;
}

function applyCoupangDataCellFormat(cell: Cell, columnNumber: number): void {
  cell.font = { ...COUPANG_FONT };
  cell.fill = HIGHLIGHTED_DATA_COLUMNS.has(columnNumber)
    ? {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' },
      }
    : { type: 'pattern', pattern: 'none' };
  cell.alignment = { ...COUPANG_ALIGNMENT };
  cell.border = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: columnNumber === 1 ? 'medium' : 'thin' },
    right: { style: 'thin' },
  };
  cell.protection = { locked: true };
  if (columnNumber >= 17 && columnNumber <= 20) cell.numFmt = '#,##0';
}

function coupangListValidation(formula: string) {
  return {
    type: 'list' as const,
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: 'stop' as const,
    errorTitle: 'ERROR',
    error: '잘못된 값을 입력하였습니다.',
    formulae: [formula],
  };
}

function plainCellValue(value: CellValue): unknown {
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  if ('result' in value) return value.result;
  if ('text' in value) return value.text;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  return value;
}

function isBlankCellValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function sourceMatchKey(poNumber: unknown, productNo: unknown, barcode: unknown): string {
  return JSON.stringify([String(poNumber), String(productNo), String(barcode)]);
}

function templateFileStem(fileName: string): string {
  const stem = fileName.replace(/\.xlsx$/i, '') || '쿠팡_원본';
  return stem.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
}

function calendarStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
