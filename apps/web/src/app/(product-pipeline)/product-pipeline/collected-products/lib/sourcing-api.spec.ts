import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { SalesProductSchema } from '@kiditem/shared/sales-product';
import {
  applyBasicsPriceToSalesProduct,
  basicsPriceChange,
  composeProductDetail,
  salesProductGenerationApi,
  productsApi,
  salesProductUpdateInputFromBasics,
  searchSellpiaInventorySkus,
} from './sourcing-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    getParsed: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

/** `SalesProductSchema.parse` 를 통과하는 최소 판매상품 초안. */
function salesProductDraftFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    code: null,
    ownCode: null,
    sabangnetGoodsNo: null,
    sourceRecordId: '20000000-0000-4000-8000-000000000001',
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
    keywords: ['다트'],
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
    detailHtml: null,
    extraDetailHtml: [],
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
      linkedChannelOptionCount: 0,
    }],
    channelOverrides: [],
    channelListings: [],
    ...overrides,
  };
}

describe('sourcing API', () => {
  beforeEach(() => {
    vi.mocked(apiClient.delete).mockReset();
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.getParsed).mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.put).mockReset();
  });

  it('starts sales-product generation through the draft-scoped endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      ok: true,
      candidateId: 'cand-1',
      salesProductId: 'sp-1',
      href: '/product-pipeline/collected-products/sp-1',
      detailGenerationId: null,
      thumbnailGenerationId: null,
      contentWorkspaceId: 'ws-1',
    });

    await salesProductGenerationApi.start('sp-1', 'all', 'quick-process-key');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/products/sales-products/sp-1/generation',
      { task: 'all' },
      { headers: { 'Idempotency-Key': 'quick-process-key' } },
    );
  });

  it('searches in-stock Sellpia SKUs by default and includes zero stock only on opt-in', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });

    await searchSellpiaInventorySkus(' SP-1 ');
    await searchSellpiaInventorySkus('SP-1', true);

    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/inventory/sellpia-skus?page=1&limit=20&query=SP-1&activeStatus=active&stockStatus=in_stock',
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/inventory/sellpia-skus?page=1&limit=20&query=SP-1&activeStatus=active&stockStatus=all',
    );
  });

  describe('수집상품 화면은 판매상품 초안으로 연다(KID-310)', () => {
    const DRAFT_ID = '10000000-0000-4000-8000-000000000001';
    const CANDIDATE_ID = '20000000-0000-4000-8000-000000000001';
    const EMPTY_MEDIA = { registrationImages: { primary: [], thumbnail: [], detail: [] }, currentThumbnail: null };

    /** `GET /api/sourcing/source-records/:id` 의 원본 기록(KID-313). */
    function candidateResponse(overrides: Record<string, unknown> = {}) {
      return {
        id: CANDIDATE_ID,
        sourcePlatform: '1688',
        sourceUrl: 'https://1688.com/item/1',
        externalOfferId: '1',
        name: '자석 다트게임(원본명)',
        description: '',
        category: null,
        costCny: '12.5',
        rawData: { title: '원본 제목' },
        images: [],
        collectedAt: '2026-05-16T00:00:00.000Z',
        ...overrides,
      };
    }

    function routeGets(routes: Record<string, unknown>) {
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url in routes) return routes[url];
        throw new Error(`unexpected GET ${url}`);
      });
    }

    it('초안을 판매상품 id 로 읽고, 원천 사실만 초안의 원천 기록에서 읽는다', async () => {
      vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture({
        name: '자석 다트게임',
        keywords: ['다트', '완구'],
        options: [{
          id: '30000000-0000-4000-8000-000000000001', optionCode: null, values: [], optionKey: '', alias: null, barcode: null,
          salePrice: 13900, normalPrice: 19900, supplyStatus: 'selling', safetyStock: null,
          sortOrder: 0, components: [], linkedChannelOptionCount: 0,
        }],
      }));
      routeGets({
        [`/api/sourcing/source-records/${CANDIDATE_ID}`]: candidateResponse({
          rawData: {
            title: '원본 제목',
            description_images: ['https://cdn.example.com/detail-info.jpg'],
          },
          images: [
            { url: 'https://cdn.example.com/product-1.jpg', role: 'product', sortOrder: 0, isPrimary: true },
            { url: 'https://cdn.example.com/detail-info.jpg', role: 'detail', sortOrder: 1, isPrimary: false },
          ],
        }),
        [`/api/ai/content-workspaces/by-sales-product/${DRAFT_ID}/registration-media`]: {
          registrationImages: { primary: ['https://cdn.example.com/primary.png'], thumbnail: ['https://cdn.example.com/t1.png'], detail: [] },
          currentThumbnail: {
            assetId: '00000000-0000-4000-8000-0000000000b1',
            url: 'https://cdn.example.com/selected.png',
            source: 'ai',
            thumbnailGenerationId: 'gen-1',
          },
        },
      });

      const detail = await productsApi.getDetail(DRAFT_ID);

      expect(apiClient.getParsed).toHaveBeenCalledWith(`/api/products/sales-products/${DRAFT_ID}`, expect.anything());
      expect(detail.id).toBe(DRAFT_ID);
      expect(detail.salesProductId).toBe(DRAFT_ID);
      expect(detail.sourceRecordId).toBe(CANDIDATE_ID);
      // 편집 값은 초안이 이긴다 — 후보 원본명이 아니라 초안에서 고친 이름이다.
      expect(detail.name).toBe('자석 다트게임');
      expect(detail.basicInfo.name).toBe('자석 다트게임');
      expect(detail.basicInfo.keywords).toEqual(['다트', '완구']);
      expect(detail.basicInfo.salePrice).toBe(13900);
      expect(detail.basicInfo.originalPrice).toBe(19900);
      // 원천 사실(수집 원본 이미지 · 원본 데이터 · 원가)은 원천 기록에서 온다. 상세 설명 이미지는 상품 이미지가 아니다.
      expect(detail.image_urls).toEqual(['https://cdn.example.com/product-1.jpg']);
      expect(detail.raw_data?.description_images).toEqual(['https://cdn.example.com/detail-info.jpg']);
      expect(detail.cost_cny).toBe(12.5);
      // 등록용 사진과 대표 썸네일은 초안의 것이다.
      expect(detail.registrationImages.thumbnail).toEqual(['https://cdn.example.com/t1.png']);
      expect(detail.basicInfo.selectedThumbnailUrl).toBe('https://cdn.example.com/selected.png');
      expect(detail.currentThumbnail).toMatchObject({ assetId: '00000000-0000-4000-8000-0000000000b1', thumbnailGenerationId: 'gen-1' });
      expect(detail.basicInfo.selectedThumbnailAssetId).toBe('00000000-0000-4000-8000-0000000000b1');
    });

    it('원천 기록이 없는 초안(직접 작성 · 사방넷)은 후보를 묻지 않고 초안 사진으로 보인다', async () => {
      vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture({
        sourceRecordId: null,
        sourcePlatform: null,
        sourceUrl: null,
        name: '직접 만든 상품',
      }));
      routeGets({
        [`/api/ai/content-workspaces/by-sales-product/${DRAFT_ID}/registration-media`]: EMPTY_MEDIA,
      });

      const detail = await productsApi.getDetail(DRAFT_ID);

      expect(vi.mocked(apiClient.get).mock.calls.map(([url]) => url)).toEqual([
        `/api/ai/content-workspaces/by-sales-product/${DRAFT_ID}/registration-media`,
      ]);
      expect(detail.sourceRecordId).toBeNull();
      expect(detail.name).toBe('직접 만든 상품');
      expect(detail.image_urls).toEqual(['https://cdn.example.com/draft.jpg']);
      expect(detail.raw_data).toBeNull();
      expect(detail.registrationAccounts).toEqual([]);
      expect(detail).not.toHaveProperty('registrationTarget');
      expect(detail).not.toHaveProperty('registrationState');
    });

    it('원본 기록 응답은 원본 사실만 준다 — 등록 설정과 울타리 상태는 여기서 읽지 않는다(KID-313)', async () => {
      vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture());
      routeGets({
        [`/api/sourcing/source-records/${CANDIDATE_ID}`]: candidateResponse(),
        [`/api/ai/content-workspaces/by-sales-product/${DRAFT_ID}/registration-media`]: EMPTY_MEDIA,
      });

      const detail = await productsApi.getDetail(DRAFT_ID);

      expect(detail.registrationAccounts).toEqual([]);
      expect(detail).not.toHaveProperty('contentWorkspaceId');
    });

    it('아직 팔기로 정하지 않은 초안은 판매가가 비어 있는 채로 보인다(미발급)', async () => {
      vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture());
      routeGets({
        [`/api/sourcing/source-records/${CANDIDATE_ID}`]: candidateResponse(),
        [`/api/ai/content-workspaces/by-sales-product/${DRAFT_ID}/registration-media`]: EMPTY_MEDIA,
      });

      const detail = await productsApi.getDetail(DRAFT_ID);

      expect(detail.basicInfo.salePrice).toBeNull();
      expect(detail.basicInfo.salePriceSource).toBe('none');
    });

    it('treats a missing source record (404) as a draft without source facts', async () => {
      vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture());
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url === `/api/sourcing/source-records/${CANDIDATE_ID}`) throw new ApiError(404, 'Not Found', 'Sourcing candidate not found');
        if (url === `/api/ai/content-workspaces/by-sales-product/${DRAFT_ID}/registration-media`) return EMPTY_MEDIA;
        throw new Error(`unexpected GET ${url}`);
      });

      const detail = await productsApi.getDetail(DRAFT_ID);

      expect(detail.id).toBe(DRAFT_ID);
      expect(detail.sourceRecordId).toBe(CANDIDATE_ID);
      expect(detail.raw_data).toBeNull();
      expect(detail.image_urls).toEqual(['https://cdn.example.com/draft.jpg']);
      expect(detail.registrationAccounts).toEqual([]);
    });

    it('carries the per-account registration state it is given — the one reader, not the source record', () => {
      const account = {
        channelAccountId: '00000000-0000-4000-8000-000000000001',
        channel: 'mall-a',
        channelAccountName: '몰 A',
        registrationTargetId: '00000000-0000-4000-8000-0000000000a1',
        channelListingId: null,
        externalListingId: null,
        listingState: null,
        listingRawStatus: null,
        listingActive: false,
        state: 'confirming' as const,
        soldOut: false,
        changedSinceRegistration: false,
        selectedThumbnailAssetId: null,
        selectedDetailPageRevisionId: null,
        lastExecution: null,
      };
      const detail = composeProductDetail(
        SalesProductSchema.parse(salesProductDraftFixture()),
        null,
        EMPTY_MEDIA,
        [account],
      );
      expect(detail.registrationAccounts).toEqual([account]);
    });

    it('still surfaces any other source-record error', async () => {
      vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture());
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url === `/api/sourcing/source-records/${CANDIDATE_ID}`) throw new ApiError(500, 'Internal', 'boom');
        return EMPTY_MEDIA;
      });

      await expect(productsApi.getDetail(DRAFT_ID)).rejects.toMatchObject({ status: 500 });
    });

  });

  it('basics 폼 값을 판매상품 저장 입력으로 옮긴다(가격 제외)', () => {
    const input = salesProductUpdateInputFromBasics({
      name: '자석 다트게임',
      category: '완구',
      kcCertificationStatus: 'exists',
      kcCertificationNumber: ' R-CB-ABC-1234 ',
      certificationIssuer: '한국화학융합시험연구원',
      colorVariantNames: '빨강, 파랑, 빨강',
      boxSetQuantity: '3',
      taxType: 'tax_free',
    }, 5);

    expect(input).toEqual({
      expectedVersion: 5,
      name: '자석 다트게임',
      standardCategory: '완구',
      kcStatus: 'exists',
      colorVariantNames: ['빨강', '파랑'],
      boxSetQuantity: 3,
      taxType: 'tax_free',
      certifications: [{ number: 'R-CB-ABC-1234', issuer: '한국화학융합시험연구원' }],
    });
  });

  it('판매가만 고치면 정상가는 그대로 둔다 — 고치지 않은 가격을 null 로 지우지 않는다(KID-310 b)', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture({
      version: 2,
      options: [{
        id: '30000000-0000-4000-8000-000000000001', optionCode: null, values: [], optionKey: '', alias: null, barcode: null,
        salePrice: 5000, normalPrice: 12900, supplyStatus: 'selling', safetyStock: null,
        sortOrder: 0, components: [], linkedChannelOptionCount: 0,
      }],
    }));
    vi.mocked(apiClient.put).mockResolvedValueOnce(salesProductDraftFixture({ version: 3 }));

    await applyBasicsPriceToSalesProduct('sp-1', { salePrice: 9900 });

    expect(apiClient.put).toHaveBeenCalledWith('/api/products/sales-products/sp-1/options', expect.objectContaining({
      options: [expect.objectContaining({ salePrice: 9900, normalPrice: 12900 })],
    }));
  });

  it('폼 가격 중 불러온 값과 다른 것만 바뀐 가격으로 본다', () => {
    expect(basicsPriceChange({ salePrice: 9900, originalPrice: 12900 }, { salePrice: 5000, originalPrice: 12900 }))
      .toEqual({ salePrice: 9900 });
    expect(basicsPriceChange({ salePrice: 0, originalPrice: 0 }, { salePrice: null, originalPrice: null })).toEqual({});
    expect(basicsPriceChange({ salePrice: 0 }, { salePrice: 5000, originalPrice: null })).toEqual({ salePrice: null });
  });

  it('정해지지 않은 판매가는 0원이 아니라 비어 있다(미정)', () => {
    const detail = composeProductDetail(
      SalesProductSchema.parse(salesProductDraftFixture({
        options: [{
          id: '30000000-0000-4000-8000-000000000001', optionCode: null, values: [], optionKey: '', alias: null, barcode: null,
          salePrice: null, normalPrice: null, supplyStatus: 'selling', safetyStock: null,
          sortOrder: 0, components: [], linkedChannelOptionCount: 0,
        }],
      })),
      null,
      { registrationImages: { primary: [], thumbnail: [], detail: [] }, currentThumbnail: null },
    );
    expect(detail.basicInfo.salePrice).toBeNull();
    expect(detail.basicInfo.originalPrice).toBeNull();
  });

  it('가격이 같으면 옵션을 다시 쓰지 않는다', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture({
      version: 2,
      options: [{
        id: '30000000-0000-4000-8000-000000000001', optionCode: null, values: [], optionKey: '', alias: null, barcode: null,
        salePrice: 9900, normalPrice: null, supplyStatus: 'selling', safetyStock: null,
        sortOrder: 0, components: [], linkedChannelOptionCount: 0,
      }],
    }));

    await applyBasicsPriceToSalesProduct('sp-1', { salePrice: 9900 });

    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('가격이 다르면 모든 판매 옵션에 새 값을 싣는다', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture({
      version: 2,
      options: [{
        id: '30000000-0000-4000-8000-000000000001', optionCode: null, values: [], optionKey: '', alias: null, barcode: null,
        salePrice: null, normalPrice: null, supplyStatus: 'selling', safetyStock: null,
        sortOrder: 0, components: [], linkedChannelOptionCount: 0,
      }],
    }));
    vi.mocked(apiClient.put).mockResolvedValueOnce(salesProductDraftFixture({ version: 3 }));

    await applyBasicsPriceToSalesProduct('sp-1', { salePrice: 9900, normalPrice: 12900 });

    expect(apiClient.put).toHaveBeenCalledWith('/api/products/sales-products/sp-1/options', {
      expectedVersion: 2,
      optionAxes: [],
      options: [expect.objectContaining({ id: '30000000-0000-4000-8000-000000000001', salePrice: 9900, normalPrice: 12900 })],
    });
  });


});
