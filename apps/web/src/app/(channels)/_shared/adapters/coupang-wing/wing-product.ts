import type { SalesProduct, TargetExecutionSnapshot } from '@kiditem/shared/sales-product';
import { resolveWingCategories } from './wing-category-resolution';
import {
  getWingCategoryDefinition,
  matchWingCategoryAlias,
  type WingCategoryKey,
} from './wing-category-presets';
import {
  WING_PRODUCT_DRAFT_DEFAULTS,
  type WingOption,
  type WingProduct,
  type WingProductDraftDefaults,
} from './wing-registration-excel';

/**
 * 판매상품 → 쿠팡 WING 상품 문서(KID-321).
 *
 * 상품 사실(사진 · 키워드 · 가격 · KID · 고시)은 판매상품에서 — 등록 실행이면 그 실행이 얼린 판매상품에서 —
 * 오고, WING 에만 있는 값(카테고리 · 노출상품명 · 등록상품명 · 구매옵션 · 재고)은 확인 창 값이나 등록 대상에
 * 저장된 WING 값에서 온다. 등록 실행이 얼린 `adapterPayload.wingProduct` 가 있으면 그 WING 값이 이기고,
 * 웹이 상품에서 다시 만들지 않는다.
 */

/** 노출상품명 상한(쿠팡 WING). */
export const WING_DISPLAY_NAME_MAX = 100;

const PURCHASE_OPTION_COLOR = '색상';
const PURCHASE_OPTION_QUANTITY = '수량';
const PURCHASE_OPTION_UNIT_WEIGHT = '개당 중량';
const DEFAULT_STOCK = 999;
const MAX_ADDITIONAL_IMAGES = 9;

/** 확인 창 · 등록 대상에 사는 WING 값의 키. 어댑터 `confirmation.fields` 와 같은 이름이다. */
export const WING_MALL_VALUE_KEYS = [
  'wingCategoryKey',
  'productName',
  'sellerProductName',
  'colorValue',
  'quantityValue',
  'unitWeightValue',
  'stock',
] as const;

type Values = Readonly<Record<string, string | undefined>>;

/**
 * 선행 가격 숫자를 떼어낸다.
 *
 * 셀피아 수집명은 `4000과일바구니딸깍이키링` 처럼 매입가를 접두어로 달고 온다. 판매자 내부 코드지 구매자용
 * 정보가 아니므로 노출상품명에서는 뗀다. 3~6자리 숫자가 맨 앞에 있고 뒤에 숫자가 아닌 글자가 이어질 때만이다.
 */
export function stripLeadingPriceCode(rawName: string): string {
  const name = (rawName ?? '').trim();
  const stripped = name.replace(/^\d{3,6}(?=\D)/, '').trim();
  return stripped || name;
}

/**
 * 노출상품명 조립: `{상품명} {수량}p  {용도·특징 키워드}` (최대 100자, 수량 토큰 뒤는 공백 두 칸 — 라이브 형식).
 * 키워드가 하나도 없으면 형식을 지어내지 않고 선행 가격만 뗀 원본을 쓴다. 키워드는 통째로 들어가는 것까지만.
 */
