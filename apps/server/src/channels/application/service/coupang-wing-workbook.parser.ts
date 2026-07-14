import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export type ParsedWingCatalogRow = {
  rowNumber: number;
  externalProductId: string;
  registeredName: string | null;
  displayName: string | null;
  category: string | null;
  manufacturer: string | null;
  brand: string | null;
  productStatus: string | null;
  externalSkuId: string;
  optionName: string | null;
  skuStatus: string | null;
  modelNumber: string | null;
  barcode: string | null;
  attributesJson: Array<{ type: string; value: string }>;
  rawJson: Record<string, unknown>;
};

export type ParsedWingCatalogSkippedRow = {
  rowNumber: number;
  reason: 'missing_product_id' | 'missing_sku_id';
  externalProductId: string | null;
  externalSkuId: string | null;
};

export type ParsedWingCatalogWorkbook = {
  rows: ParsedWingCatalogRow[];
  skippedRows: ParsedWingCatalogSkippedRow[];
  headers: string[];
};

export const MAX_COUPANG_WING_IMPORT_ROWS = 10_000;

const HEADER_SCAN_ROW_LIMIT = 20;
const PARENT_HEADERS = [
  '등록상품ID',
  '등록상품명',
  '쿠팡 노출상품명',
  '카테고리',
  '제조사',
  '브랜드',
  '승인상태',
] as const;
const SKU_HEADERS = [
  '옵션 ID',
  '등록 옵션명',
  '판매상태',
  '모델번호',
  '바코드',
] as const;
const REQUIRED_HEADERS = [...PARENT_HEADERS, ...SKU_HEADERS];

type ParentHeader = (typeof PARENT_HEADERS)[number];
type NormalizedParentField = Exclude<keyof ParsedWingCatalogRow,
  | 'rowNumber'
  | 'externalSkuId'
  | 'optionName'
  | 'skuStatus'
  | 'modelNumber'
  | 'barcode'
  | 'attributesJson'
  | 'rawJson'>;

const PARENT_FIELD_BY_HEADER: Record<ParentHeader, NormalizedParentField> = {
  등록상품ID: 'externalProductId',
  등록상품명: 'registeredName',
  '쿠팡 노출상품명': 'displayName',
  카테고리: 'category',
  제조사: 'manufacturer',
  브랜드: 'brand',
  승인상태: 'productStatus',
};

type ParentMetadata = Partial<Record<
  Exclude<NormalizedParentField, 'externalProductId'>,
  { value: string; rowNumber: number } | undefined
>>;

export function parseCoupangWingWorkbook(
  buffer: Buffer,
): ParsedWingCatalogWorkbook {
  const workbook = readWorkbook(buffer);
  const sheet = workbook.Sheets.Template;
  if (!sheet) {
    throw new BadRequestException('Coupang Wing Template 시트를 찾을 수 없습니다.');
  }

  repairWorksheetRef(sheet);
  const range = decodeWorksheetRange(sheet);
  if (!range) {
    throw new BadRequestException('Coupang Wing Template 시트가 비어 있습니다.');
  }

  const header = findHeaderRow(sheet, range);
  if (!header.hasRequiredHeaders) {
    const missing = REQUIRED_HEADERS.filter(
      (required) => !header.headersByColumn.includes(required),
    );
    throw new BadRequestException(
      `Coupang Wing 필수 컬럼을 찾을 수 없습니다: ${missing.join(', ') || REQUIRED_HEADERS.join(', ')}`,
    );
  }

  expandMergedParentCells(sheet, header.headersByColumn, header.row, range.e.r);

  const headers = header.headersByColumn.filter((value) => value.length > 0);
  const rows: ParsedWingCatalogRow[] = [];
  const skippedRows: ParsedWingCatalogWorkbook['skippedRows'] = [];
  const validationErrors: string[] = [];
  const optionRows = new Map<
    string,
    { rowNumber: number; externalProductId: string }
  >();
  const parentMetadata = new Map<string, ParentMetadata>();
  let sourceRowCount = 0;

  for (let row = header.row + 1; row <= range.e.r; row += 1) {
    const rawJson = rawRow(sheet, header.headersByColumn, range.s.c, row);
    if (!Object.values(rawJson).some(hasCellValue)) continue;
    sourceRowCount += 1;

    const rowNumber = row + 1;
    const externalProductId = cellText(rawJson['등록상품ID']).trim();
    const externalSkuId = cellText(rawJson['옵션 ID']).trim();

    if (!externalProductId) {
      skippedRows.push({
        rowNumber,
        reason: 'missing_product_id',
        externalProductId: null,
        externalSkuId: externalSkuId || null,
      });
      continue;
    }

    collectParentMetadataConflicts(
      externalProductId,
      rawJson,
      rowNumber,
      parentMetadata,
      validationErrors,
    );

    if (!externalSkuId) {
      skippedRows.push({
        rowNumber,
        reason: 'missing_sku_id',
        externalProductId,
        externalSkuId: null,
      });
      continue;
    }

    const previousOption = optionRows.get(externalSkuId);
    if (previousOption) {
      if (previousOption.externalProductId !== externalProductId) {
        validationErrors.push(
          `옵션 ID ${externalSkuId}가 ${previousOption.rowNumber}행과 ${rowNumber}행에서 서로 다른 등록상품에 속합니다`,
        );
      } else {
        validationErrors.push(
          `옵션 ID ${externalSkuId}가 ${previousOption.rowNumber}행과 ${rowNumber}행에 중복되어 있습니다`,
        );
      }
    } else {
      optionRows.set(externalSkuId, { rowNumber, externalProductId });
    }

    rows.push({
      rowNumber,
      externalProductId,
      registeredName: nullableText(rawJson['등록상품명']),
      displayName: nullableText(rawJson['쿠팡 노출상품명']),
      category: nullableText(rawJson['카테고리']),
      manufacturer: nullableText(rawJson['제조사']),
      brand: nullableText(rawJson['브랜드']),
      productStatus: nullableText(rawJson['승인상태']),
      externalSkuId,
      optionName: nullableText(rawJson['등록 옵션명']),
      skuStatus: nullableText(rawJson['판매상태']),
      modelNumber: nullableText(rawJson['모델번호']),
      barcode: nullableText(rawJson['바코드']),
      attributesJson: searchAttributes(rawJson),
      rawJson,
    });
  }

  if (sourceRowCount === 0) {
    throw new BadRequestException('Coupang Wing Template 시트가 비어 있습니다.');
  }
  if (rows.length > MAX_COUPANG_WING_IMPORT_ROWS) {
    throw new BadRequestException(
      `Coupang Wing 유효 행 수가 너무 많습니다. 최대 ${MAX_COUPANG_WING_IMPORT_ROWS}행까지 가져올 수 있습니다.`,
    );
  }
  if (validationErrors.length > 0) {
    throw new BadRequestException(
      `Coupang Wing 유효성 검사 실패: ${validationErrors.join('; ')}`,
    );
  }

  return { rows, skippedRows, headers };
}

