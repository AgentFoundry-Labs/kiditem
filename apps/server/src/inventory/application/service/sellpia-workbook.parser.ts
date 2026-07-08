import { BadRequestException } from '@nestjs/common';
import { SELLPIA_WORKBOOK_FORMAT_LABEL } from '@kiditem/shared/inventory';
import * as XLSX from 'xlsx';
import * as cpexcel from 'xlsx/dist/cpexcel';
import { TextDecoder } from 'node:util';

export type SellpiaParseWarning =
  | 'duplicate_code'
  | 'invalid_stock'
  | 'missing_product_code'
  | 'missing_product_name';

export type ParsedSellpiaRow = {
  rowNumber: number;
  sellpiaProductCode: string;
  sellpiaProductName: string | null;
  sellpiaStock: number;
  safetyStock: number;
  ownProductCode: string | null;
  barcode: string | null;
  sourceBarcode: string | null;
  modelName: string | null;
  warnings: SellpiaParseWarning[];
  raw: Record<string, unknown>;
};

export type ParsedSellpiaWorkbook = {
  rows: ParsedSellpiaRow[];
  ignoredColumns: string[];
  headers: string[];
};

export const MAX_SELLPIA_IMPORT_ROWS = 20_000;

const IGNORED_COLUMNS = ['상품분류', '품절', '품절일', '단종', '단종일'];
const REQUIRED_COLUMNS = ['상품코드', '재고'];
const SELLPIA_HEADER_ALIASES = new Map([
  ['상품코드', '상품코드'],
  ['상품명', '상품명'],
  ['재고', '재고'],
  ['안전재고', '안전재고'],
  ['자사상품코드', '자사상품코드'],
  ['바코드', '바코드'],
  ['모델명', '모델명'],
  ['상품분류', '상품분류'],
  ['품절', '품절'],
  ['품절일', '품절일'],
  ['단종', '단종'],
  ['단종일', '단종일'],
]);

XLSX.set_cptable(cpexcel);

export function parseSellpiaWorkbook(buffer: Buffer): ParsedSellpiaWorkbook {
  const { headers, records } = readSellpiaWorkbook(buffer);
  if (records.length === 0) {
    throw new BadRequestException(`Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 파일이 비어 있습니다.`);
  }
  if (!hasRequiredColumns(headers)) {
    throw new BadRequestException(
      `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 필수 컬럼을 찾을 수 없습니다. 필요한 컬럼: ${REQUIRED_COLUMNS.join(', ')}. 감지된 컬럼: ${formatDetectedColumns(headers)}`,
    );
  }
  if (records.length > MAX_SELLPIA_IMPORT_ROWS) {
    throw new BadRequestException(`Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 행 수가 너무 많습니다.`);
  }

  const rows = records.map((record, index) => normalizeRow(record, index + 2));
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.sellpiaProductCode) continue;
    counts.set(row.sellpiaProductCode, (counts.get(row.sellpiaProductCode) ?? 0) + 1);
  }
  for (const row of rows) {
    if (row.sellpiaProductCode && (counts.get(row.sellpiaProductCode) ?? 0) > 1) {
      row.warnings.push('duplicate_code');
    }
  }

  return { rows, ignoredColumns: IGNORED_COLUMNS, headers };
}

type WorkbookCandidate = {
  headers: string[];
  records: Record<string, unknown>[];
};

