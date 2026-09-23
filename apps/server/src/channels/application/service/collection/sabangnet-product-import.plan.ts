import {
  SABANGNET_SHOP_MALL_KEYS,
} from '@kiditem/shared/sabangnet-mall-listings';
import {
  buildSalesProductOptionCombinations,
  nextSalesProductOptionCode,
  REGISTRATION_MALL_FIELD_VALUE_MAX,
  SALES_PRODUCT_SABANGNET_VALUE_KEYS,
  salesProductOptionKey,
  type SabangnetImportIssue,
  type SalesProductCertification,
} from '@kiditem/shared/sales-product';
import {
  deliveryFeeTypeFromSabangnet,
  isSabangnetSingleOption,
  optionSupplyStatusFromSabangnet,
  salesProductStatusFromSabangnet,
  taxTypeFromSabangnet,
  type SalesProductOptionDraft,
} from '../../../domain/sales-product/sales-product';
import { acceptedMallFields, type MallFieldRejection } from '../../../domain/registration/registration-mall-input';
import type { ProductSourceReadModel } from '../../../../products/application/port/in/product-source-read.port';
import type {
  SalesProductBasicsRecord,
  SalesProductChannelOverrideRecord,
  SalesProductCreateRecord,
} from '../../port/out/persistence/sales-product.repository.port';
import type {
  SabangnetChannelOverrideRow,
  SabangnetMallCategoryRow,
  SabangnetMallTemplateRow,
  SabangnetOptionRow,
  SabangnetProductRow,
  SabangnetSendRecordRow,
} from '../../port/out/documents/channel-document.models';

/**
 * 사방넷 엑셀 줄 → 판매상품 · 단품 · 몰별 값 계획(순수 함수, KID-264).
 *
 * 셀피아 연결(단품 구성)은 확실할 때만 한다:
 *  - 옵션 없는 상품: 사방넷 모델명(또는 모델NO)이 셀피아 상품코드와 정확히 같을 때.
 *  - 옵션 상품: 모델명의 셀피아 상품번호(`7747-4` → `7747`) 아래 옵션 가운데, 옵션명이 같거나 한쪽이 다른 쪽을
 *    담는 후보가 정확히 하나일 때. 둘 이상이면 비워 두고 사람이 편집 화면에서 고른다.
 */

/** 사방넷 쇼핑몰 코드 → 우리 몰 키. 리스팅 가져오기 표에 없는 몰(쿠팡 · 토스 · 인터파크)도 몰별 값은 받는다. */
const EXTRA_SHOP_MALL_KEYS: Record<string, string> = {
  shop0075: 'coupang',
  shop0583: 'toss',
  shop0004: 'interpark',
};

export function sabangnetShopMallKey(shopCode: string): string | null {
  return (SABANGNET_SHOP_MALL_KEYS as Record<string, string>)[shopCode] ?? EXTRA_SHOP_MALL_KEYS[shopCode] ?? null;
}

/** 같은 몰 키로 오는 사방넷 쇼핑몰이 둘이면(11번가 신 · 구) 표 앞쪽이 이긴다. */
function shopPriority(shopCode: string): number {
  const order = Object.keys(SABANGNET_SHOP_MALL_KEYS);
  const index = order.indexOf(shopCode);
  return index >= 0 ? index : order.length;
}

export interface PlannedSabangnetProduct {
  create: SalesProductCreateRecord;
  options: SalesProductOptionDraft[];
  overrides: { channelAccountId: string; shopCode: string; data: SalesProductChannelOverrideRecord }[];
  /**
   * 상품 상세설명. 판매 상품 칸이 아니라 Content 의 `imported` revision 으로 들어간다(KID-313 W2). 비었으면
   * null — 추가상품상세설명은 몰 시트 · 등록 payload 어느 곳도 보내지 않아 가져오지 않는다.
   */
  detail: { html: string } | null;
}

export interface SabangnetImportPlan {
  products: PlannedSabangnetProduct[];
  issues: SabangnetImportIssue[];
  overrideRows: number;
  skippedByShop: Record<string, number>;
}

const FORBIDDEN_IN_VALUE = /[|^<>]/g;

