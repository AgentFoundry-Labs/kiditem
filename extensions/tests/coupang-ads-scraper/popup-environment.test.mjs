import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const popup = await readFile(
  new URL('../../coupang-ads-scraper/popup/popup.js', import.meta.url),
  'utf8',
);
const html = await readFile(
  new URL('../../coupang-ads-scraper/popup/popup.html', import.meta.url),
  'utf8',
);

test('requires an environment selector and proxies API calls through the worker', () => {
  assert.match(html, /id=["']environmentSelect["']/);
  assert.match(popup, /getConnectedKidItemEnvironments/);
  assert.match(popup, /kiditemApiRequest/);
  assert.doesNotMatch(popup, /kiditem_auth_token/);
  assert.doesNotMatch(popup, /fetch\s*\(/);
  assert.doesNotMatch(popup, /const API_URL/);
});

test('does not persist a global environment fallback', () => {
  assert.doesNotMatch(popup, /storage\.local\.set\([\s\S]{0,200}environment/i);
});
