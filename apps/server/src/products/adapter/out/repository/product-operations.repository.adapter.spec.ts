import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsRepositoryAdapter } from './product-operations.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const sellingMasterProductId = '00000000-0000-4000-8000-000000000002';

describe('ProductOperationsRepositoryAdapter', () => {
  it('uses the latest channel snapshot to project selling channel products', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          channelListing('판매중지', '판매중', 'Coupang Wing'),
          channelListing('판매중', '판매중지', 'Coupang Rocket'),
        ]),
      },
    };
    const repository = new ProductOperationsRepositoryAdapter(prisma as never);

    const result = await repository.listProducts(organizationId, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'active',
      adStatus: 'all',
    });

    expect(result.sellingChannelProducts).toEqual([{
      channelAccountId: '00000000-0000-4000-8000-000000000011',
      channel: 'coupang',
      channelAccountName: 'Coupang Rocket',
    }]);
    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        channelAccount: {
          is: expect.objectContaining({ status: 'active' }),
        },
      }),
    }));
  });
});

function channelListing(
  snapshotStatus: string,
  rawStatus: string,
  accountName: string,
) {
  return {
    id: `listing-${accountName}`,
    isActive: true,
    status: 'active',
    rawJson: { saleStatus: rawStatus },
    channelAccount: {
      id: '00000000-0000-4000-8000-000000000011',
      channel: 'coupang',
      name: accountName,
    },
    channelListingDailySnapshots: [{ saleStatus: snapshotStatus }],
    options: [{ status: '판매중', inventoryComponents: [] }],
  };
}
