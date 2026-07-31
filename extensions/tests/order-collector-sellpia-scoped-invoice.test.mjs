import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const postProcessingSource = readFileSync(path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/sellpia-post-processing.js',
), 'utf8');

function extractSellpiaDriveStep() {
  const start = postProcessingSource.indexOf('async function driveStep(');
  const end = postProcessingSource.indexOf(
    '\n\n  root.KidItemSellpiaPostProcessing',
    start,
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return postProcessingSource.slice(start, end);
}

function invoiceContext(items) {
  let selectedRows = null;
  let clicked = false;
  const invoiceButton = {
    disabled: false,
    click() {
      clicked = true;
      throw new Error('stop-after-safe-selection');
    },
  };
  return {
    window: {
      jQuery: { active: 0 },
      dataView: {
        getLength: () => items.length,
        getItems: () => items,
      },
      grid: {
        setSelectedRows(rows) {
          selectedRows = [...rows];
        },
      },
    },
    document: {
      getElementById: (id) => id === 'btn_get_auto_delinum' ? invoiceButton : null,
      querySelectorAll: () => [],
      createElement: () => ({ innerHTML: '', textContent: '' }),
    },
    setTimeout: (resolve) => resolve(),
    state: {
      selectedRows: () => selectedRows,
      clicked: () => clicked,
    },
  };
}

test('Sellpia invoice selects only rows matching the current transmitted order numbers', async () => {
  const context = invoiceContext([
    { group_no: 'provider_ORDER-1' },
    { group_no: 'provider_OLDER-ORDER' },
    { group_no: 'provider_ORDER-2' },
  ]);
  const drive = vm.runInNewContext(`(${extractSellpiaDriveStep()})`, context);

  const result = await drive('invoice', ['ORDER-1']);

  assert.deepEqual(context.state.selectedRows(), [0]);
  assert.equal(context.state.clicked(), true);
  assert.equal(result.success, false);
  assert.match(result.error, /stop-after-safe-selection/);
});

test('Sellpia invoice fails closed when no current transmission target exists', async () => {
  const context = invoiceContext([
    { group_no: 'provider_OLDER-ORDER' },
  ]);
  const drive = vm.runInNewContext(`(${extractSellpiaDriveStep()})`, context);

  const result = await drive('invoice', []);

  assert.equal(context.state.selectedRows(), null);
  assert.equal(context.state.clicked(), false);
  assert.equal(result.success, false);
  assert.match(result.error, /전체 채번은 실행하지 않습니다/);
});

test('Sellpia invoice does not fall back to all waiting rows when no row matches', async () => {
  const context = invoiceContext([
    { group_no: 'provider_OLDER-ORDER' },
  ]);
  const drive = vm.runInNewContext(`(${extractSellpiaDriveStep()})`, context);

  const result = await drive('invoice', ['ORDER-1']);

  assert.equal(context.state.selectedRows(), null);
  assert.equal(context.state.clicked(), false);
  assert.equal(result.success, false);
  assert.match(result.error, /다른 대기 주문은 채번하지 않았습니다/);
});

test('Sellpia invoice targets stay isolated by KidItem environment and are consumed after issuance', async () => {
  const entries = new Map();
  const chrome = {
    storage: {
      session: {
        async get(key) {
          return { [key]: entries.get(key) };
        },
        async set(value) {
          for (const [key, entry] of Object.entries(value)) entries.set(key, entry);
        },
        async remove(key) {
          entries.delete(key);
        },
      },
    },
  };
  const context = { chrome };
  vm.runInNewContext(postProcessingSource, context);
  const store = context.KidItemSellpiaPostProcessing.createTargetStore({
    chrome,
    storageKeyForEnvironment: (base, environmentId) => `${environmentId}:${base}`,
  });

  await store.remember('local', ['ORDER-1', 'ORDER-2']);
  await store.remember('staging', ['STAGING-1']);
  await store.consume('local', ['ORDER-1']);

  assert.deepEqual(Array.from(await store.read('local')), ['ORDER-2']);
  assert.deepEqual(Array.from(await store.read('staging')), ['STAGING-1']);
});
