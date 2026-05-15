import { describe, expect, it, vi } from 'vitest';
import { ContentArchiveService } from '../content-archive.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';

function row(overrides: Record<string, unknown>) {
  return {
    id: 'generation-1',
    organizationId: ORG,
    generationGroupId: GROUP_ID,
    contentType: 'detail_page',
    templateId: 'kids-playful',
    generationInput: {
      imageUrls: ['https://cdn.example.com/input.jpg'],
      rawTitle: '상세페이지',
    },
    generationResult: {
      templateId: 'kids-playful',
      result: {},
      imageUrls: ['https://cdn.example.com/input.jpg'],
      processedImages: {},
    },
    generatedTitle: '상세페이지',
    generatedDescription: null,
    generatedCopy: null,
    editedHtml: null,
    editedHtmlSavedAt: null,
    sourceCandidateId: null,
    detailPageArtifactId: null,
    status: 'READY',
    retryCount: 0,
    errorMessage: null,
    triggeredByUserId: null,
    createdAt: new Date('2026-05-13T08:00:00.000Z'),
    updatedAt: new Date('2026-05-13T09:00:00.000Z'),
    generationGroup: {
      id: GROUP_ID,
      title: '미연결 작업',
      groupType: 'input_variation',
      targetMasterId: null,
      targetMaster: null,
    },
    assetUsages: [],
    sources: [],
    detailPageArtifact: null,
    ...overrides,
  };
}

