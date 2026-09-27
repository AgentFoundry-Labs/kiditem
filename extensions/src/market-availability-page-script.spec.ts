// 옛 `extensions/tests/mall-availability-send.test.mjs`의 gmarket 절을 옮긴 스펙(KID-256) — 서비스워커 쪽 몰 쓰기 모듈을 가짜 탭에서
// 돌리고, 화면 안 요청은 실제 페이지 파일(`content/page-call/mall-availability.js`)을 몰 모양 가짜 fetch 위에서 돌린다.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';
import mainSource from '../kiditem-os/content/page-call/mall-availability-main.js?raw';
import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/gmarket/availability';
import './sites/auction/availability';
import './sites/11st/availability';
import './sites/smartstore/availability';

const { DOMParser: PageDOMParser, FormData: PageFormData } = new JSDOM('').window;
const plain = (value: any) => JSON.parse(JSON.stringify(value));
// 옮긴 가짜 몰은 옛 JS 그대로다 — 폼 본문을 느슨하게 읽는다(확장 tsconfig의 WebWorker lib에는 `entries()` 타입이 없다).
const URLSearchParams: any = globalThis.URLSearchParams;
const assert = {
  equal: (actual: unknown, expected: unknown, message?: string) => expect(actual, message).toBe(expected),
  deepEqual: (actual: unknown, expected: unknown, message?: string) => expect(actual, message).toEqual(expected),
  ok: (value: unknown, message?: string) => expect(Boolean(value), message).toBe(true),
  match: (value: unknown, pattern: RegExp, message?: string) => expect(String(value), message).toMatch(pattern),
};

/**
 * 지마켓 · 옥션(ESM Plus) 품절 = 판매중지(21), 판매 재개 = 판매가능(11). 상품 조회/수정 [판매 상태 변경] 창의 [변경]이
 * 상품마다 보내는 PUT `/api/ea/goods/{마스터상품번호}/sellStatus` 그대로다(실측 2026-09-19).
 */
const ESM = 'https://item.esmplus.com';

function esmMall({ items = {}, loggedOut = false, putAnswer = null, lagReads = 0 }: any = {}) {
  // items: 마스터상품번호 → { gmkt?: [사이트번호, 상태], iac?: [사이트번호, 상태] }
  const state = new Map<string, any>(Object.entries(items as Record<string, any>).map(([goodsNo, sites]: any) => [goodsNo, {
    siteGoodsNo: { gmkt: sites.gmkt?.[0] ?? null, iac: sites.iac?.[0] ?? null },
    sellStatus: { gmkt: sites.gmkt?.[1] ?? null, iac: sites.iac?.[1] ?? null },
    siteSellerId: { gmkt: sites.gmkt ? 'kiditem' : null, iac: sites.iac ? 'kiditem2' : null },
    previous: null,
  }]));
  const log: any = { tabs: [], removed: [], searches: [], puts: [] };
  let putDone = false;
  let reads = 0;
  const fetch = async (path: any, init: any = {}) => {
    const url = new URL(path, ESM);
    if (loggedOut) return { url: 'https://signin.esmplus.com/login', ok: true, status: 200, text: async () => '<input type="password">' };
    if (url.pathname === '/api/ea/goods/search' && init.method === 'POST') {
      assert.equal(init.headers['Content-Type'], 'application/json');
      const body = JSON.parse(init.body);
      log.searches.push(body);
      const ids = body.query.goodsIds.split(',');
      if (putDone) reads += 1;
      const lagging = putDone && reads <= lagReads;
      const out = [...state.entries()].filter(([goodsNo, item]: any) => ids.includes(goodsNo)
        || ids.includes(item.siteGoodsNo.gmkt) || ids.includes(item.siteGoodsNo.iac))
        .map(([goodsNo, item]: any) => ({ goodsNo, siteGoodsNo: item.siteGoodsNo, sellStatus: lagging && item.previous ? item.previous : item.sellStatus, siteSellerId: item.siteSellerId, stock: { gmkt: 999, iac: 0 } }));
      return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify({ resultCode: 0, message: null, data: { items: out, totalCount: out.length } }) };
    }
    const put = /^\/api\/ea\/goods\/(\d+)\/sellStatus$/.exec(url.pathname);
    if (put && init.method === 'PUT') {
      const body = JSON.parse(init.body);
      log.puts.push({ goodsNo: put[1], body, g: init.headers['X-G-SELLER-ID'], a: init.headers['X-A-SELLER-ID'] });
      if (putAnswer) return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify(putAnswer) };
      const item = state.get(put[1]);
      item.previous = { ...item.sellStatus };
      for (const [site, isSell] of Object.entries(body.isSell)) item.sellStatus[site] = isSell ? '11' : '21';
      putDone = true;
      const data = Object.fromEntries(Object.keys(body.isSell).map((site) => [site, { resultCode: 0, message: '' }]));
      return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify({ resultCode: 0, message: null, data }) };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const harness = availabilityHarness({ mallKey: 'gmarket', sources: [pageSource, mainSource], page: { fetch, location: new URL(`${ESM}/goods/list`) } });
  const api: any = harness.api;
  return { api, log, state };
}

