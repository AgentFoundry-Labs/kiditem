import { describe, expect, it, vi } from 'vitest';
import type { ContentWorkspaceLifecycleRepositoryPort } from '../../port/out/repository/content-workspace-lifecycle.repository.port';
import { ContentWorkspaceService } from '../content-workspace.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const REVISION_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_ID = '44444444-4444-4444-8444-444444444444';
const GENERATION_ID = '55555555-5555-4555-8555-555555555555';

function repository(
  overrides: Partial<ContentWorkspaceLifecycleRepositoryPort> = {},
): ContentWorkspaceLifecycleRepositoryPort {
  return {
    ensureActiveWorkspace: vi.fn(),
    findDuplicateByNormalizedTitle: vi.fn(),
    getById: vi.fn(),
    listActive: vi.fn(),
    archive: vi.fn(),
    findSelectableDetailPageGeneration: vi.fn(),
    selectCurrentDetailPage: vi.fn(),
    ...overrides,
  } as ContentWorkspaceLifecycleRepositoryPort;
}

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKSPACE_ID,
    organizationId: ORG,
    ownerType: 'direct_detail_page',
    sourceCandidateId: null,
    targetMasterId: null,
    channelListingId: null,
    originWorkspaceId: null,
    displayName: '키즈 텀블러',
    normalizedTitle: '키즈텀블러',
    status: 'active',
    currentDetailPageArtifactId: ARTIFACT_ID,
    currentDetailPageRevisionId: REVISION_ID,
    currentThumbnailSelectionId: null,
    currentThumbnailSelection: null,
    createdByUserId: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-05-12T01:00:00.000Z'),
    updatedAt: new Date('2026-05-12T03:00:00.000Z'),
    currentDetailPageArtifact: {
      id: ARTIFACT_ID,
      currentRevisionId: REVISION_ID,
      title: '키즈 텀블러 상세',
      sourceContentGenerationId: GENERATION_ID,
    },
    currentDetailPageRevision: {
      id: REVISION_ID,
      revisionType: 'generated',
      createdAt: new Date('2026-05-12T02:00:00.000Z'),
    },
    _count: { contentGenerations: 2 },
    contentGenerations: [
      generation({ id: 'generation-new', updatedAt: new Date('2026-05-12T04:00:00.000Z') }),
      generation({ id: 'generation-old', updatedAt: new Date('2026-05-12T02:00:00.000Z') }),
    ],
    ...overrides,
  };
}

function generation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'generation-1',
    contentType: 'detail_page',
    status: 'READY',
    generatedTitle: '키즈 텀블러 상세',
    templateId: 'kids-playful',
    generationInput: {
      rawTitle: '키즈 텀블러',
      imageUrls: ['https://example.com/input.jpg'],
    },
    generationResult: {
      templateId: 'bold-vertical',
      result: { hook: { text: '키즈 텀블러' } },
      imageUrls: ['https://example.com/input.jpg'],
      processedImages: { __heroBanner: 'https://example.com/hero.jpg' },
    },
    detailPageArtifactId: ARTIFACT_ID,
    createdAt: new Date('2026-05-12T01:30:00.000Z'),
    updatedAt: new Date('2026-05-12T02:00:00.000Z'),
    ...overrides,
  };
}

