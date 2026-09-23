import * as XLSX from 'xlsx';
import type { SabangnetImportIssue, SabangnetWorkbookKind } from '@kiditem/shared/sales-product';

/**
 * 사방넷에서 내려받은 상품 엑셀을 읽는다(ADR-0014, KID-264).
 *
 * - `products`: 사방넷상품대량수정 수정파일 · 사방넷상품대량등록 샘플 양식(품번코드가 없으면 자체상품코드가 키).
 * - `options`: 사방넷단품대량수정 수정파일(단품코드 · 옵션상세명칭 · 추가금액 · 공급상태).
 * - `channel_overrides`: 쇼핑몰별별도정보관리 수정파일(쇼핑몰코드 · 쇼핑몰 판매가 · 쇼핑몰 상품명 …).
 * - `send_records`: 쇼핑몰상품수정 다운로드(몰 × 상품 송신 기록 — 쇼핑몰상품코드 · 부가정보코드 · 카테고리코드).
 * - `mall_categories` · `mall_templates`: 쇼핑몰카테고리 · 쇼핑몰부가정보 수정파일(송신 기록의 코드가 가리키는 것).
 *
 * 칸은 머리 이름으로 찾는다(열 순서가 파일마다 다르다). 머리 다음 줄이 '▶' 설명이면 건너뛴다.
 */

export const SABANGNET_WORKBOOK_ROW_LIMIT = 20_000;

import type { SabangnetProductRow, SabangnetOptionRow, SabangnetChannelOverrideRow, SabangnetSendRecordRow, SabangnetMallCategoryRow, SabangnetMallTemplateRow, ParsedSabangnetWorkbook } from '../../../../application/port/out/documents/channel-document.models';
export type { SabangnetProductRow, SabangnetOptionRow, SabangnetChannelOverrideRow, SabangnetSendRecordRow, SabangnetMallCategoryRow, SabangnetMallTemplateRow, ParsedSabangnetWorkbook } from '../../../../application/port/out/documents/channel-document.models';

import { ChannelIntegrityAdapter } from '../../integrity/channel-integrity.adapter';
import { sabangnetDetailDigests, type SabangnetDetailDigests } from '../../../../domain/sales-product/sales-product-reimport-merge';

export class SabangnetWorkbookFormatError extends Error {}

/** 머리 이름을 비교하기 좋게: '[수정불가]' 와 모든 공백을 뺀다. */
export function normalizeSabangnetHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\[수정불가\]/g, '')
    .replace(/\s+/g, '');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).replace(/^'/, '').trim();
}

function textOrNull(value: unknown): string | null {
  const text = cellText(value);
  return text ? text : null;
}

/** 금액 · 수량 칸: 사방넷은 980.0 · '65000 모양으로 준다. 비어 있으면 null. */
export function sabangnetNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const text = String(value).replace(/^'/, '').replace(/,/g, '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** 사방넷 적용율(%)을 가격 계약에서 쓰는 만분율로 바꾼다. */
function sabangnetPriceRateBp(value: unknown): number | null {
  const rate = sabangnetNumber(value);
  if (rate === null) return null;
  // Existing exports use a percentage (for example 104), while the domain
  // contract stores 10400. Keep already-normalized legacy rows intact too.
  return Math.abs(rate) <= 1_000 ? rate * 100 : rate;
}

function splitList(value: unknown): string[] {
  return cellText(value).split(',').map((part) => part.trim()).filter(Boolean);
}

interface SheetTable {
  headers: string[];
  dataRows: { row: number; cells: unknown[] }[];
}

function readTable(buffer: Buffer): SheetTable {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    throw new SabangnetWorkbookFormatError('엑셀 파일을 읽지 못했습니다.');
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) throw new SabangnetWorkbookFormatError('엑셀에 시트가 없습니다.');
  // 사방넷 파일은 시트 범위(`!ref`)를 첫 몇 줄로만 적어 둔다 — 실제 칸으로 범위를 다시 잡는다.
  sheet['!ref'] = recomputeSheetRange(sheet) ?? sheet['!ref'];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  const headerIndex = matrix.slice(0, 6).findIndex((cells) =>
    cells.some((cell) => {
      const header = normalizeSabangnetHeader(cell);
      return header === '상품명' || header === '사방넷상품코드' || header === '쇼핑몰코드'
        || header === '카테고리코드' || header === '부가정보코드';
    }));
  if (headerIndex < 0) throw new SabangnetWorkbookFormatError('사방넷 엑셀 머리 줄을 찾지 못했습니다.');
  const headers = (matrix[headerIndex] ?? []).map(normalizeSabangnetHeader);
  let start = headerIndex + 1;
  const next = matrix[start];
  if (next && cellText(next[0]).startsWith('▶')) start += 1;
  const dataRows = matrix.slice(start)
    .map((cells, index) => ({ row: start + index + 1, cells }))
    .filter(({ cells }) => cells.some((cell) => cellText(cell) !== ''));
  if (dataRows.length > SABANGNET_WORKBOOK_ROW_LIMIT) {
    throw new SabangnetWorkbookFormatError(`한 파일에 ${SABANGNET_WORKBOOK_ROW_LIMIT.toLocaleString()}줄까지 받습니다.`);
  }
  return { headers, dataRows };
}

