import { mallDisplayName, SALES_PRODUCT_SABANGNET_VALUE_KEYS } from '@kiditem/shared/sales-product';
import {
  detailImageUrls,
  isPublicImageUrl,
  type MallBulkSheetSpec,
  type MallSheetMallValues,
  type MallSheetProduct,
} from './mall-bulk-sheet';
import type { MallCategoryLookup } from './mall-sheet-categories';

/** 몰 엑셀을 만들려고 읽은 판매상품 한 건(저장소가 채운다). */
export interface MallSheetSourceProduct {
  id: string;
  code: string;
  ownCode: string | null;
  name: string;
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  modelNo: string | null;
  originCountry: string | null;
  keywords: string[];
  taxType: MallSheetProduct['taxType'];
  salePrice: number;
  tagPrice: number | null;
  imageUrls: string[];
  detailHtml: string | null;
  noticeCategory: string | null;
  certificationNumbers: string[];
  optionAxes: string[];
  options: {
    id?: string;
    code: string;
    values: string[];
    /** canonical final price, before a mall target override is applied. */
    salePrice?: number;
    normalPrice?: number | null;
    /** legacy source-only delta; normalized to salePrice before transport. */
    extraPrice?: number;
    barcode: string | null;
    supplyStatus: string;
  }[];
  /** 몰별 값(몰 키 · 몰 계정마다). */
  overrides: {
    mallKey: string;
    targetId?: string;
    selectedOptionIds?: string[];
    salePrice: number | null;
    priceRateBp: number | null;
    name: string | null;
    detailHtml: string | null;
    promoText: string | null;
    optionPrices?: {
      salesProductOptionId: string;
      salePrice: number | null;
      normalPrice: number | null;
      supplyPrice: number | null;
    }[];
    adapterValues: Record<string, string>;
  }[];
  /** 사방넷에서 옮기기 전 사진 주소(대표 · 부가 순서). */
  sabangnetImageUrls: string[];
}

const KEYS = SALES_PRODUCT_SABANGNET_VALUE_KEYS;

/** 상품 × 몰에서 고른 등록 설정: 몰 키 → 등록 설정 id. 비어 있으면 0개/1개 흐름이다. */
export type MallTargetSelection = ReadonlyMap<string, string>;

type MallOverride = MallSheetSourceProduct['overrides'][number];

/** 이 몰의 등록 설정들(ADR-0020) — 만든 순서 그대로. 0개면 공통값, 1개면 자동, 2개 이상이면 골라야 한다. */
export function mallTargets(source: MallSheetSourceProduct, mallKey: string): MallOverride[] {
  return source.overrides.filter((item) => item.mallKey === mallKey);
}

/** 이 몰의 등록 설정 경로 — 사람이 정한 값, 없으면 사방넷에서 옮긴 경로. */
export function mallTargetCategoryPath(override: MallOverride): string | null {
  const values = override.adapterValues;
  return values.categoryPath?.trim() || values[KEYS.categoryPath]?.trim() || null;
}

/**
 * 이 몰에서 쓸 등록 설정 하나. 하나뿐이면 그것, 고른 것이 있으면 그것. 둘 이상인데 고르지 않았으면
 * `unselected` — 이때 값을 하나 몰래 고르지 않는다(틀린 가격이 몰로 간다).
 */
export function pickMallOverride(
  source: MallSheetSourceProduct,
  mallKey: string,
  selection: MallTargetSelection = new Map(),
): { override: MallOverride | null; unselected: boolean } {
  const targets = mallTargets(source, mallKey);
  if (targets.length <= 1) return { override: targets[0] ?? null, unselected: false };
  const chosen = selection.get(mallKey);
  const override = chosen ? targets.find((item) => item.targetId === chosen) ?? null : null;
  return override ? { override, unselected: false } : { override: null, unselected: true };
}

/** 이 파일이 다루는 몰 중 등록 설정을 아직 고르지 않은 몰. */
export function unselectedMalls(
  source: MallSheetSourceProduct,
  mallKeys: readonly string[],
  selection: MallTargetSelection = new Map(),
): string[] {
  return mallKeys.filter((mallKey) => pickMallOverride(source, mallKey, selection).unselected);
}

