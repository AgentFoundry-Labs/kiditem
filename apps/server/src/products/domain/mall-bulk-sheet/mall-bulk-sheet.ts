/**
 * 몰 대량등록 엑셀(ADR-0014 판매상품 → 몰 양식) — 몰마다 다른 양식을 하나의 틀로 채운다.
 *
 * 몰 양식 파일은 몰 판매자센터에서 받은 빈 양식을 그대로 쓴다(저장소 `mall-bulk-templates/`). 칸은 머리행 글자로
 * 찾으므로 몰이 칸 순서를 바꿔도 이름이 같으면 그대로 맞는다. 이 파일은 순수하다 — 양식 파일을 읽고 쓰는 일은
 * 저장소 어댑터가 한다.
 *
 * 몰 한 곳의 규칙(`MallBulkSheetSpec`)은 판매상품 한 건을 그 몰 행(들)로 바꾼다. 채울 수 없는 필수 칸이 있으면
 * 그 상품은 `problems` 로 돌려주고 파일에 넣지 않는다 — 빈 칸으로 올린 파일은 몰이 통째로 거절하거나, 더 나쁘게는
 * 틀린 값으로 등록된다.
 */

import type { MallCategoryLookup } from './mall-sheet-categories';

/** 칸 하나의 값. null 은 칸을 비운다. */
export type MallSheetCell = string | number | null;

/** 머리행 글자. 같은 글자가 여러 번 나오면 `인증타입#2` 처럼 몇 번째인지 붙인다(1부터). */
export type MallSheetColumn = string;

export type MallSheetRow = Readonly<Record<MallSheetColumn, MallSheetCell>>;

export interface MallSheetTemplate {
  /** 저장소 양식 파일 이름. */
  file: string;
  sheet: string;
  /** 칸 이름을 읽는 머리행(1부터). */
  headerRow: number;
  /** 첫 상품 행(1부터). 이 행부터 아래는 비우고 쓴다 — 양식의 예시 · 안내 행이 몰로 올라가지 않게. */
  firstDataRow: number;
  bookType: 'xls' | 'xlsx' | 'xlsm' | 'csv';
  /** 비우지 않고 남길 열 글자(양식이 행 번호를 미리 적어 둔 `A` 열 등). */
  keepColumnLetters?: readonly string[];
  /** 상품 행 앞에 있는 안내 · 예시 행(1부터). 몰에 올라가지 않게 비운다. */
  clearRows?: readonly number[];
  /**
   * `template`(기본): 양식 파일을 그대로 두고 상품 행만 채운다.
   * `headers`: 머리행과 상품 행만 남긴 새 시트를 만든다 — 몰이 "안내행을 지우고 올리라"고 하는 양식(떠리몰 · 티쳐몰).
   */
  emit?: 'template' | 'headers';
}

/** 몰 계정에 한 번 정하는 값(출하지 코드 · 스토어명 같은 것). 화면이 입력칸으로 그린다. */
export interface MallSheetFixedField {
  key: string;
  label: string;
  required: boolean;
  defaultValue: string;
  help?: string;
}

export interface MallSheetOption {
  code: string;
  /** 판매상품 옵션 단(`optionAxes`) 순서대로의 값. */
  values: readonly string[];
  extraPrice: number;
  barcode: string | null;
}

/** 이 몰(계정)에서 쓰는 값 — 판매상품 기본값에 몰별 값을 얹은 것. */
export interface MallSheetMallValues {
  /** 이 몰의 기준 판매가(옵션 추가금액 전, 몰별 판매가 · %를 반영). */
  salePrice: number;
  /** 몰별 상품명, 없으면 사방넷 앞뒤 글자를 붙인 판매상품 이름. */
  name: string;
  /** 사람이 이 몰에 따로 적은 상품명인가(몰 규칙이 앞 글자를 다시 붙이지 않게). */
  nameIsMallSpecific: boolean;
  promoText: string | null;
  detailHtml: string | null;
  /** 몰 카테고리 경로(`>` 로 잇는다). 몰별 값의 `categoryPath`, 없으면 사방넷에서 옮긴 경로. */
  categoryPath: string | null;
  /** 몰 카테고리 번호. 몰별 값의 `categoryCode`, 없으면 경로를 몰 카테고리표에서 찾은 값. */
  categoryCode: string | null;
  /** 몰별 값(`adapterValues`) 그대로. */
  values: Readonly<Record<string, string>>;
}

