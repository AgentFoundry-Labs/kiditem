import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { ProductPreparationSelectionService } from '../product-preparation-selection.service';

const candidate = {
  id: 'candidate-1',
  name: '기존 상품명',
  description: '기존 설명',
  category: '완구',
  tags: ['기존'],
  rawData: { target: '아이' },
  promotedMasterId: null,
};

const TX = { opaque: true } as never;

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    runInTransaction: vi.fn(async (operation: (tx: typeof TX) => Promise<unknown>) => operation(TX)),
    lockCandidate: vi.fn().mockResolvedValue(undefined),
    findCandidateForPreparation: vi.fn().mockResolvedValue(candidate),
    findActivePreparation: vi.fn().mockResolvedValue(null),
    findPreparationThumbnailCandidate: vi.fn(),
    findPreparationDetailPageGeneration: vi.fn(),
    findPreparationDetailPageRevision: vi.fn(),
    upsertPreparation: vi.fn().mockResolvedValue({ id: 'prep-1' }),
    ...overrides,
  };
}

describe('ProductPreparationSelectionService', () => {
  it.each([
    ['basic information', (service: ProductPreparationSelectionService) =>
      service.updateBasics('org-1', 'candidate-1', { name: '새 상품명' })],
    ['thumbnail selection', (service: ProductPreparationSelectionService) =>
      service.selectThumbnail('org-1', 'candidate-1', {
        selectedThumbnailUrl: 'https://cdn.example.com/source.jpg',
        selectedThumbnailGenerationCandidateId: null,
      })],
    ['detail-page selection', (service: ProductPreparationSelectionService) =>
      service.selectDetailPage('org-1', 'candidate-1', {
        selectedDetailPageGenerationId: 'detail-generation-1',
      })],
  ])('serializes legacy %s behind the sourced candidate lock', async (_label, mutate) => {
    const repo = makeRepo({
      findPreparationDetailPageGeneration: vi.fn().mockResolvedValue({
        id: 'detail-generation-1',
        contentWorkspaceId: 'workspace-1',
        artifactId: 'artifact-1',
        revisionId: 'revision-1',
      }),
    });
    const service = new ProductPreparationSelectionService(repo as never);

    await mutate(service);

    expect(repo.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repo.lockCandidate).toHaveBeenCalledWith(TX, {
      id: 'candidate-1',
      organizationId: 'org-1',
    });
    expect(repo.findCandidateForPreparation).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      candidateId: 'candidate-1',
    });
    expect(repo.lockCandidate.mock.invocationCallOrder[0])
      .toBeLessThan(repo.upsertPreparation.mock.invocationCallOrder[0]);
  });

  it('persists basic product information into preparation registration input', async () => {
    const repo = makeRepo({
      findActivePreparation: vi.fn().mockResolvedValue({
        id: 'prep-1',
        registrationInput: { name: '이전 상품명', description: '이전 설명' },
      }),
    });
    const service = new ProductPreparationSelectionService(repo as never);

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
      thumbnailUrls: [
        'https://cdn.example.com/thumb-1.jpg',
        'https://cdn.example.com/thumb-2.jpg',
      ],
    });

    expect(repo.upsertPreparation).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      candidate,
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
          thumbnailUrls: [
            'https://cdn.example.com/thumb-1.jpg',
            'https://cdn.example.com/thumb-2.jpg',
          ],
        }),
      }),
    });
  });

  it('rejects stale basic product saves from another open tab', async () => {
    const repo = makeRepo({
      findActivePreparation: vi.fn().mockResolvedValue({
        id: 'prep-1',
        registrationInput: { name: 'A탭 저장 상품명' },
        updatedAt: new Date('2026-05-20T01:02:03.000Z'),
      }),
    });
    const service = new ProductPreparationSelectionService(repo as never);

    await expect(service.updateBasics('org-1', 'candidate-1', {
      name: 'B탭 오래된 상품명',
      basePreparationUpdatedAt: '2026-05-20T01:00:00.000Z',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(repo.upsertPreparation).not.toHaveBeenCalled();
  });

  it('upserts a preparation thumbnail for the candidate organization', async () => {
    const repo = makeRepo();
    const service = new ProductPreparationSelectionService(repo as never);

    await service.selectThumbnail('org-1', 'candidate-1', {
      selectedThumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      selectedThumbnailGenerationCandidateId: null,
    });

    expect(repo.findCandidateForPreparation).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      candidateId: 'candidate-1',
    });
    expect(repo.upsertPreparation).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      candidate,
      data: expect.objectContaining({
        selectedThumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      }),
    });
  });

  it('updates an existing preparation with a selected detail page generation', async () => {
    const repo = makeRepo({
      findPreparationDetailPageGeneration: vi.fn().mockResolvedValue({
        id: 'detail-generation-1',
        contentWorkspaceId: 'workspace-1',
        artifactId: 'artifact-1',
        revisionId: 'revision-1',
      }),
    });
    const service = new ProductPreparationSelectionService(repo as never);

    await service.selectDetailPage('org-1', 'candidate-1', {
      selectedDetailPageGenerationId: 'detail-generation-1',
    });

    expect(repo.upsertPreparation).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      candidate,
      data: expect.objectContaining({
        selectedDetailPageGenerationId: 'detail-generation-1',
        selectedDetailPageArtifactId: 'artifact-1',
        selectedDetailPageRevisionId: 'revision-1',
      }),
    });
  });

  it('rejects caller-provided detail artifacts when the generation has no artifact yet', async () => {
    const repo = makeRepo({
      findPreparationDetailPageGeneration: vi.fn().mockResolvedValue({
        id: 'detail-generation-1',
        contentWorkspaceId: 'workspace-1',
        artifactId: null,
        revisionId: null,
      }),
    });
    const service = new ProductPreparationSelectionService(repo as never);

    await expect(service.selectDetailPage('org-1', 'candidate-1', {
      selectedDetailPageGenerationId: 'detail-generation-1',
      selectedDetailPageArtifactId: 'artifact-from-another-generation',
    })).rejects.toThrow('선택한 상세페이지 아티팩트가 아직 준비되지 않았습니다.');
    expect(repo.upsertPreparation).not.toHaveBeenCalled();
  });

  it('rejects detail revisions that do not belong to the selected artifact', async () => {
    const repo = makeRepo({
      findPreparationDetailPageGeneration: vi.fn().mockResolvedValue({
        id: 'detail-generation-1',
        contentWorkspaceId: 'workspace-1',
        artifactId: 'artifact-1',
        revisionId: 'revision-1',
      }),
      findPreparationDetailPageRevision: vi.fn().mockResolvedValue(null),
    });
    const service = new ProductPreparationSelectionService(repo as never);

    await expect(service.selectDetailPage('org-1', 'candidate-1', {
      selectedDetailPageGenerationId: 'detail-generation-1',
      selectedDetailPageRevisionId: 'foreign-revision',
    })).rejects.toThrow('선택한 상세페이지 버전이 이 상품에 속하지 않습니다.');
    expect(repo.findPreparationDetailPageRevision).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      artifactId: 'artifact-1',
      revisionId: 'foreign-revision',
    });
    expect(repo.upsertPreparation).not.toHaveBeenCalled();
  });
});
