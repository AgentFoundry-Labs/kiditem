import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const converterSource = readFileSync(
  path.join(repoRoot, 'extensions/kiditem-os/background/orders/order-collection-server-converter.js'),
  'utf8',
);

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';
const ENVIRONMENT_ID = 'local';

function createConverter(request) {
  const context = vm.createContext({
    ArrayBuffer,
    Blob,
    Error,
    FormData,
    Headers,
    Promise,
    Response,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    atob,
    btoa,
    structuredClone,
  });
  vm.runInContext(converterSource, context, { filename: 'order-collection-server-converter.js' });
  return context.KidItemOrderCollectionServerConverter.create({ request });
}

function attempt(mallKey) {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    plan: {
      collectionDate: '2026-09-10',
      mallKey,
    },
  };
}

function okResponse(headers = {}) {
  return new Response('converted', {
    status: 200,
    headers: {
      'Content-Disposition': 'attachment; filename="converted.xls"',
      'X-Order-Collection-Artifact-Id': '33333333-3333-4333-8333-333333333333',
      'X-Order-Collection-Source-Rows': '2',
      'X-Order-Collection-Product-Rows': '2',
      'X-Order-Collection-Output-Rows': '2',
      'X-Order-Collection-Skipped-Rows': '0',
      ...headers,
    },
  });
}

test('filters Icecream automatic rows using the frozen trimmed-cell criterion and returns only scalar receipt fields', async () => {
  let requestInput;
  let requestCount = 0;
  const converter = createConverter(async (_environmentId, endpoint, init) => {
    requestCount += 1;
    requestInput = { endpoint, init };
    return okResponse(requestCount === 1 ? {} : {
      'X-Order-Collection-Source-Rows': '',
      'X-Order-Collection-Product-Rows': 'not-a-count',
      'X-Order-Collection-Output-Rows': '-1',
      'X-Order-Collection-Skipped-Rows': '1.5',
    });
  });
  const capture = {
    headers: ['주문번호', '상품'],
    rows: [
      [' A-1 ', '연필'],
      ['B-2', '노트'],
    ],
    rowCount: 2,
    source: 'icecream-grid',
  };

  const receipt = await converter.convert({
    environmentId: ENVIRONMENT_ID,
    attempt: attempt('icecream-mall'),
    mallKey: 'icecream-mall',
    capture,
    plan: { selectionMode: 'automatic', seenRowKeys: ['A-1\u001f연필'] },
    input: {
      selectionMode: 'manual',
      seenRowKeys: [],
    },
  });

  assert.equal(requestInput.endpoint, '/api/orders/collection/icecream-mall/convert-rows');
  assert.equal(requestInput.init.headers['x-order-collection-attempt-id'], ATTEMPT_ID);
  assert.equal(requestInput.init.headers['x-source-attempt-token'], ATTEMPT_TOKEN);
  const body = JSON.parse(requestInput.init.body);
  assert.deepEqual(body.rows, [['B-2', '노트']]);
  assert.deepEqual(body.originalRows, capture.rows);
  assert.deepEqual(body.seenRowKeys, ['A-1\u001f연필']);
  assert.deepEqual(body.selectedRowKeys, ['B-2\u001f노트']);
  assert.equal(body.selectionMode, 'automatic');
  assert.equal(body.sourceRows.length, 2);
  assert.deepEqual(Object.keys(receipt).sort(), [
    'artifactId',
    'fileName',
    'outputRows',
    'productRows',
    'skippedRows',
    'sourceRows',
    'success',
  ]);
  assert.equal(receipt.success, true);

  const missingCounts = await converter.convert({
    environmentId: ENVIRONMENT_ID,
    attempt: attempt('icecream-mall'),
    mallKey: 'icecream-mall',
    capture: { headers: ['주문번호'], rows: [['C-3']] },
    plan: { selectionMode: 'manual', seenRowKeys: [] },
  });
  assert.equal(missingCounts.sourceRows, null);
  assert.equal(missingCounts.productRows, null);
  assert.equal(missingCounts.outputRows, null);
  assert.equal(missingCounts.skippedRows, null);
});

test('preserves unsupported Kakao capture as the exact failure source payload', async () => {
  const converter = createConverter(async () => {
    throw new Error('the unsupported path must not request conversion');
  });
  const capture = {
    success: true,
    orders: [{ orderNo: 'K-1', providerStatus: '배송준비중' }],
    rawResponse: { page: 1 },
  };

  await assert.rejects(
    converter.convert({
      environmentId: ENVIRONMENT_ID,
      attempt: attempt('kakao'),
      mallKey: 'kakao',
      capture,
    }),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_CONVERSION');
      assert.equal(error.conversionLocal, true);
      assert.strictEqual(error.sourcePayload, capture);
      return true;
    },
  );
});

