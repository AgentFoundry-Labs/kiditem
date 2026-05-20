import { describe, expect, it, vi } from 'vitest';
import { syncCoupangProducts } from '../channel-sync-product.service';

function makeDeps() {
  return {
    deps: {
      syncRepository: {
        getPrimaryCoupangAccountId: vi.fn().mockResolvedValue('account-1'),
        syncSingleProductListing: vi.fn().mockResolvedValue({ synced: true }),
        updateSingleProductListing: vi.fn().mockResolvedValue(undefined),
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
    },
  };
}

describe('syncCoupangProducts', () => {
  it('refreshes the listing for the active Coupang account instead of a legacy accountless duplicate', async () => {
    const { deps } = makeDeps();

    const result = await syncCoupangProducts(deps as never, 'org-1');

    expect(result.synced).toBe(1);
    expect(deps.syncRepository.getPrimaryCoupangAccountId).toHaveBeenCalledWith('org-1');
    expect(deps.syncRepository.syncSingleProductListing).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sellerProductId: '720445',
      channelAccountId: 'account-1',
    });
    expect(deps.syncRepository.updateSingleProductListing).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sellerProductId: '720445',
      channelAccountId: 'account-1',
      detail: {
        sellerProductId: 720445,
        sellerProductName: '쿠팡 판매명',
        statusName: 'APPROVED',
        items: [],
      },
    });
  });
});
