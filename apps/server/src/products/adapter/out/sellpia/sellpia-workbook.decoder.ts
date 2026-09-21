import { ProductSourceInputError } from '../../../application/exception/product-source.error';
import { TextDecoder } from 'node:util';

import { SELLPIA_WORKBOOK_FORMAT_LABEL } from '@kiditem/shared/inventory';
import { SellpiaInventoryBrowserSnapshotSchema } from '@kiditem/shared/source-import';
import * as XLSX from 'xlsx';
import * as cpexcel from 'xlsx/dist/cpexcel';
import type {
  SellpiaInventoryQualityFact,
} from '../../../domain/policy/product-source-quality.policy';
import type {
  ParsedProductSourceArtifact,
  ParsedProductSourceRow,
} from '../../../application/port/out/source/sellpia-payload-decoder.port';

export const MAX_SELLPIA_PRODUCT_SOURCE_ROWS = 20_000;

const BROWSER_SNAPSHOT_HEADERS = [
  '상품코드',
  '상품명',
  '옵션명',
  '재고',
  '매입가',
  '바코드',
];

const REQUIRED_HEADERS = ['상품코드', '재고'];
const HEADER_SCAN_ROW_LIMIT = 20;
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const HEADER_ALIASES = new Map([
  ['상품코드', '상품코드'],
  ['상품명', '상품명'],
  ['옵션명', '옵션명'],
  ['재고', '재고'],
  ['매입가', '매입가'],
  ['자사상품코드', '자사상품코드'],
  ['바코드', '바코드'],
  ['모델명', '모델명'],
]);

XLSX.set_cptable(cpexcel);

type WorkbookCandidate = {
  headers: string[];
  rows: Array<{ rowNumber: number; rawJson: Record<string, unknown> }>;
  hasRequiredHeaders: boolean;
};

export function decodeSellpiaPayload(
  buffer: Buffer,
): ParsedProductSourceArtifact {
  if (firstNonWhitespaceByte(buffer) === 0x7b) {
    return decodeSellpiaBrowserSnapshot(buffer);
  }
  return decodeSellpiaWorkbook(buffer);
}

function decodeSellpiaBrowserSnapshot(
  buffer: Buffer,
): ParsedProductSourceArtifact {
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch {
    throw new ProductSourceInputError('Sellpia browser snapshot JSON을 읽을 수 없습니다.');
  }

  const parsed = parseBrowserSnapshot(input);
  if (!parsed.success) {
    throw new ProductSourceInputError('Sellpia browser snapshot 유효성 검사에 실패했습니다.');
  }

  const validationErrors: string[] = [];
  const sourceRows = parsed.data.rows;
  const rows = sourceRows.map((row, index) => {
    const sellpiaProductCode = `${row.productCode}-${row.optionCode}`;
    return normalizeRow({
      '상품코드': sellpiaProductCode,
      '원상품코드': row.productCode,
      '원옵션코드': row.optionCode,
      '상품명': row.name,
      '옵션명': row.optionName ?? '',
      '재고': row.currentStock,
      '매입가': row.purchasePrice ?? '',
      '바코드': row.barcode ?? '',
    }, index + 1, validationErrors);
  });
  collectDuplicateCodeErrors(rows, validationErrors);
  if (validationErrors.length > 0) {
    throw new ProductSourceInputError(
      `Sellpia browser snapshot 유효성 검사 실패: ${validationErrors.join('; ')}`,
    );
  }

  return {
    headers: BROWSER_SNAPSHOT_HEADERS,
    rows,
    qualityFacts: collectQualityFacts(rows),
  };
}

/**
 * Older browser bundles still validate snapshots with the shared schema's
 * legacy salePrice member. The source owner no longer reads or publishes that
 * field, so accept a missing member while those bundles roll forward. The
 * compatibility value exists only for schema validation and is discarded
 * before the source row contract is created.
 */
