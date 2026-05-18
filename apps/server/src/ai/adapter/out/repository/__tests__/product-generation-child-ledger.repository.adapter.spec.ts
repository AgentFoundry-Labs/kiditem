import { describe, expect, it, vi } from 'vitest';
import { ProductGenerationChildLedgerRepositoryAdapter } from '../product-generation-child-ledger.repository.adapter';

describe('ProductGenerationChildLedgerRepositoryAdapter', () => {
  it('reads detail-page and thumbnail child statuses with organization scope', async () => {
    const prisma = {
      contentGeneration: {
        findFirst: vi.fn().mockResolvedValue({ status: 'READY' }),
      },
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue({ status: 'succeeded' }),
      },
    };
    const repository = new ProductGenerationChildLedgerRepositoryAdapter(prisma as never);

    await expect(repository.readChildStatuses({
      organizationId: 'org-1',
      childIds: {
        detailPageGenerationId: 'detail-1',
        thumbnailGenerationId: 'thumbnail-1',
      },
    })).resolves.toEqual({
      detailPageStatus: 'READY',
      thumbnailStatus: 'succeeded',
    });

    expect(prisma.contentGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: 'detail-1', organizationId: 'org-1' },
      select: { status: true },
    });
    expect(prisma.thumbnailGeneration.findFirst).toHaveBeenCalledWith({
      where: { id: 'thumbnail-1', organizationId: 'org-1', isDeleted: false },
      select: { status: true },
    });
  });
});
