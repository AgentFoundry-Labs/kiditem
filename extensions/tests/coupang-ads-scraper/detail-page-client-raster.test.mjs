import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = await readFile(
  new URL(
    '../../coupang-ads-scraper/background/detail-page-client-raster.js',
    import.meta.url,
  ),
  'utf8',
).catch(() => '');

const INTENT_ID = '77777777-7777-4777-8777-777777777777';
const REVISION_ID = '55555555-5555-4555-8555-555555555555';

function jpegBase64(width = 780, height = 1200) {
  const bytes = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  return Buffer.from(bytes).toString('base64');
}

async function sha256Base64(value) {
  const bytes = Buffer.from(value, 'base64');
  const digest = await webcrypto.subtle.digest('SHA-256', bytes);
  return Buffer.from(digest).toString('hex');
}

function loadModule() {
  assert.ok(source, 'detail-page-client-raster.js must exist');
  const context = vm.createContext({
    URL,
    Blob,
    Headers,
    Uint8Array,
    ArrayBuffer,
    TextEncoder,
    TextDecoder,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, context, { filename: 'detail-page-client-raster.js' });
  return context.KidItemDetailPageClientRaster;
}

function createHarness(options = {}) {
  const calls = [];
  const stored = new Map();
  if (options.cached) stored.set(INTENT_ID, options.cached);
  const cache = {
    get: async (id) => stored.get(id) ?? null,
    put: async (entry) => stored.set(entry.intentId, entry),
    delete: async (id) => stored.delete(id),
  };
  const chrome = {
    tabs: {
      get: async (tabId) => {
        calls.push(['tabs.get', tabId]);
        return {
          id: tabId,
          url:
            options.finalTabUrl ??
            `https://staging.merchon.org/detail-page-client-render?intentId=${INTENT_ID}`,
        };
      },
      remove: async (tabId) => calls.push(['tabs.remove', tabId]),
    },
    windows: {
      create: async (input) => {
        calls.push(['windows.create', input]);
        return { id: 88, tabs: [{ id: 77 }] };
      },
      remove: async (windowId) => calls.push(['windows.remove', windowId]),
    },
    debugger: {
      attach: async (target, version) => calls.push(['debugger.attach', target, version]),
      detach: async (target) => calls.push(['debugger.detach', target]),
      sendCommand: async (target, method, params) => {
        calls.push(['debugger.sendCommand', target, method, params]);
        if (method === 'Runtime.evaluate') {
          return {
            result: {
              value: {
                status: options.renderStatus ?? 'ready',
                intentId: INTENT_ID,
                revisionId: REVISION_ID,
                width: 720,
                height: 1200,
              },
            },
          };
        }
        if (method === 'Page.captureScreenshot') {
          if (options.captureError) throw new Error('capture failed');
          return { data: jpegBase64() };
        }
        if (method === 'Page.getLayoutMetrics') {
          return {
            cssContentSize: {
              width: options.layoutWidth ?? 720,
              height: options.layoutHeight ?? 1200,
            },
          };
        }
        return {};
      },
    },
  };
  const claim = {
    intentId: INTENT_ID,
    revisionId: REVISION_ID,
    variant: 'wing-client-jpeg-v1',
    outputWidth: 780,
    renderDocumentUrl:
      `https://staging.merchon.org/detail-page-client-render?intentId=${INTENT_ID}`,
    upload: {
      url: 'https://storage.example.com/signed',
      headers: {
        'Content-Type': 'image/jpeg',
        'x-amz-meta-intent-id': INTENT_ID,
      },
      expiresAt: '2026-07-26T01:00:00.000Z',
    },
    ...(options.claim ?? {}),
  };
  const artifact = {
    artifactId: '88888888-8888-4888-8888-888888888888',
    revisionId: REVISION_ID,
    imageUrl: 'https://cdn.example.com/detail.jpg',
    outputWidth: 780,
    contentType: 'image/jpeg',
    byteLength: 25,
    pixelWidth: 780,
    pixelHeight: 1200,
    sha256: 'a'.repeat(64),
  };
  const authedFetch = async (_environmentId, path, init) => {
    calls.push(['authedFetch', path, init]);
    if (path.endsWith('/claim')) return jsonResponse(claim);
    if (path.endsWith('/finalize')) {
      return jsonResponse({
        intentId: INTENT_ID,
        revisionId: REVISION_ID,
        state: 'completed',
        expiresAt: '2026-07-26T01:10:00.000Z',
        error: null,
        artifact,
      });
    }
    if (path.endsWith('/fail')) return jsonResponse({ state: 'failed' });
    throw new Error(`unexpected path ${path}`);
  };
  const uploadBodies = [];
  const fetchFn = async (url, init) => {
    calls.push(['upload', url, init]);
    uploadBodies.push(init.body);
    return { ok: options.uploadOk !== false, status: options.uploadOk === false ? 503 : 200 };
  };
  const progress = [];
  const renderer = loadModule().create({
    chrome,
    authedFetch,
    fetchFn,
    resolveEnvironment: () => ({ webOrigin: 'https://staging.merchon.org' }),
    cache,
    now: () => Date.parse('2026-07-26T00:00:00.000Z'),
    readinessTimeoutMs: 50,
    readinessPollMs: 1,
  });
  return { artifact, cache, calls, chrome, progress, renderer, stored, uploadBodies };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('captures exactly one 780px JPEG, uploads it, finalizes, and cleans its unfocused owned window', async () => {
  const harness = createHarness();

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: INTENT_ID,
    onProgress: (phase) => harness.progress.push(phase),
  });

  assert.equal(result.status, 'rendered');
  assert.equal(result.artifact.imageUrl, harness.artifact.imageUrl);
  assert.deepEqual(harness.progress, ['loading', 'capturing', 'uploading', 'finalizing']);
  assert.equal(
    harness.calls.filter((call) => call[2] === 'Page.captureScreenshot').length,
    1,
  );
  const layoutMetricsIndex = harness.calls.findIndex(
    (call) => call[2] === 'Page.getLayoutMetrics',
  );
  const hideScrollbarsIndex = harness.calls.findIndex(
    (call) => call[2] === 'Emulation.setScrollbarsHidden',
  );
  const captureIndex = harness.calls.findIndex(
    (call) => call[2] === 'Page.captureScreenshot',
  );
  assert.ok(hideScrollbarsIndex >= 0 && hideScrollbarsIndex < layoutMetricsIndex);
  assert.equal(harness.calls[hideScrollbarsIndex][3].hidden, true);
  assert.ok(layoutMetricsIndex >= 0 && layoutMetricsIndex < captureIndex);
  assert.equal(harness.calls[captureIndex][3].quality, 90);
  const createdWindows = harness.calls.filter((call) => call[0] === 'windows.create');
  assert.equal(createdWindows.length, 1);
  assert.equal(createdWindows[0][1].focused, false);
  assert.equal(createdWindows[0][1].url, 'about:blank');
  const navigateIndex = harness.calls.findIndex(
    (call) => call[2] === 'Page.navigate',
  );
  const readyPollIndex = harness.calls.findIndex(
    (call) => call[2] === 'Runtime.evaluate',
  );
  assert.ok(navigateIndex >= 0 && navigateIndex < readyPollIndex);
  assert.equal(
    harness.calls[navigateIndex][3].url,
    `https://staging.merchon.org/detail-page-client-render?intentId=${INTENT_ID}`,
  );
  assert.ok(harness.calls.some((call) => call[0] === 'debugger.detach'));
  assert.ok(harness.calls.some((call) => call[0] === 'windows.remove' && call[1] === 88));
  assert.equal(harness.calls.some((call) => call[0] === 'tabs.remove'), false);
  assert.ok(
    harness.calls.some(
      (call) => call[0] === 'authedFetch' && call[1].endsWith('/finalize'),
    ),
  );
  assert.equal(harness.stored.has(INTENT_ID), false);
});

