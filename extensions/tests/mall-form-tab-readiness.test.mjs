import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/mall-form-register.js',
);

function loadModule() {
  const context = {
    self: {}, console, URL, URLSearchParams, TextDecoder, TextEncoder,
    FormData, Blob, File, Promise, Date, setTimeout, clearTimeout,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * 탭이 뜰 때까지 기다렸다가 폼을 채운다.
 *
 * 회귀(라이브 2026-09-10, '한번에 등록하기' 로 몰 일곱을 연달아 열었을 때):
 * 탭을 만든 뒤 **고정 2.5초만 자고** 주입했더니
 *   - 도매꾹 → `Frame with ID 0 was removed.`  (그 사이 로그인 리다이렉트가 났다)
 *   - 아트공구 → `폼 채움 결과를 받지 못했습니다.` (아직 폼이 안 그려졌다)
 * 로 깨졌다. 탭을 빨리 여러 개 만들수록 로딩이 느려져서 고정 대기로는 못 맞춘다.
 *
 * 그래서 두 가지를 지킨다 — **로딩 완료를 기다린다**, 그리고 그 뒤에도 프레임이
 * 갈려나가면 **한 번은 다시 시도한다**.
 */

/** 로딩 완료 이벤트를 흉내내는 가짜 chrome. */
function harness({ executeScript, completeAfterMs = 0 }) {
  const module = loadModule();
  const listeners = { updated: [], removed: [] };
  const events = [];
  const chrome = {
    runtime: {},
    scripting: { executeScript },
    tabs: {
      onUpdated: {
        addListener: (fn) => { events.push('listen'); listeners.updated.push(fn); },
        removeListener: (fn) => {
          events.push('unlisten');
          listeners.updated = listeners.updated.filter((entry) => entry !== fn);
        },
      },
      onRemoved: {
        addListener: (fn) => listeners.removed.push(fn),
        removeListener: (fn) => {
          listeners.removed = listeners.removed.filter((entry) => entry !== fn);
        },
      },
      // 붙는 순간에는 아직 로딩 중이다. 잠시 뒤 complete 를 쏜다.
      get: (tabId, done) => done({ id: tabId, status: 'loading' }),
    },
  };
  const fire = () => setTimeout(() => {
    for (const fn of [...listeners.updated]) fn(1, { status: 'complete' }, { id: 1 });
  }, completeAfterMs);
  const interactiveTabs = {
    createTab: async () => { fire(); return { id: 1 }; },
  };
  const api = module.create({
    chrome,
    fetch: async () => ({ ok: true, status: 200, blob: async () => new Blob([]) }),
    interactiveTabs,
    tabReason: 'test',
  });
  return { api, chrome, events, listeners };
}

const form = () => ({
  url: 'https://www.domeggook.com/sc/item/regFrm',
  fields: { name: '상품' },
  manualSteps: [],
});

test('탭 로딩이 끝난 뒤에 주입한다 — 고정 시간을 자고 넣지 않는다', async () => {
  const order = [];
  const { api } = harness({
    completeAfterMs: 30,
    executeScript: async () => {
      order.push('inject');
      return [{ result: { ok: true, steps: [], warnings: [] } }];
    },
  });
  const started = Date.now();
  const result = await api.register({ mall: 'domeggook', form: form() });
  assert.equal(result.ok, true);
  assert.deepEqual(order, ['inject']);
  // complete(30ms) 를 기다린 뒤 한 박자(1200ms) 더 준다. 고정 2.5초였다면 더 걸렸다.
  assert.ok(Date.now() - started >= 1200, '로딩 완료를 기다린 뒤 주입해야 한다');
});

test('프레임이 갈려나가면 한 번은 다시 시도한다 — 도매꾹이 이렇게 깨졌다', async () => {
  let attempts = 0;
  const { api } = harness({
    completeAfterMs: 10,
    executeScript: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Frame with ID 0 was removed.');
      return [{ result: { ok: true, steps: [], warnings: [] } }];
    },
  });
  const result = await api.register({ mall: 'domeggook', form: form() });
  assert.equal(attempts, 2, '한 번은 더 시도해야 한다');
  assert.equal(result.ok, true);
});

test('두 번째도 프레임이 없으면 그대로 알린다 — 조용히 성공으로 바꾸지 않는다', async () => {
  const { api } = harness({
    completeAfterMs: 10,
    executeScript: async () => { throw new Error('Frame with ID 0 was removed.'); },
  });
  await assert.rejects(
    () => api.register({ mall: 'domeggook', form: form() }),
    /Frame with ID 0 was removed/,
  );
});

test('프레임 문제가 아닌 오류는 재시도하지 않는다', async () => {
  let attempts = 0;
  const { api } = harness({
    completeAfterMs: 10,
    executeScript: async () => {
      attempts += 1;
      throw new Error('Cannot access contents of the page.');
    },
  });
  await assert.rejects(() => api.register({ mall: 'domeggook', form: form() }));
  assert.equal(attempts, 1, '권한 오류는 다시 시도해도 같다');
});

test('기다림이 끝나면 리스너를 떼어 낸다 — 탭마다 쌓이지 않는다', async () => {
  const { api, listeners } = harness({
    completeAfterMs: 10,
    executeScript: async () => [{ result: { ok: true, steps: [], warnings: [] } }],
  });
  await api.register({ mall: 'domeggook', form: form() });
  assert.deepEqual(listeners.updated, [], '남은 onUpdated 리스너가 없어야 한다');
  assert.deepEqual(listeners.removed, [], '남은 onRemoved 리스너가 없어야 한다');
});

test('이 API 를 못 쓰는 환경에서도 등록은 된다 — 기다림은 보강이지 전제가 아니다', async () => {
  const module = loadModule();
  let injected = 0;
  const api = module.create({
    chrome: {
      scripting: {
        executeScript: async () => {
          injected += 1;
          return [{ result: { ok: true, steps: [], warnings: [] } }];
        },
      },
    },
    fetch: async () => ({ ok: true, status: 200, blob: async () => new Blob([]) }),
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  });
  const result = await api.register({ mall: 'domeggook', form: form() });
  assert.equal(injected, 1);
  assert.equal(result.ok, true);
});
