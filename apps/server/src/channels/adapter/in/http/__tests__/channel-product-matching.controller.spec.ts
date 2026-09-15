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
      ['beginSellpiaManualMatch', 'sellpia-manual-match/attempts', RequestMethod.POST],
      ['sellpiaManualMatchCurrent', 'sellpia-manual-match/attempts/current', RequestMethod.GET],
      ['sellpiaManualMatchAttempt', 'sellpia-manual-match/attempts/:attemptId', RequestMethod.GET],
      ['completeSellpiaManualMatch', 'sellpia-manual-match/attempts/:attemptId/complete', RequestMethod.POST],
      ['failSellpiaManualMatch', 'sellpia-manual-match/attempts/:attemptId/fail', RequestMethod.POST],
      ['cancelSellpiaManualMatch', 'sellpia-manual-match/attempts/:attemptId/cancel', RequestMethod.POST],
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
    const manualMatches = {
      targets: vi.fn(),
      beginAttempt: vi.fn(),
      readCurrent: vi.fn(),
      readAttempt: vi.fn(),
      completeAttempt: vi.fn(),
      failAttempt: vi.fn(),
      cancelAttempt: vi.fn(),
    };
    const controller = new ChannelProductMatchingController(
      matching as never,
      manualMatches as never,
    );

    await controller.list(organizationId, {});
    await controller.autoMatch(organizationId, { channelAccountId: listingId });
    await controller.productCandidates(listingId, organizationId, {});
    await controller.linkProduct(listingId, organizationId, { masterProductId: null });
    await controller.sellpiaManualMatchTargets(organizationId);
    await controller.beginSellpiaManualMatch(organizationId, 'retry-key');
    await controller.sellpiaManualMatchCurrent(organizationId);
    await controller.sellpiaManualMatchAttempt(organizationId, listingId);
    await controller.completeSellpiaManualMatch(
      organizationId,
      listingId,
      '00000000-0000-4000-8000-000000000003',
      { source: 'snapshot' },
    );
    await controller.failSellpiaManualMatch(
      organizationId,
      listingId,
      '00000000-0000-4000-8000-000000000003',
      { errorCode: 'FAILED', errorMessage: 'failure' },
    );
    // 운영자 중단은 시도 토큰 없이 조직 범위로만 끝낸다.
    await controller.cancelSellpiaManualMatch(organizationId, listingId);

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
    expect(manualMatches.beginAttempt).toHaveBeenCalledWith({
      organizationId,
      idempotencyKey: 'retry-key',
    });
    expect(manualMatches.readCurrent).toHaveBeenCalledWith(organizationId);
    expect(manualMatches.cancelAttempt).toHaveBeenCalledWith({
      organizationId,
      attemptId: listingId,
    });
    expect(manualMatches.readAttempt).toHaveBeenCalledWith({
      organizationId,
      attemptId: listingId,
    });
    expect(manualMatches.completeAttempt).toHaveBeenCalledWith({
      organizationId,
      attemptId: listingId,
      attemptToken: '00000000-0000-4000-8000-000000000003',
      snapshot: { source: 'snapshot' },
    });
    expect(manualMatches.failAttempt).toHaveBeenCalledWith({
      organizationId,
      attemptId: listingId,
      attemptToken: '00000000-0000-4000-8000-000000000003',
      errorCode: 'FAILED',
      errorMessage: 'failure',
    });
  });
});