it('⭐ 지마켓 품절은 ESM [판매 상태 변경] → 판매중지와 같은 요청으로 — 판매중인 상품만, 사이트 판매자 아이디를 머리에 싣는다', async () => {
  const { api, log, state } = esmMall({ items: {
    6518691205: { gmkt: ['4829864103', '11'] },
    6276734052: { gmkt: ['4713197366', '21'] },
    6000000001: { gmkt: ['4000000001', '22'] },
    6000000002: { gmkt: ['4000000002', '11'], iac: ['A000000002', '11'] },
  } });
  const result = await api.send({ mallKey: 'gmarket', codes: [
    '4829864103_6518691205', '4713197366_6276734052', '4000000001_6000000001', '4000000002_6000000002', '4999999999_1', 'F123_1',
  ] });
  assert.deepEqual(plain(log.puts), [{ goodsNo: '6518691205', body: { isSell: { gmkt: false } }, g: 'kiditem', a: '' }]);
  assert.equal(state.get('6518691205').sellStatus.gmkt, '21');
  assert.equal(log.searches[0].query.goodsIds, '4829864103,4713197366,4000000001,4000000002,4999999999');
  assert.equal(result.success, true);
  // 판매불가(22)는 이미 못 산다 — 품절로는 이미 된 것이다.
  assert.equal(result.sent, 3, '보낸 1 + 이미 판매중지 1 + 판매불가 1');
  assert.equal(result.confirmed, 3);
  assert.equal(result.already, 2);
  assert.equal(result.failed, 3, '통합상품 1 · 없는 상품 1 · 모양이 다른 코드 1');
  assert.ok(result.warnings.some((warning: any) => /통합상품/.test(warning)));
});

it('옥션 판매 재개는 판매중지(21)인 상품만 판매가능으로 — 옛 옥션 번호(사방넷 뒷자리 없음)도 찾는다', async () => {
  const { api, log } = esmMall({ items: { 2793777513: { iac: ['C457971713', '21'] }, 6338180986: { iac: ['F550178284', '11'] } } });
  const result = await api.send({ mallKey: 'auction', codes: ['C457971713', 'F550178284_6338180986'], resume: true });
  assert.deepEqual(plain(log.puts), [{ goodsNo: '2793777513', body: { isSell: { iac: true } }, g: '', a: 'kiditem2' }]);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
});

it('ESM — 몰이 받지 않으면 몰이 한 말을 싣고, 목록이 늦게 따라와도 다시 읽어 확인한다 · 로그인이 풀렸으면 보내지 않는다', async () => {
  const refused = esmMall({
    items: { 6518691205: { gmkt: ['4829864103', '11'] } },
    putAnswer: { resultCode: 0, data: { gmkt: { resultCode: 3100, message: '최대 상품 수량을 초과했습니다.' } } },
  });
  const no = await refused.api.send({ mallKey: 'gmarket', codes: ['4829864103_6518691205'] });
  assert.equal(no.sent, 0);
  assert.equal(no.failed, 1);
  assert.ok(no.warnings.some((warning: any) => /최대 상품 수량/.test(warning)));

  const late = esmMall({ items: { 6518691205: { gmkt: ['4829864103', '11'] } }, lagReads: 2 });
  assert.equal((await late.api.send({ mallKey: 'gmarket', codes: ['4829864103_6518691205'] })).confirmed, 1);

  const out = esmMall({ items: { 6518691205: { gmkt: ['4829864103', '11'] } }, loggedOut: true });
  const halted = await out.api.send({ mallKey: 'gmarket', codes: ['4829864103_6518691205'] });
  assert.equal(halted.success, false);
  assert.match(halted.error, /로그인이 풀렸습니다/);
  assert.equal(out.log.puts.length, 0);
});

