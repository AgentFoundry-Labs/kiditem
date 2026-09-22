/**
 * 원폴라리스(한솔교육 폐쇄몰) 메일 주문 엑셀 → 셀피아 `양식` 시트 규칙.
 *
 * 원폴라리스는 판매자 화면이 없다. 주문은 메일 첨부 엑셀(순번 · 구분 · 구매일 · 제품명 · 수량 ·
 * 본부명 · 지점명 · 사용포인트 · 배송지)로만 오고, 사장님은 그 줄을 양식 xls 의 `양식` 시트에
 * 옮겨 적는다. 그 시트가 하던 일이 이 파일이다 —
 *   - 배송지로 `주소록` 시트를 VLOOKUP 해 전화 · 우편번호 · 주소를 채우고(수령인 = 배송지,
 *     수령인 전화 = 청구 전화),
 *   - 상품명(`_[G]` 꼬리를 뗀 것)으로 `단가` 시트를 VLOOKUP 해 공급단가(S)와
 *     공급합계(R = 수량 × S)를 채운다.
 * 셀피아는 수식을 읽지 않으므로 값으로 계산한다. VLOOKUP 처럼 첫 번째로 맞는 행을 쓰고
 * 대소문자를 가리지 않는다. 표에 없는 배송지 · 상품은 그 칸을 비워 두고 이름을 돌려준다 —
 * 엑셀에서는 #N/A 로 보이던 것이라, 사람이 알아채게 화면이 말해 줘야 한다.
 *
 * 순수 규칙만 있다. 엑셀을 읽고 쓰는 일은 서비스가 한다.
 */

export const ONE_POLARIS_MALL_KEY = 'one-polaris';

/** 사장님 양식 `양식` 시트의 머리행 그대로(23칸). 셀피아가 이 이름으로 칸을 읽는다. */
export const ONE_POLARIS_SELLPIA_HEADERS = [
  'Order No(주문번호)',
  'Order Item No',
  '배송지',
  'Billing Phone(핸드폰)',
  'Customer Name(수령인)',
  'Customer Phone(핸드폰)',
  'Customer Postcode(우편번호)',
  'Customer Address(주소)',
  'Customer Note',
  'Product ID(상품코드)',
  'Product Name(상품명)',
  'Product Option',
  'Product Quantity(수량)',
  'Product SKU',
  'Product Price(키드판매가)',
  'Total Product Price',
  'Product Cost(공급단가)',
  'Total Product Cost(공급합계)',
  'Shipping Fee',
  'Tax class',
  'Status',
  'Order Date(주문일자)',
  '키코드',
] as const;

/** 양식 시트에서 값이 들어가는 칸(0부터). 나머지 칸은 사장님 양식에서도 비어 있다. */
export const ONE_POLARIS_SELLPIA_COLUMN = {
  site: 2,
  billingPhone: 3,
  customerName: 4,
  customerPhone: 5,
  postcode: 6,
  address: 7,
  productName: 10,
  quantity: 12,
  totalCost: 17,
  /** 머리행은 'Shipping Fee' 인데 사장님 양식은 이 칸에 `단가` 시트의 공급단가를 넣는다. */
  unitCost: 18,
  orderDate: 21,
} as const;

/** 양식 파일 안의 시트 이름. */
export const ONE_POLARIS_TEMPLATE_SHEETS = { addresses: '주소록', prices: '단가' } as const;

const ADDRESS_COLUMNS = {
  site: '저장 위치 내역',
  zip: '우편번호',
  address: '주소',
  phone: '전화번호',
} as const;
const PRICE_COLUMNS = { name: '상품명', cost: '공급단가' } as const;
/** 메일 주문 엑셀의 머리행. 구매일은 없어도 변환한다. */
const ORDER_COLUMNS = { product: '제품명', quantity: '수량', site: '배송지', orderedAt: '구매일' } as const;

export interface OnePolarisAddressEntry {
  readonly site: string;
  readonly zip: string;
  readonly address: string;
  readonly phone: string;
}

export interface OnePolarisPriceEntry {
  readonly name: string;
  readonly cost: number;
}

/** 저장해 두는 양식 표. 주소록과 단가는 양식 파일에 적힌 순서 그대로다(VLOOKUP 이 첫 행을 고른다). */
export interface OnePolarisSellpiaTemplate {
  readonly fileName: string;
  readonly uploadedAt: string;
  readonly addresses: readonly OnePolarisAddressEntry[];
  readonly prices: readonly OnePolarisPriceEntry[];
}

