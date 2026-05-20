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
      status: 'promoted',
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
        id: 'prep-1',
        sourceCandidateId: 'cand-1',
        masterId: 'master-1',
        contentWorkspaceId: 'workspace-1',
        displayName: '자석 다트게임',
        status: 'product_registered',
        isCurrentForMaster: true,
        selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
        selectedThumbnailGenerationId: 'thumb-generation-1',
        selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
        selectedDetailPageArtifactId: 'artifact-1',
        selectedDetailPageRevisionId: 'revision-1',
        selectedDetailPageGenerationId: 'detail-generation-1',
        registrationInput: { category: '완구' },
        appliedToMasterAt: '2026-05-17T01:00:00.000Z',
        createdAt: '2026-05-17T00:30:00.000Z',
        updatedAt: '2026-05-17T01:00:00.000Z',
      },
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });

    const detail = await productsApi.getDetail('cand-1');

    expect(detail.productPreparation).toEqual({
      id: 'prep-1',
      sourceCandidateId: 'cand-1',
      masterId: 'master-1',
      contentWorkspaceId: 'workspace-1',
      status: 'product_registered',
      selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
      selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
    });
  });
});
