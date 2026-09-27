// 옛 `extensions/tests/mall-availability-send.test.mjs`의 icecream-mall 절을 옮긴 스펙(KID-256) — 서비스워커 쪽 몰 쓰기 모듈을 가짜 탭에서
// 돌리고, 화면 안 요청은 실제 페이지 파일(`content/page-call/mall-availability.js`)을 몰 모양 가짜 fetch 위에서 돌린다.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';

import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/icecream-mall/availability';

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
 * 아이스크림몰(아이스크림 PO) 품절 = 판매상태 품절(20), 판매 재개 = 판매중(10). 상품 정보 관리 목록의 [판매상태 일괄변경]
 * 창(단품 판매상태 일괄 변경)의 [적용]이 보내는 `modifyGoodsSaleState.do` 그대로다(실측 2026-09-19).
 */
const ICECREAM = 'https://po.i-screammall.co.kr';

function icecreamViewHtml() {
  return `<html><head><script>
    var _baseUrl = "https:\/\/po.i-screammall.co.kr\/";
    var _entrNo = "7777";
    var _entrNm = "키드아이템";
  </script></head><body>
    <form id="goodsInfoGridForm">
      <input type="hidden" name="csSignature" value="sig-1">
      <input type="hidden" name="_csrf" value="csrf-1">
      <select name="goodsDtmOption"><option value="reg" selected>등록일</option></select>
      <input type="text" name="goodsStartDtm" value=""><input type="text" name="goodsEndDtm" value="">
      <select name="saleStatCd"><option value="" selected>전체</option><option value="10">판매중</option></select>
      <input type="hidden" name="entrNo" value=""><input type="text" name="entrNm" value="">
      <select name="goodsNoOption"><option value="mt" selected>멀티</option></select>
      <textarea name="goodsNoList"></textarea>
    </form></body></html>`;
}

function icecreamMall({ products = {}, loggedOut = false, saveAnswer = null, lagReads = 0 }: any = {}) {
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([code, product]: any) => [code, { saleStatCd: '10', saleMethCd: '10', ...product }]));
  const log: any = { tabs: [], removed: [], lists: [], saves: [], views: 0 };
  let reads = 0;
  const fetch = async (path: any, init: any = {}) => {
    const url = new URL(path, ICECREAM);
    if (loggedOut) {
      return { url: `${ICECREAM}/login/loginForm.do`, ok: true, status: 200, text: async () => '<html><body><input type="password"></body></html>' };
    }
    if (url.pathname === '/goods/goodsMgmt.goodsMgmtView.do') {
      log.views += 1;
      return { url: url.href, ok: true, status: 200, text: async () => icecreamViewHtml() };
    }
    if (url.pathname === '/goods/goodsMgmt.getGoodsList.do') {
      assert.equal(init.headers.Accept, 'application/json');
      const params = [...(url.searchParams as any).entries()];
      log.lists.push(params);
      const codes = url.searchParams.get('goodsNoList')!.split('\r\n');
      reads += 1;
      const lagging = reads > 1 && reads <= 1 + lagReads;
      const payloads = codes.filter((code) => state.has(code)).map((code) => {
        const product = state.get(code);
        return { goodsNo: code, goodsNm: '상품', saleStatCd: lagging ? product.previous ?? product.saleStatCd : product.saleStatCd, saleMethCd: product.saleMethCd, dispYn: 'Y' };
      });
      return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify({ totalCount: payloads.length, payloads }) };
    }
    if (url.pathname === '/goods/goodsMgmtPopup.modifyGoodsSaleState.do' && init.method === 'POST') {
      assert.deepEqual(plain(init.headers), {
        'Content-Type': 'application/json;charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      });
      const body = JSON.parse(init.body);
      log.saves.push(body);
      if (saveAnswer) return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify(saveAnswer) };
      for (const row of body.goodsSaleStateList) {
        const product = state.get(row.goodsNo);
        product.previous = product.saleStatCd;
        product.saleStatCd = row.itmSaleStatCd;
      }
      return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify({ succeeded: true, message: '저장되었습니다.' }) };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const harness = availabilityHarness({ mallKey: 'icecream-mall', sources: [pageSource], page: { fetch, DOMParser: PageDOMParser, FormData: PageFormData, location: new URL(`${ICECREAM}/main.do`) } });
  const api: any = harness.api;
  return { api, log, state };
}

const { FormData: PageFormData } = new JSDOM('').window;

