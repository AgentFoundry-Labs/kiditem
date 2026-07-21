import * as XLSX from 'xlsx';
import { ROCKET_SHORTAGE_REASONS } from '@kiditem/shared/rocket-purchase-preview';
import type {
  RocketPoCatalogRow,
  RocketPurchaseConfirmationResponse,
} from '@kiditem/shared/rocket-purchase-preview';

const PRODUCT_SHEET = '상품목록';
const REASON_SHEET = 'hiddenSheet';
const HEADER = [
  '발주번호', '물류센터', '입고유형', '발주상태', '상품번호', '상품바코드', '상품이름',
  '발주수량', '확정수량', '유통(소비)기한', '제조일자', '생산년도', '납품부족사유',
  '회송담당자', '회송담당자 연락처', '회송지주소', '매입가', '공급가', '부가세',
  '총발주 매입금', '입고예정일', '발주등록일시', 'Xdock',
] as const;

interface RocketConfirmationWorkbookResult {
  blob: Blob;
  fileName: string;
  summary: {
    totalRows: number;
    confirmedQuantity: number;
    fullyConfirmedRows: number;
    shortRows: number;
  };
}

const TEMPLATE_MATCH_HEADERS = [
  '발주번호',
  '상품번호',
  '상품바코드',
  '확정수량',
  '납품부족사유',
] as const;

export function buildRocketConfirmationWorkbook(input: {
  sourceRows: RocketPoCatalogRow[];
  confirmedRows: RocketPurchaseConfirmationResponse['rows'];
  now?: Date;
  /**
   * 쿠팡 실메타(센터·반품주소·가격 등, source.confirmation)가 없어도 그 칸을 빈칸으로 두고
   * 파일을 만든다(재고 기준 내보내기 전용). 정식 확정 흐름은 이 값을 켜지 않는다.
   */
  allowMissingConfirmation?: boolean;
}): RocketConfirmationWorkbookResult {
  const confirmedByLineId = new Map(input.confirmedRows.map((row) => [row.poLineId, row]));
  if (confirmedByLineId.size !== input.sourceRows.length) {
    throw new Error('Rocket confirmation rows do not match the collected source evidence.');
  }
  let confirmedQuantity = 0;
  let fullyConfirmedRows = 0;
  let shortRows = 0;
  const rows: (string | number)[][] = [Array.from(HEADER)];
  for (const source of input.sourceRows) {
    const confirmation = source.confirmation;
    const confirmed = confirmedByLineId.get(source.poLineId);
    if (!confirmation && !input.allowMissingConfirmation) {
      throw new Error('Rocket confirmation metadata is missing. Reload the order collector extension.');
    }
    if (!confirmed) {
      throw new Error('Rocket confirmation result is missing a collected PO line.');
    }
    confirmedQuantity += confirmed.confirmedQuantity;
    if (confirmed.confirmedQuantity < source.orderQty) shortRows += 1;
    else fullyConfirmedRows += 1;
    // 메타가 없으면(재고 기준 내보내기) 해당 칸은 빈칸으로.
    rows.push([
      source.poNumber,
      confirmation?.center ?? '',
      confirmation?.inboundType ?? '',
      confirmation?.poStatus ?? '',
      source.productNo,
      source.barcode,
      source.productName,
      source.orderQty,
      confirmed.confirmedQuantity,
      '',
      '',
      '',
      confirmed.shortageReason ?? '',
      confirmation?.returnManager ?? '',
      confirmation?.returnContact ?? '',
      confirmation?.returnAddress ?? '',
      confirmation?.purchasePrice ?? '',
      confirmation?.supplyPrice ?? '',
      confirmation?.vat ?? '',
      confirmation?.totalPurchase ?? '',
      source.plannedDeliveryDate.replaceAll('-', ''),
      confirmation?.poRegisteredAt ?? '',
      confirmation?.xdock ?? '',
    ]);
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), PRODUCT_SHEET);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(ROCKET_SHORTAGE_REASONS.map((reason) => [reason])),
    REASON_SHEET,
  );
  workbook.Workbook = {
    ...(workbook.Workbook ?? {}),
    Sheets: [
      { name: PRODUCT_SHEET, Hidden: 0 },
      { name: REASON_SHEET, Hidden: 1 },
    ],
  };
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const now = input.now ?? new Date();
  return {
    blob: new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName: `발주확정_${calendarStamp(now)}.xlsx`,
    summary: {
      totalRows: input.sourceRows.length,
      confirmedQuantity,
      fullyConfirmedRows,
      shortRows,
    },
  };
}

