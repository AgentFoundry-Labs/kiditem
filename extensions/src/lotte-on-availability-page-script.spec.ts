// 옛 `extensions/tests/mall-availability-send.test.mjs`의 lotte-on 절을 옮긴 스펙(KID-256) — 서비스워커 쪽 몰 쓰기 모듈을 가짜 탭에서
// 돌리고, 화면 안 요청은 실제 페이지 파일(`content/page-call/mall-availability.js`)을 몰 모양 가짜 fetch 위에서 돌린다.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';
import mainSource from '../kiditem-os/content/page-call/mall-availability-main.js?raw';
import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/lotte-on/availability';

const { DOMParser: PageDOMParser } = new JSDOM('').window;
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
 * 롯데ON 품절 = 상품 판매상태 품절(SOUT), 재개 = 판매중(SALE)(실측 2026-09-19). 상품 조회/수정의 [상품판매 변경] →
 * 상품정보일괄수정 → 일괄수정항목 팝업 [저장]이 soapi `updateProductBatch` 에 상품마다
 * {spdNo, trNo, lrtrNo, trGrpCd, dvPdTypCd, code:"07", ctrtTypCd/dvProcTypCd/dmstOvsDvDvsCd:"all", reqTxt:"spdSlStatCd", spdSlStatCd}
 * 를 보낸다. 요청 머리는 화면 함수 `gcm._sbm_setRequestHeader` 가 붙인다 — 화면 안(MAIN)에서만 돈다.
 */
