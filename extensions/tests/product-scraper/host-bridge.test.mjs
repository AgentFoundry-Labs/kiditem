import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const bridgePath = path.resolve('extensions/kiditem-os/content/host-bridge.js');
const bridgeSource = fs.readFileSync(bridgePath, 'utf8');

test('opens a heartbeat port and pings often enough for MV3 long-running collection', () => {
  const messages = [];
  const intervals = [];
  const disconnectListeners = [];
  const connectCalls = [];
  const windowListeners = [];
  const storage = new Map();

  const context = {
    Date: { now: () => 1234 },
    chrome: {
      runtime: {
        id: 'product-scraper-extension',
        connect(options) {
          connectCalls.push(options);
          return {
            postMessage: (message) => messages.push(message),
            onDisconnect: {
              addListener: (listener) => disconnectListeners.push(listener),
            },
          };
        },
      },
    },
    clearInterval: () => {},
    console,
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
    },
    setInterval(fn, delay) {
      intervals.push({ fn, delay });
      return 1;
    },
    window: {
      addEventListener: (type, listener) => windowListeners.push({ type, listener }),
      location: { origin: 'http://localhost:3000' },
      postMessage: () => {},
      setTimeout: () => 1,
    },
  };

  vm.createContext(context);
  vm.runInContext(bridgeSource, context, { filename: bridgePath });

  assert.equal(connectCalls.length, 1);
  assert.equal(connectCalls[0].name, 'kiditem-1688-trend-keepalive');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'keepalive');
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 20_000);
  assert.equal(disconnectListeners.length, 1);
  // 확장 하나가 세 도메인을 모두 담당하므로 세 핸드셰이크 채널 전부에 같은
  // 확장 ID 로 답해야 웹앱의 detect* 세 함수가 같은 확장을 가리킨다.
  for (const key of [
    'kiditem-ext-id',
    'kiditem-order-ext-id',
    'kiditem-sourcing-ext-id',
  ]) {
    assert.equal(storage.get(key), 'product-scraper-extension', key);
  }
  assert.equal(windowListeners.some((entry) => entry.type === 'message'), true);
});

/**
 * KID-155. 화면을 옮기면 이 페이지가 뒤로/앞으로 캐시에 들어간다. 열린 확장 포트는 캐시
 * 자격을 막고, 크롬이 대신 끊으면서 남긴 이유를 아무도 읽지 않아 확장 오류 목록에
 * "Unchecked runtime.lastError" 로 쌓였다.
 */
test('closes the heartbeat port when the page enters the back/forward cache and reconnects on restore', () => {
  const intervals = [];
  const disconnectListeners = [];
  const connectCalls = [];
  const disconnects = [];
  const windowListeners = [];
  const cleared = [];
  let lastErrorReads = 0;
  const storage = new Map();

  const chromeRuntime = {
    id: 'product-scraper-extension',
    connect(options) {
      connectCalls.push(options);
      return {
        postMessage: () => {},
        disconnect: () => disconnects.push(options.name),
        onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
      };
    },
  };
  Object.defineProperty(chromeRuntime, 'lastError', {
    get() {
      lastErrorReads += 1;
      return undefined;
    },
  });

  const context = {
    Date: { now: () => 1234 },
    chrome: { runtime: chromeRuntime },
    clearInterval: (id) => cleared.push(id),
    console,
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
    },
    setInterval: () => {
      intervals.push(true);
      return intervals.length;
    },
    window: {
      addEventListener: (type, listener) => windowListeners.push({ type, listener }),
      location: { origin: 'http://localhost:3000' },
      postMessage: () => {},
      setTimeout: () => 1,
    },
  };

  vm.createContext(context);
  vm.runInContext(bridgeSource, context, { filename: bridgePath });

  const fire = (type, event) => {
    for (const entry of windowListeners) {
      if (entry.type === type) entry.listener(event);
    }
  };

  assert.equal(connectCalls.length, 1);

  // 캐시로 들어가면 우리가 먼저 닫고, 그 뒤 크롬이 알리는 끊김에도 다시 붙지 않는다.
  fire('pagehide', { persisted: true });
  assert.deepEqual(disconnects, ['kiditem-1688-trend-keepalive']);
  assert.equal(cleared.length, 1);
  for (const listener of disconnectListeners) listener();
  assert.ok(lastErrorReads >= 1, '끊긴 이유를 읽어 소비해야 오류 목록에 남지 않는다');
  assert.equal(connectCalls.length, 1);

  // 돌아오면 다시 붙는다.
  fire('pageshow', { persisted: true });
  assert.equal(connectCalls.length, 2);

  // 페이지가 아주 닫히는 길(`persisted: false`)에서는 포트도 함께 사라지므로 건드리지 않는다.
  fire('pagehide', { persisted: false });
  assert.equal(disconnects.length, 1);
});
