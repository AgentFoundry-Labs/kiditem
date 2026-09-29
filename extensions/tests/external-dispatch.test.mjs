import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// 웹앱 메시지는 새 런타임 dispatch(`extensions/src/core/dispatch.ts`)가 받는다(KID-366). 옛 `external-dispatch.js`는
// 수집 세션 공통 액션을 옛 표에 올려 과도기 위임으로 닿게 하고, 외부 장기 실행 포트만 받는다.
const sourceUrl = new URL('../kiditem-os/background/external-dispatch.js', import.meta.url);
const attemptId = '11111111-1111-4111-8111-111111111111';

function install({ sessions = {}, producerDomain = null } = {}) {
  const context = vm.createContext({ Array, Error, Object, Promise, Set, String });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(sourceUrl, 'utf8'), context, { filename: sourceUrl.pathname });
  const registered = [];
  const listeners = { message: [], connect: [] };
  const dispatch = context.KidItemExternalDispatch.create({
    chrome: {
      runtime: {
        onMessageExternal: { addListener: (listener) => listeners.message.push(listener) },
        onConnectExternal: { addListener: (listener) => listeners.connect.push(listener) },
      },
    },
    environmentContext: { resolveSender: (sender) => (sender?.url?.startsWith('http://localhost:3000') ? { environmentId: 'local' } : null) },
    sessions,
    domains: {
      register: (domain) => registered.push(domain),
      forProducer: () => producerDomain,
      forExternalPort: (name) => (name === 'kiditem-port' ? (port) => port.accepted.push(true) : null),
    },
  });
  dispatch.install();
  return { registered, listeners };
}

test('웹앱 메시지 리스너를 걸지 않고, 세션 액션 넷을 옛 표에 올린다', () => {
  const { registered, listeners } = install();
  assert.equal(listeners.message.length, 0);
  assert.deepEqual(Object.keys(registered[0].externalActions).sort(), [
    'cancelCollectionSession',
    'getCollectionSession',
    'listCollectionSessions',
    'openCollectionAttentionTab',
  ]);
});

test('세션 목록·취소는 보내는 창의 환경으로 소유 도메인에 넘긴다', async () => {
  const cancelled = [];
  const { registered } = install({
    sessions: {
      list: async (environmentId) => [{ attemptId, environmentId }],
      getOwned: async (id, environmentId) => ({ attemptId: id, environmentId, producer: 'orders.mall' }),
    },
    producerDomain: { cancelCollectionSession: async (id, environmentId) => { cancelled.push([id, environmentId]); return { success: true }; } },
  });
  const actions = registered[0].externalActions;
  const list = actions.listCollectionSessions;
  assert.deepEqual(JSON.parse(JSON.stringify(await list.handle(list.validate({ action: 'listCollectionSessions' }), 'office'))), [{ attemptId, environmentId: 'office' }]);
  const cancel = actions.cancelCollectionSession;
  assert.deepEqual(await cancel.handle(cancel.validate({ action: 'cancelCollectionSession', attemptId }), 'local'), { success: true });
  assert.deepEqual(cancelled, [[attemptId, 'local']]);
});

test('외부 장기 실행 포트는 KidItem 창에서 온 등록된 이름만 받는다', () => {
  const { listeners } = install();
  const accepted = { accepted: [], disconnected: 0, disconnect() { this.disconnected += 1; } };
  listeners.connect[0]({ ...accepted, name: 'kiditem-port', sender: { url: 'http://localhost:3000/x' } });
  const stranger = { accepted: [], disconnected: 0, disconnect() { this.disconnected += 1; }, name: 'kiditem-port', sender: { url: 'https://evil.test/' } };
  listeners.connect[0](stranger);
  assert.equal(stranger.disconnected, 1);
});