export function recomputeSheetRange(sheet: XLSX.WorkSheet): string | null {
  let maxRow = -1;
  let maxCol = -1;
  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) continue;
    const cell = XLSX.utils.decode_cell(address);
    if (cell.r > maxRow) maxRow = cell.r;
    if (cell.c > maxCol) maxCol = cell.c;
  }
  if (maxRow < 0 || maxCol < 0) return null;
  return XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
}

export function detectSabangnetWorkbookKind(headers: readonly string[]): SabangnetWorkbookKind | null {
  const has = (name: string) => headers.includes(name);
  if (has('쇼핑몰상품코드') && has('쇼핑몰코드') && has('품번코드')) return 'send_records';
  if (has('카테고리코드') && has('카테고리제목') && has('카테고리(쇼핑몰)')) return 'mall_categories';
  if (has('부가정보코드') && has('부가정보제목')) return 'mall_templates';
  if (has('쇼핑몰코드') && has('품번코드')) return 'channel_overrides';
  if (has('사방넷상품코드') && has('옵션상세명칭')) return 'options';
  if (has('상품명') && (has('품번코드') || has('자체상품코드')) && headers.some((header) => header.startsWith('옵션제목'))) {
    return 'products';
  }
  return null;
}

export function parseSabangnetWorkbook(buffer: Buffer, name: string): ParsedSabangnetWorkbook {
  const table = readTable(buffer);
  const kind = detectSabangnetWorkbookKind(table.headers);
  if (!kind) {
    throw new SabangnetWorkbookFormatError(
      `${name}: 사방넷 상품대량수정 · 단품대량수정 · 쇼핑몰별별도정보 · 쇼핑몰상품수정 다운로드 · 쇼핑몰카테고리 · 쇼핑몰부가정보 파일이 아닙니다.`,
    );
  }
  if (kind === 'products') return { kind, name, ...parseProducts(table) };
  if (kind === 'options') return { kind, name, ...parseOptions(table) };
  if (kind === 'send_records') return { kind, name, ...parseSendRecords(table) };
  if (kind === 'mall_categories') return { kind, name, ...parseMallCategories(table) };
  if (kind === 'mall_templates') return { kind, name, ...parseMallTemplates(table) };
  return { kind, name, ...parseChannelOverrides(table) };
}

function columnReader(headers: readonly string[]) {
  const index = (names: readonly string[]): number => {
    for (const candidate of names) {
      const found = headers.indexOf(candidate);
      if (found >= 0) return found;
    }
    return -1;
  };
  return {
    index,
    get: (cells: readonly unknown[], names: readonly string[]): unknown => {
      const at = index(names);
      return at >= 0 ? cells[at] : null;
    },
  };
}

const IMAGE_COLUMNS: readonly (readonly string[])[] = [
  ['대표이미지'],
  ['종합몰JPG이미지', '종합몰(JPG)이미지'],
  ...Array.from({ length: 21 }, (_, offset) => {
    const slot = offset + 2;
    return [`부가이미지${slot}`];
  }),
];

const EXCLUDED_RAW = new Set(['상품상세설명', '추가상품상세설명_1', '추가상품상세설명_2', '추가상품상세설명_3']);

/**
 * 원문에 상세 대신 남기는 디지스트 키. 머리 이름은 '#' 으로 시작하지 않아 사방넷 칸과 겹치지 않는다.
 * 값은 `sabangnetDetailDigests` 가 만든다(빈 상세는 빈 문자열).
 */
