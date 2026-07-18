import { describe, expect, it, vi } from 'vitest';
import { ChannelRecipeAutomationContextRepositoryAdapter } from './channel-recipe-automation-context.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const channelAccountId = '00000000-0000-4000-8000-000000000002';

describe('ChannelRecipeAutomationContextRepositoryAdapter', () => {
  it('loads selected account options and all shared-variant evidence in two batched reads', async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([
        { id: 'selected-b', productVariantId: 'variant-1' },
        { id: 'selected-a', productVariantId: 'variant-1' },
        { id: 'selected-c', productVariantId: 'variant-2' },
      ])
      .mockResolvedValueOnce([
        optionRow({ id: 'selected-a', productVariantId: 'variant-1', masterProductId: 'product-1' }),
        optionRow({ id: 'shared-foreign-account', productVariantId: 'variant-1', masterProductId: 'product-1' }),
        optionRow({ id: 'selected-c', productVariantId: 'variant-2', masterProductId: 'product-2' }),
      ]);
    const repository = new ChannelRecipeAutomationContextRepositoryAdapter({
      channelListingOption: { findMany },
    } as never);

    const contexts = await repository.listContexts(organizationId, channelAccountId);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        isActive: true,
        productVariantId: { not: null },
        listing: { is: expect.objectContaining({ channelAccountId, organizationId, isActive: true }) },
      }),
    }));
    expect(findMany.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      where: {
        organizationId,
        isActive: true,
        productVariantId: { in: ['variant-1', 'variant-2'] },
      },
    }));
    expect(contexts).toEqual([
      expect.objectContaining({
        productVariantId: 'variant-1',
        selectedChannelListingOptionIds: ['selected-a', 'selected-b'],
        allLinkedOptions: [
          expect.objectContaining({ channelListingOptionId: 'selected-a', barcode: '001234567890' }),
          expect.objectContaining({ channelListingOptionId: 'shared-foreign-account' }),
        ],
        existingComponents: [expect.objectContaining({ source: 'deterministic' })],
      }),
      expect.objectContaining({
        productVariantId: 'variant-2',
        selectedChannelListingOptionIds: ['selected-c'],
      }),
    ]);
  });

  it('short-circuits when the scoped account has no linked variants', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ChannelRecipeAutomationContextRepositoryAdapter({
      channelListingOption: { findMany },
    } as never);

    await expect(repository.listContexts(organizationId, channelAccountId)).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledOnce();
  });
});

function optionRow(input: {
  id: string;
  productVariantId: string;
  masterProductId: string;
}) {
  return {
    id: input.id,
    productVariantId: input.productVariantId,
    itemName: '블루',
    sellerSku: 'SP-001',
    modelNumber: null,
    barcode: '001234567890',
    listing: { displayName: '키즈 식판', channelName: null },
    productVariant: {
      masterProductId: input.masterProductId,
      components: [{
        quantity: 1,
        source: 'deterministic',
        confirmedBy: null,
        confirmedAt: new Date('2026-07-18T00:00:00.000Z'),
        sellpiaInventorySku: { id: 'sku-1', code: 'SP-001' },
      }],
    },
  };
}
