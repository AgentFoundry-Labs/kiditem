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
// 세 확장을 kiditem-os 하나로 합치면서 도메인마다 있던 collection-session /
// interactive-tabs 사본이 정본 하나로 합쳐졌다.
const expectedOwnerFiles = [
  'extensions/kiditem-os/background/collection-session.js',
  'extensions/kiditem-os/background/interactive-tabs.js',
  'extensions/kiditem-os/background/coupang/collection-window.js',
];
const expectedLegacyFiles = [
  'extensions/kiditem-os/background/service-worker.js',
  'extensions/kiditem-os/background/coupang/worker.js',
  'extensions/kiditem-os/background/coupang/coupang-catalog-import.js',
  'extensions/kiditem-os/background/orders/worker.js',
  'extensions/kiditem-os/background/sourcing/worker.js',
  'extensions/kiditem-os/background/sourcing/1688-trend-collector.js',
  'extensions/kiditem-os/background/sourcing/live-commerce-collector.js',
  'apps/web/src/components/readiness/useReadinessCollection.ts',
  'apps/web/src/app/(analytics)/dashboard/page.tsx',
];
const automaticFocusSafeFiles = [
  'extensions/kiditem-os/background/orders/sellpia-inventory.js',
  'extensions/kiditem-os/background/orders/sellpia-manual-match.js',
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

test('new automatic collectors contain no focus-changing primitives', () => {
  for (const relativePath of automaticFocusSafeFiles) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    assert.equal(countFocusTokens(source), 0, relativePath);
  }
});
