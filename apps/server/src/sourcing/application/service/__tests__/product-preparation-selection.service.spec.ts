import { describe, expect, it, vi } from 'vitest';
import { ProductPreparationSelectionService } from '../product-preparation-selection.service';

describe('ProductPreparationSelectionService', () => {
  it('persists basic product information into preparation registration input', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'candidate-1',
          name: '기존 상품명',
          description: '기존 설명',
          category: '완구',
          tags: ['기존'],
          rawData: { target: '아이' },
          promotedMasterId: null,
        }),
      },
      productPreparation: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'prep-1',
          registrationInput: { name: '이전 상품명', description: '이전 설명' },
        }),
        update: vi.fn().mockResolvedValue({ id: 'prep-1' }),
      },
    };
    const service = new ProductPreparationSelectionService(prisma as never);

    await service.updateBasics('org-1', 'candidate-1', {
      name: '새 상품명',
      category: '생활/완구',
      description: '새 상세 설명',
      target: '초등학생',
      ageGroup: 'age-8-plus',
      keywords: ['자석완구', '다트게임'],
      optionNames: ['단품', '2개 세트'],
      kcCertificationStatus: 'exists',
      kcCertificationNumber: 'CB061R1234-1001',
      productSize: '높이: 30cm',
      colorVariantStatus: 'multiple',
      colorVariantNames: '빨강, 파랑',
      boxSetStatus: 'box',
      boxSetQuantity: '1박스',
      salePrice: 12900,
      originalPrice: 15900,
      discountRate: 19,
      tags: ['자석', '다트'],
    });

    expect(prisma.productPreparation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'prep-1' },
      data: expect.objectContaining({
        displayName: '새 상품명',
          registrationInput: expect.objectContaining({
            name: '새 상품명',
            category: '생활/완구',
            description: '새 상세 설명',
            target: '초등학생',
            ageGroup: 'age-8-plus',
            keywords: ['자석완구', '다트게임'],
            optionNames: ['단품', '2개 세트'],
            kcCertificationStatus: 'exists',
            kcCertificationNumber: 'CB061R1234-1001',
            productSize: '높이: 30cm',
            colorVariantStatus: 'multiple',
            colorVariantNames: '빨강, 파랑',
            boxSetStatus: 'box',
            boxSetQuantity: '1박스',
            salePrice: 12900,
            originalPrice: 15900,
            discountRate: 19,
            tags: ['자석', '다트'],
          }),
      }),
    }));
  });

  it('upserts a preparation thumbnail for the candidate organization', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'candidate-1',
          name: '상품명',
          description: '설명',
          category: '완구',
          tags: [],
          rawData: {},
          promotedMasterId: null,
        }),
      },
      productPreparation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'prep-1' }),
      },
    };
    const service = new ProductPreparationSelectionService(prisma as never);

    await service.selectThumbnail('org-1', 'candidate-1', {
      selectedThumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      selectedThumbnailGenerationCandidateId: null,
    });

    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'candidate-1', organizationId: 'org-1', isDeleted: false },
    }));
    expect(prisma.productPreparation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'org-1',
        sourceCandidateId: 'candidate-1',
        selectedThumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      }),
    }));
  });

  it('updates an existing preparation with a selected detail page generation', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'candidate-1',
          name: '상품명',
          description: '설명',
          category: '완구',
          tags: [],
          rawData: {},
          promotedMasterId: null,
        }),
      },
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'detail-generation-1',
          contentWorkspaceId: 'workspace-1',
          detailPageArtifactId: 'artifact-1',
          detailPageArtifact: { currentRevisionId: 'revision-1' },
        }),
      },
      productPreparation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'prep-1' }),
        update: vi.fn().mockResolvedValue({ id: 'prep-1' }),
      },
    };
    const service = new ProductPreparationSelectionService(prisma as never);

    await service.selectDetailPage('org-1', 'candidate-1', {
      selectedDetailPageGenerationId: 'detail-generation-1',
    });

    expect(prisma.productPreparation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'prep-1' },
      data: expect.objectContaining({
        selectedDetailPageGenerationId: 'detail-generation-1',
        selectedDetailPageArtifactId: 'artifact-1',
        selectedDetailPageRevisionId: 'revision-1',
      }),
    }));
  });
});