test('uses only the admitted plan date for a file converter without normalizing the workbook into JSON', async () => {
  let requestInput;
  const converter = createConverter(async (_environmentId, endpoint, init) => {
    requestInput = { endpoint, init };
    return okResponse();
  });
  const workbookBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
  const workbookBase64 = btoa(String.fromCharCode(...workbookBytes));

  await converter.convert({
    environmentId: ENVIRONMENT_ID,
    attempt: attempt('domeggook'),
    mallKey: 'domeggook',
    capture: {
      success: true,
      csvBase64: workbookBase64,
      fileName: 'domeggook.csv',
      confirmedCoverage: { startDate: '2026-09-10', endDate: '2026-09-10' },
    },
    plan: { collectionDate: '2026-09-10' },
    input: { date: '1999-01-01' },
  });

  assert.equal(requestInput.endpoint, '/api/orders/collection/domeggook/convert');
  assert.equal(
    requestInput.init.headers['x-order-collection-coverage-start-date'],
    '2026-09-10',
  );
  assert.equal(
    requestInput.init.headers['x-order-collection-coverage-end-date'],
    '2026-09-10',
  );
  assert.ok(requestInput.init.body instanceof FormData);
  assert.equal(requestInput.init.body.get('date'), '2026-09-10');
  const file = requestInput.init.body.get('file');
  assert.equal(file.name, 'domeggook.csv');
  assert.deepEqual(
    [...new Uint8Array(await file.arrayBuffer())],
    [...workbookBytes],
  );
});

test('sends only an explicit provider-confirmed coverage receipt and never copies the plan window', async () => {
  const requests = [];
  const converter = createConverter(async (_environmentId, endpoint, init) => {
    requests.push({ endpoint, init });
    return okResponse();
  });

  await converter.convert({
    environmentId: ENVIRONMENT_ID,
    attempt: attempt('haebub-mall'),
    mallKey: 'haebub-mall',
    capture: {
      orders: [{ orderId: 'H-1' }],
      confirmedCoverage: { startDate: '2026-09-10', endDate: '2026-09-10' },
    },
    plan: { collectionDate: '2026-09-10' },
  });
  await converter.convert({
    environmentId: ENVIRONMENT_ID,
    attempt: attempt('haebub-mall'),
    mallKey: 'haebub-mall',
    capture: { orders: [{ orderId: 'H-2' }] },
    plan: { collectionDate: '2026-09-10' },
  });

  assert.equal(
    requests[0].init.headers['x-order-collection-coverage-start-date'],
    '2026-09-10',
  );
  assert.equal(
    requests[0].init.headers['x-order-collection-coverage-end-date'],
    '2026-09-10',
  );
  assert.equal('x-order-collection-coverage-start-date' in requests[1].init.headers, false);
  assert.equal('x-order-collection-coverage-end-date' in requests[1].init.headers, false);
});

test('rejects a malformed provider coverage receipt before transport', async () => {
  let requestCount = 0;
  const converter = createConverter(async () => {
    requestCount += 1;
    return okResponse();
  });

  await assert.rejects(
    converter.convert({
      environmentId: ENVIRONMENT_ID,
      attempt: attempt('haebub-mall'),
      mallKey: 'haebub-mall',
      capture: {
        orders: [{ orderId: 'H-1' }],
        confirmedCoverage: { startDate: '2026-09-10' },
      },
      plan: { collectionDate: '2026-09-10' },
    }),
    (error) => {
      assert.equal(error.code, 'CAPTURE_INVALID');
      assert.equal(error.conversionLocal, true);
      return true;
    },
  );
  assert.equal(requestCount, 0);
});

test('reports explicit NO_NEW_ORDERS with retained original Icecream evidence when every row was seen', async () => {
  const converter = createConverter(async () => {
    throw new Error('the empty path must not request conversion');
  });
  const rows = [['A-1', '연필']];

  await assert.rejects(
    converter.convert({
      environmentId: ENVIRONMENT_ID,
      attempt: attempt('icecream-mall'),
      mallKey: 'icecream-mall',
      capture: { success: true },
      plan: { selectionMode: 'automatic', seenRowKeys: [] },
    }),
    (error) => {
      assert.equal(error.code, 'CAPTURE_INVALID');
      assert.equal(error.conversionLocal, true);
      assert.deepEqual(error.sourcePayload, { success: true });
      return true;
    },
  );

  await assert.rejects(
    converter.convert({
      environmentId: ENVIRONMENT_ID,
      attempt: attempt('icecream-mall'),
      mallKey: 'icecream-mall',
      capture: { headers: ['주문번호', '상품'], rows },
      plan: { selectionMode: 'automatic', seenRowKeys: ['A-1\u001f연필'] },
    }),
    (error) => {
      assert.equal(error.code, 'NO_NEW_ORDERS');
      assert.equal(error.conversionLocal, true);
      assert.equal(error.empty, true);
      const sourcePayload = JSON.parse(JSON.stringify(error.sourcePayload));
      assert.deepEqual(sourcePayload.originalRows, rows);
      assert.deepEqual(sourcePayload.selectedRows, []);
      assert.deepEqual(sourcePayload.seenRowKeys, ['A-1\u001f연필']);
      return true;
    },
  );
});

test('marks a request-dispatch rejection as transport-ambiguous', async () => {
  const converter = createConverter(async () => {
    throw new Error('request timed out');
  });

  await assert.rejects(
    converter.convert({
      environmentId: ENVIRONMENT_ID,
      attempt: attempt('kidsnote'),
      mallKey: 'kidsnote',
      capture: { orders: [{ ono: 'K-1' }] },
    }),
    (error) => {
      assert.equal(error.conversionTransport, true);
      assert.equal(error.conversionLocal, undefined);
      return true;
    },
  );
});
