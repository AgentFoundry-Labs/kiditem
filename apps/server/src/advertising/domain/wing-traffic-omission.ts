import { wingListingRegistrationDate } from '../../channels/domain/wing-listing-registration';

/**
 * The first date on which a listing Wing's traffic report left out had zero
 * traffic, or `null` when leaving it out measures nothing.
 *
 * The report's rows add up to the account's totals, so a listing missing from
 * a confirmed date had no views, orders or revenue that day. Rows are matched
 * to listings while the collection runs, so this holds only for a listing the
 * catalog held before the collection started, and only from the day Wing
 * registered it: every confirmed date on or after the returned date counts.
 * A listing without a readable registration date stays unmeasured.
 */
export function omittedListingFirstZeroTrafficDate(input: Readonly<{
  listingCreatedAt: Date;
  wingCreatedOn: string | null;
  collectionStartedAt: Date;
}>): string | null {
  if (input.listingCreatedAt >= input.collectionStartedAt) return null;
  return wingListingRegistrationDate(input.wingCreatedOn);
}
