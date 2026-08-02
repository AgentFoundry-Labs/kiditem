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

async function scrape(
  responseBody,
  startDate = null,
  endDate = null,
  now = '2026-07-01T03:00:00.000Z',
) {
  let requestBody = null;
  let requestCount = 0;
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(args.length === 0 ? now : args[0]);
    }

    static now() {
      return new NativeDate(now).getTime();
    }
  }
  const context = vm.createContext({
    Date: FixedDate,
    JSON,
    Number,
    Object,
    Promise,
    String,
    URLSearchParams,
    fetch: async (_url, init) => {
      requestCount += 1;
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
  return {
    result: JSON.parse(JSON.stringify(result)),
    body: new URLSearchParams(requestBody),
    requestCount,
  };
}

test('issues one KST-yesterday request across a continuous 400-day evidence range', async () => {
  const { result, body, requestCount } = await scrape([{
    product_code: 'SKU-1',
    option_code: 'OPTION-1',
    product_name: '상품',
    graph: {
      '2026-04': '400,1000,2',
      '2026-06': '600,1500,3',
    },
  }], null, null, '2026-07-01T03:00:00.000Z');

  assert.equal(requestCount, 1);
  assert.equal(body.get('mode'), 'stat_prd_profit');
  assert.equal(body.get('s_date'), '2025-05-26');
  assert.equal(body.get('e_date'), '2026-06-30');
  assert.equal(body.get('in_s_date'), '2025-05-26');
  assert.equal(body.get('in_e_date'), '2026-06-30');
  assert.equal(body.get('buy_point'), 'R');
  assert.equal(body.get('vat_tp'), '1');
  assert.equal(result.success, true);
  assert.deepEqual(result.payload.provenance, {
    source: 'sellpia_stat_prd_profit',
    costBasis: 'ORDER_TIME_SUPPLY_COST',
    vatIncluded: true,
  });
  assert.deepEqual(result.payload.range, { from: '2025-05-26', to: '2026-06-30' });
  assert.deepEqual(result.payload.products[0].months, [
    { yearMonth: '2026-04', inAmount: 400, orderAmount: 1000, orderQty: 2, inQty: 0 },
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

test('ignores pure Sellpia financial adjustment rows without discarding product evidence', async () => {
  const { result } = await scrape([
    {
      product_code: 'SKU-1',
      option_code: 'OPTION-1',
      product_name: '정상 상품',
      sale_price: 12_000,
      buy_price: 7_000,
      dp_code: '8800000000001',
      graph: { '2026-06': '7000,12000,1' },
    },
    {
      product_code: '7382',
      option_code: '1',
      product_name: '할인',
      sale_price: 0,
      buy_price: 0,
      dp_code: '',
      graph: {
        '2025-09': '0,-27225,1',
        '2025-11': '0,-4950,1',
        '2026-06': '0,0,0',
      },
    },
  ]);

  assert.equal(result.success, true);
  assert.equal(result.productCount, 1);
  assert.equal(result.skippedAdjustmentCount, 1);
  assert.deepEqual(
    result.payload.products.map((product) => product.productCode),
    ['SKU-1'],
  );
});

test('does not silently drop negative revenue from an inventory-bearing product', async () => {
  const { result } = await scrape([{
    product_code: 'SKU-RETURN',
    option_code: 'OPTION-1',
    product_name: '반품 발생 상품',
    sale_price: 12_000,
    buy_price: 7_000,
    dp_code: '8800000000002',
    graph: { '2026-06': '0,-12000,1' },
  }]);

  assert.equal(result.success, false);
  assert.equal(result.payload, undefined);
});
