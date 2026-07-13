import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../../../../../common/legacy-family-master-scope';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../content-workspace-lifecycle.repository.adapter';

function transactional<T extends Record<string, unknown>>(scope: T): T & {
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
} {
  const prisma = scope as T & {
    $transaction: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  prisma.$queryRaw = vi.fn().mockResolvedValue([{ id: 'locked' }]);
  prisma.$transaction = vi.fn((callback: (tx: T) => unknown) => callback(scope));
  return prisma;
}

describe('ContentWorkspaceLifecycleRepositoryAdapter', () => {
  it('rejects contradictory owner fields before creating a workspace', async () => {
    const tx = {
      contentWorkspace: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn((callback: (scope: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never);

    await expect(repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'direct_detail_page',
      sourceCandidateId: 'candidate-1',
      targetMasterId: 'master-1',
      channelListingId: null,
      originWorkspaceId: null,
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
  });

  it('validates a candidate owner in the same organization inside the write transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn((callback: (scope: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never);

    await expect(repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'sourcing_candidate',
      sourceCandidateId: 'candidate-foreign',
      targetMasterId: null,
      channelListingId: null,
      originWorkspaceId: null,
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
  });

  it('rejects a direct detail workspace for a staged Sellpia Master after locking the owner row', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'master-staged' }]),
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn((callback: (scope: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never);

    await expect(repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'direct_detail_page',
      sourceCandidateId: null,
      targetMasterId: 'master-staged',
      channelListingId: null,
      originWorkspaceId: null,
      displayName: 'Sellpia physical row',
      normalizedTitle: 'sellpiaphysicalrow',
      createdByUserId: 'user-1',
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'master-staged',
        organizationId: 'org-1',
        isDeleted: false,
        ...LEGACY_FAMILY_MASTER_SCOPE,
      },
      select: { id: true },
    });
    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
  });

  it('locks a valid candidate owner before creating its workspace', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'candidate-1' }]),
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'workspace-1',
          displayName: 'Kids rain boots',
          normalizedTitle: 'kidsrainboots',
        }),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn((callback: (scope: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never);

    await repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'sourcing_candidate',
      sourceCandidateId: 'candidate-1',
      targetMasterId: null,
      channelListingId: null,
      originWorkspaceId: null,
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    });

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.contentWorkspace.create.mock.invocationCallOrder[0],
    );
  });

  it('recovers active workspace creation when a concurrent request wins the unique key', async () => {
    const raced = {
      id: 'workspace-1',
      displayName: '키즈 터치등',
      normalizedTitle: '키즈터치등',
    };
    const prisma = transactional({
      contentWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(raced),
        create: vi.fn().mockRejectedValueOnce(Object.assign(new Error('Unique failed'), {
          code: 'P2002',
        })),
      },
    });
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
    const prisma = transactional({
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'listing-1', sourceCandidateId: 'candidate-1' }])
      .mockResolvedValueOnce([{ id: 'source-workspace-1', sourceCandidateId: 'candidate-1' }]);
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
    const prisma = transactional({
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: 'master-1' }),
      },
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    });
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
