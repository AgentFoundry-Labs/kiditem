import type { SalesProduct, SalesProductListItem } from '@kiditem/shared/sales-product';

export const DRAFT_ID = '10000000-0000-4000-8000-000000000001';
export const DRAFT_CANDIDATE_ID = '20000000-0000-4000-8000-000000000001';

/** `SalesProductSchema.parse` 를 통과하는 판매상품 초안(원천 기록 있음). */
export function salesProductDraft(overrides: Partial<SalesProduct> = {}): SalesProduct {
  return {
    id: DRAFT_ID,
    code: null,
    ownCode: null,
    sabangnetGoodsNo: null,
    sourceRecordId: DRAFT_CANDIDATE_ID,
    sourcePlatform: 'ALIBABA_1688',
    sourceUrl: 'https://1688.com/item/1',
    name: '자석 다트게임',
    shortName: null,
    englishName: null,
    printName: null,
    modelName: null,
    modelNo: null,
    brand: null,
    manufacturer: null,
    originCountry: null,
    originRegion: null,
    keywords: [],
    standardCategory: '완구',
    description: '',
    targetAudience: null,
    ageGroup: null,
    productSize: null,
    colorVariantNames: [],
    boxSetQuantity: null,
    registrationDefaults: null,
    status: 'draft',
    taxType: 'taxable',
    deliveryFeeType: null,
    deliveryFee: null,
    optionAxes: [],
    stockManaged: false,
    imageUrls: ['https://cdn.example.com/draft.jpg'],
    noticeCategory: null,
    noticeValues: [],
    certifications: [],
    kcStatus: 'unknown',
    importDeclarationNo: null,
    adminMemo: null,
    version: 1,
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
    options: [{
      id: '30000000-0000-4000-8000-000000000001',
      optionCode: null,
      values: [],
      optionKey: '',
      alias: null,
      barcode: null,
      salePrice: null,
      normalPrice: null,
      supplyStatus: 'selling',
      safetyStock: null,
      sortOrder: 0,
      components: [],
      referenceCost: null,
      linkedChannelOptionCount: 0,
    }],
    channelOverrides: [],
    channelListings: [],
    ...overrides,
  };
}

/** 초안 목록 한 줄. */
export function salesProductDraftListItem(overrides: Partial<SalesProductListItem> = {}): SalesProductListItem {
  return {
    id: DRAFT_ID,
    code: null,
    ownCode: null,
    sourceRecordId: DRAFT_CANDIDATE_ID,
    sourcePlatform: 'ALIBABA_1688',
    sourceUrl: 'https://1688.com/item/1',
    name: '자석 다트게임',
    status: 'draft',
    salePrice: null,
    imageUrl: 'https://cdn.example.com/draft.jpg',
    optionAxes: [],
    optionCount: 1,
    sellingOptionCount: 1,
    unlinkedOptionCount: 1,
    channelListingCount: 0,
    channelOverrideCount: 0,
    registrationAccounts: [],
    updatedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  };
}

/** 원본 기록(`GET /api/sourcing/source-records/:id`) 응답. 원본 사실만 채운다(KID-313). */
export function sourcingCandidateResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_CANDIDATE_ID,
    sourcePlatform: 'ALIBABA_1688',
    sourceUrl: 'https://1688.com/item/1',
    externalOfferId: '1',
    name: '원본 상품명',
    description: '',
    category: null,
    costCny: null,
    rawData: { title: '원본 제목' },
    images: [{ id: 'source-image-1', url: 'https://cdn.example.com/source.jpg', role: 'product', sortOrder: 0, isPrimary: true }],
    collectedAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
  };
}

export const EMPTY_REGISTRATION_MEDIA = {
  registrationImages: { primary: [], thumbnail: [], detail: [] },
  currentThumbnail: null,
};

export function draftRoutes(salesProductId = DRAFT_ID) {
  return {
    draft: `/api/products/sales-products/${salesProductId}`,
    candidate: `/api/sourcing/source-records/${DRAFT_CANDIDATE_ID}`,
    workspace: `/api/ai/content-workspaces/by-sales-product/${salesProductId}`,
    media: `/api/ai/content-workspaces/by-sales-product/${salesProductId}/registration-media`,
  };
}
