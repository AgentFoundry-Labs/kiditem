import { describe, expect, it, vi } from 'vitest';
import { syncCoupangProducts } from '../channel-sync-product.service';

function makeDeps() {
  const tx = {
    channelListing: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    channelListingOption: {
      upsert: vi.fn(),
    },
  };
  return {
    tx,
    deps: {
      prisma: {
        channelAccount: {
          findFirst: vi.fn().mockResolvedValue({ id: 'account-1' }),
        },
        channelListing: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'listing-account', channelAccountId: 'account-1' },
            { id: 'listing-legacy-null', channelAccountId: null },
          ]),
        },
        $transaction: vi.fn((callback) => callback(tx)),
      },
      coupang: {
        getSellerProducts: vi.fn().mockResolvedValue({
          code: 'SUCCESS',
          data: {
            content: [{ sellerProductId: 720445 }],
            nextToken: null,
          },
        }),
        getSellerProduct: vi.fn().mockResolvedValue({
          code: 'SUCCESS',
          data: {
            sellerProductId: 720445,
            sellerProductName: '쿠팡 판매명',
            statusName: 'APPROVED',
            items: [],
          },
        }),
      },
      logger: {
        error: vi.fn(),
        log: vi.fn(),
      },
      normalizeProductStatus: vi.fn((status) => status?.toLowerCase()),
    },
  };
}

describe('syncCoupangProducts', () => {
  it('refreshes the listing for the active Coupang account instead of a legacy accountless duplicate', async () => {
    const { deps, tx } = makeDeps();

    const result = await syncCoupangProducts(deps as never, 'org-1');

    expect(result.synced).toBe(1);
    expect(deps.prisma.channelAccount.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        channel: 'coupang',
        isPrimary: true,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    expect(deps.prisma.channelListing.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        channel: 'coupang',
        externalId: '720445',
        isDeleted: false,
        OR: [
          { channelAccountId: 'account-1' },
          { channelAccountId: null },
        ],
      },
      select: { id: true, channelAccountId: true },
      orderBy: [{ channelAccountId: 'asc' }, { updatedAt: 'desc' }],
      take: 3,
    });
    expect(tx.channelListing.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'listing-account',
        channelAccountId: 'account-1',
      }),
    }));
  });
});
