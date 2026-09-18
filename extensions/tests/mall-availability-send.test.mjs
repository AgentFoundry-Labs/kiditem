import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(repoRoot, 'extensions/kiditem-os/background/orders/mall-availability-send.js');

function loadModule() {
  const context = { self: {}, console, URL, URLSearchParams, Promise, setTimeout, clearTimeout, Error };
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
  assert.deepEqual([...module.READ_MALL_KEYS], ['coupang']);
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
