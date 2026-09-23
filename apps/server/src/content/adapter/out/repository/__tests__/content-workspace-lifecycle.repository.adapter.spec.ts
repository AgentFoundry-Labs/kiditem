import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../content-workspace-lifecycle.repository.adapter';

function salesProductOwners(assertOwner = vi.fn().mockResolvedValue(undefined)) {
  return { assertOwner };
}

function channelListingQuery() {
  return {
    lockActiveOwner: vi.fn().mockResolvedValue({
      id: 'listing-1',
      salesProductId: 'candidate-1',
      accountId: 'account-1',
    }),
  };
}

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
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never, channelListingQuery() as never, salesProductOwners() as never);

    await expect(repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'direct_detail_page',
      salesProductId: 'candidate-1',
      channelListingId: null,
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
  });

  it('refuses a selling-product workspace that names a listing or a title — names come from the product', async () => {
    const tx = { contentWorkspace: { findFirst: vi.fn(), create: vi.fn() } };
    const prisma = { ...tx, $transaction: vi.fn((callback: (scope: typeof tx) => unknown) => callback(tx)) };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never, channelListingQuery() as never, salesProductOwners() as never);
    const base = {
      organizationId: 'org-1',
      ownerType: 'sales_product' as const,
      salesProductId: 'sales-product-1',
      channelListingId: null,
      normalizedTitle: null,
      createdByUserId: 'user-1',
    };

    await expect(repository.ensureActiveWorkspace({ ...base, channelListingId: 'listing-1' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(repository.ensureActiveWorkspace({ ...base, normalizedTitle: 'kidsrainboots' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
  });

  it('asks Channels whether the draft is real before opening its workspace', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'workspace-1',
              normalizedTitle: 'kidsrainboots',
        }),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn((callback: (scope: typeof tx) => unknown) => callback(tx)),
    };
    const owners = salesProductOwners();
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never, channelListingQuery() as never, owners as never);

    await repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'sales_product',
      salesProductId: 'sales-product-1',
      channelListingId: null,
      normalizedTitle: null,
      createdByUserId: 'user-1',
    });

    expect(owners.assertOwner).toHaveBeenCalledWith({
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
    });
    expect(owners.assertOwner.mock.invocationCallOrder[0]).toBeLessThan(
      tx.contentWorkspace.create.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a workspace for a draft Channels does not know', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contentWorkspace: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn((callback: (scope: typeof tx) => unknown) => callback(tx)),
    };
    const owners = salesProductOwners(
      vi.fn().mockRejectedValue(new NotFoundException('판매상품을 찾지 못했습니다.')),
    );
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never, channelListingQuery() as never, owners as never);

    await expect(repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'sales_product',
      salesProductId: 'sales-product-foreign',
      channelListingId: null,
      normalizedTitle: null,
      createdByUserId: 'user-1',
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.contentWorkspace.create).not.toHaveBeenCalled();
  });

  it('recovers active workspace creation when a concurrent request wins the unique key', async () => {
    const raced = {
      id: 'workspace-1',
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
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never, channelListingQuery() as never, salesProductOwners() as never);

    await expect(repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'direct_detail_page',
      salesProductId: null,
      channelListingId: null,
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
        salesProductId: null,
        channelListingId: null,
      },
    }));
    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledTimes(2);
  });

  it('uses channel listing identity for the active workspace key', async () => {
    const existing = {
      id: 'workspace-1',
      normalizedTitle: 'kidsrainboots',
    };
    const prisma = transactional({
      contentWorkspace: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    });
    const channelListings = channelListingQuery();
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never, channelListings as never, salesProductOwners() as never);

    await repository.ensureActiveWorkspace({
      organizationId: 'org-1',
      ownerType: 'channel_listing',
      salesProductId: null,
      channelListingId: 'listing-1',
      normalizedTitle: null,
      createdByUserId: 'user-1',
    });

    expect(prisma.contentWorkspace.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        ownerType: 'channel_listing',
        channelListingId: 'listing-1',
      }),
    }));
    expect(channelListings.lockActiveOwner).toHaveBeenCalledWith(expect.anything(), {
      organizationId: 'org-1',
      listingId: 'listing-1',
    });
  });

  it('lists only the workspace kinds this list owns, by name rather than by exclusion', async () => {
    const prisma = {
      contentWorkspace: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ContentWorkspaceLifecycleRepositoryAdapter(prisma as never, channelListingQuery() as never, salesProductOwners() as never);

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
        ownerType: { in: ['channel_listing', 'direct_detail_page'] },
      },
      skip: 10,
      take: 10,
    }));
  });
});
