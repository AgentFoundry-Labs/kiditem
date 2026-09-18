import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(repoRoot, 'extensions/kiditem-os/background/orders/mall-availability-send.js');

/** `page` 는 화면 안 함수가 쓰는 전역(fetch · DOMParser · location)이다 — 확장이 그 화면에 넣어 돌리는 것처럼. */
function loadModule(page = {}) {
  const context = { self: {}, console, URL, URLSearchParams, Promise, setTimeout, clearTimeout, Error, ...page };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallAvailabilitySend;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * 도매꾹 품절 = 진열안함(실측 2026-09-18).
 *
 * 상품조회/수정 목록의 [수정저장] 은 고친 줄마다 `{no, disp, title, loq, useOpt}` 를 모아 `/sc/item/editOnList` 에
 * `dat=` 한 번으로 보낸다. 줄은 목록 조회(`/sc/item/lst`, 상품번호 검색)가 준다. 사방넷도 도매꾹은 일시중지 ·
 * 완전품절 둘 다 `숨김중` 으로 보낸다.
 */
function domeggookMall({ rows, editAnswer = { res: true, success: null }, lookupAnswer = null } = {}) {
  const state = new Map(rows.map((row) => [String(row.no), { ...row }]));
  const log = { lookups: [], edits: [], tabs: 0 };
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/sc/item/lst') {
      const nos = parsed.searchParams.get('nos').split(',');
      log.lookups.push({ nos, params: [...parsed.searchParams.keys()] });
      const body = lookupAnswer ?? { res: true, cnt: nos.length, dat: nos.filter((no) => state.has(no)).map((no) => ({ ...state.get(no) })) };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }
    if (parsed.pathname === '/sc/item/editOnList' && init.method === 'POST') {
      assert.match(init.headers['Content-Type'], /^application\/x-www-form-urlencoded/);
      assert.ok(init.body.startsWith('dat='));
      const dat = JSON.parse(decodeURIComponent(init.body.slice(4)));
      log.edits.push(dat);
      if (editAnswer.res) {
        for (const item of dat) state.get(String(item.no)).disp = item.disp ? '진열함' : '진열안함';
      }
      const success = editAnswer.success ?? (editAnswer.res ? dat.length : 0);
      return { ok: true, status: 200, text: async () => JSON.stringify({ res: editAnswer.res, success, msg: editAnswer.msg }) };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const module = loadModule();
  const api = module.create({
    chrome: { tabs: { remove: async () => undefined }, scripting: { executeScript: async () => { throw new Error('no page'); } } },
    fetch,
    interactiveTabs: { createTab: async () => { log.tabs += 1; return { id: 1 }; } },
    tabReason: 'test',
  });
  return { api, log, state, module };
}

const row = (no, disp, extra = {}) => ({
  no,
  disp,
  title: `말랑이 ${no} & <특가>`,
  loq: '1,000',
  useOpt: 'N',
  status: '진행중',
  inventory: '999',
  ...extra,
});

test('⭐ 품절은 [수정저장] 과 같은 모양으로 진열안함을 보내고, 지금 값(상품명 · 최대판매수량 · 옵션)을 그대로 싣는다', async () => {
  const { api, log } = domeggookMall({
    rows: [
      row(68010748, '진열함'),
      row(68010749, '진열함', { loq: '9,999', useOpt: '<table>옵션</table>' }),
      row(68010750, '진열안함'),
    ],
  });
  const result = await api.send({ mallKey: 'domeggook', codes: ['68010748', '68010749', '68010750', '11111111'] });

  assert.equal(log.tabs, 0, '화면을 열지 않는다');
  assert.deepEqual(log.lookups[0].nos, ['68010748', '68010749', '68010750', '11111111']);
  // 목록 검색 폼이 보내는 기본값 그대로다.
  assert.deepEqual(log.lookups[0].params, [
    'ktype', 'nos', 'ttl', 'st', 'chn[]', 'chn[]', 'sec[]', 'sec[]', 'ca1', 'ca2', 'ca3', 'ca4',
    'idx', 'qty', 'disp', 'rmp', 'format', 'pg', 'sz', 'so',
  ]);
  // 이미 진열안함인 줄은 보내지 않는다.
  assert.deepEqual(plain(log.edits), [[
    { no: 68010748, disp: false, title: '말랑이 68010748 & <특가>', loq: '1000', useOpt: false },
    { no: 68010749, disp: false, title: '말랑이 68010749 & <특가>', loq: '9999', useOpt: true },
  ]]);
  assert.deepEqual(plain(result), {
    success: true,
    sent: 3,
    failed: 1,
    confirmed: 3,
    requestOnly: false,
    warnings: ['1건은 이미 진열안함이었습니다.', '1건은 도매꾹 상품번호로 찾지 못했습니다.'],
  });
});

test('해제는 같은 길로 진열함을 보낸다', async () => {
  const { api, log } = domeggookMall({ rows: [row(68010750, '진열안함')] });
  const result = await api.send({ mallKey: 'domeggook', codes: ['68010750'], resume: true });
  assert.equal(log.edits[0][0].disp, true);
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 1);
});

test('몰이 수정을 거절하면 실패로 세고 몰이 한 말을 싣는다 — 다시 읽어 바뀌지 않은 줄은 확인으로 세지 않는다', async () => {
  const { api } = domeggookMall({
    rows: [row(68010748, '진열함')],
    editAnswer: { res: false, msg: '수정할 수 없는 상품입니다' },
  });
  const result = await api.send({ mallKey: 'domeggook', codes: ['68010748'] });
  assert.equal(result.success, true);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.confirmed, 0);
  assert.ok(result.warnings.includes('도매꾹이 수정을 받지 않았습니다: 수정할 수 없는 상품입니다.'), result.warnings.join(' / '));
});

test('로그아웃이면 아무것도 보내지 않고 로그인하라고 답한다', async () => {
  const { api, log } = domeggookMall({
    rows: [row(68010748, '진열함')],
    lookupAnswer: { res: false, msg: '로그인이 필요합니다' },
  });
  const result = await api.send({ mallKey: 'domeggook', codes: ['68010748'] });
  assert.equal(result.success, false);
  assert.match(result.error, /도매꾹에 로그인되어 있지 않습니다/);
  assert.equal(log.edits.length, 0);
});

test('상품번호 검색은 500개까지라 나눠서 읽고 보낸다', async () => {
  const codes = Array.from({ length: 501 }, (_, i) => String(68000000 + i));
  const { api, log } = domeggookMall({ rows: codes.map((code) => row(Number(code), '진열함')) });
  const result = await api.send({ mallKey: 'domeggook', codes });
  assert.deepEqual(log.edits.map((dat) => dat.length), [500, 1]);
  assert.ok(log.lookups.every((lookup) => lookup.nos.length <= 500));
  assert.equal(result.sent, 501);
  assert.equal(result.confirmed, 501);
});

test('도매꾹이 품절을 보낼 수 있는 몰로 알려진다', () => {
  const module = loadModule();
  assert.ok(module.MALL_KEYS.includes('domeggook'));
  assert.equal(module.PENDING.domeggook, undefined);
});

/**
 * 쿠팡 윙 품절 = 옵션 재고수량 0(실측 2026-09-18, `app/listV3.js` 의 재고수량 칸). 윙에서 품절과 판매중지는 다르다 —
 * 품절은 판매중인 채로 '품절' 로 보이고 재고를 넣으면 다시 팔린다. 옵션 목록을 읽어 `vendorInventoryItemId` 를
 * 얻고, 품절 옵션만 `stock-manager/remain-change/request` 에 `stockManageItems={dtos}` 로 보낸 뒤 다시 읽는다.
 */
const ITEMS_PATH = '/tenants/seller-web/v2/vendor-inventory/vendor-inventory-items-with-vendorItems/';
const WING_LIST = 'https://wing.coupang.com/vendor-inventory/list';
const CHANGE_PATH = '/tenants/seller-web/vendorinventory/stock-manager/remain-change/request';

