import { parseProductAbcDateToKstCalendarDate } from '@kiditem/shared/product-abc';

/** Wing writes `2026-04-01 11:32:06`; the shared parser reads the ISO `T` form. */
const WING_CREATED_ON = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/**
 * The KST calendar date Wing registered a listing, read from the `createdOn`
 * the catalog's inventory-list stage stores in the listing's raw JSON, or
 * `null` when there is none or it does not parse. Wing writes a KST timestamp
 * without a zone.
 */
export function wingListingRegistrationDate(createdOn: string | null): string | null {
  return parseProductAbcDateToKstCalendarDate(
    createdOn?.replace(WING_CREATED_ON, '$1T$2') ?? null,
    { allowNaiveKstTimestamp: true },
  );
}
