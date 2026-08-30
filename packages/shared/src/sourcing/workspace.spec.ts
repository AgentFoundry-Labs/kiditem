import { describe, expect, it } from 'vitest';
import {
  SourcingCoupangObservationCommandSchema,
  SourcingKeywordPreferenceCommandSchema,
  SourcingKeywordPreferenceSchema,
  SourcingReadEnvelopeSchema,
  SourcingRecommendationItemSchema,
  SourcingReviewSelectionCommandSchema,
} from './workspace';

describe('sourcing workspace contracts', () => {
  it('keeps unavailable distinct from a successful empty result', () => {
    expect(() =>
      SourcingReadEnvelopeSchema.parse({
        status: 'unavailable',
        generatedAt: '2026-08-08T00:00:00.000Z',
        lastSuccessfulAt: null,
        freshUntil: null,
        operationId: null,
        data: [],
        warnings: [],
        error: {
          code: 'SOURCE_DISABLED',
          retryable: false,
          message: 'disabled',
        },
      }),
    ).toThrow();

    expect(
      SourcingReadEnvelopeSchema.parse({
        status: 'ready',
        generatedAt: '2026-08-08T00:00:00.000Z',
        lastSuccessfulAt: '2026-08-08T00:00:00.000Z',
        freshUntil: '2026-08-08T01:00:00.000Z',
        operationId: null,
        data: [],
        warnings: [],
        error: null,
      }).status,
    ).toBe('ready');
  });

  it('requires stable offer identity and a path-owned optimistic selection version', () => {
    expect(() =>
      SourcingRecommendationItemSchema.parse({
        itemKey: 'array-index-0',
        sourcePlatform: '1688',
        externalOfferId: '',
        variantKey: '',
        rank: 1,
        score: 90,
        grade: 'A',
        baselineAction: 'order',
        reasonCodes: [],
        riskCodes: [],
      }),
    ).toThrow();

    expect(() =>
      SourcingReviewSelectionCommandSchema.parse({
        workspaceKey: 'entry',
        recommendationRunId: '11111111-1111-4111-8111-111111111111',
        state: 'selected',
        expectedVersion: 0,
        itemKey: 'a'.repeat(64),
      }),
    ).toThrow();
  });

  it('accepts a fully typed recommendation presenter without a raw snapshot escape hatch', () => {
    const parsed = SourcingRecommendationItemSchema.parse({
        itemKey: 'a'.repeat(64),
        sourcePlatform: '1688',
        externalOfferId: '607635921546',
        variantKey: 'color=pink',
        rank: 1,
        score: 84,
        grade: 'A',
        baselineAction: 'order',
        reasonCodes: ['margin_positive'],
        riskCodes: [],
        displayName: '유아 우산',
        keyword: '유아 우산',
        isNewKeyword: false,
        imageUrl: 'https://example.test/item.jpg',
        sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
        overseasPriceCny: 12.5,
        overseasPriceKrw: null,
        salePriceKrw: 15900,
        supplierName: '이우 우산 공장',
        monthlySales: null,
        repurchaseRate: null,
        tradeScore: null,
        minOrderQuantity: 2,
        estimatedMarginRate: null,
        estimatedProfitKrw: null,
        shippingLabel: null,
        rating: null,
        tags: ['우산'],
        sourceKeywords: ['유아 우산'],
        offerObservationIds: ['00000000-0000-4000-8000-000000000011'],
        evidenceObservationIds: ['00000000-0000-4000-8000-000000000012'],
        scoreComponents: { margin: 80 },
        coupang: {
          productId: 'coupang-product-1',
          itemId: 'coupang-item-1',
          vendorItemId: 'coupang-vendor-1',
          productName: '유아 우산',
          salePriceKrw: 15900,
          ratingCount: 20,
          ratingAverage: 4.8,
          viewsLast28d: 300,
          salesLast28d: 30,
        },
        interest: {
          tier: 'exact',
          keywords: ['유아 우산'],
          origins: ['saved'],
          matches: [{ keyword: '유아 우산', tier: 'exact' }],
        },
        contributingSources: ['supply_1688_new'],
      });
    expect(parsed).toMatchObject({
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
      coupang: {
        productId: 'coupang-product-1',
        itemId: 'coupang-item-1',
        vendorItemId: 'coupang-vendor-1',
      },
    });
    expect(parsed).not.toHaveProperty('sourceSnapshot');
  });

  it('accepts only bounded, strict Wing observation batches', () => {
    expect(
      SourcingCoupangObservationCommandSchema.parse({
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        items: [
          {
            productId: '123',
            itemId: null,
            vendorItemId: '456',
            productName: '유아 우산',
            sourceKeyword: '우산',
            salePriceKrw: 12000,
            ratingCount: 10,
            ratingAverage: 4.5,
            viewsLast28d: 100,
            salesLast28d: 20,
            capturedAt: '2026-08-10T00:00:00.000Z',
          },
        ],
      }),
    ).toMatchObject({ items: [{ productId: '123' }] });

    expect(() =>
      SourcingCoupangObservationCommandSchema.parse({
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
        items: [
          {
            productId: '123',
            itemId: null,
            vendorItemId: null,
            productName: '유아 우산',
            sourceKeyword: '우산',
            salePriceKrw: null,
            ratingCount: null,
            ratingAverage: null,
            viewsLast28d: null,
            salesLast28d: null,
            capturedAt: '2026-08-10T00:00:00.000Z',
            untrusted: true,
          },
        ],
      }),
    ).toThrow();
  });

  it('keeps keyword preference updates keyed and compare-and-swap protected', () => {
    expect(
      SourcingKeywordPreferenceCommandSchema.parse({
        excluded: true,
        expectedVersion: 0,
      }),
    ).toEqual({ excluded: true, expectedVersion: 0 });
    expect(() =>
      SourcingKeywordPreferenceCommandSchema.parse({
        excluded: true,
        expectedVersion: 0,
        keyword: 'body identity is rejected',
      }),
    ).toThrow();
    expect(
      SourcingKeywordPreferenceSchema.parse({
        keyword: '유아 우산',
        excluded: true,
        version: 1,
        updatedAt: '2026-08-10T00:00:00.000Z',
      }),
    ).toMatchObject({ keyword: '유아 우산', excluded: true });
  });
});
