import { Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';

export type CoupangWingInventoryExportProduct = Record<string, unknown>;

export type CoupangWingInventoryExportResult = {
  buffer: Buffer;
  fileName: string;
  contentType: 'application/vnd.ms-excel;charset=utf-8';
  rowCount: number;
  columns: string[];
};

/**
 * The popup's inventory export is a transient file operation.  Keep its
 * historical SpreadsheetML/HTML shape byte-for-byte compatible with the
 * browser export while moving the conversion boundary to the authenticated
 * server.  This deliberately does not create a catalog import or source run.
 */
@Injectable()
export class CoupangWingInventoryExportService {
  convert(
    products: unknown,
    now: Date = new Date(),
    requestedFileName?: string,
  ): CoupangWingInventoryExportResult {
    if (!Array.isArray(products) || products.length === 0) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'WING_PRODUCTS_REQUIRED' }, message: '다운로드할 Wing 상품이 없습니다.' });
    }
    if (requestedFileName !== undefined && !/^wing-inventory_\d{4}-\d{2}-\d{2}_\d{2}\.\d{2}\.xls$/.test(requestedFileName)) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'WING_FILE_NAME_INVALID' }, message: 'Wing 상품목록 파일명이 유효하지 않습니다.' });
    }

    const rows = products.map((product, index) => {
      if (!isRecord(product)) {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'WING_PRODUCT_ROW_INVALID', row: index + 1 }, message: `Wing 상품 행 ${index + 1}이 유효하지 않습니다.` });
      }
      return product;
    });
    const columns = orderedColumns(rows);
    const html = workbookHtml(rows, columns);
    const timestamp = formatTimestamp(now);

    return {
      buffer: Buffer.from(`\uFEFF${html}`, 'utf8'),
      fileName: requestedFileName ?? `wing-inventory_${timestamp}.xls`,
      contentType: 'application/vnd.ms-excel;charset=utf-8',
      rowCount: rows.length,
      columns,
    };
  }
}

function isRecord(value: unknown): value is CoupangWingInventoryExportProduct {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function orderedColumns(
  products: CoupangWingInventoryExportProduct[],
): string[] {
  const keys = new Set<string>();
  for (const product of products) {
    for (const key of Object.keys(product)) keys.add(key);
  }

  const priority = ['등록상품ID', '이미지URL'];
  return [
    ...priority.filter((key) => keys.has(key)),
    ...Array.from(keys).filter((key) => !priority.includes(key)),
  ];
}

function workbookHtml(
  products: CoupangWingInventoryExportProduct[],
  columns: string[],
): string {
  const cells = (tag: 'th' | 'td', style: string, values: unknown[]) =>
    values.map((value) => `<${tag} style="${style}">${escapeCell(value)}</${tag}>`).join('');

  const header = cells(
    'th',
    'background:#f0f0f0;font-weight:bold;padding:4px 8px;',
    columns,
  );
  const body = products
    .map((product) => cells(
      'td',
      'padding:4px 8px;',
      columns.map((column) => product[column]),
    ))
    .map((row) => `<tr>${row}</tr>`)
    .join('');

  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">'
    + '<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>상품목록</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>'
    + `<body><table border="1"><tr>${header}</tr>${body}</table></body></html>`;
}

function escapeCell(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimestamp(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}_${pad(value.getHours())}.${pad(value.getMinutes())}`;
}
