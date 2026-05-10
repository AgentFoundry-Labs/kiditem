import { describe, expect, it } from 'vitest';
import {
  CoupangImageSyncCapabilitiesSchema,
  CoupangImageSyncRowSchema,
} from './thumbnails';

describe('Coupang image sync shared contracts', () => {
  it('accepts extension and server scraper rows through the same row shape', () => {
    expect(CoupangImageSyncRowSchema.parse({
      inventoryId: '123',
      legacyCode: 'LEG-1',
      name: 'Wing item',
      url: 'https://thumbnail.coupangcdn.com/image.jpg',
      source: 'extension',
    })).toEqual({
      inventoryId: '123',
      legacyCode: 'LEG-1',
      name: 'Wing item',
      url: 'https://thumbnail.coupangcdn.com/image.jpg',
      source: 'extension',
    });

    expect(CoupangImageSyncRowSchema.parse({
      inventoryId: '456',
      name: 'Server scraped item',
      url: 'https://thumbnail.coupangcdn.com/server.jpg',
      source: 'server_scraper',
    }).source).toBe('server_scraper');
  });

  it('describes whether the server scraper capability is enabled', () => {
    const parsed = CoupangImageSyncCapabilitiesSchema.parse({
      extensionRows: { source: 'extension', enabled: true },
      serverScraper: {
        source: 'server_scraper',
        enabled: false,
        reason: 'disabled outside local/dev',
      },
      preferredSource: 'extension',
    });

    expect(parsed.serverScraper.enabled).toBe(false);
    expect(parsed.preferredSource).toBe('extension');
  });
});
