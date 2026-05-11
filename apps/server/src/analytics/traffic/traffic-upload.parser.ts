import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { TextDecoder } from 'util';

import type { MulterFile } from '../../common/types';

export type TrafficDetectedColumns = Record<
  | 'productId'
  | 'visitors'
  | 'views'
  | 'cart'
  | 'orders'
  | 'salesQty'
  | 'revenue'
  | 'date',
  string | null
>;

export interface ParsedUploadRow {
  raw: Record<string, unknown>;
  listingId: string | null;
  externalId: string | null;
  date: string | null;
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  matchStatus: 'matched' | 'unmatched';
  matchReason: string | null;
}

export interface ParsedTrafficUpload {
  rows: ParsedUploadRow[];
  skipped: number;
  rowCount: number;
  detectedColumns: TrafficDetectedColumns;
}

export function parseTrafficUploadFile({
  file,
  listingMap,
  todayStr,
}: {
  file: MulterFile;
  listingMap: Map<string, string>;
  todayStr: string;
}): ParsedTrafficUpload {
  const workbook = readTrafficWorkbook(file);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  if (rows.length === 0) {
    throw new BadRequestException('데이터가 없습니다');
  }

  const keys = Object.keys(rows[0]);
  const detectedColumns = detectTrafficColumns(keys);

  if (!detectedColumns.productId) {
    throw new BadRequestException(
      `등록상품ID 컬럼을 찾을 수 없습니다. 감지된 컬럼: ${keys.join(', ')}`,
    );
  }

  const parsed = parseUploadRows({
    rows,
    detectedColumns,
    listingMap,
    todayStr,
  });

  return {
    ...parsed,
    rowCount: rows.length,
    detectedColumns,
  };
}

function readTrafficWorkbook(file: MulterFile): XLSX.WorkBook {
  const isCsv =
    file.mimetype === 'text/csv' || /\.csv$/i.test(file.originalname);
  if (!isCsv) return XLSX.read(file.buffer, { type: 'buffer' });
  return XLSX.read(selectCsvText(file.buffer), { type: 'string' });
}

function selectCsvText(buffer: Buffer): string {
  const utf8 = stripBom(buffer.toString('utf8'));
  if (looksLikeTrafficCsv(utf8)) return utf8;

  const eucKr = stripBom(new TextDecoder('euc-kr').decode(buffer));
  if (looksLikeTrafficCsv(eucKr)) return eucKr;

  return utf8;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeTrafficCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return /등록상품\s*ID|등록상품ID|sellerProductId/i.test(firstLine);
}

function detectTrafficColumns(keys: string[]): TrafficDetectedColumns {
  function findCol(...candidates: string[]): string | null {
    for (const c of candidates) {
      const found = keys.find((k) => k === c);
      if (found) return found;
    }
    for (const c of candidates) {
      const found = keys.find(
        (k) => k.includes(c) && !k.includes('전환') && !k.includes('총'),
      );
      if (found) return found;
    }
    return null;
  }

  return {
    productId: findCol('등록상품ID', '등록상품 ID', 'sellerProductId'),
    visitors: findCol('방문자'),
    views:
      keys.find((k) => k === '조회') ||
      keys.find((k) => k === '조회수') ||
      null,
    cart: findCol('장바구니'),
    orders:
      keys.find((k) => k === '주문') ||
      keys.find((k) => k === '주문수') ||
      null,
    salesQty: findCol('판매량', '판매수량'),
    revenue:
      keys.find((k) => k === '매출(원)') ||
      keys.find((k) => k === '매출') ||
      null,
    date: findCol('날짜', '기간', '일자'),
  };
}

function parseUploadRows({
  rows,
  detectedColumns,
  listingMap,
  todayStr,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  detectedColumns: TrafficDetectedColumns;
  listingMap: Map<string, string>;
  todayStr: string;
}) {
  const parsedRows: ParsedUploadRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    const cpId = String(row[detectedColumns.productId ?? ''] || '').trim();
    if (!cpId) {
      skipped++;
      parsedRows.push({
        raw: row,
        listingId: null,
        externalId: null,
        date: null,
        visitors: 0,
        views: 0,
        cartAdds: 0,
        orders: 0,
        salesQty: 0,
        revenue: 0,
        matchStatus: 'unmatched',
        matchReason: 'missing-external-id',
      });
      continue;
    }

    const listingId = listingMap.get(cpId);
    if (!listingId) {
      skipped++;
      parsedRows.push({
        raw: row,
        listingId: null,
        externalId: cpId,
        date: null,
        visitors: 0,
        views: 0,
        cartAdds: 0,
        orders: 0,
        salesQty: 0,
        revenue: 0,
        matchStatus: 'unmatched',
        matchReason: 'unmatched-listing',
      });
      continue;
    }

    const date = detectedColumns.date
      ? String(row[detectedColumns.date] || todayStr).slice(0, 10)
      : todayStr;

    parsedRows.push({
      raw: row,
      listingId,
      externalId: cpId,
      date,
      visitors: parseNum(
        detectedColumns.visitors ? row[detectedColumns.visitors] : 0,
      ),
      views: parseNum(detectedColumns.views ? row[detectedColumns.views] : 0),
      cartAdds: parseNum(detectedColumns.cart ? row[detectedColumns.cart] : 0),
      orders: parseNum(
        detectedColumns.orders ? row[detectedColumns.orders] : 0,
      ),
      salesQty: parseNum(
        detectedColumns.salesQty ? row[detectedColumns.salesQty] : 0,
      ),
      revenue: parseNum(
        detectedColumns.revenue ? row[detectedColumns.revenue] : 0,
      ),
      matchStatus: 'matched',
      matchReason: null,
    });
  }

  return { rows: parsedRows, skipped };
}

function parseNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(String(val).replace(/[,%]/g, ''));
  return isNaN(n) ? 0 : n;
}
