import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const popup = await readFile(
  new URL('../../kiditem-os/popup/popup.js', import.meta.url),
  'utf8',
);
const html = await readFile(
  new URL('../../kiditem-os/popup/popup.html', import.meta.url),
  'utf8',
);

test('requires an environment selector and proxies API calls through the worker', () => {
  assert.match(html, /id=["']environmentSelect["']/);
  assert.match(popup, /getConnectedKidItemEnvironments/);
  assert.match(popup, /kiditemApiRequest/);
  assert.doesNotMatch(popup, /kiditem_auth_token/);
  assert.doesNotMatch(popup, /fetch\s*\(/);
  assert.doesNotMatch(popup, /const API_URL/);
  assert.match(popup, /office:\s*\{[^}]*http:\/\/kiditem-office/);
});

test('does not persist a global environment fallback', () => {
  assert.doesNotMatch(popup, /storage\.local\.set\([\s\S]{0,200}environment/i);
});

// Collections start from the screen that shows their data (KID-147). The popup
// keeps only sourcing capture of the current tab and its non-collection tools.
test('the popup starts no Coupang collection and keeps sourcing capture and its tools', () => {
  for (const retired of ['btnSync', 'btnMonthlySync', 'monthInput', 'monthlySyncProgress']) {
    assert.doesNotMatch(html, new RegExp(`id=["']${retired}["']`), retired);
    assert.doesNotMatch(popup, new RegExp(`['"]${retired}['"]`), retired);
  }
  assert.doesNotMatch(popup, /collectAdvertising|monthlyScrape|action:\s*['"]manualSync['"]/);
  for (const kept of ['sourcingBtnCollect', 'btnRunApproved', 'btnInventoryScrape', 'btnRegister', 'btnOpen']) {
    assert.match(html, new RegExp(`id=["']${kept}["']`), kept);
  }
});

// 광고 수집은 광고 보고서 실행(KID-371)으로 옮겨 갔다 — 광고센터 페이지는 승인된 액션만 실행한다.
test('the popup footer does not promise automatic ad collection on Wing or ad center pages', () => {
  assert.doesNotMatch(html, /자동 수집됩니다/);
  assert.match(html, /광고센터 페이지에서는 승인된 광고 액션만 실행합니다/);
});

test('popup status uses the retained read endpoint, never the retired generic writer', () => {
  assert.match(popup, /popupFetch\(['"]\/api\/ads\/extension\/status['"],\s*\{\},\s*request\)/);
  assert.doesNotMatch(popup, /popupFetch\(['"]\/api\/ads\/extension\/sync['"]\)/);
});
