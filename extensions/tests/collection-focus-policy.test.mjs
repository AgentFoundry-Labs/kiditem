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
  'extensions/kiditem-os/background/orders/worker.js',
  'apps/web/src/components/readiness/useReadinessCollection.ts',
  'apps/web/src/app/(analytics)/dashboard/page.tsx',
];
const automaticFocusSafeFiles = [
  'extensions/kiditem-os/background/orders/sellpia-inventory.js',
  'extensions/kiditem-os/background/orders/mall-admin-listings.js',
  'extensions/kiditem-os/background/orders/mall-admin-listings-source-owner.js',
  // 소싱 수집(KID-360)은 새 런타임의 사이트가 백그라운드 탭으로만 연다.
  'extensions/src/sites/tab-page.ts',
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
