import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// coupang-po-session.js 는 IIFE 로 전역에 등록되므로 그 전역을 흉내내서 로드한다.
function loadSession() {
  const source = readFileSync(
    new URL('../kiditem-os/background/orders/coupang-po-session.js', import.meta.url),
    'utf8',
  );
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const exported = sandbox.KidItemCoupangPoSession;
  assert.ok(exported?.create, 'coupang po session module must expose create()');
  return exported;
}

function makeChrome({ bodyText, readyUrl = false }) {
  const created = [];
  return {
    created,
    api: {
      tabs: {
        query: async () => [],
        create: async ({ url }) => {
          created.push(url);
          return { id: 42, url };
        },
        get: async () => ({
          id: 42,
          url: readyUrl
            ? 'https://supplier.coupang.com/po-web/purchase/order/list'
            : 'https://supplier.coupang.com/scm/purchase/order/list',
        }),
        remove: async () => {},
      },
      scripting: {
        executeScript: async () => [{ result: bodyText }],
      },
    },
  };
}

const collection = { attachTab: async () => {}, detachTab: async () => {} };

test('a supplier HTTP 400 page is reported as cookie bloat, not a login problem', async () => {
  const module = loadSession();
  const chromeStub = makeChrome({ bodyText: 'HTTP Status 400 – Bad Request' });
  const session = module.create({
    chrome: chromeStub.api,
    attachOrderCollectionTab: async () => {},
    waitForTabReady: async () => {},
  });

  const result = await session.run(collection, async () => ({ success: true }));

  assert.equal(result.errorCode, 'coupang_cookie_bloat');
  assert.match(result.error, /쿠키/);
  // 쿠키가 그대로인 재시도는 의미가 없으므로 부트스트랩 탭을 한 번만 연다.
  assert.equal(chromeStub.created.length, 1);
});

test('a non-400 preparation failure still asks the operator to check the login', async () => {
  const module = loadSession();
  const chromeStub = makeChrome({ bodyText: '로그인이 필요합니다' });
  const session = module.create({
    chrome: chromeStub.api,
    attachOrderCollectionTab: async () => {},
    waitForTabReady: async () => {},
  });

  const result = await session.run(collection, async () => ({ success: true }));

  assert.equal(result.errorCode, 'coupang_po_session_required');
  // 세션 문제는 새 탭으로 한 번 재시도한다.
  assert.equal(chromeStub.created.length, 2);
});
