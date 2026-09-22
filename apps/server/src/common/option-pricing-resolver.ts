import { channelAccountSalesCosts } from '../channels/domain/account/channel-account-sales-costs';

/**
 * The cost of one sold order line, as the owners record it — nothing is
 * assumed (KID-114, ADR-0006).
 *
 * - Purchase cost is the listing option's confirmed recipe priced at each
 *   Sellpia SKU's purchase price. An option cost override is not an input.
 * - Whether a sales commission and an other per-sale cost apply is decided by
 *   the order's channel account through `channelAccountSalesCosts`: a
 *   component that does not apply is Not applied (0); one that applies has no
 *   measured source yet, so its value is unknown (`null`). Option commission
 *   and other-cost columns are not inputs.
 */
export interface ListingOptionCostInput {
  inventoryComponents: ReadonlyArray<{ quantity: number; purchasePrice: number | null }>;
}

/** KRW purchase cost of one sold unit, or `null` without a recipe or with an unpriced component. */
export function resolveUnitCost(option: ListingOptionCostInput): number | null {
  if (option.inventoryComponents.length === 0) return null;
  let unitCost = 0;
  for (const component of option.inventoryComponents) {
    if (component.purchasePrice === null) return null;
    unitCost += component.purchasePrice * component.quantity;
  }
  return unitCost;
}

/** The per-sale cost components of an order's lines, by its channel account. */
export interface OrderLineSalesCosts {
  commissionApplies: boolean;
  otherCostApplies: boolean;
  /** 0 when the commission does not apply; `null` when it applies without a source. */
  commission: 0 | null;
  /** 0 when the other cost does not apply; `null` when it applies without a source. */
  otherCost: 0 | null;
}

/**
 * The sales commission and other per-sale cost of an order's lines. An order
 * whose channel account is unknown is treated like any account the rule
 * applies both components to: its values have no source.
 */
export function resolveOrderLineSalesCosts(
  orderAccount: Readonly<{ channel: string }> | null,
): OrderLineSalesCosts {
  const costs = orderAccount
    ? channelAccountSalesCosts(orderAccount)
    : { salesCommissionApplies: true, otherCostApplies: true };
  return {
    commissionApplies: costs.salesCommissionApplies,
    otherCostApplies: costs.otherCostApplies,
    commission: costs.salesCommissionApplies ? null : 0,
    otherCost: costs.otherCostApplies ? null : 0,
  };
}
