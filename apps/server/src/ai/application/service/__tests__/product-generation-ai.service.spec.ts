import { describe, expect, it, vi } from 'vitest';
import { ProductGenerationAiService } from '../product-generation-ai.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000003';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000004';
const CONTENT_GENERATION_ID = '00000000-0000-4000-8000-000000000005';
const THUMBNAIL_GENERATION_ID = '00000000-0000-4000-8000-000000000006';

function idempotencyPort() {
  return {
    runExclusive: vi.fn(async (_input, work: () => Promise<unknown>) => work()),
  };
}

describe('ProductGenerationAiService', () => {
  it('rejects a product-generation request without its required idempotency coordinate', async () => {
    const service = new ProductGenerationAiService(
      { findCandidate: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      idempotencyPort() as never,
    );

    await expect(service.startForCandidate({
      organizationId: ORGANIZATION_ID,
      requestHash: 'a'.repeat(64),
      triggeredByUserId: USER_ID,
      candidateId: CANDIDATE_ID,
      productName: '자석 다트게임',
      imageUrls: [],
      optionNames: [],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
    })).rejects.toThrow('product_generation_idempotency_required');
  });

  it('starts parent alert and enqueues detail plus thumbnail for a sourcing candidate', async () => {
    const contextRepository = {
      findCandidate: vi.fn().mockResolvedValue({
        id: CANDIDATE_ID,
        name: '자석 다트게임',
        category: '완구',
        description: '안전한 다트 보드',
        thumbnailUrl: 'https://example.com/main.jpg',
        images: [{ url: 'https://example.com/main.jpg', sortOrder: 0 }],
      }),
    };
    const detailPages = {
      generate: vi.fn().mockResolvedValue({
        id: CONTENT_GENERATION_ID,
        contentWorkspaceId: WORKSPACE_ID,
        imageProcessingStatus: 'pending',
      }),
    };
    const thumbnails = {
      enqueueCandidateGeneration: vi.fn().mockResolvedValue({
        generationId: THUMBNAIL_GENERATION_ID,
        status: 'pending',
      }),
    };
    const editorAi = {
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
    const parentAlerts = {
      find: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({}),
      canStartChild: vi.fn().mockResolvedValue(true),
      markChildFinished: vi.fn(),
    };

    const service = new ProductGenerationAiService(
      contextRepository as never,
      detailPages as never,
      thumbnails as never,
      editorAi as never,
      parentAlerts as never,
      idempotencyPort() as never,
    );

    const result = await service.startForCandidate({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'product-generation:test:all',
      requestHash: '1'.repeat(64),
      triggeredByUserId: USER_ID,
      candidateId: CANDIDATE_ID,
      productName: '자석 다트게임',
      category: '완구',
      description: '안전한 다트 보드',
      target: '초등학생',
      imageUrls: ['https://example.com/main.jpg'],
      thumbnailUrl: 'https://example.com/main.jpg',
      optionNames: ['기본'],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      kcCertificationNumber: null,
      productSize: '높이: 30cm',
      colorVariantStatus: 'auto',
      colorVariantNames: '',
      boxSetStatus: 'auto',
      boxSetQuantity: '',
    });

    expect(result).toEqual(expect.objectContaining({
      candidateId: CANDIDATE_ID,
      detailGenerationId: CONTENT_GENERATION_ID,
      thumbnailGenerationId: THUMBNAIL_GENERATION_ID,
      parentOperationKey: expect.stringMatching(/^product-generation:/),
      href: `/product-pipeline/collected-products/${CANDIDATE_ID}`,
    }));
    expect(parentAlerts.start).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      actorUserId: USER_ID,
      candidateId: CANDIDATE_ID,
      productName: '자석 다트게임',
      href: `/product-pipeline/collected-products/${CANDIDATE_ID}`,
    }));
    expect(detailPages.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        rawTitle: '자석 다트게임',
        sourceReferences: [{
          sourceType: 'sourcing_candidate',
          sourceCandidateId: CANDIDATE_ID,
          label: '자석 다트게임',
        }],
        templateId: 'bold-vertical',
      }),
      ORGANIZATION_ID,
      USER_ID,
      expect.objectContaining({
        operationAlert: expect.objectContaining({
          mode: 'parent',
          childKind: 'detail_page',
        }),
      }),
    );
    expect(thumbnails.enqueueCandidateGeneration).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: CANDIDATE_ID,
      contentWorkspaceId: WORKSPACE_ID,
      operationAlert: expect.objectContaining({
        mode: 'parent',
        childKind: 'thumbnail',
      }),
    }));
  });

  it('does not enqueue thumbnail generation after the parent operation is cancelled', async () => {
    const contextRepository = {
      findCandidate: vi.fn().mockResolvedValue({
        id: CANDIDATE_ID,
        name: '자석 다트게임',
        category: '완구',
        description: '안전한 다트 보드',
        thumbnailUrl: 'https://example.com/main.jpg',
        images: [{ url: 'https://example.com/main.jpg', sortOrder: 0 }],
      }),
    };
    const detailPages = {
      generate: vi.fn().mockResolvedValue({
        id: CONTENT_GENERATION_ID,
        contentWorkspaceId: WORKSPACE_ID,
      }),
    };
    const thumbnails = {
      enqueueCandidateGeneration: vi.fn(),
    };
    const editorAi = {
      resolveInputImage: vi.fn(),
    };
    const parentAlerts = {
      find: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({}),
      canStartChild: vi.fn().mockResolvedValue(false),
      markChildFinished: vi.fn(),
    };
    const service = new ProductGenerationAiService(
      contextRepository as never,
      detailPages as never,
      thumbnails as never,
      editorAi as never,
      parentAlerts as never,
      idempotencyPort() as never,
    );

    const result = await service.startForCandidate({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'product-generation:test:cancelled',
      requestHash: '2'.repeat(64),
      triggeredByUserId: USER_ID,
      candidateId: CANDIDATE_ID,
      productName: '자석 다트게임',
      category: '완구',
      description: '안전한 다트 보드',
      target: '초등학생',
      imageUrls: ['https://example.com/main.jpg'],
      thumbnailUrl: 'https://example.com/main.jpg',
      optionNames: ['기본'],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      kcCertificationNumber: null,
      productSize: '높이: 30cm',
      colorVariantStatus: 'auto',
      colorVariantNames: '',
      boxSetStatus: 'auto',
      boxSetQuantity: '',
    });

    expect(parentAlerts.canStartChild).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: expect.stringMatching(/^product-generation:/),
    });
    expect(editorAi.resolveInputImage).not.toHaveBeenCalled();
    expect(thumbnails.enqueueCandidateGeneration).not.toHaveBeenCalled();
    expect(result.thumbnailGenerationId).toBeNull();
  });

  it('can start only detail generation for a sourcing candidate', async () => {
    const contextRepository = {
      findCandidate: vi.fn().mockResolvedValue({
        id: CANDIDATE_ID,
        name: '자석 다트게임',
        category: '완구',
        description: '안전한 다트 보드',
        thumbnailUrl: 'https://example.com/main.jpg',
        images: [{ url: 'https://example.com/main.jpg', sortOrder: 0 }],
      }),
    };
    const detailPages = {
      generate: vi.fn().mockResolvedValue({
        id: CONTENT_GENERATION_ID,
        contentWorkspaceId: WORKSPACE_ID,
      }),
    };
    const thumbnails = {
      enqueueCandidateGeneration: vi.fn(),
    };
    const editorAi = {
      resolveInputImage: vi.fn(),
    };
    const parentAlerts = {
      find: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({}),
      canStartChild: vi.fn(),
      markChildFinished: vi.fn(),
    };
    const service = new ProductGenerationAiService(
      contextRepository as never,
      detailPages as never,
      thumbnails as never,
      editorAi as never,
      parentAlerts as never,
      idempotencyPort() as never,
    );

    const result = await service.startForCandidate({
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'product-generation:test:detail',
      requestHash: '3'.repeat(64),
      triggeredByUserId: USER_ID,
      candidateId: CANDIDATE_ID,
      productName: '자석 다트게임',
      category: '완구',
      description: '안전한 다트 보드',
      target: '초등학생',
      imageUrls: ['https://example.com/main.jpg'],
      thumbnailUrl: 'https://example.com/main.jpg',
      optionNames: ['기본'],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      kcCertificationNumber: null,
      productSize: '높이: 30cm',
      colorVariantStatus: 'auto',
      colorVariantNames: '',
      boxSetStatus: 'auto',
      boxSetQuantity: '',
      task: 'detail',
    });

    expect(parentAlerts.start).toHaveBeenCalledWith(expect.objectContaining({
      includeDetailPage: true,
      includeThumbnail: false,
    }));
    expect(detailPages.generate).toHaveBeenCalled();
    expect(thumbnails.enqueueCandidateGeneration).not.toHaveBeenCalled();
    expect(result.detailGenerationId).toBe(CONTENT_GENERATION_ID);
    expect(result.thumbnailGenerationId).toBeNull();
  });

  it('replays an identical idempotent request without creating duplicate children and rejects drift', async () => {
    const contextRepository = {
      findCandidate: vi.fn().mockResolvedValue({
        id: CANDIDATE_ID,
        name: '자석 다트게임',
        category: '완구',
        description: '안전한 다트 보드',
        thumbnailUrl: 'https://example.com/main.jpg',
        images: [{ url: 'https://example.com/main.jpg', sortOrder: 0 }],
      }),
    };
    const detailPages = { generate: vi.fn() };
    const thumbnails = { enqueueCandidateGeneration: vi.fn() };
    const editorAi = { resolveInputImage: vi.fn() };
    const parentAlerts = {
      find: vi.fn().mockResolvedValue({
        metadata: {
          requestHash: 'a'.repeat(64),
          childIds: {
            detailPageGenerationId: CONTENT_GENERATION_ID,
            thumbnailGenerationId: THUMBNAIL_GENERATION_ID,
          },
        },
      }),
      start: vi.fn(),
      canStartChild: vi.fn(),
      markChildFinished: vi.fn(),
    };
    const idempotency = {
      runExclusive: vi.fn(async (_input, work: () => Promise<unknown>) => work()),
    };
    const service = new ProductGenerationAiService(
      contextRepository as never,
      detailPages as never,
      thumbnails as never,
      editorAi as never,
      parentAlerts as never,
      idempotency as never,
    );
    const request = {
      organizationId: ORGANIZATION_ID,
      idempotencyKey: 'operation-1:listing.generate:item-1',
      requestHash: 'a'.repeat(64),
      triggeredByUserId: USER_ID,
      candidateId: CANDIDATE_ID,
      productName: '자석 다트게임',
      category: '완구',
      description: '안전한 다트 보드',
      target: '초등학생',
      imageUrls: ['https://example.com/main.jpg'],
      thumbnailUrl: 'https://example.com/main.jpg',
      optionNames: ['기본'],
      templateId: 'bold-vertical' as const,
      ageGroup: 'age-8-plus' as const,
      detailImageCount: '2' as const,
      usageSectionMode: 'include' as const,
      kcCertificationStatus: 'unknown' as const,
      kcCertificationNumber: null,
      productSize: '높이: 30cm',
      colorVariantStatus: 'auto',
      colorVariantNames: '',
      boxSetStatus: 'auto',
      boxSetQuantity: '',
    };

    await expect(service.startForCandidate(request)).resolves.toMatchObject({
      detailGenerationId: CONTENT_GENERATION_ID,
      thumbnailGenerationId: THUMBNAIL_GENERATION_ID,
    });
    expect(idempotency.runExclusive).toHaveBeenCalledTimes(1);
    expect(parentAlerts.start).not.toHaveBeenCalled();
    expect(detailPages.generate).not.toHaveBeenCalled();
    expect(thumbnails.enqueueCandidateGeneration).not.toHaveBeenCalled();

    await expect(service.startForCandidate({
      ...request,
      requestHash: 'b'.repeat(64),
    })).rejects.toThrow('product_generation_idempotency_conflict');
  });
});
