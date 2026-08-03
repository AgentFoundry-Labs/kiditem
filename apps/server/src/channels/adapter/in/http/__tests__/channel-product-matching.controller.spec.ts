import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelProductMatchingController } from '../channel-product-matching.controller';

const organizationId = '00000000-0000-4000-8000-000000000001';
const listingId = '00000000-0000-4000-8000-000000000002';

describe('ChannelProductMatchingController', () => {
  it('publishes only direct MasterProduct matching and Sellpia evidence routes', () => {
    expect(Reflect.getMetadata('path', ChannelProductMatchingController)).toBe(
      'channels/product-mappings',
    );
    const routes = [
      ['list', '/', RequestMethod.GET],
      ['autoMatch', 'auto-match', RequestMethod.POST],
      ['sellpiaManualMatchTargets', 'sellpia-manual-match/targets', RequestMethod.GET],
      ['importSellpiaManualMatches', 'sellpia-manual-match/import', RequestMethod.POST],
      ['productCandidates', ':channelListingId/candidates', RequestMethod.GET],
      ['linkProduct', ':channelListingId/master-product', RequestMethod.PUT],
    ] as const;
    for (const [methodName, path, method] of routes) {
      const handler = ChannelProductMatchingController.prototype[methodName];
      expect(Reflect.getMetadata('path', handler)).toBe(path);
      expect(Reflect.getMetadata('method', handler)).toBe(method);
    }
    expect(Object.getOwnPropertyNames(ChannelProductMatchingController.prototype))
      .not.toEqual(expect.arrayContaining(['linkOption', 'variantCandidates', 'previewRecipeAutomation']));
  });

  it('passes authenticated organization scope to every service call', async () => {
    const matching = {
      list: vi.fn(),
      autoMatch: vi.fn(),
      productCandidates: vi.fn(),
      linkProduct: vi.fn(),
    };
    const manualMatches = { targets: vi.fn(), import: vi.fn() };
    const controller = new ChannelProductMatchingController(
      matching as never,
      manualMatches as never,
    );

    await controller.list(organizationId, {});
    await controller.autoMatch(organizationId, { channelAccountId: listingId });
    await controller.productCandidates(listingId, organizationId, {});
    await controller.linkProduct(listingId, organizationId, { masterProductId: null });
    await controller.sellpiaManualMatchTargets(organizationId);
    await controller.importSellpiaManualMatches(organizationId, { source: 'snapshot' });

    expect(matching.list).toHaveBeenCalledWith(organizationId, {});
    expect(matching.autoMatch).toHaveBeenCalledWith(
      organizationId,
      { channelAccountId: listingId },
    );
    expect(matching.productCandidates).toHaveBeenCalledWith(organizationId, listingId, {});
    expect(matching.linkProduct).toHaveBeenCalledWith(
      organizationId,
      listingId,
      { masterProductId: null },
    );
    expect(manualMatches.targets).toHaveBeenCalledWith(organizationId);
    expect(manualMatches.import).toHaveBeenCalledWith(
      organizationId,
      { source: 'snapshot' },
    );
  });
});
