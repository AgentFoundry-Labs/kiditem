import { describe, expect, it } from 'vitest';
import type { ProductDetailResponse } from '../../collected-products/lib/sourcing-api';
import {
  candidateToWingProduct,
} from '../../collected-products/lib/wing-registration-flow';
import {
  WING_PRODUCT_DRAFT_DEFAULTS,
} from '../../collected-products/lib/wing-registration-excel';
import { WING_NOTICE_ORDER, wingProductFromDraft } from '../../collected-products/lib/wing-product-from-draft';
import {
  candidateToMallProductDraft,
  mallProductDraftGaps,
  noticeFieldsFromBasics,
  type MallProductDraftDefaults,
} from './mall-product-draft';

const NEUTRAL_DEFAULTS: MallProductDraftDefaults = {
  brand: WING_PRODUCT_DRAFT_DEFAULTS.defaultBrand,
  maker: WING_PRODUCT_DRAFT_DEFAULTS.defaultMaker,
  noticeCategory: WING_PRODUCT_DRAFT_DEFAULTS.noticeCategory,
  // WING 엑셀의 위치 배열을 우리 고시 항목 이름으로 옮긴다.
  noticeFields: Object.fromEntries(
    WING_NOTICE_ORDER.map((field, index) => [field, WING_PRODUCT_DRAFT_DEFAULTS.defaultNoticeValues[index] ?? '']),
  ),
  defaultStock: 999,
};

function detail(overrides: Partial<ProductDetailResponse> = {}): ProductDetailResponse {
  return {
    id: 'cand-1',
    name: '5000과일바구니딸깍이키링',
    status: 'completed',
    sourcePlatform: '1688',
    source_platform: '1688',
    source_url: null,
    thumbnailUrl: 'https://cdn/thumb.jpg',
    thumbnail_url: 'https://cdn/thumb.jpg',
    price_krw: 5000,
    cost_cny: null,
    image_count: 2,
    is_processed: true,
    raw_data: null,
    processed_data: null,
    image_urls: ['https://cdn/src-1.jpg'],
    images: [{ url: 'https://cdn/src-1.jpg' }],
    contentWorkspaceId: 'ws-1',
    productPreparation: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    basicInfo: {
      name: '과일바구니 딸깍이 키링',
      salePrice: 7900,
      originalPrice: 9900,
      keywords: ['키링', '피젯'],
      tags: [],
      colorVariantNames: '혼합',
      selectedThumbnailUrl: 'https://cdn/rep.jpg',
      thumbnailPreviewUrls: ['https://cdn/rep.jpg', 'https://cdn/add-1.jpg'],
      registrationImages: { primary: ['https://cdn/rep.jpg'], thumbnail: ['https://cdn/add-2.jpg'] },
    } as unknown as ProductDetailResponse['basicInfo'],
    ...overrides,
  } as ProductDetailResponse;
}

describe('candidateToMallProductDraft', () => {
  it('prefers role/selected images over the raw collected source', () => {
    // 수집 원본은 1,000x1,000 규격이 아니라 어느 몰에서도 반려된다.
    const draft = candidateToMallProductDraft({
      detail: detail(), defaults: NEUTRAL_DEFAULTS, detailImageUrl: 'https://cdn/detail.jpg',
    });
    expect(draft.representativeImageUrl).toBe('https://cdn/rep.jpg');
    expect(draft.additionalImageUrls).toEqual(['https://cdn/add-1.jpg', 'https://cdn/add-2.jpg']);
  });

  it('does not fall back to every product image for the additional slots', () => {
    const draft = candidateToMallProductDraft({
      detail: detail({
        basicInfo: {
          ...detail().basicInfo, thumbnailPreviewUrls: [], registrationImages: { primary: ['https://cdn/rep.jpg'], thumbnail: [] },
        } as unknown as ProductDetailResponse['basicInfo'],
      }),
      defaults: NEUTRAL_DEFAULTS,
    });
    expect(draft.additionalImageUrls).toEqual([]);
  });

  it('puts the real product name into the first notice slot', () => {
    const draft = candidateToMallProductDraft({ detail: detail(), defaults: NEUTRAL_DEFAULTS });
    expect(draft.notice.fields.품명및모델명).toBe('과일바구니 딸깍이 키링');
    expect(draft.notice.fields.제조국).toBe('중국');
    expect(draft.notice.category).toBe('어린이제품');
  });

  it('keeps the buyer name and the seller-side original name apart', () => {
    const draft = candidateToMallProductDraft({ detail: detail(), defaults: NEUTRAL_DEFAULTS });
    expect(draft.displayName).toBe('과일바구니 딸깍이 키링');
    expect(draft.sellerProductName).toBe('5000과일바구니딸깍이키링');
  });
});

