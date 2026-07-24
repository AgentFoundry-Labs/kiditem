import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../product-scraper/content.js', import.meta.url),
  'utf8',
);

function loadContent(extractTrendSearch) {
  let runtimeMessageListener = null;
  let loaded = false;
  let elapsedMs = 0;
  const retryDelays = [];

  const window = {
    addEventListener() {},
    innerHeight: 800,
    location: { origin: 'https://s.1688.com' },
    scrollTo() {},
  };
  const context = vm.createContext({
    URL,
    console,
    document: {
      body: { innerText: '' },
      documentElement: { scrollHeight: 20_000 },
    },
    location: {
      href: 'https://s.1688.com/selloffer/offer_search.htm?keywords=test',
    },
    ProductScraper: {
      common: {
        detectPlatform: () => '1688',
      },
      alibaba: {},
      alibaba1688: {
        extractTrendSearch,
      },
    },
    chrome: {
      runtime: {
        id: 'product-scraper-test',
        lastError: null,
        onMessage: {
          addListener(listener) {
            runtimeMessageListener = listener;
          },
        },
        sendMessage() {},
      },
    },
    Promise,
    setTimeout(callback, delay) {
      if (!loaded) return 1; // Ignore the startup run timer.
      retryDelays.push(delay);
      // Model Chrome's once-per-second background timer alignment.
      elapsedMs += Math.max(1_000, Number(delay) || 0);
      Promise.resolve().then(callback);
      return retryDelays.length + 1;
    },
    window,
  });

  vm.runInContext(source, context, { filename: 'content.js' });
  loaded = true;
  assert.equal(typeof runtimeMessageListener, 'function');

  return {
    elapsedMs: () => elapsedMs,
    retryDelays,
    triggerTrendExtract(maxResults = 20) {
      return new Promise((resolve) => {
        const keepChannelOpen = runtimeMessageListener(
          { type: 'TRIGGER_1688_TREND_EXTRACT', maxResults },
          {},
          resolve,
        );
        assert.equal(keepChannelOpen, true);
      });
    },
  };
}

test('keeps empty-result retries below the outer 20 second message timeout', async () => {
  let extractionCount = 0;
  const content = loadContent(() => {
    extractionCount += 1;
    return { items: [], totalFound: 0 };
  });

  const result = await content.triggerTrendExtract();

  assert.equal(result.ok, false);
  assert.match(result.error, /상품 카드를 찾지 못했습니다/);
  assert.equal(extractionCount, 16);
  assert.equal(content.retryDelays.length, 15);
  assert.equal(content.retryDelays.every((delay) => delay === 750), true);
  assert.equal(content.elapsedMs(), 15_000);
  assert.ok(content.elapsedMs() < 20_000);
});

test('captures cards that render after the former twelve-attempt boundary', async () => {
  let extractionCount = 0;
  const item = { offerId: '100000001', title: 'late card' };
  const content = loadContent(() => {
    extractionCount += 1;
    return {
      items: extractionCount >= 13 ? [item] : [],
      totalFound: extractionCount >= 13 ? 1 : 0,
    };
  });

  const result = await content.triggerTrendExtract();

  assert.equal(result.ok, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.items)),
    [item],
  );
  assert.equal(extractionCount, 16);
  assert.ok(content.elapsedMs() < 20_000);
});
