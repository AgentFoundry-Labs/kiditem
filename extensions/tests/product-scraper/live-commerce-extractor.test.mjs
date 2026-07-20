import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = path.resolve('extensions/product-scraper/live-commerce-extractor.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function loadExtractor() {
  const context = { URL, console, globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return context.ProductScraperLiveCommerceExtractor;
}

function element({ text = '', attrs = {}, href = null, parent = null, query = {} } = {}) {
  return {
    textContent: text,
    innerText: text,
    href,
    parentElement: parent,
    getAttribute(name) { return attrs[name] || null; },
    querySelector(selector) { return query[selector] || null; },
    querySelectorAll() { return []; },
  };
}

test('extracts a Douyin live room and product card from the visible DOM', () => {
  const extractor = loadExtractor();
  const image = element({ attrs: { src: 'https://img.test/sticker.jpg', alt: '스티커 세트' } });
  const card = element({
    text: '스티커 세트 ￥3.50 已售 1.2万',
    query: { img: image },
  });
  const anchor = element({
    text: '스티커 세트',
    href: 'https://haohuo.jinritemai.com/views/product/item?id=987654321',
    parent: card,
  });
  const titleMeta = element({ attrs: { content: '문구 신상품 라이브' } });
  const imageMeta = element({ attrs: { content: 'https://img.test/live.jpg' } });
  const anchorName = element({ text: '문구왕' });
  const doc = {
    title: 'fallback title',
    baseURI: 'https://live.douyin.com/123456789',
    body: { innerText: '正在直播 在线 2.3万 点赞 8.1万' },
    querySelector(selector) {
      if (selector === "meta[property='og:title']") return titleMeta;
      if (selector === "meta[property='og:image']") return imageMeta;
      if (selector === "[class*='anchor'] [class*='name']") return anchorName;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a[href]') return [anchor];
      return [];
    },
  };

  const result = extractor.extract(doc, doc.baseURI);

  assert.equal(result.ok, true);
  assert.equal(result.source, 'douyin');
  assert.equal(result.broadcast.broadcastId, '123456789');
  assert.equal(result.broadcast.broadcasterName, '문구왕');
  assert.equal(result.broadcast.viewerCount, 23000);
  assert.equal(result.broadcast.likeCount, 81000);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].productId, '987654321');
  assert.equal(result.products[0].priceCny, 3.5);
  assert.equal(result.products[0].salesCount, 12000);
  assert.equal(result.products[0].imageUrl, 'https://img.test/sticker.jpg');
});

test('detects 1688 and Douyin only and blocks verification pages', () => {
  const extractor = loadExtractor();
  assert.equal(extractor.detectSource('https://zb.1688.com/live/123'), '1688');
  assert.equal(extractor.detectSource('https://live.douyin.com/123'), 'douyin');
  assert.equal(extractor.detectSource('https://example.com/live/123'), null);

  const blocked = extractor.extract({
    title: '',
    baseURI: 'https://s.1688.com/punish?action=captcha',
    body: { innerText: '请完成滑块验证码' },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  }, 'https://s.1688.com/punish?action=captcha');

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 'verification_required');
});