function parseBrowserSnapshot(input: unknown) {
  const parsed = SellpiaInventoryBrowserSnapshotSchema.safeParse(input);
  if (parsed.success) return parsed;

  if (!isRecord(input) || !Array.isArray(input.rows)) return parsed;
  const rows = input.rows;
  if (!rows.every((row) => isRecord(row) && !('salePrice' in row))) return parsed;

  return SellpiaInventoryBrowserSnapshotSchema.safeParse({
    ...input,
    rows: rows.map((row) => ({ ...row, salePrice: null })),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstNonWhitespaceByte(buffer: Buffer): number | null {
  for (const byte of buffer) {
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) return byte;
  }
  return null;
}

export function decodeSellpiaWorkbook(
  buffer: Buffer,
): ParsedProductSourceArtifact {
  const candidate = readWorkbookCandidate(buffer);
  if (!candidate.hasRequiredHeaders) {
    throw new ProductSourceInputError(
      `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 필수 컬럼을 찾을 수 없습니다. 필요한 컬럼: ${REQUIRED_HEADERS.join(', ')}. 감지된 컬럼: ${candidate.headers.join(', ') || '없음'}`,
    );
  }
  if (candidate.rows.length > MAX_SELLPIA_PRODUCT_SOURCE_ROWS) {
    throw new ProductSourceInputError(
      `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 행 수가 너무 많습니다. 최대 ${MAX_SELLPIA_PRODUCT_SOURCE_ROWS}행까지 가져올 수 있습니다.`,
    );
  }

  const validationErrors: string[] = [];
  const rows = candidate.rows.map(({ rowNumber, rawJson }) =>
    normalizeRow(rawJson, rowNumber, validationErrors),
  );
  collectDuplicateCodeErrors(rows, validationErrors);

  if (validationErrors.length > 0) {
    throw new ProductSourceInputError(
      `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 유효성 검사 실패: ${validationErrors.join('; ')}`,
    );
  }

  return {
    headers: candidate.headers,
    rows,
    qualityFacts: collectQualityFacts(rows),
  };
}

function collectQualityFacts(
  rows: ParsedProductSourceRow[],
): SellpiaInventoryQualityFact[] {
  const facts: SellpiaInventoryQualityFact[] = [];
  const rowsByBarcode = new Map<string, ParsedProductSourceRow[]>();
  for (const row of rows) {
    if (!row.name.trim()) {
      facts.push(fact('missing_name', row));
    }
    if (!row.barcode) {
      facts.push(fact('missing_barcode', row));
    } else {
      const matching = rowsByBarcode.get(row.barcode) ?? [];
      matching.push(row);
      rowsByBarcode.set(row.barcode, matching);
    }
    if (row.purchasePrice === null) {
      facts.push(fact('missing_price', row));
    }
  }
  for (const matching of rowsByBarcode.values()) {
    if (matching.length < 2) continue;
    facts.push(...matching.map((row) => fact('duplicate_barcode', row)));
  }
  return facts;
}

function fact(
  code: SellpiaInventoryQualityFact['code'],
  row: ParsedProductSourceRow,
): SellpiaInventoryQualityFact {
  return {
    code,
    rowNumber: row.rowNumber,
    productCode: row.sellpiaProductCode,
  };
}

function readWorkbookCandidate(buffer: Buffer): WorkbookCandidate {
  let firstCandidate: WorkbookCandidate | null = null;
  let foundWorkbookWithoutSheet = false;

  for (const readWorkbook of workbookReadAttempts(buffer)) {
    let workbook: XLSX.WorkBook;
    try {
      workbook = readWorkbook();
    } catch {
      continue;
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      foundWorkbookWithoutSheet = true;
      continue;
    }

    const candidate = sheetToCandidate(sheet);
    firstCandidate ??= candidate;
    if (candidate.hasRequiredHeaders) return candidate;
  }

  if (firstCandidate) return firstCandidate;
  if (foundWorkbookWithoutSheet) {
    throw new ProductSourceInputError(
      `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 시트가 없습니다.`,
    );
  }
  throw new ProductSourceInputError(
    `Sellpia ${SELLPIA_WORKBOOK_FORMAT_LABEL} 파일을 읽을 수 없습니다.`,
  );
}

function workbookReadAttempts(buffer: Buffer): Array<() => XLSX.WorkBook> {
  return [
    () => XLSX.read(buffer, { type: 'buffer' }),
    () => XLSX.read(buffer, { type: 'buffer', codepage: 949 }),
    ...delimitedTextCandidates(buffer).map((text) => () =>
      XLSX.read(text, { type: 'string' }),
    ),
  ];
}

function sheetToCandidate(sheet: XLSX.WorkSheet): WorkbookCandidate {
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  if (!range) return { headers: [], rows: [], hasRequiredHeaders: false };

  let fallbackHeaderRow: number | null = null;
  let requiredHeaderRow: number | null = null;
  const scanEnd = Math.min(range.e.r, range.s.r + HEADER_SCAN_ROW_LIMIT - 1);

  for (let row = range.s.r; row <= scanEnd; row += 1) {
    const headers = headersForRow(sheet, range, row);
    if (headers.some(Boolean)) fallbackHeaderRow ??= row;
    if (REQUIRED_HEADERS.every((required) => headers.includes(required))) {
      requiredHeaderRow = row;
      break;
    }
  }

  const headerRow = requiredHeaderRow ?? fallbackHeaderRow;
  if (headerRow === null) {
    return { headers: [], rows: [], hasRequiredHeaders: false };
  }

  const headersByColumn = headersForRow(sheet, range, headerRow);
  const headers = headersByColumn.filter(Boolean);
  const rows: WorkbookCandidate['rows'] = [];

  for (let row = headerRow + 1; row <= range.e.r; row += 1) {
    const rawJson: Record<string, unknown> = {};
    let hasValue = false;
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = headersByColumn[column - range.s.c];
      if (!header) continue;
      const value = formattedCellText(sheet, row, column);
      rawJson[header] = value;
      if (value.trim()) hasValue = true;
    }
    if (hasValue) rows.push({ rowNumber: row + 1, rawJson });
  }

  return {
    headers,
    rows,
    hasRequiredHeaders: requiredHeaderRow !== null,
  };
}

function headersForRow(
  sheet: XLSX.WorkSheet,
  range: XLSX.Range,
  row: number,
): string[] {
  const headers: string[] = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    headers.push(normalizeHeader(formattedCellText(sheet, row, column)));
  }
  return headers;
}

