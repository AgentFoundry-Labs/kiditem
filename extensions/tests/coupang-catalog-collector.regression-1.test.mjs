import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const helperPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../coupang-ads-scraper/shared/coupang-catalog-collector.js',
);

function loadHelper() {
  const context = { TextEncoder, URL, crypto };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, {
    filename: helperPath,
  });
  return context.KidItemCoupangCatalog;
}

// Regression: ISSUE-001 — Wing products exceeding shared array bounds stopped catalog collection
// Found by /qa on 2026-07-17
// Report: .gstack/qa-reports/qa-report-kiditem-local-2026-07-17.md
test('bounds Wing option attributes and media to the shared catalog contract', () => {
  const helper = loadHelper();
  const attributes = Array.from({ length: 105 }, (_, index) => ({
    attributeTypeName: `속성-${index}`,
    attributeValueName: `값-${index}`,
  }));
  const images = Array.from({ length: 105 }, (_, index) => ({
    imageOrder: index,
    cdnPath: `vendor_inventory/option-${index}.jpg`,
  }));
  const detailImages = Array.from(
    { length: 120 },
    (_, index) => `<img src="https://image1.coupangcdn.com/image/detail-${index}.jpg">`,
  ).join('');

  const product = helper.buildCatalogProduct({
    sellerProductId: 13675577630,
    sellerProductName: '경계 초과 상품',
    items: [{
      vendorItemId: 91000000001,
      itemName: '단품',
      attributes,
      images,
      contents: [{ contentDetails: [{ content: detailImages }] }],
    }],
  });

  assert.equal(product.options[0].attributes.length, 100);
  assert.equal(product.options[0].media.length, 100);
  assert.equal(product.media.length, 100);
  assert.deepEqual(
    JSON.parse(JSON.stringify(product.options[0].attributes.at(-1))),
    { type: '속성-99', value: '값-99' },
  );
});
