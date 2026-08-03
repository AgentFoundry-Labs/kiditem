import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const checkpointPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/coupang/profitability-operation-checkpoint.js',
);

function createHarness() {
  const storage = {};
  const chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: storage[key] };
        },
        async set(values) {
          Object.assign(storage, values);
        },
      },
    },
  };
  const context = vm.createContext({ chrome, Date, Object });
  context.globalThis = context;
  vm.runInContext(readFileSync(checkpointPath, 'utf8'), context, {
    filename: checkpointPath,
  });
  return {
    storage,
    create: () => context.KidItemProfitabilityOperationCheckpoint.create({
      chrome,
      now: () => 1_000,
    }),
  };
}

test('reuses the same collection run for a resumed profitability report slice', async () => {
  const { create } = createHarness();
  let generated = 0;
  const input = {
    environmentId: 'local',
    operationRunId: '11111111-1111-4111-8111-111111111111',
    attemptToken: '22222222-2222-4222-8222-222222222222',
    sliceId: '2025-06-27_2025-06-27',
    createRunId: () => {
      generated += 1;
      return '33333333-3333-4333-8333-333333333333';
    },
  };

  const first = await create().getOrCreate(input);
  const resumed = await create().getOrCreate(input);

  assert.equal(first, '33333333-3333-4333-8333-333333333333');
  assert.equal(resumed, first);
  assert.equal(generated, 1);
});

test('wires the checkpoint into the unified worker before the Coupang operation handler', () => {
  const entry = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/service-worker.js'),
    'utf8',
  );
  const worker = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/coupang/worker.js'),
    'utf8',
  );

  assert.ok(
    entry.indexOf('"coupang/profitability-operation-checkpoint.js"') >= 0,
  );
  assert.match(worker, /profitabilityOperationCheckpoint\.getOrCreate\(/);
  assert.match(worker, /profitabilityOperationCheckpoint\.clear\(/);
});
