import { mallDisplayName, salesProductMallPrice, SALES_PRODUCT_SABANGNET_VALUE_KEYS } from '@kiditem/shared/sales-product';
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
    code: string;
    values: string[];
    extraPrice: number;
    barcode: string | null;
    supplyStatus: string;
  }[];
  /** 몰별 값(몰 키 · 몰 계정마다). */
  overrides: {
    mallKey: string;
    salePrice: number | null;
    priceRateBp: number | null;
    name: string | null;
    detailHtml: string | null;
    promoText: string | null;
    adapterValues: Record<string, string>;
  }[];
  /** 사방넷에서 옮기기 전 사진 주소(대표 · 부가 순서). */
  sabangnetImageUrls: string[];
}

const KEYS = SALES_PRODUCT_SABANGNET_VALUE_KEYS;

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
    const values = source.overrides.find((item) => item.mallKey === donor)?.adapterValues ?? {};
    const path = values.categoryPath?.trim() || values[KEYS.categoryPath]?.trim() || null;
    if (path && categories.code(mallKey, path)) return path;
  }
  return null;
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
): MallSheetProduct {
  // 사진이 전부 몰이 읽는 주소로 바뀌어야 우리 사진을 쓴다. 하나라도 못 바꾸면 사방넷 원래 주소로 물러선다.
  const mapped = source.imageUrls.map((url) => publicUrlOf(url, publicCopies));
  const own = mapped.every((url): url is string => url !== null) ? mapped as string[] : [];
  const sabangnet = source.sabangnetImageUrls.filter(isPublicImageUrl);
  const imageSource = own.length ? 'own' : sabangnet.length ? 'sabangnet' : 'none';

  const malls: Record<string, MallSheetMallValues> = {};
  for (const mallKey of spec.mallKeys) {
    const override = source.overrides.find((item) => item.mallKey === mallKey) ?? null;
    const values = override?.adapterValues ?? {};
    const ownPath = values.categoryPath?.trim() || values[KEYS.categoryPath]?.trim() || null;
    // 분류 체계가 같은 몰에서 빌려 온다(온채널 ← 스마트스토어). 이 몰 표에서 번호가 나올 때만 쓴다.
    const borrowed = ownPath ? null : borrowCategoryPath(source, spec, mallKey, categories);
    const categoryPath = ownPath ?? borrowed;
    const explicitCode = values.categoryCode?.trim() || null;
    malls[mallKey] = {
      salePrice: salesProductMallPrice({ salePrice: source.salePrice, extraPrice: 0, override }),
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

  const selling = source.options.filter((option) => option.supplyStatus === 'selling');
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
    tagPrice: source.tagPrice,
    imageUrls: imageSource === 'own' ? own : sabangnet,
    imageSource,
    noticeCategory: source.noticeCategory,
    certificationNumbers: source.certificationNumbers,
    optionAxes: source.optionAxes,
    options: selling.map((option) => ({
      code: option.code,
      values: option.values,
      extraPrice: option.extraPrice,
      barcode: option.barcode,
    })),
    malls,
  };
}
