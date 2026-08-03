export type CanonicalInventoryListing = Readonly<{
  listingId: string;
  optionSkuIds: readonly (readonly string[])[];
}>;

export type CanonicalInventoryPlan = Readonly<{
  canonicalSkuIds: string[];
  listingOwners: ReadonlyArray<{ listingId: string; skuId: string }>;
  unresolvedListingIds: string[];
}>;

export function planCanonicalInventoryLinks(
  input: Readonly<{
    skuIds: readonly string[];
    listings: readonly CanonicalInventoryListing[];
  }>,
): CanonicalInventoryPlan {
  const canonicalSkuIds = [...new Set(input.skuIds)]
    .sort((left, right) => left.localeCompare(right));
  const canonicalSkuIdSet = new Set(canonicalSkuIds);
  const listingOwners: Array<{ listingId: string; skuId: string }> = [];
  const unresolvedListingIds: string[] = [];

  for (const listing of input.listings) {
    const hasUnmatchedOption = listing.optionSkuIds.length === 0
      || listing.optionSkuIds.some((skuIds) => skuIds.length === 0);
    const distinctSkuIds = new Set(listing.optionSkuIds.flat());
    if (hasUnmatchedOption || distinctSkuIds.size !== 1) {
      unresolvedListingIds.push(listing.listingId);
      continue;
    }
    const skuId = [...distinctSkuIds][0]!;
    if (!canonicalSkuIdSet.has(skuId)) {
      unresolvedListingIds.push(listing.listingId);
      continue;
    }
    listingOwners.push({ listingId: listing.listingId, skuId });
  }

  return {
    canonicalSkuIds,
    listingOwners: listingOwners.sort((left, right) =>
      left.listingId.localeCompare(right.listingId)),
    unresolvedListingIds: unresolvedListingIds.sort((left, right) =>
      left.localeCompare(right)),
  };
}
