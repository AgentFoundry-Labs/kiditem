import { describe, expect, it, vi } from 'vitest';
import { SourcingCandidateRepositoryAdapter } from '../sourcing-candidate.repository.adapter';

describe('SourcingCandidateRepositoryAdapter', () => {
  it('lists only requested sourcing platforms when sourcePlatforms are provided', async () => {
    const prisma = {
      sourcingCandidate: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

    await repository.listSourced({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      sort: 'newest',
      sourcePlatforms: ['ALIBABA_1688', 'ALIBABA'],
    } as never);

    expect(prisma.sourcingCandidate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sourcePlatform: { in: ['ALIBABA_1688', 'ALIBABA'] },
      }),
    }));
  });

  it('keeps promoted-but-unlisted candidates in the collected product inbox', async () => {
    const prisma = {
      sourcingCandidate: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

    await repository.listSourced({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      sort: 'newest',
      sourcePlatforms: ['ALIBABA_1688'],
    } as never);

    expect(prisma.sourcingCandidate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['sourced', 'promoted'] },
        OR: [
          { promotedMasterId: null },
          {
            promotedMaster: {
              listings: {
                none: { organizationId: 'org-1', isDeleted: false },
              },
            },
          },
        ],
      }),
    }));
  });

  it('returns the current product preparation with selected registration assets on detail reads', async () => {
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'candidate-1',
          organizationId: 'org-1',
          sourceUrl: 'https://1688.com/item/1',
          sourcePlatform: 'ALIBABA_1688',
          rawData: {},
          name: 'Toy candidate',
          description: 'desc',
          category: '완구',
          tags: [],
          thumbnailUrl: 'https://cdn.example.com/source.jpg',
          imageUrl: 'https://cdn.example.com/source.jpg',
          costCny: null,
          status: 'promoted',
          promotedMasterId: 'master-1',
          rejectedReason: null,
          rejectedAt: null,
          rejectedByUserId: null,
          triggeredByUserId: null,
          isDeleted: false,
          deletedAt: null,
          createdAt: new Date('2026-05-17T00:00:00.000Z'),
          updatedAt: new Date('2026-05-17T00:00:00.000Z'),
          images: [],
          productPreparations: [{
            id: 'prep-1',
            sourceCandidateId: 'candidate-1',
            masterId: 'master-1',
            contentWorkspaceId: 'workspace-1',
            displayName: 'Toy candidate',
            status: 'product_registered',
            isCurrentForMaster: true,
            selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
            selectedThumbnailGenerationId: 'thumb-generation-1',
            selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
            selectedDetailPageArtifactId: 'artifact-1',
            selectedDetailPageRevisionId: 'revision-1',
            selectedDetailPageGenerationId: 'detail-generation-1',
            registrationInput: { category: '완구' },
            appliedToMasterAt: new Date('2026-05-17T01:00:00.000Z'),
            createdAt: new Date('2026-05-17T00:30:00.000Z'),
            updatedAt: new Date('2026-05-17T01:00:00.000Z'),
          }],
        }),
      },
    };
    const repository = new SourcingCandidateRepositoryAdapter(prisma as never);

    const row = await repository.findById('candidate-1', 'org-1');

    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'candidate-1', organizationId: 'org-1', isDeleted: false },
      include: expect.objectContaining({
        productPreparations: expect.objectContaining({
          where: {
            organizationId: 'org-1',
            isDeleted: false,
            OR: [
              { isCurrentForMaster: true },
              { masterId: null },
            ],
          },
          orderBy: [
            { isCurrentForMaster: 'desc' },
            { updatedAt: 'desc' },
            { createdAt: 'desc' },
          ],
          take: 1,
        }),
      }),
    }));
    expect(row?.productPreparation).toEqual({
      id: 'prep-1',
      sourceCandidateId: 'candidate-1',
      masterId: 'master-1',
      contentWorkspaceId: 'workspace-1',
      displayName: 'Toy candidate',
      status: 'product_registered',
      isCurrentForMaster: true,
      selectedThumbnailUrl: 'https://cdn.example.com/generated-thumb.png',
      selectedThumbnailGenerationId: 'thumb-generation-1',
      selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
      registrationInput: { category: '완구' },
      appliedToMasterAt: new Date('2026-05-17T01:00:00.000Z'),
      createdAt: new Date('2026-05-17T00:30:00.000Z'),
      updatedAt: new Date('2026-05-17T01:00:00.000Z'),
    });
  });

  it('requires active thumbnail generations for promotion selections', async () => {
    const tx = {
      thumbnailGenerationCandidate: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const repository = new SourcingCandidateRepositoryAdapter({} as never);

    await repository.findSelectedThumbnailGeneration(tx as never, {
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      generationCandidateId: 'thumbnail-candidate-1',
    });

    expect(tx.thumbnailGenerationCandidate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'thumbnail-candidate-1',
        organizationId: 'org-1',
        generation: expect.objectContaining({
          organizationId: 'org-1',
          sourceCandidateId: 'candidate-1',
          isDeleted: false,
        }),
      }),
    }));
  });

  it('requires active detail-page generations and artifacts for promotion selections', async () => {
    const tx = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      detailPageArtifact: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const repository = new SourcingCandidateRepositoryAdapter({} as never);

    await repository.findSelectedDetailPageGeneration(tx as never, {
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      contentGenerationId: 'detail-generation-1',
    });
    await repository.findSelectedDetailPageArtifact(tx as never, {
      organizationId: 'org-1',
      candidateId: 'candidate-1',
      artifactId: 'artifact-1',
    });
    await repository.attachSelectedDetailPageArtifact(tx as never, {
      organizationId: 'org-1',
      artifactId: 'artifact-1',
      targetMasterId: 'master-1',
      revisionId: null,
    });

    expect(tx.contentGeneration.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'detail-generation-1',
        organizationId: 'org-1',
        isDeleted: false,
        contentType: 'detail_page',
        detailPageArtifact: { is: { isDeleted: false } },
      }),
    }));
    expect(tx.detailPageArtifact.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'artifact-1',
        organizationId: 'org-1',
        isDeleted: false,
      }),
    }));
    expect(tx.detailPageArtifact.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'artifact-1',
        organizationId: 'org-1',
        isDeleted: false,
      },
    }));
  });
});
