import { describe, expect, it } from 'vitest';
import {
  canStartBackendCoupangImageSyncFallback,
  canUseBackendCoupangImageSyncFallback,
} from './useCoupangImageSync';

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

  it('allows non-local browser origins only when server capability is enabled', () => {
    expect(canStartBackendCoupangImageSyncFallback(null, 'staging.example.com')).toBe(false);
    expect(canStartBackendCoupangImageSyncFallback({
      extensionRows: { source: 'extension', enabled: true },
      serverScraper: { source: 'server_scraper', enabled: false },
      preferredSource: 'extension',
    }, 'staging.example.com')).toBe(false);
    expect(canStartBackendCoupangImageSyncFallback({
      extensionRows: { source: 'extension', enabled: true },
      serverScraper: { source: 'server_scraper', enabled: true },
      preferredSource: 'server_scraper',
    }, 'staging.example.com')).toBe(true);
    expect(canStartBackendCoupangImageSyncFallback({
      extensionRows: { source: 'extension', enabled: true },
      serverScraper: { source: 'server_scraper', enabled: false },
      preferredSource: 'extension',
    }, 'localhost')).toBe(false);
  });
});
