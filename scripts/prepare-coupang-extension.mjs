#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSourceDir = join(repoRoot, 'extensions/coupang-ads-scraper');
const defaultOutputDir = join(repoRoot, '.secrets/extensions/coupang-ads-scraper-staging');
const localWebOrigin = 'http://localhost:3000';
const localApiOrigin = 'http://localhost:4000';
const runtimeFiles = [
  'background/service-worker.js',
  'content/ads-report.js',
  'popup/popup.html',
  'popup/popup.js',
  'utils/api.js',
];

export function normalizeKiditemOrigin(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) {
    throw new Error('STAGING_URL is required, for example STAGING_URL=https://staging.example.com');
  }

  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`STAGING_URL must be an http(s) URL, got ${url.protocol}`);
  }
  return url.origin;
}

export function patchManifest(manifest, origin) {
  const match = `${origin}/*`;
  const contentScripts = Array.isArray(manifest.content_scripts)
    ? manifest.content_scripts
    : [];
  const hasHostBridge = contentScripts.some((script) =>
    Array.isArray(script.js) && script.js.includes('content/host-bridge.js'),
  );
  if (!hasHostBridge) {
    throw new Error('content/host-bridge.js content script not found in manifest');
  }

  return {
    ...manifest,
    externally_connectable: {
      ...(manifest.externally_connectable ?? {}),
      matches: addUnique(manifest.externally_connectable?.matches, match),
    },
    host_permissions: addUnique(manifest.host_permissions, match),
    content_scripts: contentScripts.map((script) => {
      if (!Array.isArray(script.js) || !script.js.includes('content/host-bridge.js')) {
        return script;
      }
      return {
        ...script,
        matches: addUnique(script.matches, match),
      };
    }),
  };
}

export function prepareCoupangExtension({
  stagingUrl,
  apiUrl,
  sourceDir = defaultSourceDir,
  outputDir = defaultOutputDir,
} = {}) {
  const origin = normalizeKiditemOrigin(stagingUrl);
  const apiOrigin = normalizeKiditemOrigin(apiUrl ?? origin);
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(dirname(outputDir), { recursive: true });
  cpSync(sourceDir, outputDir, { recursive: true });

  const manifestPath = join(outputDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const patched = patchManifest(manifest, origin);
  writeFileSync(manifestPath, `${JSON.stringify(patched, null, 2)}\n`);
  patchExtensionRuntimeFiles(outputDir, origin, apiOrigin);

  return { apiOrigin, origin, outputDir };
}

function addUnique(values, value) {
  return Array.from(new Set([...(Array.isArray(values) ? values : []), value]));
}

export function patchExtensionRuntimeFiles(outputDir, webOrigin, apiOrigin = webOrigin) {
  for (const relativePath of runtimeFiles) {
    const path = join(outputDir, relativePath);
    const content = readFileSync(path, 'utf8');
    const patched = content
      .replaceAll(localWebOrigin, webOrigin)
      .replaceAll(localApiOrigin, apiOrigin)
      .replaceAll('localhost:4000', new URL(apiOrigin).host)
      .replaceAll('localhost:3000', new URL(webOrigin).host);
    writeFileSync(path, patched);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = prepareCoupangExtension({
      stagingUrl: process.env.STAGING_URL,
      apiUrl: process.env.STAGING_API_URL,
      outputDir: process.env.EXTENSION_OUTPUT_DIR || defaultOutputDir,
    });
    console.log(`Prepared Coupang extension for ${result.origin}`);
    console.log(`Patched extension API origin to ${result.apiOrigin}`);
    console.log(`Load unpacked extension from: ${result.outputDir}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