function wingMall({
  tabUrl = 'https://wing.coupang.com/tenants/cs/product/review',
  products = {},
  reject = {},
  itemsStatus = 200,
  // 윙이 429 로 막는 횟수(앞에서부터). 읽기 · 보내기 따로 센다.
  throttle = { reads: 0, posts: 0 },
  // 보낸 뒤 몇 번의 읽기까지 옛 재고가 보이는가(윙이 늦게 반영하는 경우).
  lagReads = 0,
  // 이미 열려 있는 윙 상품목록 탭 id.
  openListTabs = [],
  // 앞에 띄운 상품목록이 새로 고칠 때마다 보여 주는 재고 칸(앞에서부터). 다 쓰면 지금 재고대로 보인다.
  listCells = [],
} = {}) {
  // products: 등록상품ID → [{ vendorItemId, stockQuantity, registrationType }]
  const state = new Map(Object.entries(products).map(([id, items]) => [id, items.map((item, index) => ({
    vendorInventoryItemId: Number(`7${id.slice(-6)}${index}`),
    registrationType: 'NORMAL',
    status: 'APPROVED',
    ...item,
  }))]));
  const log = { tabs: [], active: [], removed: [], reads: [], changes: [], sleeps: [], updated: [], reloaded: [], queries: [], listReads: [] };
  const limits = { reads: throttle.reads ?? 0, posts: throttle.posts ?? 0 };
  let stale = null;
  const chrome = {
    tabs: {
      create: async ({ url, active }) => { log.tabs.push(url); log.active.push(active); return { id: 7 }; },
      query: async ({ url }) => { log.queries.push(url); return openListTabs.map((id) => ({ id, status: 'complete', url: 'https://wing.coupang.com/vendor-inventory/list?page=1' })); },
      update: async (id, { url, active }) => { log.updated.push({ id, url, active }); return { id }; },
      reload: async (id) => { log.reloaded.push(id); },
      get: async () => ({ id: 7, url: tabUrl }),
      remove: async (id) => { log.removed.push(id); },
      onUpdated: {
        addListener: (listener) => setTimeout(() => listener(7, { status: 'complete' }, {}), 0),
        removeListener: () => {},
      },
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        if (func.name === 'listStockCellOnPage') {
          const [product] = args;
          log.listReads.push(product);
          if (listCells.length > 0) return [{ result: listCells.shift() }];
          const items = state.get(product);
          if (!items) return [{ result: null }];
          const total = items.reduce((sum, item) => sum + Number(item.stockQuantity), 0);
          return [{ result: total === 0 ? '품절' : `${total}개` }];
        }
        assert.equal(func.name, 'requestOnPage');
        const [path, method, contentType, body] = args;
        const tooMany = { status: 429, json: null, preview: '<html>Too Many Requests</html>', url: `https://wing.coupang.com${path}` };
        if (method === 'GET' && path.startsWith(ITEMS_PATH)) {
          const id = path.slice(ITEMS_PATH.length).split('?')[0];
          log.reads.push(id);
          if (limits.reads > 0) { limits.reads -= 1; return [{ result: tooMany }]; }
          let items = state.get(id);
          if (stale && stale.id === id && stale.left > 0) { stale.left -= 1; items = stale.items; }
          const json = itemsStatus === 200 && items ? { success: true, data: items.map((item) => ({ ...item })) } : null;
          return [{ result: { status: itemsStatus === 200 && !items ? 404 : itemsStatus, json, preview: json ? '' : '<html>', url: `https://wing.coupang.com${path}` } }];
        }
        if (method === 'POST' && path === CHANGE_PATH) {
          assert.match(contentType, /^application\/x-www-form-urlencoded/);
          assert.ok(body.startsWith('stockManageItems='));
          if (limits.posts > 0) { limits.posts -= 1; return [{ result: tooMany }]; }
          const { dtos } = JSON.parse(decodeURIComponent(body.slice('stockManageItems='.length)));
          log.changes.push(dtos);
          const results = dtos.map((dto) => {
            const refused = reject[String(dto.vendorItemId)];
            if (!refused) {
              for (const [id, items] of state.entries()) {
                const item = items.find((candidate) => candidate.vendorItemId === dto.vendorItemId);
                if (item) {
                  if (lagReads > 0 && !stale) stale = { id, left: lagReads, items: items.map((entry) => ({ ...entry })) };
                  item.stockQuantity = dto.inventoryQuantity;
                }
              }
            }
            return { vendorItemId: dto.vendorItemId, success: !refused, message: refused || null, inventoryQuantity: dto.inventoryQuantity };
          });
          return [{ result: { status: 200, json: results, preview: '', url: `https://wing.coupang.com${path}` } }];
        }
        throw new Error(`unexpected ${method} ${path}`);
      },
    },
  };
  const module = loadModule();
  const api = module.create({
    chrome,
    fetch: async () => { throw new Error('워커에서 직접 부르지 않는다'); },
    interactiveTabs: { createTab: async () => { throw new Error('쿠팡 윙은 앞에 띄우는 탭을 쓰지 않는다'); } },
    tabReason: 'test',
    sleep: async (ms) => { log.sleeps.push(ms); },
  });
  return { api, log, state };
}

test('⭐ 쿠팡 윙 품절은 짚은 옵션만 재고 0 으로 — 윙 재고수량 칸이 보내는 모양 그대로, 다시 읽어 확인한다', async () => {
  const { api, log, state } = wingMall({
    products: {
      15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }, { vendorItemId: 94489536459, stockQuantity: 998 }],
      16389409095: [{ vendorItemId: 96075239894, stockQuantity: 0 }],
    },
  });
  const result = await api.send({
    mallKey: 'coupang',
    codes: ['15966710321', '16389409095', 'ABC-1'],
    options: { 15966710321: ['94489536455'] },
  });

  // 사장님 2026-09-18: "vendor-inventory/list 여기 가서 해야하잖아" — 리뷰 화면이 아니라 윙 상품목록에서 보낸다.
  // 여러 상품을 보낼 때는 상품목록을 뒤에서 열고 닫는다.
  assert.equal(log.tabs.length, 1);
  assert.ok(log.tabs[0].startsWith(`${WING_LIST}?searchKeywordType=ALL&searchKeywords=&`), log.tabs[0]);
  assert.ok(!log.tabs[0].includes('review'));
  assert.deepEqual(log.active, [false], '여러 상품은 뒤에서 보낸다');
  // 옵션을 짚은 상품은 그 옵션만, 짚지 않은 상품은 옵션 전부다. 이미 0 인 옵션은 보내지 않는다.
  assert.deepEqual(plain(log.changes), [[
    { vendorInventoryItemId: 77103210, vendorItemId: 94489536455, inventoryQuantity: 0 },
  ]]);
  assert.equal(state.get('15966710321')[1].stockQuantity, 998, '짚지 않은 옵션은 그대로다');
  assert.equal(result.success, true);
  assert.equal(result.sent, 2);
  assert.equal(result.confirmed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.already, 1, '이미 재고 0 인 옵션 수 — 문장은 웹이 만든다');
  assert.equal(result.rocket, 0);
  assert.ok(result.warnings.includes('1건은 쿠팡 윙 등록상품ID 모양이 아니라 보내지 않았습니다.'), result.warnings.join(' / '));
  assert.equal(result.stopped, undefined);
  assert.deepEqual(log.removed, [7], '연 탭은 닫는다');
});

test('해제는 재고 0 인 옵션에만 재고 999 를 넣고, 재고가 남은 옵션은 낮추지 않는다', async () => {
  const { api, log, state } = wingMall({
    products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 0 }, { vendorItemId: 94489536459, stockQuantity: 1861 }] },
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['15966710321'], resume: true });
  assert.deepEqual(plain(log.changes), [[
    { vendorInventoryItemId: 77103210, vendorItemId: 94489536455, inventoryQuantity: 999 },
  ]]);
  assert.equal(state.get('15966710321')[1].stockQuantity, 1861, '1861 을 999 로 낮추지 않는다');
  assert.equal(result.sent, 2);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
});

test('윙이 429 로 막으면 쉬었다 같은 요청을 다시 보낸다 — 로그아웃으로 읽지 않는다', async () => {
  const { api, log } = wingMall({
    products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] },
    throttle: { reads: 2, posts: 1 },
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['15966710321'] });
  assert.equal(result.success, true);
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 1);
  assert.equal(result.failed, 0);
  assert.equal(log.changes.length, 1);
  // 읽기 두 번 · 보내기 한 번 막힘 → 5초 · 15초 뒤 읽기, 5초 뒤 보내기.
  assert.deepEqual(log.sleeps.filter((ms) => ms >= 5000), [5000, 15000, 5000]);
});

test('윙이 끝까지 429 로 막으면 거기서 멈추고 남은 상품은 보내지 못한 것으로 센다', async () => {
  const { api, log } = wingMall({
    products: {
      15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }],
      16389409095: [{ vendorItemId: 96075239894, stockQuantity: 999 }, { vendorItemId: 96075239895, stockQuantity: 999 }],
      16389409096: [{ vendorItemId: 96075239896, stockQuantity: 999 }],
    },
    throttle: { reads: 100, posts: 0 },
  });
  const result = await api.send({
    mallKey: 'coupang',
    codes: ['15966710321', '16389409095', '16389409096'],
    options: { 16389409095: ['96075239894', '96075239895'] },
  });
  assert.equal(result.success, true, '로그인 오류가 아니다');
  assert.equal(result.stopped, 'rate_limited');
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 4, '멈춘 자리부터 남은 옵션 수(1 + 2 + 1)');
  assert.equal(log.changes.length, 0);
  assert.equal(log.reads.length, 4, '첫 상품을 네 번(처음 + 다시 세 번) 읽고 멈춘다 — 다음 상품으로 몰아치지 않는다');
  assert.ok(result.warnings.some((warning) => warning.includes('HTTP 429') && warning.includes('상품 3개는 보내지 못했습니다')), result.warnings.join(' / '));
  assert.deepEqual(log.removed, [7], '멈춰도 연 탭은 닫는다');
});

test('윙이 받은 뒤 늦게 반영하면 한 번 더 읽어 확인한다', async () => {
  const { api, log } = wingMall({
    products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] },
    lagReads: 1,
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['15966710321'] });
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 1, '두 번째 읽기에서 0 을 봤다');
  assert.equal(log.reads.length, 3, '처음 · 보낸 뒤 · 한 번 더');
  assert.ok(log.sleeps.includes(1500));
});

test('윙이 거절한 옵션은 실패로 세고 윙이 한 말을 싣는다 — 로켓그로스 옵션은 건너뛴다', async () => {
  const { api } = wingMall({
    products: {
      15966710321: [
        { vendorItemId: 94489536455, stockQuantity: 999 },
        { vendorItemId: 94489536459, stockQuantity: 999, registrationType: 'RFM' },
      ],
    },
    reject: { 94489536455: '판매중지된 옵션은 재고를 바꿀 수 없습니다' },
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['15966710321'] });
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.confirmed, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('판매중지된 옵션은 재고를 바꿀 수 없습니다')), result.warnings.join(' / '));
  assert.equal(result.rocket, 1, '로켓그로스 옵션 수 — 문장은 웹이 만든다');
});

test('윙 로그인이 풀려 로그인 화면으로 넘어가면 아무것도 보내지 않는다', async () => {
  const { api, log } = wingMall({
    tabUrl: 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth',
    products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] },
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['15966710321'] });
  assert.equal(result.success, false);
  assert.match(result.error, /쿠팡 윙에 로그인되어 있지 않습니다/);
  assert.equal(log.changes.length, 0);
  assert.deepEqual(log.removed, [7]);
});

test('윙에 없는 옵션코드는 실패로 센다', async () => {
  const { api, log } = wingMall({ products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }] } });
  const result = await api.send({ mallKey: 'coupang', codes: ['15966710321'], options: { 15966710321: ['11111111111'] } });
  assert.equal(log.changes.length, 0);
  assert.equal(result.failed, 1);
  assert.ok(result.warnings.some((warning) => warning.includes('옵션 1개가 쿠팡 윙에 없습니다')), result.warnings.join(' / '));
});

