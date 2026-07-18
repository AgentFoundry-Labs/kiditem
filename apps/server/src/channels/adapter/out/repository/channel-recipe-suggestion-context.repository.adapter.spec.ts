import { describe, expect, it, vi } from 'vitest';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from './channel-recipe-suggestion-context.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';

describe('ChannelRecipeSuggestionContextRepositoryAdapter', () => {
  it('returns null without querying related options when the organization-scoped option is absent', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn();
    const repository = new ChannelRecipeSuggestionContextRepositoryAdapter({
      channelListingOption: { findFirst, findMany },
    } as never);

    await expect(repository.getContext(organizationId, optionId)).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: optionId, organizationId, isActive: true }),
    }));
    expect(findMany).not.toHaveBeenCalled();
  });

  it('loads every active option sharing the selected variant and preserves existing components', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: optionId, itemName: '기본', sellerSku: 'SP-001', modelNumber: 'MODEL-001',
      barcode: '001234567890',
      listing: { displayName: '키즈 식판', channelName: null },
    }]);
    const repository = new ChannelRecipeSuggestionContextRepositoryAdapter({
      channelListingOption: {
        findFirst: vi.fn().mockResolvedValue({
          id: optionId, productVariantId: 'variant-1', listing: { displayName: '키즈 식판', channelName: null },
          productVariant: { masterProductId: 'product-1', components: [{
            quantity: 2,
            source: 'deterministic',
            confirmedBy: null,
            confirmedAt: new Date('2026-07-18T00:00:00.000Z'),
            sellpiaInventorySku: { id: 'sku-1', code: 'SP-001' },
          }] },
        }),
        findMany,
      },
    } as never);

    await expect(repository.getContext(organizationId, optionId)).resolves.toMatchObject({
      productVariantId: 'variant-1', masterProductId: 'product-1',
      options: [expect.objectContaining({ barcode: '001234567890' })],
      existingComponents: [{
        sellpiaInventorySkuId: 'sku-1',
        code: 'SP-001',
        quantity: 2,
        source: 'deterministic',
        confirmedBy: null,
        confirmedAt: new Date('2026-07-18T00:00:00.000Z'),
      }],
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId, productVariantId: 'variant-1', isActive: true },
    }));
  });
});
