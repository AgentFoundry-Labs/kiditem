import { describe, expect, it, vi } from 'vitest';
import type { ContentArchiveRepositoryPort } from '../../port/out/content-archive.repository.port';
import { ContentArchiveService } from '../content-archive.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';

function repository(overrides: Partial<ContentArchiveRepositoryPort> = {}): ContentArchiveRepositoryPort {
  return {
    listWorkspaceGenerations: vi.fn(),
    findProduct: vi.fn(),
    listProductWorkspaceGenerations: vi.fn(),
    findGroup: vi.fn(),
    listGroupWorkspaceGenerations: vi.fn(),
    deleteProductWorkspace: vi.fn(),
    deleteGroupWorkspace: vi.fn(),
    findSourcingCandidate: vi.fn(),
    listSourcingCandidateGenerations: vi.fn(),
    listPromotedProductGenerations: vi.fn(),
    ...overrides,
  } as ContentArchiveRepositoryPort;
}

function row(overrides: Record<string, unknown>) {
  return {
    id: 'generation-1',
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
    sourceCandidateId: null,
    detailPageArtifactId: null,
    status: 'READY',
    errorMessage: null,
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
  it('lists product workspaces and unlinked group workspaces from generation rows', async () => {
    const productRow = row({
      id: 'generation-product',
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
      contentType: 'image',
      generatedTitle: '미연결 썸네일',
      updatedAt: new Date('2026-05-13T08:30:00.000Z'),
    });
    const repo = repository({
      listWorkspaceGenerations: vi.fn().mockResolvedValue([productRow, groupRow]),
    });
    const service = new ContentArchiveService(repo);

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

    expect(repo.listWorkspaceGenerations).toHaveBeenCalledWith({
      organizationId: ORG,
      query: {},
    });
  });

  it('keeps product workspace projection scoped to the requested product id', async () => {
    const product = {
      id: PRODUCT_ID,
      code: 'M-00000001',
      name: '키즈 퍼즐',
      thumbnailUrl: null,
      imageUrl: null,
    };
    const repo = repository({
      findProduct: vi.fn().mockResolvedValue(product),
      listProductWorkspaceGenerations: vi.fn().mockResolvedValue({ total: 0, rows: [] }),
    });
    const service = new ContentArchiveService(repo);

    await expect(service.listProductWorkspace(ORG, PRODUCT_ID)).resolves.toMatchObject({
      total: 0,
      workspace: {
        workspaceType: 'product',
        productId: PRODUCT_ID,
        title: '키즈 퍼즐',
      },
    });
    expect(repo.listProductWorkspaceGenerations).toHaveBeenCalledWith({
      organizationId: ORG,
      productId: PRODUCT_ID,
      query: {},
      page: 1,
      limit: 24,
    });
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
    const repo = repository({
      findSourcingCandidate: vi.fn().mockResolvedValue({ id: CANDIDATE_ID, promotedMasterId: null }),
      listSourcingCandidateGenerations: vi.fn().mockResolvedValue({ total: 1, rows: [candidateRow] }),
    });
    const service = new ContentArchiveService(repo);

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
    const repo = repository({
      findSourcingCandidate: vi.fn().mockResolvedValue({ id: CANDIDATE_ID, promotedMasterId: null }),
      listSourcingCandidateGenerations: vi.fn().mockResolvedValue({ total: 1, rows: [candidateRow] }),
    });
    const service = new ContentArchiveService(repo);

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

  it('maps product workspace delete results and not-found states', async () => {
    const repo = repository({
      deleteProductWorkspace: vi.fn().mockResolvedValue({
        status: 'deleted',
        deletedGenerations: 2,
        deletedAssets: 0,
      }),
    });
    const service = new ContentArchiveService(repo);

    await expect(service.deleteProductWorkspace(ORG, PRODUCT_ID)).resolves.toEqual({
      ok: true,
      deletedGenerations: 2,
      deletedAssets: 0,
    });

    const missingRepo = repository({
      deleteProductWorkspace: vi.fn().mockResolvedValue({ status: 'workspace_not_found' }),
    });
    await expect(
      new ContentArchiveService(missingRepo).deleteProductWorkspace(ORG, PRODUCT_ID),
    ).rejects.toThrow('Product content workspace not found');
  });
});
