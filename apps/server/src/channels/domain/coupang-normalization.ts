/**
 * Coupang raw status -> internal canonical order status.
 * `NONE_TRACKING` means shipment without an invoice and is treated as departure.
 */
export function normalizeCoupangOrderStatus(raw: string | null | undefined): string | undefined {
  if (raw === 'NONE_TRACKING') return 'DEPARTURE';
  return raw ?? undefined;
}

/**
 * Coupang seller_product `statusName` -> internal ChannelListing `status`.
 */
export function normalizeCoupangProductStatus(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  switch (raw) {
    case 'APPROVED':
    case 'ON_SALE':
      return 'active';
    case 'SUSPEND':
      return 'paused';
    case 'DELETED':
      return 'deleted';
    case 'UNDER_EXAMINATION':
    case 'REJECTED':
      return 'draft';
    default:
      return raw.toLowerCase();
  }
}

/**
 * Coupang KR market timestamp formatter. Converts a UTC instant to a KST
 * wall-clock timestamp with an explicit `+09:00` offset.
 */
export function formatKstIso(d: Date): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
}
