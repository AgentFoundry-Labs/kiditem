import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const worker = await readFile(
  new URL('../../kiditem-os/background/coupang/worker.js', import.meta.url),
  'utf8',
);
const environmentContext = await readFile(
  new URL('../../kiditem-os/background/environment-context.js', import.meta.url),
  'utf8',
);

test('uses the shared environment auth context instead of a global token or API URL', () => {
  assert.match(worker, /KidItemEnvironmentContext\.create/);
  // 세 도메인이 한 스코프를 공유하므로 쿠팡 도메인은 adsEnvironmentContext 를 쓴다.
  assert.match(worker, /adsEnvironmentContext\.authedFetch\(environmentId/);
  assert.doesNotMatch(worker, /const API_URL/);
  assert.doesNotMatch(worker, /AUTH_TOKEN_KEY/);
  assert.doesNotMatch(worker, /KidItemAuth/);
});

test('keeps local and Office auth resync isolated in the copied common adapter', () => {
  assert.match(environmentContext, /kiditem_environment_profiles_v1/);
  assert.match(environmentContext, /resyncs\.get\(environmentId\)/);
  assert.match(environmentContext, /queryWebTabs\(environmentId\)/);
  assert.match(environmentContext, /http:\/\/localhost:4000/);
  assert.match(environmentContext, /http:\/\/kiditem-office/);
});
