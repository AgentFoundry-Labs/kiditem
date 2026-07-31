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
