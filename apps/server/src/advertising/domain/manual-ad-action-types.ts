/**
 * Ad actions the operator applies by hand in the Coupang ad center (KID-138
 * decision A, 2026-09-17). Approving one records the operator's confirmation
 * that the proposal is right and prepares no `advertising.ad_action` run
 * (KID-386); the operator makes the change in the ad center and closes the
 * proposal by rejecting it.
 *
 * Why: the old executor could not locate these targets in the ad center. The
 * campaign list is a div grid with campaign-level switches only, so matching
 * rows by text could hit the wrong row.
 *
 * A new executor for one of these types is added by removing its type here and
 * adding it to `AD_ACTION_EXECUTABLE_TYPES`. Then revisit what assumes an
 * approved keyword pause is applied by hand: the keyword tab's proposal states
 * and messages (`apps/web/src/app/(advertising)/ad-ops/lib/keyword-pause-proposal.ts`).
 */
export const MANUAL_AD_ACTION_TYPES = [
  'pause_keyword',
  'change_bid',
  'change_daily_budget',
] as const;

export function isManualAdActionType(actionType: string): boolean {
  return (MANUAL_AD_ACTION_TYPES as readonly string[]).includes(actionType);
}
