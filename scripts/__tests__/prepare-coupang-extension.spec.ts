import { describe, expect, it } from 'vitest';
import {
  normalizeKiditemOrigin,
  patchManifest,
} from '../prepare-coupang-extension.mjs';

describe('prepare-coupang-extension', () => {
  it('normalizes the staging URL to an origin only', () => {
    expect(normalizeKiditemOrigin('https://staging.example.test/thumbnails?x=1')).toBe(
      'https://staging.example.test',
    );
  });

  it('patches only the static extension allowlists with the provided origin', () => {
    const manifest = {
      externally_connectable: { matches: ['http://localhost:3000/*'] },
      host_permissions: ['https://wing.coupang.com/*', 'http://localhost:3000/*'],
      content_scripts: [
        {
          matches: ['http://localhost:3000/*'],
          js: ['content/host-bridge.js'],
        },
      ],
    };

    const patched = patchManifest(manifest, 'https://staging.example.test');

    expect(patched.externally_connectable.matches).toContain('https://staging.example.test/*');
    expect(patched.host_permissions).toContain('https://staging.example.test/*');
    expect(patched.content_scripts[0].matches).toContain('https://staging.example.test/*');
  });
});
