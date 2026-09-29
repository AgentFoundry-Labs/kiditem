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
  // KidItem API 호출(팝업 요청·Wing 재고 내보내기)과 토큰 저장은 새 런타임 core가 한다(KID-366,
  // `extensions/src/core/authed-fetch.ts`). 쿠팡 워커는 API를 직접 부르지 않는다.
  assert.doesNotMatch(worker, /authedFetch/);
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