/**
 * 11번가 품절 = 판매중지, 판매 재개 = 판매중지 해제. 상품조회/수정의 [판매중지] · [판매중지 해제]가 여는 확인 창의
 * [적용](`updateProductSelStat`) 그대로다(실측 2026-09-19).
 */
const ST11 = 'https://soffice.11st.co.kr';
// "총 N건 중 M건" — 11번가 창은 EUC-KR 이다.
const EUCKR = { 총: [0xc3, 0xd1], 건: [0xb0, 0xc7], 중: [0xc1, 0xdf] };
function eucKr(text: any) {
  const bytes: any = [];
  for (const char of text) bytes.push(...((EUCKR as any)[char] ?? [char.charCodeAt(0) & 0xff]));
  return Uint8Array.from(bytes).buffer;
}

function st11Mall({ products = {}, loggedOut = false, saveMsg = 'SAVE_OK' }: any = {}) {
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([prdNo, product]: any) => [prdNo, { selStatCd: '103', stckQty: 999, ...product }]));
  const log: any = { tabs: [], removed: [], lists: [], saves: [] };
  const fetch = async (path: any, init: any = {}) => {
    const url = new URL(path, ST11);
    if (loggedOut) return { url: 'https://login.11st.co.kr/auth/front/selleroffice/login.tmall', ok: true, status: 200, text: async () => '<html>로그인</html>' };
    if (url.pathname === '/product/SellProductAjaxAction.tmall' && url.searchParams.get('method') === 'getSellProductListJSON') {
      const prdNos = decodeURIComponent(url.searchParams.get('prdNo') as string).split('\r\n');
      log.lists.push(prdNos);
      const rows = prdNos.filter((no) => state.has(no)).map((no) => ({ prdNo: Number(no), prdNm: '상품', selStatCd: state.get(no).selStatCd, stckQty: state.get(no).stckQty, setTypCd: '' }));
      return { url: url.href, ok: true, status: 200, text: async () => `(${JSON.stringify({ TOTAL_COUNT: rows.length, DATA_LIST: rows })})` };
    }
    if (url.pathname === '/product/SellProductAction.tmall' && url.searchParams.get('method') === 'updateProductSelStat') {
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      const mode = url.searchParams.get('prdStatCd') as string;
      const body = [...new URLSearchParams(init.body).entries()];
      log.saves.push({ mode, body });
      const prdNos = new URLSearchParams(init.body).get('trgtPrdNos').split(',');
      if (saveMsg === 'SAVE_OK') for (const no of prdNos) state.get(no).selStatCd = mode === 'SELL_STOP' ? '105' : '103';
      const html = `<script>var msg = "${saveMsg}"; if(msg == 'SAVE_OK'){ alert("총 ${prdNos.length}건 중 ${prdNos.length}건 상품이 처리 되었습니다."); }</script>`;
      return { url: url.href, ok: true, status: 200, arrayBuffer: async () => eucKr(html) };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const harness = availabilityHarness({ mallKey: 'gmarket', sources: [pageSource, mainSource], page: { fetch, TextDecoder, location: new URL(`${ST11}/view/8006`) } });
  const api: any = harness.api;
  return { api, log, state };
}

it('⭐ 11번가 품절은 [판매중지] 확인 창의 [적용]과 같은 요청으로 — 판매중인 상품만, 상품번호는 쉼표로 이어 한 번에', async () => {
  const { api, log, state } = st11Mall({ products: { 9568609387: {}, 5632014673: {}, 9223456311: { selStatCd: '105' }, 1000000001: { selStatCd: '102' } } });
  const result = await api.send({ mallKey: '11st', codes: ['9568609387', '5632014673', '9223456311', '1000000001', '1000000009', 'x'] });
  assert.deepEqual(plain(log.saves), [{
    mode: 'SELL_STOP',
    body: [['chkPrdNoCount', '2'], ['trgtPrdNos', '9568609387,5632014673'], ['content', '']],
  }]);
  assert.equal(state.get('9568609387').selStatCd, '105');
  assert.deepEqual(log.lists[0], ['9568609387', '5632014673', '9223456311', '1000000001', '1000000009']);
  // 전시전(102)은 이미 못 산다 — 품절로는 이미 된 것이다.
  assert.equal(result.sent, 4, '보낸 2 + 이미 판매중지 1 + 전시전 1');
  assert.equal(result.confirmed, 4);
  assert.equal(result.already, 2);
  assert.equal(result.failed, 2, '없는 상품 1 · 모양이 다른 코드 1');
});

it('11번가 해제는 판매중지이면서 재고가 있는 상품만 [판매중지 해제]로 — 재고 0 은 화면도 막아 알린다', async () => {
  const { api, log } = st11Mall({ products: { 1: { selStatCd: '105' }, 2: { selStatCd: '105', stckQty: 0 }, 3: {} } });
  const result = await api.send({ mallKey: '11st', codes: ['100001', '100002', '100003'].map((code, index) => String(index + 1).padStart(6, '0')) });
  assert.equal(result.success, true);
  const { api: api2, log: log2 } = st11Mall({ products: { 1000001: { selStatCd: '105' }, 1000002: { selStatCd: '105', stckQty: 0 }, 1000003: {} } });
  const resumed = await api2.send({ mallKey: '11st', codes: ['1000001', '1000002', '1000003'], resume: true });
  assert.deepEqual(log2.saves.map((save: any) => [save.mode, save.body[1][1]]), [['SELL_RELEASE', '1000001']]);
  assert.equal(resumed.confirmed, 2);
  assert.equal(resumed.already, 1);
  assert.equal(resumed.failed, 1);
  assert.ok(resumed.warnings.some((warning: any) => /재고가 0/.test(warning)));
  assert.equal(log.saves.length, 0, '6자리 번호는 목록에 없어 보내지 않는다');
});

it('11번가 — 창이 SAVE_OK 가 아니면 받지 않은 것이다 · 로그인이 풀렸으면 보내지 않는다', async () => {
  const refused = st11Mall({ products: { 9568609387: {} }, saveMsg: 'ERROR' });
  const no = await refused.api.send({ mallKey: '11st', codes: ['9568609387'] });
  assert.equal(no.sent, 0);
  assert.equal(no.failed, 1);

  const out = st11Mall({ products: { 9568609387: {} }, loggedOut: true });
  const halted = await out.api.send({ mallKey: '11st', codes: ['9568609387'] });
  assert.equal(halted.success, false);
  assert.match(halted.error, /로그인이 풀렸습니다/);
  assert.equal(out.log.saves.length, 0);
});

/**
 * 스마트스토어 품절 = 판매중지(SUSPENSION), 판매 재개 = 판매중(SALE). 원상품 목록의 판매상태 변경이 보내는
 * PATCH `bulk-update?_action=updateProductStatusType` 그대로이고, 비동기라 결과를 묻는다. 화면 자신의 `$http` 로 보낸다.
 */
function smartstoreMall({ products = {}, loggedOut = false, statusState = 'STARTED', lagReads = 0, progressNever = false }: any = {}) {
  // products: 원상품번호 → { channel: 채널상품번호, status }
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([id, product]: any) => [id, { previous: null, ...product }]));
  const log: any = { tabs: [], removed: [], searches: [], patches: [], progress: 0 };
  let lastSuccess: any = [];
  let patched = false;
  let reads = 0;
  const $http = async (config: any) => {
    if (loggedOut) throw { status: 401, data: { message: '로그인' } };
    if (config.method === 'POST' && config.url === '/api/products/list/search') {
      log.searches.push(config.data);
      const keywords = config.data.searchKeyword.split(',');
      if (patched && config.data.searchKeywordType === 'CHANNEL_PRODUCT_NO') reads += 1;
      const lagging = patched && reads <= lagReads;
      const content = [...state.entries()].filter(([id, product]: any) => (config.data.searchKeywordType === 'PRODUCT_NO'
        ? keywords.includes(id) : keywords.includes(product.channel)))
        .map(([id, product]: any) => ({ id: Number(id), productStatusType: lagging && product.previous ? product.previous : product.status, singleChannelProducts: [{ channelProductNo: Number(product.channel) }] }));
      return { status: 200, data: { content, total: content.length } };
    }
    if (config.method === 'PATCH' && config.url === '/api/products/bulk-update?_action=updateProductStatusType') {
      log.patches.push(config.data);
      if (statusState !== 'STARTED') return { status: 200, data: { status: statusState } };
      for (const id of config.data.productNos) {
        const product = state.get(String(id));
        product.previous = product.status;
        product.status = config.data.productStatusType;
      }
      lastSuccess = config.data.productNos.map(Number);
      patched = true;
      return { status: 200, data: { status: 'STARTED' } };
    }
    if (config.method === 'GET' && config.url === '/api/products/bulk-update?_action=getBulkUpdateProgressResult') {
      log.progress += 1;
      if (progressNever || log.progress < 2) return { status: 200, data: { completed: false, progress: 50 } };
      return { status: 200, data: { completed: true, progress: 100, productBulkUpdateResultVO: { successIds: lastSuccess, resultMessage: {} } } };
    }
    throw new Error(`unexpected ${config.method} ${config.url}`);
  };
  const window: any = { angular: { element: () => ({ injector: () => ({ get: (name: any) => (name === '$http' ? $http : null) }) }) } };
  const harness = availabilityHarness({ mallKey: 'gmarket', sources: [pageSource, mainSource], page: { window, document: { body: {} }, location: new URL('https://sell.smartstore.naver.com/#/products/origin-list') } });
  const api: any = harness.api;
  log.calls = harness.calls;
  return { api, log, state };
}

