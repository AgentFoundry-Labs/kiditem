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
const CHANGE_PATH = '/tenants/seller-web/vendorinventory/stock-manager/remain-change/request';

function wingMall({ tabUrl = 'https://wing.coupang.com/tenants/cs/product/review', products = {}, reject = {}, itemsStatus = 200 } = {}) {
  // products: 등록상품ID → [{ vendorItemId, stockQuantity, registrationType }]
  const state = new Map(Object.entries(products).map(([id, items]) => [id, items.map((item, index) => ({
    vendorInventoryItemId: Number(`7${id.slice(-6)}${index}`),
    registrationType: 'NORMAL',
    status: 'APPROVED',
    ...item,
  }))]));
  const log = { tabs: [], removed: [], reads: [], changes: [] };
  const chrome = {
    tabs: {
      get: async () => ({ id: 7, url: tabUrl }),
      remove: async (id) => { log.removed.push(id); },
      onUpdated: {
        addListener: (listener) => setTimeout(() => listener(7, { status: 'complete' }, {}), 0),
        removeListener: () => {},
      },
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        assert.equal(func.name, 'requestOnPage');
        const [path, method, contentType, body] = args;
        if (method === 'GET' && path.startsWith(ITEMS_PATH)) {
          const id = path.slice(ITEMS_PATH.length).split('?')[0];
          log.reads.push(id);
          const items = state.get(id);
          const json = itemsStatus === 200 && items ? { success: true, data: items.map((item) => ({ ...item })) } : null;
          return [{ result: { status: itemsStatus === 200 && !items ? 404 : itemsStatus, json, preview: json ? '' : '<html>', url: `https://wing.coupang.com${path}` } }];
        }
        if (method === 'POST' && path === CHANGE_PATH) {
          assert.match(contentType, /^application\/x-www-form-urlencoded/);
          assert.ok(body.startsWith('stockManageItems='));
          const { dtos } = JSON.parse(decodeURIComponent(body.slice('stockManageItems='.length)));
          log.changes.push(dtos);
          const results = dtos.map((dto) => {
            const refused = reject[String(dto.vendorItemId)];
            if (!refused) {
              for (const items of state.values()) {
                const item = items.find((candidate) => candidate.vendorItemId === dto.vendorItemId);
                if (item) item.stockQuantity = dto.inventoryQuantity;
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
    interactiveTabs: { createTab: async ({ url }) => { log.tabs.push(url); return { id: 7 }; } },
    tabReason: 'test',
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

  assert.deepEqual(log.tabs, ['https://wing.coupang.com/tenants/cs/product/review']);
  // 옵션을 짚은 상품은 그 옵션만, 짚지 않은 상품은 옵션 전부다. 이미 0 인 옵션은 보내지 않는다.
  assert.deepEqual(plain(log.changes), [[
    { vendorInventoryItemId: 77103210, vendorItemId: 94489536455, inventoryQuantity: 0 },
  ]]);
  assert.equal(state.get('15966710321')[1].stockQuantity, 998, '짚지 않은 옵션은 그대로다');
  assert.equal(result.success, true);
  assert.equal(result.sent, 2);
  assert.equal(result.confirmed, 2);
  assert.equal(result.failed, 1);
  assert.ok(result.warnings.includes('1건은 쿠팡 윙 등록상품ID 모양이 아니라 보내지 않았습니다.'), result.warnings.join(' / '));
  assert.ok(result.warnings.includes('1개 옵션은 이미 재고 0이었습니다.'), result.warnings.join(' / '));
  assert.deepEqual(log.removed, [7], '연 탭은 닫는다');
});

test('해제는 같은 칸에 재고 999 를 넣는다', async () => {
  const { api, log } = wingMall({ products: { 15966710321: [{ vendorItemId: 94489536455, stockQuantity: 0 }] } });
  const result = await api.send({ mallKey: 'coupang', codes: ['15966710321'], resume: true });
  assert.equal(log.changes[0][0].inventoryQuantity, 999);
  assert.equal(result.confirmed, 1);
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
  assert.ok(result.warnings.includes('로켓그로스 옵션 1개는 쿠팡 재고라 건너뛰었습니다.'), result.warnings.join(' / '));
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
