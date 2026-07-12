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
      channelListingId: null,
      originWorkspaceId: null,
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
        channelListingId: null,
      },
    }));
    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledTimes(2);
  });

  it('uses channel listing identity for the active workspace key', async () => {
    const existing = {
      id: 'workspace-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
    };
    const prisma = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never);

    await repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'channel_listing',
      sourceCandidateId: null,
      targetMasterId: null,
      channelListingId: 'listing-1',
      originWorkspaceId: 'source-workspace-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    });

    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        ownerType: 'channel_listing',
        channelListingId: 'listing-1',
      }),
    }));
  });

  it('reuses a retained master_product workspace during the 0.1.8 rollback window', async () => {
    const existing = {
      id: 'workspace-legacy',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
    };
    const prisma = {
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never);

    await expect(repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'direct_detail_page',
      sourceCandidateId: null,
      targetMasterId: 'master-1',
      channelListingId: null,
      originWorkspaceId: null,
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    })).resolves.toEqual(existing);

    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        ownerType: { in: ['direct_detail_page', 'master_product'] },
        targetMasterId: 'master-1',
      }),
    }));
    expect(prisma.contentWorkspace.create).not.toHaveBeenCalled();
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
