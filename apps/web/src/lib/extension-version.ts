// Version floor for the one installed KidItem extension.
//
// WHY THIS IS A SINGLE SHARED CONSTANT
// ------------------------------------
// `order-collector`, `coupang-ads-scraper`, and `product-scraper` used to ship
// as three separate extensions on independent version lines (0.1.x, 1.2.x,
// 2.x). Each web feature gated on the version of the extension that carried
// it. Merging them into `kiditem-os` restarted versioning at `1.0.0`, which
// made every one of those legacy floors permanently unsatisfiable: a correctly
// installed `1.0.x` extension read as "outdated" and every collection button
// refused to run.
//
// The version can no longer say which features a build has — one version now
// covers all three domains. Feature detection belongs to the `ping` capability
// flags, which each gate already checks and which a pre-merge extension simply
// does not report. So the version check keeps only the job it can still do:
// reject an install from before the merge.
//
// Raise this only for a change that breaks the message contract itself.
// Shipping a new capability does NOT need a bump — add a capability flag.
export const KIDITEM_EXTENSION_MIN_VERSION = '1.0.0';

/**
 * Compare dot-separated version strings. Missing segments count as 0, so
 * `1.0` and `1.0.0` are equal. A missing/unparseable version fails closed.
 */
export function isKiditemExtensionVersionAtLeast(
  current: string | null | undefined,
  minimum: string = KIDITEM_EXTENSION_MIN_VERSION,
): boolean {
  if (!current) return false;
  const currentParts = current.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const size = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < size; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}
