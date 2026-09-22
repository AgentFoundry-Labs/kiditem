import { parseProductAbcDateToKstCalendarDate } from '@kiditem/shared/product-abc';

/** Wing writes `2026-04-01 11:32:06`; the shared parser reads the ISO `T` form. */
const WING_CREATED_ON = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/**
 * The KST calendar date a listing was registered on Wing, or `null` when
 * nothing records it.
 *
 * Wing's own `createdOn`, which the catalog's inventory-list stage stores in
 * the listing's raw JSON as a KST timestamp without a zone, wins. A listing
 * KidItem registered carries its registration provenance in `salesProductId`
 * (KID-310), and KidItem creates its catalog row once Wing confirms the
 * registration, so without a readable `createdOn` its `createdAt` gives the
 * date. A registration that claims a row a catalog import created earlier
 * keeps that import's `createdAt`, which is still no earlier than the listing
 * existed on Wing.
 */
export function wingListingRegistrationDate(listing: Readonly<{
  createdOn: string | null;
  salesProductId: string | null;
  createdAt: Date;
}>): string | null {
  const observed = parseProductAbcDateToKstCalendarDate(
    listing.createdOn?.replace(WING_CREATED_ON, '$1T$2') ?? null,
    { allowNaiveKstTimestamp: true },
  );
  if (observed || !listing.salesProductId) return observed;
  return parseProductAbcDateToKstCalendarDate(listing.createdAt.toISOString());
}