function searchAttributes(
  rawJson: Record<string, unknown>,
): Array<{ type: string; value: string }> {
  const attributes: Array<{ type: string; value: string }> = [];
  for (let index = 1; index <= 100; index += 1) {
    const type = nullableText(rawJson[`검색옵션유형${index}`]);
    const value = nullableText(rawJson[`검색옵션값${index}`]);
    if (type && value) attributes.push({ type, value });
  }
  return attributes;
}

function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  try {
    return XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException('Coupang Wing workbook을 읽을 수 없습니다.');
  }
}

function repairWorksheetRef(sheet: XLSX.WorkSheet): void {
  let actualRange: XLSX.Range | null = null;
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue;
    let address: XLSX.CellAddress;
    try {
      address = XLSX.utils.decode_cell(key);
    } catch {
      continue;
    }
    if (address.r < 0 || address.c < 0) continue;
    if (!actualRange) {
      actualRange = { s: { ...address }, e: { ...address } };
      continue;
    }
    actualRange.s.r = Math.min(actualRange.s.r, address.r);
    actualRange.s.c = Math.min(actualRange.s.c, address.c);
    actualRange.e.r = Math.max(actualRange.e.r, address.r);
    actualRange.e.c = Math.max(actualRange.e.c, address.c);
  }
  if (!actualRange) return;

  const declaredRange = decodeWorksheetRange(sheet);
  const repairedRange = declaredRange
    ? {
        s: {
          r: Math.min(declaredRange.s.r, actualRange.s.r),
          c: Math.min(declaredRange.s.c, actualRange.s.c),
        },
        e: {
          r: Math.max(declaredRange.e.r, actualRange.e.r),
          c: Math.max(declaredRange.e.c, actualRange.e.c),
        },
      }
    : actualRange;
  sheet['!ref'] = XLSX.utils.encode_range(repairedRange);
}

function decodeWorksheetRange(sheet: XLSX.WorkSheet): XLSX.Range | null {
  if (!sheet['!ref']) return null;
  try {
    return XLSX.utils.decode_range(sheet['!ref']);
  } catch {
    return null;
  }
}

