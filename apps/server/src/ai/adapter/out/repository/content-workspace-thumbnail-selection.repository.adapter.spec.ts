import { describe, expect, it, vi } from 'vitest';
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from './content-workspace-thumbnail-selection.repository.adapter';

describe('ContentWorkspaceThumbnailSelectionRepositoryAdapter', () => {
  it('adopts an existing managed asset and points the same workspace at its new selection', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'asset-1' }]),
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({ id: 'workspace-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-1',
          url: 'https://cdn.example.com/thumb.png',
        }),
      },
      contentWorkspaceThumbnailSelection: {
        create: vi.fn().mockResolvedValue({ id: 'selection-1' }),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation: (scope: typeof tx) => unknown) => operation(tx)),
    };
    const repository = new ContentWorkspaceThumbnailSelectionRepositoryAdapter(prisma as never);

    await expect(repository.selectCurrent({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      selection: { kind: 'content_asset', contentAssetId: 'asset-1' },
    })).resolves.toEqual({
      selectionId: 'selection-1',
      contentAssetId: 'asset-1',
      url: 'https://cdn.example.com/thumb.png',
    });
    expect(tx.contentAsset.findFirst).toHaveBeenCalledWith({
      where: { id: 'asset-1', organizationId: 'org-1', isDeleted: false },
      select: { id: true, url: true },
    });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.contentWorkspaceThumbnailSelection.create.mock.invocationCallOrder[0],
    );
    expect(tx.contentWorkspaceThumbnailSelection.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        contentWorkspaceId: 'workspace-1',
        contentAssetId: 'asset-1',
        sourceThumbnailGenerationId: null,
        sourceThumbnailCandidateId: null,
        createdByUserId: 'user-1',
      },
      select: { id: true },
    });
    expect(tx.contentWorkspace.updateMany).toHaveBeenCalledWith({
      where: { id: 'workspace-1', organizationId: 'org-1', isDeleted: false },
      data: { currentThumbnailSelectionId: 'selection-1' },
    });
  });

  it('preflights an organization-owned active workspace without mutating it', async () => {
    const prisma = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({ id: 'workspace-1' }),
      },
    };
    const repository = new ContentWorkspaceThumbnailSelectionRepositoryAdapter(prisma as never);

    await expect(repository.assertActiveWorkspace({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
    })).resolves.toBeUndefined();
    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'workspace-1',
        organizationId: 'org-1',
        status: 'active',
        isDeleted: false,
      },
      select: { id: true },
    });
  });

  it('validates successful generation provenance and reuses the candidate URL asset', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'asset-1' }]),
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue({ id: 'workspace-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue({ id: 'generation-1' }),
      },
      thumbnailGenerationCandidate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'candidate-1',
          url: 'https://cdn.example.com/generated.png',
          storageKey: 'generated.png',
          mimeType: 'image/png',
          width: 1000,
          height: 1000,
          fileSize: 123,
        }),
      },
      contentGenerationGroup: {
        findFirst: vi.fn().mockResolvedValue({ id: 'group-1' }),
      },
      contentAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'asset-1',
          url: 'https://cdn.example.com/generated.png',
        }),
      },
      contentWorkspaceThumbnailSelection: {
        create: vi.fn().mockResolvedValue({ id: 'selection-1' }),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation: (scope: typeof tx) => unknown) => operation(tx)),
    };
    const repository = new ContentWorkspaceThumbnailSelectionRepositoryAdapter(prisma as never);

    await repository.selectCurrent({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: null,
      selection: {
        kind: 'generation_candidate',
        sourceThumbnailGenerationId: 'generation-1',
        sourceThumbnailCandidateId: 'candidate-1',
      },
    });

    expect(tx.thumbnailGeneration.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[1],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.thumbnailGenerationCandidate.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      tx.contentWorkspaceThumbnailSelection.create.mock.invocationCallOrder[0],
    );
    expect(tx.contentWorkspaceThumbnailSelection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentAssetId: 'asset-1',
        sourceThumbnailGenerationId: 'generation-1',
        sourceThumbnailCandidateId: 'candidate-1',
      }),
      select: { id: true },
    });
  });
});