it('⭐ 스마트스토어 품절은 판매상태 변경(판매중지)과 같은 요청으로 — 화면의 $http 로, 원상품번호로, 비동기 결과를 기다린다', async () => {
  const { api, log, state } = smartstoreMall({ products: {
    5001000001: { channel: '13720932232', status: 'SALE' },
    5001000002: { channel: '13720932405', status: 'OUTOFSTOCK' },
    5001000003: { channel: '13397946544', status: 'WAIT' },
    5001000004: { channel: '13325498673', status: 'SALE' },
  } });
  const result = await api.send({ mallKey: 'smartstore', codes: ['13720932232', '13720932405', '13397946544', '5001000004', '13999999999', 'abc'] });
  assert.deepEqual(plain(log.patches), [{ productNos: [5001000001, 5001000004], productStatusType: 'SUSPENSION', productBulkUpdateType: 'SUSPENSION' }]);
  assert.equal(state.get('5001000001').status, 'SUSPENSION');
  // 화면 자신의 $http로 — MAIN 처리기(`mall-availability-main.js`)만 부른다.
  assert.ok(log.calls.length > 0 && log.calls.every((call: any) => call.name === 'smartstoreApiOnPage'));
  assert.deepEqual(log.searches.slice(0, 2).map((search: any) => [search.searchKeywordType, search.searchKeyword]), [
    ['CHANNEL_PRODUCT_NO', '13720932232,13720932405,13397946544,5001000004,13999999999'],
    ['PRODUCT_NO', '5001000004,13999999999'],
  ]);
  // 판매대기(WAIT)는 이미 못 산다 — 품절로는 이미 된 것이다.
  assert.equal(result.sent, 4, '보낸 2 + 이미 품절 1 + 판매대기 1');
  assert.equal(result.confirmed, 4);
  assert.equal(result.already, 2);
  assert.equal(result.failed, 2, '없는 상품 1 · 모양이 다른 코드 1');
  assert.ok(log.progress >= 2, '끝날 때까지 결과를 묻는다');
});

