import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../coupang-ads-scraper/shared/wing-account-identity.js', import.meta.url),
  'utf8',
);

function identityFor({ expectedVendorId, href = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2', elements = [] }) {
  const context = vm.createContext({
    URL,
    document: {
      querySelectorAll(selector) {
        if (selector === '[data-vendor-id]') return elements;
        if (selector === 'meta[name="vendor-id"], meta[name="vendorId"]') return elements;
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
    elements: [{ getAttribute: (name) => name === 'data-vendor-id' ? 'A00012345' : null }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.vendorId, 'A00012345');
  assert.equal(result.source, 'dom:data-vendor-id');
});

test('refuses a mismatched, absent, or ambiguous WING vendor identity', () => {
  assert.equal(identityFor({
    expectedVendorId: 'A00012345',
    elements: [{ getAttribute: () => 'B00012345' }],
  }).ok, false);
  assert.equal(identityFor({ expectedVendorId: 'A00012345' }).ok, false);
  assert.equal(identityFor({
    expectedVendorId: 'A00012345',
    elements: [
      { getAttribute: () => 'A00012345' },
      { getAttribute: () => 'B00012345' },
    ],
  }).ok, false);
});