it('⭐ 아이스크림몰 품절은 판매상태 일괄변경 창 [적용]과 같은 요청으로 — 판매중인 상품만 품절(20)로, 다시 읽어 확인한다', async () => {
  const { api, log, state } = icecreamMall({
    products: { 11411122: {}, 10826095: { saleStatCd: '20' }, 936465: { saleStatCd: '40' } },
  });
  const result = await api.send({ mallKey: 'icecream-mall', codes: ['11411122', '10826095', '936465', '99999999', 'abc'] });
  assert.deepEqual(plain(log.saves), [{
    goodsSaleStateList: [{ goodsNo: '11411122', saleStatCd: '10', itmSaleStatCd: '20', soutCausCd: '12', saleStatChgCausCd: null }],
  }]);
  assert.equal(state.get('11411122').saleStatCd, '20');
  assert.equal(state.get('936465').saleStatCd, '40', '판매종료는 건드리지 않는다');
  assert.equal(result.success, true);
  // 판매종료(40)는 이미 못 산다 — 품절로는 이미 된 것이다.
  assert.equal(result.sent, 3, '보낸 1 + 이미 품절 1 + 판매종료 1');
  assert.equal(result.confirmed, 3);
  assert.equal(result.already, 2);
  assert.equal(result.failed, 2, '없는 상품 1 · 모양이 다른 코드 1');
  // 검색은 화면처럼 기간 무시 · 폼 전체(서명 포함) · 업체번호는 화면 스크립트 값 · 상품번호 멀티(CRLF).
  const first = new URLSearchParams(log.lists[0]);
  assert.equal(first.get('goodsDtmIgnoreOption'), 'check');
  assert.equal(first.get('csSignature'), 'sig-1');
  assert.equal(first.get('entrNo'), '7777');
  assert.equal(first.get('entrNm'), '키드아이템');
  assert.equal(first.get('goodsNoOption'), 'mt');
  assert.equal(first.get('goodsNoList'), '11411122\r\n10826095\r\n936465\r\n99999999');
});

it('아이스크림몰 판매 재개는 품절(20)인 상품만 판매중(10)으로 — 예약상품 품절은 화면도 못 되돌려 알린다', async () => {
  const { api, log } = icecreamMall({
    products: { 1111111: { saleStatCd: '20' }, 2222222: {}, 3333333: { saleStatCd: '20', saleMethCd: '20' } },
  });
  const result = await api.send({ mallKey: 'icecream-mall', codes: ['1111111', '2222222', '3333333'], resume: true });
  assert.deepEqual(plain(log.saves), [{
    goodsSaleStateList: [{ goodsNo: '1111111', saleStatCd: '20', itmSaleStatCd: '10', soutCausCd: '12', saleStatChgCausCd: null }],
  }]);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
  assert.equal(result.failed, 1);
  assert.ok(result.warnings.some((warning: any) => /예약상품/.test(warning)));
});

it('아이스크림몰 — 판매방식이 다른 상품은 나눠 보낸다(목록이 한 번에 못 넘긴다)', async () => {
  const { api, log } = icecreamMall({ products: { 1111111: {}, 2222222: { saleMethCd: '20' }, 3333333: {} } });
  const result = await api.send({ mallKey: 'icecream-mall', codes: ['1111111', '2222222', '3333333'] });
  assert.deepEqual(log.saves.map((body: any) => body.goodsSaleStateList.map((row: any) => row.goodsNo)), [['1111111', '3333333'], ['2222222']]);
  assert.equal(result.confirmed, 3);
});

it('아이스크림몰 — 목록이 늦게 따라와도 다시 읽어 확인하고, 끝내 옛 상태면 확인으로 세지 않는다', async () => {
  const late = icecreamMall({ products: { 1111111: {} }, lagReads: 2 });
  const caught = await late.api.send({ mallKey: 'icecream-mall', codes: ['1111111'] });
  assert.equal(caught.confirmed, 1);

  const stuck = icecreamMall({ products: { 1111111: {} }, lagReads: 50 });
  const stale = await stuck.api.send({ mallKey: 'icecream-mall', codes: ['1111111'] });
  assert.equal(stale.sent, 1);
  assert.equal(stale.confirmed, 0);
  assert.ok(stale.warnings.some((warning: any) => /옛 상태/.test(warning)));
});

it('아이스크림몰 — 몰이 거절하면 실패로 세고 몰이 한 말을 싣는다 · 로그인이 풀렸으면 아무것도 보내지 않는다', async () => {
  const refused = icecreamMall({ products: { 1111111: {} }, saveAnswer: { succeeded: false, message: '변경할 수 없는 상품입니다.' } });
  const answer = await refused.api.send({ mallKey: 'icecream-mall', codes: ['1111111'] });
  assert.equal(answer.sent, 0);
  assert.equal(answer.failed, 1);
  assert.ok(answer.warnings.some((warning: any) => /변경할 수 없는 상품입니다/.test(warning)));

  const loggedOut = icecreamMall({ products: { 1111111: {} }, loggedOut: true });
  const halted = await loggedOut.api.send({ mallKey: 'icecream-mall', codes: ['1111111'] });
  assert.equal(halted.success, false);
  assert.match(halted.error, /아이스크림몰 로그인이 풀렸습니다/);
  assert.equal(loggedOut.log.saves.length, 0);
});

it('아이스크림몰 지금 상태 읽기 — 판매중이면 모름, 품절 · 판매종료면 살 수 없어 0', async () => {
  const { api, log } = icecreamMall({ products: { 1111111: {}, 2222222: { saleStatCd: '20' }, 3333333: { saleStatCd: '40' } } });
  assert.deepEqual(plain(await api.read({ mallKey: 'icecream-mall', codes: ['1111111', '2222222', '3333333', '4444444'] })), {
    success: true,
    products: [
      { code: '1111111', options: [{ optionCode: '1111111', stock: null, rocket: false }] },
      { code: '2222222', options: [{ optionCode: '2222222', stock: 0, rocket: false, state: '품절' }] },
      { code: '3333333', options: [{ optionCode: '3333333', stock: 0, rocket: false, state: '판매종료' }] },
    ],
    missing: ['4444444'],
  });
  assert.equal(log.saves.length, 0, '읽기만 한다');
});

