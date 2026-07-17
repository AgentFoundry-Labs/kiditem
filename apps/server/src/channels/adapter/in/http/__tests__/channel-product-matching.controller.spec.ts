import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelProductMatchingController } from '../channel-product-matching.controller';

const organizationId = '00000000-0000-4000-8000-000000000001';
const listingId = '00000000-0000-4000-8000-000000000002';
const optionId = '00000000-0000-4000-8000-000000000003';

describe('ChannelProductMatchingController', () => {
  it('publishes the read-only recipe suggestion route with matching routes', () => {
    expect(Reflect.getMetadata('path', ChannelProductMatchingController)).toBe(
      'channels/product-mappings',
    );
    const routes = [
      ['list', '/', RequestMethod.GET],
      ['productCandidates', ':channelListingId/candidates', RequestMethod.GET],
      ['linkProduct', ':channelListingId/master-product', RequestMethod.PUT],
      ['variantCandidates', 'options/:channelListingOptionId/candidates', RequestMethod.GET],
      ['recipeSuggestionsForOption', 'options/:channelListingOptionId/recipe-suggestions', RequestMethod.GET],
      ['linkOption', 'options/:channelListingOptionId/product-variant', RequestMethod.PUT],
    ] as const;
    for (const [methodName, path, method] of routes) {
      const handler = ChannelProductMatchingController.prototype[methodName];
      expect(Reflect.getMetadata('path', handler)).toBe(path);
      expect(Reflect.getMetadata('method', handler)).toBe(method);
    }
    expect(Object.getOwnPropertyNames(ChannelProductMatchingController.prototype))
      .not.toEqual(expect.arrayContaining(['replaceComponents', 'refreshStatuses']));
  });

  it('passes authenticated organization scope to every service call', async () => {
    const service = {
      list: vi.fn(),
      productCandidates: vi.fn(),
      variantCandidates: vi.fn(),
      linkProduct: vi.fn(),
      linkOption: vi.fn(),
    };
    const recipeSuggestions = { suggest: vi.fn() };
    const controller = new ChannelProductMatchingController(service as never, recipeSuggestions as never);

    await controller.list(organizationId, {});
    await controller.productCandidates(listingId, organizationId, {});
    await controller.variantCandidates(optionId, organizationId, {});
    await controller.linkProduct(listingId, organizationId, { masterProductId: null });
    await controller.linkOption(optionId, organizationId, { productVariantId: null });
    await controller.recipeSuggestionsForOption(optionId, organizationId);

    expect(service.list).toHaveBeenCalledWith(organizationId, {});
    expect(service.productCandidates).toHaveBeenCalledWith(organizationId, listingId, {});
    expect(service.variantCandidates).toHaveBeenCalledWith(organizationId, optionId, {});
    expect(service.linkProduct).toHaveBeenCalledWith(
      organizationId,
      listingId,
      { masterProductId: null },
    );
    expect(service.linkOption).toHaveBeenCalledWith(
      organizationId,
      optionId,
      { productVariantId: null },
    );
    expect(recipeSuggestions.suggest).toHaveBeenCalledWith(organizationId, optionId);
  });
});