// 몰 등록 폼과 같은 이름을 보내야 해서 공용 함수를 쓴다(`@kiditem/shared/sales-product`).
export { mallDisplayName };

/**
 * 분류 체계가 같은 다른 몰의 경로를 빌려 온다. 그 경로가 이 몰 표에서 번호로 풀릴 때만 돌려준다 — 이름만 같고
 * 번호가 없는 경로를 넘기면 엑셀에 빈 분류가 들어간다.
 */
function borrowCategoryPath(
  source: MallSheetSourceProduct,
  spec: Pick<MallBulkSheetSpec, 'categorySharesWith'>,
  mallKey: string,
  categories: MallCategoryLookup,
  selection: MallTargetSelection,
): string | null {
  for (const donor of spec.categorySharesWith ?? []) {
    const path = donorCategoryPath(source, donor, selection);
    if (path && categories.code(mallKey, path)) return path;
  }
  return null;
}

/**
 * 빌려 올 몰이 가리키는 분류 경로. 그 몰 설정을 골랐으면 고른 것, 아니면 설정들이 **한 경로로 모일 때만** 그 경로다 —
 * 설정마다 분류가 다르면 어느 쪽인지 알 수 없어 빌리지 않는다.
 */
function donorCategoryPath(
  source: MallSheetSourceProduct,
  donor: string,
  selection: MallTargetSelection,
): string | null {
  const { override } = pickMallOverride(source, donor, selection);
  if (override) return mallTargetCategoryPath(override);
  const paths = new Set(mallTargets(source, donor)
    .map(mallTargetCategoryPath)
    .filter((path): path is string => path !== null));
  return paths.size === 1 ? [...paths][0]! : null;
}

function joinText(parts: readonly (string | null | undefined)[], separator: string): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(separator);
}

/**
 * 몰이 읽을 주소로 — 이미 공개된 주소는 그대로, 우리 저장소 주소는 공개 복사본으로. 복사본이 없으면 null.
 */
export function publicUrlOf(url: string, publicCopies: ReadonlyMap<string, string>): string | null {
  if (isPublicImageUrl(url)) return url;
  return publicCopies.get(url) ?? null;
}

/**
 * 상세설명 HTML 의 사진 주소를 공개 복사본으로 바꾼다. 복사본이 없는 사진은 그대로 둔다(몰에서 깨진다).
 *
 * 바꾼 사진에는 `referrerpolicy="no-referrer"` 를 붙인다. 복사본이 있는 카카오 CDN 은 다른 몰 화면이 보내는 리퍼러를 보고
 * 막는다 — 리퍼러를 보내지 않으면 열린다(확장 `detailImageHtml` 과 같은 까닭, 라이브 확인 2026-09-10).
 */
export function withPublicDetailImages(html: string | null, publicCopies: ReadonlyMap<string, string>): string | null {
  if (!html) return html;
  let result = html;
  const copies: string[] = [];
  for (const url of detailImageUrls(html)) {
    const copy = isPublicImageUrl(url) ? null : publicCopies.get(url);
    if (!copy) continue;
    result = result.split(url).join(copy);
    copies.push(copy);
  }
  if (copies.length === 0) return result;
  return result.replace(/<img\b[^>]*>/gi, (tag) =>
    copies.some((copy) => tag.includes(copy)) && !/\breferrerpolicy\s*=/i.test(tag)
      ? tag.replace(/^<img\b/i, '<img referrerpolicy="no-referrer"')
      : tag);
}

type ImageSource = Pick<MallSheetSourceProduct, 'imageUrls' | 'detailHtml' | 'overrides'>;

/** 판매상품 사진 · 상세설명 사진(몰별 상세 포함) 중 몰이 못 읽는(우리 저장소) 주소. */
export function privateImageUrls(source: ImageSource): string[] {
  const urls = [
    ...source.imageUrls,
    ...detailImageUrls(source.detailHtml),
    ...source.overrides.flatMap((override) => detailImageUrls(override.detailHtml)),
  ];
  return [...new Set(urls)].filter((url) => !isPublicImageUrl(url));
}

