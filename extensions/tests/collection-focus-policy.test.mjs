import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = path.join(repoRoot, 'extensions/collection-focus-policy.json');
const focusTokens = [
  'active: true',
  'activateTab(',
  'bringMallTabToFront(',
  'focused: true',
  'window.open(',
];
const expectedOwnerFiles = [
  'extensions/coupang-ads-scraper/background/collection-session.js',
  'extensions/coupang-ads-scraper/background/collection-window.js',
  'extensions/coupang-ads-scraper/background/interactive-tabs.js',
  'extensions/product-scraper/collection-session.js',
  'extensions/product-scraper/interactive-tabs.js',
  'extensions/order-collector/background/collection-session.js',
  'extensions/order-collector/background/interactive-tabs.js',
];
const expectedLegacyFiles = [
  'extensions/coupang-ads-scraper/background/service-worker.js',
  'extensions/coupang-ads-scraper/background/coupang-catalog-import.js',
  'extensions/product-scraper/1688-trend-collector.js',
  'extensions/product-scraper/live-commerce-collector.js',
  'extensions/product-scraper/background.js',
  'extensions/order-collector/background/service-worker.js',
  'apps/web/src/components/readiness/useReadinessCollection.ts',
  'apps/web/src/app/(advertising)/ad-ops/hooks/useAdSync.ts',
  'apps/web/src/app/(analytics)/dashboard/page.tsx',
];

function countFocusTokens(source) {
  return focusTokens.reduce(
    (total, token) => total + source.split(token).length - 1,
    0,
  );
}

test('focus policy names the approved focus-preserving helper owners', () => {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  assert.deepEqual(policy.focusOwnerFiles, expectedOwnerFiles);
});

test('legacy automatic collector focus counts never increase', () => {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  assert.deepEqual(Object.keys(policy.legacyFocusCounts), expectedLegacyFiles);

  for (const relativePath of expectedLegacyFiles) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    const actual = countFocusTokens(source);
    const limit = policy.legacyFocusCounts[relativePath];
    assert.ok(
      actual <= limit,
      `${relativePath} has ${actual} focus tokens, exceeding its limit of ${limit}`,
    );
  }
});
