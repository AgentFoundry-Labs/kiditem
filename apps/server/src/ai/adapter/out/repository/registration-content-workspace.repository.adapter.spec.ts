import { describe, expect, it, vi } from 'vitest';
import { RegistrationContentWorkspaceRepositoryAdapter } from './registration-content-workspace.repository.adapter';

describe('RegistrationContentWorkspaceRepositoryAdapter', () => {
  it('resolves generation-backed detail content to exact IDs before payload freeze', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          currentDetailPageArtifactId: 'artifact-unselected',
          currentDetailPageRevisionId: 'revision-unselected',
        }),
      },
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'detail-generation-1',
          detailPageArtifactId: 'artifact-1',
        }),
      },
      detailPageArtifact: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'artifact-1',
          currentRevisionId: 'revision-1',
        }),
      },
      detailPageRevision: {
        findFirst: vi.fn().mockResolvedValue({ id: 'revision-1' }),
      },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.resolveSourceSelections(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: 'detail-generation-1',
    })).resolves.toEqual({
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
    });
  });

  it('treats null frozen detail IDs as no selection even when the source current pointer changes', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }])
        .mockResolvedValueOnce([]),
      contentWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({
            id: 'source-workspace-1',
            sourceCandidateId: 'candidate-1',
            currentDetailPageArtifactId: 'artifact-current',
            currentDetailPageRevisionId: 'revision-current',
          })
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({ id: 'listing-workspace-1' }),
        updateMany: vi.fn(),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }),
      },
      detailPageArtifact: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      contentWorkspaceThumbnailSelection: { create: vi.fn() },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.branchToListing(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).resolves.toEqual({ workspaceId: 'listing-workspace-1' });

    expect(tx.detailPageArtifact.findFirst).not.toHaveBeenCalled();
    expect(tx.detailPageArtifact.create).not.toHaveBeenCalled();
    expect(tx.contentWorkspace.updateMany).not.toHaveBeenCalled();
  });

  it('populates an existing empty listing workspace tied to the same source', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }])
        .mockResolvedValueOnce([{
          id: 'listing-workspace-1',
          originWorkspaceId: 'source-workspace-1',
          currentDetailPageArtifactId: null,
          currentDetailPageRevisionId: null,
          currentThumbnailSelectionId: null,
        }]),
      contentWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({
            id: 'source-workspace-1',
            sourceCandidateId: 'candidate-1',
          })
          .mockResolvedValueOnce({
            id: 'listing-workspace-1',
            originWorkspaceId: 'source-workspace-1',
            currentDetailPageArtifactId: null,
            currentDetailPageRevisionId: null,
            currentThumbnailSelectionId: null,
          }),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }),
      },
      detailPageArtifact: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ id: 'artifact-1' })
          .mockResolvedValueOnce({
            id: 'artifact-1',
            title: 'Kids rain boots detail',
            status: 'draft',
            metadata: {},
          }),
        create: vi.fn().mockResolvedValue({ id: 'listing-artifact-1' }),
      },
      contentWorkspaceThumbnailSelection: { create: vi.fn() },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.branchToListing(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).resolves.toEqual({ workspaceId: 'listing-workspace-1' });

    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.detailPageArtifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentWorkspaceId: 'listing-workspace-1',
      }),
      select: { id: true },
    });
    expect(tx.contentWorkspace.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'listing-workspace-1',
        organizationId: 'org-1',
        isDeleted: false,
      },
      data: {
        currentDetailPageArtifactId: 'listing-artifact-1',
        currentDetailPageRevisionId: null,
      },
    });
  });

  it('rejects listing completion when the locked workspace pointer update is lost', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }])
        .mockResolvedValueOnce([{
          id: 'listing-workspace-1',
          originWorkspaceId: 'source-workspace-1',
          currentDetailPageArtifactId: null,
          currentDetailPageRevisionId: null,
          currentThumbnailSelectionId: null,
        }]),
      contentWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({
            id: 'source-workspace-1',
            sourceCandidateId: 'candidate-1',
          })
          .mockResolvedValueOnce({
            id: 'listing-workspace-1',
            originWorkspaceId: 'source-workspace-1',
            currentDetailPageArtifactId: null,
            currentDetailPageRevisionId: null,
            currentThumbnailSelectionId: null,
          }),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }),
      },
      detailPageArtifact: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ id: 'artifact-1' })
          .mockResolvedValueOnce({
            id: 'artifact-1',
            title: 'Kids rain boots detail',
            status: 'draft',
            metadata: {},
          }),
        create: vi.fn().mockResolvedValue({ id: 'listing-artifact-1' }),
      },
      contentWorkspaceThumbnailSelection: { create: vi.fn() },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.branchToListing(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).rejects.toThrow('Listing workspace changed before selected content was assigned.');
  });

  it('rejects an existing listing workspace tied to a different source', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }])
        .mockResolvedValueOnce([{
          id: 'listing-workspace-1',
          originWorkspaceId: 'source-workspace-other',
          currentDetailPageArtifactId: null,
          currentDetailPageRevisionId: null,
          currentThumbnailSelectionId: null,
        }]),
      contentWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({
            id: 'source-workspace-1',
            sourceCandidateId: 'candidate-1',
          })
          .mockResolvedValueOnce({
            id: 'listing-workspace-1',
            originWorkspaceId: 'source-workspace-other',
            currentDetailPageArtifactId: null,
            currentDetailPageRevisionId: null,
            currentThumbnailSelectionId: null,
          }),
        create: vi.fn(),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }),
      },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.branchToListing(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).rejects.toThrow('Listing workspace belongs to a different source workspace.');

    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
  });

  it('rejects a listing sourced from a different candidate', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{
        id: 'listing-1',
        sourceCandidateId: 'candidate-other',
      }]),
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          sourceCandidateId: 'candidate-1',
        }),
        create: vi.fn(),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          sourceCandidateId: 'candidate-other',
        }),
      },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.branchToListing(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).rejects.toThrow('Channel listing and source workspace have different candidates.');

    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
  });

  it('rejects an unmanaged raw thumbnail URL that is not selected by the source workspace', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({
            id: 'source-workspace-1',
            sourceCandidateId: 'candidate-1',
            currentDetailPageArtifactId: null,
            currentDetailPageRevisionId: null,
          })
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({ id: 'listing-workspace-1' }),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }),
      },
      contentAsset: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      contentGenerationGroup: {
        findFirst: vi.fn().mockResolvedValue({ id: 'group-1' }),
      },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.branchToListing(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: 'https://untrusted.example.com/thumb.png',
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).rejects.toThrow('Selected thumbnail URL is not source-owned managed content.');

    expect(tx.contentAsset.create).not.toHaveBeenCalled();
  });

  it('adopts an active candidate source thumbnail as source-owned managed content', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          sourceCandidateId: 'candidate-1',
          createdByUserId: 'user-1',
        }),
      },
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'candidate-1',
          images: [{
            storageKey: 'candidate/source.jpg',
            mimeType: 'image/jpeg',
            width: 1000,
            height: 1000,
            fileSize: 120000,
          }],
        }),
      },
      contentAsset: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({
          id: 'asset-1',
          url: 'https://cdn.example.com/source.jpg',
        }),
      },
      contentGenerationGroup: {
        findFirst: vi.fn().mockResolvedValue({ id: 'group-1' }),
      },
      contentWorkspaceThumbnailSelection: {
        create: vi.fn().mockResolvedValue({ id: 'selection-1' }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'asset-1' }]),
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.resolveSourceSelections(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: 'https://cdn.example.com/source.jpg',
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).resolves.toMatchObject({
      selectedThumbnailUrl: 'https://cdn.example.com/source.jpg',
    });

    expect(tx.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'candidate-1',
        organizationId: 'org-1',
        status: 'sourced',
        isDeleted: false,
        OR: [
          { thumbnailUrl: 'https://cdn.example.com/source.jpg' },
          { imageUrl: 'https://cdn.example.com/source.jpg' },
          {
            images: {
              some: {
                organizationId: 'org-1',
                url: 'https://cdn.example.com/source.jpg',
                isDeleted: false,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        images: {
          where: {
            organizationId: 'org-1',
            url: 'https://cdn.example.com/source.jpg',
            isDeleted: false,
          },
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: {
            storageKey: true,
            mimeType: true,
            width: true,
            height: true,
            fileSize: true,
          },
        },
      },
    });
    expect(tx.contentWorkspaceThumbnailSelection.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        contentWorkspaceId: 'source-workspace-1',
        contentAssetId: 'asset-1',
        sourceThumbnailGenerationId: null,
        sourceThumbnailCandidateId: null,
        createdByUserId: 'user-1',
      },
      select: { id: true },
    });
  });

  it('does not adopt an external URL that is absent from the active candidate source', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          sourceCandidateId: 'candidate-1',
          createdByUserId: 'user-1',
        }),
      },
      sourcingCandidate: { findFirst: vi.fn().mockResolvedValue(null) },
      contentAsset: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      contentWorkspaceThumbnailSelection: { create: vi.fn() },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.resolveSourceSelections(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: 'https://untrusted.example.com/thumb.png',
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).rejects.toThrow('Selected thumbnail URL is not source-owned managed content.');

    expect(tx.contentAsset.create).not.toHaveBeenCalled();
    expect(tx.contentWorkspaceThumbnailSelection.create).not.toHaveBeenCalled();
  });

  it('validates every selected reference against the organization and source workspace', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          currentDetailPageArtifactId: 'artifact-1',
          currentDetailPageRevisionId: 'revision-1',
        }),
      },
      detailPageArtifact: { findFirst: vi.fn().mockResolvedValue({ id: 'artifact-1' }) },
      detailPageRevision: { findFirst: vi.fn().mockResolvedValue({ id: 'revision-1' }) },
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({ id: 'detail-generation-1', detailPageArtifactId: 'artifact-1' }),
      },
      contentAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.validateSourceSelections(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: 'https://cdn.example.com/thumb.png',
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
    })).resolves.toBeUndefined();

    expect(tx.contentAsset.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        url: 'https://cdn.example.com/thumb.png',
        isDeleted: false,
        thumbnailSelections: {
          some: {
            organizationId: 'org-1',
            contentWorkspaceId: 'source-workspace-1',
          },
        },
      },
      select: { id: true },
    });
  });

  it('uses the injected Prisma client for pre-provider validation without a transaction', async () => {
    const prisma = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          currentDetailPageArtifactId: null,
          currentDetailPageRevisionId: null,
        }),
      },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter(prisma as never);

    await expect(repository.validateSourceSelections(null, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).resolves.toBeUndefined();
    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledOnce();
  });

  it('rejects a detail generation whose artifact differs from the effective source artifact', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          currentDetailPageArtifactId: 'artifact-current',
          currentDetailPageRevisionId: null,
        }),
      },
      detailPageArtifact: { findFirst: vi.fn().mockResolvedValue({ id: 'artifact-current' }) },
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'detail-generation-old',
          detailPageArtifactId: 'artifact-old',
        }),
      },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.validateSourceSelections(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: 'detail-generation-old',
    })).rejects.toThrow('Selected detail generation does not own the selected artifact.');
  });

  it('clones selected artifact/revision metadata and reuses the managed thumbnail asset', async () => {
    const tx = {
      sourcingCandidate: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1' }),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }),
      },
      contentWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({
            id: 'source-workspace-1',
            ownerType: 'sourcing_candidate',
            sourceCandidateId: 'candidate-1',
            currentDetailPageArtifactId: 'artifact-1',
            currentDetailPageRevisionId: 'revision-1',
          })
          .mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue({ id: 'listing-workspace-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'detail-generation-1',
          detailPageArtifactId: 'artifact-1',
        }),
      },
      detailPageArtifact: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'artifact-1',
          title: 'Kids rain boots detail',
          status: 'draft',
          metadata: { template: 'kids-playful' },
          currentRevisionId: 'revision-1',
        }),
        create: vi.fn().mockResolvedValue({ id: 'listing-artifact-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      detailPageRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'revision-1',
          revisionType: 'manual_edit',
          html: '<main><img src="https://cdn.example.com/detail.png"></main>',
          assetUrlMap: { source: 'https://cdn.example.com/detail.png' },
          imageUrls: ['https://cdn.example.com/detail.png'],
        }),
        create: vi.fn().mockResolvedValue({ id: 'listing-revision-1' }),
      },
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue({ id: 'thumb-generation-1' }),
      },
      thumbnailGenerationCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'thumb-candidate-1',
          url: 'https://cdn.example.com/thumb.png',
        }),
      },
      contentAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-1',
          url: 'https://cdn.example.com/thumb.png',
        }),
      },
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: 'listing-1',
          sourceCandidateId: 'candidate-1',
        }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'thumb-generation-1' }])
        .mockResolvedValueOnce([{ id: 'thumb-candidate-1' }])
        .mockResolvedValueOnce([{ id: 'asset-1' }]),
      contentWorkspaceThumbnailSelection: {
        create: vi.fn().mockResolvedValue({ id: 'listing-selection-1' }),
      },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.branchToListing(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: 'https://cdn.example.com/thumb.png',
      selectedThumbnailGenerationId: 'thumb-generation-1',
      selectedThumbnailGenerationCandidateId: 'thumb-candidate-1',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
    })).resolves.toEqual({ workspaceId: 'listing-workspace-1' });

    expect(tx.contentWorkspace.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        ownerType: 'channel_listing',
        sourceCandidateId: null,
        targetMasterId: null,
        channelListingId: 'listing-1',
        originWorkspaceId: 'source-workspace-1',
      }),
      select: { id: true },
    });
    expect(tx.detailPageArtifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        contentWorkspaceId: 'listing-workspace-1',
        sourceCandidateId: null,
        targetMasterId: null,
        sourceContentGenerationId: null,
        metadata: { template: 'kids-playful' },
      }),
      select: { id: true },
    });
    expect(tx.detailPageRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artifactId: 'listing-artifact-1',
        contentGenerationId: null,
        html: '<main><img src="https://cdn.example.com/detail.png"></main>',
        assetUrlMap: { source: 'https://cdn.example.com/detail.png' },
        imageUrls: ['https://cdn.example.com/detail.png'],
      }),
      select: { id: true },
    });
    expect(tx.contentWorkspaceThumbnailSelection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentWorkspaceId: 'listing-workspace-1',
        contentAssetId: 'asset-1',
        sourceThumbnailGenerationId: 'thumb-generation-1',
        sourceThumbnailCandidateId: 'thumb-candidate-1',
      }),
      select: { id: true },
    });
    expect(tx.contentWorkspace.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'listing-workspace-1',
        organizationId: 'org-1',
        isDeleted: false,
      },
      data: {
        currentDetailPageArtifactId: 'listing-artifact-1',
        currentDetailPageRevisionId: 'listing-revision-1',
        currentThumbnailSelectionId: 'listing-selection-1',
      },
    });
    expect(tx.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'detail-generation-1',
        organizationId: 'org-1',
        contentWorkspaceId: 'source-workspace-1',
        status: { in: ['READY', 'completed'] },
        isDeleted: false,
      },
      select: { id: true, detailPageArtifactId: true },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    const lockSql = tx.$queryRaw.mock.calls.map(([query]) =>
      (query as { strings?: string[] }).strings?.join(' ') ?? '',
    );
    expect(lockSql[2]).toContain('thumbnail_generations');
    expect(lockSql[3]).toContain('thumbnail_generation_candidates');
    expect(tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[3],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[3]).toBeLessThan(
      tx.contentWorkspaceThumbnailSelection.create.mock.invocationCallOrder[0],
    );
    expect(tx.thumbnailGenerationCandidate).not.toHaveProperty('create');
  });

  it('creates or reuses the candidate-owned workspace in the supplied transaction', async () => {
    const tx = {
      sourcingCandidate: { findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1' }) },
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'source-workspace-1' }),
      },
    };
    const repository = new RegistrationContentWorkspaceRepositoryAdapter({} as never);

    await expect(repository.ensureCandidateWorkspace(tx, {
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    })).resolves.toEqual({ workspaceId: 'source-workspace-1' });
    expect(tx.contentWorkspace.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        ownerType: 'sourcing_candidate',
        sourceCandidateId: 'candidate-1',
        targetMasterId: null,
        channelListingId: null,
        originWorkspaceId: null,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kidsrainboots',
        status: 'active',
        createdByUserId: 'user-1',
      },
      select: { id: true },
    });
  });
});
