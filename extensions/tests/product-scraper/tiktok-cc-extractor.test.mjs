import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = path.resolve('extensions/product-scraper/tiktok-cc-extractor.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function loadExtractor() {
  const context = { URL, console, globalThis: null };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return context.ProductScraperTiktokCcExtractor;
}

const hashtagCapture = {
  url: 'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?period=7&region=US',
  payload: {
    code: 0,
    data: {
      list: [
        {
          rank: 1,
          hashtag_id: '1001',
          hashtag_name: 'backtoschool',
          country_info: { id: 'US', value: 'United States' },
          industry_info: { id: 4, value: 'Education' },
          publish_cnt: 12000,
          video_views: 3400000,
          trend: [{ time: 1, value: 2 }, { time: 2, value: 3 }],
          cover_url: 'https://p16.tiktokcdn.com/cover1.jpg',
        },
        {
          rank: 2,
          hashtag_name: 'fyp',
          publish_cnt: '50000',
          video_views: 9000000,
        },
        {
          rank: 3,
          hashtag_id: '1003',
        },
        {
          rank: 4,
        },
      ],
    },
  },
};

const keywordCapture = {
  url: 'https://ads.tiktok.com/creative_radar_api/v1/insight_word/list?region=US',
  payload: {
    code: 0,
    data: {
      list: [
        {
          keyword: 'silicone pencil case',
          rank: 1,
          post_count: 320,
          view_count: 1250000,
          growth: 42.567,
          share_url: 'https://ads.tiktok.com/keyword/silicone',
        },
      ],
    },
  },
};

test('normalizes hashtag + keyword creative_radar_api captures into TiktokCcItem[]', () => {
  const extractor = loadExtractor();
  const result = extractor.normalizeCaptures([hashtagCapture, keywordCapture], {
    defaultRegion: 'GB',
  });
  const region = result.region;
  // Round-trip to drop the vm realm's Object prototype before deepEqual.
  const items = JSON.parse(JSON.stringify(result.items));

  // country_info in the API response overrides the page default region.
  assert.equal(region, 'US');

  // 3 valid hashtag rows (row 4 has no name/id and is skipped) + 1 keyword row.
  assert.equal(items.length, 4);

  assert.deepEqual(items[0], {
    trendType: 'hashtag',
    entityKey: 'backtoschool',
    label: 'backtoschool',
    industry: 'Education',
    rank: 1,
    postCount: 12000,
    viewCount: 3400000,
    growthPct: 50,
    thumbnailUrl: 'https://p16.tiktokcdn.com/cover1.jpg',
  });

  // publish_cnt / video_views parse from strings; no cover -> no thumbnailUrl.
  assert.equal(items[1].entityKey, 'fyp');
  assert.equal(items[1].postCount, 50000);
  assert.equal(items[1].viewCount, 9000000);
  assert.equal(items[1].thumbnailUrl, undefined);

  // id-only row falls back to the id as a stable entityKey and omits label.
  assert.equal(items[2].entityKey, '1003');
  assert.equal(items[2].label, undefined);

  const keywordItem = items[3];
  assert.equal(keywordItem.trendType, 'keyword');
  assert.equal(keywordItem.entityKey, 'silicone pencil case');
  assert.equal(keywordItem.postCount, 320);
  assert.equal(keywordItem.viewCount, 1250000);
  assert.equal(keywordItem.growthPct, 42.57); // rounded to 2 decimals
  assert.equal(keywordItem.sourceUrl, 'https://ads.tiktok.com/keyword/silicone');
});

test('dedupes by trendType::entityKey across captures', () => {
  const extractor = loadExtractor();
  const dup = {
    url: 'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list',
    payload: { data: { list: [{ rank: 9, hashtag_name: 'fyp', publish_cnt: 1 }] } },
  };
  const { items } = extractor.normalizeCaptures([hashtagCapture, dup], {});
  const fypCount = items.filter((item) => item.entityKey === 'fyp').length;
  assert.equal(fypCount, 1);
});

test('uses trendTypeHint when the endpoint is unrecognized, and applies sourceKeyword', () => {
  const extractor = loadExtractor();
  const capture = {
    url: 'https://ads.tiktok.com/creative_radar_api/v1/unknown/blob',
    payload: { data: { records: [{ product_name: 'squishy topper', rank: 1 }] } },
  };
  const { items } = extractor.normalizeCaptures([capture], {
    trendTypeHint: 'product',
    sourceKeyword: 'pencil topper',
    defaultRegion: 'kr',
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].trendType, 'product');
  assert.equal(items[0].entityKey, 'squishy topper');
  assert.equal(items[0].sourceKeyword, 'pencil topper');
});

test('falls back to page-default region and clamps out-of-range numbers', () => {
  const extractor = loadExtractor();
  const capture = {
    url: 'https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list',
    payload: {
      data: {
        list: [
          { hashtag_name: 'noregion', rank: 5000, publish_cnt: -10, video_views: 5000 },
        ],
      },
    },
  };
  const { region, items } = extractor.normalizeCaptures([capture], { defaultRegion: 'kr' });
  assert.equal(region, 'KR');
  assert.equal(items[0].rank, undefined); // rank 5000 is out of 1..1000 -> dropped
  assert.equal(items[0].postCount, 0); // negative clamps to 0
  assert.equal(items[0].viewCount, 5000);
});

test('trendTypeFromEndpoint maps known creative_radar_api endpoints', () => {
  const extractor = loadExtractor();
  assert.equal(
    extractor.trendTypeFromEndpoint('/creative_radar_api/v1/popular_trend/hashtag/list'),
    'hashtag',
  );
  assert.equal(
    extractor.trendTypeFromEndpoint('/creative_radar_api/v1/insight_word/list'),
    'keyword',
  );
  assert.equal(
    extractor.trendTypeFromEndpoint('/creative_radar_api/v1/popular_trend/list'),
    'product',
  );
  assert.equal(extractor.trendTypeFromEndpoint('/creative_radar_api/v1/nope'), null);
});

test('extractFromDom pulls hashtag anchors as a brittle fallback', () => {
  const extractor = loadExtractor();
  const anchor = (href, text) => ({
    href,
    getAttribute(name) { return name === 'href' ? href : null; },
    innerText: text,
    textContent: text,
  });
  const doc = {
    querySelectorAll(selector) {
      if (selector === 'a[href]') {
        return [
          anchor('https://ads.tiktok.com/business/creativecenter/inspiration/hashtag/backtoschool', '#backtoschool'),
          anchor('https://ads.tiktok.com/business/creativecenter/inspiration/hashtag/fyp', '#fyp'),
          anchor('https://example.com/other', 'ignored'),
        ];
      }
      return [];
    },
  };
  const items = extractor.extractFromDom(doc, { trendTypeHint: 'hashtag' });
  assert.equal(items.length, 2);
  assert.equal(items[0].entityKey, 'backtoschool');
  assert.equal(items[0].rank, 1);
  assert.equal(items[0].sourceUrl, 'https://ads.tiktok.com/business/creativecenter/inspiration/hashtag/backtoschool');
  assert.equal(items[1].entityKey, 'fyp');
});
