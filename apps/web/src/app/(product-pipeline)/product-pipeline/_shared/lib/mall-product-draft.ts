import type {
  ProductDetailResponse,
  RegistrationImages,
} from '../../collected-products/lib/sourcing-api';

/**
 * 몰 중립 등록 초안.
 *
 * 수집상품 → 상품 생성(썸네일·상세이미지) 결과를 "어느 몰에나 보낼 수 있는" 모양으로
 * 한 번만 정리한다. 쿠팡 WING 이 이 초안의 첫 소비자이고, 몰이 늘어날 때마다
 * 이 초안을 그 몰 형식으로 옮기는 어댑터만 추가한다.
 *
 * 몰 고유 개념(쿠팡 카테고리 셀, 검색옵션 20쌍, 구비서류 7칸 등)은 여기 두지 않는다.
 * 그건 어댑터가 자기 매니페스트를 보고 만든다.
 */

export interface MallProductOption {
  type: string;
  value: string;
}

/** SKU 하나. 옵션 조합마다 1개. */
export interface MallProductVariant {
  options: MallProductOption[];
  salePrice: number;
  /** 할인율 기준가. 없으면 salePrice 와 같다. */
  listPrice: number;
  stock: number;
  barcode: string | null;
  /** 자체관리코드(셀피아 SKU 등). */
  sellerSku: string | null;
  representativeImageUrl: string;
}

/**
 * 상품정보고시.
 *
 * 위치 배열이 아니라 라벨 맵이다. 몰마다 항목 순서도 개수도 다르기 때문이다 —
 * 쿠팡 '어린이제품'은 7칸, 키즈노트 '영유아용품'은 27칸이고 순서도 다르다.
 * 위치로 들고 다니면 몰을 하나 붙일 때마다 값이 한 칸씩 밀린다.
 */
export interface MallProductNotice {
  /** 우리 기준 고시 분류. 몰 고시 카테고리 코드는 어댑터가 매핑한다. */
  category: string;
  fields: Partial<Record<MallNoticeField, string>>;
}

/** 몰 공통으로 쓰는 고시 항목 이름. 몰별 칸 이름은 어댑터가 안다. */
export type MallNoticeField =
  | '품명및모델명'
  | 'KC인증'
  | '안전인증번호'
  | '사용연령'
  | '제조자'
  | '제조국'
  | '수입여부'
  | '색상'
  | '재질'
  | '크기'
  | '동일모델출시년월'
  | '취급방법및주의사항'
  | '품질보증기준'
  | 'AS책임자';

export interface MallProductDraft {
  candidateId: string;
  /** 구매자에게 보이는 이름. */
  displayName: string;
  /** 판매자 내부 관리용 이름(수집 원본명). */
  sellerProductName: string;
  brand: string;
  maker: string;
  keywords: string[];
  representativeImageUrl: string;
  /** 대표 이미지를 뺀 추가 이미지. */
  additionalImageUrls: string[];
  /** 확정된 긴 상세 이미지. 몰마다 상한이 달라 배열로 둔다. */
  detailImageUrls: string[];
  notice: MallProductNotice;
  variants: MallProductVariant[];
  /** 수집 원본 카테고리 문자열. 몰 카테고리는 어댑터가 매핑한다. */
  sourceCategory: string | null;
}

export interface MallProductDraftDefaults {
  brand: string;
  maker: string;
  noticeCategory: string;
  noticeFields: Partial<Record<MallNoticeField, string>>;
  defaultStock: number;
}

export interface MallProductDraftInput {
  detail: ProductDetailResponse;
  defaults: MallProductDraftDefaults;
  /** 렌더가 끝난 상세 이미지 1장. 없으면 상세 이미지 없이 초안을 만든다. */
  detailImageUrl?: string | null;
}

const MAX_ADDITIONAL_IMAGES = 9;
const MAX_KEYWORDS = 20;

