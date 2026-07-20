import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../../coupang-ads-scraper/background/service-worker.js', import.meta.url),
  'utf8',
);

test('failed, replayed, and expired server claims cannot reach the interactive tab or content mutation', () => {
  const claim = source.indexOf('/extension-claim');
  const reject = source.indexOf('if (!claimResponse.ok)', claim);
  const tab = source.indexOf('interactiveTabs.createTab', claim);
  const mutation = source.indexOf('action: "deleteWingProduct"', claim);

  assert.ok(claim >= 0, 'delete worker must claim server authorization');
  assert.ok(reject > claim, 'failed/replayed/expired claims must return before work');
  assert.ok(tab > reject, 'no interactive tab may be created before claim rejection branch');
  assert.ok(mutation > reject, 'no content mutation message may be sent before claim rejection branch');
  assert.match(source, /return \{ ok: false, error: `삭제 실행 권한을 확인하지 못했습니다/);
});
