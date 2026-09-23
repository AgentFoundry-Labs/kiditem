// KID-322: the extension presses a mall form's [등록] only inside a live registration target execution.
// The gate is a pure function the service worker loads before the mall form register module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../extensions/kiditem-os/', import.meta.url);
const gateSource = await readFile(new URL('shared/mall-form-submit-gate.js', root), 'utf8');

function loadGate() {
  const self = {};
  new Function('self', gateSource)(self);
  return self.KidItemMallFormSubmitGate;
}

const FULL_CONTEXT = {
  executionId: '5f0c2c1e-7a1b-4c8e-9d2a-1b2c3d4e5f60',
  payloadHash: 'a'.repeat(64),
  leaseToken: '0e1d2c3b-4a59-4687-9876-5a4b3c2d1e0f',
};

test('does not press without an execution context', () => {
  const { shouldPressRegister } = loadGate();
  assert.equal(shouldPressRegister({ submit: true }), false);
  assert.equal(shouldPressRegister({ submit: true, executionContext: null }), false);
});

test('does not press with a partial or blank execution context', () => {
  const { shouldPressRegister } = loadGate();
  for (const field of Object.keys(FULL_CONTEXT)) {
    const partial = { ...FULL_CONTEXT };
    delete partial[field];
    assert.equal(shouldPressRegister({ submit: true, executionContext: partial }), false, `missing ${field}`);
    assert.equal(shouldPressRegister({ submit: true, executionContext: { ...FULL_CONTEXT, [field]: '  ' } }), false, `blank ${field}`);
    assert.equal(shouldPressRegister({ submit: true, executionContext: { ...FULL_CONTEXT, [field]: 7 } }), false, `non-string ${field}`);
  }
});

test('presses with a full execution context and an explicit submit', () => {
  const { shouldPressRegister } = loadGate();
  assert.equal(shouldPressRegister({ submit: true, executionContext: FULL_CONTEXT }), true);
});

test('does not press when submit is false or not exactly true, even with a full context', () => {
  const { shouldPressRegister } = loadGate();
  assert.equal(shouldPressRegister({ submit: false, executionContext: FULL_CONTEXT }), false);
  assert.equal(shouldPressRegister({ submit: 'true', executionContext: FULL_CONTEXT }), false);
  assert.equal(shouldPressRegister({ executionContext: FULL_CONTEXT }), false);
});

test('the service worker loads the gate before the mall form register module, which presses only through it', async () => {
  const worker = await readFile(new URL('background/service-worker.js', root), 'utf8');
  const gate = worker.indexOf('"../shared/mall-form-submit-gate.js"');
  const register = worker.indexOf('"orders/mall-form-register.js"');
  assert.ok(gate >= 0 && register > gate, 'gate must load before mall-form-register.js');
  const register_ = await readFile(new URL('background/orders/mall-form-register.js', root), 'utf8');
  assert.match(register_, /KidItemMallFormSubmitGate\.shouldPressRegister\(/);
  assert.doesNotMatch(register_, /message\.submit === true && outcome\.ok === true/);
});

// The Wing form (coupang worker `registerToWingForm`) presses [상품등록] through the same gate: the content
// script receives `autoSubmit: true` only with a full execution context, never with an execution id alone.
async function wingFormHarness() {
  const workerSource = (await readFile(new URL('background/coupang/worker.js', root), 'utf8')).replace(/\r\n?/g, '\n');
  const start = workerSource.indexOf('async function registerToWingForm(message)');
  const end = workerSource.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start, 'registerToWingForm source must be extractable');
  const sent = [];
  const context = vm.createContext({
    KidItemMallFormSubmitGate: loadGate(),
    INTERACTIVE_TAB_REASONS: { PRODUCT_EDIT: 'product-edit' },
    interactiveTabs: { createTab: async () => ({ id: 21 }) },
    waitForTabComplete: async () => true,
    wingFormReadiness: { wait: async () => ({ ok: true }) },
    wingFormRuntimeCompat: {
      prepareNavigation: async () => ({ ok: true }),
      ensure: async () => ({ ok: true }),
    },
    chrome: {
      tabs: {
        sendMessage: async (_tabId, message) => {
          sent.push(message);
          return { ok: true, submission: { attempted: message.autoSubmit === true } };
        },
      },
    },
  });
  vm.runInContext(workerSource.slice(start, end), context);
  return { registerToWingForm: context.registerToWingForm, sent };
}

test('the Wing form does not press [상품등록] with an execution id alone', async () => {
  const { registerToWingForm, sent } = await wingFormHarness();
  const result = await registerToWingForm({
    product: { productName: 'p' },
    submit: true,
    autoSubmit: true,
    executionId: FULL_CONTEXT.executionId,
    expectedVendorId: 'A00012345',
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].autoSubmit, false);
  assert.equal(result.submitSkipped, 'execution_context_required');
});

test('the Wing form presses [상품등록] only with submit and the full execution context', async () => {
  const { registerToWingForm, sent } = await wingFormHarness();
  await registerToWingForm({
    product: { productName: 'p' },
    submit: true,
    executionContext: FULL_CONTEXT,
    expectedVendorId: 'A00012345',
  });
  await registerToWingForm({
    product: { productName: 'p' },
    submit: false,
    executionContext: FULL_CONTEXT,
    expectedVendorId: 'A00012345',
  });
  assert.deepEqual(sent.map((message) => message.autoSubmit), [true, false]);
  assert.equal(sent[0].executionId, FULL_CONTEXT.executionId);
});
