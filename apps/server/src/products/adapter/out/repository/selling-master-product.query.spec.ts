import { describe, expect, it, vi } from 'vitest';
import { listSellingMasterProductIds } from './selling-master-product.query';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('listSellingMasterProductIds', () => {
  it('derives selling inventory products from current selling option components', async () => {
    const findMany = vi.fn().mockResolvedValue([
      listing('판매중', [{ masterProductId: 'master-selling', currentStock: 5 }]),
      listing('판매중', [{ masterProductId: 'master-zero-stock', currentStock: 0 }]),
      listing('판매중지', [{ masterProductId: 'master-stopped', currentStock: 5 }]),
    ]);

    await expect(listSellingMasterProductIds({
      channelListing: { findMany },
    } as never, organizationId)).resolves.toEqual(['master-selling']);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        channelAccount: {
          is: expect.objectContaining({
            status: 'active',
            channel: { in: ['coupang', 'rocket'] },
          }),
        },
      }),
    }));
  });
});

function listing(
  snapshotStatus: string,
  components: Array<{ masterProductId: string; currentStock: number }>,
) {
  return {
    isActive: true,
    status: '승인완료',
    rawJson: null,
    channelListingDailySnapshots: [{ saleStatus: snapshotStatus }],
    options: [{
      status: '판매중',
      inventoryComponents: components.map((component) => ({
        sellpiaInventorySku: {
          isActive: true,
          currentStock: component.currentStock,
          masterProductId: component.masterProductId,
          masterProduct: { isActive: true },
        },
      })),
    }],
  };
}
