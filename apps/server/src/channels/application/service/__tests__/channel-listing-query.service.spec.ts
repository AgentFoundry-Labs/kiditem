import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelListingRepositoryAdapter as ChannelListingQueryService } from '../../../adapter/out/repository/channel-listing.repository.adapter';
import { MarketplaceRegistrationRepositoryAdapter } from '../../../adapter/out/repository/marketplace-registration.repository.adapter';
import { ChannelReconciliationScanRepositoryAdapter } from '../../../adapter/out/repository/channel-reconciliation-scan.repository.adapter';
import { ChannelReconciliationMatcherRepositoryAdapter } from '../../../adapter/out/repository/channel-reconciliation-matcher.repository.adapter';

function makePrisma() {
  return {
    $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    channelListing: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'listing-1',
          masterId: 'master-1',
          channelAccountId: 'account-1',
          channel: 'coupang',
          externalId: 'seller-product-1',
          channelName: '쿠팡 등록명',
          channelPrice: 12900,
          status: 'active',
          exposureStatus: 'visible',
          createdAt: new Date('2026-05-16T00:00:00.000Z'),
          updatedAt: new Date('2026-05-17T00:00:00.000Z'),
          master: {
            id: 'master-1',
            code: 'M-00000001',
            name: '자석 다트게임',
            thumbnailUrl: 'https://cdn.example.com/master.jpg',
            imageUrl: 'https://cdn.example.com/master.jpg',
            productPreparations: [{
              sourceCandidateId: 'candidate-1',
              contentWorkspaceId: 'workspace-1',
            }],
          },
          channelAccount: {
            id: 'account-1',
            channel: 'coupang',
            name: '쿠팡 본계정',
            externalAccountId: 'vendor-1',
            vendorId: 'vendor-1',
            sellerId: null,
            isPrimary: true,
          },
          _count: { options: 2 },
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'listing-1',
        masterId: 'master-1',
        channelAccountId: 'account-1',
        channel: 'coupang',
        externalId: 'seller-product-1',
        channelName: '쿠팡 등록명',
        channelPrice: 12900,
        status: 'active',
        exposureStatus: 'visible',
        createdAt: new Date('2026-05-16T00:00:00.000Z'),
        updatedAt: new Date('2026-05-17T00:00:00.000Z'),
        master: {
          id: 'master-1',
          code: 'M-00000001',
          name: '자석 다트게임',
          thumbnailUrl: 'https://cdn.example.com/master.jpg',
          imageUrl: 'https://cdn.example.com/master.jpg',
          productPreparations: [],
        },
        channelAccount: null,
        _count: { options: 2 },
      }),
      groupBy: vi.fn().mockResolvedValue([
        { channel: 'coupang', channelAccountId: 'account-1', _count: { id: 3 } },
      ]),
    },
    channelAccount: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'account-1',
          channel: 'coupang',
          name: '쿠팡 본계정',
          externalAccountId: 'vendor-1',
          vendorId: 'vendor-1',
          sellerId: null,
          isPrimary: true,
        },
      ]),
    },
    masterProduct: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'master-1',
          code: 'M-00000001',
          name: '자석 다트게임',
          thumbnailUrl: 'https://cdn.example.com/master.jpg',
          imageUrl: 'https://cdn.example.com/master.jpg',
          productPreparations: [],
          listings: [
            {
              id: 'listing-1',
              masterId: 'master-1',
              channelAccountId: 'account-1',
              channel: 'coupang',
              externalId: 'seller-product-1',
              channelName: '쿠팡 등록명',
              channelPrice: 12900,
              status: 'active',
              exposureStatus: 'visible',
              createdAt: new Date('2026-05-16T00:00:00.000Z'),
              updatedAt: new Date('2026-05-17T00:00:00.000Z'),
              channelAccount: {
                id: 'account-1',
                channel: 'coupang',
                name: '쿠팡 본계정',
                externalAccountId: 'vendor-1',
                vendorId: 'vendor-1',
                sellerId: null,
                isPrimary: true,
              },
              _count: { options: 2 },
            },
          ],
        },
      ]),
    },
  };
}