export function buildWingDisplayName(
  rawName: string,
  keywords: readonly string[],
  quantity = 1,
): string {
  const base = stripLeadingPriceCode(rawName);
  if (!base) return '';

  const compact = (value: string) => value.replace(/\s+/g, '');
  const baseCompact = compact(base);
  const seen = new Set<string>();
  const usable = keywords
    .map((keyword) => (keyword ?? '').trim())
    .filter((keyword) => {
      if (!keyword) return false;
      if (baseCompact.includes(compact(keyword))) return false;
      const key = compact(keyword);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (usable.length === 0) return base.slice(0, WING_DISPLAY_NAME_MAX);

  const count = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  const head = `${base} ${count}p`;
  if (head.length >= WING_DISPLAY_NAME_MAX) return head.slice(0, WING_DISPLAY_NAME_MAX);

  let out = head;
  for (const [index, keyword] of usable.entries()) {
    const next = index === 0 ? `${out}  ${keyword}` : `${out} ${keyword}`;
    if (next.length > WING_DISPLAY_NAME_MAX) break;
    out = next;
  }
  return out;
}

/** 쿠팡 최소 10원 단위. */
function normalizePrice(value: number): number {
  const n = Math.max(0, Math.round(value));
  return Math.round(n / 10) * 10;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sellingOption(product: SalesProduct): SalesProduct['options'][number] | null {
  return product.options.find((option) => option.supplyStatus !== 'unused') ?? null;
}

function purchaseOptions(product: SalesProduct, values: Values): WingOption[] {
  const color = text(values.colorValue) || product.colorVariantNames.join(', ').trim() || '단일';
  const quantity = text(values.quantityValue) || '1';
  const unitWeight = text(values.unitWeightValue);
  return [
    { type: PURCHASE_OPTION_COLOR, value: color },
    { type: PURCHASE_OPTION_QUANTITY, value: quantity },
    ...(unitWeight ? [{ type: PURCHASE_OPTION_UNIT_WEIGHT, value: unitWeight }] : []),
  ];
}

function stockValue(values: Values): number {
  const raw = text(values.stock);
  if (!raw) return DEFAULT_STOCK;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_STOCK;
}

/**
 * 판매상품 + WING 값 → WING 상품. 상세설명 이미지는 비워 둔다 — 보낼 때 서버가 렌더한 긴 이미지 한 장을
 * 넣는다. 대표이미지는 판매상품 사진의 첫 장, 추가이미지는 나머지(쿠팡 상한 9장)다.
 */
export function salesProductToWingProduct(
  product: SalesProduct,
  values: Values,
  defaults: WingProductDraftDefaults = WING_PRODUCT_DRAFT_DEFAULTS,
): WingProduct {
  const option = sellingOption(product);
  const salePrice = normalizePrice(option?.salePrice ?? 0);
  const listPrice = option?.normalPrice != null ? normalizePrice(option.normalPrice) : 0;
  const representativeImageUrl = product.imageUrls[0] ?? '';
  const noticeValues = [...defaults.defaultNoticeValues];
  if (noticeValues.length > 0) noticeValues[0] = product.name || noticeValues[0]!;
  return {
    categoryCell: getWingCategoryDefinition(text(values.wingCategoryKey))?.categoryCell ?? '',
    productName: text(values.productName) || buildWingDisplayName(product.name, product.keywords, 1),
    sellerProductName: text(values.sellerProductName) || product.name,
    brand: text(values.brand) || defaults.defaultBrand,
    maker: text(values.maker) || defaults.defaultMaker,
    searchKeyword: product.keywords.slice(0, 20).join(','),
    searchOptions: defaults.defaultSearchOptions,
    additionalImageUrls: product.imageUrls.slice(1, 1 + MAX_ADDITIONAL_IMAGES),
    detailImageUrls: [],
    noticeCategory: defaults.noticeCategory,
    noticeValues,
    variants: [{
      purchaseOptions: purchaseOptions(product, values),
      salePrice,
      origPrice: listPrice > salePrice ? listPrice : salePrice,
      stock: stockValue(values),
      representativeImageUrl,
      ...(option?.optionCode ? { vendorItemCode: option.optionCode } : {}),
    }],
  };
}

/**
 * 등록 실행의 WING 상품. 상품 사실은 실행이 얼린 판매상품에서, WING 값은 쿠팡 채널 어댑터가 준비 때 얼린
 * `adapterPayload.wingProduct`(등록 대상에 저장된 값 + 이름 + 업체상품코드)에서, 대표이미지는 실행이 얼린
 * `adapterPayload.representativeImage` 에서 온다. 얼린 문서에 없는 WING
 * 값(등록 마법사처럼 확인 창을 거치지 않은 실행)만 실행 값(`values`)에서 채운다.
 */
export function wingProductForExecution(
  snapshot: TargetExecutionSnapshot,
  values: Values,
  defaults: WingProductDraftDefaults = WING_PRODUCT_DRAFT_DEFAULTS,
): WingProduct {
  const base = salesProductToWingProduct(snapshot.product, values, defaults);
  const frozen = record(snapshot.adapterPayload.wingProduct);
  const frozenVariant = record(Array.isArray(frozen.variants) ? frozen.variants[0] : null);
  const baseVariant = base.variants[0]!;
  const vendorItemCode = text(frozenVariant.vendorItemCode) || text(snapshot.adapterPayload.vendorItemCode)
    || baseVariant.vendorItemCode;
  // 등록 실행이 얼린 대표이미지 자산(작업공간이 고른 업로드본 · AI 후보, KID-313 W3a)이 판매상품 사진 첫 장보다 이긴다.
  const representativeImageUrl = text(record(snapshot.adapterPayload.representativeImage).url)
    || baseVariant.representativeImageUrl;
  return {
    ...base,
    categoryCell: text(frozen.categoryCell) || base.categoryCell,
    productName: text(frozen.productName) || base.productName,
    sellerProductName: text(frozen.sellerProductName) || base.sellerProductName,
    variants: [{
      ...baseVariant,
      ...(Array.isArray(frozenVariant.purchaseOptions)
        ? { purchaseOptions: frozenVariant.purchaseOptions as WingOption[] }
        : {}),
      ...(typeof frozenVariant.stock === 'number' ? { stock: frozenVariant.stock } : {}),
      representativeImageUrl,
      ...(vendorItemCode ? { vendorItemCode } : {}),
    }],
  };
}

/** WING 값 검증 — 확인 창과 보내기 직전이 같은 규칙을 본다. 빈 배열이면 통과다. */
export function validateWingMallValues(values: Values): string[] {
  const errors: string[] = [];
  const category = getWingCategoryDefinition(text(values.wingCategoryKey));
  if (!category) errors.push('카테고리를 선택하세요.');
  const productName = text(values.productName);
  if (!productName) errors.push('노출상품명을 입력하세요.');
  else if (productName.length > WING_DISPLAY_NAME_MAX) {
    errors.push(`노출상품명은 ${WING_DISPLAY_NAME_MAX}자 이하여야 합니다 (현재 ${productName.length}자).`);
  }
  if (!text(values.sellerProductName)) errors.push('등록상품명(판매자관리용)을 입력하세요.');
  if (category?.requiredPurchaseOptionTypes.includes(PURCHASE_OPTION_UNIT_WEIGHT)) {
    const unitWeight = text(values.unitWeightValue);
    if (!unitWeight) {
      errors.push('개당 중량을 입력하세요.');
    } else {
      const numeric = unitWeight.replace(/\s*g$/i, '');
      if (!/^\d+(?:\.\d+)?$/.test(numeric) || Number(numeric) <= 0) {
        errors.push('개당 중량은 0보다 큰 숫자로 입력하세요.');
      }
    }
  }
  const stock = Number(text(values.stock));
  if (!text(values.stock) || !Number.isInteger(stock) || stock < 0) {
    errors.push('재고수량은 0 이상의 정수여야 합니다.');
  }
  return errors;
}

/** 보내기 직전의 WING 상품 검증. 가격은 판매상품의 확정 판매가에서 온다. */
export function validateWingProduct(product: WingProduct): string[] {
  const errors: string[] = [];
  if (!product.categoryCell) errors.push('WING 카테고리가 정해지지 않았습니다. 등록 확인에서 카테고리를 고르세요.');
  if (!product.productName.trim()) errors.push('노출상품명이 비어 있습니다.');
  const variant = product.variants[0];
  if (!variant || variant.salePrice <= 0) {
    errors.push('판매가가 없습니다. 판매상품에서 판매가를 먼저 정하세요.');
  }
  const category = matchWingCategoryAlias(product.categoryCell);
  if (category?.requiredPurchaseOptionTypes.includes(PURCHASE_OPTION_UNIT_WEIGHT)
    && !variant?.purchaseOptions.some((option) => option.type === PURCHASE_OPTION_UNIT_WEIGHT && option.value.trim())) {
    errors.push('이 카테고리는 개당 중량이 필요합니다. 등록 확인에서 개당 중량을 넣으세요.');
  }
  return errors;
}

/**
 * 등록 대상에 저장할 WING 값(`registrationInput.adapter.coupang`). 상품 사실(가격 · 사진 · 고시)은 싣지 않는다 —
 * 그건 판매상품이 정본이다(KID-313). 쿠팡 채널 어댑터가 준비 때 이 값을 읽어 `adapterPayload` 에 얼린다.
 * 확인 창 값이 없으면(등록 마법사) null — 저장할 것이 없다.
 */
export function wingTargetInput(values: Values): Record<string, unknown> | null {
  const productName = text(values.productName);
  if (!productName) return null;
  const wingCategoryKey = text(values.wingCategoryKey);
  const unitWeight = text(values.unitWeightValue);
  return {
    wingCategoryKey,
    wingProduct: {
      categoryCell: getWingCategoryDefinition(wingCategoryKey)?.categoryCell ?? '',
      productName,
      sellerProductName: text(values.sellerProductName),
      variants: [{
        purchaseOptions: [
          ...(text(values.colorValue) ? [{ type: PURCHASE_OPTION_COLOR, value: text(values.colorValue) }] : []),
          ...(text(values.quantityValue) ? [{ type: PURCHASE_OPTION_QUANTITY, value: text(values.quantityValue) }] : []),
          ...(unitWeight ? [{ type: PURCHASE_OPTION_UNIT_WEIGHT, value: unitWeight }] : []),
        ],
        stock: stockValue(values),
      }],
    },
  };
}

/**
 * 확인 창 기본값. 등록 대상에 저장된 WING 값이 있으면 그것이, 없으면 판매상품에서 만든 값이다.
 * 값을 지어내지 않는다 — 비어 있으면 비어 있는 채로 보여 사람이 채우게 한다.
 */
export function defaultWingMallValues(
  product: SalesProduct,
  categoryKey: string,
  saved: Record<string, unknown> | null,
): Record<string, string> {
  const wing = salesProductToWingProduct(product, { wingCategoryKey: categoryKey });
  const savedProduct = record(saved?.wingProduct);
  const savedVariant = record(Array.isArray(savedProduct.variants) ? savedProduct.variants[0] : null);
  const savedOptions = Array.isArray(savedVariant.purchaseOptions) ? savedVariant.purchaseOptions as WingOption[] : null;
  const variant = wing.variants[0]!;
  const optionValue = (type: string) =>
    (savedOptions ?? variant.purchaseOptions).find((option) => option.type === type)?.value ?? '';
  return {
    wingCategoryKey: text(saved?.wingCategoryKey) || categoryKey,
    productName: text(savedProduct.productName) || wing.productName,
    sellerProductName: text(savedProduct.sellerProductName) || wing.sellerProductName || '',
    colorValue: optionValue(PURCHASE_OPTION_COLOR),
    quantityValue: optionValue(PURCHASE_OPTION_QUANTITY),
    unitWeightValue: optionValue(PURCHASE_OPTION_UNIT_WEIGHT),
    stock: String(typeof savedVariant.stock === 'number' ? savedVariant.stock : variant.stock),
  };
}

/** 추천으로 카테고리를 골랐을 때의 근거. 확인 창에서 사람이 검증할 수 있게 함께 보여 준다. */
export interface WingCategoryEvidence {
  confidence: 'high' | 'medium' | 'low';
  score: number;
  path: string;
  basedOn: string[];
  /** 자동적용 기준을 넘겨 카테고리가 이미 채워졌는지. */
  applied: boolean;
}

/**
 * WING 카테고리 기본값: 저장된 키 → 판매상품 분류의 정확한 별칭 → 기존 쿠팡 등록상품 기반 추천(신뢰도가 높을
 * 때만 적용). 못 정하면 빈 값이다 — 다른 카테고리로 채우지 않는다.
 */
export async function resolveWingCategoryDefault(
  product: SalesProduct,
  savedKey: string | null,
): Promise<{ key: WingCategoryKey | ''; evidence: WingCategoryEvidence | null }> {
  const saved = savedKey ? getWingCategoryDefinition(savedKey) : null;
  if (saved) return { key: saved.key, evidence: null };
  const aliased = matchWingCategoryAlias(product.standardCategory ?? '');
  if (aliased) return { key: aliased.key, evidence: null };
  const name = product.name.trim();
  if (!name) return { key: '', evidence: null };
  try {
    const resolved = (await resolveWingCategories([name])).get(name);
    const suggestion = resolved?.suggestion;
    const matched = resolved?.categoryCell ? matchWingCategoryAlias(resolved.categoryCell) : null;
    return {
      key: matched?.key ?? '',
      evidence: suggestion
        ? {
          confidence: suggestion.confidence,
          score: suggestion.score,
          path: suggestion.path,
          basedOn: suggestion.basedOn.slice(0, 3),
          applied: Boolean(matched),
        }
        : null,
    };
  } catch {
    // 추천은 부가 정보다. 실패해도 확인 창을 막지 않는다.
    return { key: '', evidence: null };
  }
}

/** 일괄등록(엑셀): 상품마다 카테고리를 정하고, 못 정한 상품이 하나라도 있으면 파일을 만들지 않는다. */
export async function resolveWingCategorySelections(
  products: readonly SalesProduct[],
): Promise<WingCategoryKey[]> {
  const keys = products.map((product) => matchWingCategoryAlias(product.standardCategory ?? '')?.key ?? '');
  const unresolvedIndexes = keys.flatMap((key, index) => (key ? [] : [index]));
  if (unresolvedIndexes.length > 0) {
    const names = unresolvedIndexes.map((index) => products[index]!.name.trim());
    const resolved = await resolveWingCategories(names);
    for (const index of unresolvedIndexes) {
      const categoryCell = resolved.get(products[index]!.name.trim())?.categoryCell;
      const matched = categoryCell ? matchWingCategoryAlias(categoryCell) : null;
      if (matched) keys[index] = matched.key;
    }
  }
  const unresolvedNames = products.filter((_, index) => !keys[index]).map((product) => product.name);
  if (unresolvedNames.length > 0) {
    throw new Error(
      `WING 카테고리가 선택되지 않은 상품이 ${unresolvedNames.length}건 있습니다. ${unresolvedNames.slice(0, 3).join(', ')} `
      + '각 상품의 WING 등록 확인에서 카테고리를 먼저 선택해 주세요.',
    );
  }
  return keys as WingCategoryKey[];
}
