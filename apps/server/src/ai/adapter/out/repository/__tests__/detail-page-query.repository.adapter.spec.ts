import { describe, expect, it, vi } from 'vitest';
import { DetailPageQueryRepositoryAdapter } from '../detail-page-query.repository.adapter';

const ORG = '11111111-1111-4111-8111-111111111111';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '44444444-4444-4444-8444-444444444444';
const ARTIFACT_ID = '55555555-5555-4555-8555-555555555555';
const REVISION_ID = '66666666-6666-4666-8666-666666666666';
const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';

describe('DetailPageQueryRepositoryAdapter', () => {
  it('lists detail pages by content workspace scope', async () => {
    const prisma = {
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new DetailPageQueryRepositoryAdapter(prisma as never, {} as never);

    await repository.list({
      organizationId: ORG,
      contentWorkspaceId: WORKSPACE_ID,
      sourceCandidateId: CANDIDATE_ID,
    });

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          contentWorkspaceId: WORKSPACE_ID,
          contentType: 'detail_page',
          isDeleted: false,
        }),
      }),
    );
  });

  it('saves edited HTML as an artifact revision and syncs image usage in one write scope', async () => {
    const savedAt = new Date('2026-05-13T10:00:00.000Z');
    const prisma = {
      $transaction: vi.fn((callback) => callback(prisma)),
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: GENERATION_ID,
          generationGroupId: 'group-1',
          contentWorkspaceId: WORKSPACE_ID,
          detailPageArtifactId: null,
          generatedTitle: '소싱 상세페이지',
          sourceCandidateId: CANDIDATE_ID,
          triggeredByUserId: 'user-1',
          generationGroup: { targetMasterId: null },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      detailPageArtifact: {
        create: vi.fn().mockResolvedValue({ id: ARTIFACT_ID }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      detailPageRevision: {
        create: vi.fn().mockResolvedValue({
          id: REVISION_ID,
          html: '<section><img src="https://cdn.example.com/a.jpg" /></section>',
          createdAt: savedAt,
        }),
      },
      contentWorkspace: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const contentAssets = {
      syncGenerationImageUsagesInScope: vi.fn().mockResolvedValue([]),
    };
    const repository = new DetailPageQueryRepositoryAdapter(prisma as never, contentAssets as never);

    await expect(repository.saveEditedHtmlRevision({
      organizationId: ORG,
      contentGenerationId: GENERATION_ID,
      html: '<section><img src="https://cdn.example.com/a.jpg" /></section>',
      assetUrlMap: {},
      imageUrls: ['https://cdn.example.com/a.jpg'],
      savedAt,
    })).resolves.toEqual({
      html: '<section><img src="https://cdn.example.com/a.jpg" /></section>',
      createdAt: savedAt,
    });

    expect(prisma.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: GENERATION_ID, organizationId: ORG, isDeleted: false },
      select: expect.any(Object),
    });
    expect(contentAssets.syncGenerationImageUsagesInScope).toHaveBeenCalledWith(prisma, {
      organizationId: ORG,
      generationGroupId: 'group-1',
      contentGenerationId: GENERATION_ID,
      createdByUserId: 'user-1',
      imageUrls: ['https://cdn.example.com/a.jpg'],
    });
    expect(prisma.detailPageArtifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG,
        contentWorkspaceId: WORKSPACE_ID,
        sourceContentGenerationId: GENERATION_ID,
        title: '소싱 상세페이지',
      }),
      select: { id: true },
    });
    expect(prisma.detailPageRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORG,
        artifactId: ARTIFACT_ID,
        contentGenerationId: GENERATION_ID,
        revisionType: 'manual_edit',
        imageUrls: ['https://cdn.example.com/a.jpg'],
      }),
      select: {
        id: true,
        html: true,
        createdAt: true,
      },
    });
  });

  it('prefers the current artifact revision before the newest artifact fallback', async () => {
    const selectedCreatedAt = new Date('2026-07-19T01:00:00.000Z');
    const fallbackCreatedAt = new Date('2026-07-19T02:00:00.000Z');
    const prisma = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          currentDetailPageRevision: null,
          currentDetailPageArtifact: {
            currentRevision: {
              id: 'revision-selected',
              artifactId: 'artifact-selected',
              html: '<section>selected</section>',
              createdAt: selectedCreatedAt,
            },
          },
          detailPageArtifacts: [{
            currentRevision: {
              id: 'revision-newest',
              artifactId: 'artifact-newest',
              html: '<section>newest</section>',
              createdAt: fallbackCreatedAt,
            },
          }],
        }),
      },
    };
    const repository = new DetailPageQueryRepositoryAdapter(prisma as never, {} as never);

    await expect(repository.findCandidateCurrentDetailPageHtml({
      sourceCandidateId: CANDIDATE_ID,
      organizationId: ORG,
    })).resolves.toEqual({
      revisionId: 'revision-selected',
      artifactId: 'artifact-selected',
      html: '<section>selected</section>',
      createdAt: selectedCreatedAt,
    });

    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          currentDetailPageRevision: expect.any(Object),
          currentDetailPageArtifact: expect.any(Object),
          detailPageArtifacts: expect.any(Object),
        }),
      }),
    );
  });
});
