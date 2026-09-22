import { describe, expect, it, vi } from 'vitest';
import { ProductGenerationContextRepositoryAdapter } from '../product-generation-context.repository.adapter';

describe('ProductGenerationContextRepositoryAdapter', () => {
  it('reads request-hash provenance and the durable detail workspace from deterministic children', async () => {
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'detail-1',
          generationInput: { productGenerationRequestHash: 'a'.repeat(64) },
          contentWorkspaceId: 'workspace-1',
          isDeleted: false,
        }),
      },
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'thumbnail-1',
          inputMeta: { productGenerationRequestHash: 'a'.repeat(64) },
          isDeleted: false,
        }),
      },
    };
    const repository = new ProductGenerationContextRepositoryAdapter(prisma as never);

    await expect(repository.findExistingChildren({
      organizationId: 'org-1',
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumbnail-1',
    })).resolves.toEqual({
      detail: {
        generationId: 'detail-1',
        requestHash: 'a'.repeat(64),
        contentWorkspaceId: 'workspace-1',
        isDeleted: false,
      },
      thumbnail: {
        generationId: 'thumbnail-1',
        requestHash: 'a'.repeat(64),
        isDeleted: false,
      },
    });

    expect(prisma.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: 'detail-1', organizationId: 'org-1' },
      select: { id: true, generationInput: true, contentWorkspaceId: true, isDeleted: true },
    });
    expect(prisma.thumbnailGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: 'thumbnail-1', organizationId: 'org-1' },
      select: { id: true, inputMeta: true, isDeleted: true },
    });
  });
});
