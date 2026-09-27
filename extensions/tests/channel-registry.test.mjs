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
  // `key: Object.freeze({` · `key: spec({` · `key: {` 를 모두 한 줄 스펙으로 읽는다.
  for (const match of block.matchAll(/^ {4}(?:"([^"]+)"|([A-Za-z0-9_$-]+)): (?:[A-Za-z.]+\()?\{/gm)) {
    keys.push(match[1] ?? match[2]);
  }
  return [...new Set(keys)];
}

/**
 * 확장 스펙의 키는 채널 키다(KID-250). 몰 쓰기 모듈(등록 폼·판매 상태)의 몰 키는 런타임 스펙
 * `extensions/src/entry/mall-site-capabilities.spec.ts`가 본다(KID-256 — 옛 `mall-form-register.js`는 지웠다).
 */
test('⭐ 몰 세션 스펙 키가 모두 채널 키다', () => {
  const registry = loadRegistry();
  for (const key of specKeys('background/orders/mall-session.js')) {
    assert.ok(registry.findChannel(key), `unknown channel key in mall-session SPECS: ${key}`);
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