export interface OnePolarisSellpiaTemplateSummary {
  readonly fileName: string;
  readonly uploadedAt: string;
  readonly addressCount: number;
  readonly priceCount: number;
}

export function onePolarisSellpiaTemplateSummary(
  template: OnePolarisSellpiaTemplate,
): OnePolarisSellpiaTemplateSummary {
  return {
    fileName: template.fileName,
    uploadedAt: template.uploadedAt,
    addressCount: template.addresses.length,
    priceCount: template.prices.length,
  };
}

/** 저장돼 있던 값이 양식 표 모양인지. 모양이 아니면 없는 것으로 본다. */
export function isOnePolarisSellpiaTemplate(value: unknown): value is OnePolarisSellpiaTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.fileName === 'string'
    && typeof record.uploadedAt === 'string'
    && Array.isArray(record.addresses)
    && record.addresses.every((entry) => isRecordOfStrings(entry, ['site', 'zip', 'address', 'phone']))
    && Array.isArray(record.prices)
    && record.prices.every((entry) =>
      isRecordOfStrings(entry, ['name'])
      && typeof (entry as Record<string, unknown>).cost === 'number');
}

function isRecordOfStrings(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => typeof record[key] === 'string');
}

/** 양식 파일이나 주문 엑셀이 기대한 모양이 아닐 때. 메시지는 사람이 읽는 말이다. */
export class OnePolarisFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnePolarisFileError';
  }
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '');
}

function cellText(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * 표의 머리행을 찾아 필요한 칸의 자리(0부터)를 답한다. 머리행은 앞쪽 몇 줄 안에 있다 —
 * 메일 주문 엑셀은 두 줄 비우고 셋째 줄에 머리행이 온다.
 */
function locateColumns<C extends Readonly<Record<string, string>>>(
  rows: readonly (readonly unknown[])[],
  columns: C,
  required: readonly (keyof C & string)[],
  what: string,
): { headerRowIndex: number; index: Record<keyof C & string, number> } {
  type Key = keyof C & string;
  const keys = Object.keys(columns) as Key[];
  let bestMissing: string[] | null = null;
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const normalized = (rows[rowIndex] ?? []).map(normalizeHeader);
    const index = {} as Record<Key, number>;
    for (const key of keys) index[key] = normalized.indexOf(normalizeHeader(columns[key]));
    const missing = required.filter((key) => index[key] < 0).map((key) => columns[key]);
    if (missing.length === 0) return { headerRowIndex: rowIndex, index };
    if (missing.length < required.length && (bestMissing === null || missing.length < bestMissing.length)) {
      bestMissing = missing;
    }
  }
  throw new OnePolarisFileError(
    bestMissing
      ? `${what}에 '${bestMissing.join(' · ')}' 칸이 없습니다.`
      : `${what}에서 '${required.map((key) => columns[key]).join(' · ')}' 머리행을 찾지 못했습니다.`,
  );
}

