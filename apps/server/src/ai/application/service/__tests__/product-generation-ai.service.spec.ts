import { describe, expect, it, vi } from 'vitest';
import { ProductGenerationAiService } from '../product-generation-ai.service';
import type { ProductGenerationAiRequest } from '../../port/in/generation/product-generation-ai-trigger.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const SALES_PRODUCT_ID = '00000000-0000-4000-8000-000000000003';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000007';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000004';
const CONTENT_GENERATION_ID = '00000000-0000-4000-8000-000000000005';
const THUMBNAIL_GENERATION_ID = '00000000-0000-4000-8000-000000000006';

const request = (overrides: Partial<ProductGenerationAiRequest> = {}): ProductGenerationAiRequest => ({
  organizationId: ORGANIZATION_ID,
  idempotencyKey: 'product-generation:test:all',
  requestHash: 'a'.repeat(64),
  triggeredByUserId: USER_ID,
  salesProductId: SALES_PRODUCT_ID,
  sourceCandidateId: CANDIDATE_ID,
  productBrief: {
    productName: '자석 다트게임',
    category: '완구',
    description: '안전한 다트 보드',
    target: '초등학생',
    imageUrls: ['https://example.com/main.jpg'],
    thumbnailUrl: 'https://example.com/main.jpg',
    optionNames: ['기본'],
    productSize: '높이: 30cm',
    colorVariantStatus: 'auto',
    colorVariantNames: '',
    boxSetStatus: 'auto',
    boxSetQuantity: '',
  },
  templateId: 'bold-vertical',
  ageGroup: 'age-8-plus',
  detailImageCount: '2',
  usageSectionMode: 'include',
  kcCertificationStatus: 'unknown',
  kcCertificationNumber: null,
  ...overrides,
});

function generationContextRepository() {
  return {
    findExistingChildren: vi.fn().mockResolvedValue({
      detail: null,
      thumbnail: null,
    }),
  };
}

function editorAi() {
  return {
    resolveInputImage: vi.fn().mockResolvedValue({
      data: 'AAA',
      url: 'https://example.com/main.jpg',
      storageKey: null,
      mimeType: 'image/jpeg',
      label: 'Product photo',
      role: 'product',
      sortOrder: 0,
      source: 'sourcing_candidate',
      fileSize: null,
    }),
  };
}

function makeService(overrides: {
  contextRepository?: ReturnType<typeof generationContextRepository>;
  detailPages?: { generate: ReturnType<typeof vi.fn> };
  thumbnails?: { enqueueSalesProductGeneration: ReturnType<typeof vi.fn> };
  editorAi?: ReturnType<typeof editorAi>;
} = {}) {
  const contextRepository = overrides.contextRepository ?? generationContextRepository();
  const detailPages = overrides.detailPages ?? {
    generate: vi.fn().mockResolvedValue({
      id: CONTENT_GENERATION_ID,
      contentWorkspaceId: WORKSPACE_ID,
    }),
  };
  const thumbnails = overrides.thumbnails ?? {
    enqueueSalesProductGeneration: vi.fn().mockResolvedValue({
      generationId: THUMBNAIL_GENERATION_ID,
      status: 'pending',
    }),
  };
  const resolvedEditorAi = overrides.editorAi ?? editorAi();
  const service = new ProductGenerationAiService(
    contextRepository as never,
    detailPages as never,
    thumbnails as never,
    resolvedEditorAi as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    contextRepository,
    detailPages,
    thumbnails,
    editorAi: resolvedEditorAi,
  };
}

