/**
 * Channel listing-option pricing as it was recorded — nothing is assumed.
 *
 * A cost nobody recorded is unavailable (`null`), not zero (ADR-0006). A unit
 * cost exists when the option records a KRW cost override, or when every
 * mapped Sellpia component records a purchase price. There is no currency
 * conversion: without a recorded KRW price there is no KRW cost.
 */
export interface ListingOptionPricingInput {
  costPriceOverride: number | null;
  /** Prisma `Decimal`, a number, or nothing recorded. */
  commissionRate: unknown;
  otherCost: number | null;
  inventoryComponents: ReadonlyArray<{ quantity: number; purchasePrice: number | null }>;
}

export interface ResolvedPricing {
  /** KRW cost of one sold unit. */
  unitCost: number | null;
  /** Commission as a fraction of line revenue. */
  commissionRate: number | null;
  /** KRW other cost of one sold unit. */
  otherCost: number | null;
}

export function resolvePricing({ option }: { option: ListingOptionPricingInput }): ResolvedPricing {
  return {
    unitCost: resolveUnitCost(option),
    commissionRate: resolveRate(option.commissionRate),
    otherCost: option.otherCost,
  };
}

function resolveUnitCost(option: ListingOptionPricingInput): number | null {
  if (option.costPriceOverride !== null) return option.costPriceOverride;
  if (option.inventoryComponents.length === 0) return null;
  let unitCost = 0;
  for (const component of option.inventoryComponents) {
    if (component.purchasePrice === null) return null;
    unitCost += component.purchasePrice * component.quantity;
  }
  return unitCost;
}

function resolveRate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const rate = Number(value);
  return Number.isFinite(rate) ? rate : null;
}
