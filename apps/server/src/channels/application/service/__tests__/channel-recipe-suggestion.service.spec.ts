import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelRecipeSuggestionService } from '../channel-recipe-suggestion.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';

describe('ChannelRecipeSuggestionService', () => {
  it('batches code, typed barcode, and product-name evidence across all options linked to the variant', async () => {
    const context = {
      channelListingOptionId: optionId,
      productVariantId: '00000000-0000-4000-8000-000000000003',
      masterProductId: '00000000-0000-4000-8000-000000000004',
      options: [{
        channelListingOptionId: optionId, listingName: '키즈 식판', itemName: '기본',
        sellerSku: 'SP-001', modelNumber: 'MODEL-001', barcode: '0012-3456-7890',
      }],
      existingComponents: [],
    };
    const repository = { getContext: vi.fn().mockResolvedValue(context) };
    const evidence = {
      findByCodes: vi.fn().mockResolvedValue([{
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005', code: 'SP-001',
        name: '키즈 식판', optionName: null, barcode: '001234567890', currentStock: 8,
      }]),
      findByNormalizedBarcodes: vi.fn().mockResolvedValue([]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
      listActiveForMatching: vi.fn().mockResolvedValue([]),
    };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);

    const result = await service.suggest(organizationId, optionId);

    expect(result.status).toBe('unique_code');
    expect(evidence.findByCodes).toHaveBeenCalledWith(organizationId, ['MODEL-001', 'SP-001']);
    expect(evidence.findByNormalizedBarcodes).toHaveBeenCalledWith(organizationId, ['001234567890']);
    expect(evidence.findByNormalizedNames).toHaveBeenCalledWith(organizationId, ['키즈식판']);
    expect(result.proposals[0]?.requiresQuantityConfirmation).toBe(false);
    expect(result.recommendedQuantity).toBe(1);
  });

  it('classifies a strict product-and-option match as automatic', async () => {
    const context = {
      channelListingOptionId: optionId,
      productVariantId: '00000000-0000-4000-8000-000000000003',
      masterProductId: '00000000-0000-4000-8000-000000000004',
      options: [{
        channelListingOptionId: optionId,
        listingName: ' 키즈 식판 ',
        itemName: '블루 1개',
        sellerSku: null,
        modelNumber: null,
        barcode: null,
      }],
      existingComponents: [],
    };
    const repository = { getContext: vi.fn().mockResolvedValue(context) };
    const evidence = {
      findByCodes: vi.fn().mockResolvedValue([]),
      findByNormalizedBarcodes: vi.fn().mockResolvedValue([]),
      findByNormalizedNames: vi.fn().mockResolvedValue([{
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005',
        code: 'SP-001',
        name: '키즈 식판',
        optionName: '블루 1개',
        barcode: null,
        currentStock: 8,
      }]),
      listActiveForMatching: vi.fn().mockResolvedValue([]),
    };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);

    await expect(service.suggest(organizationId, optionId)).resolves.toMatchObject({
      status: 'exact_name_option',
      automationDecision: 'auto_apply',
      recommendedQuantity: 1,
    });
  });

  it('keeps duplicate typed barcodes ambiguous and detects code/name disagreement', async () => {
    const context = {
      channelListingOptionId: optionId,
      productVariantId: '00000000-0000-4000-8000-000000000003',
      masterProductId: '00000000-0000-4000-8000-000000000004',
      options: [{
        channelListingOptionId: optionId,
        listingName: '키즈 식판',
        itemName: null,
        sellerSku: null,
        modelNumber: null,
        barcode: '001234567890',
      }],
      existingComponents: [],
    };
    const repository = { getContext: vi.fn().mockResolvedValue(context) };
    const barcodeSku = {
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005',
      code: 'SP-001', name: '키즈 식판', optionName: null,
      barcode: '001234567890', currentStock: 8,
    };
    const evidence = {
      findByCodes: vi.fn().mockResolvedValue([]),
      findByNormalizedBarcodes: vi.fn().mockResolvedValue([
        barcodeSku,
        { ...barcodeSku, sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000006', code: 'SP-002' },
      ]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
      listActiveForMatching: vi.fn().mockResolvedValue([]),
    };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);
    await expect(service.suggest(organizationId, optionId)).resolves.toMatchObject({
      status: 'ambiguous', automationDecision: 'blocked',
    });

    context.options[0]!.sellerSku = 'SP-CODE';
    context.options[0]!.barcode = null;
    evidence.findByCodes.mockResolvedValue([{
      ...barcodeSku,
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000007',
      code: 'SP-CODE',
    }]);
    evidence.findByNormalizedBarcodes.mockResolvedValue([]);
    evidence.findByNormalizedNames.mockResolvedValue([barcodeSku]);
    await expect(service.suggest(organizationId, optionId)).resolves.toMatchObject({
      status: 'conflict', automationDecision: 'blocked',
    });
  });

  it('deduplicates exact evidence and loads active name candidates once per context batch', async () => {
    const repository = { getContext: vi.fn() };
    const evidence = {
      findByCodes: vi.fn().mockResolvedValue([]),
      findByNormalizedBarcodes: vi.fn().mockResolvedValue([]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
      listActiveForMatching: vi.fn().mockResolvedValue([]),
    };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);
    const sharedOption = {
      channelListingOptionId: optionId,
      listingName: '키즈 식판', itemName: '기본', sellerSku: 'SP-001',
      modelNumber: null, barcode: '001234567890',
    };

    const results = await service.suggestBatch(organizationId, [
      {
        productVariantId: '00000000-0000-4000-8000-000000000003',
        masterProductId: '00000000-0000-4000-8000-000000000004',
        selectedChannelListingOptionIds: [optionId],
        allLinkedOptions: [sharedOption],
        existingComponents: [],
      },
      {
        productVariantId: '00000000-0000-4000-8000-000000000006',
        masterProductId: '00000000-0000-4000-8000-000000000007',
        selectedChannelListingOptionIds: ['00000000-0000-4000-8000-000000000008'],
        allLinkedOptions: [{ ...sharedOption, channelListingOptionId: '00000000-0000-4000-8000-000000000008' }],
        existingComponents: [],
      },
    ]);

    expect(results).toHaveLength(2);
    expect(evidence.findByCodes).toHaveBeenCalledOnce();
    expect(evidence.findByNormalizedBarcodes).toHaveBeenCalledOnce();
    expect(evidence.findByNormalizedNames).toHaveBeenCalledOnce();
    expect(evidence.listActiveForMatching).toHaveBeenCalledOnce();
  });

  it('auto-applies one unique high-confidence active-inventory name candidate', async () => {
    const context = {
      channelListingOptionId: optionId,
      productVariantId: '00000000-0000-4000-8000-000000000003',
      masterProductId: '00000000-0000-4000-8000-000000000004',
      options: [{
        channelListingOptionId: optionId,
        listingName: '동물인형 목욕타올 1p 어린이 샤워 타올',
        itemName: '1개', sellerSku: null, modelNumber: null, barcode: null,
      }],
      existingComponents: [],
    };
    const repository = { getContext: vi.fn().mockResolvedValue(context) };
    const evidence = {
      findByCodes: vi.fn().mockResolvedValue([]),
      findByNormalizedBarcodes: vi.fn().mockResolvedValue([]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
      listActiveForMatching: vi.fn().mockResolvedValue([{
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005',
        code: '914-1', name: '동물인형목욕타올', optionName: null,
        barcode: null, currentStock: 8,
      }]),
    };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);

    await expect(service.suggest(organizationId, optionId)).resolves.toMatchObject({
      status: 'high_confidence_name', automationDecision: 'auto_apply',
      recommendedQuantity: 1,
    });
  });

  it('cross-checks an exact code candidate against the channel product name', async () => {
    const context = {
      channelListingOptionId: optionId,
      productVariantId: '00000000-0000-4000-8000-000000000003',
      masterProductId: '00000000-0000-4000-8000-000000000004',
      options: [{
        channelListingOptionId: optionId,
        listingName: '스타워즈 합체 광선검', itemName: '단품',
        sellerSku: null, modelNumber: '9726-1', barcode: null,
      }],
      existingComponents: [],
    };
    const wrongSku = {
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000005',
      code: '9726-1', name: '입체 오리 청소 세트', optionName: null,
      barcode: null, currentStock: 8,
    };
    const repository = { getContext: vi.fn().mockResolvedValue(context) };
    const evidence = {
      findByCodes: vi.fn().mockResolvedValue([wrongSku]),
      findByNormalizedBarcodes: vi.fn().mockResolvedValue([]),
      findByNormalizedNames: vi.fn().mockResolvedValue([]),
      listActiveForMatching: vi.fn().mockResolvedValue([wrongSku]),
    };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);

    await expect(service.suggest(organizationId, optionId)).resolves.toMatchObject({
      status: 'identifier_name_mismatch', automationDecision: 'operator_review',
    });
  });

  it('does not query Inventory when the scoped context is missing', async () => {
    const repository = { getContext: vi.fn().mockResolvedValue(null) };
    const evidence = {
      findByCodes: vi.fn(),
      findByNormalizedBarcodes: vi.fn(),
      findByNormalizedNames: vi.fn(),
      listActiveForMatching: vi.fn(),
    };
    const service = new ChannelRecipeSuggestionService(repository as never, evidence as never);

    await expect(service.suggest(organizationId, optionId)).rejects.toBeInstanceOf(NotFoundException);
    expect(evidence.findByCodes).not.toHaveBeenCalled();
    expect(evidence.findByNormalizedBarcodes).not.toHaveBeenCalled();
    expect(evidence.findByNormalizedNames).not.toHaveBeenCalled();
    expect(evidence.listActiveForMatching).not.toHaveBeenCalled();
  });
});
