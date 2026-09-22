import { wingListingRegistrationDate } from '../../channels/domain/registration/wing-listing-registration';

/**
 * The first date on which a listing Wing's traffic report left out had zero
 * traffic, or `null` when leaving it out measures nothing.
 *
 * The report's rows add up to the account's totals, so a listing missing from
 * a confirmed date had no views, orders or revenue that day. Rows are matched
 * to listings while the collection runs, so this holds only for a listing the
 * catalog held before the collection started, and only from the day it was
 * registered on Wing (`wingListingRegistrationDate`): every confirmed date on
 * or after the returned date counts. A listing without a registration date
 * stays unmeasured.
 */
export function omittedListingFirstZeroTrafficDate(input: Readonly<{
  listing: Readonly<{ createdAt: Date; createdOn: string | null; sourceCandidateId: string | null }>;
  collectionStartedAt: Date;
}>): string | null {
  if (input.listing.createdAt >= input.collectionStartedAt) return null;
  return wingListingRegistrationDate(input.listing);
}
