import { describe, expect, it, vi } from 'vitest';
import { ContentWorkspaceAttachmentRepositoryAdapter } from '../content-workspace-attachment.repository.adapter';

describe('ContentWorkspaceAttachmentRepositoryAdapter', () => {
  it('relabels a standalone group when no product workspace exists', async () => {
    const tx = {
      contentGenerationGroup: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback: (txArg: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ContentWorkspaceAttachmentRepositoryAdapter(prisma as never);

    await repository.attachGroupToProduct({
      organizationId: 'org-1',
      groupId: 'group-1',
      productId: 'product-1',
      productWorkspaceId: null,
    });

    expect(tx.contentGenerationGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', organizationId: 'org-1' },
      data: { groupType: 'product_workspace', targetMasterId: 'product-1' },
    });
  });

  it('moves generations and merges duplicate assets into an existing product workspace', async () => {
    const tx = {
      contentGeneration: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentGenerationGroup: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: 'asset-old', url: 'https://cdn.example.com/a.png' }]),
        findFirst: vi.fn().mockResolvedValue({ id: 'asset-existing', isDeleted: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentGenerationAssetUsage: {
        findMany: vi.fn().mockResolvedValue([{ id: 'usage-old', contentGenerationId: 'generation-1' }]),
        findFirst: vi.fn().mockResolvedValue(null),
        deleteMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      contentGenerationSource: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback: (txArg: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ContentWorkspaceAttachmentRepositoryAdapter(prisma as never);

    await repository.attachGroupToProduct({
      organizationId: 'org-1',
      groupId: 'group-old',
      productId: 'product-1',
      productWorkspaceId: 'group-product',
    });

    expect(tx.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', generationGroupId: 'group-old' },
      data: { generationGroupId: 'group-product' },
    });
    expect(tx.contentGenerationAssetUsage.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: 'usage-old' },
      data: { contentAssetId: 'asset-existing' },
    });
    expect(tx.contentGenerationSource.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', contentAssetId: 'asset-old' },
      data: { contentAssetId: 'asset-existing' },
    });
    expect(tx.contentAsset.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: 'asset-old' },
    });
  });
});
