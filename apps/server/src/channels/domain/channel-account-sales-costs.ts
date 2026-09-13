/**
 * Which per-sale cost components a channel account's sales carry (KID-114).
 *
 * The rule is decided once, by channel account, so every profit consumer
 * applies the same answer:
 *
 * - A Rocket direct-purchase account (`channel === 'rocket'`) sells to Coupang,
 *   which buys the goods outright. Neither a sales commission nor an other
 *   per-sale cost applies; both are 0 by this rule, not by a guessed input.
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