function lotteonMall({ products = {}, loggedOut = false, updateAnswer = null, lagReads = 0, staleBefore = {} }: any = {}) {
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([no, product]: any) => [no, {
    spdNo: no, slStatCd: 'SALE', trNo: 'LO10014931', lrtrNo: null, trGrpCd: 'SR', dvPdTypCd: 'GNRL', ctrtTypCd: 'A', ...product,
  }]));
  // 상품 조회가 바뀐 상태를 늦게 보여 준다(실측): 저장 뒤 `lagReads` 번은 옛 상태를 준다. `staleBefore` 는 보내기 전부터
  // 옛 값을 주는 상품(방금 다른 요청으로 바뀐 상품) — {번호: {old, reads}}.
  const lag = new Map<string, any>(Object.entries(staleBefore as Record<string, any>).map(([no, entry]: any) => [no, { ...entry }]));
  const log: any = { tabs: [], removed: [], lists: [], updates: [], worlds: [], headers: [] };
  class FakeXhr {
    [key: string]: any;
    constructor() { this.headers = {}; }
    open(method: any, url: any) { this.method = method; this.url = url; }
    setRequestHeader(name: any, value: any) { this.headers[name] = value; }
    send(body: any) {
      assert.equal(this.method, 'POST');
      log.headers.push({ ...this.headers });
      const parsed = JSON.parse(body);
      const path = new URL(this.url).pathname;
      let json;
      if (path === '/soapi/v1/product/information/selectProductList') {
        const nos = parsed.spdNo.split('\n');
        log.lists.push(nos);
        const data = nos.filter((no: any) => state.has(no)).map((no: any) => {
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
  const harness = availabilityHarness({ mallKey: 'lotte-on', sources: [pageSource, mainSource], page: {
    XMLHttpRequest: FakeXhr,
    sessionStorage: { getItem: (key: any) => (key === 'AuthToken' && !loggedOut ? 'page-token' : null) },
    location: { href: loggedOut ? 'https://store.lotteon.com/cm/main/login_SO.wsp' : 'https://store.lotteon.com/cm/main/index_SO.wsp' },
    gcm: {
      _sbm_setRequestHeader: (xhr: any) => {
        xhr.setRequestHeader('Authorization', 'Bearer page-token');
        xhr.setRequestHeader('X-Timezone', 'GMT+09:00');
      },
    },
  } });
  const api: any = harness.api;
  log.calls = harness.calls;
  return { api, log, state };
}

it('⭐ 롯데ON 품절은 일괄수정 팝업 [저장]과 같은 요청으로 — 판매중인 상품만 품절(SOUT)로, 다시 읽어 확인한다', async () => {
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
  // 판매중지(STP)는 이미 못 산다 — 품절로는 이미 된 것이다. 이미 품절(SOUT)로 보인 것은 옛 값인지 다시 읽어 본다.
  assert.equal(result.sent, 3, '보낸 1 + 이미 품절 1 + 이미 판매중지 1');
  assert.equal(result.confirmed, 3);
  assert.equal(result.already, 2);
  assert.equal(result.failed, 2, '없는 상품 1 + 모양이 틀린 번호 1');
  // 조회 → (이미 품절 다시 조회) → 저장 → 다시 조회. 전부 화면 안(MAIN) 처리기에서, 화면 함수가 붙인 머리로.
  assert.ok(log.calls.length >= 3 && log.calls.every((call: any) => call.name === 'lotteonPostOnPage'));
  assert.ok(log.headers.every((headers: any) => headers.Authorization === 'Bearer page-token' && headers['Content-Type'].startsWith('application/json')));
  assert.ok(!JSON.stringify(result).includes('page-token'), '결과에 토큰이 없다');
});

it('롯데ON 판매 재개는 품절(SOUT)인 상품만 판매중(SALE)으로 되돌린다', async () => {
  const { api, log } = lotteonMall({ products: { LO11110000: { slStatCd: 'SOUT' }, LO22220000: {} } });
  const resumed = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000', 'LO22220000'], resume: true });
  assert.deepEqual(log.updates.map((params: any) => params.map((param: any) => [param.spdNo, param.spdSlStatCd])), [[['LO11110000', 'SALE']]]);
  assert.equal(resumed.confirmed, 2);
  assert.equal(resumed.already, 1);
});

it('⭐ 롯데ON 상품 조회가 늦게 따라와도 바뀐 상태가 보일 때까지 다시 읽어 확인한다', async () => {
  const { api, log } = lotteonMall({ products: { LO11110000: {} }, lagReads: 3 });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000'] });
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 1);
  assert.deepEqual(plain(result.warnings), []);
  // 처음 조회 1 + 저장 뒤 옛 상태 3번 + 새 상태 1번.
  assert.equal(log.lists.length, 5);
});

it('롯데ON — 끝내 옛 상태면 확인하지 못한 것으로 두고 알린다', async () => {
  const { api } = lotteonMall({ products: { LO11110000: {} }, lagReads: 50 });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000'] });
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 0);
  assert.ok(result.warnings.some((warning: any) => /아직 옛 상태/.test(warning)));
});

it('롯데ON — 저장이 일부만 됐다고 답하면 그만큼 실패로 세고, 확인은 다시 읽은 것만', async () => {
  const { api } = lotteonMall({
    products: { LO11110000: {}, LO22220000: {} },
    updateAnswer: { returnCode: 'SUCCESS', data: [JSON.stringify({ successCnt: 1, failCnt: 1, productLst: [] })] },
  });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000', 'LO22220000'] });
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.confirmed, 0, '가짜 몰은 상태를 바꾸지 않았다 — 다시 읽어 바뀐 것만 확인');
  assert.ok(result.warnings.some((warning: any) => /2건 중 1건을 바꾸지 않았다/.test(warning)));
});

it('롯데ON — 로그인이 풀렸으면 아무것도 보내지 않는다', async () => {
  const { api, log } = lotteonMall({ products: { LO11110000: {} }, loggedOut: true });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000'] });
  assert.equal(result.success, false);
  assert.match(result.error, /롯데ON 로그인이 풀렸습니다/);
  assert.equal(log.updates.length, 0);
});

it('롯데ON 지금 상태 읽기 — 판매중이면 모름, 품절 · 판매중지면 살 수 없어 0', async () => {
  const { api, log } = lotteonMall({ products: { LO11110000: { slStatCd: 'SOUT' }, LO22220000: {}, LO33330000: { slStatCd: 'STP' } } });
  assert.deepEqual(plain(await api.read({ mallKey: 'lotte-on', codes: ['LO11110000', 'LO22220000', 'LO33330000', 'LO44440000'] })), {
    success: true,
    products: [
      { code: 'LO11110000', options: [{ optionCode: 'LO11110000', stock: 0, rocket: false, state: '품절' }] },
      { code: 'LO22220000', options: [{ optionCode: 'LO22220000', stock: null, rocket: false }] },
      { code: 'LO33330000', options: [{ optionCode: 'LO33330000', stock: 0, rocket: false, state: '판매중지' }] },
    ],
    missing: ['LO44440000'],
  });
  assert.equal(log.updates.length, 0, '읽기만 한다');
  assert.deepEqual(log.lists, [['LO11110000', 'LO22220000', 'LO33330000', 'LO44440000']]);
});

it('롯데ON — 몰이 성공 수만 말하고 실패 수를 빼먹어도 나머지를 실패로 센다', async () => {
  const { api } = lotteonMall({
    products: { LO11110000: {}, LO22220000: {} },
    updateAnswer: { returnCode: 'SUCCESS', data: [JSON.stringify({ successCnt: 1 })] },
  });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000', 'LO22220000'] });
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.ok(result.confirmed <= result.sent, '받았다고 한 수를 넘겨 확인으로 세지 않는다');
});

it('롯데ON — 방금 품절한 상품이 옛 SALE 로 보여도 잠시 뒤 다시 읽어 판매 재개를 보낸다', async () => {
  const { api, log } = lotteonMall({
    products: { LO11110000: { slStatCd: 'SOUT' } },
    staleBefore: { LO11110000: { old: 'SALE', reads: 2 } },
  });
  const result = await api.send({ mallKey: 'lotte-on', codes: ['LO11110000'], resume: true });
  assert.equal(log.updates.length, 1, '이미 판매중으로 건너뛰지 않고 보낸다');
  assert.equal(log.updates[0][0].spdSlStatCd, 'SALE');
  assert.equal(result.already, 0);
  assert.equal(result.confirmed, 1);
});

