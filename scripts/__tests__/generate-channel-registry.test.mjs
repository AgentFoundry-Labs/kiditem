import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  readRegistryRows,
  renderRegistryModule,
} from '../generate-channel-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERATOR = path.join(ROOT, 'scripts/generate-channel-registry.mjs');
const TARGET = path.join(ROOT, 'extensions/kiditem-os/shared/channel-registry.js');

/**
 * 확장은 빌드가 없어 채널 레지스트리의 사본을 커밋한다. 그 사본이 조용히 원본과 갈라지면
 * 확장만 옛 목록으로 일하게 되므로, 만드는 쪽과 막는 쪽을 함께 지킨다.
 */
test('원본에서 채널 행을 값으로 읽는다', () => {
  const rows = readRegistryRows();
  assert.equal(rows.length, 29);
  assert.equal(rows.filter((row) => row.kind === 'mall').length, 27);
  assert.deepEqual(
    rows.filter((row) => row.kind === 'marketplace').map((row) => row.key),
    ['coupang', 'rocket'],
  );
  assert.equal(rows.find((row) => row.key === 'coupang-direct').sharedAccountChannel, 'rocket');
});

test('커밋된 생성물이 지금 원본과 같다', () => {
  assert.equal(readFileSync(TARGET, 'utf8'), renderRegistryModule(readRegistryRows()));
});

test('생성물은 확장 전역 하나만 만든다', () => {
  const generated = renderRegistryModule(readRegistryRows());
  const sandbox = { self: {} };
  // 확장 서비스워커와 같은 모양으로 실행한다 — `self` 에 전역 하나를 매단다.
  new Function('self', generated)(sandbox.self);
  const registry = sandbox.self.KidItemChannelRegistry;
  assert.equal(registry.CHANNEL_REGISTRY.length, 29);
  assert.equal(registry.channelFormSpec('auction'), 'gmarket');
  assert.equal(registry.channelFormSpec('domeggook'), 'domeggook');
  assert.equal(registry.channelOutcomeKey('coupang-direct'), 'rocket');
  assert.equal(registry.channelOutcomeKey('onch'), 'onch');
  assert.equal(registry.channelCollectsViaExtension('kakao'), true);
  assert.equal(registry.channelCollectsViaExtension('toss'), false);
  assert.equal(registry.channelUploadsTracking('onch'), true);
  assert.equal(registry.channelUploadsTracking('icecream-mall'), false);
  assert.equal(registry.findChannel('order_collection'), null);
});

test('⭐ 생성물이 원본과 다르면 --check 가 막는다', () => {
  const committed = readFileSync(TARGET, 'utf8');
  try {
    writeFileSync(TARGET, committed.replace('"kakao"', '"kakao-was-renamed"'));
    assert.throws(
      () => execFileSync('node', [GENERATOR, '--check'], { stdio: 'pipe' }),
      /Command failed/,
    );
  } finally {
    writeFileSync(TARGET, committed);
  }
  // 되돌린 뒤에는 다시 통과한다 — 검사가 상태를 남기지 않는다.
  assert.match(
    execFileSync('node', [GENERATOR, '--check'], { encoding: 'utf8' }),
    /29개 채널/,
  );
});
