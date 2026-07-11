import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { MasterCatalogAdapter } from '../master-catalog.adapter';

describe('MasterCatalogAdapter', () => {
  function buildAdapter() {
    const tx = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({
          imageUrl: null,
          thumbnailUrl: null,
          images: [],
        }),
        updateMany: vi.fn(),
      },
      masterProductImage: {
        create: vi.fn(),
      },
      channelListing: {
        create: vi.fn(),
      },
    };
    const prisma = {
      channelListing: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      channelAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      productOption: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const adapter = new MasterCatalogAdapter(prisma as unknown as PrismaService);

    return { adapter, prisma, tx };
  }

  it('returns null when a Coupang listing cannot be matched', async () => {
    const { adapter, prisma, tx } = buildAdapter();

    const handle = await adapter.findCoupangMaster({
      organizationId: '00000000-0000-0000-0000-0000000c0001',
      inventoryId: 'WING-404',
      name: 'Unmatched Coupang item',
    });

    expect(handle).toBeNull();
    expect(tx.channelListing.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ignores an imported ChannelProduct without a MasterProduct in master lookup', async () => {
    const { adapter, prisma } = buildAdapter();
    prisma.channelListing.findMany.mockResolvedValueOnce([
      {
        id: 'imported-listing-1',
        externalId: 'WING-UNLINKED',
        channelAccountId: 'account-1',
        masterId: null,
        master: null,
        lastImportRunId: 'wing-import-1',
      },
    ] as never);

    const handle = await adapter.findCoupangMaster({
      organizationId: '00000000-0000-0000-0000-0000000c0001',
      inventoryId: 'WING-UNLINKED',
      name: 'Wing import only',
    });

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
      }),
    );
    expect(prisma.channelListing.updateMany).not.toHaveBeenCalled();
    expect(handle).toBeNull();
  });

  it('connects an unmatched Coupang listing to the active account when legacyCode matches', async () => {
    const { adapter, prisma } = buildAdapter();
    prisma.channelAccount.findFirst.mockResolvedValueOnce({ id: 'account-1' });
    prisma.productOption.findFirst.mockResolvedValueOnce({
      masterId: '00000000-0000-0000-0000-00000000a111',
      master: {
        imageUrl: null,
        thumbnailUrl: null,
        images: [],
      },
    });
    prisma.channelListing.create.mockResolvedValueOnce({
      id: 'listing-1',
      masterId: '00000000-0000-0000-0000-00000000a111',
    });

    const handle = await adapter.findCoupangMaster({
      organizationId: '00000000-0000-0000-0000-0000000c0001',
      inventoryId: 'WING-123',
      legacyCode: 'LEG-123',
      name: 'Matched Coupang item',
    });

    expect(prisma.productOption.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: '00000000-0000-0000-0000-0000000c0001',
          legacyCode: 'LEG-123',
          isDeleted: false,
        }),
      }),
    );
    expect(prisma.channelListing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: '00000000-0000-0000-0000-0000000c0001',
          masterId: '00000000-0000-0000-0000-00000000a111',
          channel: 'coupang',
          channelAccountId: 'account-1',
          externalId: 'WING-123',
          channelName: 'Matched Coupang item',
          status: 'active',
        }),
      }),
    );
    expect(handle).toEqual({
      masterId: '00000000-0000-0000-0000-00000000a111',
      hasImage: false,
    });
  });

  it('does not create accountless Coupang listings from legacyCode matches', async () => {
    const { adapter, prisma } = buildAdapter();
    prisma.productOption.findFirst.mockResolvedValueOnce({
      masterId: '00000000-0000-0000-0000-00000000a111',
      master: {
        imageUrl: null,
        thumbnailUrl: null,
        images: [],
      },
    });

    const handle = await adapter.findCoupangMaster({
      organizationId: '00000000-0000-0000-0000-0000000c0001',
      inventoryId: 'WING-123',
      legacyCode: 'LEG-123',
      name: 'Matched Coupang item',
    });

    expect(prisma.channelListing.create).not.toHaveBeenCalled();
    expect(handle).toEqual({
      masterId: '00000000-0000-0000-0000-00000000a111',
      hasImage: false,
    });
  });

  it('does not pick an ambiguous listing when no active account identity is known', async () => {
    const { adapter, prisma } = buildAdapter();
    prisma.channelListing.findMany.mockResolvedValueOnce([
      {
        externalId: 'WING-123',
        channelAccountId: 'account-1',
        masterId: '00000000-0000-0000-0000-00000000a111',
        master: {
          imageUrl: null,
          thumbnailUrl: null,
          images: [],
        },
      },
      {
        externalId: 'WING-123',
        channelAccountId: 'account-2',
        masterId: '00000000-0000-0000-0000-00000000a222',
        master: {
          imageUrl: null,
          thumbnailUrl: null,
          images: [],
        },
      },
    ]);

    const handle = await adapter.findCoupangMaster({
      organizationId: '00000000-0000-0000-0000-0000000c0001',
      inventoryId: 'WING-123',
      name: 'Ambiguous Coupang item',
    });

    expect(handle).toBeNull();
    expect(prisma.channelListing.updateMany).not.toHaveBeenCalled();
    expect(prisma.channelListing.create).not.toHaveBeenCalled();
  });

  it('omits ambiguous listing image states when no active account identity is known', async () => {
    const { adapter, prisma } = buildAdapter();
    prisma.channelListing.findMany.mockResolvedValueOnce([
      {
        id: 'listing-1',
        externalId: 'WING-123',
        channelAccountId: 'account-1',
        master: {
          imageUrl: 'https://example.com/one.jpg',
          thumbnailUrl: null,
          images: [],
        },
      },
      {
        id: 'listing-2',
        externalId: 'WING-123',
        channelAccountId: 'account-2',
        master: {
          imageUrl: null,
          thumbnailUrl: null,
          images: [],
        },
      },
    ]);

    const states = await adapter.findCoupangListingImageStates({
      organizationId: '00000000-0000-0000-0000-0000000c0001',
      inventoryIds: ['WING-123'],
    });

    expect(states).toEqual([]);
  });

  it('omits image state for an imported ChannelProduct without a MasterProduct', async () => {
    const { adapter, prisma } = buildAdapter();
    prisma.channelListing.findMany.mockResolvedValueOnce([
      {
        id: 'imported-listing-1',
        externalId: 'WING-UNLINKED',
        channelAccountId: 'account-1',
        masterId: null,
        master: null,
        lastImportRunId: 'wing-import-1',
      },
    ] as never);

    const states = await adapter.findCoupangListingImageStates({
      organizationId: '00000000-0000-0000-0000-0000000c0001',
      inventoryIds: ['WING-UNLINKED'],
    });

    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ masterId: { not: null } }),
        select: expect.objectContaining({ masterId: true }),
      }),
    );
    expect(states).toEqual([]);
  });

  it('attaches an external Coupang CDN URL as a MasterProductImage row + master.imageUrl cache', async () => {
    const { adapter, tx } = buildAdapter();

    const attached = await adapter.attachPrimaryImage({
      organizationId: '00000000-0000-0000-0000-0000000c0001',
      masterId: '00000000-0000-0000-0000-00000000a111',
      storageKey: null,
      url: 'https://thumbnail10.coupangcdn.com/thumbnails/remote/230x230ex/image.jpg',
      mimeType: null,
      fileSize: null,
    } as never);

    expect(attached).toBe(true);
    expect(tx.masterProductImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageKey: null,
          url: 'https://thumbnail10.coupangcdn.com/thumbnails/remote/230x230ex/image.jpg',
          source: 'coupang-wing',
        }),
      }),
    );
  });
});
