import type { MallNoticeField, MallProductDraft } from '../../_shared/lib/mall-product-draft';
import { buildWingDisplayName } from './wing-registration-flow';
import {
  WING_PRODUCT_DRAFT_DEFAULTS,
  type WingProduct,
  type WingProductDraftDefaults,
  type WingVariant,
} from '../../../../(channels)/_shared/adapters/coupang-wing/wing-registration-excel';

/**
 * 몰 중립 초안 → 쿠팡 WING 상품.
 *
 * WING 은 `MallProductDraft` 의 첫 어댑터다. 초안에 없는 것(카테고리 셀, 검색옵션,
 * 필수 구매옵션 '수량', 노출상품명 조립 규칙)은 전부 여기서 붙인다 — 그게 몰 고유
 * 규칙이기 때문이다.
 *
 * `candidateToWingProduct` 와 같은 결과를 내야 한다. 그 동치는 테스트가 잡는다.
 */
/**
 * 쿠팡 '어린이제품' 고시 칸 순서.
 *
 * 엑셀 상품고시정보값1~7 이 이 순서로 들어간다. 순서가 바뀌면 값이 한 칸씩 밀려
 * 잘못된 고시가 등록되므로, 이 배열이 그 매핑의 유일한 정의다.
 */
export const WING_NOTICE_ORDER: readonly MallNoticeField[] = [
  '품명및모델명',
  'KC인증',
  '사용연령',
  '제조자',
  '제조국',
  '취급방법및주의사항',
  '품질보증기준',
];

export function wingProductFromDraft(
  draft: MallProductDraft,
  options: {
    categoryCell?: string;
    defaults?: WingProductDraftDefaults;
    /** 쿠팡 필수 구매옵션 '수량'. 카테고리 정책상 항상 붙는다. */
    quantity?: number;
  } = {},
): WingProduct {
  const defaults = options.defaults ?? WING_PRODUCT_DRAFT_DEFAULTS;
  const quantity = options.quantity ?? 1;

  const variants = draft.variants.map<WingVariant>((variant) => ({
    purchaseOptions: [
      ...variant.options,
      { type: '수량', value: String(quantity) },
    ],
    salePrice: variant.salePrice,
    origPrice: variant.listPrice,
    stock: variant.stock,
    representativeImageUrl: variant.representativeImageUrl,
  }));

  return {
    categoryCell: options.categoryCell ?? '',
    productName: buildWingDisplayName(draft.displayName, draft.keywords, quantity),
    sellerProductName: draft.sellerProductName,
    brand: defaults.defaultBrand,
    maker: defaults.defaultMaker,
    searchKeyword: draft.keywords.slice(0, 20).join(','),
    searchOptions: defaults.defaultSearchOptions,
    additionalImageUrls: draft.additionalImageUrls,
    detailImageUrls: draft.detailImageUrls,
    noticeCategory: draft.notice.category,
    noticeValues: WING_NOTICE_ORDER.map((field) => draft.notice.fields[field] ?? ''),
    variants,
  };
}