test('보내기에서 끝까지 막히면 그 상품부터 보내지 못한 것으로 센다', async () => {
  const { api, log } = wingMall({
    products: {
      15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }],
      16389409095: [{ vendorItemId: 96075239894, stockQuantity: 999 }],
    },
    throttle: { reads: 0, posts: 100 },
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['15966710321', '16389409095'] });
  assert.equal(result.stopped, 'rate_limited');
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 2);
  assert.equal(log.reads.length, 1, '둘째 상품은 읽지도 않는다');
  assert.ok(result.warnings.some((warning) => warning.includes('상품 2개는 보내지 못했습니다')), result.warnings.join(' / '));
});

/**
 * 등록현황 칸의 창은 쿠팡 판매상태(ON_SALE)만 알아 품절(재고 0)을 모른다 — 품절이어도 윙 판매상태는 판매중이다.
 * 그래서 창을 열면 윙 지금 재고를 읽어 보여 준다(사장님 2026-09-18: "이거 확인을 해줘봐"). 읽기만 한다.
 */
test('⭐ 지금 재고 읽기는 윙을 뒤에서 열어 옵션 재고만 읽고, 아무것도 보내지 않는다', async () => {
  const { api, log } = wingMall({
    products: {
      16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }],
      15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }, { vendorItemId: 94489536459, stockQuantity: 5, registrationType: 'RFM' }],
    },
  });
  const result = await api.read({ mallKey: 'coupang', codes: ['16340985357', '15966710321', '99999999999', 'ABC'] });
  assert.deepEqual(plain(result), {
    success: true,
    products: [
      { code: '16340985357', options: [{ optionCode: '95903875495', stock: 0, rocket: false }] },
      { code: '15966710321', options: [{ optionCode: '94489536455', stock: 999, rocket: false }, { optionCode: '94489536459', stock: 5, rocket: true }] },
    ],
    missing: ['99999999999'],
  });
  assert.equal(log.changes.length, 0, '읽기는 보내지 않는다');
  assert.deepEqual(log.active, [false], '윙 탭은 뒤에서 연다');
  assert.deepEqual(log.removed, [7]);
});

test('지금 재고 읽기 — 로그인이 풀렸거나 윙이 막으면 그렇게 답한다', async () => {
  const loggedOut = wingMall({
    tabUrl: 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth',
    products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }] },
  });
  const outcome = await loggedOut.api.read({ mallKey: 'coupang', codes: ['16340985357'] });
  assert.equal(outcome.success, false);
  assert.match(outcome.error, /쿠팡 윙에 로그인되어 있지 않습니다/);

  const blocked = wingMall({
    products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }] },
    throttle: { reads: 100, posts: 0 },
  });
  const limited = await blocked.api.read({ mallKey: 'coupang', codes: ['16340985357'] });
  assert.equal(limited.success, false);
  assert.match(limited.error, /HTTP 429/);
});

test('지금 재고는 옵션 재고로 품절을 보내는 몰(쿠팡 윙)만 읽는다', async () => {
  const module = loadModule();
  assert.ok(module.READ_MALL_KEYS.includes('coupang'));
  const { api } = wingMall();
  const result = await api.read({ mallKey: 'domeggook', codes: ['68010748'] });
  assert.equal(result.success, false);
});

/**
 * 등록현황 칸에서 상품 하나를 누르면 사장님이 손으로 품절을 하는 바로 그 화면 — 그 상품을 검색한 윙 상품목록 — 을
 * 앞에 띄우고, 거기서 보낸 뒤 새로 고쳐 바뀐 재고를 보여 준 채로 둔다(사장님 2026-09-18: "여기 가서 해야하잖아").
 */
test('⭐ 상품 하나를 누르면 그 상품을 검색한 윙 상품목록을 앞에 띄우고, 보낸 뒤 새로 고쳐 둔다', async () => {
  const { api, log, state } = wingMall({ products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 999 }] } });
  const result = await api.send({ mallKey: 'coupang', codes: ['16340985357'], show: true });

  assert.equal(log.tabs.length, 1);
  assert.ok(log.tabs[0].startsWith(`${WING_LIST}?searchKeywordType=ALL&searchKeywords=16340985357&`), log.tabs[0]);
  assert.deepEqual(log.active, [true], '사장님이 보는 화면이다');
  assert.equal(state.get('16340985357')[0].stockQuantity, 0);
  assert.deepEqual(log.reloaded, [7], '보낸 뒤 상품목록을 새로 고쳐 품절을 보여 준다');
  assert.deepEqual(log.listReads, ['16340985357']);
  assert.deepEqual(log.removed, [], '앞에 띄운 상품목록은 닫지 않는다');
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 1);
  assert.equal(result.listShown, true, '상품목록에 품절이 보였다');
});

test('⭐ 윙 상품목록이 늦게 따라오면 품절이 보일 때까지 10초마다 새로 고친다', async () => {
  const { api, log } = wingMall({
    products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 999 }] },
    listCells: ['999개', '999개'],
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['16340985357'], show: true });
  assert.deepEqual(log.reloaded, [7, 7, 7], '옛 값 두 번 · 세 번째에 품절');
  assert.equal(log.sleeps.filter((ms) => ms === 10000).length, 2);
  assert.equal(result.listShown, true);
});

test('끝내 상품목록이 옛 값이면 그렇다고 돌려준다 — 재고는 이미 바뀌었다', async () => {
  const { api, log } = wingMall({
    products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 999 }] },
    listCells: ['999개', '999개', '999개', '999개', '999개', '999개'],
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['16340985357'], show: true });
  assert.equal(log.reloaded.length, 6);
  assert.equal(result.listShown, false);
  assert.equal(result.confirmed, 1, '윙 재고는 다시 읽어 확인했다');
});

test('해제도 상품목록에 재고가 보일 때까지 기다리고, 이미 그 재고면 한 번만 새로 고친다', async () => {
  const resumed = wingMall({
    products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }] },
    listCells: ['품절'],
  });
  const result = await resumed.api.send({ mallKey: 'coupang', codes: ['16340985357'], show: true, resume: true });
  assert.deepEqual(resumed.log.reloaded, [7, 7]);
  assert.equal(result.listShown, true);

  const already = wingMall({ products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }] } });
  const same = await already.api.send({ mallKey: 'coupang', codes: ['16340985357'], show: true });
  assert.equal(already.log.changes.length, 0);
  assert.deepEqual(already.log.reloaded, [7]);
  assert.equal(same.listShown, true);
});

test('이미 열린 윙 상품목록 탭이 있으면 그 탭에서 검색해 앞에 띄운다 — 탭을 쌓지 않는다', async () => {
  const { api, log } = wingMall({
    products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 999 }] },
    openListTabs: [9],
  });
  await api.send({ mallKey: 'coupang', codes: ['16340985357'], show: true });
  assert.deepEqual(log.queries, ['https://wing.coupang.com/vendor-inventory/list*']);
  assert.equal(log.tabs.length, 0, '새 탭을 열지 않는다');
  assert.equal(log.updated.length, 1);
  assert.equal(log.updated[0].id, 9);
  assert.equal(log.updated[0].active, true);
  assert.ok(log.updated[0].url.includes('searchKeywords=16340985357&'), log.updated[0].url);
  assert.deepEqual(log.removed, [], '사장님 탭은 닫지 않는다');
});

test('상품 여러 개를 나눠 보낼 때는 show 가 와도 뒤에서 보낸다', async () => {
  const { api, log } = wingMall({
    products: {
      16340985357: [{ vendorItemId: 95903875495, stockQuantity: 999 }],
      15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }],
    },
  });
  await api.send({ mallKey: 'coupang', codes: ['16340985357', '15966710321'], show: true });
  assert.deepEqual(log.active, [false]);
  assert.deepEqual(log.removed, [7]);
  assert.deepEqual(log.reloaded, []);
});

test('앞에 띄운 상품목록이 로그인 화면이면 닫지 않고 거기서 로그인하라고 답한다', async () => {
  const { api, log } = wingMall({
    tabUrl: 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth',
    products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 999 }] },
  });
  const result = await api.send({ mallKey: 'coupang', codes: ['16340985357'], show: true });
  assert.equal(result.success, false);
  assert.match(result.error, /열린 윙 화면에서 로그인한 뒤 다시 누르세요/);
  assert.equal(log.changes.length, 0);
  assert.deepEqual(log.removed, []);
});

test('지금 재고 읽기도 윙 상품목록을 뒤에서 열고 닫는다', async () => {
  const { api, log } = wingMall({ products: { 16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }] } });
  await api.read({ mallKey: 'coupang', codes: ['16340985357'] });
  assert.ok(log.tabs[0].startsWith(WING_LIST), log.tabs[0]);
  assert.deepEqual(log.active, [false]);
  assert.deepEqual(log.removed, [7]);
});

test('⭐ 지금 재고 읽기는 이미 열린 윙 화면에서 부른다 — 탭을 새로 열지도 닫지도 않는다', async () => {
  const { api, log } = wingMall({
    products: {
      16340985357: [{ vendorItemId: 95903875495, stockQuantity: 0 }],
      15966710321: [{ vendorItemId: 94489536455, stockQuantity: 999 }],
    },
    openListTabs: [9],
  });
  const result = await api.read({ mallKey: 'coupang', codes: ['16340985357', '15966710321'] });
  assert.equal(result.success, true);
  assert.equal(result.products.length, 2);
  assert.deepEqual(log.queries, ['https://wing.coupang.com/*']);
  assert.equal(log.tabs.length, 0, '새 탭을 열지 않는다');
  assert.deepEqual(log.removed, [], '사장님 화면은 닫지 않는다');
  assert.deepEqual(log.updated, [], '그 화면을 다른 주소로 옮기지 않는다');
});

test('지금 재고 읽기는 한 번에 50개까지 읽는다 — 등록현황 한 페이지가 들어간다', async () => {
  const products = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [String(16000000000 + index), [{ vendorItemId: 90000000000 + index, stockQuantity: index % 2 }]]));
  const { api, log } = wingMall({ products });
  const result = await api.read({ mallKey: 'coupang', codes: Object.keys(products) });
  assert.equal(result.products.length, 50);
  assert.equal(log.reads.length, 50);
});