describe('ProductGenerationAiService', () => {
  it('rejects a request without its required idempotency coordinate', async () => {
    const { service } = makeService();

    await expect(service.startForSalesProduct(request({ idempotencyKey: undefined })))
      .rejects.toThrow('product_generation_idempotency_required');
  });

  it('returns direct child ids and workspace without an operation aggregate', async () => {
    const { service, detailPages, thumbnails, editorAi } = makeService();

    await expect(service.startForSalesProduct(request())).resolves.toEqual({
      salesProductId: SALES_PRODUCT_ID,
      detailGenerationId: CONTENT_GENERATION_ID,
      thumbnailGenerationId: THUMBNAIL_GENERATION_ID,
      contentWorkspaceId: WORKSPACE_ID,
      href: `/product-pipeline/collected-products/${SALES_PRODUCT_ID}`,
    });
    expect(detailPages.generate).toHaveBeenCalledWith(
      expect.objectContaining({ rawTitle: '자석 다트게임' }),
      ORGANIZATION_ID,
      USER_ID,
      expect.objectContaining({
        generationId: expect.any(String),
        requestHash: 'a'.repeat(64),
      }),
    );
    expect(detailPages.generate.mock.calls[0]).toHaveLength(4);
    expect(thumbnails.enqueueSalesProductGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        productGenerationIdentity: expect.objectContaining({
          generationId: expect.any(String),
          requestHash: 'a'.repeat(64),
        }),
      }),
    );
    expect(editorAi.resolveInputImage).toHaveBeenCalledTimes(1);
  });

  it('propagates a detail enqueue failure instead of returning null child ids', async () => {
    const detailError = new Error('detail_enqueue_failed');
    const detailPages = { generate: vi.fn().mockRejectedValue(detailError) };
    const { service, thumbnails } = makeService({ detailPages });

    await expect(service.startForSalesProduct(request())).rejects.toBe(detailError);
    expect(thumbnails.enqueueSalesProductGeneration).not.toHaveBeenCalled();
  });

  it('propagates a thumbnail enqueue failure after detail admission', async () => {
    const thumbnailError = new Error('thumbnail_enqueue_failed');
    const thumbnails = { enqueueSalesProductGeneration: vi.fn().mockRejectedValue(thumbnailError) };
    const { service } = makeService({ thumbnails });

    await expect(service.startForSalesProduct(request())).rejects.toBe(thumbnailError);
  });

  it('returns durable full replay ids before reading mutable candidate or provider inputs', async () => {
    const contextRepository = generationContextRepository();
    contextRepository.findExistingChildren
      .mockResolvedValueOnce({ detail: null, thumbnail: null })
      .mockResolvedValueOnce({
        detail: {
          generationId: CONTENT_GENERATION_ID,
          requestHash: 'a'.repeat(64),
          contentWorkspaceId: WORKSPACE_ID,
        },
        thumbnail: {
          generationId: THUMBNAIL_GENERATION_ID,
          requestHash: 'a'.repeat(64),
        },
      });
    const { service, detailPages, thumbnails, editorAi } = makeService({ contextRepository });

    const admitted = await service.startForSalesProduct(request());

    await expect(service.startForSalesProduct(request())).resolves.toEqual(admitted);
    expect(detailPages.generate).toHaveBeenCalledTimes(1);
    expect(editorAi.resolveInputImage).toHaveBeenCalledTimes(1);
    expect(thumbnails.enqueueSalesProductGeneration).toHaveBeenCalledTimes(1);
  });

  it('retries only a missing thumbnail when the matching detail child is already durable', async () => {
    const contextRepository = generationContextRepository();
    contextRepository.findExistingChildren.mockResolvedValue({
      detail: {
        generationId: CONTENT_GENERATION_ID,
        requestHash: 'a'.repeat(64),
        contentWorkspaceId: WORKSPACE_ID,
      },
      thumbnail: null,
    });
    const detailPages = {
      generate: vi.fn().mockRejectedValue(new Error('detail_must_not_be_reenqueued')),
    };
    const { service, thumbnails } = makeService({ contextRepository, detailPages });

    await expect(service.startForSalesProduct(request())).resolves.toEqual({
      salesProductId: SALES_PRODUCT_ID,
      detailGenerationId: CONTENT_GENERATION_ID,
      thumbnailGenerationId: THUMBNAIL_GENERATION_ID,
      contentWorkspaceId: WORKSPACE_ID,
      href: `/product-pipeline/collected-products/${SALES_PRODUCT_ID}`,
    });
    expect(detailPages.generate).not.toHaveBeenCalled();
    expect(thumbnails.enqueueSalesProductGeneration).toHaveBeenCalledTimes(1);
    expect(thumbnails.enqueueSalesProductGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ contentWorkspaceId: WORKSPACE_ID }),
    );
  });

  it('rejects a soft-deleted deterministic detail child before mutable replay input is read', async () => {
    const contextRepository = generationContextRepository();
    contextRepository.findExistingChildren.mockResolvedValue({
      detail: {
        generationId: CONTENT_GENERATION_ID,
        requestHash: 'a'.repeat(64),
        contentWorkspaceId: WORKSPACE_ID,
        isDeleted: true,
      },
      thumbnail: null,
    });
    const { service, detailPages, thumbnails, editorAi } = makeService({ contextRepository });

    await expect(service.startForSalesProduct(request({ task: 'detail' })))
      .rejects.toThrow('product_generation_idempotency_conflict');
    expect(detailPages.generate).not.toHaveBeenCalled();
    expect(editorAi.resolveInputImage).not.toHaveBeenCalled();
    expect(thumbnails.enqueueSalesProductGeneration).not.toHaveBeenCalled();
  });

  it('rejects a soft-deleted deterministic thumbnail child before mutable replay input is read', async () => {
    const contextRepository = generationContextRepository();
    contextRepository.findExistingChildren.mockResolvedValue({
      detail: null,
      thumbnail: {
        generationId: THUMBNAIL_GENERATION_ID,
        requestHash: 'a'.repeat(64),
        isDeleted: true,
      },
    });
    const { service, detailPages, thumbnails, editorAi } = makeService({ contextRepository });

    await expect(service.startForSalesProduct(request({ task: 'thumbnail' })))
      .rejects.toThrow('product_generation_idempotency_conflict');
    expect(detailPages.generate).not.toHaveBeenCalled();
    expect(editorAi.resolveInputImage).not.toHaveBeenCalled();
    expect(thumbnails.enqueueSalesProductGeneration).not.toHaveBeenCalled();
  });

  it('retries a partial admission with the same durable child identities', async () => {
    const thumbnailError = new Error('thumbnail_enqueue_failed');
    const detailPages = {
      generate: vi.fn(async (
        _input: unknown,
        _organizationId: string,
        _triggeredByUserId: string | null,
        identity: { generationId: string; requestHash: string },
      ) => ({
        id: identity.generationId,
        contentWorkspaceId: WORKSPACE_ID,
      })),
    };
    let thumbnailAttempts = 0;
    const thumbnails = {
      enqueueSalesProductGeneration: vi.fn(async (input: {
        productGenerationIdentity: { generationId: string; requestHash: string };
      }) => {
        thumbnailAttempts += 1;
        if (thumbnailAttempts === 1) throw thumbnailError;
        return { generationId: input.productGenerationIdentity.generationId, status: 'pending' };
      }),
    };
    const { service } = makeService({ detailPages, thumbnails });

    await expect(service.startForSalesProduct(request())).rejects.toBe(thumbnailError);
    const replay = await service.startForSalesProduct(request());

    const firstDetailIdentity = detailPages.generate.mock.calls[0][3];
    const secondDetailIdentity = detailPages.generate.mock.calls[1][3];
    const firstThumbnailIdentity =
      thumbnails.enqueueSalesProductGeneration.mock.calls[0][0].productGenerationIdentity;
    const secondThumbnailIdentity =
      thumbnails.enqueueSalesProductGeneration.mock.calls[1][0].productGenerationIdentity;
    expect(secondDetailIdentity).toEqual(firstDetailIdentity);
    expect(secondThumbnailIdentity).toEqual(firstThumbnailIdentity);
    expect(replay).toMatchObject({
      detailGenerationId: firstDetailIdentity.generationId,
      thumbnailGenerationId: firstThumbnailIdentity.generationId,
      contentWorkspaceId: WORKSPACE_ID,
    });
  });

  it('passes request-hash drift to the direct owner for rejection', async () => {
    const detailRequestHashes = new Map<string, string>();
    const detailPages = {
      generate: vi.fn(async (
        _input: unknown,
        _organizationId: string,
        _triggeredByUserId: string | null,
        identity: { generationId: string; requestHash: string },
      ) => {
        const existingHash = detailRequestHashes.get(identity.generationId);
        if (existingHash && existingHash !== identity.requestHash) {
          throw new Error('product_generation_idempotency_conflict');
        }
        detailRequestHashes.set(identity.generationId, identity.requestHash);
        return { id: identity.generationId, contentWorkspaceId: WORKSPACE_ID };
      }),
    };
    const thumbnails = {
      enqueueSalesProductGeneration: vi.fn(async (input: {
        productGenerationIdentity: { generationId: string; requestHash: string };
      }) => ({ generationId: input.productGenerationIdentity.generationId, status: 'pending' })),
    };
    const { service } = makeService({ detailPages, thumbnails });

    await expect(service.startForSalesProduct(request())).resolves.toMatchObject({
      detailGenerationId: expect.any(String),
      thumbnailGenerationId: expect.any(String),
    });
    await expect(service.startForSalesProduct(request({ requestHash: 'b'.repeat(64) })))
      .rejects.toThrow('product_generation_idempotency_conflict');
  });

  it('rejects a different hash before admitting a disjoint child kind for the same key', async () => {
    const childRequestHashes = new Map<string, string>();
    const contextRepository = generationContextRepository();
    contextRepository.findExistingChildren.mockImplementation(async (input: {
      detailGenerationId: string;
      thumbnailGenerationId: string;
    }) => {
      const detailRequestHash = childRequestHashes.get(input.detailGenerationId);
      const thumbnailRequestHash = childRequestHashes.get(input.thumbnailGenerationId);
      return {
        detail: detailRequestHash
          ? {
              generationId: input.detailGenerationId,
              requestHash: detailRequestHash,
              contentWorkspaceId: WORKSPACE_ID,
            }
          : null,
        thumbnail: thumbnailRequestHash
          ? {
              generationId: input.thumbnailGenerationId,
              requestHash: thumbnailRequestHash,
            }
          : null,
      };
    });
    const detailPages = {
      generate: vi.fn().mockResolvedValue({
        id: CONTENT_GENERATION_ID,
        contentWorkspaceId: WORKSPACE_ID,
      }),
    };
    const thumbnails = {
      enqueueSalesProductGeneration: vi.fn(async (input: {
        productGenerationIdentity: { generationId: string; requestHash: string };
      }) => {
        childRequestHashes.set(
          input.productGenerationIdentity.generationId,
          input.productGenerationIdentity.requestHash,
        );
        return {
          generationId: input.productGenerationIdentity.generationId,
          status: 'pending',
        };
      }),
    };
    const { service } = makeService({ contextRepository, detailPages, thumbnails });

    await service.startForSalesProduct(request({ task: 'thumbnail' }));

    await expect(service.startForSalesProduct(request({
      task: 'detail',
      requestHash: 'b'.repeat(64),
    }))).rejects.toThrow('product_generation_idempotency_conflict');
    expect(detailPages.generate).not.toHaveBeenCalled();
  });

  it('can request detail only and leaves thumbnail fields null', async () => {
    const { service, thumbnails } = makeService();

    await expect(service.startForSalesProduct(request({ task: 'detail' }))).resolves.toEqual({
      salesProductId: SALES_PRODUCT_ID,
      detailGenerationId: CONTENT_GENERATION_ID,
      thumbnailGenerationId: null,
      contentWorkspaceId: WORKSPACE_ID,
      href: `/product-pipeline/collected-products/${SALES_PRODUCT_ID}`,
    });
    expect(thumbnails.enqueueSalesProductGeneration).not.toHaveBeenCalled();
  });
});