/** 몰 엑셀에 넣을 판매상품 한 건. 서비스가 판매상품 · 몰별 값으로 만든다. */
export interface MallSheetProduct {
  salesProductId: string;
  code: string;
  ownCode: string | null;
  /** 판매상품 이름 그대로(셀피아 원본명 · 가격 코드 포함). 쿠팡 발주서용 등록상품명처럼 우리끼리 보는 칸에 쓴다. */
  internalName: string;
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  modelNo: string | null;
  originCountry: string | null;
  keywords: readonly string[];
  taxType: 'taxable' | 'tax_free' | 'zero_rated' | 'unknown';
  tagPrice: number | null;
  /** 몰이 가져갈 수 있는(인터넷에서 열리는) 사진 주소. [0] 대표. */
  imageUrls: readonly string[];
  /**
   * 사진 주소가 어디 것인가. `sabangnet` 은 우리 저장소 사진이 인터넷에서 열리지 않아 사방넷 원래 주소를 대신
   * 쓴 것이다 — 사방넷을 끊으면 몰에서 사진이 사라질 수 있다.
   */
  imageSource: 'own' | 'sabangnet' | 'none';
  /** 사방넷 속성분류코드(`023` 어린이제품, `035` 기타 재화 …). */
  noticeCategory: string | null;
  certificationNumbers: readonly string[];
  optionAxes: readonly string[];
  /** 파는 단품만(쓰지 않는 단품 제외), 순서대로. 옵션 없는 상품은 값 없는 단품 하나. */
  options: readonly MallSheetOption[];
  /** 몰 키 → 그 몰 값. 규칙이 다루는 몰만 들어 있다. */
  malls: Readonly<Record<string, MallSheetMallValues>>;
}

export interface MallSheetContext {
  /** 몰 계정 고정값(화면에서 확인한 값). */
  fixed: Readonly<Record<string, string>>;
  categories: MallCategoryLookup;
}

export interface MallSheetRowsResult {
  rows: MallSheetRow[];
  /** 이 상품을 파일에 넣지 못하는 까닭. 하나라도 있으면 rows 는 쓰지 않는다. */
  problems: string[];
  /** 넣기는 하지만 사람이 몰에서 볼 것. */
  warnings: string[];
}

export interface MallBulkSheetSpec {
  /** 화면 · 요청에서 쓰는 이름(몰 키와 같을 수도 다를 수도 있다). */
  sheetKey: string;
  label: string;
  /** 이 파일이 다루는 몰 키(ChannelAccount.channel). ESM 은 G마켓 · 옥션 둘이다. */
  mallKeys: readonly string[];
  /** 몰 분류를 번호로 받는가(몰 카테고리표로 경로를 번호로 바꿔야 한다), 이름으로 받는가(경로 그대로). */
  categoryBy: 'code' | 'name';
  template: MallSheetTemplate;
  /** 몰이 한 파일에 받는 상품 수. */
  maxProducts: number;
  fixedFields: readonly MallSheetFixedField[];
  /** 올린 뒤 사람이 몰에서 할 일 · 알아 둘 것(화면이 보여 준다). */
  notes: readonly string[];
  rows(product: MallSheetProduct, context: MallSheetContext): MallSheetRowsResult;
}

/** 머리행 글자를 비교할 모양으로 — 줄바꿈 · 여러 칸 띄움을 한 칸으로. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 머리행 → 칸 번호. 같은 글자가 다시 나오면 `글자#2`, `글자#3` … 으로도 찾을 수 있게 둔다(첫 번째는 `글자`와
 * `글자#1` 둘 다).
 */
export function headerIndex(headers: readonly unknown[]): Map<MallSheetColumn, number> {
  const seen = new Map<string, number>();
  const index = new Map<MallSheetColumn, number>();
  headers.forEach((raw, column) => {
    const header = normalizeHeader(raw);
    if (!header) return;
    const occurrence = (seen.get(header) ?? 0) + 1;
    seen.set(header, occurrence);
    if (occurrence === 1) index.set(header, column);
    index.set(`${header}#${occurrence}`, column);
  });
  return index;
}

/** 규칙이 쓰는 칸 중 양식 머리행에 없는 것. 몰이 양식을 바꾸면 여기서 먼저 걸린다. */
export function missingColumns(
  headers: ReadonlyMap<MallSheetColumn, number>,
  rows: readonly MallSheetRow[],
): string[] {
  const missing = new Set<string>();
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!headers.has(normalizeColumn(column))) missing.add(column);
    }
  }
  return [...missing];
}

