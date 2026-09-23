import { type SalesProduct } from '@kiditem/shared/sales-product';
import { salesProductApi } from '@/lib/sales-product-api';
import {
  KIDITEM_MALL_DRAFT_DEFAULTS,
  type MallNoticeField,
  type MallProductDraft,
  type MallProductVariant,
} from '../../(product-pipeline)/product-pipeline/_shared/lib/mall-product-draft';
import { prepareMallRegistration } from '../../(product-pipeline)/product-pipeline/_shared/lib/mall-form-registration-api';
import { publishItemSalesProductId, type MallPublishItem } from './mall-publish-adapter';

/**
 * 판매상품(ADR-0014) → 몰 중립 등록 초안.
 *
 * 판매상품은 한 번 편집한 값이다. 옵션은 미사용이 아닌 단품마다 한 줄 — 품절 단품은 재고 0 으로 보낸다.
 */

const DEFAULT_STOCK = KIDITEM_MALL_DRAFT_DEFAULTS.defaultStock;
const MAX_ADDITIONAL_IMAGES = 9;

/** 사방넷 속성분류코드 → 우리 고시 분류 이름. 모르는 코드는 기본(어린이제품)으로 둔다. */
const SABANGNET_NOTICE_CATEGORY: Record<string, string> = {
  '023': '어린이제품',
  '035': '기타 재화',
};

type RegistrationInput = Record<string, unknown>;

function recordValue(value: unknown): RegistrationInput {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RegistrationInput
    : {};
}

function nonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

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

/**
 * 이 단품이 몰에 보일 판매가. 몰별 값(override)이 있으면 그 값이 이기고, 없으면 옵션 판매가다.
 *
 * 둘 다 없으면(판매 결정 전 초안) 몰에 보낼 값이 없다는 뜻이다 — 0원으로 지어내지 않고
 * 막는다. 등록 동결(prepare)이 이미 같은 규칙으로 판매가를 검사하므로, 여기 닿았다면
 * 보통 스냅샷 없이 미리보기만 하는 경로다.
 */
export function salesProductOptionPrice(
  option: Pick<SalesProduct['options'][number], 'salePrice'>,
  override: { salePrice: number | null } | undefined,
): number {
  const price = override?.salePrice ?? option.salePrice;
  if (price == null) {
    throw new Error('판매가가 아직 없습니다(초안). 판매상품 편집에서 판매가를 먼저 정하세요.');
  }
  return price;
}

/**
 * 판매상품 → 몰 초안. 이름 · 사진 · 키워드 · 고시 · 제조사는 판매상품에서, 상세는 콘텐츠 revision 에서,
 * 홍보문은 등록 대상의 몰 전용 값(`mallFields.promoText`)에서 온다(KID-313). 등록 대상은 상품 사실을 갖지
 * 않으므로 `registrationInput` 의 다른 키는 읽지 않는다.
 */
export function salesProductToMallProductDraft(
  product: SalesProduct,
  mallKey: string,
  registrationInput: RegistrationInput = {},
  /** 콘텐츠의 상세 revision HTML — 대상 실행이 동결한 `detailPage.html`(KID-313 W2). */
  detailHtml: string | null = null,
): MallProductDraft {
  const override = product.channelOverrides.find((item) => item.mallKey === mallKey);
  const mallFields = recordValue(registrationInput.mallFields);
  const representativeImageUrl = product.imageUrls[0] ?? '';
  const additionalImageUrls = product.imageUrls.slice(1, 1 + MAX_ADDITIONAL_IMAGES);
  const promoText = nonEmptyString(mallFields.promoText, override?.promoText);
  const noticeCategory = nonEmptyString(override?.noticeCategory, product.noticeCategory);
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
      const salePrice = salesProductOptionPrice(option, override);
      return {
        options: product.optionAxes.length > 0
          ? product.optionAxes.map((axis, index) => ({ type: axis, value: option.values[index] ?? '' }))
          : [{ type: '색상', value: '단일' }],
        salePrice,
        listPrice: option.normalPrice !== null && option.normalPrice > salePrice
          ? option.normalPrice
          : salePrice,
        stock: option.supplyStatus === 'sold_out' ? 0 : DEFAULT_STOCK,
        barcode: option.barcode,
        sellerSku: option.optionCode,
        representativeImageUrl,
      };
    });
  return {
    candidateId: product.id,
    displayName: override?.name || product.name,
    ...(promoText ? { promoText } : {}),
    sellerProductName: product.shortName || product.name,
    brand: nonEmptyString(product.brand) || KIDITEM_MALL_DRAFT_DEFAULTS.brand,
    maker: nonEmptyString(product.manufacturer) || KIDITEM_MALL_DRAFT_DEFAULTS.maker,
    representativeImageUrl,
    additionalImageUrls,
    detailImageUrls: detailImageUrlsFromHtml(detailHtml),
    keywords: product.keywords.slice(0, 20),
    notice: {
      category: SABANGNET_NOTICE_CATEGORY[noticeCategory ?? ''] ?? noticeCategory ?? KIDITEM_MALL_DRAFT_DEFAULTS.noticeCategory,
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
    const product = item.targetExecution?.snapshot.product
      ?? await salesProductApi.get(item.candidateId);
    const draft = salesProductToMallProductDraft(
      product,
      mallKey,
      item.targetExecution?.snapshot.registrationInput,
      item.targetExecution?.snapshot.detailPage?.html ?? null,
    );
    if (draft.variants.length === 0) throw new Error('보낼 단품이 없습니다. 모든 단품이 미사용입니다.');
    if (draft.detailImageUrls.length === 0) throw new Error('상세 이미지가 없습니다. 판매상품 상세에 이미지를 넣으세요.');
    return { draft };
  }
  return prepareMallRegistration(publishItemSalesProductId(item));
}
