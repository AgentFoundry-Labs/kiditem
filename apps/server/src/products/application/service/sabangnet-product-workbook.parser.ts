import * as XLSX from 'xlsx';
import type { SabangnetImportIssue, SabangnetWorkbookKind } from '@kiditem/shared/sales-product';

/**
 * 사방넷에서 내려받은 상품 엑셀을 읽는다(ADR-0013, KID-264).
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

export interface SabangnetProductRow {
  row: number;
  goodsNo: string | null;
  ownCode: string | null;
  name: string;
  shortName: string | null;
  modelName: string | null;
  modelNo: string | null;
  brand: string | null;
  keywords: string[];
  standardCategory: string | null;
  manufacturer: string | null;
  originCountry: string | null;
  originRegion: string | null;
  statusCode: string | null;
  taxCode: string | null;
  deliveryCode: string | null;
  deliveryFee: number | null;
  costPrice: number | null;
  salePrice: number | null;
  tagPrice: number | null;
  optionTitles: string[];
  optionValueLists: string[][];
  stockManaged: boolean;
  imageUrls: string[];
  detailHtml: string | null;
  extraDetailHtml: string[];
  certification: {
    number: string;
    issuer: string | null;
    field: string | null;
    validFrom: string | null;
    validTo: string | null;
    issuedAt: string | null;
    certifiedAt: string | null;
    imageUrl: string | null;
  } | null;
  noticeCategory: string | null;
  noticeValues: string[];
  englishName: string | null;
  printName: string | null;
  importDeclarationNo: string | null;
  adminMemo: string | null;
  /** 상세 · 이미지를 뺀 원문 칸(빈 칸 제외). */
  raw: Record<string, string>;
}

export interface SabangnetOptionRow {
  row: number;
  optionCode: string;
  goodsNo: string;
  optionTitle: string | null;
  optionValue: string | null;
  extraPrice: number;
  supplyStatusCode: string | null;
  safetyStock: number | null;
  alias: string | null;
  modelName: string | null;
  ownCode: string | null;
}

export interface SabangnetChannelOverrideRow {
  row: number;
  goodsNo: string;
  shopCode: string;
  shopName: string | null;
  salePrice: number | null;
  name: string | null;
  detailHtml: string | null;
  promoText: string | null;
  noticeCategory: string | null;
  costPrice: number | null;
  stockPercent: number | null;
  raw: Record<string, string>;
}

/**
 * 사방넷 쇼핑몰상품수정 다운로드 한 줄 — 몰 × 상품 송신 기록. 몰 로그인 ID(쇼핑몰ID) 칸은 읽지 않는다.
 */
export interface SabangnetSendRecordRow {
  row: number;
  shopCode: string;
  mallProductCode: string;
  goodsNo: string;
  additionCode: string | null;
  categoryCode: string | null;
  sentStatus: string | null;
  sentPrice: number | null;
}

/** 쇼핑몰카테고리 수정파일 한 줄 — 사방넷 카테고리코드 → 그 몰의 분류 경로. */
export interface SabangnetMallCategoryRow {
  row: number;
  code: string;
  mallName: string | null;
  title: string | null;
  path: string | null;
  active: boolean;
}

/** 쇼핑몰부가정보 수정파일 한 줄 — 몰별 등록 틀(배송 조건 이름 · 기본 분류 · 상품명 앞뒤 문구 · 상세 위아래 문구). */
export interface SabangnetMallTemplateRow {
  row: number;
  code: string;
  mallName: string | null;
  title: string | null;
  path: string | null;
  active: boolean;
  namePrefix: string | null;
  nameSuffix: string | null;
  detailTop: string | null;
  detailBottom: string | null;
}

export type ParsedSabangnetWorkbook =
  | { kind: 'products'; name: string; rows: SabangnetProductRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'send_records'; name: string; rows: SabangnetSendRecordRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'options'; name: string; rows: SabangnetOptionRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'channel_overrides'; name: string; rows: SabangnetChannelOverrideRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'mall_categories'; name: string; rows: SabangnetMallCategoryRow[]; issues: SabangnetImportIssue[] }
  | { kind: 'mall_templates'; name: string; rows: SabangnetMallTemplateRow[]; issues: SabangnetImportIssue[] };

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

function parseProducts(table: SheetTable): { rows: SabangnetProductRow[]; issues: SabangnetImportIssue[] } {
  const { headers } = table;
  const col = columnReader(headers);
  const issues: SabangnetImportIssue[] = [];
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

  const rows: SabangnetProductRow[] = [];
  for (const { row, cells } of table.dataRows) {
    const get = (names: readonly string[]) => col.get(cells, names);
    const goodsNo = textOrNull(get(['품번코드']));
    const ownCode = textOrNull(get(['자체상품코드']));
    const name = cellText(get(['상품명']));
    if (!name) {
      issues.push({ kind: 'products', row, code: goodsNo ?? ownCode, message: '상품명이 비어 있습니다.' });
      continue;
    }
    if (!goodsNo && !ownCode) {
      issues.push({ kind: 'products', row, code: null, message: '품번코드도 자체상품코드도 없습니다.' });
      continue;
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
    rows.push({
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
    });
  }
  return { rows, issues };
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
