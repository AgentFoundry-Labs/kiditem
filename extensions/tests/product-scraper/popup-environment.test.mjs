import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const popupHtml = fs.readFileSync(
  path.resolve('extensions/product-scraper/popup.html'),
  'utf8',
);
const popupSource = fs.readFileSync(
  path.resolve('extensions/product-scraper/popup.js'),
  'utf8',
);

test('requires an environment selector instead of an editable API URL', () => {
  assert.match(popupHtml, /id="environmentSelect"/);
  assert.doesNotMatch(popupHtml, /id="apiUrl"/);
  assert.doesNotMatch(popupHtml, /API 설정/);
  assert.match(popupSource, /getConnectedKidItemEnvironments/);
  assert.match(popupSource, /environmentId/);
  assert.doesNotMatch(popupSource, /apiBase/);
  assert.doesNotMatch(popupSource, /chrome\.storage\.local\.set/);
});

test('does not persist a global environment fallback', () => {
  assert.doesNotMatch(popupSource, /lastEnvironment|storage.*environment/i);
  assert.match(popupSource, /connected\.length === 1/);
  assert.match(popupSource, /connected\.includes\(chosen\)/);
});