/**
 * 카카오 톡스토어 품절 = 재고 0(2026-09-19 실측). 판매자센터 상품조회의 [선택 수정]이 보내는 요청 그대로 —
 * PUT /api/tstore/products/grid/columns 에 [{name, salePrice, storeManagementCode, stockQuantity, productId, displayStatus}].
 * 지금 값을 목록 API 로 읽어 그대로 싣고 재고만 바꾼다. 옵션이 있는 상품은 이 칸으로 못 고친다.
 */
function kakaoMall({ products = {}, tabUrl = 'https://shopping-seller.kakao.com/product/store-seller/list', openTabs = [], gridStatus = 200 } = {}) {
  const state = new Map(Object.entries(products).map(([id, product]) => [id, {
    id, name: `상품 ${id}`, salePrice: 2220, storeManagementCode: '', stockQuantity: 999,
    optionSetting: '미설정', displayStatusType: 'OPEN', ...product,
  }]));
  const log = { tabs: [], active: [], removed: [], puts: [], reads: [] };
  const chrome = {
    tabs: {
      query: async () => openTabs,
      create: async ({ url, active }) => { log.tabs.push(url); log.active.push(active); return { id: 11 }; },
      get: async () => ({ id: 11, url: tabUrl }),
      remove: async (id) => { log.removed.push(id); },
      onUpdated: { addListener: (listener) => setTimeout(() => listener(11, { status: 'complete' }, {}), 0), removeListener: () => {} },
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        assert.equal(func.name, 'requestOnPage');
        const [path, method, contentType, body] = args;
        if (method === 'GET' && path.startsWith('/api/tstore/products?')) {
          const id = new URLSearchParams(path.split('?')[1]).get('productIds');
          log.reads.push(id);
          const product = state.get(id);
          return [{ result: { status: 200, json: { contents: product ? [{ ...product }] : [], totalCount: product ? 1 : 0 }, preview: '', url: `https://shopping-seller.kakao.com${path}` } }];
        }
        if (method === 'PUT' && path === '/api/tstore/products/grid/columns') {
          assert.equal(contentType, 'application/json');
          const edits = JSON.parse(body);
          log.puts.push(edits);
          if (gridStatus === 200) for (const edit of edits) state.get(String(edit.productId)).stockQuantity = edit.stockQuantity;
          return [{ result: { status: gridStatus, json: gridStatus === 200 ? { successCount: edits.length } : { message: '수정할 수 없는 상품입니다' }, preview: '', url: '' } }];
        }
        throw new Error(`unexpected ${method} ${path}`);
      },
    },
  };
  const api = loadModule().create({
    chrome,
    fetch: async () => { throw new Error('워커에서 직접 부르지 않는다'); },
    interactiveTabs: { createTab: async () => { throw new Error('앞에 띄우지 않는다'); } },
    tabReason: 'test',
    sleep: async () => {},
  });
  return { api, log, state };
}

test('⭐ 카카오 톡스토어 품절은 [선택 수정]과 같은 모양으로 재고만 0 으로 — 지금 값을 그대로 싣는다', async () => {
  const { api, log, state } = kakaoMall({
    products: {
      779522307: { name: '애니멀 회전 주사위 키링', salePrice: 2220, storeManagementCode: 'ABC', displayStatusType: 'OPEN' },
      711073894: { optionSetting: '설정' },
      777184227: { stockQuantity: 0 },
    },
  });
  const result = await api.send({ mallKey: 'kakao', codes: ['779522307', '711073894', '777184227', 'X-1'] });

  assert.deepEqual(plain(log.puts), [[
    { name: '애니멀 회전 주사위 키링', salePrice: 2220, storeManagementCode: 'ABC', stockQuantity: 0, productId: '779522307', displayStatus: 'OPEN' },
  ]]);
  assert.equal(state.get('779522307').stockQuantity, 0);
  assert.equal(state.get('711073894').stockQuantity, 999, '옵션 상품은 건드리지 않는다');
  assert.equal(result.success, true);
  assert.equal(result.sent, 2, '보낸 1 + 이미 0 인 1');
  assert.equal(result.confirmed, 2);
  assert.equal(result.failed, 2, '옵션 상품 1 + 모양이 틀린 번호 1');
  assert.equal(result.already, 1);
  assert.ok(result.warnings.some((warning) => warning.includes('옵션이 있는 상품 1개')), result.warnings.join(' / '));
  assert.deepEqual(log.active, [false], '뒤에서 연다');
  assert.deepEqual(log.removed, [11], '연 탭은 닫는다');
});

test('카카오 해제는 재고 0 인 상품만 999 로 — 재고가 남은 상품은 낮추지 않는다', async () => {
  const { api, log } = kakaoMall({ products: { 1: { stockQuantity: 0 }, 2: { stockQuantity: 5 } } });
  const result = await api.send({ mallKey: 'kakao', codes: ['1', '2'], resume: true });
  assert.deepEqual(log.puts.map((edits) => edits.map((edit) => [edit.productId, edit.stockQuantity])), [[['1', 999]]]);
  assert.equal(result.sent, 2);
  assert.equal(result.confirmed, 2);
});

test('카카오 — 열린 판매자센터 화면이 있으면 그 화면을 빌려 쓰고 닫지 않는다 · 거절하면 몰이 한 말을 싣는다', async () => {
  const reused = kakaoMall({ products: { 1: {} }, openTabs: [{ id: 5, status: 'complete', url: 'https://shopping-seller.kakao.com/product/store-seller/list' }] });
  await reused.api.send({ mallKey: 'kakao', codes: ['1'] });
  assert.equal(reused.log.tabs.length, 0);
  assert.deepEqual(reused.log.removed, []);

  const refused = kakaoMall({ products: { 1: {} }, gridStatus: 400 });
  const result = await refused.api.send({ mallKey: 'kakao', codes: ['1'] });
  assert.equal(result.failed, 1);
  assert.equal(result.confirmed, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('수정할 수 없는 상품입니다')), result.warnings.join(' / '));
});

test('카카오 — 로그인 화면이면 아무것도 보내지 않는다', async () => {
  const { api, log } = kakaoMall({ products: { 1: {} }, tabUrl: 'https://accounts.kakao.com/login' });
  const result = await api.send({ mallKey: 'kakao', codes: ['1'] });
  assert.equal(result.success, false);
  assert.match(result.error, /카카오 톡스토어에 로그인되어 있지 않습니다/);
  assert.equal(log.puts.length, 0);
});

/**
 * 올웨이즈 품절 · 판매재개 = 판매자센터의 [품절] · [판매재개] 버튼(2026-09-19 실측). POST /items/sold-out-many ·
 * /items/resume-many {itemIdList}, 확인 POST /sellers/items/info-request {itemIds}. 토큰은 화면 안에서만 읽는다.
 */
function alwayzMall({ items = {}, tabUrl = 'https://alwayzseller.ilevit.com/items/management', loggedOut = false } = {}) {
  const state = new Map(Object.entries(items).map(([id, item]) => [id, { _id: id, itemTitle: `상품 ${id}`, soldOut: false, ...item }]));
  const log = { tabs: [], removed: [], posts: [], args: [] };
  const chrome = {
    tabs: {
      query: async () => [],
      create: async ({ url, active }) => { log.tabs.push([url, active]); return { id: 12 }; },
      get: async () => ({ id: 12, url: tabUrl }),
      remove: async (id) => { log.removed.push(id); },
      onUpdated: { addListener: (listener) => setTimeout(() => listener(12, { status: 'complete' }, {}), 0), removeListener: () => {} },
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        assert.equal(func.name, 'alwayzRequestOnPage');
        const [url, body, tokenKey] = args;
        log.args.push(args);
        assert.equal(tokenKey, '@alwayz@seller@token@');
        if (loggedOut) return [{ result: { status: 401, json: null, loggedOut: true } }];
        const path = new URL(url).pathname;
        if (path === '/sellers/items/info-request') {
          return [{ result: { status: 200, json: { status: 200, data: body.itemIds.filter((id) => state.has(id)).map((id) => ({ ...state.get(id) })) }, loggedOut: false } }];
        }
        if (path === '/items/sold-out-many' || path === '/items/resume-many') {
          log.posts.push([path, body.itemIdList]);
          for (const id of body.itemIdList) state.get(id).soldOut = path === '/items/sold-out-many';
          return [{ result: { status: 200, json: { status: 200 }, loggedOut: false } }];
        }
        throw new Error(`unexpected ${url}`);
      },
    },
  };
  const api = loadModule().create({
    chrome,
    fetch: async () => { throw new Error('워커에서 직접 부르지 않는다'); },
    interactiveTabs: { createTab: async () => { throw new Error('앞에 띄우지 않는다'); } },
    tabReason: 'test',
    sleep: async () => {},
  });
  return { api, log, state };
}

const A = '6743cacb46ae748ace9f239c';
const B = '675b86c999d04ee13d45b6c0';
const C = '668b81adc75f21b22efa0fda';

test('⭐ 올웨이즈 품절은 [품절] 버튼과 같은 요청으로 — 이미 품절인 상품은 보내지 않고, 다시 읽어 확인한다', async () => {
  const { api, log, state } = alwayzMall({ items: { [A]: { soldOut: false }, [B]: { soldOut: true } } });
  const result = await api.send({ mallKey: 'always', codes: [A, B, C, 'not-an-id'] });
  assert.deepEqual(plain(log.posts), [['/items/sold-out-many', [A]]]);
  assert.equal(state.get(A).soldOut, true);
  assert.equal(result.success, true);
  assert.equal(result.sent, 2);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
  assert.equal(result.failed, 2, '없는 상품 1 + 모양이 틀린 번호 1');
  assert.deepEqual(log.tabs, [['https://alwayzseller.ilevit.com/items/management', false]]);
  assert.deepEqual(log.removed, [12]);
  // 워커는 토큰을 보지 않는다 — 화면 안 함수에 토큰이 든 localStorage 열쇠 이름만 넘긴다.
  assert.ok(log.args.every((args) => args.length === 3 && typeof args[2] === 'string' && !/eyJ/.test(JSON.stringify(args))));
});

