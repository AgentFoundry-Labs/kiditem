import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const bridgePath = path.resolve('extensions/product-scraper/host-bridge.js');
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
  assert.equal(storage.get('kiditem-sourcing-ext-id'), 'product-scraper-extension');
  assert.equal(windowListeners.some((entry) => entry.type === 'message'), true);
});
