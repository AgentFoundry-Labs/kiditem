import { describe, expect, it, vi } from 'vitest';
import type { SalesProductRepositoryPort } from '../port/out/persistence/sales-product.repository.port';
import { SalesProductMallPriceService } from './sales-product-mall-price.service';

describe('SalesProductMallPriceService', () => {
  it('applies per-option final prices to the existing target only', async () => {
    const setPrices = vi.fn().mockResolvedValue(1);
    const repository = {
      readMallPriceCandidates: vi.fn().mockResolvedValue({
        products: [{
          id: 'product-1',
          code: 'K000001',
          name: '상품',
          options: [
            { id: 'option-1', salePrice: 1000, normalPrice: null },
            { id: 'option-2', salePrice: 1200, normalPrice: null },
          ],
          targets: [{
            id: 'target-1',
            channelAccountId: 'account-1',
            version: 7,
            selectedOptions: [
              { salesProductOptionId: 'option-1', salePrice: 1000, normalPrice: null, supplyPrice: null },
              { salesProductOptionId: 'option-2', salePrice: 1200, normalPrice: null, supplyPrice: null },
            ],
          }],
        }],
        listingOptions: [
          { channelAccountId: 'account-1', salesProductOptionId: 'option-1', salePrice: 1100 },
          { channelAccountId: 'account-1', salesProductOptionId: 'option-2', salePrice: 1300 },
        ],
      }),
      listChannelAccounts: vi.fn().mockResolvedValue([{ id: 'account-1', channel: 'coupang', name: '쿠팡' }]),
      setChannelOverrideSalePrices: setPrices,
    } as unknown as SalesProductRepositoryPort;

    const result = await new SalesProductMallPriceService(repository).adopt('org-1', true);

    expect(result).toMatchObject({ applied: true, pairs: 1, products: 1, unchanged: 0, conflicts: 0, byMall: { 쿠팡: 1 } });
    expect(setPrices).toHaveBeenCalledWith('org-1', [{
      salesProductId: 'product-1',
      channelAccountId: 'account-1',
      salePrice: 1100,
      targetId: 'target-1',
      expectedVersion: 7,
      optionPrices: [
        { salesProductOptionId: 'option-1', salePrice: 1100 },
        { salesProductOptionId: 'option-2', salePrice: 1300 },
      ],
    }]);
  });

  it('does not write during preview', async () => {
    const setPrices = vi.fn();
    const repository = {
      readMallPriceCandidates: vi.fn().mockResolvedValue({
        products: [{
          id: 'product-1', code: 'K000001', name: '상품',
          options: [{ id: 'option-1', salePrice: 1000, normalPrice: null }],
          targets: [{ id: 'target-1', channelAccountId: 'account-1', version: 2, selectedOptions: [{
            salesProductOptionId: 'option-1', salePrice: 1000, normalPrice: null, supplyPrice: null,
          }] }],
        }],
        listingOptions: [{ channelAccountId: 'account-1', salesProductOptionId: 'option-1', salePrice: 1100 }],
      }),
      listChannelAccounts: vi.fn().mockResolvedValue([{ id: 'account-1', channel: 'coupang', name: '쿠팡' }]),
      setChannelOverrideSalePrices: setPrices,
    } as unknown as SalesProductRepositoryPort;

    const result = await new SalesProductMallPriceService(repository).adopt('org-1', false);

    expect(result.applied).toBe(false);
    expect(result.pairs).toBe(1);
    expect(setPrices).not.toHaveBeenCalled();
  });
});
