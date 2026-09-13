import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../kiditem-os/content/sourcing/content.js', import.meta.url), 'utf8');
const product = JSON.parse(await readFile(new URL('../fixtures/1688-product-detail-v1.json', import.meta.url), 'utf8'));
const description = { description_images: ['https://cbu01.alicdn.com/description.jpg'], description_text: '설명 본문', description_image_count: 1 };
const clone = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function fixture({ pageType = 'detail', platform = '1688', desc = description, deferred = false } = {}) {
  const messages = [], delays = [], waits = [];
  let listener, loaded = false;
  const payload = { ...product, page_type: pageType,
    ...(platform === 'ALIBABA' ? { source_platform: 'ALIBABA', source_url: 'https://www.alibaba.com/product-detail/test_160000000001.html' } : {}) };
  const extractor = {
    extract: () => clone(payload),
    scrollToDescription: () => desc ? {} : null,
    waitForDescriptionContent: (_element, timeout) => {
      assert.equal(timeout, 8000);
      return deferred ? new Promise((resolve) => waits.push(resolve)) : Promise.resolve();
    },
    collectDescriptionContent: () => clone(desc),
  };
  const context = vm.createContext({
    URL, console: { log() {} }, Promise,
    location: { href: payload.source_url },
    document: { documentElement: { scrollHeight: 1600 } },
    window: { location: { origin: new URL(payload.source_url).origin }, innerHeight: 800, scrollTo() {}, addEventListener() {} },
    ProductScraper: { common: { detectPlatform: () => platform, detectPageType: () => pageType }, alibaba: extractor, alibaba1688: extractor },
    chrome: { runtime: { id: 'test', onMessage: { addListener(fn) { listener = fn; } }, sendMessage(message) { messages.push(clone(message)); } } },
    setTimeout(callback, delay) { if (loaded) { delays.push(delay); Promise.resolve().then(callback); } return 1; },
  });
  vm.runInContext(source, context);
  loaded = true;
  return { messages, delays, waits, payload, trigger(attemptId) { listener({ type: 'TRIGGER_EXTRACT', attemptId }, {}, () => {}); } };
}

for (const platform of ['1688', 'ALIBABA']) {
  test(`${platform} preserves detail, optional description, then completion and original commercial payload`, async () => {
    const env = fixture({ platform });
    env.trigger('attempt-one');
    await flush();
    const events = env.messages.map(({ attemptId: _id, ...event }) => event);
    assert.deepEqual(events, [
      { type: 'PRODUCT_DATA', data: env.payload },
      { type: 'DESCRIPTION_DATA', data: { source_url: env.payload.source_url, product_id: env.payload.product_id, ...description } },
      { type: 'EXTRACTION_COMPLETE', hadDescription: true },
    ]);
    assert.deepEqual(env.delays, [300, 300, 1500]);
  });
}

test('missing or image-free descriptions remain omitted and search emits only its artifact', async () => {
  for (const desc of [null, { ...description, description_images: [], description_image_count: 0 }]) {
    const env = fixture({ desc }); env.trigger('attempt-one'); await flush();
    assert.deepEqual(env.messages.map(({ attemptId: _id, ...event }) => event), [
      { type: 'PRODUCT_DATA', data: env.payload }, { type: 'EXTRACTION_COMPLETE', hadDescription: false },
    ]);
  }
  const search = fixture({ pageType: 'search' }); search.trigger('attempt-one'); await flush();
  assert.deepEqual(search.messages.map(({ attemptId: _id, ...event }) => event), [{ type: 'PRODUCT_DATA', data: search.payload }]);
  assert.deepEqual(search.delays, []);
});

test('each concurrent invocation echoes only its own opaque attempt ID, including late description completion', async () => {
  const env = fixture({ deferred: true });
  env.trigger('old-attempt'); await flush();
  env.trigger('new-attempt'); await flush();
  env.waits[1](); await flush();
  env.waits[0](); await flush();
  assert.deepEqual(env.messages.map(({ type, attemptId }) => ({ type, attemptId })), [
    { type: 'PRODUCT_DATA', attemptId: 'old-attempt' },
    { type: 'PRODUCT_DATA', attemptId: 'new-attempt' },
    { type: 'DESCRIPTION_DATA', attemptId: 'new-attempt' },
    { type: 'EXTRACTION_COMPLETE', attemptId: 'new-attempt' },
    { type: 'DESCRIPTION_DATA', attemptId: 'old-attempt' },
    { type: 'EXTRACTION_COMPLETE', attemptId: 'old-attempt' },
  ]);
  for (const message of env.messages) assert.equal('attemptToken' in message, false);
});
