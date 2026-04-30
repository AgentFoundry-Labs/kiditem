// Listing-map matching helpers extracted from AdSyncService.
//
// Matching priority (invariant — see advertising/AGENTS.md):
//   1) Coupang vendorItemId → ChannelListingOption.externalOptionId →
//      {listingId, listingOptionId, optionId|null}
//   2) externalId → ChannelListing.externalId + platform='coupang' →
//      {listingId, listingOptionId:null, optionId:null}
//   3) 매칭 실패 → matchStatus='unmatched'

export type ScrapeMatchStatus =
  | 'matched'
  | 'matched_listing_only'
  | 'unmatched';

export interface ListingMap {
  // Option matches keep `listingOptionId` even when internal `optionId` is
  // null. Daily option-snapshot upsert needs the listing option id to land
  // facts before internal product matching is complete. Also carry the
  // listing's `externalId` so daily-snapshot rows can populate the
  // denormalized `externalId` column without an extra DB lookup.
  externalOptionIdMap: Map<
    string,
    {
      listingId: string;
      listingOptionId: string;
      optionId: string | null;
      externalId: string;
    }
  >;
  externalIdMap: Map<string, { listingId: string }>;
}

export interface ListingMatch {
  listingId: string | null;
  listingOptionId: string | null;
  optionId: string | null;
  // Canonical channel identifiers needed for daily-snapshot upsert.
  // `externalId` is `ChannelListing.externalId` (e.g. Coupang sellerProductId).
  // `externalOptionId` is `ChannelListingOption.externalOptionId` (e.g. vendorItemId).
  externalId: string | null;
  externalOptionId: string | null;
}

export function pickStringField(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

export function matchListingFromRow(
  row: Record<string, unknown>,
  map: ListingMap,
): ListingMatch {
  const providerOptionId = pickStringField(row, [
    'vendorItemId',
    'vendor_item_id',
    'itemId',
  ]);
  if (providerOptionId) {
    const hit = map.externalOptionIdMap.get(providerOptionId);
    if (hit) {
      return {
        listingId: hit.listingId,
        listingOptionId: hit.listingOptionId,
        optionId: hit.optionId,
        externalId: hit.externalId,
        externalOptionId: providerOptionId,
      };
    }
  }

  const externalId = pickStringField(row, [
    'externalId',
    'external_id',
    'productId',
    'coupangProductId',
  ]);
  if (externalId) {
    const hit = map.externalIdMap.get(externalId);
    if (hit) {
      return {
        listingId: hit.listingId,
        listingOptionId: null,
        optionId: null,
        externalId,
        externalOptionId: null,
      };
    }
  }

  return {
    listingId: null,
    listingOptionId: null,
    optionId: null,
    externalId: null,
    externalOptionId: null,
  };
}

export function matchStatusOf(match: ListingMatch): ScrapeMatchStatus {
  if (match.listingOptionId) return 'matched';
  if (match.listingId) return 'matched_listing_only';
  return 'unmatched';
}
