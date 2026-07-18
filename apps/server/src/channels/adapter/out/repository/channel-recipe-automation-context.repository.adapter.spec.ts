import { describe, expect, it, vi } from 'vitest';
import { ChannelRecipeAutomationContextRepositoryAdapter } from './channel-recipe-automation-context.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const channelAccountId = '00000000-0000-4000-8000-000000000002';

describe('ChannelRecipeAutomationContextRepositoryAdapter', () => {
  it('loads selected account options and all shared-variant evidence in two batched reads', async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([
        selectedOptionRow({ id: 'selected-b', listingId: 'listing-1', masterProductId: 'product-1', productVariantId: null }),
        selectedOptionRow({ id: 'selected-a', listingId: 'listing-1', masterProductId: 'product-1', productVariantId: 'variant-1' }),
        selectedOptionRow({ id: 'selected-c', listingId: 'listing-2', masterProductId: 'product-2', productVariantId: 'variant-2' }),
      ])
      .mockResolvedValueOnce([
        optionRow({ id: 'selected-a', productVariantId: 'variant-1', masterProductId: 'product-1' }),
        optionRow({ id: 'shared-foreign-account', productVariantId: 'variant-1', masterProductId: 'product-1' }),
        optionRow({ id: 'selected-c', productVariantId: 'variant-2', masterProductId: 'product-2' }),
      ]);
    const repository = new ChannelRecipeAutomationContextRepositoryAdapter({
      channelListingOption: { findMany },
    } as never);

    const accountContext = await repository.listContexts(organizationId, channelAccountId);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        organizationId,
        isActive: true,
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
    expect(accountContext).toEqual({
      products: [
        {
          channelListingId: 'listing-1',
          masterProductId: 'product-1',
          options: [
            { channelListingOptionId: 'selected-a', productVariantId: 'variant-1' },
            { channelListingOptionId: 'selected-b', productVariantId: null },
          ],
        },
        {
          channelListingId: 'listing-2',
          masterProductId: 'product-2',
          options: [
            { channelListingOptionId: 'selected-c', productVariantId: 'variant-2' },
          ],
        },
      ],
      variants: [
        expect.objectContaining({
          productVariantId: 'variant-1',
          selectedChannelListingOptionIds: ['selected-a'],
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
      ],
    });
  });

  it('returns complete topology when the scoped account has no linked variants', async () => {
    const findMany = vi.fn().mockResolvedValue([
      selectedOptionRow({ id: 'selected-a', listingId: 'listing-1', masterProductId: null, productVariantId: null }),
    ]);
    const repository = new ChannelRecipeAutomationContextRepositoryAdapter({
      channelListingOption: { findMany },
    } as never);

    await expect(repository.listContexts(organizationId, channelAccountId)).resolves.toEqual({
      products: [{
        channelListingId: 'listing-1',
        masterProductId: null,
        options: [{ channelListingOptionId: 'selected-a', productVariantId: null }],
      }],
      variants: [],
    });
    expect(findMany).toHaveBeenCalledOnce();
  });
});

function selectedOptionRow(input: {
  id: string;
  listingId: string;
  masterProductId: string | null;
  productVariantId: string | null;
}) {
  return {
    id: input.id,
    productVariantId: input.productVariantId,
    listing: {
      id: input.listingId,
      masterProductId: input.masterProductId,
    },
  };
}

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
