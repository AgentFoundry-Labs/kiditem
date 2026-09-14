import { describe, expect, it, vi } from 'vitest';
import { SourcingEntryRecommendationService } from '../sourcing-entry-recommendation.service';

describe('SourcingEntryRecommendationService', () => {
  it('is a compatibility presenter over the canonical recommendation run', async () => {
    const recommendations = {
      latest: vi.fn(async () => ({
        ready: true,
        warnings: [],
        error: null,
        data: {
          runId: '00000000-0000-4000-8000-000000000001',
          nextCursor: null,
          items: [
            {
              itemKey: 'a'.repeat(64),
              sourcePlatform: '1688',
              externalOfferId: '607635921546',
              variantKey: '',
              rank: 1,
              score: 80,
              grade: 'A',
              baselineAction: 'order',
              reasonCodes: ['margin_positive'],
              riskCodes: [],
              displayName: '유아 우산',
              keyword: '유아 우산',
              isNewKeyword: false,
              imageUrl: null,
              sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
              overseasPriceCny: 8,
              overseasPriceKrw: null,
              salePriceKrw: null,
              supplierName: '우산 공장',
              monthlySales: null,
              repurchaseRate: null,
              tradeScore: null,
              minOrderQuantity: null,
              estimatedMarginRate: null,
              estimatedProfitKrw: null,
              shippingLabel: null,
              rating: null,
              tags: [],
              sourceKeywords: ['유아 우산'],
              offerObservationIds: [],
              scoreComponents: { margin: 80 },
              evidenceObservationIds: [],
              coupang: null,
              interest: null,
              contributingSources: ['supply_1688_new'],
            },
          ],
        },
      })),
    };
    const service = new SourcingEntryRecommendationService(recommendations as never);

    const result = await service.getRecommendations({
      organizationId: '00000000-0000-4000-8000-000000000010',
      limit: 50,
    });

    expect(recommendations.latest).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'entry' }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'a'.repeat(64),
        externalOfferId: '607635921546',
        title: '유아 우산',
      }),
    ]);
  });
});