describe('mallProductDraftGaps', () => {
  it('names a zero sale price rather than letting it reach a mall', () => {
    const draft = candidateToMallProductDraft({
      detail: detail({ price_krw: 0, basicInfo: { ...detail().basicInfo, salePrice: 0 } as ProductDetailResponse['basicInfo'] }),
      defaults: NEUTRAL_DEFAULTS,
      detailImageUrl: 'https://cdn/detail.jpg',
    });
    expect(mallProductDraftGaps(draft)).toContain('판매가가 0원인 옵션이 있습니다.');
  });

  it('is empty for a complete draft', () => {
    const draft = candidateToMallProductDraft({
      detail: detail(), defaults: NEUTRAL_DEFAULTS, detailImageUrl: 'https://cdn/detail.jpg',
    });
    expect(mallProductDraftGaps(draft)).toEqual([]);
  });
});

describe('wingProductFromDraft', () => {
  it('reproduces candidateToWingProduct exactly — the seam does not change WING', () => {
    const source = detail();
    const legacy = candidateToWingProduct(
      source, WING_PRODUCT_DRAFT_DEFAULTS, '[77390] 완구/취미>스포츠/야외완구>물총', 'https://cdn/detail.jpg',
    );
    const viaDraft = wingProductFromDraft(
      candidateToMallProductDraft({
        detail: source, defaults: NEUTRAL_DEFAULTS, detailImageUrl: 'https://cdn/detail.jpg',
      }),
      { categoryCell: '[77390] 완구/취미>스포츠/야외완구>물총' },
    );
    expect(viaDraft).toEqual(legacy);
  });
});

/**
 * 상품 상세 값 → 고시 항목 자동 매핑.
 *
 * 근거는 아이스크림몰 실측 등록물(`goodsNo=11411122`)이다. 그 상품의 고시는
 * `크기 8x8x7cm` · `색상 오렌지` · `재질 고무` · `사용연령 8세이상` 처럼 **실제 값**이
 * 들어가 있었다. 우리는 이 값들을 이미 상품 상세에 들고 있으면서도 몰에는
 * '상세페이지 참조' 로 내보내고 있었다 — 고시를 채운 척한 것이다.
 */
describe('noticeFieldsFromBasics', () => {
  it('상품 상세에 적어 둔 값을 고시로 옮긴다', () => {
    expect(noticeFieldsFromBasics({
      productSize: '8x8x7cm',
      colorVariantStatus: 'multiple',
      colorVariantNames: '오렌지, 노랑',
      ageGroup: 'age-8-plus',
      kcCertificationNumber: 'CB065R1075-2004',
    })).toEqual({
      크기: '8x8x7cm',
      색상: '오렌지, 노랑',
      사용연령: '8세 이상',
      안전인증번호: 'CB065R1075-2004',
      KC인증: 'KC 인증 있음',
    });
  });

  it('빈 값은 담지 않는다 — 몰 고정 문구가 이겨야 한다', () => {
    expect(noticeFieldsFromBasics({})).toEqual({});
    expect(noticeFieldsFromBasics({ productSize: '   ', colorVariantNames: '' })).toEqual({});
  });

  it('화면 선택지 코드를 사람이 읽는 말로 바꾼다', () => {
    // 고시는 구매자가 읽는 글이지 우리 내부 코드가 아니다.
    expect(noticeFieldsFromBasics({ ageGroup: 'age-14-plus' }).사용연령).toBe('14세 이상');
    expect(noticeFieldsFromBasics({ ageGroup: 'age-8-plus' }).사용연령).toBe('8세 이상');
    expect(noticeFieldsFromBasics({ ageGroup: '' }).사용연령).toBeUndefined();
  });

  it('단일 색상은 색상명이 없어도 단일 이라고 적는다', () => {
    expect(noticeFieldsFromBasics({ colorVariantStatus: 'single' }).색상).toBe('단일');
  });

  it('색상 없음이면 색상 칸을 건드리지 않는다', () => {
    expect(noticeFieldsFromBasics({
      colorVariantStatus: 'none', colorVariantNames: '오렌지',
    }).색상).toBeUndefined();
  });

  it('인증번호가 있으면 KC인증도 있음으로 굳힌다', () => {
    // 번호가 있는데 '상세정보 별도표기' 로 나가면 몰 심사에서 되돌아온다.
    const fields = noticeFieldsFromBasics({ kcCertificationNumber: 'CB065R1579-2008' });
    expect(fields.KC인증).toBe('KC 인증 있음');
    expect(fields.안전인증번호).toBe('CB065R1579-2008');
  });

  it('KC 없음이면 해당 없음으로 적는다', () => {
    expect(noticeFieldsFromBasics({ kcCertificationStatus: 'none' }))
      .toEqual({ KC인증: '해당 없음' });
  });
});
