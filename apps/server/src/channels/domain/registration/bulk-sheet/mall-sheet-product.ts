import { mallDisplayName, SALES_PRODUCT_SABANGNET_VALUE_KEYS, type SalesProductStatus } from '@kiditem/shared/sales-product';
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
  /** 발급된 KID. 파일을 만드는 순간 발급되므로 이 자리에서는 늘 차 있다. */
  code: string | null;
  ownCode: string | null;
  name: string;
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  modelNo: string | null;
  originCountry: string | null;
  keywords: string[];
  /** 판매상품 상태. 초안이면 파일을 만들지 않는다. */
  status: SalesProductStatus;
  taxType: MallSheetProduct['taxType'];
  /** 대표 판매가. 초안(판매가 미정)이면 null 이고, 서비스의 가격 게이트가 파일을 먼저 막는다. */
  salePrice: number | null;
  tagPrice: number | null;
  imageUrls: string[];
  /** 콘텐츠의 현재(또는 등록 대상이 고른) 상세 revision HTML. 상세가 없으면 null(KID-313 W2). */
  detailHtml: string | null;
  noticeCategory: string | null;
  certificationNumbers: string[];
  optionAxes: string[];
  options: {
    id?: string;
    /** 발급된 KID. 초안의 단품은 비어 있다 — 파일을 만드는 순간 발급된다. */
    code: string | null;
    values: string[];
    /** canonical final price, before a mall target override is applied. */
    salePrice?: number | null;
    normalPrice?: number | null;
    /** legacy source-only delta; normalized to salePrice before transport. */
    extraPrice?: number;
    barcode: string | null;
    supplyStatus: string;
  }[];
  /**
   * 몰별 등록 설정(몰 키 · 몰 계정마다). 선택 옵션과 몰 전용 값만 있다 — 이름 · 가격 · 상세는 판매 상품
   * 한 곳에서 온다(KID-313 W2).
   */
  overrides: {
    mallKey: string;
    targetId?: string;
    selectedOptionIds?: string[];
    /** 사람이 고른 이 몰의 카테고리 경로(`registrationInput.mallCategory`). */
    categoryPath?: string | null;
    /** 몰 전용 칸(`registrationInput.mallFields` 의 글자 값). */
    adapterValues: Record<string, string>;
  }[];
  /** 사방넷에서 옮기기 전 사진 주소(대표 · 부가 순서). */
  sabangnetImageUrls: string[];
}

const KEYS = SALES_PRODUCT_SABANGNET_VALUE_KEYS;

type MallOverride = MallSheetSourceProduct['overrides'][number];

/** 이 몰의 등록 설정들. 상품 × 몰 계정당 활성 설정은 하나지만, 한 몰에 계정이 여럿일 수 있다. */
export function mallTargets(source: MallSheetSourceProduct, mallKey: string): MallOverride[] {
  return source.overrides.filter((item) => item.mallKey === mallKey);
}

/** 이 몰의 등록 설정 경로 — 사람이 정한 값, 없으면 사방넷에서 옮긴 경로. */
export function mallTargetCategoryPath(override: MallOverride): string | null {
  const values = override.adapterValues;
  return override.categoryPath?.trim() || values.categoryPath?.trim() || values[KEYS.categoryPath]?.trim() || null;
}

/**
 * 이 몰에서 쓸 등록 설정 하나. 상품 × 몰 계정당 활성 설정이 하나라 고를 것이 없다(KID-310).
 * 한 몰에 계정이 여럿이면 먼저 만든 설정을 쓴다.
 */
export function pickMallOverride(source: MallSheetSourceProduct, mallKey: string): MallOverride | null {
  return mallTargets(source, mallKey)[0] ?? null;
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
): string | null {
  for (const donor of spec.categorySharesWith ?? []) {
    const path = donorCategoryPath(source, donor);
    if (path && categories.code(mallKey, path)) return path;
  }
  return null;
}

/**
 * 빌려 올 몰이 가리키는 분류 경로. 설정이 있으면 그 경로, 없으면 그 몰 설정들이 **한 경로로 모일 때만** 그 경로다 —
 * 계정마다 분류가 다르면 어느 쪽인지 알 수 없어 빌리지 않는다.
 */
