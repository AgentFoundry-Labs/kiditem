// KID-322: the extension presses a mall form's [등록] only inside a live registration target execution.
// The gate is a pure function the service worker loads before the mall form register module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
