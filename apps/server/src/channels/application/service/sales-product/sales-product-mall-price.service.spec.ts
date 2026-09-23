import { describe, expect, it, vi } from 'vitest';
import type { SalesProductRepositoryPort } from '../../port/out/persistence/sales-product.repository.port';
import { SalesProductMallPriceService } from './sales-product-mall-price.service';

function repository(apply = vi.fn().mockResolvedValue(1)) {
  return {
    apply,
    port: {
      readMallPriceCandidates: vi.fn().mockResolvedValue({
        products: [{
          id: 'product-1',
          code: 'K000001',
          name: '상품',
          version: 7,
          options: [
            { id: 'option-1', salePrice: 1000, normalPrice: null },
            { id: 'option-2', salePrice: 1200, normalPrice: null },
          ],
        }],
        listingOptions: [
          { channelAccountId: 'account-1', salesProductOptionId: 'option-1', salePrice: 1100 },
          { channelAccountId: 'account-1', salesProductOptionId: 'option-2', salePrice: 1300 },
        ],
      }),
      listChannelAccounts: vi.fn().mockResolvedValue([{ id: 'account-1', channel: 'coupang', name: '쿠팡' }]),
      applyMallPriceAdoption: apply,
    } as unknown as SalesProductRepositoryPort,
  };
}

describe('SalesProductMallPriceService', () => {
  it('writes the adopted mall prices to the selling product options', async () => {
    const { port, apply } = repository();
    const activity = { log: vi.fn(), warn: vi.fn() };
    const result = await new SalesProductMallPriceService(port, activity).adopt('org-1', true);

    expect(result).toMatchObject({ applied: true, pairs: 1, products: 1, unchanged: 0, conflicts: 0, byMall: { 쿠팡: 1 } });
    expect(apply).toHaveBeenCalledWith('org-1', [{
      salesProductId: 'product-1',
      expectedVersion: 7,
      channelAccountIds: ['account-1'],
      optionPrices: [
        { salesProductOptionId: 'option-1', salePrice: 1100 },
        { salesProductOptionId: 'option-2', salePrice: 1300 },
      ],
    }]);
  });

  it('does not write during preview', async () => {
    const { port, apply } = repository(vi.fn());
    const activity = { log: vi.fn(), warn: vi.fn() };
    const result = await new SalesProductMallPriceService(port, activity).adopt('org-1', false);

    expect(result.applied).toBe(false);
    expect(result.pairs).toBe(1);
    expect(apply).not.toHaveBeenCalled();
  });
});
