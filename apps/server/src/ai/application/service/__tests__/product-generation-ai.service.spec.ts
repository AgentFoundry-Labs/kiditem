import { describe, expect, it, vi } from 'vitest';
import { ProductGenerationAiService } from '../product-generation-ai.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000003';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000004';
const CONTENT_GENERATION_ID = '00000000-0000-4000-8000-000000000005';
const THUMBNAIL_GENERATION_ID = '00000000-0000-4000-8000-000000000006';

describe('ProductGenerationAiService', () => {
  it('starts parent alert and enqueues detail plus thumbnail for a sourcing candidate', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: CANDIDATE_ID,
          name: '자석 다트게임',
          category: '완구',
          description: '안전한 다트 보드',
          thumbnailUrl: 'https://example.com/main.jpg',
          images: [{ url: 'https://example.com/main.jpg', sortOrder: 0 }],
        }),
      },
    };
    const detailPages = {
      generate: vi.fn().mockResolvedValue({
        id: CONTENT_GENERATION_ID,
        registrationWorkspaceId: WORKSPACE_ID,
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
      start: vi.fn().mockResolvedValue({}),
      markChildFinished: vi.fn(),
    };

    const service = new ProductGenerationAiService(
      prisma as never,
      detailPages as never,
      thumbnails as never,
      editorAi as never,
      parentAlerts as never,
    );

    const result = await service.startForCandidate({
      organizationId: ORGANIZATION_ID,
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
        productId: undefined,
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
      registrationWorkspaceId: WORKSPACE_ID,
      operationAlert: expect.objectContaining({
        mode: 'parent',
        childKind: 'thumbnail',
      }),
    }));
  });
});
