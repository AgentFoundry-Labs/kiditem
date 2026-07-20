import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const worker = await readFile(
  new URL('../../coupang-ads-scraper/background/service-worker.js', import.meta.url), 'utf8',
);
const form = await readFile(
  new URL('../../coupang-ads-scraper/content/wing-registration-fill.js', import.meta.url), 'utf8',
);

test('requires WING identity before form mutation and forwards verified evidence from worker', () => {
  assert.match(form, /verifyExpectedVendorId\(expectedVendorId\)/);
  assert.match(form, /wingVendorId: accountIdentity\.vendorId/);
  assert.match(worker, /evidence: fill\.evidence/);
});