describe('ContentArchiveService', () => {
  it('lists product workspaces and unlinked group workspaces from ContentGeneration rows', async () => {
    const productRow = row({
      id: 'generation-product',
      contentType: 'detail_page',
      generatedTitle: '완성 상세페이지',
      generationResult: {
        templateId: 'kids-playful',
        result: {},
        imageUrls: ['https://cdn.example.com/input.jpg'],
        processedImages: { __heroBanner: 'https://cdn.example.com/hero.jpg' },
      },
      generationGroup: {
        id: GROUP_ID,
        title: '키즈 퍼즐',
        groupType: 'product_workspace',
        targetMasterId: PRODUCT_ID,
        targetMaster: {
          id: PRODUCT_ID,
          code: 'M-00000001',
          name: '키즈 퍼즐',
          thumbnailUrl: null,
          imageUrl: 'https://cdn.example.com/product.jpg',
        },
      },
      assetUsages: [
        {
          contentAsset: {
            id: 'asset-output',
            url: 'https://cdn.example.com/output.jpg',
            role: 'hero',
            label: null,
            sortOrder: 0,
            createdAt: new Date('2026-05-13T08:10:00.000Z'),
          },
        },
      ],
    });
    const groupRow = row({
      id: 'generation-group',
      generationGroupId: GROUP_ID,
      contentType: 'image',
      generatedTitle: '미연결 썸네일',
      generationGroup: {
        id: GROUP_ID,
        title: '미연결 작업',
        groupType: 'input_variation',
        targetMasterId: null,
        targetMaster: null,
      },
      updatedAt: new Date('2026-05-13T08:30:00.000Z'),
    });
    const prisma = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([productRow, groupRow]),
      },
    };
    const service = new ContentArchiveService(prisma as never);

    await expect(service.listWorkspaces(ORG)).resolves.toMatchObject({
      total: 2,
      items: [
        {
          workspaceType: 'product',
          productId: PRODUCT_ID,
          title: '키즈 퍼즐',
          detailPageCount: 1,
          imageCount: 0,
          href: `/product-pipeline/registered-products?masterId=${PRODUCT_ID}`,
        },
        {
          workspaceType: 'unlinked_group',
          generationGroupId: GROUP_ID,
          title: '미연결 작업',
          detailPageCount: 0,
          imageCount: 1,
          href: `/product-pipeline/registered-products?generationGroupId=${GROUP_ID}`,
        },
      ],
    });

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, isDeleted: false },
        include: expect.objectContaining({
          assetUsages: expect.any(Object),
        }),
      }),
    );
  });

  it('keeps product workspace queries scoped to the requested product id', async () => {
    const product = {
      id: PRODUCT_ID,
      code: 'M-00000001',
      name: '키즈 퍼즐',
      thumbnailUrl: null,
      imageUrl: null,
    };
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue(product),
      },
      contentGeneration: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ContentArchiveService(prisma as never);

    await service.listProductWorkspace(ORG, PRODUCT_ID);

    expect(prisma.contentGeneration.count).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        generationGroup: { targetMasterId: PRODUCT_ID },
      },
    });
    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          isDeleted: false,
          generationGroup: { targetMasterId: PRODUCT_ID },
        },
      }),
    );
  });

  it('links sourcing candidate generations to the candidate-scoped editor route', async () => {
    const candidateRow = row({
      id: '55555555-5555-4555-8555-555555555555',
      sourceCandidateId: CANDIDATE_ID,
      sources: [
        {
          id: 'source-1',
          sourceType: 'sourcing_candidate',
          sourceCandidateId: CANDIDATE_ID,
          sourceContentGenerationId: null,
          contentAssetId: null,
          label: null,
        },
      ],
    });
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: CANDIDATE_ID, promotedMasterId: null }),
      },
      contentGeneration: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([candidateRow]),
      },
    };
    const service = new ContentArchiveService(prisma as never);

    await expect(service.listForSourcingCandidate(ORG, CANDIDATE_ID)).resolves.toMatchObject({
      items: [
        {
          id: candidateRow.id,
          href: `/product-pipeline/detail-pages/${candidateRow.id}/editor?sourceCandidateId=${CANDIDATE_ID}&returnTo=%2Fproduct-pipeline%2Fcollected-products%2F${CANDIDATE_ID}`,
          detailPageData: {},
        },
      ],
      total: 1,
    });

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          OR: [
            { sourceCandidateId: CANDIDATE_ID },
            { sources: { some: { sourceCandidateId: CANDIDATE_ID } } },
            { detailPageArtifact: { is: { sourceCandidateId: CANDIDATE_ID, isDeleted: false } } },
          ],
          isDeleted: false,
        },
      }),
    );
  });

  it('links artifact-only sourcing candidate generations through detailPageArtifact', async () => {
    const candidateRow = row({
      id: '66666666-6666-4666-8666-666666666666',
      detailPageArtifactId: 'artifact-1',
      detailPageArtifact: {
        id: 'artifact-1',
        sourceCandidateId: CANDIDATE_ID,
        isDeleted: false,
        currentRevisionId: 'revision-1',
        currentRevision: {
          id: 'revision-1',
          revisionType: 'manual_edit',
          createdAt: new Date('2026-05-13T10:00:00.000Z'),
        },
        revisions: [
          {
            id: 'revision-1',
            revisionType: 'manual_edit',
            createdAt: new Date('2026-05-13T10:00:00.000Z'),
          },
        ],
      },
    });
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: CANDIDATE_ID, promotedMasterId: null }),
      },
      contentGeneration: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([candidateRow]),
      },
    };
    const service = new ContentArchiveService(prisma as never);

    await expect(service.listForSourcingCandidate(ORG, CANDIDATE_ID)).resolves.toMatchObject({
      items: [
        {
          id: candidateRow.id,
          sourceCandidateId: CANDIDATE_ID,
          detailPageArtifactId: 'artifact-1',
          detailPageRevisionId: 'revision-1',
          detailPageRevisions: [
            {
              id: 'revision-1',
              revisionType: 'manual_edit',
              createdAt: '2026-05-13T10:00:00.000Z',
            },
          ],
          href: `/product-pipeline/detail-pages/${candidateRow.id}/editor?sourceCandidateId=${CANDIDATE_ID}&returnTo=%2Fproduct-pipeline%2Fcollected-products%2F${CANDIDATE_ID}`,
        },
      ],
      total: 1,
    });
  });

  it('deletes a product workspace without deleting the MasterProduct row', async () => {
    const tx = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'generation-product-1', generationGroupId: GROUP_ID },
          { id: 'generation-product-2', generationGroupId: GROUP_ID },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      contentAsset: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ContentArchiveService(prisma as never);

    await expect(service.deleteProductWorkspace(ORG, PRODUCT_ID)).resolves.toEqual({
      ok: true,
      deletedGenerations: 2,
      deletedAssets: 0,
    });

    expect(tx.contentGeneration.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, isDeleted: false, generationGroup: { targetMasterId: PRODUCT_ID } },
      select: { id: true, generationGroupId: true },
    });
    expect(tx.contentAsset.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        usages: {
          some: { contentGenerationId: { in: ['generation-product-1', 'generation-product-2'] } },
          none: {
            contentGeneration: {
              organizationId: ORG,
              isDeleted: false,
              id: { notIn: ['generation-product-1', 'generation-product-2'] },
            },
          },
        },
      },
      data: expect.objectContaining({ isDeleted: true }),
    });
    expect(tx.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        id: { in: ['generation-product-1', 'generation-product-2'] },
      },
      data: expect.objectContaining({ isDeleted: true }),
    });
  });

  it('deletes an unlinked group workspace and its group row', async () => {
    const tx = {
      contentGenerationGroup: {
        findFirst: vi.fn().mockResolvedValue({ id: GROUP_ID }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([{ id: 'generation-group-1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentAsset: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ContentArchiveService(prisma as never);

    await expect(service.deleteGroupWorkspace(ORG, GROUP_ID)).resolves.toEqual({
      ok: true,
      deletedGenerations: 1,
      deletedAssets: 0,
    });

    expect(tx.contentGenerationGroup.findFirst).toHaveBeenCalledWith({
      where: { id: GROUP_ID, organizationId: ORG },
      select: { id: true },
    });
    expect(tx.contentGeneration.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        isDeleted: false,
        generationGroupId: GROUP_ID,
        generationGroup: { targetMasterId: null },
      },
      select: { id: true },
    });
  });
});
