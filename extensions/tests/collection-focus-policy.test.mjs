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
];
const expectedLegacyFiles = [
  'extensions/kiditem-os/background/service-worker.js',
  'extensions/kiditem-os/background/coupang/worker.js',
  'extensions/kiditem-os/background/orders/worker.js',
  'apps/web/src/components/readiness/useReadinessCollection.ts',
  'apps/web/src/app/(analytics)/dashboard/page.tsx',
];
const automaticFocusSafeFiles = [
  // 소싱 수집(KID-360)과 몰 관리자 목록(KID-381)은 새 런타임의 사이트가 백그라운드 탭으로만 연다.
  'extensions/src/sites/tab-page.ts',
];
// 운영자가 그 탭에서 할 일이 있을 때만 앞으로 가져오는 `TabPage.focus` 하나(KID-380 리뷰 MUST 1 — GS샵 SMS 인증, 운영자 조치로
// 남긴 탭). 수집 경로가 스스로 부르지 않는다: `waitForOperator` 앞과 `withFreshTab`의 OPERATOR_ACTION_REQUIRED에서만 부른다.
const operatorAttentionFocus = {
  'extensions/src/sites/tab-page.ts': 1,
};

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
    assert.equal(countFocusTokens(source), operatorAttentionFocus[relativePath] ?? 0, relativePath);
  }
});
