import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const commonSource = fs.readFileSync(
  path.resolve('extensions/product-scraper/extractors/common.js'),
  'utf8',
);
const extractorSource = fs.readFileSync(
  path.resolve('extensions/product-scraper/extractors/1688.js'),
  'utf8',
);

function loadExtractor(html) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E6%96%87%E5%85%B7&charset=utf8',
  });
  dom.window.eval(commonSource);
  dom.window.eval(extractorSource);
  return dom;
}

test('extracts only canonical current 1688 offer cards with normalized trend fields', () => {
  const dom = loadExtractor(`
    <div class="feeds-wrapper">
      <div class="i18n-card-wrap cardui-adOffer">
        <a class="i18n-card-wrap-p4p" href="https://dj.1688.com/ci_king?tracking=only">
          <span class="offer-title">추적 전용 광고</span>
          <span class="sale-amount-wrap">5만+구매</span>
        </a>
      </div>
      <a class="i18n-card-wrap" href="https://detail.1688.com/offer/744681569999.html?spm=test">
        <span class="offer-title">델리 S55 젤펜</span>
        <div class="price-wrap"><span class="unit">0.81</span><span>¥</span></div>
        <span class="company-name" title="광저우 문구 공장"></span>
        <span class="sale-amount-wrap">2000+ 구매</span>
        <img data-src="//cbu01.alicdn.com/pen.jpg" />
      </a>
      <a class="i18n-card-wrap" href="https://detail.1688.com/offer/822193662213.html">
        <span class="offer-title">K35 프레스 젤펜</span>
        <div class="price-wrap">0.23 엔</div>
        <span class="sale-amount-wrap">132만+구매</span>
        <img data-src="https://cbu01.alicdn.com/k35.jpg" />
      </a>
    </div>
  `);

  const result = dom.window.ProductScraper.alibaba1688.extractTrendSearch(20);
  const items = JSON.parse(JSON.stringify(result.items));

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    offerId: '744681569999',
    monthlySales: 2000,
    rank: 1,
    title: '델리 S55 젤펜',
    priceCny: 0.81,
    supplierName: '광저우 문구 공장',
    imageUrl: 'https://cbu01.alicdn.com/pen.jpg',
    sourceUrl: 'https://detail.1688.com/offer/744681569999.html',
  });
  assert.equal(items[1].offerId, '822193662213');
  assert.equal(items[1].monthlySales, 1_320_000);
  assert.equal(items[1].rank, 2);
  assert.equal(items[1].imageUrl, 'https://cbu01.alicdn.com/k35.jpg');
});

test('normalizes Chinese and Korean displayed purchase counts to integer lower bounds', () => {
  const dom = loadExtractor('<main></main>');
  const normalize = dom.window.ProductScraper.alibaba1688.normalizeMonthlySales;

  assert.equal(normalize('近30天成交 1.2万+ 笔'), 12_000);
  assert.equal(normalize('29万+购买'), 290_000);
  assert.equal(normalize('2000+ 구매'), 2_000);
  assert.equal(normalize('5만+ 구매'), 50_000);
  assert.equal(normalize('평점 4.8'), null);
});
