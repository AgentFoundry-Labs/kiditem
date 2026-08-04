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

  it('loads the selected active option and preserves its direct inventory components', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: optionId, itemName: '기본', sellerSku: 'SP-001', modelNumber: 'MODEL-001',
      barcode: '001234567890',
      listing: { displayName: '키즈 식판', channelName: null },
    }]);
    const repository = new ChannelRecipeSuggestionContextRepositoryAdapter({
      channelListingOption: {
        findFirst: vi.fn().mockResolvedValue({
          id: optionId,
          listing: { masterProductId: 'product-1', displayName: '키즈 식판', channelName: null },
          inventoryComponents: [{
            quantity: 2,
            createdAt: new Date('2026-07-18T00:00:00.000Z'),
            sellpiaInventorySku: { id: 'sku-1', code: 'SP-001' },
          }],
        }),
        findMany,
      },
    } as never);

    await expect(repository.getContext(organizationId, optionId)).resolves.toMatchObject({
      channelListingOptionId: optionId, masterProductId: 'product-1',
      options: [expect.objectContaining({ barcode: '001234567890' })],
      existingComponents: [{
        sellpiaInventorySkuId: 'sku-1',
        code: 'SP-001',
        quantity: 2,
        source: 'manual',
        confirmedBy: null,
        confirmedAt: new Date('2026-07-18T00:00:00.000Z'),
      }],
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: optionId, organizationId },
    }));
  });
});