it('스마트스토어 판매 재개는 판매중지인 상품만 판매중(SALE)으로', async () => {
  const { api, log } = smartstoreMall({ products: { 5001000001: { channel: '13720932232', status: 'SUSPENSION' }, 5001000002: { channel: '13720932405', status: 'SALE' } } });
  const result = await api.send({ mallKey: 'smartstore', codes: ['13720932232', '13720932405'], resume: true });
  assert.deepEqual(plain(log.patches), [{ productNos: [5001000001], productStatusType: 'SALE', productBulkUpdateType: 'SALE' }]);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
});

it('스마트스토어 — 이미 일괄변경 중(ALREADY_PROGRESS)이면 받지 않은 것이다 · 결과를 끝까지 못 받아도 다시 읽어 확인한다 · 로그인이 풀렸으면 보내지 않는다', async () => {
  const busy = smartstoreMall({ products: { 5001000001: { channel: '13720932232', status: 'SALE' } }, statusState: 'ALREADY_PROGRESS' });
  const no = await busy.api.send({ mallKey: 'smartstore', codes: ['13720932232'] });
  assert.equal(no.sent, 0);
  assert.equal(no.failed, 1);
  assert.ok(no.warnings.some((warning: any) => /이미 수정중/.test(warning)));

  const slow = smartstoreMall({ products: { 5001000001: { channel: '13720932232', status: 'SALE' } }, progressNever: true, lagReads: 1 });
  const late = await slow.api.send({ mallKey: 'smartstore', codes: ['13720932232'] });
  assert.equal(late.confirmed, 1);
  assert.ok(late.warnings.some((warning: any) => /끝까지 받지 못했습니다/.test(warning)));

  const out = smartstoreMall({ products: { 5001000001: { channel: '13720932232', status: 'SALE' } }, loggedOut: true });
  const halted = await out.api.send({ mallKey: 'smartstore', codes: ['13720932232'] });
  assert.equal(halted.success, false);
  assert.match(halted.error, /로그인이 풀렸습니다/);
  assert.equal(out.log.patches.length, 0);
});

