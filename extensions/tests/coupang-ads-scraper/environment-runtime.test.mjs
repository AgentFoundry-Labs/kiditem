import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL(
    '../../kiditem-os/background/coupang/environment-runtime.js',
    import.meta.url,
  ),
  'utf8',
).catch(() => '');

function createRuntime(initial = {}) {
  const storage = { ...initial };
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get: async (keys) => {
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.map((key) => [key, storage[key]]));
        },
        set: async (next) => Object.assign(storage, next),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };
  const context = vm.createContext({ chrome, console });
  vm.runInContext(source, context);
  const environmentContext = {
    requireEnvironment(environmentId) {
      if (!['local', 'office'].includes(environmentId)) throw new Error('invalid');
      return { environmentId };
    },
    storageKey: (base, environmentId) => `${base}:${environmentId}`,
    alarmName: (base, environmentId) => `${base}:${environmentId}`,
    parseAlarmName(base, name) {
      for (const environmentId of ['local', 'office']) {
        if (name === `${base}:${environmentId}`) return environmentId;
      }
      return null;
    },
  };
  return {
    runtime: context.KidItemCoupangEnvironmentRuntime.create({
      chrome,
      environmentContext,
    }),
    storage,
  };
}

test('namespaces state and scheduled alarms by environment', () => {
  const { runtime } = createRuntime();

  assert.equal(runtime.stateKey('kiditem_rank_check', 'local'), 'kiditem_rank_check:local');
  assert.equal(runtime.alarmName('auto-scrape', 'office'), 'auto-scrape:office');
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.parseAlarm('auto-scrape:local'))),
    { base: 'auto-scrape', environmentId: 'local' },
  );
  assert.equal(runtime.parseAlarm('auto-scrape:preview'), null);
  assert.equal(runtime.parseAlarm('keyword-rank-check:local'), null);
  assert.equal(runtime.parseAlarm('wing-sales-rank-resume:local'), null);
});

test('binds marketplace tabs to one explicit connected environment', async () => {
  const { runtime } = createRuntime();

  await runtime.bindTab(41, 'local');
  await runtime.bindTab(43, 'office');

  assert.equal(await runtime.environmentForTab(41), 'local');
  assert.equal(await runtime.environmentForTab(43), 'office');
  await runtime.clearTab(41);
  assert.equal(await runtime.environmentForTab(41), null);
});

test('preserves concurrent local and Office tab bindings', async () => {
  const { runtime } = createRuntime();

  await Promise.all([
    runtime.bindTab(51, 'local'),
    runtime.bindTab(53, 'office'),
  ]);

  assert.equal(await runtime.environmentForTab(51), 'local');
  assert.equal(await runtime.environmentForTab(53), 'office');
});

test('rejects invalid tab and environment bindings', async () => {
  const { runtime } = createRuntime();

  await assert.rejects(runtime.bindTab(null, 'local'), /tab/i);
  await assert.rejects(runtime.bindTab(1, 'preview'), /invalid/);
});
