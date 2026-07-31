import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL(
    '../../kiditem-os/background/coupang/wing-form-runtime-compat.js',
    import.meta.url,
  ),
  'utf8',
);
const manifest = JSON.parse(
  await readFile(
    new URL('../../kiditem-os/manifest.json', import.meta.url),
    'utf8',
  ),
);

function loadCompat({
  underscore,
  executeScript,
  debuggerApi,
  autoBootstrap = false,
} = {}) {
  const context = vm.createContext({
    chrome: {
      debugger: debuggerApi,
      scripting: {
        executeScript: executeScript ?? (async () => []),
      },
    },
    console,
    location: {
      hostname: 'wing.coupang.com',
      pathname: autoBootstrap
        ? '/tenants/seller-web/vendor-inventory/formV2'
        : '/not-the-wing-form',
    },
  });
  context._ = underscore;
  vm.runInContext(source, context, { filename: 'wing-form-runtime-compat.js' });
  context.location.pathname = '/tenants/seller-web/vendor-inventory/formV2';
  return context;
}

test('installs only the missing lodash capabilities on the Wing form runtime', () => {
  const underscore = function translate() {};
  const context = loadCompat({ underscore });

  const result = context.KidItemWingFormRuntimeCompat.installInPage();

  assert.equal(result.ok, true);
  assert.equal(result.status, 'installed');
  assert.equal(context._, underscore);
  assert.equal(context._.isEmpty(null), true);
  assert.equal(context._.isEmpty({}), true);
  assert.equal(context._.isEmpty({ id: 1 }), false);
  assert.equal(context._.isEmpty([]), true);
  assert.equal(context._.isEmpty(['option']), false);
  assert.deepEqual(
    Array.from(context._.filter([{ id: 1 }, { id: 2 }], (item) => item.id === 2)),
    [{ id: 2 }],
  );
  assert.deepEqual(
    Array.from(context._.filter({ first: 1, second: 2 }, (value) => value > 1)),
    [2],
  );
});

test('preserves existing Wing lodash-compatible implementations', () => {
  const existingIsEmpty = () => 'native-empty-result';
  const existingFilter = () => 'native-filter-result';
  const underscore = {
    isEmpty: existingIsEmpty,
    filter: existingFilter,
  };
  const context = loadCompat({ underscore });

  const result = context.KidItemWingFormRuntimeCompat.installInPage();

  assert.equal(result.ok, true);
  assert.equal(result.status, 'already-compatible');
  assert.equal(context._.isEmpty, existingIsEmpty);
  assert.equal(context._.filter, existingFilter);
});

test('repairs Wing lexical underscore strings during the main-world ensure check', () => {
  const context = loadCompat({
    underscore: {
      isEmpty: (value) => value == null,
      filter: (values, predicate) => values.filter(predicate),
    },
  });

  const result = context.KidItemWingFormRuntimeCompat.installInPage();
  const capabilityTypes = vm.runInContext(
    `((_) => ({
      isEmpty: typeof _.isEmpty,
      filter: typeof _.filter,
    }))('b33cdffa-8647-4f29-8f0c-2a872166a726')`,
    context,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(capabilityTypes)), {
    isEmpty: 'function',
    filter: 'function',
  });
});

test('intercepts the first Wing underscore assignment at document_start', () => {
  const context = loadCompat({ underscore: undefined, autoBootstrap: true });
  const assigned = function translate() {};

  context._ = assigned;

  assert.equal(context._, assigned);
  assert.equal(context._.isEmpty({}), true);
  assert.deepEqual(
    Array.from(context._.filter(['color', 'quantity'], (value) => value === 'color')),
    ['color'],
  );
});

test('keeps the compatibility capabilities when Wing reassigns underscore', () => {
  const initial = function initialTranslate() {};
  const context = loadCompat({ underscore: initial, autoBootstrap: true });
  const reassigned = function reassignedTranslate() {};

  context._ = reassigned;

  assert.equal(context._, reassigned);
  assert.equal(context._.isEmpty({ option: 'color' }), false);
  assert.deepEqual(
    Array.from(context._.filter(['color', 'quantity'], (value) => value !== 'quantity')),
    ['color'],
  );
});

test('installs lodash capabilities for Wing lexical underscore strings at document_start', () => {
  const context = loadCompat({
    underscore: {
      isEmpty: (value) => value == null,
      filter: (values, predicate) => values.filter(predicate),
    },
    autoBootstrap: true,
  });

  const capabilityTypes = vm.runInContext(
    `((_) => ({
      isEmpty: typeof _.isEmpty,
      filter: typeof _.filter,
    }))('b33cdffa-8647-4f29-8f0c-2a872166a726')`,
    context,
  );

  assert.deepEqual(JSON.parse(JSON.stringify(capabilityTypes)), {
    isEmpty: 'function',
    filter: 'function',
  });

  const behavior = vm.runInContext(
    `((_) => ({
      empty: _.isEmpty({}),
      nonEmpty: _.isEmpty({ id: 1 }),
      filtered: Array.from(_.filter(['color', 'quantity'], (value) => value === 'color')),
      descriptors: {
        isEmpty: Object.getOwnPropertyDescriptor(String.prototype, 'isEmpty'),
        filter: Object.getOwnPropertyDescriptor(String.prototype, 'filter'),
      },
    }))('b33cdffa-8647-4f29-8f0c-2a872166a726')`,
    context,
  );

  assert.equal(behavior.empty, true);
  assert.equal(behavior.nonEmpty, false);
  assert.deepEqual(Array.from(behavior.filtered), ['color']);
  assert.equal(behavior.descriptors.isEmpty.enumerable, false);
  assert.equal(behavior.descriptors.filter.enumerable, false);
});

