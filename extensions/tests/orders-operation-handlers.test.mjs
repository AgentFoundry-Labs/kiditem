import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const worker = readFileSync(resolve(
  process.cwd(),
  'extensions/kiditem-os/background/orders/worker.js',
), 'utf8');

test('dashboard collection operations are exact browser handlers', () => {
  assert.match(
    worker,
    /"orders\.collect_all_marketplace_orders": runMarketplaceOrderCollectionOperation/,
  );
  assert.match(
    worker,
    /"inventory\.collect_coupang_shipment_summary": runCoupangShipmentSummaryOperation/,
  );
  assert.match(
    worker,
    /"channels\.collect_coupang_rocket_purchase_orders": runCoupangRocketPurchaseOrderOperation/,
  );
  assert.match(
    worker,
    /"\/api\/coupang-shipments\/date-summary"/,
  );
  assert.match(worker, /"\/api\/purchase-orders"/);
  assert.doesNotMatch(worker, /operations:\s*\{[^}]*generic/i);
});