export const SABANGNET_DETAIL_DIGEST_KEYS = {
  detailHtml: '#digest:상품상세설명',
  extraDetailHtml: '#digest:추가상품상세설명',
} as const;

const integrity = new ChannelIntegrityAdapter();

function rawRecord(headers: readonly string[], cells: readonly unknown[]): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (!header || EXCLUDED_RAW.has(header)) return;
    const text = cellText(cells[index]);
    if (!text) return;
    const key = raw[header] === undefined ? header : `${header}#${index}`;
    raw[key] = text.length > 2000 ? text.slice(0, 2000) : text;
  });
  return raw;
}

interface ProductColumnLayout {
  col: ReturnType<typeof columnReader>;
  title1: number;
  title2: number;
  value1: number;
  value2: number;
  imageIndexes: number[];
  noticeIndexes: number[];
}

function productColumnLayout(headers: readonly string[]): ProductColumnLayout {
  const col = columnReader(headers);
  const title1 = col.index(['옵션제목(1)']);
  const title2 = col.index(['옵션제목(2)']);
  const value1 = col.index(['옵션상세명칭(1)']) >= 0
    ? col.index(['옵션상세명칭(1)'])
    : title1 >= 0 && headers[title1 + 1] === '옵션상세명칭' ? title1 + 1 : -1;
  const value2 = col.index(['옵션상세명칭(2)']) >= 0
    ? col.index(['옵션상세명칭(2)'])
    : title2 >= 0 && headers[title2 + 1] === '옵션상세명칭' ? title2 + 1 : -1;
  const imageIndexes = IMAGE_COLUMNS.map((names) => {
    const exact = col.index(names);
    if (exact >= 0) return exact;
    // 부가이미지11 머리는 '부가이미지11(카페24/메이크샵…' 처럼 설명이 붙는다.
    return headers.findIndex((header) => names.some((name) => header.startsWith(`${name}(`)));
  });
  const noticeIndexes = Array.from({ length: 39 }, (_, offset) => col.index([`속성값${offset + 1}`]));
  return { col, title1, title2, value1, value2, imageIndexes, noticeIndexes };
}

