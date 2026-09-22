import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { describe, expect, it, vi } from 'vitest';
import { RegistrationContentWorkspaceRepositoryAdapter } from './registration-content-workspace.repository.adapter';

function makeRepository(prisma: unknown = {}) {
  return new RegistrationContentWorkspaceRepositoryAdapter(prisma as never, {
    lockActiveOwner: vi.fn().mockResolvedValue({
      id: 'listing-1',
      accountId: 'account-1',
    }),
  } as never);
}

const NO_SELECTION = {
  selectedThumbnailUrl: null,
  selectedThumbnailGenerationId: null,
  selectedThumbnailGenerationCandidateId: null,
  selectedDetailPageArtifactId: null,
  selectedDetailPageRevisionId: null,
  selectedDetailPageGenerationId: null,
} as const;

describe('RegistrationContentWorkspaceRepositoryAdapter', () => {
  it('resolves generation-backed detail content to exact IDs before payload freeze', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          salesProductId: 'sales-product-1',
          createdByUserId: 'user-1',
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
    const repository = makeRepository();

    await expect(repository.resolveSourceSelections(ownerTransaction(tx as never), {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
    })).resolves.toEqual({
      ...NO_SELECTION,
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
    });
  });

  it('only accepts the sales-product draft workspace as the content source', async () => {
    const tx = {
      contentWorkspace: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const repository = makeRepository();

    await expect(repository.resolveSourceSelections(ownerTransaction(tx as never), {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'listing-workspace-1',
    })).rejects.toThrow('Source content workspace not found.');

    expect(tx.contentWorkspace.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerType: 'sales_product' }),
    }));
  });

  it('adopts a draft image URL the owner selected into workspace-managed content', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'asset-1' }]),
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          salesProductId: 'sales-product-1',
          createdByUserId: 'user-1',
        }),
      },
      contentAsset: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'asset-1', url: 'https://cdn.example.com/draft.png' }),
      },
      contentGenerationGroup: {
        findFirst: vi.fn().mockResolvedValue({ id: 'group-1' }),
      },
      contentWorkspaceThumbnailSelection: {
        create: vi.fn().mockResolvedValue({ id: 'selection-1' }),
      },
    };
    const repository = makeRepository();

    await expect(repository.resolveSourceSelections(ownerTransaction(tx as never), {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: 'https://cdn.example.com/draft.png',
    })).resolves.toMatchObject({ selectedThumbnailUrl: 'https://cdn.example.com/draft.png' });

    expect(tx.contentAsset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        url: 'https://cdn.example.com/draft.png',
        role: 'thumbnail',
        originGenerationGroupId: 'group-1',
      }),
    }));
    expect(tx.contentWorkspaceThumbnailSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        contentWorkspaceId: 'source-workspace-1',
        contentAssetId: 'asset-1',
        sourceThumbnailGenerationId: null,
      }),
    }));
  });

  it('reuses a thumbnail asset the workspace already manages instead of adopting it twice', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          salesProductId: 'sales-product-1',
          createdByUserId: 'user-1',
        }),
      },
      contentAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'asset-1' }), create: vi.fn() },
      contentWorkspaceThumbnailSelection: { create: vi.fn() },
    };
    const repository = makeRepository();

    await expect(repository.resolveSourceSelections(ownerTransaction(tx as never), {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: 'https://cdn.example.com/managed.png',
    })).resolves.toMatchObject({ selectedThumbnailUrl: 'https://cdn.example.com/managed.png' });

    expect(tx.contentAsset.create).not.toHaveBeenCalled();
    expect(tx.contentWorkspaceThumbnailSelection.create).not.toHaveBeenCalled();
  });

  it('rejects a thumbnail generation that is not this workspace own successful output', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          salesProductId: 'sales-product-1',
          createdByUserId: 'user-1',
        }),
      },
      thumbnailGeneration: { findFirst: vi.fn().mockResolvedValue(null) },
      thumbnailGenerationCandidate: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const repository = makeRepository();

    await expect(repository.resolveSourceSelections(ownerTransaction(tx as never), {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: 'https://cdn.example.com/generated.png',
      selectedThumbnailGenerationId: 'generation-other',
      selectedThumbnailGenerationCandidateId: 'candidate-other',
    })).rejects.toThrow('Selected thumbnail generation is not successful source content.');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('validates every selected reference against the organization and source workspace', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          salesProductId: 'sales-product-1',
          createdByUserId: 'user-1',
        }),
      },
      detailPageArtifact: { findFirst: vi.fn().mockResolvedValue({ id: 'artifact-1' }) },
      detailPageRevision: { findFirst: vi.fn().mockResolvedValue({ id: 'revision-1' }) },
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({ id: 'detail-generation-1', detailPageArtifactId: 'artifact-1' }),
      },
    };
    const repository = makeRepository();

    await expect(repository.validateSourceSelections(ownerTransaction(tx as never), {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: 'https://cdn.example.com/thumb.png',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
    })).resolves.toBeUndefined();

    expect(tx.detailPageArtifact.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'artifact-1',
        organizationId: 'org-1',
        contentWorkspaceId: 'source-workspace-1',
      }),
    }));
  });

  it('requires a thumbnail URL when generation provenance is supplied', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          salesProductId: 'sales-product-1',
          createdByUserId: 'user-1',
        }),
      },
    };
    const repository = makeRepository();

    await expect(repository.validateSourceSelections(ownerTransaction(tx as never), {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailGenerationId: 'generation-1',
    })).rejects.toThrow('Selected thumbnail URL is required with generation provenance.');
  });

  it('uses the injected Prisma client for pre-provider validation without a transaction', async () => {
    const prisma = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          salesProductId: 'sales-product-1',
          createdByUserId: 'user-1',
        }),
      },
    };
    const repository = makeRepository(prisma);

    await expect(repository.validateSourceSelections(null, {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
    })).resolves.toBeUndefined();
    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledOnce();
  });

  it('rejects a detail generation whose artifact differs from the effective source artifact', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'source-workspace-1',
          salesProductId: 'sales-product-1',
          createdByUserId: 'user-1',
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
    const repository = makeRepository();

    await expect(repository.validateSourceSelections(ownerTransaction(tx as never), {
      ...NO_SELECTION,
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedDetailPageGenerationId: 'detail-generation-old',
    })).rejects.toThrow('Selected detail generation does not own the selected artifact.');
  });

  it('creates or reuses the draft-owned workspace in the supplied transaction', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'source-workspace-1' }),
      },
    };
    const repository = makeRepository();

    await expect(repository.ensureSalesProductWorkspace(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    })).resolves.toEqual({ workspaceId: 'source-workspace-1' });
    expect(tx.contentWorkspace.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        ownerType: 'sales_product',
        salesProductId: 'sales-product-1',
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

  it('attaches the listing to the draft workspace instead of cloning a second one', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'draft-workspace-1', channelListingId: null }]),
      contentWorkspace: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
      },
      detailPageArtifact: { create: vi.fn() },
      contentWorkspaceThumbnailSelection: { create: vi.fn() },
    };
    const repository = makeRepository();

    await expect(repository.attachToListing(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      listingId: 'listing-1',
    })).resolves.toEqual({ workspaceId: 'draft-workspace-1' });

    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
    expect(tx.detailPageArtifact.create).not.toHaveBeenCalled();
    expect(tx.contentWorkspaceThumbnailSelection.create).not.toHaveBeenCalled();
    expect(tx.contentWorkspace.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'draft-workspace-1',
        organizationId: 'org-1',
        channelListingId: null,
        status: 'active',
        isDeleted: false,
      },
      data: { channelListingId: 'listing-1' },
    });
  });

  it('fails the attach when the workspace changed between the lock and the update', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'draft-workspace-1', channelListingId: null }]),
      contentWorkspace: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const repository = makeRepository();

    await expect(repository.attachToListing(ownerTransaction(tx as never), {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      listingId: 'listing-1',
    })).rejects.toThrow('Content workspace changed while the listing was being attached.');
  });
});
