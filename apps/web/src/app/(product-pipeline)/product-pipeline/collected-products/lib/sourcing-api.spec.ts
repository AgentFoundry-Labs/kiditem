import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { candidatesApi, productsApi } from './sourcing-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('sourcing candidate API', () => {
  beforeEach(() => {
    vi.mocked(apiClient.delete).mockReset();
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
  });

  it('creates an account-scoped preparation draft through the legacy promote alias', async () => {
    const input = {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      displayName: '자석 다트게임',
      registrationInput: {
        name: '자석 다트게임',
        category: '완구',
        salePrice: 21900,
      },
      selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
      selectedThumbnailGenerationCandidateId: '22222222-2222-4222-8222-222222222222',
      selectedDetailPageGenerationId: '33333333-3333-4333-8333-333333333333',
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      preparationId: '44444444-4444-4444-8444-444444444444',
      status: 'draft',
    });

    await expect(candidatesApi.createPreparationDraft('cand-1', input)).resolves.toEqual({
      preparationId: '44444444-4444-4444-8444-444444444444',
      status: 'draft',
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/sourcing/candidates/cand-1/promote',
      input,
    );
  });

  it('rejects the retired master promotion response shape', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      masterId: '55555555-5555-4555-8555-555555555555',
      masterCode: 'M-00000001',
    });

    await expect(candidatesApi.createPreparationDraft('cand-1', {
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      displayName: '자석 다트게임',
      registrationInput: { name: '자석 다트게임' },
    })).rejects.toThrow();
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

  it('starts AI quick processing for an existing collected candidate', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true });

    await candidatesApi.quickProcess('cand-1');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/sourcing/candidates/cand-1/quick-process',
      { task: 'all' },
    );
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
      productPreparation: {
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
        registrationInput: { category: '완구' },
        createdAt: '2026-05-17T00:30:00.000Z',
        updatedAt: '2026-05-17T01:00:00.000Z',
      },
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });

    const detail = await productsApi.getDetail('cand-1');

    expect(detail.productPreparation).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      sourceCandidateId: 'cand-1',
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      contentWorkspaceId: '66666666-6666-4666-8666-666666666666',
      listingId: '77777777-7777-4777-8777-777777777777',
      status: 'registered',
      selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
      selectedThumbnailGenerationId: '88888888-8888-4888-8888-888888888888',
      selectedThumbnailGenerationCandidateId: '22222222-2222-4222-8222-222222222222',
      selectedDetailPageGenerationId: '33333333-3333-4333-8333-333333333333',
      selectedDetailPageArtifactId: '99999999-9999-4999-8999-999999999999',
      selectedDetailPageRevisionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updatedAt: '2026-05-17T01:00:00.000Z',
    });
    expect(detail).not.toHaveProperty('promotedMasterId');
    expect(detail).not.toHaveProperty('promoted_master_id');
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
      productPreparation: null,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });

    await expect(productsApi.getDetail('cand-legacy')).rejects.toThrow();
  });
});