function readSellpiaWorkbook(buffer: Buffer): WorkbookCandidate {
  let firstCandidate: WorkbookCandidate | null = null;
  let foundWorkbookWithoutSheet = false;

  for (const readWorkbook of workbookReadAttempts(buffer)) {
    let workbook: XLSX.WorkBook;
    try {
      workbook = readWorkbook();
    } catch {
      continue;
    }

    const firstSheetName = workbook.SheetNames[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    if (!sheet) {
      foundWorkbookWithoutSheet = true;
      continue;
    }

    const candidate = sheetToCandidate(sheet);
    firstCandidate ??= candidate;
    if (hasRequiredColumns(candidate.headers)) return candidate;
  }

  if (firstCandidate) return firstCandidate;
  if (foundWorkbookWithoutSheet) {
    throw new BadRequestException(`Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 시트가 없습니다.`);
  }
  throw new BadRequestException(`Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 파일을 읽을 수 없습니다.`);
}

function workbookReadAttempts(buffer: Buffer): Array<() => XLSX.WorkBook> {
  return [
    () => XLSX.read(buffer, { type: 'buffer' }),
    () => XLSX.read(buffer, { type: 'buffer', codepage: 949 }),
    ...delimitedTextCandidates(buffer).map((text) => () => XLSX.read(text, { type: 'string' })),
  ];
}

function sheetToCandidate(sheet: XLSX.WorkSheet): WorkbookCandidate {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  const headers = (aoa[0] ?? []).map(normalizeHeader).filter(Boolean);
  const records = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    })
    .map(normalizeRecordKeys);

  return { headers, records };
}

function delimitedTextCandidates(buffer: Buffer): string[] {
  if (looksBinary(buffer)) return [];

  const utf8 = stripBom(buffer.toString('utf8'));
  const eucKr = stripBom(new TextDecoder('euc-kr').decode(buffer));
  return uniqueStrings([utf8, eucKr]).filter(looksLikeSellpiaDelimitedText);
}

function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 512).includes(0);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeSellpiaDelimitedText(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return /[,;\t]/.test(firstLine) && /상품\s*코드|상품코드|재고/i.test(firstLine);
}

function normalizeRecordKeys(record: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey) continue;
    normalized[normalizedKey] = value;
  }
  return normalized;
}

function normalizeHeader(value: unknown): string {
  const header = String(value ?? '').replace(/^\uFEFF/, '').trim();
  return SELLPIA_HEADER_ALIASES.get(header.replace(/\s+/g, '')) ?? header;
}

function hasRequiredColumns(headers: string[]): boolean {
  return REQUIRED_COLUMNS.every((column) => headers.includes(column));
}

function formatDetectedColumns(headers: string[]): string {
  return headers.slice(0, 12).join(', ') || '없음';
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeRow(record: Record<string, unknown>, rowNumber: number): ParsedSellpiaRow {
  const warnings: SellpiaParseWarning[] = [];
  const sellpiaProductCode = text(record['상품코드']);
  if (!sellpiaProductCode) warnings.push('missing_product_code');
  const sellpiaProductName = nullableText(record['상품명']);
  if (!sellpiaProductName) warnings.push('missing_product_name');
  const stock = integer(record['재고']);
  if (stock === null || stock < 0) warnings.push('invalid_stock');
  const ownProductCode = nullableText(record['자사상품코드']);
  const barcode = nullableText(record['바코드']);
  const modelName = nullableText(record['모델명']);
  const sourceBarcode =
    barcodeLike(ownProductCode) ?? barcodeLike(barcode) ?? barcodeLike(modelName);

  return {
    rowNumber,
    sellpiaProductCode,
    sellpiaProductName,
    sellpiaStock: stock !== null && stock >= 0 ? stock : 0,
    safetyStock: Math.max(integer(record['안전재고']) ?? 0, 0),
    ownProductCode,
    barcode,
    sourceBarcode,
    modelName,
    warnings,
    raw: record,
  };
}

function text(value: unknown): string {
  return unwrapExcelTextFormula(String(value ?? '').trim()).trim();
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized ? normalized : null;
}

function integer(value: unknown): number | null {
  const normalized = text(value).replace(/,/g, '');
  if (!/^-?\d+$/.test(normalized)) return null;
  return Number(normalized);
}

function barcodeLike(value: string | null): string | null {
  return value && /^\d{13}$/.test(value) ? value : null;
}

function unwrapExcelTextFormula(value: string): string {
  const match = /^=\s*"([\s\S]*)"$/.exec(value);
  return match ? match[1].replace(/""/g, '"') : value;
}
