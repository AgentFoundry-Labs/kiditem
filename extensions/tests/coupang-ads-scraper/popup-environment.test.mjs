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

test('manual popup collection enters an explicit source owner for each supported page', () => {
  assert.match(popup, /collectAdvertisingWingTrafficFromPopup/);
  assert.match(popup, /collectAdvertisingWingItemwinnerFromPopup/);
  assert.match(popup, /collectAdvertisingCampaignsFromPopup/);
  assert.doesNotMatch(popup, /action:\s*['"]manualSync['"]/);
});

test('popup itemwinner admission uses the current Wing route only', () => {
  assert.match(popup, /WING_ITEMWINNER_PATH\s*=\s*['"]\/tenants\/seller-price-management['"]/);
  assert.doesNotMatch(popup, /item\[-_\]\?winner\|price/);
});

test('popup status uses the retained read endpoint, never the retired generic writer', () => {
  assert.match(popup, /popupFetch\(['"]\/api\/ads\/extension\/status['"],\s*\{\},\s*request\)/);
  assert.doesNotMatch(popup, /popupFetch\(['"]\/api\/ads\/extension\/sync['"]\)/);
});