export function normalizeColumn(column: MallSheetColumn): MallSheetColumn {
  const [name, occurrence] = column.split('#');
  const header = normalizeHeader(name);
  return occurrence ? `${header}#${occurrence}` : header;
}

/** 필수 고정값 중 비어 있는 것의 이름. */
export function missingFixedFields(
  spec: Pick<MallBulkSheetSpec, 'fixedFields'>,
  fixed: Readonly<Record<string, string>>,
): string[] {
  return spec.fixedFields
    .filter((field) => field.required && !fixed[field.key]?.trim())
    .map((field) => field.label);
}

/** 화면에서 받은 고정값에 기본값을 채운다. 빈 문자열도 "안 적음" 으로 본다. */
export function resolveFixedValues(
  spec: Pick<MallBulkSheetSpec, 'fixedFields'>,
  input: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of spec.fixedFields) {
    const given = input?.[field.key]?.trim();
    values[field.key] = given || field.defaultValue;
  }
  return values;
}

/** 옵션 단품 하나를 사람이 읽는 이름으로(`빨강 / L`). */
export function optionLabel(option: Pick<MallSheetOption, 'values'>): string {
  return option.values.map((value) => value.trim()).filter(Boolean).join(' / ');
}

/** 옵션 없는 상품인가 — 단품이 하나뿐이고 값이 비어 있다. */
export function isSingleOption(product: Pick<MallSheetProduct, 'options' | 'optionAxes'>): boolean {
  return product.optionAxes.length === 0
    || (product.options.length === 1 && product.options[0]!.values.every((value) => !value.trim()));
}

/** 사방넷 원산지 글자를 몰이 쓰는 나라 이름으로. 모르면 원래 글자. */
export function originCountryName(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === 'CHINA' || upper === 'CN' || raw === '중국산') return '중국';
  if (upper === 'KOREA' || upper === 'KR' || raw === '대한민국' || raw === '한국' || raw === '국산' || raw === '국내') {
    return '대한민국';
  }
  if (upper === 'JAPAN' || upper === 'JP') return '일본';
  if (upper === 'VIETNAM' || upper === 'VN') return '베트남';
  return raw;
}

export function isDomesticOrigin(value: string | null): boolean {
  return originCountryName(value) === '대한민국';
}

/** 사방넷 속성분류코드 → 고시 종류. 우리 상품은 어린이제품 · 기타 재화 둘이다. */
export type NoticeKind = 'child' | 'other';

export function noticeKind(noticeCategory: string | null): NoticeKind {
  return Number(noticeCategory ?? '') === 23 ? 'child' : 'other';
}

/** 상세설명 HTML 이 비었거나 사진 하나 없는 글인가. 몰 대부분이 상세설명을 필수로 받는다. */
export function hasDetail(html: string | null): boolean {
  return Boolean(html?.replace(/<[^>]*>/g, '').trim() || /<img\b/i.test(html ?? ''));
}

/** `a > b > c` · `a>b>c` 를 `>` 기준 마디 배열로. */
export function categorySegments(path: string | null): string[] {
  return (path ?? '').split('>').map((segment) => segment.trim()).filter(Boolean);
}

/** 몰이 세는 글자 길이(한글 · 한자 2byte, 영숫자 1byte). */
export function mallByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) bytes += char.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes;
}

/**
 * 몰 서버가 가져갈 수 있는 사진 주소인가. 우리 저장소(`localhost` · 사설망)는 사무실 밖에서 열리지 않는다.
 */
export function isPublicImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    // `//cdn…` 처럼 앞을 뗀 주소는 몰 화면이 https 로 연다.
    parsed = new URL(url.startsWith('//') ? `https:${url}` : url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  // 점 없는 이름(`kiditem-office`)은 사무실 안에서만 풀린다.
  if (!host.includes('.') && !host.startsWith('[')) return false;
  if (/^(127|10)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '0.0.0.0' || host === '[::1]') return false;
  return true;
}

/** 상세설명 HTML 안의 사진 주소(나온 순서대로, 같은 주소는 한 번). */
export function detailImageUrls(html: string | null): string[] {
  const urls: string[] = [];
  for (const match of (html ?? '').matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) {
    const url = match[1]!.trim();
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}
