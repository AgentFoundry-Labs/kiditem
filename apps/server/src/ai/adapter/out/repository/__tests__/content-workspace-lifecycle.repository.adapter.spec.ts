import { describe, expect, it, vi } from 'vitest';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../content-workspace-lifecycle.repository.adapter';

describe('ContentWorkspaceLifecycleRepositoryAdapter', () => {
  it('recovers active workspace creation when a concurrent request wins the unique key', async () => {
    const raced = {
      id: 'workspace-1',
      displayName: '키즈 터치등',
      normalizedTitle: '키즈터치등',
    };
    const prisma = {
      contentWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(raced),
        create: vi.fn().mockRejectedValueOnce(Object.assign(new Error('Unique failed'), {
          code: 'P2002',
        })),
      },
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never);

    await expect(repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'direct_detail_page',
      sourceCandidateId: null,
      targetMasterId: null,
      displayName: '키즈 터치등',
      normalizedTitle: '키즈터치등',
      createdByUserId: 'user-1',
    })).resolves.toEqual(raced);

    expect(prisma.contentWorkspace.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        organizationId: 'org-1',
        ownerType: 'direct_detail_page',
        normalizedTitle: '키즈터치등',
        status: 'active',
        isDeleted: false,
        sourceCandidateId: null,
        targetMasterId: null,
      },
    }));
    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledTimes(2);
  });

  it('lists only registered-product workspaces, excluding sourcing candidate workspaces', async () => {
    const prisma = {
      contentWorkspace: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never);

    await repository.listActive({
      organizationId: 'org-1',
      status: 'active',
      normalizedTitle: null,
      page: 2,
      limit: 10,
    });

    expect(prisma.contentWorkspace.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'org-1',
        status: 'active',
        isDeleted: false,
        ownerType: { not: 'sourcing_candidate' },
      },
      skip: 10,
      take: 10,
    }));
  });
});
