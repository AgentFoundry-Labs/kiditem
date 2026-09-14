import { describe, expect, it, vi } from 'vitest';
import { ConfirmedChannelComponentReferenceRepositoryAdapter } from './confirmed-channel-component-reference.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

describe('ConfirmedChannelComponentReferenceRepositoryAdapter', () => {
  it('returns only organization-owned confirmed recipe references', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { sellpiaInventorySkuId: 'sku-1' },
      { sellpiaInventorySkuId: 'sku-1' },
      { sellpiaInventorySkuId: 'sku-2' },
    ]);
    const identityFindMany = vi.fn().mockResolvedValue([
      inventoryIdentity('sku-1', 'SP-001'),
      inventoryIdentity('sku-2', 'SP-002'),
    ]);
    const transaction = {
      channelListingOptionInventoryComponent: { findMany },
      sellpiaInventorySku: { findMany: identityFindMany },
    };
    const adapter = new ConfirmedChannelComponentReferenceRepositoryAdapter({
      $transaction: (operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
    } as never);

    await expect(adapter.listReferencedSellpiaProductCodes(ORGANIZATION_ID))
      .resolves.toEqual(['SP-001', 'SP-002']);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        channelListingOption: {
          organizationId: ORGANIZATION_ID,
          listing: {
            organizationId: ORGANIZATION_ID,
            masterProductId: { not: null },
          },
        },
      },
      select: { sellpiaInventorySkuId: true },
      orderBy: { id: 'asc' },
    });
  });
});

function inventoryIdentity(id: string, code: string) {
  return {
    id,
    code,
    name: code,
    optionName: null,
    barcode: null,
    purchasePrice: null,
    salePrice: null,
    isActive: true,
    masterProductId: null,
  };
}
