import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export type SellpiaParseWarning = 'duplicate_code' | 'invalid_stock' | 'missing_product_code';

export type ParsedSellpiaRow = {
  rowNumber: number;
  sellpiaProductCode: string;
  sellpiaProductName: string | null;
  sellpiaStock: number;
  safetyStock: number;
  ownProductCode: string | null;
  barcode: string | null;
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

export function parseSellpiaWorkbook(buffer: Buffer): ParsedSellpiaWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException('Sellpia 엑셀 파일을 읽을 수 없습니다.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) throw new BadRequestException('Sellpia 엑셀 시트가 없습니다.');

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  const headers = (aoa[0] ?? []).map((cell) => String(cell ?? '').trim()).filter(Boolean);
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  if (records.length === 0) throw new BadRequestException('Sellpia 엑셀 파일이 비어 있습니다.');
  if (records.length > MAX_SELLPIA_IMPORT_ROWS) {
    throw new BadRequestException('Sellpia 엑셀 행 수가 너무 많습니다.');
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

function normalizeRow(record: Record<string, unknown>, rowNumber: number): ParsedSellpiaRow {
  const warnings: SellpiaParseWarning[] = [];
  const sellpiaProductCode = text(record['상품코드']);
  if (!sellpiaProductCode) warnings.push('missing_product_code');
  const stock = integer(record['재고']);
  if (stock === null || stock < 0) warnings.push('invalid_stock');

  return {
    rowNumber,
    sellpiaProductCode,
    sellpiaProductName: nullableText(record['상품명']),
    sellpiaStock: stock !== null && stock >= 0 ? stock : 0,
    safetyStock: Math.max(integer(record['안전재고']) ?? 0, 0),
    ownProductCode: nullableText(record['자사상품코드']),
    barcode: nullableText(record['바코드']),
    modelName: nullableText(record['모델명']),
    warnings,
    raw: record,
  };
}

function text(value: unknown): string {
  return String(value ?? '').trim();
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
