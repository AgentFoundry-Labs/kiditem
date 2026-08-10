import { describe, expect, it } from 'vitest';
import { evaluateValidationEconomics } from './sourcing-validation-policy';

describe('evaluateValidationEconomics', () => {
  it('keeps landed cost and margin null when required economics are missing', () => {
    expect(evaluateValidationEconomics({
      offerPriceCny: 12.5,
      exchangeRate: null,
      internationalShippingKrw: null,
      marketplaceFeeBps: null,
      targetSalePriceKrw: 29_900,
    })).toEqual({
      status: 'blocked',
      landedCostKrw: null,
      expectedMarginBps: null,
      missingCodes: ['exchange_rate', 'international_shipping', 'marketplace_fee'],
    });
  });

  it('calculates only when every explicit input is usable', () => {
    expect(evaluateValidationEconomics({
      offerPriceCny: 12.5,
      exchangeRate: 200,
      internationalShippingKrw: 1_000,
      marketplaceFeeBps: 1_000,
      targetSalePriceKrw: 10_000,
    })).toEqual({
      status: 'ready_for_review',
      landedCostKrw: 3_500,
      expectedMarginBps: 5_500,
      missingCodes: [],
    });
  });
});
