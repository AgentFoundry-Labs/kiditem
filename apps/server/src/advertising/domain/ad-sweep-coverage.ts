/** The channel whose accounts the Coupang campaign sweep publishes target-day advertising for. */
export const AD_SWEEP_CHANNEL = 'coupang';
/** The account status the campaign sweep collects for. */
export const AD_SWEEP_ACCOUNT_STATUS = 'active';

/**
 * Whether the campaign sweep covers a channel account: an active Coupang
 * account. No target-day row can exist for a listing sold on any other
 * account. The one statement of the rule `advertisingApplies` and the ledger's
 * active-account filter apply.
 */
export function adSweepCoversChannelAccount(
  account: Readonly<{ channel: string; status: string }>,
): boolean {
  return account.channel === AD_SWEEP_CHANNEL && account.status === AD_SWEEP_ACCOUNT_STATUS;
}

/**
 * Whether advertising is an input to one sale key's profit — a listing, or a
 * channel grouping of listings. Measured spend for the key always applies,
 * whatever account the sold lines sit on; otherwise advertising applies when
 * the organization advertises and the key sells on an account the sweep
 * covers. Where it does not apply, advertising is Not applied (0), never an
 * unmeasured cost.
 */
export function advertisingAppliesToSale(
  input: Readonly<{
    organizationAdvertises: boolean;
    sweepCoversAccount: boolean;
    hasMeasuredSpend: boolean;
  }>,
): boolean {
  return input.hasMeasuredSpend || (input.organizationAdvertises && input.sweepCoversAccount);
}