function formattedCellText(sheet: XLSX.WorkSheet, row: number, column: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
  if (!cell) return '';
  const value = cell.w ?? cell.v ?? '';
  return unwrapExcelTextFormula(String(value));
}

function normalizeHeader(value: string): string {
  const trimmed = value.replace(/^\uFEFF/, '').trim();
  return HEADER_ALIASES.get(trimmed.replace(/\s+/g, '')) ?? trimmed;
}

function normalizeRow(
  rawJson: Record<string, unknown>,
  rowNumber: number,
  validationErrors: string[],
): ParsedProductSourceRow {
  const sellpiaProductCode = cellText(rawJson['상품코드']).trim();
  if (!sellpiaProductCode) {
    validationErrors.push(`${rowNumber}행 상품코드가 비어 있습니다`);
  }

  const currentStock = requiredNonnegativeInteger(
    rawJson['재고'],
    rowNumber,
    '재고',
    validationErrors,
  );
  const purchasePrice = optionalNonnegativeInteger(
    rawJson['매입가'],
    rowNumber,
    '매입가',
    validationErrors,
  );
  return {
    rowNumber,
    sellpiaProductCode,
    sourceProductCode: sourceProductCode(sellpiaProductCode, rawJson),
    sourceOptionCode: sourceOptionCode(sellpiaProductCode, rawJson),
    name: nullableCellText(rawJson['상품명']) ?? sellpiaProductCode,
    optionName: nullableCellText(rawJson['옵션명']),
    barcode: matchingIdentifier(rawJson),
    currentStock: currentStock ?? 0,
    purchasePrice,
  };
}