/** 몰이 못 읽고 공개 복사본도 아직 없는 주소 — [사진 올리기]가 올릴 것. */
export function pendingPublicImages(source: ImageSource, publicCopies: ReadonlyMap<string, string>): string[] {
  return privateImageUrls(source).filter((url) => !publicCopies.has(url));
}

/**
 * 이 몰 엑셀에 들어갈 사진 중 몰이 못 읽는 주소. 대표 사진은 사방넷 주소로 물러설 수 있으면 막지 않지만(경고만),
 * 상세설명 사진은 물러설 곳이 없어 남으면 몰 화면에서 깨진다.
 */
export function unreadableSheetImages(source: Pick<MallSheetSourceProduct, 'imageUrls'>, product: MallSheetProduct): string[] {
  const main = product.imageSource === 'none' ? source.imageUrls.filter((url) => !isPublicImageUrl(url)) : [];
  const detail = Object.values(product.malls)
    .flatMap((mall) => detailImageUrls(mall.detailHtml))
    .filter((url) => !isPublicImageUrl(url));
  return [...new Set([...main, ...detail])];
}

/** 판매상품 한 건을 몰 규칙이 받는 모양으로 — 몰별 가격 · 이름 · 상세 · 카테고리 번호를 이 몰 기준으로 푼다. */
export function toMallSheetProduct(
  source: MallSheetSourceProduct,
  spec: Pick<MallBulkSheetSpec, 'mallKeys' | 'categorySharesWith'>,
  categories: MallCategoryLookup,
  /** 우리 저장소 주소 → 몰이 읽는 공개 복사본(사진 올리기로 만든 것). */
  publicCopies: ReadonlyMap<string, string> = new Map(),
  /** 몰마다 고른 등록 설정. 설정이 둘 이상인 몰은 이 선택이 있어야 그 설정 값으로 푼다. */
  selection: MallTargetSelection = new Map(),
): MallSheetProduct {
  // 사진이 전부 몰이 읽는 주소로 바뀌어야 우리 사진을 쓴다. 하나라도 못 바꾸면 사방넷 원래 주소로 물러선다.
  const mapped = source.imageUrls.map((url) => publicUrlOf(url, publicCopies));
  const own = mapped.every((url): url is string => url !== null) ? mapped as string[] : [];
  const sabangnet = source.sabangnetImageUrls.filter(isPublicImageUrl);
  const imageSource = own.length ? 'own' : sabangnet.length ? 'sabangnet' : 'none';

  const malls: Record<string, MallSheetMallValues> = {};
  const selling = source.options
    .filter((option) => option.supplyStatus === 'selling')
    .map((option) => ({
      ...option,
      salePrice: option.salePrice ?? source.salePrice + (option.extraPrice ?? 0),
      normalPrice: option.normalPrice ?? source.tagPrice,
    }));
  const hasLegacyOptionDeltas = source.options.some((option) => option.salePrice === undefined);
  const canonicalBasePrice = hasLegacyOptionDeltas
    ? source.salePrice
    : selling.length > 0
      ? Math.min(...selling.map((option) => option.salePrice))
      : source.salePrice;
  for (const mallKey of spec.mallKeys) {
    // 설정이 둘 이상이면 고른 것만 쓴다. 고르지 않았으면 공통값으로 두고, 파일은 서비스가 막는다 —
    // 첫 번째를 조용히 고르면 다른 설정의 가격이 몰로 올라간다.
    const { override } = pickMallOverride(source, mallKey, selection);
    const selectedIds = override?.selectedOptionIds ? new Set(override.selectedOptionIds) : null;
    const selected = selling.filter((option) => !selectedIds || !option.id || selectedIds.has(option.id));
    const resolved = selected.map((option) => ({
      ...option,
      salePrice: resolvedSalePrice(option, override),
      normalPrice: resolvedNormalPrice(option, override),
    }));
    const hasExplicitTargetPrice = override?.optionPrices?.some((item) => item.salePrice !== null && item.salePrice !== undefined)
      || (override?.optionPrices === undefined && override?.salePrice !== null && override?.salePrice !== undefined);
    const basePrice = hasExplicitTargetPrice && resolved.length > 0
      ? Math.min(...resolved.map((option) => option.salePrice))
      : canonicalBasePrice;
    const optionPrices = Object.fromEntries(resolved.map((option) => [option.code, option.salePrice]));
    const optionNormalPrices = Object.fromEntries(resolved.map((option) => [option.code, option.normalPrice]));
    const optionSupplyPrices = Object.fromEntries(resolved.map((option) => [
      option.code,
      override?.optionPrices?.find((item) => item.salesProductOptionId === option.id)?.supplyPrice ?? null,
    ]));
    const values = override?.adapterValues ?? {};
    const ownPath = values.categoryPath?.trim() || values[KEYS.categoryPath]?.trim() || null;
    // 분류 체계가 같은 몰에서 빌려 온다(온채널 ← 스마트스토어). 이 몰 표에서 번호가 나올 때만 쓴다.
    const borrowed = ownPath ? null : borrowCategoryPath(source, spec, mallKey, categories, selection);
    const categoryPath = ownPath ?? borrowed;
    const explicitCode = values.categoryCode?.trim() || null;
    malls[mallKey] = {
      salePrice: basePrice,
      optionPrices,
      optionNormalPrices,
      optionSupplyPrices,
      selectedOptionCodes: selected.map((option) => option.code),
      name: override?.name?.trim()
        || joinText([values[KEYS.namePrefix], mallDisplayName(source.name), values[KEYS.nameSuffix]], ' '),
      nameIsMallSpecific: Boolean(override?.name?.trim()),
      promoText: override?.promoText?.trim() || null,
      detailHtml: withPublicDetailImages(
        override?.detailHtml?.trim()
          || joinText([values[KEYS.detailTop], source.detailHtml, values[KEYS.detailBottom]], '\n')
          || null,
        publicCopies,
      ),
      categoryPath,
      categoryCode: explicitCode ?? categories.code(mallKey, categoryPath),
      values,
    };
  }

  const commonNormalPrice = commonPrice(selling.map((option) => option.normalPrice));
  return {
    salesProductId: source.id,
    code: source.code,
    ownCode: source.ownCode,
    internalName: source.name,
    brand: source.brand,
    manufacturer: source.manufacturer,
    modelName: source.modelName,
    modelNo: source.modelNo,
    originCountry: source.originCountry,
    keywords: source.keywords,
    taxType: source.taxType,
    tagPrice: commonNormalPrice ?? source.tagPrice,
    imageUrls: imageSource === 'own' ? own : sabangnet,
    imageSource,
    noticeCategory: source.noticeCategory,
    certificationNumbers: source.certificationNumbers,
    optionAxes: source.optionAxes,
    options: selling.map((option) => ({
      id: option.id,
      code: option.code,
      values: option.values,
      extraPrice: option.salePrice - canonicalBasePrice,
      normalPrice: option.normalPrice,
      barcode: option.barcode,
    })),
    malls,
  };
}

function resolvedSalePrice(
  option: MallSheetSourceProduct['options'][number],
  override: MallSheetSourceProduct['overrides'][number] | null,
): number {
  const explicit = override?.optionPrices?.find((item) => item.salesProductOptionId === option.id)?.salePrice;
  if (explicit !== undefined && explicit !== null) return explicit;
  // Compatibility projection for a legacy scalar target: apply that final
  // value to each transport option; never reconstruct a base by subtraction.
  if (override?.optionPrices === undefined && override?.salePrice !== null && override?.salePrice !== undefined) {
    return override.salePrice;
  }
  return option.salePrice ?? 0;
}

function resolvedNormalPrice(
  option: MallSheetSourceProduct['options'][number],
  override: MallSheetSourceProduct['overrides'][number] | null,
): number | null {
  const explicit = override?.optionPrices?.find((item) => item.salesProductOptionId === option.id)?.normalPrice;
  return explicit === undefined || explicit === null ? option.normalPrice ?? null : explicit;
}

function commonPrice(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((value): value is number => value !== null && value !== undefined);
  return known.length > 0 && known.length === values.length && new Set(known).size === 1 ? known[0]! : null;
}