export function fillRocketConfirmationWorkbook(input: {
  template: ArrayBuffer;
  templateFileName: string;
  sourceRows: RocketPoCatalogRow[];
  confirmedRows: RocketPurchaseConfirmationResponse['rows'];
  now?: Date;
}): RocketConfirmationWorkbookResult {
  const confirmedByLineId = validateConfirmedRows(input.sourceRows, input.confirmedRows);
  const workbook = XLSX.read(input.template, { type: 'array', cellStyles: true });
  const sheet = workbook.Sheets[PRODUCT_SHEET];
  if (!sheet?.['!ref']) {
    throw new Error(`Rocket confirmation template is missing the ${PRODUCT_SHEET} sheet.`);
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  let headerRow = -1;
  let headerIndex = new Map<string, number>();
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const candidate = new Map<string, number>();
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const value = sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
      if (typeof value === 'string') candidate.set(value, column);
    }
    if (candidate.has('발주번호')) {
      headerRow = row;
      headerIndex = candidate;
      break;
    }
  }
  if (headerRow < 0) {
    throw new Error('Rocket confirmation template is missing the 발주번호 header.');
  }
  for (const header of TEMPLATE_MATCH_HEADERS) {
    if (!headerIndex.has(header)) {
      throw new Error(`Rocket confirmation template is missing the ${header} header.`);
    }
  }

  const poColumn = headerIndex.get('발주번호')!;
  const productColumn = headerIndex.get('상품번호')!;
  const barcodeColumn = headerIndex.get('상품바코드')!;
  const quantityColumn = headerIndex.get('확정수량')!;
  const reasonColumn = headerIndex.get('납품부족사유')!;
  const templateRowsByKey = new Map<string, number[]>();
  let templateRowCount = 0;
  for (let row = headerRow + 1; row <= range.e.r; row += 1) {
    const values = [poColumn, productColumn, barcodeColumn].map((column) =>
      sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v);
    if (values.every(isBlankCellValue)) continue;
    if (values.some(isBlankCellValue)) {
      throw new Error('Rocket confirmation template rows do not match the collected source evidence.');
    }
    const key = sourceMatchKey(values[0], values[1], values[2]);
    const rows = templateRowsByKey.get(key) ?? [];
    rows.push(row);
    templateRowsByKey.set(key, rows);
    templateRowCount += 1;
  }
  if (templateRowCount !== input.sourceRows.length) {
    throw new Error('Rocket confirmation template rows do not match the collected source evidence.');
  }

  const occurrenceByKey = new Map<string, number>();
  let confirmedQuantity = 0;
  let fullyConfirmedRows = 0;
  let shortRows = 0;
  for (const source of input.sourceRows) {
    const key = sourceMatchKey(source.poNumber, source.productNo, source.barcode);
    const occurrence = occurrenceByKey.get(key) ?? 0;
    occurrenceByKey.set(key, occurrence + 1);
    const templateRow = templateRowsByKey.get(key)?.[occurrence];
    const confirmed = confirmedByLineId.get(source.poLineId);
    if (templateRow === undefined || !confirmed) {
      throw new Error('Rocket confirmation template rows do not match the collected source evidence.');
    }
    writeTemplateCell(sheet, templateRow, quantityColumn, confirmed.confirmedQuantity);
    writeTemplateCell(sheet, templateRow, reasonColumn, confirmed.shortageReason ?? '');
    confirmedQuantity += confirmed.confirmedQuantity;
    if (confirmed.confirmedQuantity < source.orderQty) shortRows += 1;
    else fullyConfirmedRows += 1;
  }

  const bytes = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    cellStyles: true,
  }) as ArrayBuffer;
  const now = input.now ?? new Date();
  return {
    blob: new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName: `${templateFileStem(input.templateFileName)}_확정_${calendarStamp(now)}.xlsx`,
    summary: {
      totalRows: input.sourceRows.length,
      confirmedQuantity,
      fullyConfirmedRows,
      shortRows,
    },
  };
}

function validateConfirmedRows(
  sourceRows: RocketPoCatalogRow[],
  confirmedRows: RocketPurchaseConfirmationResponse['rows'],
): Map<string, RocketPurchaseConfirmationResponse['rows'][number]> {
  const confirmedByLineId = new Map(confirmedRows.map((row) => [row.poLineId, row]));
  if (
    confirmedRows.length !== sourceRows.length
    || confirmedByLineId.size !== sourceRows.length
    || sourceRows.some(({ poLineId }) => !confirmedByLineId.has(poLineId))
  ) {
    throw new Error('Rocket confirmation rows do not match the collected source evidence.');
  }
  return confirmedByLineId;
}

function isBlankCellValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function sourceMatchKey(poNumber: unknown, productNo: unknown, barcode: unknown): string {
  return JSON.stringify([String(poNumber), String(productNo), String(barcode)]);
}

function writeTemplateCell(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
  value: string | number,
): void {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const existing = sheet[address] ?? {};
  const { w: _formattedValue, ...preserved } = existing;
  sheet[address] = {
    ...preserved,
    t: typeof value === 'number' ? 'n' : 's',
    v: value,
  };
}

function templateFileStem(fileName: string): string {
  const stem = fileName.replace(/\.xlsx$/i, '') || '쿠팡_원본';
  return stem.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
}

function calendarStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