function findHeaderRow(
  sheet: XLSX.WorkSheet,
  range: XLSX.Range,
): {
  row: number;
  headersByColumn: string[];
  hasRequiredHeaders: boolean;
} {
  let fallback: { row: number; headersByColumn: string[] } | null = null;
  const scanEnd = Math.min(range.e.r, HEADER_SCAN_ROW_LIMIT - 1);
  for (let row = 0; row <= scanEnd; row += 1) {
    const headersByColumn = headersForRow(sheet, range, row);
    if (headersByColumn.some(Boolean)) fallback ??= { row, headersByColumn };
    if (REQUIRED_HEADERS.every((required) => headersByColumn.includes(required))) {
      return { row, headersByColumn, hasRequiredHeaders: true };
    }
  }
  return {
    row: fallback?.row ?? 0,
    headersByColumn: fallback?.headersByColumn ?? [],
    hasRequiredHeaders: false,
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

function expandMergedParentCells(
  sheet: XLSX.WorkSheet,
  headersByColumn: string[],
  headerRow: number,
  lastRow: number,
): void {
  const parentColumns = new Map<ParentHeader, number>();
  headersByColumn.forEach((header, offset) => {
    if (isParentHeader(header)) parentColumns.set(header, offset);
  });

  const continuationRowsByColumn = new Map<number, Set<number>>();
  for (const merge of sheet['!merges'] ?? []) {
    if (merge.e.r <= merge.s.r || merge.e.r <= headerRow) continue;
    for (const column of parentColumns.values()) {
      if (column < merge.s.c || column > merge.e.c) continue;
      const value = formattedCellText(sheet, merge.s.r, column);
      for (
        let row = Math.max(merge.s.r + 1, headerRow + 1);
        row <= Math.min(merge.e.r, lastRow);
        row += 1
      ) {
        const continuationRows = continuationRowsByColumn.get(column) ?? new Set();
        continuationRows.add(row);
        continuationRowsByColumn.set(column, continuationRows);
        setBlankCellText(sheet, row, column, value);
      }
    }
  }

  let currentParent: Partial<Record<ParentHeader, string>> | null = null;
  for (let row = headerRow + 1; row <= lastRow; row += 1) {
    const productColumn = parentColumns.get('등록상품ID');
    const productId = productColumn === undefined
      ? ''
      : formattedCellText(sheet, row, productColumn).trim();
    const productContinues = productColumn !== undefined &&
      continuationRowsByColumn.get(productColumn)?.has(row) === true;

    if (productId) {
      currentParent = parentValues(sheet, row, parentColumns);
    } else if (!productContinues) {
      currentParent = null;
    }

    if (!currentParent) continue;
    for (const [header, column] of parentColumns) {
      if (!continuationRowsByColumn.get(column)?.has(row)) continue;
      setBlankCellText(sheet, row, column, currentParent[header] ?? '');
    }
  }
}

function parentValues(
  sheet: XLSX.WorkSheet,
  row: number,
  parentColumns: Map<ParentHeader, number>,
): Partial<Record<ParentHeader, string>> {
  const values: Partial<Record<ParentHeader, string>> = {};
  for (const [header, column] of parentColumns) {
    const value = formattedCellText(sheet, row, column);
    if (value.trim()) values[header] = value;
  }
  return values;
}

function setBlankCellText(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
  value: string,
): void {
  if (!value.trim()) return;
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  if (formattedCellText(sheet, row, column).trim()) return;
  sheet[address] = { t: 's', v: value, w: value };
}

function rawRow(
  sheet: XLSX.WorkSheet,
  headersByColumn: string[],
  firstColumn: number,
  row: number,
): Record<string, unknown> {
  const rawJson: Record<string, unknown> = {};
  for (let offset = 0; offset < headersByColumn.length; offset += 1) {
    const header = headersByColumn[offset];
    if (!header) continue;
    rawJson[header] = formattedCellText(sheet, row, firstColumn + offset);
  }
  return rawJson;
}

function collectParentMetadataConflicts(
  externalProductId: string,
  rawJson: Record<string, unknown>,
  rowNumber: number,
  parentMetadata: Map<string, ParentMetadata>,
  validationErrors: string[],
): void {
  const existing = parentMetadata.get(externalProductId) ?? {};
  for (const header of PARENT_HEADERS) {
    if (header === '등록상품ID') continue;
    const value = nullableText(rawJson[header]);
    if (!value) continue;
    const field = PARENT_FIELD_BY_HEADER[header];
    if (field === 'externalProductId') continue;
    const previous = existing[field];
    if (previous && previous.value !== value) {
      validationErrors.push(
        `등록상품ID ${externalProductId}의 ${header} 값이 ${previous.rowNumber}행과 ${rowNumber}행에서 충돌합니다`,
      );
      continue;
    }
    existing[field] ??= { value, rowNumber };
  }
  parentMetadata.set(externalProductId, existing);
}

function formattedCellText(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
  if (!cell) return '';
  return cellText(cell.w ?? cell.v ?? '');
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ');
}

function nullableText(value: unknown): string | null {
  const normalized = cellText(value).trim();
  return normalized || null;
}

function cellText(value: unknown): string {
  return String(value ?? '');
}

function hasCellValue(value: unknown): boolean {
  return cellText(value).trim().length > 0;
}

function isParentHeader(value: string): value is ParentHeader {
  return (PARENT_HEADERS as readonly string[]).includes(value);
}