test('올웨이즈 판매재개는 품절인 상품만 [판매재개]로 되돌린다', async () => {
  const { api, log } = alwayzMall({ items: { [A]: { soldOut: true }, [B]: { soldOut: false } } });
  const result = await api.send({ mallKey: 'always', codes: [A, B], resume: true });
  assert.deepEqual(plain(log.posts), [['/items/resume-many', [A]]]);
  assert.equal(result.confirmed, 2);
});

test('올웨이즈 — 로그인이 풀렸으면 아무것도 보내지 않는다', async () => {
  const { api, log } = alwayzMall({ items: { [A]: {} }, loggedOut: true });
  const result = await api.send({ mallKey: 'always', codes: [A] });
  assert.equal(result.success, false);
  assert.match(result.error, /올웨이즈 로그인이 풀렸습니다/);
  assert.equal(log.posts.length, 0);
});

test('지금 재고 읽기 — 카카오는 재고 수, 올웨이즈는 품절이면 0 · 아니면 모름', async () => {
  const kakao = kakaoMall({ products: { 1: { stockQuantity: 0 }, 2: { stockQuantity: 37 } } });
  assert.deepEqual(plain(await kakao.api.read({ mallKey: 'kakao', codes: ['1', '2', '3'] })), {
    success: true,
    products: [
      { code: '1', options: [{ optionCode: '1', stock: 0, rocket: false }] },
      { code: '2', options: [{ optionCode: '2', stock: 37, rocket: false }] },
    ],
    missing: ['3'],
  });
  const alwayz = alwayzMall({ items: { [A]: { soldOut: true }, [B]: { soldOut: false } } });
  assert.deepEqual(plain(await alwayz.api.read({ mallKey: 'always', codes: [A, B] })), {
    success: true,
    products: [
      { code: A, options: [{ optionCode: A, stock: 0, rocket: false }] },
      { code: B, options: [{ optionCode: B, stock: null, rocket: false }] },
    ],
    missing: [],
  });
  const module = loadModule();
  assert.deepEqual([...module.READ_MALL_KEYS].sort(), ['always', 'art09', 'coupang', 'kakao', 'kkomangse', 'lotte-on', 'teacher-mall']);
  assert.ok(module.MALL_KEYS.includes('kakao') && module.MALL_KEYS.includes('always'));
});

/**
 * 아트공구(카페24 공급사 관리자) 품절 = 상품목록의 [판매안함], 재개 = [판매함](실측 2026-09-19, 화면 코드
 * `PRODUCT_MANAGE._manageState`). 버튼은 고른 줄의 체크박스 값(`is_display` · `is_selling`)을 읽어
 * `product_no[]` · `change=is_selling` · `state` · `market[번호][…]` 로 POST /exec/admin/product/ProductManageState 에 보낸다.
 * 화면 안 함수(`cafe24ListOnPage` · `requestOnPage`)를 실제로 돌린다 — 목록 HTML 은 카페24 모양 그대로다.
 */
const CAFE24 = 'https://zzogzzog1.cafe24.com';
const { DOMParser: PageDOMParser } = new JSDOM('').window;

function cafe24ListHtml(total, rows) {
  const row = ([no, product]) => `<tr>
    <td><input type="checkbox" class="rowChk _product_no" value="${no}" is_display="${product.display ? 'T' : 'F'}"
      is_selling="${product.selling ? 'T' : 'F'}" is_funding_product="F" is_set_product="${product.set ? 'T' : 'F'}" data-option-type="T"></td>
    <td>${no}</td><td>기본상품</td><td>P000${no}</td>
    <td><p><a href="/disp/admin/shop1/product/ProductRegister?product_no=${no}" class="txtLink eProductDetail ec-product-list-productname">상품 ${no}</a></p></td>
    <td></td><td>9,490</td><td>9,490</td><td>9,490</td><td>SMS발송</td>
  </tr>`;
  return `<html><body><form id="eProductSearchForm"></form><p class="total">[총 <strong>${total}</strong>개]</p>
    <table><thead><tr><th></th><th>No</th><th>상품구분</th><th>상품코드</th><th>상품명</th><th>마켓연동</th><th>판매가</th></tr></thead>
    <tbody>${rows.map(row).join('')}</tbody></table></body></html>`;
}

function art09Mall({ products = {}, loggedOut = false, stateAnswer = { passed: true, msg: null } } = {}) {
  const state = new Map(Object.entries(products).map(([no, product]) => [no, { display: true, selling: true, set: false, ...product }]));
  const log = { tabs: [], removed: [], lists: [], posts: [] };
  const fetch = async (path, init = {}) => {
    const url = new URL(path, CAFE24);
    if (url.pathname === '/disp/admin/shop1/product/ProductManage') {
      log.lists.push(Number(url.searchParams.get('page')));
      if (loggedOut) return { url: 'https://eclogin.cafe24.com/Shop/', ok: true, status: 200, text: async () => '<html><body>로그인</body></html>' };
      const page = Number(url.searchParams.get('page'));
      const limit = Number(url.searchParams.get('limit'));
      assert.equal(url.searchParams.get('orderby'), 'regist_d');
      const all = [...state.entries()];
      return { url: url.href, ok: true, status: 200, text: async () => cafe24ListHtml(all.length, all.slice((page - 1) * limit, page * limit)) };
    }
    if (url.pathname === '/exec/admin/product/ProductManageState' && init.method === 'POST') {
      assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest');
      assert.match(init.headers['Content-Type'], /^application\/x-www-form-urlencoded/);
      const body = new URLSearchParams(init.body);
      log.posts.push([...body.entries()]);
      if (stateAnswer.passed) {
        for (const no of body.getAll('product_no[]')) state.get(no).selling = body.get('state') === 'T';
      }
      return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify(stateAnswer) };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const module = loadModule({ fetch, DOMParser: PageDOMParser, location: new URL(`${CAFE24}/disp/admin/shop1/product/ProductManage`) });
  const chrome = {
    tabs: {
      query: async () => [],
      create: async ({ url, active }) => { log.tabs.push([url, active]); return { id: 21 }; },
      get: async () => ({ id: 21, url: `${CAFE24}/disp/admin/shop1/product/ProductManage` }),
      remove: async (id) => { log.removed.push(id); },
      onUpdated: { addListener: (listener) => setTimeout(() => listener(21, { status: 'complete' }, {}), 0), removeListener: () => {} },
    },
    scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] },
  };
  const api = module.create({
    chrome,
    fetch: async () => { throw new Error('워커에서 직접 부르지 않는다'); },
    interactiveTabs: { createTab: async () => { throw new Error('앞에 띄우지 않는다'); } },
    tabReason: 'test',
    sleep: async () => {},
  });
  return { api, log, state };
}

test('⭐ 아트공구 품절은 상품목록 [판매안함]과 같은 요청으로 — 판매함인 상품만, 지금 값을 싣고, 다시 읽어 확인한다', async () => {
  const { api, log, state } = art09Mall({
    products: {
      123858: {},
      123856: { display: false },
      123852: { selling: false },
      123851: { set: true },
    },
  });
  const result = await api.send({ mallKey: 'art09', codes: ['123858', '123856', '123852', '123851', '999999', 'P000HBFU'] });
  // 버튼이 만드는 모양 그대로 — 상품번호들, 바꿀 칸, 값, 그리고 고른 상품마다 지금 진열 · 판매 값.
  assert.deepEqual(plain(log.posts), [[
    ['product_no[]', '123858'],
    ['product_no[]', '123856'],
    ['change', 'is_selling'],
    ['state', 'F'],
    ['market[123858][is_display]', 'T'],
    ['market[123858][is_selling]', 'T'],
    ['market[123856][is_display]', 'F'],
    ['market[123856][is_selling]', 'T'],
  ]]);
  assert.equal(state.get('123858').selling, false);
  assert.equal(state.get('123856').selling, false);
  assert.equal(state.get('123851').selling, true, '세트상품은 화면도 막는다 — 보내지 않는다');
  assert.equal(result.success, true);
  assert.equal(result.sent, 3, '보낸 2 + 이미 판매안함 1');
  assert.equal(result.confirmed, 3);
  assert.equal(result.already, 1);
  assert.equal(result.failed, 3, '세트상품 1 + 목록에 없는 번호 1 + 모양이 틀린 번호 1');
  assert.ok(result.warnings.some((warning) => /세트상품 1개/.test(warning)));
  // 상품목록을 읽고(한 쪽), 보낸 뒤 다시 읽는다. 뒤에서 연 탭은 닫는다.
  assert.deepEqual(log.lists, [1, 1]);
  assert.deepEqual(log.tabs, [[`${CAFE24}/disp/admin/shop1/product/ProductManage`, false]]);
  assert.deepEqual(log.removed, [21]);
});

test('아트공구 판매 재개는 판매안함인 상품만 [판매함]으로 되돌린다', async () => {
  const { api, log, state } = art09Mall({ products: { 1: { selling: false }, 2: {} } });
  const result = await api.send({ mallKey: 'art09', codes: ['1', '2'], resume: true });
  assert.deepEqual(plain(log.posts), [[
    ['product_no[]', '1'],
    ['change', 'is_selling'],
    ['state', 'T'],
    ['market[1][is_display]', 'T'],
    ['market[1][is_selling]', 'F'],
  ]]);
  assert.equal(state.get('1').selling, true);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
});

test('아트공구 — 상품목록은 100개씩 끝까지 읽는다', async () => {
  const products = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [String(200000 + index), {}]));
  const { api, log } = art09Mall({ products });
  const result = await api.send({ mallKey: 'art09', codes: ['200149'] });
  assert.equal(result.confirmed, 1);
  assert.deepEqual(log.lists, [1, 2, 1, 2]);
});

test('아트공구 — 로그인이 풀렸으면 아무것도 보내지 않는다 · 몰이 거절하면 실패로 센다', async () => {
  const loggedOut = art09Mall({ products: { 1: {} }, loggedOut: true });
  const refused = await loggedOut.api.send({ mallKey: 'art09', codes: ['1'] });
  assert.equal(refused.success, false);
  assert.match(refused.error, /아트공구 로그인이 풀렸습니다/);
  assert.equal(loggedOut.log.posts.length, 0);

  const rejected = art09Mall({ products: { 1: {} }, stateAnswer: { passed: false, msg: '권한이 없습니다.' } });
  const result = await rejected.api.send({ mallKey: 'art09', codes: ['1'] });
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.ok(result.warnings.some((warning) => /판매상태 변경을 받지 않았습니다.*권한이 없습니다/.test(warning)));
});