function donorCategoryPath(source: MallSheetSourceProduct, donor: string): string | null {
  const override = pickMallOverride(source, donor);
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

type ImageSource = Pick<MallSheetSourceProduct, 'imageUrls' | 'detailHtml'>;

/** 판매상품 사진 · 상세설명 사진 중 몰이 못 읽는(우리 저장소) 주소. */
export function privateImageUrls(source: ImageSource): string[] {
  const urls = [
    ...source.imageUrls,
    ...detailImageUrls(source.detailHtml),
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
      salePrice: option.salePrice ?? (source.salePrice ?? 0) + (option.extraPrice ?? 0),
      normalPrice: option.normalPrice ?? source.tagPrice,
    }));
  const hasLegacyOptionDeltas = source.options.some((option) => option.salePrice === undefined);
  const canonicalBasePrice = hasLegacyOptionDeltas
    ? source.salePrice ?? 0
    : selling.length > 0
      ? Math.min(...selling.map((option) => option.salePrice))
      : source.salePrice ?? 0;
  for (const mallKey of spec.mallKeys) {
    const override = pickMallOverride(source, mallKey);
    const selectedIds = override?.selectedOptionIds ? new Set(override.selectedOptionIds) : null;
    const selected = selling.filter((option) => !selectedIds || !option.id || selectedIds.has(option.id));
    // 가격은 판매 상품 옵션 한 곳에만 있다 — 몰별 가격 override 는 없다(KID-313 W2).
    const optionPrices = Object.fromEntries(selected.map((option) => [option.code, option.salePrice]));
    const optionNormalPrices = Object.fromEntries(selected.map((option) => [option.code, option.normalPrice ?? null]));
    const values = override?.adapterValues ?? {};
    // 몰 공급가는 몰 전용 칸 `supplyPrice` 하나다(온채널과 같은 칸). 판매가에서 역산하지 않는다.
    const supplyPrice = mallSupplyPrice(values);
    const optionSupplyPrices = supplyPrice === null
      ? undefined
      : Object.fromEntries(selected.map((option) => [option.code, supplyPrice]));
    const ownPath = override ? mallTargetCategoryPath(override) : null;
    // 분류 체계가 같은 몰에서 빌려 온다(온채널 ← 스마트스토어). 이 몰 표에서 번호가 나올 때만 쓴다.
    const borrowed = ownPath ? null : borrowCategoryPath(source, spec, mallKey, categories);
    const categoryPath = ownPath ?? borrowed;
    const explicitCode = values.categoryCode?.trim() || null;
    malls[mallKey] = {
      salePrice: canonicalBasePrice,
      optionPrices,
      optionNormalPrices,
      ...(optionSupplyPrices ? { optionSupplyPrices } : {}),
      // 파일을 만드는 경로는 KID 를 먼저 발급한다(`ensureSalesProductCodes`). 확인만 하는 화면에서는
      // 아직 번호가 없을 수 있어 빈 칸으로 보인다.
      selectedOptionCodes: selected.map((option) => option.code ?? ''),
      name: joinText([values[KEYS.namePrefix], mallDisplayName(source.name), values[KEYS.nameSuffix]], ' '),
      nameIsMallSpecific: false,
      promoText: null,
      detailHtml: withPublicDetailImages(
        joinText([values[KEYS.detailTop], source.detailHtml, values[KEYS.detailBottom]], '\n') || null,
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
    code: source.code ?? '',
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
      code: option.code ?? '',
      values: option.values,
      extraPrice: option.salePrice - canonicalBasePrice,
      normalPrice: option.normalPrice,
      barcode: option.barcode,
    })),
    malls,
  };
}

function mallSupplyPrice(values: Readonly<Record<string, string>>): number | null {
  const text = values.supplyPrice?.replace(/[,\s]/g, '') ?? '';
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

function commonPrice(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((value): value is number => value !== null && value !== undefined);
  return known.length > 0 && known.length === values.length && new Set(known).size === 1 ? known[0]! : null;
}
