/** A listing has one source product only when every option's recipe agrees. */
export function listingProductIdFromRecipes(
  options: readonly {
    inventoryComponents: readonly { masterProductId: string }[];
  }[],
): string | null {
  if (options.length === 0) return null;
  const ids = new Set<string>();
  for (const option of options) {
    if (option.inventoryComponents.length === 0) return null;
    for (const component of option.inventoryComponents) ids.add(component.masterProductId);
  }
  return ids.size === 1 ? [...ids][0]! : null;
}

export function withListingProductSummary<T extends {
  options: readonly { inventoryComponents: readonly { masterProductId: string }[] }[];
}>(listing: T): T & { masterProductId: string | null } {
  return { ...listing, masterProductId: listingProductIdFromRecipes(listing.options) };
}