/** 우편번호가 숫자로 저장돼 앞자리 0이 떨어졌으면 다섯 자리로 되돌린다. */
function normalizeZip(value: unknown): string {
  const text = cellText(value);
  return /^\d{1,4}$/.test(text) ? text.padStart(5, '0') : text;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = cellText(value).replace(/[,\s]/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 양식 파일의 `주소록` · `단가` 시트(줄 배열, 셀은 보이는 글자)를 저장할 표로 만든다.
 * 배송지 · 상품명이 빈 줄과 공급단가가 숫자가 아닌 줄은 표에 넣지 않는다.
 */
export function parseOnePolarisTemplateTables(input: {
  addressRows: readonly (readonly unknown[])[];
  priceRows: readonly (readonly unknown[])[];
}): { addresses: OnePolarisAddressEntry[]; prices: OnePolarisPriceEntry[] } {
  const addressHeader = locateColumns(
    input.addressRows,
    ADDRESS_COLUMNS,
    ['site', 'zip', 'address', 'phone'],
    `${ONE_POLARIS_TEMPLATE_SHEETS.addresses} 시트`,
  );
  const addresses: OnePolarisAddressEntry[] = [];
  for (const row of input.addressRows.slice(addressHeader.headerRowIndex + 1)) {
    const site = cellText(row[addressHeader.index.site]);
    if (!site) continue;
    addresses.push({
      site,
      zip: normalizeZip(row[addressHeader.index.zip]),
      address: cellText(row[addressHeader.index.address]),
      phone: cellText(row[addressHeader.index.phone]),
    });
  }
  if (addresses.length === 0) {
    throw new OnePolarisFileError(`${ONE_POLARIS_TEMPLATE_SHEETS.addresses} 시트에 배송지 줄이 없습니다.`);
  }

  const priceHeader = locateColumns(
    input.priceRows,
    PRICE_COLUMNS,
    ['name', 'cost'],
    `${ONE_POLARIS_TEMPLATE_SHEETS.prices} 시트`,
  );
  const prices: OnePolarisPriceEntry[] = [];
  for (const row of input.priceRows.slice(priceHeader.headerRowIndex + 1)) {
    const name = cellText(row[priceHeader.index.name]);
    const cost = parseNumber(row[priceHeader.index.cost]);
    if (!name || cost === null) continue;
    prices.push({ name, cost });
  }
  if (prices.length === 0) {
    throw new OnePolarisFileError(`${ONE_POLARIS_TEMPLATE_SHEETS.prices} 시트에 상품 줄이 없습니다.`);
  }
  return { addresses, prices };
}

/** VLOOKUP 은 대소문자를 가리지 않는다. */
function lookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function compactKey(value: string): string {
  return lookupKey(value).replace(/\s+/g, '');
}

/**
 * 배송지에 맞는 주소록 줄. 정확히 같은 이름의 첫 줄이고, 없으면 잘린 이름으로 찾는다 —
 * 메일 엑셀은 긴 지점명을 잘라 보낸다('대구중앙플라톤센'). 잘린 이름이 표의 한 곳만 가리킬 때만
 * 그곳이다.
 */
export function findOnePolarisAddress(
  addresses: readonly OnePolarisAddressEntry[],
  site: string,
): OnePolarisAddressEntry | null {
  const key = lookupKey(site);
  if (!key) return null;
  const exact = addresses.find((entry) => lookupKey(entry.site) === key);
  if (exact) return exact;
  if (key.length >= 3) {
    const prefixed = addresses.filter((entry) => lookupKey(entry.site).startsWith(key));
    if (prefixed.length === 1) return prefixed[0];
  }
  return null;
}

/** 상품명에 맞는 단가 줄. 정확히 같은 이름의 첫 줄이고, 없으면 띄어쓰기만 다른 첫 줄이다. */
export function findOnePolarisPrice(
  prices: readonly OnePolarisPriceEntry[],
  name: string,
): OnePolarisPriceEntry | null {
  const key = lookupKey(name);
  if (!key) return null;
  const exact = prices.find((entry) => lookupKey(entry.name) === key);
  if (exact) return exact;
  const compact = compactKey(name);
  return prices.find((entry) => compactKey(entry.name) === compact) ?? null;
}

/** 메일 엑셀의 제품명은 `2000포켓몬왕종합장_[G]` 처럼 꼬리가 붙는다. 단가 시트는 꼬리 없는 이름이다. */
export function stripOnePolarisProductTag(name: string): string {
  return name.replace(/\s*_\[[^\]]*\]\s*$/, '').trim();
}

export interface OnePolarisOrderRow {
  /** 꼬리를 뗀 제품명. */
  readonly productName: string;
  /** 숫자가 아니면 null — 칸을 비워 둔다. */
  readonly quantity: number | null;
  readonly site: string;
  /** 엑셀 날짜 일련번호(정수). 없으면 null. */
  readonly orderDateSerial: number | null;
}

export interface OnePolarisOrderSheet {
  readonly headerRowIndex: number;
  readonly rows: OnePolarisOrderRow[];
  /** 머리행 아래의 비어 있지 않은 줄 수. */
  readonly sourceRows: number;
  /** 제품명이 없어 건너뛴 줄 수. */
  readonly skippedRows: number;
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/** 날짜(현지 연·월·일)를 엑셀 날짜 일련번호로. */
export function excelSerialFromDate(date: Date): number {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EXCEL_EPOCH_UTC) / DAY_MS);
}

function orderDateSerial(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : excelSerialFromDate(value);
  const match = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(cellText(value));
  if (!match) return null;
  return Math.round(
    (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - EXCEL_EPOCH_UTC) / DAY_MS,
  );
}

