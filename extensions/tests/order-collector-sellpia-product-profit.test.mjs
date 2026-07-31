import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(
  path.join(testDir, '../kiditem-os/background/orders/worker.js'),
  'utf8',
);

const scraperStart = worker.indexOf('async function scrapeSellpiaProductProfit(');
const scraperEnd = worker.indexOf('\nasync function findOrCreateKakaoTab', scraperStart);
assert.notEqual(scraperStart, -1);
assert.notEqual(scraperEnd, -1);
const scraperSource = worker.slice(scraperStart, scraperEnd);

async function scrape(responseBody, startDate = '2025-07-01', endDate = '2026-06-30') {
  let requestBody = null;
  const context = vm.createContext({
    Date,
    JSON,
    Number,
    Object,
    Promise,
    String,
    URLSearchParams,
    fetch: async (_url, init) => {
      requestBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(responseBody),
      };
    },
  });
  const parser = vm.runInContext(`(${scraperSource})`, context, {
    filename: 'scrapeSellpiaProductProfit.js',
  });
  const result = await parser(startDate, endDate);
  return { result: JSON.parse(JSON.stringify(result)), body: new URLSearchParams(requestBody) };
}

test('requests whole-range order-time cost and fills every missing calendar month', async () => {
  const { result, body } = await scrape([{
    product_code: 'SKU-1',
    option_code: 'OPTION-1',
    product_name: '상품',
    graph: {
      '2026-04': '400,1000,2',
      '2026-06': '600,1500,3',
    },
  }]);

  assert.equal(body.get('mode'), 'stat_prd_profit');
  assert.equal(body.get('s_date'), '2025-07-01');
  assert.equal(body.get('e_date'), '2026-06-30');
  assert.equal(body.get('in_s_date'), '2025-07-01');
  assert.equal(body.get('in_e_date'), '2026-06-30');
  assert.equal(body.get('buy_point'), 'R');
  assert.equal(body.get('vat_tp'), '1');
  assert.equal(result.success, true);
  assert.deepEqual(result.payload.provenance, {
    source: 'sellpia_stat_prd_profit',
    costBasis: 'ORDER_TIME_SUPPLY_COST',
    vatIncluded: true,
  });
  assert.deepEqual(result.payload.products[0].months.slice(-3), [
    { yearMonth: '2026-04', inAmount: 400, orderAmount: 1000, orderQty: 2, inQty: 0 },
    { yearMonth: '2026-05', inAmount: 0, orderAmount: 0, orderQty: 0, inQty: 0 },
    { yearMonth: '2026-06', inAmount: 600, orderAmount: 1500, orderQty: 3, inQty: 0 },
  ]);
});

test('fails the entire collection for malformed, partial, or oversized provider rows', async () => {
  const invalidResponses = [
    [{ product_code: '', graph: { '2026-06': '1,2,3' } }],
    [{ product_code: 'SKU-1', graph: { '2026-06': '1,not-a-number,3' } }],
    [{ product_code: 'SKU-1', graph: { '2026-13': '1,2,3' } }],
    [{ product_code: 'SKU-1', graph: { '2026-06': '1,2' } }],
    [{ product_code: 'SKU-1', graph: [] }],
    Array.from({ length: 20_001 }, (_, index) => ({
      product_code: `SKU-${index}`,
      graph: { '2026-06': '1,2,3' },
    })),
  ];

  for (const response of invalidResponses) {
    const { result } = await scrape(response);
    assert.equal(result.success, false, JSON.stringify(response).slice(0, 200));
    assert.equal(result.payload, undefined);
  }
});
