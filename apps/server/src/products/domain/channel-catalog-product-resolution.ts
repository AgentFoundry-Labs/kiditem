export type ExactProductTarget = Readonly<{ masterProductId: string }>;

export type ExactVariantTarget = Readonly<{
  masterProductId: string;
  productVariantId: string;
}>;

export function channelOriginProductCode(channelListingId: string): string {
  return `CP-${channelListingId}`;
}

export function channelOriginVariantCode(channelListingOptionId: string): string {
  return `CP-SKU-${channelListingOptionId}`;
}

export function normalizeExactBarcode(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^[0-9 -]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[ -]/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

export function selectUniqueMasterProduct(
  targets: readonly ExactProductTarget[],
): string | null {
  const ids = [...new Set(targets.map((target) => target.masterProductId))];
  return ids.length === 1 ? ids[0] : null;
}

export function selectUniqueProductVariant(
  masterProductId: string,
  targets: readonly ExactVariantTarget[],
): string | null {
  const ids = [...new Set(targets
    .filter((target) => target.masterProductId === masterProductId)
    .map((target) => target.productVariantId))];
  return ids.length === 1 ? ids[0] : null;
}
