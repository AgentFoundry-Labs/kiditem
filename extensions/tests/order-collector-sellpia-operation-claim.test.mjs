import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workerPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/worker.js',
);
const worker = readFileSync(workerPath, 'utf8');
const helperStart = worker.indexOf('async function claimSellpiaFreshnessLease(');
const helperEnd = worker.indexOf('\nasync function runSellpiaInventoryOperation(', helperStart);

assert.notEqual(helperStart, -1);
assert.notEqual(helperEnd, -1);

const helperSource = worker.slice(helperStart, helperEnd);

function createHarness(responses) {
  const calls = [];
  const context = vm.createContext({
    browserOperationRuntimeEnvironmentContext: {
      async authedFetch(environmentId, requestPath, init) {
        calls.push({ environmentId, requestPath, init });
        return responses.shift();
      },
    },
  });
  vm.runInContext(helperSource, context, { filename: workerPath });
  return { calls, claim: context.claimSellpiaFreshnessLease };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('retries once when the first claim only reconciles an expired prior generation', async () => {
  const winner = {
    claimed: true,
    claimToken: '11111111-1111-4111-8111-111111111111',
  };
  const { calls, claim } = createHarness([
    jsonResponse({
      claimed: false,
      state: { status: 'refresh_required', activeSync: null },
    }),
    jsonResponse(winner),
  ]);

  const result = await claim({ environmentId: 'local' });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].requestPath, '/api/inventory/sellpia-freshness/claims');
  assert.equal(calls[1].requestPath, '/api/inventory/sellpia-freshness/claims');
  assert.deepEqual(result.claim, winner);
});

test('does not compete when another live Sellpia claim is already active', async () => {
  const joined = {
    claimed: false,
    state: {
      status: 'syncing',
      activeSync: { runId: '22222222-2222-4222-8222-222222222222' },
    },
  };
  const { calls, claim } = createHarness([jsonResponse(joined)]);

  const result = await claim({ environmentId: 'local' });

  assert.equal(calls.length, 1);
  assert.deepEqual(result.claim, joined);
});
