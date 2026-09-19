import { salesProductMallPrice, type SalesProduct } from '@kiditem/shared/sales-product';
import { salesProductApi } from '@/lib/sales-product-api';
import {
  KIDITEM_MALL_DRAFT_DEFAULTS,
  type MallNoticeField,
  type MallProductDraft,
  type MallProductVariant,
} from '../../(product-pipeline)/product-pipeline/_shared/lib/mall-product-draft';
import { prepareMallRegistration } from '../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import type { MallPublishItem } from './mall-publish-adapter';

/**
 * 판매상품(ADR-0013) → 몰 중립 등록 초안.
 *
 * 판매상품은 한 번 편집한 값이고, 몰마다 다른 것(판매가 · 상품명 · 상세)은 그 몰 계정의 몰별 값이
 * 이긴다. 옵션은 미사용이 아닌 단품마다 한 줄 — 품절 단품은 재고 0 으로 보낸다.
 */

const DEFAULT_STOCK = KIDITEM_MALL_DRAFT_DEFAULTS.defaultStock;
const MAX_ADDITIONAL_IMAGES = 9;

/** 사방넷 속성분류코드 → 우리 고시 분류 이름. 모르는 코드는 기본(어린이제품)으로 둔다. */
const SABANGNET_NOTICE_CATEGORY: Record<string, string> = {
  '023': '어린이제품',
  '035': '기타 재화',
};

export function detailImageUrlsFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const pattern = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const url = match[1]!.trim().replace(/^\/\//, 'https://');
    if (/^https?:\/\//i.test(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

export function salesProductOptionPrice(
  product: Pick<SalesProduct, 'salePrice'>,
  extraPrice: number,
  override: { salePrice: number | null; priceRateBp: number | null } | undefined,
): number {
  return salesProductMallPrice({ salePrice: product.salePrice, extraPrice, override });
}

export function salesProductToMallProductDraft(product: SalesProduct, mallKey: string): MallProductDraft {
  const override = product.channelOverrides.find((item) => item.mallKey === mallKey);
  const representativeImageUrl = product.imageUrls[0] ?? '';
  const notice: Partial<Record<MallNoticeField, string>> = {
    ...KIDITEM_MALL_DRAFT_DEFAULTS.noticeFields,
    품명및모델명: product.shortName || product.name,
    ...(product.manufacturer ? { 제조자: product.manufacturer } : {}),
    ...(product.originCountry ? { 제조국: product.originCountry } : {}),
    ...(product.certifications[0]?.number
      ? { 안전인증번호: product.certifications[0].number, KC인증: 'KC 인증 있음' }
      : {}),
  };
  const variants: MallProductVariant[] = product.options
    .filter((option) => option.supplyStatus !== 'unused')
    .map((option) => {
      const salePrice = salesProductOptionPrice(product, option.extraPrice, override);
      return {
        options: product.optionAxes.length > 0
          ? product.optionAxes.map((axis, index) => ({ type: axis, value: option.values[index] ?? '' }))
          : [{ type: '색상', value: '단일' }],
        salePrice,
        listPrice: product.tagPrice && product.tagPrice > salePrice ? product.tagPrice : salePrice,
        stock: option.supplyStatus === 'sold_out' ? 0 : DEFAULT_STOCK,
        barcode: option.barcode,
        sellerSku: option.components[0]?.sellpiaCode || option.optionCode,
        representativeImageUrl,
      };
    });
  return {
    candidateId: product.id,
    displayName: override?.name || product.name,
    sellerProductName: product.shortName || product.name,
    brand: product.brand || KIDITEM_MALL_DRAFT_DEFAULTS.brand,
    maker: product.manufacturer || KIDITEM_MALL_DRAFT_DEFAULTS.maker,
    keywords: product.keywords.slice(0, 20),
    representativeImageUrl,
    additionalImageUrls: product.imageUrls.slice(1, 1 + MAX_ADDITIONAL_IMAGES),
    detailImageUrls: detailImageUrlsFromHtml(override?.detailHtml ?? product.detailHtml),
    notice: {
      category: SABANGNET_NOTICE_CATEGORY[product.noticeCategory ?? ''] ?? KIDITEM_MALL_DRAFT_DEFAULTS.noticeCategory,
      fields: notice,
    },
    variants,
    sourceCategory: product.standardCategory,
  };
}

/**
 * 어댑터가 보낼 초안을 만든다. 판매상품이면 판매상품에서, 수집상품이면 지금처럼 수집상품 상세와
 * 렌더한 상세 이미지에서.
 */
export async function prepareRegistration(
  item: MallPublishItem,
  mallKey: string,
): Promise<{ draft: MallProductDraft }> {
  if (item.source === 'sales_product') {
    const product = await salesProductApi.get(item.candidateId);
    const draft = salesProductToMallProductDraft(product, mallKey);
    if (draft.variants.length === 0) throw new Error('보낼 단품이 없습니다. 모든 단품이 미사용입니다.');
    if (draft.detailImageUrls.length === 0) throw new Error('상세 이미지가 없습니다. 판매상품 상세에 이미지를 넣으세요.');
    return { draft };
  }
  return prepareMallRegistration(item.candidateId);
}
