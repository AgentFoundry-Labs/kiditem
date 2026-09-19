import { salesProductMallPrice, SALES_PRODUCT_SABANGNET_VALUE_KEYS } from '@kiditem/shared/sales-product';
import {
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

/**
 * 판매상품 이름 앞의 가격 코드(`3500 게틀링…` · `700받아쓰기노트…`)를 뗀 몰 표시용 이름. 셀피아 원본명 관례라 몰 등록
 * 어댑터도 같은 글자를 뗀다. 세 자리 이상 숫자만 뗀다 — `1+1 …` 같은 이름은 그대로 둔다.
 */
export function mallDisplayName(name: string): string {
  const stripped = name.replace(/^\d{3,}(?!\d)\s*(?=\S)/, '').trim();
  return stripped || name.trim();
}

function joinText(parts: readonly (string | null | undefined)[], separator: string): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(separator);
}

/** 판매상품 한 건을 몰 규칙이 받는 모양으로 — 몰별 가격 · 이름 · 상세 · 카테고리 번호를 이 몰 기준으로 푼다. */
export function toMallSheetProduct(
  source: MallSheetSourceProduct,
  spec: Pick<MallBulkSheetSpec, 'mallKeys'>,
  categories: MallCategoryLookup,
): MallSheetProduct {
  const own = source.imageUrls.filter(isPublicImageUrl);
  const sabangnet = source.sabangnetImageUrls.filter(isPublicImageUrl);
  const imageSource = own.length ? 'own' : sabangnet.length ? 'sabangnet' : 'none';

  const malls: Record<string, MallSheetMallValues> = {};
  for (const mallKey of spec.mallKeys) {
    const override = source.overrides.find((item) => item.mallKey === mallKey) ?? null;
    const values = override?.adapterValues ?? {};
    const categoryPath = values.categoryPath?.trim() || values[KEYS.categoryPath]?.trim() || null;
    const explicitCode = values.categoryCode?.trim() || null;
    malls[mallKey] = {
      salePrice: salesProductMallPrice({ salePrice: source.salePrice, extraPrice: 0, override }),
      name: override?.name?.trim()
        || joinText([values[KEYS.namePrefix], mallDisplayName(source.name), values[KEYS.nameSuffix]], ' '),
      nameIsMallSpecific: Boolean(override?.name?.trim()),
      promoText: override?.promoText?.trim() || null,
      detailHtml: override?.detailHtml?.trim()
        || joinText([values[KEYS.detailTop], source.detailHtml, values[KEYS.detailBottom]], '\n')
        || null,
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