function normalizePrice(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function collectFallbackImages(detail: ProductDetailResponse): string[] {
  const urls = [
    ...(detail.images ?? []).map((image) => image.url),
    ...(detail.image_urls ?? []),
  ];
  return [...new Set(urls.filter((url) => typeof url === 'string' && url.length > 0))];
}

/**
 * 대표 이미지.
 *
 * 수집 원본(`image_urls`)은 규격(1,000x1,000)이 안 맞아 어느 몰에서도 반려된다.
 * role 자산과 사용자가 고른 썸네일이 항상 먼저다.
 */
export function resolveRepresentativeImage(detail: ProductDetailResponse): string {
  const roleImages: RegistrationImages | undefined = detail.basicInfo.registrationImages;
  return roleImages?.primary[0]
    || detail.basicInfo.selectedThumbnailUrl
    || collectFallbackImages(detail)[0]
    || detail.thumbnailUrl
    || '';
}

/**
 * 추가 이미지 = 저장된 썸네일 구성에서 대표 1장을 뺀 나머지.
 *
 * 상품 이미지 전체로 폴백하지 않는다. 비어 있다면 저장이 안 된 것이고, 고칠 곳은
 * 워크스페이스 썸네일 갤러리다 — 여기서 원본을 섞으면 규격 미달 이미지가 몰로 나간다.
 */
export function resolveAdditionalImages(
  detail: ProductDetailResponse,
  representativeImageUrl: string,
): string[] {
  const roleImages: RegistrationImages | undefined = detail.basicInfo.registrationImages;
  return [
    ...new Set([
      ...(detail.basicInfo.thumbnailPreviewUrls ?? []),
      ...(roleImages?.thumbnail ?? []),
    ]),
  ]
    .filter((url) => url && url !== representativeImageUrl)
    .slice(0, MAX_ADDITIONAL_IMAGES);
}

export function candidateToMallProductDraft(input: MallProductDraftInput): MallProductDraft {
  const { detail, defaults } = input;
  const basics = detail.basicInfo;
  const representativeImageUrl = resolveRepresentativeImage(detail);
  const salePrice = normalizePrice(basics.salePrice || detail.price_krw || 0);
  const listPrice = normalizePrice(basics.originalPrice || salePrice);
  const keywords = (basics.keywords.length > 0 ? basics.keywords : basics.tags)
    .slice(0, MAX_KEYWORDS);

  // 품명은 어느 몰에서나 실제 상품명이어야 한다. 기본값('상세페이지 참조')을 그대로
  // 내보내면 고시가 사실상 비어 있는 상태로 등록된다.
  const noticeFields: Partial<Record<MallNoticeField, string>> = {
    ...defaults.noticeFields,
    품명및모델명: basics.name || defaults.noticeFields.품명및모델명 || '',
  };

  return {
    candidateId: detail.id,
    displayName: basics.name || detail.name,
    sellerProductName: detail.name || basics.name,
    brand: defaults.brand,
    maker: defaults.maker,
    keywords,
    representativeImageUrl,
    additionalImageUrls: resolveAdditionalImages(detail, representativeImageUrl),
    detailImageUrls: input.detailImageUrl ? [input.detailImageUrl] : [],
    notice: { category: defaults.noticeCategory, fields: noticeFields },
    variants: [{
      options: [{ type: '색상', value: basics.colorVariantNames?.trim() || '단일' }],
      salePrice,
      listPrice,
      stock: defaults.defaultStock,
      barcode: null,
      sellerSku: null,
      representativeImageUrl,
    }],
    sourceCategory: typeof basics.category === 'string' ? basics.category : null,
  };
}

/** 초안이 어느 몰에 보내기에도 부족한 지점. 어댑터 호출 전에 한 번 본다. */
export function mallProductDraftGaps(draft: MallProductDraft): string[] {
  const gaps: string[] = [];
  if (!draft.displayName.trim()) gaps.push('상품명이 비어 있습니다.');
  if (!draft.representativeImageUrl) gaps.push('대표 이미지가 없습니다.');
  if (draft.detailImageUrls.length === 0) gaps.push('상세 이미지가 준비되지 않았습니다.');
  if (draft.variants.length === 0) gaps.push('옵션이 하나도 없습니다.');
  if (draft.variants.some((variant) => variant.salePrice <= 0)) {
    gaps.push('판매가가 0원인 옵션이 있습니다.');
  }
  if (Object.keys(draft.notice.fields).length === 0) gaps.push('상품정보고시 값이 없습니다.');
  return gaps;
}

/**
 * KidItem 판매자 기본값.
 *
 * 브랜드·제조사는 라이브 실측(WING vendorInventoryId=16290876620) 기준이다.
 * 고시 기본값은 쿠팡 '어린이제품' 7칸에 넣던 값과 같은 내용이고, 여기서는 위치가
 * 아니라 이름으로 들고 있어 몰마다 다른 칸에 옮겨 담을 수 있다.
 */
export const KIDITEM_MALL_DRAFT_DEFAULTS: MallProductDraftDefaults = {
  brand: '노브랜드',
  maker: '해피프랜즈',
  noticeCategory: '어린이제품',
  noticeFields: {
    품명및모델명: '상세페이지 참조',
    KC인증: '상세정보 별도표기',
    사용연령: '전체 연령',
    제조자: '해피프랜즈',
    제조국: '중국',
    취급방법및주의사항: '상세페이지 참조',
    품질보증기준: '상세페이지 참조',
  },
  defaultStock: 999,
};