function clamp(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export function buildSabangnetImportPlan(input: {
  products: readonly SabangnetProductRow[];
  options: readonly SabangnetOptionRow[];
  overrides: readonly SabangnetChannelOverrideRow[];
  skus: readonly ProductSourceReadModel[];
  accounts: readonly { id: string; channel: string }[];
  /** 자체상품코드 → 이미 있는 판매상품코드. 대량등록 양식처럼 품번코드 없이 온 줄이 같은 상품을 찾는다. */
  existingCodeByOwnCode?: ReadonlyMap<string, string>;
}): SabangnetImportPlan {
  const issues: SabangnetImportIssue[] = [];
  const sourceCodeGroups = groupBy(input.skus, sku => sku.sourceOptionCode
    ? `${sku.sourceProductCode}-${sku.sourceOptionCode}` : sku.sourceProductCode);
  const skuByCode = new Map([...sourceCodeGroups].filter(([, rows]) => rows.length === 1)
    .map(([code, rows]) => [code, rows[0]!]));
  const skusByPrefix = new Map<string, ProductSourceReadModel[]>();
  for (const sku of input.skus) {
    const prefix = sku.sourceProductCode;
    skusByPrefix.set(prefix, [...(skusByPrefix.get(prefix) ?? []), sku]);
  }
  const skusByBarcode = groupBy(
    input.skus.filter((sku) => sku.barcode),
    (sku) => sku.barcode!.trim(),
  );
  const optionsByGoods = groupBy(input.options, (row) => row.goodsNo);
  const overridesByGoods = groupBy(input.overrides, (row) => row.goodsNo);
  const accountByChannel = new Map(input.accounts.map((account) => [account.channel, account.id]));
  const skippedByShop: Record<string, number> = {};
  const seenCodes = new Set<string>();
  const productGoods = new Set(input.products.map((row) => row.goodsNo).filter(Boolean) as string[]);

  for (const goodsNo of optionsByGoods.keys()) {
    if (!productGoods.has(goodsNo)) {
      issues.push({ kind: 'options', row: optionsByGoods.get(goodsNo)![0]!.row, code: goodsNo, message: '상품 파일에 없는 품번의 단품이라 넘겼습니다.' });
    }
  }

  const products: PlannedSabangnetProduct[] = [];
  for (const row of input.products) {
    // 사방넷처럼 자체상품코드가 같으면 같은 상품이다. 품번코드가 없는 새 상품은 자체상품코드를 판매상품코드로 쓴다.
    const code = (row.goodsNo ?? row.ownCode)!;
    if (seenCodes.has(code)) {
      issues.push({ kind: 'products', row: row.row, code, message: '같은 품번이 두 번 있어 뒤 줄을 넘겼습니다.' });
      continue;
    }
    seenCodes.add(code);
    if (row.salePrice === null) {
      issues.push({ kind: 'products', row: row.row, code, message: '판매가가 비어 있어 0원으로 옮깁니다.' });
    }
    const sourceOptionRows = row.goodsNo ? optionsByGoods.get(row.goodsNo) : undefined;
    const { optionAxes, options } = planOptions(row, code, sourceOptionRows, issues);
    const linkedOptions = options.map((option) =>
      linkOption(option, optionAxes.length === 0, row, { skuByCode, skusByPrefix, skusByBarcode }));
    products.push({
      create: {
        code,
        sabangnetGoodsNo: row.goodsNo,
        ...sabangnetProductBasics(row),
        optionAxes,
        sourceRaw: row.raw,
      },
      options: linkedOptions,
      overrides: row.goodsNo
        ? planOverrides(overridesByGoods.get(row.goodsNo) ?? [], accountByChannel, skippedByShop, issues)
        : [],
      detail: sabangnetDetail(row),
    });
  }
  return { products, issues, overrideRows: input.overrides.length, skippedByShop };
}

/**
 * 사방넷 상품 줄 → 판매상품 기본 칸. 새로 만들 때와, 다시 가져올 때 저장된 원문으로 지난 가져오기가 만든
 * 값(기준값)을 다시 구할 때 같은 매핑을 쓴다.
 */
export function sabangnetProductBasics(row: SabangnetProductRow): SalesProductBasicsRecord {
  return {
    name: clamp(row.name, 255)!,
    // 사방넷 엑셀에는 초안 편집 칸이 없다. 빈 값으로 만들고 사람이 채운다.
    description: '',
    targetAudience: null,
    ageGroup: null,
    productSize: null,
    colorVariantNames: [],
    boxSetQuantity: null,
    registrationDefaults: null,
    ownCode: clamp(row.ownCode, 100),
    shortName: clamp(row.shortName, 255),
    englishName: clamp(row.englishName, 255),
    printName: clamp(row.printName, 255),
    modelName: clamp(row.modelName, 60),
    modelNo: clamp(row.modelNo, 60),
    brand: clamp(row.brand, 50),
    manufacturer: clamp(row.manufacturer, 50),
    originCountry: clamp(row.originCountry, 50),
    originRegion: clamp(row.originRegion, 50),
    keywords: row.keywords.map((keyword) => keyword.slice(0, 60)).slice(0, 30),
    standardCategory: clamp(row.standardCategory, 40),
    status: salesProductStatusFromSabangnet(row.statusCode),
    taxType: taxTypeFromSabangnet(row.taxCode),
    deliveryFeeType: deliveryFeeTypeFromSabangnet(row.deliveryCode),
    deliveryFee: row.deliveryFee,
    stockManaged: row.stockManaged,
    imageUrls: row.imageUrls.slice(0, 30),
    noticeCategory: clamp(row.noticeCategory, 10),
    noticeValues: row.noticeValues.slice(0, 40),
    certifications: row.certification ? [row.certification satisfies SalesProductCertification] : [],
    // 사방넷 엑셀은 'KC 해당 없음'을 말하지 않는다. 인증 문서가 오면 있다고 보고, 없으면 사람이 채운다.
    kcStatus: row.certification ? 'exists' as const : 'unknown' as const,
    importDeclarationNo: clamp(row.importDeclarationNo, 60),
    adminMemo: row.adminMemo,
  };
}

function planOptions(
  row: SabangnetProductRow,
  code: string,
  optionRows: readonly SabangnetOptionRow[] | undefined,
  issues: SabangnetImportIssue[],
): { optionAxes: string[]; options: SalesProductOptionDraft[] } {
  if (optionRows && optionRows.length > 0) {
    const sorted = [...optionRows].sort((left, right) => left.optionCode.localeCompare(right.optionCode));
    const first = sorted[0]!;
    if (sorted.length === 1 && isSabangnetSingleOption(first.optionTitle, first.optionValue)) {
      return { optionAxes: [], options: [optionFromRow(first, [], row.salePrice ?? 0, row.tagPrice)] };
    }
    const axes = splitLevels(first.optionTitle ?? '선택');
    const optionAxes = axes.length > 0 ? axes : ['선택'];
    const usedKeys = new Set<string>();
    const options = sorted.map((optionRow) => {
      let values = splitLevels(optionRow.optionValue ?? '');
      if (values.length !== optionAxes.length) {
        if (optionAxes.length === 1) {
          values = [cleanValue(optionRow.optionValue ?? '') || optionRow.optionCode];
        } else {
          issues.push({ kind: 'options', row: optionRow.row, code: optionRow.optionCode, message: '옵션 단 수와 값 수가 달라 값을 한 칸에 담았습니다.' });
          values = [...values, ...Array(optionAxes.length).fill('-')].slice(0, optionAxes.length);
        }
      }
      let key = salesProductOptionKey(values);
      if (usedKeys.has(key)) {
        values = [...values.slice(0, -1), `${values[values.length - 1]} (${optionRow.optionCode.split('-')[1]})`];
        key = salesProductOptionKey(values);
      }
      usedKeys.add(key);
      return optionFromRow(optionRow, values, row.salePrice ?? 0, row.tagPrice);
    });
    return { optionAxes, options };
  }

  const isSingle = row.optionTitles.length === 0
    || (row.optionTitles.length === 1 && isSabangnetSingleOption(row.optionTitles[0], row.optionValueLists[0]?.[0]));
  if (isSingle) {
    return {
      optionAxes: [],
      options: [{ sabangnetOptionCode: `${code}-0001`, values: [], salePrice: row.salePrice ?? 0, normalPrice: row.tagPrice, supplyStatus: 'selling', components: [] }],
    };
  }
  const optionAxes = row.optionTitles.map((title, index) => cleanValue(title) || `옵션${index + 1}`);
  const combinations = buildSalesProductOptionCombinations(row.optionValueLists.map((values) => values.map(cleanValue)));
  const codes: string[] = [];
  const options = combinations.map((values) => {
    const optionCode = nextSalesProductOptionCode(code, codes);
    codes.push(optionCode);
    return { sabangnetOptionCode: optionCode, values, salePrice: row.salePrice ?? 0, normalPrice: row.tagPrice, supplyStatus: 'selling' as const, components: [] };
  });
  if (options.length === 0) {
    issues.push({ kind: 'products', row: row.row, code, message: '옵션 값이 비어 단품 하나로 옮깁니다.' });
    return {
      optionAxes: [],
      options: [{ sabangnetOptionCode: `${code}-0001`, values: [], salePrice: row.salePrice ?? 0, normalPrice: row.tagPrice, supplyStatus: 'selling', components: [] }],
    };
  }
  return { optionAxes, options };
}

function optionFromRow(row: SabangnetOptionRow, values: string[], basePrice: number, normalPrice: number | null): SalesProductOptionDraft {
  return {
    sabangnetOptionCode: row.optionCode,
    values,
    alias: row.alias,
    salePrice: Math.max(0, basePrice + row.extraPrice),
    normalPrice,
    supplyStatus: optionSupplyStatusFromSabangnet(row.supplyStatusCode),
    safetyStock: row.safetyStock && row.safetyStock > 0 ? row.safetyStock : null,
    components: [],
  };
}

function splitLevels(value: string): string[] {
  return value.split(':').map(cleanValue).filter(Boolean);
}

function cleanValue(value: string): string {
  return value.replace(FORBIDDEN_IN_VALUE, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function linkOption(
  option: SalesProductOptionDraft,
  single: boolean,
  row: SabangnetProductRow,
  index: {
    skuByCode: Map<string, ProductSourceReadModel>;
    skusByPrefix: Map<string, ProductSourceReadModel[]>;
    skusByBarcode: Map<string, ProductSourceReadModel[]>;
  },
): SalesProductOptionDraft {
  const { skuByCode, skusByPrefix, skusByBarcode } = index;
  let sku: ProductSourceReadModel | undefined;
  if (single) {
    sku = [row.modelName, row.modelNo]
      .map((code) => (code ? skuByCode.get(code.trim()) : undefined))
      .find(Boolean);
    // 모델명이 셀피아 상품번호만 적은 경우(`5346`): 그 번호 아래 셀피아 상품이 딱 하나일 때만.
    if (!sku && /^\d+$/.test(row.modelName?.trim() ?? '')) {
      const under = skusByPrefix.get(row.modelName!.trim()) ?? [];
      if (under.length === 1) sku = under[0];
    }
    // 자체상품코드가 바코드인 경우가 많다 — 그 바코드를 가진 셀피아 상품이 딱 하나일 때만.
    if (!sku && row.ownCode && /^\d{8,14}$/.test(row.ownCode.trim())) {
      const byBarcode = skusByBarcode.get(row.ownCode.trim()) ?? [];
      if (byBarcode.length === 1) sku = byBarcode[0];
    }
  } else {
    const prefix = /^\d+(-\d+)?$/.test(row.modelName ?? '') ? row.modelName!.split('-')[0]! : null;
    const candidates = prefix ? skusByPrefix.get(prefix) ?? [] : [];
    const value = normalizeName(option.values.join(''));
    if (value) {
      const named = candidates.filter((candidate) => candidate.optionName && normalizeName(candidate.optionName));
      const exact = named.filter((candidate) => normalizeName(candidate.optionName!) === value);
      const contains = named.filter((candidate) => {
        const name = normalizeName(candidate.optionName!);
        return name.length >= 2 && (value.includes(name) || name.includes(value));
      });
      if (exact.length === 1) sku = exact[0];
      else if (exact.length === 0 && contains.length === 1) sku = contains[0];
    }
  }
  if (!sku) return option;
  return {
    ...option,
    barcode: option.barcode ?? sku.barcode,
    components: [{ masterProductId: sku.masterProductId, quantity: 1 }],
  };
}

/** 상품 줄의 상세. 판매 상품이 아니라 Content revision 으로 간다. */
function sabangnetDetail(row: SabangnetProductRow): PlannedSabangnetProduct['detail'] {
  return row.detailHtml ? { html: row.detailHtml } : null;
}

/**
 * 몰별 값 줄 → 등록 대상에 둘 몰 전용 값. 등록 대상은 상품 사실(이름 · 가격 · 상세 · 홍보문 · 고시)을
 * 갖지 않으므로(KID-313 W2) 그 칸은 옮기지 않는다. 몰별 상세는 줄마다, 버린 몰별 값은 상품마다 한 줄로
 * 어느 몰의 무엇인지 알린다 — 조용히 버리지 않는다.
 */
function planOverrides(
  rows: readonly SabangnetChannelOverrideRow[],
  accountByChannel: Map<string, string>,
  skippedByShop: Record<string, number>,
  issues: SabangnetImportIssue[],
): PlannedSabangnetProduct['overrides'] {
  const ignored = ignoredMallValuesIssue(rows);
  if (ignored) issues.push(ignored);
  const byAccount = new Map<string, { shopCode: string; data: SalesProductChannelOverrideRecord }>();
  const sorted = [...rows].sort((left, right) => shopPriority(left.shopCode) - shopPriority(right.shopCode));
  for (const row of sorted) {
    if (row.detailHtml) {
      issues.push({
        kind: 'channel_overrides',
        row: row.row,
        code: row.goodsNo,
        message: '몰별 상세 override 는 더 이상 받지 않음 — 상세는 상품 상세 페이지 하나에서 고칩니다.',
      });
    }
    const mallKey = sabangnetShopMallKey(row.shopCode);
    const accountId = mallKey ? accountByChannel.get(mallKey) : undefined;
    if (!accountId) {
      skippedByShop[row.shopCode] = (skippedByShop[row.shopCode] ?? 0) + 1;
      continue;
    }
    if (byAccount.has(accountId)) continue;
    const hasValue = [row.salePrice, row.priceRateBp, row.name, row.promoText, row.noticeCategory, row.costPrice, row.stockPercent]
      .some((value) => value !== null && value !== undefined);
    if (!hasValue) continue;
    byAccount.set(accountId, {
      shopCode: row.shopCode,
      data: {
        stockPercent: row.stockPercent !== null ? Math.max(0, Math.min(100, row.stockPercent)) : null,
        sourceRaw: row.raw,
      },
    });
  }
  return [...byAccount.entries()].map(([channelAccountId, value]) => ({ channelAccountId, ...value }));
}

const IGNORED_MALL_VALUES = [
  ['판매가', (row: SabangnetChannelOverrideRow) => row.salePrice !== null],
  ['상품명', (row: SabangnetChannelOverrideRow) => Boolean(row.name?.trim())],
  ['홍보문', (row: SabangnetChannelOverrideRow) => Boolean(row.promoText?.trim())],
  ['고시', (row: SabangnetChannelOverrideRow) => Boolean(row.noticeCategory?.trim())],
] as const;

/** 한 상품의 몰별 값 줄에서 받지 않은 상품 사실 — `판매가(11번가 · 보리보리) · 상품명(11번가)` 처럼 한 줄. */
function ignoredMallValuesIssue(rows: readonly SabangnetChannelOverrideRow[]): SabangnetImportIssue | null {
  const parts = IGNORED_MALL_VALUES.flatMap(([label, carries]) => {
    const malls = [...new Set(rows.filter(carries).map((row) => row.shopName?.trim() || row.shopCode))];
    return malls.length ? [`${label}(${malls.join(' · ')})`] : [];
  });
  if (parts.length === 0) return null;
  return {
    kind: 'channel_overrides',
    row: rows[0]!.row,
    code: rows[0]!.goodsNo,
    message: `몰별 값은 더 이상 받지 않음 — ${parts.join(' · ')}. 판매 상품 한 곳에서 고칩니다.`,
  };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

export interface SabangnetMallValuesWrite {
  salesProductId: string;
  channelAccountId: string;
  /** `SALES_PRODUCT_SABANGNET_VALUE_KEYS` 키만. 빈 값은 넣지 않는다. */
  values: Record<string, string>;
}

/**
 * 송신 기록(몰 × 상품)이 가리키는 사방넷 분류 · 부가정보를 상품 × 몰 값으로 푼다. 같은 몰 계정으로 오는 쇼핑몰이
 * 둘이면(11번가 신 · 구) 몰별 값과 같이 표 앞쪽이 이긴다. 우리 몰 계정이 없거나 판매상품이 없으면 넘긴다.
 */
export function planSabangnetMallValues(input: {
  sendRecords: readonly Pick<SabangnetSendRecordRow, 'row' | 'shopCode' | 'goodsNo' | 'additionCode' | 'categoryCode'>[];
  categories: readonly SabangnetMallCategoryRow[];
  templates: readonly SabangnetMallTemplateRow[];
  productIdByCode: ReadonlyMap<string, string>;
  accounts: readonly { id: string; channel: string }[];
}): { writes: SabangnetMallValuesWrite[]; withCategory: number; withTemplate: number; issues: SabangnetImportIssue[] } {
  const categoryByCode = new Map(input.categories.map((row) => [row.code, row]));
  const templateByCode = new Map(input.templates.map((row) => [row.code, row]));
  const accountByChannel = new Map(input.accounts.map((account) => [account.channel, account.id]));
  const keys = SALES_PRODUCT_SABANGNET_VALUE_KEYS;
  const byPair = new Map<string, SabangnetMallValuesWrite>();
  const issues: SabangnetImportIssue[] = [];
  const sorted = [...input.sendRecords].sort((left, right) => shopPriority(left.shopCode) - shopPriority(right.shopCode));
  for (const record of sorted) {
    const mallKey = sabangnetShopMallKey(record.shopCode);
    const channelAccountId = mallKey ? accountByChannel.get(mallKey) : undefined;
    const salesProductId = input.productIdByCode.get(record.goodsNo);
    if (!channelAccountId || !salesProductId) continue;
    const pair = `${salesProductId}|${channelAccountId}`;
    if (byPair.has(pair)) continue;
    const category = record.categoryCode ? categoryByCode.get(record.categoryCode) : undefined;
    const template = record.additionCode ? templateByCode.get(record.additionCode) : undefined;
    const values: Record<string, string> = {};
    const put = (key: string, value: string | null | undefined) => {
      const text = value?.trim();
      if (text) values[key] = text;
    };
    put(keys.categoryCode, record.categoryCode);
    put(keys.categoryTitle, category?.title);
    // 분류를 따로 고르지 않은 송신은 부가정보의 기본 분류로 올라갔다.
    put(keys.categoryPath, category?.path ?? template?.path);
    put(keys.templateCode, record.additionCode);
    put(keys.templateTitle, template?.title);
    put(keys.namePrefix, template?.namePrefix);
    put(keys.nameSuffix, template?.nameSuffix);
    put(keys.detailTop, template?.detailTop);
    put(keys.detailBottom, template?.detailBottom);
    // 등록 설정이 받지 못하는 칸(2만 자를 넘는 추가문구 …)은 자르지 않고 빼고, 그 상품 줄에 어느 칸인지 알린다.
    const { mallFields, rejected } = acceptedMallFields(values);
    if (rejected.length > 0) {
      issues.push({
        kind: 'send_records',
        row: record.row,
        code: record.goodsNo,
        message: `몰 값을 저장하지 않음(${template?.mallName?.trim() || record.shopCode}) — ${rejected.map(mallFieldRejectionText).join(' · ')}.`,
      });
    }
    const accepted = Object.fromEntries(Object.entries(mallFields).map(([key, value]) => [key, String(value)]));
    if (Object.keys(accepted).length === 0) continue;
    byPair.set(pair, { salesProductId, channelAccountId, values: accepted });
  }
  const writes = [...byPair.values()];
  return {
    issues,
    writes,
    withCategory: writes.filter((write) => write.values[keys.categoryPath]).length,
    withTemplate: writes.filter((write) => write.values[keys.templateTitle]).length,
  };
}

function mallFieldRejectionText(rejection: MallFieldRejection): string {
  if (rejection.reason === 'too_long') return `${rejection.key}: ${REGISTRATION_MALL_FIELD_VALUE_MAX.toLocaleString('ko-KR')}자를 넘음`;
  if (rejection.reason === 'product_fact') return `${rejection.key}: 상품 사실은 판매 상품에서 고침`;
  return `${rejection.key}: 받을 수 없는 값`;
}
