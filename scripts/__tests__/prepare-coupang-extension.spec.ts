import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizeKiditemOrigin,
  patchManifest,
  patchExtensionRuntimeFiles,
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

  it('patches runtime web and API origins in the staging copy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiditem-coupang-extension-'));
    try {
      for (const relativeDir of ['background', 'content', 'popup', 'utils']) {
        mkdirSync(join(dir, relativeDir), { recursive: true });
      }
      const files = [
        'background/service-worker.js',
        'content/ads-report.js',
        'popup/popup.html',
        'popup/popup.js',
        'utils/api.js',
      ];
      for (const file of files) {
        writeFileSync(
          join(dir, file),
          'web=http://localhost:3000 api=http://localhost:4000',
        );
      }

      patchExtensionRuntimeFiles(
        dir,
        'https://staging.example.test',
        'https://api.example.test',
      );

      for (const file of files) {
        expect(readFileSync(join(dir, file), 'utf8')).toBe(
          'web=https://staging.example.test api=https://api.example.test',
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
