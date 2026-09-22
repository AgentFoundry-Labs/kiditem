import {
  SABANGNET_SHOP_MALL_KEYS,
} from '@kiditem/shared/sabangnet-mall-listings';
import {
  buildSalesProductOptionCombinations,
  nextSalesProductOptionCode,
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
import type { ProductSourceReadModel } from '../../../../products/application/port/in/product-source-read.port';
import type {
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
    const extraPriceBySourceCode = new Map((sourceOptionRows ?? []).map((option) => [option.optionCode, option.extraPrice]));
    const optionPriceInputs = linkedOptions.flatMap((option) => {
      const sabangnetOptionCode = option.sabangnetOptionCode;
      return sabangnetOptionCode
        ? [{ sabangnetOptionCode, extraPrice: extraPriceBySourceCode.get(sabangnetOptionCode) ?? 0 }]
        : [];
    });
    products.push({
      create: {
        code,
        sabangnetGoodsNo: row.goodsNo,
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
        detailHtml: row.detailHtml,
        extraDetailHtml: row.extraDetailHtml.slice(0, 3),
        noticeCategory: clamp(row.noticeCategory, 10),
        noticeValues: row.noticeValues.slice(0, 40),
        certifications: row.certification ? [row.certification satisfies SalesProductCertification] : [],
        // 사방넷 엑셀은 'KC 해당 없음'을 말하지 않는다. 인증 문서가 오면 있다고 보고, 없으면 사람이 채운다.
        kcStatus: row.certification ? 'exists' as const : 'unknown' as const,
        importDeclarationNo: clamp(row.importDeclarationNo, 60),
        adminMemo: row.adminMemo,
        optionAxes,
        sourceRaw: row.raw,
      },
      options: linkedOptions,
      overrides: row.goodsNo
        ? planOverrides(overridesByGoods.get(row.goodsNo) ?? [], accountByChannel, skippedByShop, {
          sourceBasePrice: row.salePrice ?? 0,
          options: optionPriceInputs,
        })
        : [],
    });
  }
  return { products, issues, overrideRows: input.overrides.length, skippedByShop };
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

function planOverrides(
  rows: readonly SabangnetChannelOverrideRow[],
  accountByChannel: Map<string, string>,
  skippedByShop: Record<string, number>,
  source: {
    sourceBasePrice: number;
    options: readonly { sabangnetOptionCode: string; extraPrice: number }[];
  },
): PlannedSabangnetProduct['overrides'] {
  const byAccount = new Map<string, { shopCode: string; data: SalesProductChannelOverrideRecord }>();
  const sorted = [...rows].sort((left, right) => shopPriority(left.shopCode) - shopPriority(right.shopCode));
  for (const row of sorted) {
    const mallKey = sabangnetShopMallKey(row.shopCode);
    const accountId = mallKey ? accountByChannel.get(mallKey) : undefined;
    if (!accountId) {
      skippedByShop[row.shopCode] = (skippedByShop[row.shopCode] ?? 0) + 1;
      continue;
    }
    if (byAccount.has(accountId)) continue;
    const hasValue = [row.salePrice, row.priceRateBp, row.name, row.detailHtml, row.promoText, row.noticeCategory, row.costPrice, row.stockPercent]
      .some((value) => value !== null && value !== undefined);
    if (!hasValue) continue;
    const baseMallPrice = row.salePrice !== null
      ? row.salePrice
      : row.priceRateBp !== null
        ? Math.round((source.sourceBasePrice * row.priceRateBp) / 10_000)
        : null;
    const optionPrices = baseMallPrice === null
      ? undefined
      : source.options.map(({ sabangnetOptionCode, extraPrice }) => ({
        sabangnetOptionCode,
        // This is the one-time legacy import calculation. The source mall
        // price is resolved first, then each source option's extra is applied.
        salePrice: Math.max(0, baseMallPrice + extraPrice),
      }));
    byAccount.set(accountId, {
      shopCode: row.shopCode,
      data: {
        optionPrices,
        salePrice: row.salePrice,
        priceRateBp: row.priceRateBp,
        costPrice: row.costPrice,
        name: clamp(row.name, 255),
        detailHtml: row.detailHtml,
        promoText: clamp(row.promoText, 255),
        noticeCategory: clamp(row.noticeCategory, 10),
        stockPercent: row.stockPercent !== null ? Math.max(0, Math.min(100, row.stockPercent)) : null,
        sourceRaw: row.raw,
      },
    });
  }
  return [...byAccount.entries()].map(([channelAccountId, value]) => ({ channelAccountId, ...value }));
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

const MALL_VALUE_MAX = 2000;

/**
 * 송신 기록(몰 × 상품)이 가리키는 사방넷 분류 · 부가정보를 상품 × 몰 값으로 푼다. 같은 몰 계정으로 오는 쇼핑몰이
 * 둘이면(11번가 신 · 구) 몰별 값과 같이 표 앞쪽이 이긴다. 우리 몰 계정이 없거나 판매상품이 없으면 넘긴다.
 */
export function planSabangnetMallValues(input: {
  sendRecords: readonly Pick<SabangnetSendRecordRow, 'shopCode' | 'goodsNo' | 'additionCode' | 'categoryCode'>[];
  categories: readonly SabangnetMallCategoryRow[];
  templates: readonly SabangnetMallTemplateRow[];
  productIdByCode: ReadonlyMap<string, string>;
  accounts: readonly { id: string; channel: string }[];
}): { writes: SabangnetMallValuesWrite[]; withCategory: number; withTemplate: number } {
  const categoryByCode = new Map(input.categories.map((row) => [row.code, row]));
  const templateByCode = new Map(input.templates.map((row) => [row.code, row]));
  const accountByChannel = new Map(input.accounts.map((account) => [account.channel, account.id]));
  const keys = SALES_PRODUCT_SABANGNET_VALUE_KEYS;
  const byPair = new Map<string, SabangnetMallValuesWrite>();
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
      if (text) values[key] = text.length > MALL_VALUE_MAX ? text.slice(0, MALL_VALUE_MAX) : text;
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
    if (Object.keys(values).length === 0) continue;
    byPair.set(pair, { salesProductId, channelAccountId, values });
  }
  const writes = [...byPair.values()];
  return {
    writes,
    withCategory: writes.filter((write) => write.values[keys.categoryPath]).length,
    withTemplate: writes.filter((write) => write.values[keys.templateTitle]).length,
  };
}
