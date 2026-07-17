import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelRecipeSuggestionService } from '../channel-recipe-suggestion.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';

describe('ChannelRecipeSuggestionService', () => {
  it('batches exact code and normalized-name evidence across all options linked to the variant', async () => {
    const context = {
      channelListingOptionId: optionId,
      productVariantId: '00000000-0000-4000-8000-000000000003',
      masterProductId: '00000000-0000-4000-8000-000000000004',
      options: [{
        channelListingOptionId: optionId, listingName: '키즈 식판', itemName: '기본',
        sellerSku: 'SP-001', modelNumber: 'MODEL-001',
      }],
      existingComponents: [],
    };
    const repository = { getContext: vi.fn().mockResolvedValue(context) };
    const evidence = {
      findByCodes: vi.fn().mockResolvedValue([{
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005', code: 'SP-001',
        name: '키즈 식판', optionName: null, currentStock: 8,
      }]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
    };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);

    const result = await service.suggest(organizationId, optionId);

    expect(result.status).toBe('unique_code');
    expect(evidence.findByCodes).toHaveBeenCalledWith(organizationId, ['MODEL-001', 'SP-001']);
    expect(evidence.findByNormalizedNames).toHaveBeenCalledWith(organizationId, ['기본', '키즈식판']);
    expect(result.proposals[0]?.requiresQuantityConfirmation).toBe(true);
  });

  it('does not query Inventory when the scoped context is missing', async () => {
    const repository = { getContext: vi.fn().mockResolvedValue(null) };
    const evidence = { findByCodes: vi.fn(), findByNormalizedNames: vi.fn() };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);

    await expect(service.suggest(organizationId, optionId)).rejects.toBeInstanceOf(NotFoundException);
    expect(evidence.findByCodes).not.toHaveBeenCalled();
    expect(evidence.findByNormalizedNames).not.toHaveBeenCalled();
  });
});
