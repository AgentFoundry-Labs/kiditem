export type CoupangAccountIdentity = {
  vendorId: string | null;
  externalAccountId: string | null;
};

/**
 * Coupang's Vendor ID is the provider identity. externalAccountId remains a
 * compatibility fallback for older account rows that predate vendorId.
 */
export function resolveCoupangVendorId(
  account: CoupangAccountIdentity,
): string | null {
  return normalized(account.vendorId) ?? normalized(account.externalAccountId);
}

function normalized(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