function sourceProductCode(
  sellpiaProductCode: string,
  rawJson: Record<string, unknown>,
): string {
  const explicit = nullableCellText(rawJson['원상품코드']);
  if (explicit) return explicit;
  const separator = sellpiaProductCode.lastIndexOf('-');
  return separator > 0 ? sellpiaProductCode.slice(0, separator) : sellpiaProductCode;
}

function sourceOptionCode(
  sellpiaProductCode: string,
  rawJson: Record<string, unknown>,
): string {
  const explicit = nullableCellText(rawJson['원옵션코드']);
  if (explicit) return explicit;
  const separator = sellpiaProductCode.lastIndexOf('-');
  return separator > 0 ? sellpiaProductCode.slice(separator + 1) : '';
}

function collectDuplicateCodeErrors(
  rows: ParsedProductSourceRow[],
  validationErrors: string[],
): void {
  const rowNumbersByCode = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.sellpiaProductCode) continue;
    const rowNumbers = rowNumbersByCode.get(row.sellpiaProductCode) ?? [];
    rowNumbers.push(row.rowNumber);
    rowNumbersByCode.set(row.sellpiaProductCode, rowNumbers);
  }
  for (const [code, rowNumbers] of rowNumbersByCode) {
    if (rowNumbers.length > 1) {
      validationErrors.push(
        `상품코드 ${code}가 ${rowNumbers.join(', ')}행에 중복되어 있습니다`,
      );
    }
  }
}

function requiredNonnegativeInteger(
  value: unknown,
  rowNumber: number,
  field: string,
  validationErrors: string[],
): number | null {
  const parsed = parseInteger(value);
  if (parsed === null || parsed < 0 || parsed > POSTGRES_INTEGER_MAX) {
    validationErrors.push(
      `${rowNumber}행 ${field}는 0 이상 2,147,483,647 이하의 정수여야 합니다`,
    );
    return null;
  }
  return parsed;
}

function optionalNonnegativeInteger(
  value: unknown,
  rowNumber: number,
  field: string,
  validationErrors: string[],
): number | null {
  if (!cellText(value).trim()) return null;
  return requiredNonnegativeInteger(value, rowNumber, field, validationErrors);
}

function parseInteger(value: unknown): number | null {
  const normalized = cellText(value).trim().replace(/,/g, '');
  if (!/^-?\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function matchingIdentifier(rawJson: Record<string, unknown>): string | null {
  for (const field of ['모델명', '바코드', '자사상품코드']) {
    const digits = cellText(rawJson[field]).replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 14) return digits;
  }
  return null;
}

function cellText(value: unknown): string {
  return unwrapExcelTextFormula(String(value ?? ''));
}

function nullableCellText(value: unknown): string | null {
  const normalized = cellText(value).trim();
  return normalized || null;
}

function unwrapExcelTextFormula(value: string): string {
  const match = /^=\s*"([\s\S]*)"$/.exec(value.trim());
  return match ? match[1].replace(/""/g, '"') : value;
}

function delimitedTextCandidates(buffer: Buffer): string[] {
  if (looksBinary(buffer)) return [];
  const utf8 = stripBom(buffer.toString('utf8'));
  const eucKr = stripBom(new TextDecoder('euc-kr').decode(buffer));
  return [...new Set([utf8, eucKr])].filter(looksLikeSellpiaDelimitedText);
}

function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 512).includes(0);
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function looksLikeSellpiaDelimitedText(value: string): boolean {
  return value
    .split(/\r?\n/, HEADER_SCAN_ROW_LIMIT)
    .some((line) => /[,;\t]/.test(line) && /상품\s*코드/.test(line) && /재\s*고/.test(line));
}
