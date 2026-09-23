import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  applyBasicsPriceToSalesProduct,
  candidatesApi,
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
    sourceCandidateId: '20000000-0000-4000-8000-000000000001',
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

describe('sourcing candidate API', () => {
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

    await candidatesApi.quickProcess('sp-1', 'all', 'quick-process-key');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/products/sales-products/sp-1/generation',
      { task: 'all' },
      { headers: { 'Idempotency-Key': 'quick-process-key' } },
    );
  });

  it('deletes sourcing inbox cards through the sourcing candidate route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce({ ok: true });

    await expect(candidatesApi.delete('cand-1')).resolves.toEqual({ ok: true });

    expect(apiClient.delete).toHaveBeenCalledWith('/api/sourcing/candidates/cand-1');
  });

  it('passes the selected manual registration platform to the sourcing list endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await productsApi.list({
      page: 1,
      limit: 20,
      platform: 'KIDITEM_PRODUCT_REGISTRATION',
      sort: 'newest',
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/sourcing/extension/products?page=1&limit=20&platform=KIDITEM_PRODUCT_REGISTRATION&sort=newest',
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

  // 저장한 대표 썸네일이 카드에 반영되지 않던 회귀.
  // `sourcing_candidates.thumbnail_url` 은 수집 원본이라 대표를 바꿔 저장해도
  // 그대로다. 서버가 내려주는 `selectedThumbnailUrl` 을 카드가 읽어야 한다.
  it('목록 카드 썸네일은 저장된 대표를 수집 원본보다 우선한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [
        {
          id: 'cand-1',
          name: '4000과일바구니딸깍이키링',
          status: 'sourced',
          sourcePlatform: 'KIDITEM_PRODUCT_REGISTRATION',
          thumbnailUrl: 'https://cdn.example.com/scrape-original.png',
          imageUrl: 'https://cdn.example.com/scrape-original.png',
          images: [],
          registrationTarget: null,
          selectedThumbnailUrl: 'https://cdn.example.com/saved-representative.jpg',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const { items } = await productsApi.list({ page: 1, limit: 20 });

    expect(items[0].selectedThumbnailUrl).toBe('https://cdn.example.com/saved-representative.jpg');
    expect(items[0].thumbnailUrl).toBe('https://cdn.example.com/saved-representative.jpg');
  });

  it('저장된 대표가 없으면 수집 원본으로 떨어진다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [
        {
          id: 'cand-1',
          name: '4000과일바구니딸깍이키링',
          status: 'sourced',
          sourcePlatform: 'KIDITEM_PRODUCT_REGISTRATION',
          thumbnailUrl: 'https://cdn.example.com/scrape-original.png',
          imageUrl: 'https://cdn.example.com/scrape-original.png',
          images: [],
          registrationTarget: null,
          selectedThumbnailUrl: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const { items } = await productsApi.list({ page: 1, limit: 20 });

    expect(items[0].selectedThumbnailUrl).toBeNull();
    expect(items[0].thumbnailUrl).toBe('https://cdn.example.com/scrape-original.png');
  });

  it('keeps description/info images out of product thumbnail images', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'cand-1',
      name: '아동용 스니커즈',
      status: 'sourced',
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://1688.com/item/1',
      thumbnailUrl: null,
      imageUrl: null,
      sellPrice: null,
      costCny: null,
      processedData: null,
      rawData: {
        title: '아동용 스니커즈',
        description_images: ['https://cdn.example.com/detail-info.jpg'],
        detail_images: ['https://cdn.example.com/detail-info-2.jpg'],
      },
      images: [
        { url: 'https://cdn.example.com/product-1.jpg', role: 'product', sortOrder: 0, isPrimary: true },
        { url: 'https://cdn.example.com/detail-info.jpg', role: 'detail', sortOrder: 1, isPrimary: false },
      ],
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });

    const detail = await productsApi.getDetail('cand-1');

    expect(detail.image_urls).toEqual(['https://cdn.example.com/product-1.jpg']);
    expect(detail.image_count).toBe(1);
    expect(detail.raw_data?.description_images).toEqual(['https://cdn.example.com/detail-info.jpg']);
  });

  it('normalizes the current product preparation from candidate detail responses', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'cand-1',
      name: '자석 다트게임',
      status: 'sourced',
      sourcePlatform: 'KIDITEM_PRODUCT_REGISTRATION',
      sourceUrl: 'kiditem://manual-product-registration/1',
      thumbnailUrl: 'https://cdn.example.com/source.jpg',
      imageUrl: 'https://cdn.example.com/source.jpg',
      sellPrice: null,
      costCny: null,
      processedData: null,
      rawData: {},
      images: [],
      registrationTarget: {
        id: '44444444-4444-4444-8444-444444444444',
        sourceCandidateId: 'cand-1',
        channelAccountId: '11111111-1111-4111-8111-111111111111',
        sourceContentWorkspaceId: '66666666-6666-4666-8666-666666666666',
        channelListingId: '77777777-7777-4777-8777-777777777777',
        displayName: '자석 다트게임',
        status: 'registered',
        selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
        selectedThumbnailGenerationId: '88888888-8888-4888-8888-888888888888',
        selectedThumbnailGenerationCandidateId: '22222222-2222-4222-8222-222222222222',
        selectedDetailPageArtifactId: '99999999-9999-4999-8999-999999999999',
        selectedDetailPageRevisionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        selectedDetailPageGenerationId: '33333333-3333-4333-8333-333333333333',
        registrationInput: { category: '완구', wingCategoryKey: '64687' },
        createdAt: '2026-05-17T00:30:00.000Z',
        updatedAt: '2026-05-17T01:00:00.000Z',
      },
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });

    const detail = await productsApi.getDetail('cand-1');

    expect(detail.registrationTarget).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      sourceCandidateId: 'cand-1',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      sourceContentWorkspaceId: '66666666-6666-4666-8666-666666666666',
      channelListingId: '77777777-7777-4777-8777-777777777777',
      status: 'registered',
      selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
      selectedThumbnailGenerationId: '88888888-8888-4888-8888-888888888888',
      selectedThumbnailGenerationCandidateId: '22222222-2222-4222-8222-222222222222',
      selectedDetailPageGenerationId: '33333333-3333-4333-8333-333333333333',
      selectedDetailPageArtifactId: '99999999-9999-4999-8999-999999999999',
      selectedDetailPageRevisionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      registrationInput: { category: '완구', wingCategoryKey: '64687' },
      updatedAt: '2026-05-17T01:00:00.000Z',
    });
    expect(detail).not.toHaveProperty('promotedMasterId');
    expect(detail).not.toHaveProperty('promoted_master_id');
  });

  // 편집 정본은 판매상품 초안이다(KID-310 · ADR-0022). 서버는 더 이상 합성 basics 를
  // 주지 않으므로 후보 상세가 초안을 따로 읽어 basics 모양으로 옮겨야 한다.
  it('초안이 있으면 그 판매상품에서 basics 를 계산한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'cand-1',
      name: '자석 다트게임(원본명)',
      status: 'sourced',
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://1688.com/item/1',
      thumbnailUrl: 'https://cdn.example.com/scrape-original.png',
      imageUrl: null,
      sellPrice: null,
      costCny: null,
      processedData: null,
      rawData: {},
      images: [],
      registrationTarget: null,
      salesProductId: 'sp-1',
      registrationImages: { primary: ['https://cdn.example.com/primary.png'], thumbnail: [], detail: [] },
      currentThumbnail: {
        url: 'https://cdn.example.com/selected.png',
        sourceThumbnailGenerationId: 'gen-1',
        sourceThumbnailCandidateId: null,
      },
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture({
      name: '자석 다트게임',
      keywords: ['다트', '완구'],
      options: [{
        id: '30000000-0000-4000-8000-000000000001', optionCode: null, values: [], optionKey: '', alias: null, barcode: null,
        salePrice: 13900, normalPrice: 19900, supplyStatus: 'selling', safetyStock: null,
        sortOrder: 0, components: [], linkedChannelOptionCount: 0,
      }],
    }));

    const detail = await productsApi.getDetail('cand-1');

    expect(apiClient.getParsed).toHaveBeenCalledWith('/api/products/sales-products/sp-1', expect.anything());
    expect(detail.salesProductId).toBe('sp-1');
    // 초안의 값이 이긴다 — 후보 원본명이 아니라 초안에서 고친 이름을 보여준다.
    expect(detail.basicInfo.name).toBe('자석 다트게임');
    expect(detail.basicInfo.keywords).toEqual(['다트', '완구']);
    expect(detail.basicInfo.salePrice).toBe(13900);
    expect(detail.basicInfo.originalPrice).toBe(19900);
    expect(detail.basicInfo.selectedThumbnailUrl).toBe('https://cdn.example.com/selected.png');
    expect(detail.registrationImages.primary).toEqual(['https://cdn.example.com/primary.png']);
    expect(detail.currentThumbnail?.sourceThumbnailGenerationId).toBe('gen-1');
  });

  it('아직 팔기로 정하지 않은 초안은 판매가가 비어 있는 채로 보인다(미발급)', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'cand-1',
      name: '자석 다트게임',
      status: 'sourced',
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: 'https://1688.com/item/1',
      thumbnailUrl: null,
      imageUrl: null,
      sellPrice: null,
      costCny: null,
      processedData: null,
      rawData: {},
      images: [],
      registrationTarget: null,
      salesProductId: 'sp-1',
      registrationImages: { primary: [], thumbnail: [], detail: [] },
      currentThumbnail: null,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture());

    const detail = await productsApi.getDetail('cand-1');

    expect(detail.basicInfo.salePrice).toBe(0);
    expect(detail.basicInfo.salePriceSource).toBe('none');
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

  it('가격이 같으면 옵션을 다시 쓰지 않는다', async () => {
    vi.mocked(apiClient.getParsed).mockResolvedValueOnce(salesProductDraftFixture({
      version: 2,
      options: [{
        id: '30000000-0000-4000-8000-000000000001', optionCode: null, values: [], optionKey: '', alias: null, barcode: null,
        salePrice: 9900, normalPrice: null, supplyStatus: 'selling', safetyStock: null,
        sortOrder: 0, components: [], linkedChannelOptionCount: 0,
      }],
    }));

    await applyBasicsPriceToSalesProduct('sp-1', 9900, 0);

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

    await applyBasicsPriceToSalesProduct('sp-1', 9900, 12900);

    expect(apiClient.put).toHaveBeenCalledWith('/api/products/sales-products/sp-1/options', {
      expectedVersion: 2,
      optionAxes: [],
      options: [expect.objectContaining({ id: '30000000-0000-4000-8000-000000000001', salePrice: 9900, normalPrice: 12900 })],
    });
  });

  it('rejects the retired promoted candidate status', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'cand-legacy',
      name: '레거시 후보',
      status: 'promoted',
      sourcePlatform: 'ALIBABA_1688',
      sourceUrl: null,
      thumbnailUrl: null,
      imageUrl: null,
      sellPrice: null,
      costCny: null,
      processedData: null,
      rawData: {},
      images: [],
      registrationTarget: null,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });

    await expect(productsApi.getDetail('cand-legacy')).rejects.toThrow();
  });
});