it('지금 상태 읽기 — 지마켓 · 11번가 · 스마트스토어는 판매중이면 모름, 판매중지면 0', async () => {
  const esm = esmMall({ items: { 6518691205: { gmkt: ['4829864103', '11'] }, 6276734052: { gmkt: ['4713197366', '21'] } } });
  assert.deepEqual(plain(await esm.api.read({ mallKey: 'gmarket', codes: ['4829864103_6518691205', '4713197366_6276734052', '4999999999_1'] })), {
    success: true,
    products: [
      { code: '4829864103_6518691205', options: [{ optionCode: '4829864103_6518691205', stock: null, rocket: false, state: '판매중' }] },
      { code: '4713197366_6276734052', options: [{ optionCode: '4713197366_6276734052', stock: 0, rocket: false, state: '판매중지' }] },
    ],
    missing: ['4999999999_1'],
  });
  assert.equal(esm.log.puts.length, 0);

  const st11 = st11Mall({ products: { 9568609387: {}, 9223456311: { selStatCd: '105' } } });
  const st11Read = await st11.api.read({ mallKey: '11st', codes: ['9568609387', '9223456311'] });
  assert.deepEqual(plain(st11Read.products.map((product: any) => [product.code, product.options[0].stock])), [['9568609387', null], ['9223456311', 0]]);
  assert.equal(st11.log.saves.length, 0);

  const naver = smartstoreMall({ products: { 5001000001: { channel: '13720932232', status: 'SALE' }, 5001000002: { channel: '13720932405', status: 'SUSPENSION' } } });
  const naverRead = await naver.api.read({ mallKey: 'smartstore', codes: ['13720932232', '13720932405'] });
  assert.deepEqual(plain(naverRead.products.map((product: any) => [product.code, product.options[0].stock])), [['13720932232', null], ['13720932405', 0]]);
  assert.equal(naver.log.patches.length, 0);
});


/** 검토(2026-09-19)에서 찾은 결함 — 고친 뒤 다시 생기지 않게 붙잡는다. */
