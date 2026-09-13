import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../../kiditem-os/content/coupang/ad-product-metrics.js', import.meta.url),
  'utf8',
);
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(requestResponse) {
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(source, context, { filename: 'ad-product-metrics.js' });
  return {
    collector: context.KidItemAdProductMetrics.create({
      requestJson: async (_path, init) => requestResponse(init),
    }),
    contract: context.KidItemAdProductMetrics,
  };
}

const metadata = {
  campaignId: '123',
  campaignIdentity: 'campaign:123',
  campaignName: 'manual',
  adGroupId: '456',
  adGroupName: 'group',
  adSelectionType: 'MANUAL_SELECTION',
  expectedGroupIds: ['456'],
  totalAdCount: 2,
  ads: [
    { adId: '101', vendorItemId: '1001', itemName: 'one', isActive: true },
    { adId: '102', vendorItemId: '1002', itemName: 'two', isActive: false },
  ],
  metadataByVendorItemId: new Map([
    ['1001', { productName: 'one', imageUrl: 'https://img/1', productUrl: 'https://item/1', rawColumns: { 상품명: 'one', 광고비: 'stale' } }],
    ['1002', { productName: 'two', imageUrl: 'https://img/2', productUrl: 'https://item/2', rawColumns: { 상품명: 'two', 매출: 'stale' } }],
  ]),
};

test('manual product collector sends exact KST day request and preserves explicit zero', async () => {
  let body;
  const h = load(async (init) => {
    body = JSON.parse(init.body);
    return {
      ok: true,
      data: {
        '101': {
          deliveredAdCost: 0,
          adAttributedSales: 10,
          impressions: 100,
          clicks: 4,
          adAttributedUnits: 2,
          adAttributedOrders: 1,
          ctr: 4,
          roas: 0,
          clickToOrder: 25,
        },
        '102': {
          deliveredAdCost: 20,
          adAttributedSales: 40,
          impressions: 200,
          clicks: 5,
          adAttributedUnits: 3,
          adAttributedOrders: 2,
        },
      },
    };
  });
  const result = await h.collector.collectDay({
    campaignId: '123', adGroupId: '456', businessDate: '2026-09-07', metadata,
  });
  assert.deepEqual(plain(body), {
    campaignIds: ['123'], adGroupId: '456', creativeId: null,
    start: Date.parse('2026-09-07T00:00:00+09:00'),
    end: Date.parse('2026-09-07T00:00:00+09:00'), tableType: 'product_sales',
    targetList: ['101', '102'], isMatchTypeEnabled: false,
  });
  assert.equal(result.rows[0].spend, 0);
  assert.equal(result.rows[0].revenue, 10);
  assert.equal(result.rows[0].conversionRate, 25);
  assert.equal(result.rows[0].rawColumns.광고비, undefined);
  assert.deepEqual(plain(result.proof.expectedGroupIds), ['456']);
  assert.equal(result.proof.totalAdCount, 2);
  assert.deepEqual(plain(result.proof.observedAdIds), ['101', '102']);
});

for (const [name, fixture] of [
  ['missing key', { '101': {} }],
  ['missing required metric', {
    '101': { deliveredAdCost: 1, adAttributedSales: 1, impressions: 1, clicks: 1, adAttributedUnits: 1 },
    '102': { deliveredAdCost: 1, adAttributedSales: 1, impressions: 1, clicks: 1, adAttributedUnits: 1, adAttributedOrders: 1 },
  }],
  ['unexpected key', {
    '101': { deliveredAdCost: 1, adAttributedSales: 1, impressions: 1, clicks: 1, adAttributedUnits: 1, adAttributedOrders: 1 },
    '102': { deliveredAdCost: 1, adAttributedSales: 1, impressions: 1, clicks: 1, adAttributedUnits: 1, adAttributedOrders: 1 },
    extra: { deliveredAdCost: 1 },
  }],
  ['null metric', {
    '101': { deliveredAdCost: null, adAttributedSales: 1, impressions: 1, clicks: 1, adAttributedUnits: 1, adAttributedOrders: 1 },
    '102': { deliveredAdCost: 1, adAttributedSales: 1, impressions: 1, clicks: 1, adAttributedUnits: 1, adAttributedOrders: 1 },
  }],
]) {
  test(`manual product collector rejects ${name}`, async () => {
    const h = load(async () => ({ ok: true, data: fixture }));
    await assert.rejects(
      h.collector.collectDay({ campaignId: '123', adGroupId: '456', businessDate: '2026-09-07', metadata }),
      /product_sales/i,
    );
  });
}

test('manual product collector rejects auto groups, duplicate metadata, and incomplete roster proof', async () => {
  const h = load(async () => ({ ok: true, data: {} }));
  await assert.rejects(
    h.collector.collectDay({ campaignId: '123', adGroupId: '456', businessDate: '2026-09-07', metadata: { ...metadata, adSelectionType: 'AUTO_SELECTION' } }),
    /MANUAL_SELECTION|manual/i,
  );
  await assert.rejects(
    h.collector.collectDay({ campaignId: '123', adGroupId: '456', businessDate: '2026-09-07', metadata: { ...metadata, totalAdCount: 1 } }),
    /roster|complete/i,
  );
  await assert.rejects(
    h.collector.collectDay({ campaignId: '123', adGroupId: '456', businessDate: '2026-09-07', metadata: {
      ...metadata,
      ads: [...metadata.ads, { ...metadata.ads[0], adId: '103' }],
      totalAdCount: 3,
    } }),
    /duplicate|metadata/i,
  );
});

test('manual product collector rejects non-canonical provider ids and coerced counts', async () => {
  const h = load(async () => ({ ok: true, data: {} }));
  for (const bad of [true, {}, [], '0x65', '1e2', '0101', '101.0']) {
    await assert.rejects(
      h.collector.collectDay({
        campaignId: '123',
        adGroupId: '456',
        businessDate: '2026-09-07',
        metadata: { ...metadata, ads: [{ ...metadata.ads[0], adId: bad }] },
      }),
      /id|decimal|roster/i,
    );
  }
  for (const bad of [true, {}, [], '2']) {
    await assert.rejects(
      h.collector.collectDay({
        campaignId: '123',
        adGroupId: '456',
        businessDate: '2026-09-07',
        metadata: { ...metadata, totalAdCount: bad },
      }),
      /count|roster|complete/i,
    );
  }
});