/** 한 줄 → 상품 줄. 상품명이나 열쇠(품번코드 · 자체상품코드)가 없으면 무엇이 없는지 말한다. */
function productRowFromCells(
  headers: readonly string[],
  layout: ProductColumnLayout,
  row: number,
  cells: readonly unknown[],
): SabangnetProductRow | { issue: SabangnetImportIssue } {
  const { col, title1, title2, value1, value2, imageIndexes, noticeIndexes } = layout;
  const get = (names: readonly string[]) => col.get(cells, names);
  const goodsNo = textOrNull(get(['품번코드']));
  const ownCode = textOrNull(get(['자체상품코드']));
  const name = cellText(get(['상품명']));
  if (!name) {
    return { issue: { kind: 'products', row, code: goodsNo ?? ownCode, message: '상품명이 비어 있습니다.' } };
  }
  if (!goodsNo && !ownCode) {
    return { issue: { kind: 'products', row, code: null, message: '품번코드도 자체상품코드도 없습니다.' } };
  }
  const optionTitles: string[] = [];
  const optionValueLists: string[][] = [];
  for (const [titleAt, valueAt] of [[title1, value1], [title2, value2]] as const) {
    const title = titleAt >= 0 ? cellText(cells[titleAt]) : '';
    const values = valueAt >= 0 ? splitList(cells[valueAt]) : [];
    if (!title && values.length === 0) continue;
    optionTitles.push(title);
    optionValueLists.push(values);
  }
  const certNumber = textOrNull(get(['인증번호']));
  return {
    row,
    goodsNo,
    ownCode,
    name,
    shortName: textOrNull(get(['상품약어'])),
    modelName: textOrNull(get(['모델명'])),
    modelNo: textOrNull(get(['모델NO'])),
    brand: textOrNull(get(['브랜드명'])),
    keywords: splitList(get(['사이트검색어'])),
    standardCategory: textOrNull(get(['표준카테고리'])),
    manufacturer: textOrNull(get(['제조사'])),
    originCountry: textOrNull(get(['원산지(제조국)'])),
    originRegion: textOrNull(get(['원산지상세지역'])),
    statusCode: textOrNull(get(['상품상태'])),
    taxCode: textOrNull(get(['세금구분'])),
    deliveryCode: textOrNull(get(['배송비구분'])),
    deliveryFee: sabangnetNumber(get(['배송비'])),
    costPrice: sabangnetNumber(get(['원가'])),
    salePrice: sabangnetNumber(get(['판매가'])),
    tagPrice: sabangnetNumber(get(['TAG가'])),
    optionTitles,
    optionValueLists,
    stockManaged: cellText(get(['재고관리사용여부'])).toUpperCase() === 'Y',
    imageUrls: [...new Set(imageIndexes
      .map((at) => (at >= 0 ? cellText(cells[at]) : ''))
      .filter((url) => /^https?:\/\//i.test(url)))],
    detailHtml: textOrNull(get(['상품상세설명'])),
    extraDetailHtml: ['추가상품상세설명_1', '추가상품상세설명_2', '추가상품상세설명_3']
      .map((header) => cellText(get([header])))
      .filter(Boolean),
    certification: certNumber
      ? {
        number: certNumber,
        issuer: textOrNull(get(['인증기관'])),
        field: textOrNull(get(['인증분야'])),
        validFrom: textOrNull(get(['인증유효시작일'])),
        validTo: textOrNull(get(['인증유효마지막일'])),
        issuedAt: textOrNull(get(['발급일자'])),
        certifiedAt: textOrNull(get(['인증일자'])),
        imageUrl: textOrNull(get(['인증서이미지'])),
      }
      : null,
    noticeCategory: textOrNull(get(['속성정보(상품정보고시)분류코드', '속성분류코드'])),
    noticeValues: trimTrailingBlanks(noticeIndexes.map((at) => (at >= 0 ? cellText(cells[at]) : ''))),
    englishName: textOrNull(get(['영문상품명'])),
    printName: textOrNull(get(['출력상품명'])),
    importDeclarationNo: textOrNull(get(['수입신고번호'])),
    adminMemo: textOrNull(get(['관리자메모'])),
    raw: rawRecord(headers, cells),
  };
}

function parseProducts(table: SheetTable): { rows: SabangnetProductRow[]; issues: SabangnetImportIssue[] } {
  const layout = productColumnLayout(table.headers);
  const issues: SabangnetImportIssue[] = [];
  const rows: SabangnetProductRow[] = [];
  for (const { row, cells } of table.dataRows) {
    const parsed = productRowFromCells(table.headers, layout, row, cells);
    if ('issue' in parsed) {
      issues.push(parsed.issue);
      continue;
    }
    // 상세 HTML 은 원문에 담지 않고 디지스트만 남긴다 — 다시 가져올 때 사람이 고쳤는지 가르는 기준값이다.
    const digests = sabangnetDetailDigests(parsed, integrity.sha256);
    parsed.raw[SABANGNET_DETAIL_DIGEST_KEYS.detailHtml] = digests.detailHtml;
    parsed.raw[SABANGNET_DETAIL_DIGEST_KEYS.extraDetailHtml] = digests.extraDetailHtml;
    rows.push(parsed);
  }
  return { rows, issues };
}

/**
 * 시스템이 상세 HTML 을 고쳐 쓸 때(사진 옮기기) 기준값도 함께 옮긴다. 원문의 디지스트가 고치기 전 상세와
 * 같았던 칸만 고친 뒤 상세의 디지스트로 바꾼다 — 사람이 고친 상세(이미 기준값과 다르다)는 그대로 둔다.
 * 바꿀 칸이 없으면 null 이다.
 */
export function restampSabangnetDetailDigests(
  sourceRaw: unknown,
  before: { detailHtml: string | null; extraDetailHtml: readonly string[] },
  after: { detailHtml: string | null; extraDetailHtml: readonly string[] },
): Record<string, unknown> | null {
  if (!sourceRaw || typeof sourceRaw !== 'object' || Array.isArray(sourceRaw)) return null;
  const raw = { ...(sourceRaw as Record<string, unknown>) };
  const was = sabangnetDetailDigests(before, integrity.sha256);
  const now = sabangnetDetailDigests(after, integrity.sha256);
  let changed = false;
  for (const field of ['detailHtml', 'extraDetailHtml'] as const) {
    const key = SABANGNET_DETAIL_DIGEST_KEYS[field];
    if (raw[key] !== was[field] || was[field] === now[field]) continue;
    raw[key] = now[field];
    changed = true;
  }
  return changed ? raw : null;
}

/**
 * 저장된 상품 원문(`SalesProduct.sourceRaw`)을 그 줄을 읽었던 매핑 그대로 다시 읽는다. 원문 키는 머리
 * 이름이고(같은 머리가 둘이면 뒤 것은 `머리#열번호`), 빈 칸은 없다. 상세는 원문에 없고 디지스트만 있다.
 * 디지스트를 남기기 전에 가져온 원문이면 `detailDigests` 는 null 이다.
 */
export function readSabangnetProductSource(
  sourceRaw: unknown,
): { row: SabangnetProductRow; detailDigests: SabangnetDetailDigests | null } | null {
  if (!sourceRaw || typeof sourceRaw !== 'object' || Array.isArray(sourceRaw)) return null;
  const entries = Object.entries(sourceRaw as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  const digestKeys = new Set<string>(Object.values(SABANGNET_DETAIL_DIGEST_KEYS));
  const columns = entries.filter(([key]) => !digestKeys.has(key));
  const headers = columns.map(([key]) => key.replace(/#\d+$/, ''));
  const parsed = productRowFromCells(headers, productColumnLayout(headers), 0, columns.map(([, value]) => value));
  if ('issue' in parsed) return null;
  const raw = sourceRaw as Record<string, unknown>;
  const detailHtml = raw[SABANGNET_DETAIL_DIGEST_KEYS.detailHtml];
  const extraDetailHtml = raw[SABANGNET_DETAIL_DIGEST_KEYS.extraDetailHtml];
  return {
    row: parsed,
    detailDigests: typeof detailHtml === 'string' && typeof extraDetailHtml === 'string'
      ? { detailHtml, extraDetailHtml }
      : null,
  };
}

function trimTrailingBlanks(values: string[]): string[] {
  let end = values.length;
  while (end > 0 && !values[end - 1]) end -= 1;
  return values.slice(0, end);
}

function parseOptions(table: SheetTable): { rows: SabangnetOptionRow[]; issues: SabangnetImportIssue[] } {
  const col = columnReader(table.headers);
  const issues: SabangnetImportIssue[] = [];
  const rows: SabangnetOptionRow[] = [];
  for (const { row, cells } of table.dataRows) {
    const get = (names: readonly string[]) => col.get(cells, names);
    const optionCode = cellText(get(['사방넷상품코드']));
    const match = /^(\d+)-\d+$/.exec(optionCode);
    if (!match) {
      issues.push({ kind: 'options', row, code: optionCode || null, message: '단품코드 모양(품번-번호)이 아닙니다.' });
      continue;
    }
    rows.push({
      row,
      optionCode,
      goodsNo: match[1]!,
      optionTitle: textOrNull(get(['옵션제목'])),
      optionValue: textOrNull(get(['옵션상세명칭'])),
      extraPrice: sabangnetNumber(get(['단품추가금액'])) ?? 0,
      supplyStatusCode: textOrNull(get(['공급상태'])),
      safetyStock: sabangnetNumber(get(['안전재고'])),
      alias: textOrNull(get(['옵션별칭'])),
      modelName: textOrNull(get(['모델명'])),
      ownCode: textOrNull(get(['자체상품코드'])),
    });
  }
  return { rows, issues };
}

function parseChannelOverrides(
  table: SheetTable,
): { rows: SabangnetChannelOverrideRow[]; issues: SabangnetImportIssue[] } {
  const col = columnReader(table.headers);
  const issues: SabangnetImportIssue[] = [];
  const rows: SabangnetChannelOverrideRow[] = [];
  for (const { row, cells } of table.dataRows) {
    const get = (names: readonly string[]) => col.get(cells, names);
    const goodsNo = cellText(get(['품번코드']));
    const shopCode = cellText(get(['쇼핑몰코드']));
    if (!goodsNo || !/^shop\d{4}$/.test(shopCode)) {
      issues.push({ kind: 'channel_overrides', row, code: goodsNo || null, message: '품번코드 또는 쇼핑몰코드가 비어 있습니다.' });
      continue;
    }
    rows.push({
      row,
      goodsNo,
      shopCode,
      shopName: textOrNull(get(['쇼핑몰명'])),
      salePrice: sabangnetNumber(get(['쇼핑몰판매가'])),
      priceRateBp: sabangnetPriceRateBp(get(['쇼핑몰적용율(%)', '쇼핑몰적용률(%)', '적용율(%)', '적용률(%)', '쇼핑몰적용율', '쇼핑몰적용률', '적용율', '적용률'])),
      name: textOrNull(get(['쇼핑몰상품명'])),
      detailHtml: textOrNull(get(['쇼핑몰상세설명'])),
      promoText: textOrNull(get(['쇼핑몰홍보문구'])),
      noticeCategory: textOrNull(get(['쇼핑몰속성분류코드'])),
      costPrice: sabangnetNumber(get(['쇼핑몰원가'])),
      stockPercent: sabangnetNumber(get(['재고분할퍼센트'])),
      raw: rawRecord(table.headers, cells),
    });
  }
  return { rows, issues };
}

function parseSendRecords(
  table: SheetTable,
): { rows: SabangnetSendRecordRow[]; issues: SabangnetImportIssue[] } {
  const col = columnReader(table.headers);
  const issues: SabangnetImportIssue[] = [];
  const rows: SabangnetSendRecordRow[] = [];
  for (const { row, cells } of table.dataRows) {
    const get = (names: readonly string[]) => col.get(cells, names);
    const shopCode = cellText(get(['쇼핑몰코드']));
    const mallProductCode = cellText(get(['쇼핑몰상품코드']));
    const goodsNo = cellText(get(['품번코드']));
    if (!/^shop\d{4}$/.test(shopCode) || !goodsNo) {
      issues.push({ kind: 'send_records', row, code: goodsNo || null, message: '쇼핑몰코드 또는 품번코드가 비어 있습니다.' });
      continue;
    }
    if (!mallProductCode) continue;
    rows.push({
      row,
      shopCode,
      mallProductCode,
      goodsNo,
      additionCode: textOrNull(get(['부가정보코드'])),
      categoryCode: textOrNull(get(['카테고리코드'])),
      sentStatus: textOrNull(get(['상품상태(송신)'])),
      sentPrice: sabangnetNumber(get(['판매가(송신)'])),
    });
  }
  return { rows, issues };
}

function parseMallCategories(
  table: SheetTable,
): { rows: SabangnetMallCategoryRow[]; issues: SabangnetImportIssue[] } {
  const col = columnReader(table.headers);
  const issues: SabangnetImportIssue[] = [];
  const rows: SabangnetMallCategoryRow[] = [];
  for (const { row, cells } of table.dataRows) {
    const get = (names: readonly string[]) => col.get(cells, names);
    const code = cellText(get(['카테고리코드']));
    if (!code) {
      issues.push({ kind: 'mall_categories', row, code: null, message: '카테고리코드가 비어 있습니다.' });
      continue;
    }
    rows.push({
      row,
      code,
      mallName: textOrNull(get(['쇼핑몰명'])),
      title: textOrNull(get(['카테고리제목'])),
      path: textOrNull(get(['카테고리(쇼핑몰)'])),
      active: cellText(get(['사용여부'])) !== '미사용',
    });
  }
  return { rows, issues };
}

function parseMallTemplates(
  table: SheetTable,
): { rows: SabangnetMallTemplateRow[]; issues: SabangnetImportIssue[] } {
  const col = columnReader(table.headers);
  const issues: SabangnetImportIssue[] = [];
  const rows: SabangnetMallTemplateRow[] = [];
  for (const { row, cells } of table.dataRows) {
    const get = (names: readonly string[]) => col.get(cells, names);
    const code = cellText(get(['부가정보코드']));
    if (!code) {
      issues.push({ kind: 'mall_templates', row, code: null, message: '부가정보코드가 비어 있습니다.' });
      continue;
    }
    rows.push({
      row,
      code,
      mallName: textOrNull(get(['쇼핑몰명'])),
      title: textOrNull(get(['부가정보제목'])),
      path: textOrNull(get(['카테고리(쇼핑몰)'])),
      active: cellText(get(['사용여부'])) !== '미사용',
      namePrefix: textOrNull(get(['상품명추가앞문구'])),
      nameSuffix: textOrNull(get(['상품명추가뒷문구'])),
      detailTop: textOrNull(get(['상품설명상단추가문구'])),
      detailBottom: textOrNull(get(['상품설명하단추가문구'])),
    });
  }
  return { rows, issues };
}