/** 메일 주문 엑셀(줄 배열, 셀은 값 그대로)에서 주문 줄을 읽는다. */
export function readOnePolarisOrderRows(rows: readonly (readonly unknown[])[]): OnePolarisOrderSheet {
  const header = locateColumns(rows, ORDER_COLUMNS, ['product', 'quantity', 'site'], '원폴라리스 주문 엑셀');
  const orders: OnePolarisOrderRow[] = [];
  let sourceRows = 0;
  let skippedRows = 0;
  for (const row of rows.slice(header.headerRowIndex + 1)) {
    if (!row.some((cell) => cellText(cell) !== '')) continue;
    sourceRows += 1;
    const productName = stripOnePolarisProductTag(cellText(row[header.index.product]));
    if (!productName) {
      skippedRows += 1;
      continue;
    }
    orders.push({
      productName,
      quantity: parseNumber(row[header.index.quantity]),
      site: cellText(row[header.index.site]),
      orderDateSerial: header.index.orderedAt >= 0 ? orderDateSerial(row[header.index.orderedAt]) : null,
    });
  }
  return { headerRowIndex: header.headerRowIndex, rows: orders, sourceRows, skippedRows };
}

export type OnePolarisSellpiaCell = string | number;

export interface OnePolarisSellpiaBuild {
  /** 양식 시트의 자료 줄(머리행 제외). 칸 수는 머리행과 같다. */
  readonly rows: OnePolarisSellpiaCell[][];
  /** 주소록에 없어 전화 · 우편번호 · 주소를 비워 둔 배송지(처음 나온 순서). */
  readonly missingSites: string[];
  /** 단가에 없어 공급단가 · 공급합계를 비워 둔 상품(처음 나온 순서). */
  readonly missingProducts: string[];
}

/** 주문 줄마다 양식 시트 한 줄. 사장님 양식의 수식을 값으로 계산한 것이다. */
export function buildOnePolarisSellpiaRows(
  orders: readonly OnePolarisOrderRow[],
  template: Pick<OnePolarisSellpiaTemplate, 'addresses' | 'prices'>,
): OnePolarisSellpiaBuild {
  const rows: OnePolarisSellpiaCell[][] = [];
  const missingSites: string[] = [];
  const missingProducts: string[] = [];
  const column = ONE_POLARIS_SELLPIA_COLUMN;
  for (const order of orders) {
    const address = findOnePolarisAddress(template.addresses, order.site);
    if (!address && order.site && !missingSites.includes(order.site)) missingSites.push(order.site);
    const price = findOnePolarisPrice(template.prices, order.productName);
    if (!price && !missingProducts.includes(order.productName)) missingProducts.push(order.productName);

    const row: OnePolarisSellpiaCell[] = new Array<OnePolarisSellpiaCell>(ONE_POLARIS_SELLPIA_HEADERS.length).fill('');
    row[column.site] = order.site;
    row[column.billingPhone] = address?.phone ?? '';
    row[column.customerName] = order.site; // 양식: 수령인 = 배송지
    row[column.customerPhone] = address?.phone ?? ''; // 양식: 수령인 전화 = 청구 전화
    row[column.postcode] = address?.zip ?? '';
    row[column.address] = address?.address ?? '';
    row[column.productName] = order.productName;
    row[column.quantity] = order.quantity ?? '';
    row[column.unitCost] = price?.cost ?? '';
    row[column.totalCost] = price && order.quantity !== null ? order.quantity * price.cost : '';
    row[column.orderDate] = order.orderDateSerial ?? '';
    rows.push(row);
  }
  return { rows, missingSites, missingProducts };
}

const NOTE_NAME_LIMIT = 8;

function namesForNote(names: readonly string[]): string {
  const shown = names.slice(0, NOTE_NAME_LIMIT).join(', ');
  return names.length > NOTE_NAME_LIMIT ? `${shown} 외 ${names.length - NOTE_NAME_LIMIT}` : shown;
}

/** 변환은 됐지만 사람이 알아야 할 것. 비워 둔 칸은 셀피아에 그대로 올라가므로 먼저 채워야 한다. */
export function onePolarisConversionNotes(build: Pick<OnePolarisSellpiaBuild, 'missingSites' | 'missingProducts'>): string[] {
  const notes: string[] = [];
  if (build.missingSites.length > 0) {
    notes.push(
      `주소록에 없는 배송지 ${build.missingSites.length}곳 — 전화 · 우편번호 · 주소를 비워 두었습니다: ${namesForNote(build.missingSites)}`,
    );
  }
  if (build.missingProducts.length > 0) {
    notes.push(
      `단가에 없는 상품 ${build.missingProducts.length}개 — 공급단가 · 공급합계를 비워 두었습니다: ${namesForNote(build.missingProducts)}`,
    );
  }
  return notes;
}
