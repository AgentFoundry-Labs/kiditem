import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(
  path.join(testDir, '../order-collector/background/service-worker.js'),
  'utf8',
);

const scraperStart = worker.indexOf('async function scrapeSellpiaSaleSummary(');
const scraperEnd = worker.indexOf(
  '\nasync function findOrCreateSellpiaProductProfitTab',
  scraperStart,
);
assert.notEqual(scraperStart, -1);
assert.notEqual(scraperEnd, -1);
const scraperSource = worker.slice(scraperStart, scraperEnd);

async function scrape(responseBody, providerNames = {}) {
  const context = vm.createContext({
    Date,
    JSON,
    Number,
    Object,
    Promise,
    String,
    URLSearchParams,
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responseBody),
    }),
    provider_list_all: providerNames,
    setTimeout,
  });
  const scraper = vm.runInContext(`(${scraperSource})`, context, {
    filename: 'scrapeSellpiaSaleSummary.js',
  });
  return scraper('2026-07-17', '2026-07-18');
}

test('Sellpia sales background cache is bound to the active organization', () => {
  assert.match(
    worker,
    /const SELLPIA_SALES_ORGANIZATION_KEY = "sellpiaSaleSummaryOrganizationId"/,
  );
  assert.match(
    worker,
    /normalizeSellpiaSalesOrganizationId\(msg\.organizationId\)/,
  );
  assert.match(
    worker,
    /cache\?\.organizationId === organizationId \? cache : null/,
  );
  assert.match(
    worker,
    /\[SELLPIA_SALES_CACHE_KEY\]: \{\s*organizationId,\s*payload: result\.payload,/,
  );
  assert.match(worker, /collectSellpiaSaleSummaryAuthoritativeV1:\s*true/);
  assert.match(worker, /sellers\.length > 0 \|\| explicitEmpty/);
});

test('sale_summary parser accepts complete seller rows and keeps numeric zeroes', async () => {
  const result = await scrape(
    {
      118: {
        '2026-07-17': {
          price: '1,200',
          amount: '0',
          buy_price: 700,
          extra_metric: 'allowed',
        },
      },
    },
    { 118: '스마트스토어' },
  );

  assert.equal(result.success, true);
  assert.equal(result.payload.sellers.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.payload.sellers[0])),
    {
      sellerId: '118',
      sellerName: '스마트스토어',
      days: [{ date: '2026-07-17', price: 1200, amount: 0, buyPrice: 700 }],
    },
  );
  assert.equal(result.payload.provenance, undefined);
});

test('only a structurally empty seller object produces explicit-empty provenance', async () => {
  const result = await scrape({});

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.payload)), {
    range: { from: '2026-07-17', to: '2026-07-18' },
    sellers: [],
    provenance: {
      source: 'sellpia_sale_summary',
      mode: 'selldate',
      sellerScope: 'all',
      responseShape: 'empty_object',
      explicitEmpty: true,
    },
  });
});

test('error envelopes, arrays, null, and unknown seller keys fail closed', async () => {
  for (const responseBody of [
    null,
    [],
    { success: false, error: 'login required' },
    { filtered: {} },
    { constructor: { '2026-07-17': { price: 1, amount: 1, buy_price: 1 } } },
    { 999: { '2026-07-17': { price: 1, amount: 1, buy_price: 1 } } },
  ]) {
    const result = await scrape(responseBody, { 118: '스마트스토어' });
    assert.equal(result.success, false, JSON.stringify(responseBody));
    assert.equal(result.payload, undefined, JSON.stringify(responseBody));
  }
});

test('partial seller/day responses fail as a whole instead of being silently skipped', async () => {
  const partialResponses = [
    { 118: {} },
    { 118: { summary: { price: 1, amount: 1, buy_price: 1 } } },
    { 118: { '2026-07-16': { price: 1, amount: 1, buy_price: 1 } } },
    { 118: { '2026-07-17': { price: 1, amount: 1 } } },
    { 118: { '2026-07-17': { price: 'N/A', amount: 1, buy_price: 1 } } },
    {
      118: {
        '2026-07-17': { price: 1, amount: 1, buy_price: 1 },
        '2026-02-30': { price: 1, amount: 1, buy_price: 1 },
      },
    },
  ];

  for (const responseBody of partialResponses) {
    const result = await scrape(responseBody, { 118: '스마트스토어' });
    assert.equal(result.success, false, JSON.stringify(responseBody));
    assert.equal(result.payload, undefined, JSON.stringify(responseBody));
  }
});
