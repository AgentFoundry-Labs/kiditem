import { describe, expect, it, vi } from 'vitest';
import { ProductWorkspaceGroupRepositoryAdapter } from '../product-workspace-group.repository.adapter';

describe('ProductWorkspaceGroupRepositoryAdapter', () => {
  it('reuses an existing product workspace group by organization and product', async () => {
    const prisma = {
      contentGenerationGroup: {
        findFirst: vi.fn().mockResolvedValue({ id: 'group-1', targetMasterId: 'master-1' }),
        create: vi.fn(),
      },
    };
    const repository = new ProductWorkspaceGroupRepositoryAdapter(prisma as never);

    await expect(repository.ensureProductWorkspaceGroup({
      organizationId: 'org-1',
      productId: 'master-1',
      title: '키즈 퍼즐',
      triggeredByUserId: 'user-1',
      source: 'detail_page_generation',
    })).resolves.toEqual({ id: 'group-1', targetMasterId: 'master-1' });

    expect(prisma.contentGenerationGroup.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        groupType: 'product_workspace',
        targetMasterId: 'master-1',
      },
      select: { id: true, targetMasterId: true },
    });
    expect(prisma.contentGenerationGroup.create).not.toHaveBeenCalled();
  });

  it('records the caller source when creating a product workspace group', async () => {
    const prisma = {
      contentGenerationGroup: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'group-1', targetMasterId: 'master-1' }),
      },
    };
    const repository = new ProductWorkspaceGroupRepositoryAdapter(prisma as never);

    await repository.ensureProductWorkspaceGroup({
      organizationId: 'org-1',
      productId: 'master-1',
      title: '키즈 퍼즐'.repeat(40),
      triggeredByUserId: null,
      source: 'post_promotion',
    });

    expect(prisma.contentGenerationGroup.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        groupType: 'product_workspace',
        targetMasterId: 'master-1',
        title: '키즈 퍼즐'.repeat(40).slice(0, 80),
        createdByUserId: null,
        metadata: { source: 'post_promotion' },
      },
      select: { id: true, targetMasterId: true },
    });
  });
});
