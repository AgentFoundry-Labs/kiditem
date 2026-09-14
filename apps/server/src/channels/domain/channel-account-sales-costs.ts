/**
 * Which per-sale cost components a channel account's sales carry (KID-114).
 *
 * The rule is decided once, by channel account, so every profit consumer
 * applies the same answer:
 *
 * - A Rocket direct-purchase account (`channel === 'rocket'`) sells to Coupang,
 *   which buys the goods outright, so no sales commission applies. Its other
 *   per-sale cost is treated as not applied too, but only as an unconfirmed
 *   assumption: contract deductions (incentives, inbound logistics) may exist,
 *   and profit reads high by their amount until KID-116 confirms them.
 * - Every other account carries both components. No measured source exists
 *   for them yet, so a consumer that needs them has an unknown cost and must
 *   not compute a margin from a value nobody set.
 *
 * Purchase cost is not decided here: it is the option recipe priced at the
 * Sellpia purchase price, and an unknown purchase cost stays unknown.
 */
export type ChannelAccountSalesCosts = Readonly<{
  salesCommissionApplies: boolean;
  otherCostApplies: boolean;
}>;

export const ROCKET_DIRECT_PURCHASE_CHANNEL = 'rocket';

export function channelAccountSalesCosts(
  account: Readonly<{ channel: string }>,
): ChannelAccountSalesCosts {
  const directPurchase = account.channel === ROCKET_DIRECT_PURCHASE_CHANNEL;
  return {
    salesCommissionApplies: !directPurchase,
    otherCostApplies: !directPurchase,
  };
}
