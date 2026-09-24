import { describe, expect, it } from 'vitest';
import { resolveCoupangVendorId } from './coupang-account-identity';

describe('resolveCoupangVendorId', () => {
  it('prefers vendorId over a legacy external account alias', () => {
    expect(resolveCoupangVendorId({
      vendorId: ' vendor-primary ',
      externalAccountId: 'legacy-wing-alias',
    })).toBe('vendor-primary');
  });

  it('falls back to externalAccountId for legacy account rows', () => {
    expect(resolveCoupangVendorId({
      vendorId: null,
      externalAccountId: ' legacy-vendor ',
    })).toBe('legacy-vendor');
  });

  it('returns null when neither identity is usable', () => {
    expect(resolveCoupangVendorId({
      vendorId: ' ',
      externalAccountId: null,
    })).toBeNull();
  });
});
