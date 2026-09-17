import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

/**
 * 커밋된 파일은 건드리지 않는다. 생성기를 복사한 저장소 사본 위에서 흔들어 본다 —
 * 테스트가 중간에 죽어도 작업 트리에 흔적이 남지 않는다.
 */
test('⭐ 생성물이 원본과 다르면 --check 가 막는다', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'kid250-registry-'));
  const scratchTarget = path.join(scratch, 'extensions/kiditem-os/shared/channel-registry.js');
  const scratchGenerator = path.join(scratch, 'scripts/generate-channel-registry.mjs');
  mkdirSync(path.dirname(scratchTarget), { recursive: true });
  mkdirSync(path.join(scratch, 'packages/shared/src'), { recursive: true });
  mkdirSync(path.dirname(scratchGenerator), { recursive: true });
  copyFileSync(GENERATOR, scratchGenerator);
  copyFileSync(
    path.join(ROOT, 'packages/shared/src/channel-registry.ts'),
    path.join(scratch, 'packages/shared/src/channel-registry.ts'),
  );

  // 같은 내용이면 통과한다.
  copyFileSync(TARGET, scratchTarget);
  assert.match(
    execFileSync('node', [scratchGenerator, '--check'], { encoding: 'utf8' }),
    /29개 채널/,
  );

  // 한 글자만 어긋나도 막는다.
  writeFileSync(scratchTarget, readFileSync(scratchTarget, 'utf8').replace('"kakao"', '"kakao-was-renamed"'));
  assert.throws(
    () => execFileSync('node', [scratchGenerator, '--check'], { stdio: 'pipe' }),
    /Command failed/,
  );

  // 생성물이 아예 없어도 막는다.
  rmSync(scratchTarget);
  assert.throws(
    () => execFileSync('node', [scratchGenerator, '--check'], { stdio: 'pipe' }),
    /Command failed/,
  );
});
