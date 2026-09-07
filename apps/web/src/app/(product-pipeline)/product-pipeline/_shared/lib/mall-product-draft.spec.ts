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
