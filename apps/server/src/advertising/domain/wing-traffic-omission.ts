import { parseProductAbcDateToKstCalendarDate } from '@kiditem/shared/product-abc';

/** Wing writes `2026-04-01 11:32:06`; the shared parser reads the ISO `T` form. */
const WING_CREATED_ON = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/**
 * The first date on which a listing Wing's traffic report left out had zero
 * traffic, or `null` when leaving it out measures nothing.
 *
 * The report's rows add up to the account's totals, so a listing missing from
 * a confirmed date had no views, orders or revenue that day. Rows are matched
 * to listings while the collection runs, so this holds only for a listing the
 * catalog held before the collection started, and only from the day Wing
 * registered it: every confirmed date on or after the returned date counts.
 * Wing's `createdOn` is a KST timestamp without a zone; a listing without a
 * readable one stays unmeasured.
 */
export function omittedListingFirstZeroTrafficDate(input: Readonly<{
  listingCreatedAt: Date;
  wingCreatedOn: string | null;
  collectionStartedAt: Date;
}>): string | null {
  if (input.listingCreatedAt >= input.collectionStartedAt) return null;
  return parseProductAbcDateToKstCalendarDate(
    input.wingCreatedOn?.replace(WING_CREATED_ON, '$1T$2') ?? null,
    { allowNaiveKstTimestamp: true },
  );
}