describe('ChannelListingQueryService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ChannelListingQueryService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ChannelListingQueryService(prisma as never);
  });

  it('lists active marketplace listings with account and master context', async () => {
    const result = await service.list('org-1', {
      page: 1,
      limit: 20,
      sort: 'newest',
      channel: 'coupang',
      channelAccountId: 'account-1',
      search: '다트',
    });

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        isDeleted: false,
        channel: 'coupang',
        channelAccountId: 'account-1',
        OR: expect.arrayContaining([
          { master: { name: { contains: '다트', mode: 'insensitive' } } },
        ]),
      }),
      include: expect.objectContaining({
        master: expect.objectContaining({
          select: expect.objectContaining({
            productPreparations: expect.objectContaining({
              where: expect.objectContaining({
                organizationId: 'org-1',
                isCurrentForMaster: true,
                isDeleted: false,
              }),
              take: 1,
            }),
          }),
        }),
        channelAccount: expect.any(Object),
        _count: { select: { options: true } },
      }),
    }));
    expect(result.items[0]).toEqual({
      id: 'listing-1',
      masterId: 'master-1',
      masterCode: 'M-00000001',
      masterName: '자석 다트게임',
      thumbnailUrl: 'https://cdn.example.com/master.jpg',
      channel: 'coupang',
      channelAccountId: 'account-1',
      channelAccountName: '쿠팡 본계정',
      externalId: 'seller-product-1',
      channelName: '쿠팡 등록명',
      channelPrice: 12900,
      sourceCandidateId: 'candidate-1',
      contentWorkspaceId: 'workspace-1',
      status: 'active',
      exposureStatus: 'visible',
      optionCount: 2,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    });
    expect(result.marketCounts).toEqual([
      {
        channel: 'coupang',
        channelAccountId: 'account-1',
        channelAccountName: '쿠팡 본계정',
        count: 3,
      },
    ]);
  });

  it('excludes an imported channel product without a MasterProduct from list totals and market counts', async () => {
    prisma.channelListing.count.mockResolvedValueOnce(0);
    prisma.channelListing.findMany.mockResolvedValueOnce([
      {
        id: 'imported-listing-1',
        masterId: null,
        channelAccountId: 'account-1',
        channel: 'coupang',
        externalId: 'imported-product-1',
        channelName: 'Wing import only',
        channelPrice: 9900,
        status: 'active',
        exposureStatus: 'visible',
        lastImportRunId: 'wing-import-1',
        createdAt: new Date('2026-07-11T00:00:00.000Z'),
        updatedAt: new Date('2026-07-11T00:00:00.000Z'),
        master: null,
        channelAccount: {
          id: 'account-1',
          channel: 'coupang',
          name: 'Active Wing account',
          externalAccountId: 'vendor-1',
          vendorId: 'vendor-1',
          sellerId: null,
          isPrimary: true,
          status: 'active',
        },
        lastImportRun: { id: 'wing-import-1', status: 'completed' },
        _count: { options: 1 },
      },
    ] as never);
    prisma.channelListing.groupBy.mockResolvedValueOnce([]);

    const result = await service.list('org-1');

    expect(prisma.channelListing.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ masterId: { not: null } }),
    });
    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(prisma.channelListing.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({
      items: [],
      total: 0,
      marketCounts: [],
    }));
  });

  it('loads one listing as a product-pipeline workspace fallback', async () => {
    const result = await service.getWorkspace('org-1', 'listing-1');

    expect(prisma.channelListing.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'listing-1',
        organizationId: 'org-1',
        isDeleted: false,
        masterId: { not: null },
      },
    }));
    expect(result).toEqual(expect.objectContaining({
      id: 'listing-1',
      masterId: 'master-1',
      sourceCandidateId: null,
      contentWorkspaceId: null,
    }));
  });

  it('does not expose an imported channel product as a MasterProduct workspace', async () => {
    prisma.channelListing.findFirst.mockResolvedValueOnce({
      id: 'imported-listing-1',
      masterId: null,
      channelAccountId: 'account-1',
      channel: 'coupang',
      externalId: 'imported-product-1',
      channelName: 'Wing import only',
      channelPrice: 9900,
      status: 'active',
      exposureStatus: 'visible',
      lastImportRunId: 'wing-import-1',
      createdAt: new Date('2026-07-11T00:00:00.000Z'),
      updatedAt: new Date('2026-07-11T00:00:00.000Z'),
      master: null,
      channelAccount: null,
      _count: { options: 1 },
    } as never);

    await expect(
      service.getWorkspace('org-1', 'imported-listing-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.channelListing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
  });

  it('groups registered listings by MasterProduct and preserves account rows', async () => {
    prisma.masterProduct.findMany.mockResolvedValueOnce([
      {
        id: 'master-1',
        code: 'M-00000001',
        name: '자석 다트게임',
        thumbnailUrl: 'https://cdn.example.com/master.jpg',
        imageUrl: 'https://cdn.example.com/master.jpg',
        productPreparations: [],
        listings: [
          {
            id: 'listing-1',
            masterId: 'master-1',
            channelAccountId: 'account-1',
            channel: 'coupang',
            externalId: '720445',
            channelName: '쿠팡 본계정 상품',
            channelPrice: 12900,
            status: 'active',
            exposureStatus: 'visible',
            createdAt: new Date('2026-05-16T00:00:00.000Z'),
            updatedAt: new Date('2026-05-17T00:00:00.000Z'),
            channelAccount: {
              id: 'account-1',
              channel: 'coupang',
              name: '쿠팡 본계정',
              externalAccountId: 'vendor-1',
              vendorId: 'vendor-1',
              sellerId: null,
              isPrimary: true,
            },
            _count: { options: 1 },
          },
          {
            id: 'listing-2',
            masterId: 'master-1',
            channelAccountId: 'account-2',
            channel: 'coupang',
            externalId: '888888',
            channelName: '쿠팡 보조계정 상품',
            channelPrice: null,
            status: 'active',
            exposureStatus: 'visible',
            createdAt: new Date('2026-05-16T00:00:00.000Z'),
            updatedAt: new Date('2026-05-17T01:00:00.000Z'),
            channelAccount: {
              id: 'account-2',
              channel: 'coupang',
              name: '쿠팡 보조계정',
              externalAccountId: 'vendor-2',
              vendorId: 'vendor-2',
              sellerId: null,
              isPrimary: false,
            },
            _count: { options: 1 },
          },
        ],
      },
    ]);

    const result = await service.listGrouped('org-1', { tab: 'registered' });

    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        listings: {
          some: expect.objectContaining({
            isDeleted: false,
            masterId: { not: null },
          }),
        },
      }),
      select: expect.objectContaining({
        listings: expect.objectContaining({
          where: expect.objectContaining({ masterId: { not: null } }),
        }),
      }),
    }));
    expect(prisma.channelListing.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      masterId: 'master-1',
      listingCount: 2,
      listings: expect.arrayContaining([
        expect.objectContaining({ id: 'listing-1', channelAccountId: 'account-1' }),
        expect.objectContaining({ id: 'listing-2', channelAccountId: 'account-2' }),
      ]),
    }));
  });

  it('filters grouped registered listings by created date for recent sections', async () => {
    await service.listGrouped('org-1', {
      tab: 'registered',
      createdSince: '2026-05-11T00:00:00.000Z',
    });

    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        listings: {
          some: expect.objectContaining({
            organizationId: 'org-1',
            isDeleted: false,
            masterId: { not: null },
            createdAt: { gte: new Date('2026-05-11T00:00:00.000Z') },
          }),
        },
      }),
      select: expect.objectContaining({
        listings: expect.objectContaining({
          where: expect.objectContaining({
            masterId: { not: null },
            createdAt: { gte: new Date('2026-05-11T00:00:00.000Z') },
          }),
        }),
      }),
    }));
  });
});