test('reuses a verified matching IndexedDB JPEG after upload failure without recapturing', async () => {
  const bytesBase64 = jpegBase64();
  const harness = createHarness({
    cached: {
      intentId: INTENT_ID,
      revisionId: REVISION_ID,
      variant: 'wing-client-jpeg-v1',
      outputWidth: 780,
      pixelWidth: 780,
      pixelHeight: 1200,
      byteLength: Buffer.from(bytesBase64, 'base64').byteLength,
      sha256: await sha256Base64(bytesBase64),
      bytesBase64,
      expiresAt: Date.parse('2026-07-26T00:05:00.000Z'),
    },
  });

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: INTENT_ID,
  });

  assert.equal(result.status, 'rendered');
  assert.equal(harness.calls.some((call) => call[0] === 'windows.create'), false);
  assert.equal(harness.calls.some((call) => call[2] === 'Page.captureScreenshot'), false);
  assert.ok(harness.calls.some((call) => call[0] === 'upload'));
});

test('discards a corrupted IndexedDB capture and captures a fresh JPEG', async () => {
  const bytesBase64 = jpegBase64();
  const harness = createHarness({
    cached: {
      intentId: INTENT_ID,
      revisionId: REVISION_ID,
      variant: 'wing-client-jpeg-v1',
      outputWidth: 780,
      pixelWidth: 780,
      pixelHeight: 1200,
      byteLength: Buffer.from(bytesBase64, 'base64').byteLength,
      sha256: 'a'.repeat(64),
      bytesBase64,
      expiresAt: Date.parse('2026-07-26T00:05:00.000Z'),
    },
  });

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: INTENT_ID,
  });

  assert.equal(result.status, 'rendered');
  assert.equal(
    harness.calls.filter((call) => call[2] === 'Page.captureScreenshot').length,
    1,
  );
});

