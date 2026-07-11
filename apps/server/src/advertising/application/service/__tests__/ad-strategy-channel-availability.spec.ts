import { describe, expect, it, vi } from 'vitest';
import type { ChannelSkuAvailabilityPort } from '../../../../channels/application/port/in/channel-sku-availability.port';
import type { AdStrategyContextRepositoryPort } from '../../port/out/repository/ad-strategy-context.repository.port';
import { AdStrategyService } from '../ad-strategy.service';

describe('AdStrategyService ChannelSku availability', () => {
  it('hydrates ad rules with exact channel capacity, sale price, and component cost', async () => {
    const listing = {
      id: '11111111-1111-4111-8111-111111111111',
      externalId: 'EXT-1',
      channelName: '쿠팡 상품',
      masterProduct: {
        id: '22222222-2222-4222-8222-222222222222',
        code: 'M-1',
        name: '상품',
        abcGrade: 'A',
        adTier: '1차',
        healthScore: 80,
      },
      primaryOption: {
        listingOptionId: '33333333-3333-4333-8333-333333333333',
        sellableStock: null,
        purchaseCost: null,
        salePrice: null,
        commissionRate: 0.1,
        shippingCost: 2500,
      },
    } as const;
    const strategyContextRepo = {
      loadStrategyContext: vi.fn().mockResolvedValue({
        adGroups: [],
        adIssuesAdGroups: [],
        listings: [listing],
        profitRateByListing: new Map(),
        channelStateByListing: new Map(),
        gradeMap: new Map([[listing.id, 'A']]),
        trafficByListing: new Map(),
        config: {},
      }),
    } as unknown as AdStrategyContextRepositoryPort;
    const availabilityPort = {
      findByListingIds: vi.fn().mockResolvedValue([{
        sku: {
          id: listing.primaryOption.listingOptionId,
          sellableStock: 3,
          salePrice: 20_000,
        },
        components: [
          { purchasePrice: 1200, quantity: 2 },
          { purchasePrice: 800, quantity: 1 },
        ],
      }]),
    } as unknown as ChannelSkuAvailabilityPort;
    const adGradeRules = { calcActions: vi.fn().mockReturnValue([]) };
    const service = Reflect.construct(AdStrategyService, [
      strategyContextRepo,
      {},
      {},
      {},
      { getConfig: vi.fn().mockResolvedValue({}) },
      adGradeRules,
      {},
      {},
      {},
      availabilityPort,
    ]) as AdStrategyService;

    await service.getRules('14d', '44444444-4444-4444-8444-444444444444');

    expect(availabilityPort.findByListingIds).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      [listing.id],
    );
    expect(adGradeRules.calcActions).toHaveBeenCalledWith(expect.objectContaining({
      listings: [expect.objectContaining({
        primaryOption: expect.objectContaining({
          sellableStock: 3,
          purchaseCost: 3200,
          salePrice: 20_000,
        }),
      })],
    }));
  });
});