describe('nullable ChannelProduct compatibility boundaries', () => {
  it('projects the caller-validated MasterProduct ID from confirmed registration', async () => {
    const savedListing = {
      id: 'listing-1',
      masterId: null,
      channel: 'coupang',
      channelAccountId: 'account-1',
      externalId: 'seller-product-1',
      channelName: 'Confirmed product',
      channelPrice: 12900,
      status: 'active',
    };
    const tx = {
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: 'account-1', channel: 'coupang' }),
      },
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({ id: 'master-1', name: 'Master product' }),
      },
      channelListing: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(savedListing),
        update: vi.fn().mockResolvedValue(savedListing),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new MarketplaceRegistrationRepositoryAdapter(prisma as never);

    const result = await repository.registerConfirmedListing('org-1', {
      masterId: 'master-1',
      channelAccountId: 'account-1',
      externalId: 'seller-product-1',
      channelName: 'Confirmed product',
      channelPrice: 12900,
    });

    expect(result).toEqual({
      id: 'listing-1',
      masterId: 'master-1',
      channel: 'coupang',
      channelAccountId: 'account-1',
      externalId: 'seller-product-1',
      channelName: 'Confirmed product',
      channelPrice: 12900,
      status: 'active',
    });
  });

  it('ignores an imported unlinked ChannelProduct during the legacy image reconciliation scan', async () => {
    const prisma = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'imported-listing-1',
            masterId: null,
            externalId: 'imported-product-1',
            channelName: 'Wing import only',
            status: 'active',
            lastImportRunId: 'wing-import-1',
            master: null,
          },
        ]),
      },
      channelListingOption: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      productOption: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ChannelReconciliationScanRepositoryAdapter(
      prisma as never,
      {} as never,
    );

    await expect(
      repository.syncFromImageSyncedListings('org-1'),
    ).rejects.toEqual(new BadRequestException('coupang image-synced listings not found'));
    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
  });

  it('does not treat an unlinked ChannelProduct as a reconciled listing match', async () => {
    const tx = {
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'imported-listing-1',
            masterId: null,
            channelAccountId: 'account-1',
          },
        ]),
      },
      channelListingOption: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      productOption: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ChannelReconciliationMatcherRepositoryAdapter();

    const result = await repository.evaluateRow(
      tx as never,
      'org-1',
      'imported-product-1',
      null,
      null,
    );

    expect(tx.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({
      status: 'needs_review',
      linkedListingId: null,
      linkedMasterProductId: null,
    }));
  });
});