test('아트공구 지금 상태 읽기 — 판매안함이면 품절(0), 판매함이면 모름', async () => {
  const { api, log } = art09Mall({ products: { 1: { selling: false }, 2: {} } });
  assert.deepEqual(plain(await api.read({ mallKey: 'art09', codes: ['1', '2', '3'] })), {
    success: true,
    products: [
      { code: '1', options: [{ optionCode: '1', stock: 0, rocket: false }] },
      { code: '2', options: [{ optionCode: '2', stock: null, rocket: false }] },
    ],
    missing: ['3'],
  });
  assert.equal(log.posts.length, 0, '읽기만 한다');
});

/**
 * 롯데ON 품절 = 상품 판매상태 품절(SOUT), 재개 = 판매중(SALE)(실측 2026-09-19). 상품 조회/수정의 [상품판매 변경] →
 * 상품정보일괄수정 → 일괄수정항목 팝업 [저장]이 soapi `updateProductBatch` 에 상품마다
 * {spdNo, trNo, lrtrNo, trGrpCd, dvPdTypCd, code:"07", ctrtTypCd/dvProcTypCd/dmstOvsDvDvsCd:"all", reqTxt:"spdSlStatCd", spdSlStatCd}
 * 를 보낸다. 요청 머리는 화면 함수 `gcm._sbm_setRequestHeader` 가 붙인다 — 화면 안(MAIN)에서만 돈다.
 */
function lotteonMall({ products = {}, loggedOut = false, updateAnswer = null, lagReads = 0 } = {}) {
  const state = new Map(Object.entries(products).map(([no, product]) => [no, {
    spdNo: no, slStatCd: 'SALE', trNo: 'LO10014931', lrtrNo: null, trGrpCd: 'SR', dvPdTypCd: 'GNRL', ctrtTypCd: 'A', ...product,
  }]));
  // 상품 조회가 바뀐 상태를 늦게 보여 준다(실측): 저장 뒤 `lagReads` 번은 옛 상태를 준다.
  const lag = new Map();
  const log = { tabs: [], removed: [], lists: [], updates: [], worlds: [], headers: [] };
  class FakeXhr {
    constructor() { this.headers = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      assert.equal(this.method, 'POST');
      log.headers.push({ ...this.headers });
      const parsed = JSON.parse(body);
      const path = new URL(this.url).pathname;
      let json;
      if (path === '/soapi/v1/product/information/selectProductList') {
        const nos = parsed.spdNo.split('\n');
        log.lists.push(nos);
        const data = nos.filter((no) => state.has(no)).map((no) => {
          const pending = lag.get(no);
          if (pending && pending.reads > 0) {
            pending.reads -= 1;
            return { ...state.get(no), slStatCd: pending.old, pdNm: '상품', sitmJsn: '[]' };
          }
          return { ...state.get(no), pdNm: '상품', sitmJsn: '[]' };
        });
        json = { returnCode: 'SUCCESS', dataCount: data.length, data };
      } else if (path === '/soapi/v1/product/registration/updateProductBatch') {
        log.updates.push(parsed);
        if (!updateAnswer) {
          for (const param of parsed) {
            if (lagReads > 0) lag.set(param.spdNo, { old: state.get(param.spdNo).slStatCd, reads: lagReads });
            state.get(param.spdNo).slStatCd = param.spdSlStatCd;
          }
        }
        json = updateAnswer ?? { returnCode: 'SUCCESS', data: [JSON.stringify({ successCnt: parsed.length, failCnt: 0, productLst: [] })] };
      } else {
        throw new Error(`unexpected ${this.url}`);
      }
      this.status = 200;
      this.responseText = JSON.stringify(json);
      setTimeout(() => this.onload(), 0);
    }
  }
  const module = loadModule({
    XMLHttpRequest: FakeXhr,
    sessionStorage: { getItem: (key) => (key === 'AuthToken' && !loggedOut ? 'page-token' : null) },
    location: { href: loggedOut ? 'https://store.lotteon.com/cm/main/login_SO.wsp' : 'https://store.lotteon.com/cm/main/index_SO.wsp' },
    gcm: {
      _sbm_setRequestHeader: (xhr) => {
        xhr.setRequestHeader('Authorization', 'Bearer page-token');
        xhr.setRequestHeader('X-Timezone', 'GMT+09:00');
      },
    },
  });
  const chrome = {
    tabs: {
      query: async () => [],
      create: async ({ url, active }) => { log.tabs.push([url, active]); return { id: 31 }; },
      get: async () => ({ id: 31, url: 'https://store.lotteon.com/cm/main/index_SO.wsp' }),
      remove: async (id) => { log.removed.push(id); },
      onUpdated: { addListener: (listener) => setTimeout(() => listener(31, { status: 'complete' }, {}), 0), removeListener: () => {} },
    },
    scripting: {
      executeScript: async ({ func, args, world }) => {
        log.worlds.push(world ?? null);
        return [{ result: await func(...args) }];
      },
    },
  };
  const api = module.create({
    chrome,
    fetch: async () => { throw new Error('워커에서 직접 부르지 않는다'); },
    interactiveTabs: { createTab: async () => { throw new Error('앞에 띄우지 않는다'); } },
    tabReason: 'test',
    sleep: async () => {},
  });
  return { api, log, state };
}

test('⭐ 롯데ON 품절은 일괄수정 팝업 [저장]과 같은 요청으로 — 판매중인 상품만 품절(SOUT)로, 다시 읽어 확인한다', async () => {
  const { api, log, state } = lotteonMall({
    products: {
      LO2752600462: {},
      LO2310916826: { slStatCd: 'SOUT' },
      LO2656719130: { slStatCd: 'STP' },
    },
  });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO2752600462', 'LO2310916826', 'LO2656719130', 'LO9999999999', '2752600462'] });
  assert.deepEqual(plain(log.updates), [[{
    spdNo: 'LO2752600462',
    trNo: 'LO10014931',
    lrtrNo: null,
    trGrpCd: 'SR',
    dvPdTypCd: 'GNRL',
    code: '07',
    ctrtTypCd: 'all',
    dvProcTypCd: 'all',
    dmstOvsDvDvsCd: 'all',
    reqTxt: 'spdSlStatCd',
    spdSlStatCd: 'SOUT',
  }]]);
  assert.equal(state.get('LO2752600462').slStatCd, 'SOUT');
  assert.equal(state.get('LO2656719130').slStatCd, 'STP', '롯데ON이 멈춘 상품은 건드리지 않는다');
  assert.equal(result.success, true);
  assert.equal(result.sent, 2, '보낸 1 + 이미 품절 1');
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
  assert.equal(result.failed, 3, '판매중지 1 + 없는 상품 1 + 모양이 틀린 번호 1');
  assert.ok(result.warnings.some((warning) => /판매중지 · 판매종료/.test(warning)));
  // 조회 → 저장 → 다시 조회. 전부 화면 안(MAIN)에서, 화면 함수가 붙인 머리로.
  assert.deepEqual(log.worlds, ['MAIN', 'MAIN', 'MAIN']);
  assert.ok(log.headers.every((headers) => headers.Authorization === 'Bearer page-token' && headers['Content-Type'].startsWith('application/json')));
  assert.ok(!JSON.stringify(result).includes('page-token'), '결과에 토큰이 없다');
  assert.deepEqual(log.tabs, [['https://store.lotteon.com/cm/main/index_SO.wsp', false]]);
  assert.deepEqual(log.removed, [31]);
});

test('롯데ON 판매 재개는 품절(SOUT)인 상품만 판매중(SALE)으로 되돌린다', async () => {
  const { api, log } = lotteonMall({ products: { LO11110000: { slStatCd: 'SOUT' }, LO22220000: {} } });
  const resumed = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000', 'LO22220000'], resume: true });
  assert.deepEqual(log.updates.map((params) => params.map((param) => [param.spdNo, param.spdSlStatCd])), [[['LO11110000', 'SALE']]]);
  assert.equal(resumed.confirmed, 2);
  assert.equal(resumed.already, 1);
});

test('⭐ 롯데ON 상품 조회가 늦게 따라와도 바뀐 상태가 보일 때까지 다시 읽어 확인한다', async () => {
  const { api, log } = lotteonMall({ products: { LO11110000: {} }, lagReads: 3 });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000'] });
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 1);
  assert.deepEqual(plain(result.warnings), []);
  // 처음 조회 1 + 저장 뒤 옛 상태 3번 + 새 상태 1번.
  assert.equal(log.lists.length, 5);
});

test('롯데ON — 끝내 옛 상태면 확인하지 못한 것으로 두고 알린다', async () => {
  const { api } = lotteonMall({ products: { LO11110000: {} }, lagReads: 50 });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000'] });
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 0);
  assert.ok(result.warnings.some((warning) => /아직 옛 상태/.test(warning)));
});

test('롯데ON — 저장이 일부만 됐다고 답하면 그만큼 실패로 세고, 확인은 다시 읽은 것만', async () => {
  const { api } = lotteonMall({
    products: { LO11110000: {}, LO22220000: {} },
    updateAnswer: { returnCode: 'SUCCESS', data: [JSON.stringify({ successCnt: 1, failCnt: 1, productLst: [] })] },
  });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000', 'LO22220000'] });
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.confirmed, 0, '가짜 몰은 상태를 바꾸지 않았다 — 다시 읽어 바뀐 것만 확인');
  assert.ok(result.warnings.some((warning) => /2건 중 1건을 바꾸지 않았다/.test(warning)));
});

test('롯데ON — 로그인이 풀렸으면 아무것도 보내지 않는다', async () => {
  const { api, log } = lotteonMall({ products: { LO11110000: {} }, loggedOut: true });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000'] });
  assert.equal(result.success, false);
  assert.match(result.error, /롯데ON 로그인이 풀렸습니다/);
  assert.equal(log.updates.length, 0);
});

