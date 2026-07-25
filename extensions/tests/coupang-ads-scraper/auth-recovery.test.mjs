import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const worker = await readFile(
  new URL('../../coupang-ads-scraper/background/service-worker.js', import.meta.url),
  'utf8',
);
const environmentContext = await readFile(
  new URL('../../coupang-ads-scraper/background/environment-context.js', import.meta.url),
  'utf8',
);

test('uses the shared environment auth context instead of a global token or API URL', () => {
  assert.match(worker, /KidItemEnvironmentContext\.create/);
  assert.match(worker, /environmentContext\.authedFetch\(environmentId/);
  assert.doesNotMatch(worker, /const API_URL/);
  assert.doesNotMatch(worker, /AUTH_TOKEN_KEY/);
  assert.doesNotMatch(worker, /KidItemAuth/);
});

test('keeps local and staging auth refresh isolated in the copied common adapter', () => {
  assert.match(environmentContext, /kiditem_environment_profiles_v1/);
  assert.match(environmentContext, /refreshes\.get\(environmentId\)/);
  assert.match(environmentContext, /queryWebTabs\(environmentId\)/);
  assert.match(environmentContext, /http:\/\/localhost:4000/);
  assert.match(environmentContext, /https:\/\/staging\.merchon\.org/);
});
