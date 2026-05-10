import { describe, expect, it } from 'vitest';
import { canUseBackendCoupangImageSyncFallback } from './useCoupangImageSync';

describe('canUseBackendCoupangImageSyncFallback', () => {
  it('allows the backend scrape fallback only for local browser origins', () => {
    expect(canUseBackendCoupangImageSyncFallback('localhost')).toBe(true);
    expect(canUseBackendCoupangImageSyncFallback('127.0.0.1')).toBe(true);
    expect(canUseBackendCoupangImageSyncFallback('[::1]')).toBe(true);
    expect(canUseBackendCoupangImageSyncFallback('dev.localhost')).toBe(true);

    expect(canUseBackendCoupangImageSyncFallback('203.0.113.10')).toBe(false);
    expect(canUseBackendCoupangImageSyncFallback('staging.example.com')).toBe(false);
    expect(canUseBackendCoupangImageSyncFallback('kiditem.example.com')).toBe(false);
  });
});