test('manifest installs the compatibility shim before Wing SPA routing in MAIN world', () => {
  const entry = manifest.content_scripts.find((contentScript) =>
    contentScript.js?.includes('background/coupang/wing-form-runtime-compat.js'),
  );

  assert.ok(entry, 'missing Wing runtime compatibility content script');
  assert.deepEqual(entry.matches, [
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2*',
  ]);
  assert.equal(entry.run_at, 'document_start');
  assert.equal(entry.world, 'MAIN');
  assert.equal(entry.all_frames, false);
});

test('registers a self-contained main-world bootstrap before navigating the blank tab to Wing', async () => {
  const calls = [];
  let bootstrapSource = '';
  const debuggerApi = {
    async attach(target, version) {
      calls.push(['attach', target.tabId, version]);
    },
    async sendCommand(target, method, params) {
      calls.push([method, target.tabId, params]);
      if (method === 'Page.addScriptToEvaluateOnNewDocument') {
        bootstrapSource = params.source;
        return { identifier: 'bootstrap-1' };
      }
      if (method === 'Page.navigate') return { frameId: 'frame-1' };
      return {};
    },
    async detach(target) {
      calls.push(['detach', target.tabId]);
    },
  };
  const context = loadCompat({ underscore: {}, debuggerApi });
  const compat = context.KidItemWingFormRuntimeCompat.create({
    chrome: context.chrome,
  });

  const result = await compat.prepareNavigation(
    42,
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2',
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(([method]) => method), [
    'attach',
    'Page.enable',
    'Page.addScriptToEvaluateOnNewDocument',
    'Page.navigate',
    'detach',
  ]);
  assert.equal(calls[0][1], 42);
  assert.equal(calls[3][2].url, 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2');

  const page = vm.createContext({
    location: {
      hostname: 'wing.coupang.com',
      pathname: '/tenants/seller-web/vendor-inventory/formV2',
    },
  });
  vm.runInContext(bootstrapSource, page, { filename: 'wing-bootstrap.js' });
  page._ = function translate() {};
  assert.equal(page._.isEmpty({}), true);
  assert.deepEqual(
    Array.from(page._.filter(['color', 'quantity'], (value) => value === 'color')),
    ['color'],
  );
  const lexicalCapabilityTypes = vm.runInContext(
    `((_) => ({
      isEmpty: typeof _.isEmpty,
      filter: typeof _.filter,
    }))('b33cdffa-8647-4f29-8f0c-2a872166a726')`,
    page,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(lexicalCapabilityTypes)), {
    isEmpty: 'function',
    filter: 'function',
  });
});

test('detaches the debugger and fails closed when early Wing navigation cannot be prepared', async () => {
  const calls = [];
  const debuggerApi = {
    async attach() {
      calls.push('attach');
    },
    async sendCommand(_target, method) {
      calls.push(method);
      if (method === 'Page.addScriptToEvaluateOnNewDocument') {
        throw new Error('protocol unavailable');
      }
      return {};
    },
    async detach() {
      calls.push('detach');
    },
  };
  const context = loadCompat({ underscore: {}, debuggerApi });
  const compat = context.KidItemWingFormRuntimeCompat.create({
    chrome: context.chrome,
  });

  const result = await compat.prepareNavigation(
    42,
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2',
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /protocol unavailable/);
  assert.equal(calls.at(-1), 'detach');
});

test('inserts category text through the browser input domain on the exact Wing tab', async () => {
  const calls = [];
  const debuggerApi = {
    async attach(target, version) {
      calls.push(['attach', target.tabId, version]);
    },
    async sendCommand(target, method, params) {
      calls.push([method, target.tabId, params]);
      return {};
    },
    async detach(target) {
      calls.push(['detach', target.tabId]);
    },
  };
  const context = loadCompat({ underscore: {}, debuggerApi });
  const compat = context.KidItemWingFormRuntimeCompat.create({
    chrome: context.chrome,
  });

  const result = await compat.insertText(
    42,
    'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2',
    '열쇠고리/키홀더',
  );

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['attach', 42, '1.3'],
    ['Input.insertText', 42, { text: '열쇠고리/키홀더' }],
    ['detach', 42],
  ]);
});

test('injects the capability check into the main world of the exact tab', async () => {
  const calls = [];
  const context = loadCompat({
    underscore: {},
    executeScript: async (details) => {
      calls.push(details);
      return [{ result: { ok: true, status: 'installed' } }];
    },
  });
  const compat = context.KidItemWingFormRuntimeCompat.create({
    chrome: context.chrome,
  });

  const result = await compat.ensure(42);

  assert.equal(result.ok, true);
  assert.equal(result.status, 'installed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target.tabId, 42);
  assert.deepEqual(Object.keys(calls[0].target), ['tabId']);
  assert.equal(calls[0].world, 'MAIN');
  assert.equal(calls[0].func, context.KidItemWingFormRuntimeCompat.installInPage);
});

test('fails closed when the page runtime cannot be made compatible', async () => {
  const context = loadCompat({
    underscore: {},
    executeScript: async () => [{
      result: { ok: false, status: 'unsupported', error: 'underscore is immutable' },
    }],
  });
  const compat = context.KidItemWingFormRuntimeCompat.create({
    chrome: context.chrome,
  });

  const result = await compat.ensure(42);

  assert.equal(result.ok, false);
  assert.match(result.error, /immutable/);
});
