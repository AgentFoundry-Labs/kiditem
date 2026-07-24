import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../coupang-ads-scraper/shared/wing-account-identity.js', import.meta.url),
  'utf8',
);

function attributeNode(attribute, value) {
  return {
    getAttribute(name) {
      return name === attribute ? value : null;
    },
  };
}

function identityFor({
  expectedVendorId,
  href = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2',
  dataVendorIds = [],
  metaVendorIds = [],
  labeledTexts = [],
  inlineScripts = [],
}) {
  const context = vm.createContext({
    URL,
    document: {
      querySelectorAll(selector) {
        if (selector === '[data-vendor-id]') {
          return dataVendorIds.map((value) =>
            attributeNode('data-vendor-id', value),
          );
        }
        if (selector === 'meta[name="vendor-id"], meta[name="vendorId"]') {
          return metaVendorIds.map((value) => attributeNode('content', value));
        }
        if (selector === '.vendor-id-wrapper, .my-user-menu-top') {
          return labeledTexts.map((textContent) => ({ textContent }));
        }
        if (selector === 'script:not([src])') {
          return inlineScripts.map((textContent) => ({ textContent }));
        }
        return [];
      },
    },
    location: { href },
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'wing-account-identity.js' });
  return context.KidItemWingAccountIdentity.verifyExpectedVendorId(expectedVendorId);
}

test('accepts an exact, single persisted WING vendor identity before mutation', () => {
  const result = identityFor({
    expectedVendorId: 'A00012345',
    dataVendorIds: ['A00012345'],
  });

  assert.equal(result.ok, true);
  assert.equal(result.vendorId, 'A00012345');
  assert.equal(result.source, 'dom:data-vendor-id');
});

test('refuses a mismatched, absent, or ambiguous WING vendor identity', () => {
  assert.equal(identityFor({
    expectedVendorId: 'A00012345',
    dataVendorIds: ['B00012345'],
  }).ok, false);
  assert.equal(identityFor({ expectedVendorId: 'A00012345' }).ok, false);
  assert.equal(identityFor({
    expectedVendorId: 'A00012345',
    dataVendorIds: ['A00012345', 'B00012345'],
  }).ok, false);
});

test('accepts the rendered WING account label as the sole identity signal', () => {
  const result = identityFor({
    expectedVendorId: 'A00057379',
    labeledTexts: ['판매자 계정 · 업체코드 A00057379'],
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      ok: true,
      vendorId: 'A00057379',
      source: 'dom:vendor-code-label',
    },
  );
});

test('refuses multiple vendor ids declared inside the same inline script', () => {
  const result = identityFor({
    expectedVendorId: 'A00012345',
    inlineScripts: [
      `window.__BOOT__ = {
        current: { vendorId: 'A00012345' },
        rows: [{ "vendorId": "B00012345" }]
      };`,
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /ambiguous/);
});

test('refuses disagreement between the rendered account label and inline data', () => {
  const result = identityFor({
    expectedVendorId: 'A00012345',
    labeledTexts: ['업체코드 A00012345'],
    inlineScripts: [`window.__BOOT__ = { vendorId: 'B00012345' };`],
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /ambiguous/);
});