describe('ContentWorkspaceService', () => {
  it('creates a channel-listing workspace owner and projects its branch provenance', async () => {
    const repo = repository({
      ensureActiveWorkspace: vi.fn().mockResolvedValue({
        id: WORKSPACE_ID,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kidsrainboots',
      }),
      getById: vi.fn().mockResolvedValue(workspace({
        ownerType: 'channel_listing',
        channelListingId: 'listing-1',
        originWorkspaceId: 'source-workspace-1',
        currentThumbnailSelectionId: 'selection-1',
        currentThumbnailSelection: {
          id: 'selection-1',
          contentAsset: { id: 'asset-1', url: 'https://cdn.example.com/thumb.png' },
        },
      })),
    });
    const service = new ContentWorkspaceService(repo);

    await service.createWorkspace({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: 'Kids rain boots',
      sourceCandidateId: null,
      channelListingId: 'listing-1',
      originWorkspaceId: 'source-workspace-1',
    });

    expect(repo.ensureActiveWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      ownerType: 'channel_listing',
      sourceCandidateId: null,
      channelListingId: 'listing-1',
      originWorkspaceId: 'source-workspace-1',
    }));
    await expect(service.get(ORG, WORKSPACE_ID)).resolves.toMatchObject({
      channelListingId: 'listing-1',
      originWorkspaceId: 'source-workspace-1',
      currentThumbnailSelection: {
        id: 'selection-1',
        contentAssetId: 'asset-1',
        url: 'https://cdn.example.com/thumb.png',
      },
    });
  });

  it('normalizes a direct detail-page workspace before delegating creation to the lifecycle repository', async () => {
    const repo = repository({
      ensureActiveWorkspace: vi.fn().mockResolvedValue({
        id: WORKSPACE_ID,
        displayName: '키즈 터치등',
        normalizedTitle: '키즈터치등',
      }),
    });
    const service = new ContentWorkspaceService(repo);

    await expect(service.ensureForGeneration({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: ' 키즈   터치등 ',
      sourceCandidateId: null,
    })).resolves.toEqual({
      id: WORKSPACE_ID,
      displayName: '키즈 터치등',
      normalizedTitle: '키즈터치등',
    });

    expect(repo.ensureActiveWorkspace).toHaveBeenCalledWith({
      organizationId: ORG,
      ownerType: 'direct_detail_page',
      sourceCandidateId: null,
      channelListingId: null,
      originWorkspaceId: null,
      displayName: '키즈 터치등',
      normalizedTitle: '키즈터치등',
      createdByUserId: 'user-1',
    });
  });

  it('creates a content workspace without a detail-page generation history', async () => {
    const emptyWorkspace = workspace({
      displayName: '키즈 컵',
      normalizedTitle: '키즈컵',
      currentDetailPageArtifactId: null,
      currentDetailPageRevisionId: null,
      currentDetailPageArtifact: null,
      currentDetailPageRevision: null,
      contentGenerations: [],
      _count: { contentGenerations: 0 },
    });
    const repo = repository({
      ensureActiveWorkspace: vi.fn().mockResolvedValue({
        id: WORKSPACE_ID,
        displayName: '키즈 컵',
        normalizedTitle: '키즈컵',
      }),
      getById: vi.fn().mockResolvedValue(emptyWorkspace),
    });
    const service = new ContentWorkspaceService(repo);

    await expect(service.createWorkspace({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: '키즈 컵',
      sourceCandidateId: null,
    })).resolves.toMatchObject({
      id: WORKSPACE_ID,
      displayName: '키즈 컵',
      normalizedTitle: '키즈컵',
      generationCount: 0,
      latestGenerationId: null,
      latestStatus: null,
      currentDetailPageArtifactId: null,
      currentDetailPageRevisionId: null,
      history: [],
    });

    expect(repo.getById).toHaveBeenCalledWith({
      organizationId: ORG,
      workspaceId: WORKSPACE_ID,
    });
  });

  it('finds duplicate normalized titles without expanding generation history', async () => {
    const repo = repository({
      findDuplicateByNormalizedTitle: vi.fn().mockResolvedValue(workspace()),
    });
    const service = new ContentWorkspaceService(repo);

    await expect(service.checkDuplicate(ORG, '  키즈   텀블러  ')).resolves.toMatchObject({
      exists: true,
      workspace: {
        id: WORKSPACE_ID,
        displayName: '키즈 텀블러',
        normalizedTitle: '키즈텀블러',
        generationCount: 2,
        latestGenerationId: null,
        history: [],
        currentDetailPageArtifactId: ARTIFACT_ID,
        currentDetailPageRevisionId: REVISION_ID,
      },
    });

    expect(repo.findDuplicateByNormalizedTitle).toHaveBeenCalledWith({
      organizationId: ORG,
      normalizedTitle: '키즈텀블러',
    });
  });

  it('lists registered workspaces as one card with multiple ContentGeneration history rows', async () => {
    const repo = repository({
      listActive: vi.fn().mockResolvedValue({
        total: 1,
        rows: [
          workspace({
            contentGenerations: [
              generation({ id: 'generation-new', status: 'READY', updatedAt: new Date('2026-05-12T04:00:00.000Z') }),
              generation({ id: 'generation-old', status: 'FAILED', updatedAt: new Date('2026-05-12T02:00:00.000Z') }),
            ],
            _count: { contentGenerations: 2 },
          }),
        ],
      }),
    });
    const service = new ContentWorkspaceService(repo);

    await expect(service.list(ORG)).resolves.toMatchObject({
      total: 1,
      items: [
        {
          id: WORKSPACE_ID,
          href: `/product-pipeline/registered-products/${WORKSPACE_ID}`,
          generationCount: 2,
          latestGenerationId: 'generation-new',
          latestStatus: 'READY',
          history: [
            {
              id: 'generation-new',
              status: 'READY',
              detailPageData: { hook: { text: '키즈 텀블러' } },
              imageUrls: ['https://example.com/input.jpg'],
              processedImages: { __heroBanner: 'https://example.com/hero.jpg' },
              href: `/product-pipeline/detail-pages/generation-new/editor?returnTo=%2Fproduct-pipeline%2Fregistered-products%2F${WORKSPACE_ID}`,
            },
            { id: 'generation-old', status: 'FAILED' },
          ],
        },
      ],
    });

    expect(repo.listActive).toHaveBeenCalledWith({
      organizationId: ORG,
      status: 'active',
      normalizedTitle: null,
      page: 1,
      limit: 24,
    });
  });

  it('does not infer a current detail page from generation history when the workspace has no saved artifact', async () => {
    const repo = repository({
      listActive: vi.fn().mockResolvedValue({
        total: 1,
        rows: [
          workspace({
            currentDetailPageArtifactId: null,
            currentDetailPageRevisionId: null,
            currentDetailPageArtifact: null,
            currentDetailPageRevision: null,
            contentGenerations: [
              generation({
                id: 'history-only-generation',
                detailPageArtifactId: null,
                updatedAt: new Date('2026-05-12T04:00:00.000Z'),
              }),
            ],
            _count: { contentGenerations: 1 },
          }),
        ],
      }),
    });
    const service = new ContentWorkspaceService(repo);

    await expect(service.list(ORG)).resolves.toMatchObject({
      items: [
        {
          latestGenerationId: 'history-only-generation',
          currentDetailPageArtifactId: null,
          currentDetailPageRevisionId: null,
          currentDetailPageGenerationId: null,
        },
      ],
    });
  });

  it('selects a saved detail-page generation as the current registration detail page', async () => {
    const selectedArtifactId = '66666666-6666-4666-8666-666666666666';
    const selectedRevisionId = '77777777-7777-4777-8777-777777777777';
    const updatedWorkspace = workspace({
      currentDetailPageArtifactId: selectedArtifactId,
      currentDetailPageRevisionId: selectedRevisionId,
      currentDetailPageArtifact: {
        id: selectedArtifactId,
        currentRevisionId: selectedRevisionId,
        title: '선택한 상세페이지',
        sourceContentGenerationId: GENERATION_ID,
      },
    });
    const repo = repository({
      findSelectableDetailPageGeneration: vi.fn().mockResolvedValue({
        id: GENERATION_ID,
        detailPageArtifactId: selectedArtifactId,
        detailPageArtifact: {
          currentRevisionId: selectedRevisionId,
        },
      }),
      selectCurrentDetailPage: vi.fn().mockResolvedValue(1),
      getById: vi.fn().mockResolvedValue(updatedWorkspace),
    });
    const service = new ContentWorkspaceService(repo);

    await expect(service.selectCurrentDetailPage({
      organizationId: ORG,
      workspaceId: WORKSPACE_ID,
      contentGenerationId: GENERATION_ID,
    })).resolves.toMatchObject({
      id: WORKSPACE_ID,
      currentDetailPageArtifactId: selectedArtifactId,
      currentDetailPageRevisionId: selectedRevisionId,
      currentDetailPageGenerationId: GENERATION_ID,
    });

    expect(repo.findSelectableDetailPageGeneration).toHaveBeenCalledWith({
      organizationId: ORG,
      workspaceId: WORKSPACE_ID,
      contentGenerationId: GENERATION_ID,
    });
    expect(repo.selectCurrentDetailPage).toHaveBeenCalledWith({
      organizationId: ORG,
      workspaceId: WORKSPACE_ID,
      detailPageArtifactId: selectedArtifactId,
      detailPageRevisionId: selectedRevisionId,
    });
  });
});