test('롯데ON 지금 상태 읽기 — 판매중이면 모름, 품절 · 판매중지면 살 수 없어 0', async () => {
  const { api, log } = lotteonMall({ products: { LO11110000: { slStatCd: 'SOUT' }, LO22220000: {}, LO33330000: { slStatCd: 'STP' } } });
  assert.deepEqual(plain(await api.read({ mallKey: 'lotte-on', codes: ['LO11110000', 'LO22220000', 'LO33330000', 'LO44440000'] })), {
    success: true,
    products: [
      { code: 'LO11110000', options: [{ optionCode: 'LO11110000', stock: 0, rocket: false }] },
      { code: 'LO22220000', options: [{ optionCode: 'LO22220000', stock: null, rocket: false }] },
      { code: 'LO33330000', options: [{ optionCode: 'LO33330000', stock: 0, rocket: false }] },
    ],
    missing: ['LO44440000'],
  });
  assert.equal(log.updates.length, 0, '읽기만 한다');
  assert.deepEqual(log.lists, [['LO11110000', 'LO22220000', 'LO33330000', 'LO44440000']]);
});

/**
 * 꼬망세 품절 = 재고 0, 재개 = 재고 999(실측 2026-09-19). 노출/재고/KC 설정 화면의 줄마다 있는 [개별수정]이
 * `_mode=view_direct_change` · pcode · _view · _stock · _stock_control · _kc_yn · _kc_num · _kc_date 를 POST 한다.
 * 지금 값은 같은 화면을 상품코드로 검색해 읽는다. 화면 안 함수를 실제로 돌린다.
 */
const KKOMANGSE = 'https://nstore.edupre.co.kr';

function kkomangseRowHtml(code, product) {
  const radio = (name, value, on) => `<input type="radio" name="${name}[${code}]" value="${value}"${on ? ' checked' : ''}>`;
  return `<tr>
    <td><input type="checkbox" name="chk_pcode[${code}]" class="js_ck" value="Y" data-pcode="${code}"></td>
    <td>${radio('_view', 'Y', product.view === 'Y')}${radio('_view', 'N', product.view === 'N')}</td>
    <td>${radio('_stock_control', 'Y', product.control === 'Y')}${radio('_stock_control', 'N', product.control === 'N')}</td>
    <td><input type="text" class="design _stock number_style" name="_stock[${code}]" value="${product.stock}"></td>
    <td>${radio('_kc_yn', 'N', product.kcYn === 'N')}${radio('_kc_yn', 'Y', product.kcYn === 'Y')}
      <input type="text" name="_kc_num[${code}]" value="${product.kcNum}"><input type="text" name="_kc_date[${code}]" value="${product.kcDate}"></td>
    <td><a href="#none" class="c_btn h22 blue product_view_change" data-pcode="${code}">개별수정</a></td>
  </tr>`;
}

function kkomangseMall({ products = {}, loggedOut = false, answer = null } = {}) {
  const state = new Map(Object.entries(products).map(([code, product]) => [code, {
    view: 'Y', control: 'N', stock: '1', kcYn: 'Y', kcNum: 'CB065R2807-5003', kcDate: '0000-00-00', ...product,
  }]));
  const log = { tabs: [], removed: [], searches: [], posts: [] };
  const fetch = async (path, init = {}) => {
    const url = new URL(path, KKOMANGSE);
    if (url.pathname === '/subAdmin/_product_mass.view.php') {
      assert.equal(url.searchParams.get('mode'), 'search');
      assert.equal(url.searchParams.get('pass_input_type'), 'pcode');
      const code = url.searchParams.get('pass_input_value');
      log.searches.push(code);
      if (loggedOut) return { url: `${KKOMANGSE}/subAdmin/login.php`, ok: true, status: 200, text: async () => '<html><body>로그인</body></html>' };
      const rows = state.has(code) ? kkomangseRowHtml(code, state.get(code)) : '';
      return { url: url.href, ok: true, status: 200, text: async () => `<html><body><form name="searchfrm"></form><form name="frm"><table>${rows}</table></form></body></html>` };
    }
    if (url.pathname === '/subAdmin/_product_mass.pro.php' && init.method === 'POST') {
      assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest');
      assert.match(init.headers['Content-Type'], /^application\/x-www-form-urlencoded/);
      const body = new URLSearchParams(init.body);
      log.posts.push([...body.entries()]);
      if (!answer) state.get(body.get('pcode')).stock = body.get('_stock');
      return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify(answer ?? { res: 'success' }) };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const module = loadModule({ fetch, DOMParser: PageDOMParser, location: new URL(`${KKOMANGSE}/subAdmin/_product_mass.view.php`) });
  const chrome = {
    tabs: {
      query: async () => [],
      create: async ({ url, active }) => { log.tabs.push([url, active]); return { id: 41 }; },
      get: async () => ({ id: 41, url: `${KKOMANGSE}/subAdmin/_product_mass.view.php` }),
      remove: async (id) => { log.removed.push(id); },
      onUpdated: { addListener: (listener) => setTimeout(() => listener(41, { status: 'complete' }, {}), 0), removeListener: () => {} },
    },
    scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] },
  };
  const api = module.create({
    chrome,
    fetch: async () => { throw new Error('워커에서 직접 부르지 않는다'); },
    interactiveTabs: { createTab: async () => { throw new Error('앞에 띄우지 않는다'); } },
    tabReason: 'test',
    sleep: async () => {},
  });
  return { api, log, state };
}

test('⭐ 꼬망세 품절은 [개별수정]과 같은 요청으로 — 그 줄의 지금 값을 싣고 재고만 0, 다시 읽어 확인한다', async () => {
  const { api, log, state } = kkomangseMall({
    products: {
      'M0450-U7839-J6532': {},
      'V3231-B1709-N1195': { control: 'Y', stock: '0' },
      'R4090-X3734-V8152': { stock: '32767', kcYn: 'N', kcNum: '', kcDate: '' },
    },
  });
  const result = await api.send({ mallKey: 'kkomangse', codes: ['M0450-U7839-J6532', 'V3231-B1709-N1195', 'R4090-X3734-V8152', 'Z0000-Z0000-Z0000'] });
  assert.deepEqual(plain(log.posts), [
    [['_mode', 'view_direct_change'], ['pcode', 'M0450-U7839-J6532'], ['_view', 'Y'], ['_stock', '0'], ['_stock_control', 'N'],
      ['_kc_yn', 'Y'], ['_kc_num', 'CB065R2807-5003'], ['_kc_date', '0000-00-00']],
    [['_mode', 'view_direct_change'], ['pcode', 'R4090-X3734-V8152'], ['_view', 'Y'], ['_stock', '0'], ['_stock_control', 'N'],
      ['_kc_yn', 'N'], ['_kc_num', ''], ['_kc_date', '']],
  ]);
  assert.equal(state.get('M0450-U7839-J6532').stock, '0');
  assert.equal(state.get('M0450-U7839-J6532').control, 'N', '재고관리는 건드리지 않는다');
  assert.equal(result.success, true);
  assert.equal(result.sent, 3, '보낸 2 + 이미 재고 0 1');
  assert.equal(result.confirmed, 3);
  assert.equal(result.already, 1);
  assert.equal(result.failed, 1, '없는 상품 1');
  // 검색 → (보냄 → 다시 검색) 순. 뒤에서 연 설정 화면은 닫는다.
  assert.deepEqual(log.searches, ['M0450-U7839-J6532', 'M0450-U7839-J6532', 'V3231-B1709-N1195', 'R4090-X3734-V8152', 'R4090-X3734-V8152', 'Z0000-Z0000-Z0000']);
  assert.deepEqual(log.tabs, [[`${KKOMANGSE}/subAdmin/_product_mass.view.php`, false]]);
  assert.deepEqual(log.removed, [41]);
});

test('꼬망세 판매 재개는 재고 0 인 상품만 재고 999 로 되돌린다', async () => {
  const { api, log } = kkomangseMall({ products: { 'A0000-A0000-A0001': { stock: '0' }, 'A0000-A0000-A0002': { stock: '999' } } });
  const result = await api.send({ mallKey: 'kkomangse', codes: ['A0000-A0000-A0001', 'A0000-A0000-A0002'], resume: true });
  assert.deepEqual(log.posts.map((post) => [post.find(([key]) => key === 'pcode')[1], post.find(([key]) => key === '_stock')[1]]), [['A0000-A0000-A0001', '999']]);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
});

test('꼬망세 — 로그인이 풀렸으면 보내지 않고, 몰이 거절하면 실패로 센다', async () => {
  const loggedOut = kkomangseMall({ products: { 'A0000-A0000-A0001': {} }, loggedOut: true });
  const refused = await loggedOut.api.send({ mallKey: 'kkomangse', codes: ['A0000-A0000-A0001'] });
  assert.equal(refused.success, false);
  assert.match(refused.error, /꼬망세 로그인이 풀렸습니다/);
  assert.equal(loggedOut.log.posts.length, 0);

  const rejected = kkomangseMall({ products: { 'A0000-A0000-A0001': {} }, answer: { res: 'fail' } });
  const result = await rejected.api.send({ mallKey: 'kkomangse', codes: ['A0000-A0000-A0001'] });
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
});

test('꼬망세 지금 재고 읽기 — 재고 0 이면 품절(0), 아니면 모름', async () => {
  const { api, log } = kkomangseMall({ products: { 'A0000-A0000-A0001': { stock: '0' }, 'A0000-A0000-A0002': { stock: '1' } } });
  assert.deepEqual(plain(await api.read({ mallKey: 'kkomangse', codes: ['A0000-A0000-A0001', 'A0000-A0000-A0002', 'A0000-A0000-A0003'] })), {
    success: true,
    products: [
      { code: 'A0000-A0000-A0001', options: [{ optionCode: 'A0000-A0000-A0001', stock: 0, rocket: false }] },
      { code: 'A0000-A0000-A0002', options: [{ optionCode: 'A0000-A0000-A0002', stock: null, rocket: false }] },
    ],
    missing: ['A0000-A0000-A0003'],
  });
  assert.equal(log.posts.length, 0, '읽기만 한다');
});