test('service worker accepts raster ports only from a configured KidItem origin', async () => {
  const serviceWorker = await readFile(
    new URL('../../coupang-ads-scraper/background/service-worker.js', import.meta.url),
    'utf8',
  );

  assert.match(serviceWorker, /onConnectExternal\.addListener/);
  assert.match(serviceWorker, /environmentContext\.resolveSender\(port\.sender\)/);
  assert.match(serviceWorker, /!senderEnvironment[\s\S]*port\.disconnect\(\)/);
});

test('rejects a render document URL outside the claimed KidItem environment', async () => {
  const harness = createHarness({
    claim: {
      renderDocumentUrl:
        `https://evil.example/detail-page-client-render?intentId=${INTENT_ID}`,
    },
  });

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: INTENT_ID,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'claim_invalid');
  assert.equal(harness.calls.some((call) => call[0] === 'windows.create'), false);
});

test('rejects a renderer tab redirected away from the claimed route', async () => {
  const harness = createHarness({ finalTabUrl: 'https://example.com/' });

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: INTENT_ID,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'render_tab_mismatch');
  assert.equal(
    harness.calls.some((call) => call[2] === 'Page.captureScreenshot'),
    false,
  );
});

test('marks a terminal renderer-document failure before capture instead of leaving the intent claimed', async () => {
  const harness = createHarness({ renderStatus: 'error' });

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: INTENT_ID,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'render_document_failed');
  assert.equal(
    harness.calls.some((call) => call[2] === 'Page.captureScreenshot'),
    false,
  );
  assert.ok(
    harness.calls.some(
      (call) => call[0] === 'authedFetch' && call[1].endsWith('/fail'),
    ),
  );
});

test('reports bounded actual and expected dimensions for an invalid final layout', async () => {
  const harness = createHarness({ layoutWidth: 721, layoutHeight: 1201 });

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: INTENT_ID,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'render_layout_invalid');
  assert.match(result.error.message, /721x1201/);
  assert.match(result.error.message, /720x1200/);
});

test('reports a capture failure, detaches debugger, closes its owned window, and marks intent failed', async () => {
  const harness = createHarness({ captureError: true });

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: INTENT_ID,
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error.message, /capture failed/);
  assert.ok(harness.calls.some((call) => call[0] === 'debugger.detach'));
  assert.ok(
    harness.calls.some(
      (call) => call[0] === 'windows.remove' && call[1] === 88,
    ),
  );
  assert.equal(harness.calls.some((call) => call[0] === 'tabs.remove'), false);
  assert.ok(
    harness.calls.some(
      (call) => call[0] === 'authedFetch' && call[1].endsWith('/fail'),
    ),
  );
});

test('rejects malformed intent IDs before opening a tab or calling the API', async () => {
  const harness = createHarness();

  const result = await harness.renderer.run({
    environmentId: 'staging',
    intentId: '../revision',
  });

  assert.equal(result.status, 'failed');
  assert.equal(harness.calls.length, 0);
});
