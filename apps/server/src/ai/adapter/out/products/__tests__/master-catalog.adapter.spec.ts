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
        create: vi.fn(),
        updateMany: vi.fn(),
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

  it('connects an unmatched Coupang listing to an existing option by legacyCode', async () => {
    const { adapter, prisma } = buildAdapter();
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

  it('attaches external Coupang image metadata without treating the CDN URL as the master sourceUrl', async () => {
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
    const updateCall = tx.masterProduct.updateMany.mock.calls[0]?.[0];
    expect(updateCall.data).not.toHaveProperty('sourceUrl');
  });
});
