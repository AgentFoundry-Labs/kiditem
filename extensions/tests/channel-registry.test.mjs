import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const EXTENSION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../kiditem-os',
);

function loadRegistry() {
  const context = vm.createContext({});
  context.self = context;
  vm.runInContext(
    readFileSync(path.join(EXTENSION, 'shared/channel-registry.js'), 'utf8'),
    context,
  );
  return context.KidItemChannelRegistry;
}

/** `const SPECS = { … };` 블록 안의 최상위 키들. */
function specKeys(relativePath) {
  const source = readFileSync(path.join(EXTENSION, relativePath), 'utf8');
  const start = source.indexOf('const SPECS = ');
  assert.ok(start >= 0, `SPECS not found in ${relativePath}`);
  const end = source.slice(start).search(/\n {2}\}[);]/);
  assert.ok(end >= 0, `SPECS terminator not found in ${relativePath}`);
  const block = source.slice(start, start + end);
  const keys = [];
  for (const match of block.matchAll(/^ {4}(?:"([^"]+)"|([A-Za-z0-9_$-]+)): (?:Object\.freeze\()?\{/gm)) {
    keys.push(match[1] ?? match[2]);
  }
  return [...new Set(keys)];
}

/**
 * 확장 스펙의 키는 채널 키다(KID-250).
 *
 * 예전에는 확장만 제 철자(`gsshop` · `artgonggu` · `alwayz` …)를 쓰고 웹이 번역표를 들고
 * 있었다. 표를 빠뜨린 몰은 자동 로그인이 조용히 아무것도 하지 않았다 — 실패도 아니고
 * 성공도 아닌, 사람이 알아채기 가장 어려운 고장이다.
 */
test('⭐ 상품등록 폼 스펙 키가 모두 채널 키다', () => {
  const registry = loadRegistry();
  for (const key of specKeys('background/orders/mall-form-register.js')) {
    assert.ok(registry.findChannel(key), `unknown channel key in mall-form-register SPECS: ${key}`);
  }
});

test('⭐ 로그인 프로브 스펙 키가 모두 채널 키다', () => {
  const registry = loadRegistry();
  for (const key of specKeys('background/orders/mall-session-probe.js')) {
    assert.ok(registry.findChannel(key), `unknown channel key in mall-session-probe SPECS: ${key}`);
  }
});

/** 서비스워커가 이 파일을 싣지 않으면 도메인 워커가 레지스트리를 못 읽는다. */
test('서비스워커가 채널 레지스트리를 공용 파운데이션으로 싣는다', () => {
  const worker = readFileSync(path.join(EXTENSION, 'background/service-worker.js'), 'utf8');
  assert.match(worker, /"\.\.\/shared\/channel-registry\.js"/);
});

test('레지스트리는 전역 하나만 만들고 얼려 둔다', () => {
  const registry = loadRegistry();
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(Object.isFrozen(registry.CHANNEL_REGISTRY), true);
  assert.equal(registry.channelFormSpec('auction'), 'gmarket');
  assert.equal(registry.channelOutcomeKey('coupang-direct'), 'rocket');
});

/**
 * 확장이 "어느 몰 폼을 채울 수 있다" 고 광고하는 목록은 스펙에서 나온다(KID-250).
 * 손으로 적어 두면 몰을 붙인 날 이 줄만 옛말이 되고, 웹은 그 몰을 모른다고 읽는다.
 */
test('⭐ 폼 자동채움 능력 목록은 스펙 키에서 파생한다', () => {
  const worker = readFileSync(path.join(EXTENSION, 'background/orders/worker.js'), 'utf8');
  const line = worker.match(/mallFormRegisterMalls: [^\n]*(\n[^\n]*){0,3}/)?.[0] ?? '';
  assert.match(line, /Object\.keys\(/, 'the advertised list must be derived, not hand-written');
  assert.doesNotMatch(line, /"(domeggook|onch|artgonggu|alwayz|teacherville)"/);
});