/**
 * 티쳐몰 품절 = 재고 0, 재개 = 재고 999(실측 2026-09-19). [실물] 일괄 업데이트(batch_modify?mode=goodsetc)의 [업데이트하기]가
 * 폼 `goodsBatchUpdateForm` 에 검색 조건(get_search_field)을 붙여 goods_process/batch_goods_modify 로 보낸다.
 * 정보수정(goods/regist)은 승인이 풀려 쓰지 않는다. 화면 안 함수를 실제로 돌린다.
 */
const TEACHER = 'https://shop.teacherville.co.kr';

function teacherBatchHtml(code, product) {
  const options = product.options.map((option) => `
    <input type="hidden" name="default_option_seq[${option.seq}]" value="${code}">
    <input type="text" name="weight[${option.seq}]" value="0">
    <input type="text" name="stock[${option.seq}]" value="${option.stock}">
    <input type="text" name="badstock[${option.seq}]" value="0">
    <input type="text" name="safe_stock[${option.seq}]" value="">`).join('');
  return `<html><body>
    <form id="goodsBatchUpdateForm" name="goodsBatchUpdateForm">
      <select name="batchmodify_selector"><option value="goodsetc" selected>상품코드/무게/재고</option></select>
      <select name="orderby"><option value="goods_seq" selected>상품번호</option></select>
      <select name="perpage"><option value="50" selected>50</option></select>
      <input type="text" name="all_weight" value=""><input type="text" name="all_stock" value="">
      <input type="text" name="all_badstock" value=""><input type="text" name="all_safe_stock" value="">
      <table><tr>
        <td><input type="checkbox" class="chk" name="goods_seq[]" value="${code}"></td>
        <td><input type="hidden" name="tmpcode[${code}]" value=""><input type="text" name="code[${code}]" value="${code}">${options}</td>
      </tr></table>
      <button type="button" name="update_goods">업데이트하기</button>
    </form>
    <script>
get_search_field	= new Array();
get_search_field[0] = ["page","1"];
get_search_field[1] = ["mode","goodsetc"];
get_search_field[2] = ["keyword","${code}"];
get_search_field[3] = ["goods_kind","goods,coupon"];
get_search_field[4] = ["orderby","goods_seq"];
get_search_field[5] = ["sort","desc"];
get_search_field[6] = ["perpage","50"];
get_search_field[7] = ["provider_seq","708"];
    </script></body></html>`;
}

function teacherMall({ products = {}, loggedOut = false, loseApproval = false } = {}) {
  const state = new Map(Object.entries(products).map(([code, product]) => [code, {
    approval: '승인', options: [{ seq: '2176308', stock: '999' }], ...product,
  }]));
  const log = { tabs: [], removed: [], batches: [], catalogs: [], posts: [] };
  const fetch = async (path, init = {}) => {
    const url = new URL(path, TEACHER);
    if (loggedOut && init.method !== 'POST') {
      return { url: `${TEACHER}/selleradmin/login/index`, ok: true, status: 200, text: async () => '<html><body>로그인</body></html>' };
    }
    if (url.pathname === '/selleradmin/goods/batch_modify') {
      assert.equal(url.searchParams.get('mode'), 'goodsetc');
      const code = url.searchParams.get('keyword');
      log.batches.push(code);
      const html = state.has(code) ? teacherBatchHtml(code, state.get(code)) : '<html><body><form id="goodsBatchUpdateForm"></form></body></html>';
      return { url: url.href, ok: true, status: 200, text: async () => html };
    }
    if (url.pathname === '/selleradmin/goods/catalog') {
      const code = url.searchParams.get('keyword');
      log.catalogs.push(code);
      const product = state.get(code);
      const soldOut = product && product.options.every((option) => Number(option.stock) === 0);
      const row = product ? `<tr><td><input type="checkbox" class="chk" name="goods_seq[]" value="${code}"></td><td>[상품번호: ${code}] 상품</td><td>${product.approval}${soldOut ? '품절' : '정상'}</td><td>노출</td></tr>` : '';
      return { url: url.href, ok: true, status: 200, text: async () => `<html><body><table>${row}</table></body></html>` };
    }
    if (url.pathname === '/selleradmin/goods_process/batch_goods_modify' && init.method === 'POST') {
      assert.match(init.headers['Content-Type'], /^application\/x-www-form-urlencoded/);
      const body = [...new URLSearchParams(init.body).entries()];
      log.posts.push(body);
      for (const [name, value] of body) {
        const match = /^stock\[(\d+)\]$/.exec(name);
        if (!match) continue;
        for (const product of state.values()) {
          const option = product.options.find((candidate) => candidate.seq === match[1]);
          if (option) option.stock = value;
        }
      }
      if (loseApproval) for (const product of state.values()) product.approval = '미승인';
      return { url: url.href, ok: true, status: 200, text: async () => '<script>parent.openDialogAlert("변경 되었습니다.")</script>' };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const module = loadModule({ fetch, DOMParser: PageDOMParser, location: new URL(`${TEACHER}/selleradmin/goods/catalog`) });
  const chrome = {
    tabs: {
      query: async () => [],
      create: async ({ url, active }) => { log.tabs.push([url, active]); return { id: 51 }; },
      get: async () => ({ id: 51, url: `${TEACHER}/selleradmin/goods/catalog` }),
      remove: async (id) => { log.removed.push(id); },
      onUpdated: { addListener: (listener) => setTimeout(() => listener(51, { status: 'complete' }, {}), 0), removeListener: () => {} },
    },
    scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] },
  };
  const api = module.create({
    chrome,
    fetch: async () => { throw new Error('워커에서 직접 부르지 않는다'); },
    interactiveTabs: { createTab: async () => { throw new Error('앞에 띄우지 않는다'); } },
    tabReason: 'test',
    sleep: async () => {},
  });
  return { api, log, state };
}

test('⭐ 티쳐몰 품절은 [실물] 일괄 업데이트의 [업데이트하기]와 같은 요청으로 — 그 상품 재고만 0, 검색 조건을 붙여 보낸다', async () => {
  const { api, log, state } = teacherMall({ products: { 1207830: {} } });
  const result = await api.send({ mallKey: 'teacher-mall', codes: ['1207830', '1111111'] });
  assert.deepEqual(plain(log.posts), [[
    ['batchmodify_selector', 'goodsetc'], ['orderby', 'goods_seq'], ['perpage', '50'],
    ['all_weight', ''], ['all_stock', ''], ['all_badstock', ''], ['all_safe_stock', ''],
    ['goods_seq[]', '1207830'], ['tmpcode[1207830]', ''], ['code[1207830]', '1207830'],
    ['default_option_seq[2176308]', '1207830'], ['weight[2176308]', '0'], ['stock[2176308]', '0'],
    ['badstock[2176308]', '0'], ['safe_stock[2176308]', ''],
    ['page', '1'], ['mode', 'goodsetc'], ['keyword', '1207830'], ['goods_kind', 'goods,coupon'],
    ['orderby', 'goods_seq'], ['sort', 'desc'], ['perpage', '50'], ['provider_seq', '708'],
  ]]);
  assert.equal(state.get('1207830').options[0].stock, '0');
  assert.equal(result.success, true);
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 1);
  assert.equal(result.failed, 1, '없는 상품 1');
  assert.deepEqual(plain(result.warnings.filter((warning) => /상품목록 상태/.test(warning))), []);
  assert.deepEqual(log.catalogs, ['1207830'], '보낸 뒤 상품목록에서 승인 · 판매 상태를 본다');
  assert.deepEqual(log.tabs, [[`${TEACHER}/selleradmin/goods/catalog`, false]]);
  assert.deepEqual(log.removed, [51]);
});

test('티쳐몰 판매 재개는 재고 0 인 상품만 재고 999 로 되돌린다', async () => {
  const { api, log } = teacherMall({ products: { 1: { options: [{ seq: '11', stock: '0' }] }, 2: { options: [{ seq: '22', stock: '999' }] } } });
  const result = await api.send({ mallKey: 'teacher-mall', codes: ['1', '2'], resume: true });
  assert.deepEqual(log.posts.map((post) => post.find(([name]) => name.startsWith('stock['))), [['stock[11]', '999']]);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
});

test('⭐ 티쳐몰 — 보낸 뒤 승인이 풀렸으면(미승인) 확인으로 세지 않고 알린다', async () => {
  const { api } = teacherMall({ products: { 1207830: {} }, loseApproval: true });
  const result = await api.send({ mallKey: 'teacher-mall', codes: ['1207830'] });
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 0);
  assert.ok(result.warnings.some((warning) => /승인이 풀렸습니다/.test(warning)));
});

test('티쳐몰 — 옵션이 여럿인 상품은 보내지 않고, 로그인이 풀렸으면 아무것도 보내지 않는다', async () => {
  const multi = teacherMall({ products: { 5: { options: [{ seq: '51', stock: '999' }, { seq: '52', stock: '999' }] } } });
  const skipped = await multi.api.send({ mallKey: 'teacher-mall', codes: ['5'] });
  assert.equal(multi.log.posts.length, 0);
  assert.equal(skipped.failed, 1);
  assert.ok(skipped.warnings.some((warning) => /옵션이 여럿인 상품 1개/.test(warning)));

  const loggedOut = teacherMall({ products: { 1207830: {} }, loggedOut: true });
  const refused = await loggedOut.api.send({ mallKey: 'teacher-mall', codes: ['1207830'] });
  assert.equal(refused.success, false);
  assert.match(refused.error, /티쳐몰 로그인이 풀렸습니다/);
  assert.equal(loggedOut.log.posts.length, 0);
});

test('티쳐몰 지금 재고 읽기 — 재고 0 이면 품절(0), 아니면 모름', async () => {
  const { api, log } = teacherMall({ products: { 1: { options: [{ seq: '11', stock: '0' }] }, 2: {} } });
  assert.deepEqual(plain(await api.read({ mallKey: 'teacher-mall', codes: ['1', '2', '3'] })), {
    success: true,
    products: [
      { code: '1', options: [{ optionCode: '11', stock: 0, rocket: false }] },
      { code: '2', options: [{ optionCode: '2176308', stock: null, rocket: false }] },
    ],
    missing: ['3'],
  });
  assert.equal(log.posts.length, 0, '읽기만 한다');
});
