export interface ValidationEconomicsInput {
  offerPriceCny: number | null;
  exchangeRate: number | null;
  internationalShippingKrw: number | null;
  marketplaceFeeBps: number | null;
  targetSalePriceKrw: number | null;
}

export type ValidationEconomicsResult =
  | {
      status: 'blocked';
      landedCostKrw: null;
      expectedMarginBps: null;
      missingCodes: string[];
    }
  | {
      status: 'ready_for_review';
      landedCostKrw: number;
      expectedMarginBps: number;
      missingCodes: [];
    };

/**
 * Validation never fills an unknown commercial input with a fixture/default.
 * A caller must provide every value used in the derived economics result.
 */
export function evaluateValidationEconomics(
  input: ValidationEconomicsInput,
): ValidationEconomicsResult {
  const missingCodes = [
    input.offerPriceCny === null || input.offerPriceCny < 0 ? 'offer_price' : null,
    input.exchangeRate === null || input.exchangeRate <= 0 ? 'exchange_rate' : null,
    input.internationalShippingKrw === null || input.internationalShippingKrw < 0
      ? 'international_shipping'
      : null,
    input.marketplaceFeeBps === null
      || input.marketplaceFeeBps < 0
      || input.marketplaceFeeBps > 10_000
      ? 'marketplace_fee'
      : null,
    input.targetSalePriceKrw === null || input.targetSalePriceKrw <= 0
      ? 'target_sale_price'
      : null,
  ].filter((value): value is string => value !== null);

  if (missingCodes.length > 0) {
    return {
      status: 'blocked',
      landedCostKrw: null,
      expectedMarginBps: null,
      missingCodes,
    };
  }

  const complete = input as Record<keyof ValidationEconomicsInput, number>;
  const landedCostKrw = Math.round(
    complete.offerPriceCny * complete.exchangeRate + complete.internationalShippingKrw,
  );
  const marketplaceFeeKrw = Math.round(
    complete.targetSalePriceKrw * complete.marketplaceFeeBps / 10_000,
  );
  const expectedMarginBps = Math.round(
    (complete.targetSalePriceKrw - landedCostKrw - marketplaceFeeKrw)
      / complete.targetSalePriceKrw * 10_000,
  );
  return {
    status: 'ready_for_review',
    landedCostKrw,
    expectedMarginBps,
    missingCodes: [],
  };
}
