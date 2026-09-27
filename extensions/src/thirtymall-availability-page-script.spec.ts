// 옛 `extensions/tests/mall-availability-send.test.mjs`의 thirtymall 절을 옮긴 스펙(KID-256) — 서비스워커 쪽 몰 쓰기 모듈을 가짜 탭에서
// 돌리고, 화면 안 요청은 실제 페이지 파일(`content/page-call/mall-availability.js`)을 몰 모양 가짜 fetch 위에서 돌린다.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';

import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/thirtymall/availability';

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
 * 떠리몰(샵바이 파트너 어드민) 품절 = 판매설정 판매중지(STOP_SELLING), 판매 재개 = 판매가능(AVAILABLE_FOR_SALE). 상품정보
 * 조회/수정 목록의 판매설정 칸이 부르는 PUT admin-api `/products/sale-status` 그대로다(화면 번들 확인 2026-09-19). 판매금지는
 * 되돌릴 수 없어 보내지도 풀지도 않는다.
 */
const SHOPBY_PARTNER = 'https://partner.shopby.co.kr';
const SHOPBY_API = 'https://admin-api.e-ncp.com';

function shopbyMall({ products = {}, loggedOut = false, failures = null, lagReads = 0, status = 200 }: any = {}) {
  // products: 상품번호 → { setting, sale?, apply?, soldOut? }
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([no, product]: any) => [no, {
    saleSettingStatusType: product.setting,
    saleStatusType: product.sale ?? 'ON_SALE',
    applyStatusType: product.apply ?? 'FINISHED',
    isSoldOut: product.soldOut === true,
    previous: null,
  }]));
  const log: any = { tabs: [], removed: [], searches: [], puts: [], headers: [] };
  let putDone = false;
  let reads = 0;
  const fetch = async (url: any, init: any = {}) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, SHOPBY_API);
    log.headers.push(init.headers);
    const body = JSON.parse(init.body);
    if (status !== 200) return { ok: false, status, json: async () => ({ code: 'A0003', message: '권한이 없습니다.' }) };
    if (parsed.pathname === '/products/search-by-key' && init.method === 'POST') {
      log.searches.push(body);
      if (putDone) reads += 1;
      const lagging = putDone && reads <= lagReads;
      const out = body.mallProductNos.filter((no: any) => state.has(no)).map((no: any) => {
        const item = state.get(no);
        const shown = lagging && item.previous ? item.previous : item;
        return {
          mallProductNo: Number(no), mallNo: 78859, productName: `상품 ${no}`,
          saleStatusType: shown.saleStatusType, saleSettingStatusType: shown.saleSettingStatusType,
          applyStatusType: shown.applyStatusType, isSoldOut: shown.isSoldOut,
        };
      });
      return { ok: true, status: 200, json: async () => out };
    }
    if (parsed.pathname === '/products/sale-status' && init.method === 'PUT') {
      log.puts.push(body);
      if (failures) return { ok: true, status: 200, json: async () => ({ failures }) };
      for (const no of body.productNos) {
        const item = state.get(String(no));
        item.previous = { ...item };
        item.saleSettingStatusType = body.saleSettingStatusType;
      }
      putDone = true;
      return { ok: true, status: 200, json: async () => ({ failures: [] }) };
    }
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  const harness = availabilityHarness({ mallKey: 'thirtymall', sources: [pageSource], page: {
    fetch,
    location: new URL(`${SHOPBY_PARTNER}/product/list`),
    document: { cookie: loggedOut ? 'a=1' : 'a=1; SHOPBY_PARTNER_SESSAT=tok-shopby-1; SHOPBY_PARTNER_SESSRT=rt-1' },
  } });
  const api: any = harness.api;
  return { api, log, state };
}

it('⭐ 떠리몰 품절은 판매설정 판매중지로 — 살 수 있는 상품만, 화면처럼 토큰 · ClientLocation 머리를 싣고 다시 읽어 확인한다', async () => {
  const { api, log, state } = shopbyMall({ products: {
    131987854: { setting: 'AVAILABLE_FOR_SALE' },
    132154733: { setting: 'STOP_SELLING' },
    132154700: { setting: 'PROHIBITION_SALE', soldOut: true },
    132154701: { setting: 'AVAILABLE_FOR_SALE', soldOut: true },
    132154702: { setting: 'AVAILABLE_FOR_SALE', sale: 'END_SALE' },
  } });
  const result = await api.send({ mallKey: 'thirtymall', codes: ['131987854', '132154733', '132154700', '132154701', '132154702', '999999999', 'LO123'] });
  assert.deepEqual(plain(log.puts), [{ productNos: [131987854], saleSettingStatusType: 'STOP_SELLING' }]);
  assert.equal(state.get('131987854').saleSettingStatusType, 'STOP_SELLING');
  assert.deepEqual(log.searches[0], { mallNos: [78859], mallProductNos: ['131987854', '132154733', '132154700', '132154701', '132154702', '999999999'] });
  for (const headers of log.headers) {
    assert.equal(headers.accessToken, 'tok-shopby-1');
    assert.equal(headers.Version, '1.0');
    assert.equal(headers.ClientLocation, 'https://partner-remote.shopby.co.kr/product/management/list');
  }
  assert.equal(result.success, true);
  // 판매중지 · 판매금지 · 재고 품절 · 판매종료는 이미 못 산다 — 품절로는 이미 된 것이다.
  assert.equal(result.already, 4);
  assert.equal(result.sent, 5);
  assert.equal(result.confirmed, 5);
  assert.equal(result.failed, 2, '없는 상품 1 · 모양이 다른 코드 1');
  assert.ok(!JSON.stringify(result).includes('tok-shopby-1'), '결과에 토큰이 없다');
});

it('⭐ 떠리몰 판매 재개는 판매중지만 판매가능으로 — 판매금지는 풀지 않고, 재고 0 품절은 재개로 안 풀린다고 말한다', async () => {
  const { api, log } = shopbyMall({ products: {
    132154733: { setting: 'STOP_SELLING' },
    132154734: { setting: 'STOP_SELLING', soldOut: true },
    132154700: { setting: 'PROHIBITION_SALE' },
    132154701: { setting: 'AVAILABLE_FOR_SALE', soldOut: true },
    131987854: { setting: 'AVAILABLE_FOR_SALE' },
  } });
  const result = await api.send({ mallKey: 'thirtymall', codes: ['132154733', '132154734', '132154700', '132154701', '131987854'], resume: true });
  assert.deepEqual(plain(log.puts), [{ productNos: [132154733, 132154734], saleSettingStatusType: 'AVAILABLE_FOR_SALE' }]);
  // ⚠️ 판매금지(PROHIBITION_SALE)는 어떤 경우에도 보내지 않는다.
  assert.ok(log.puts.every((body: any) => ['STOP_SELLING', 'AVAILABLE_FOR_SALE'].includes(body.saleSettingStatusType)));
  assert.equal(result.already, 1);
  assert.equal(result.confirmed, 3);
  assert.equal(result.failed, 2, '판매금지 1 · 재고 0 품절 1');
  assert.ok(result.warnings.some((warning: any) => /판매금지한 상품이라 풀지 않았습니다/.test(warning)));
  assert.ok(result.warnings.some((warning: any) => /재고가 없어 품절입니다/.test(warning)));
  assert.ok(result.warnings.some((warning: any) => /1건은 재고가 없어 판매 재개 뒤에도 떠리몰에 품절로 보입니다/.test(warning)));
});

it('떠리몰 — 몰이 거절한 상품은 실패로, 목록이 늦게 따라와도 다시 읽어 확인하고, 로그인 · 권한이 없으면 보내지 않는다', async () => {
  const refused = shopbyMall({
    products: { 131987854: { setting: 'AVAILABLE_FOR_SALE' }, 131987855: { setting: 'AVAILABLE_FOR_SALE' } },
    failures: [{ productNo: 131987855, message: '판매 중지할 수 없는 상품입니다.' }],
  });
  const partial = await refused.api.send({ mallKey: 'thirtymall', codes: ['131987854', '131987855'] });
  assert.equal(partial.failed, 1);
  assert.ok(partial.warnings.some((warning: any) => /2건 중 1건을 바꾸지 않았습니다 — 판매 중지할 수 없는 상품입니다/.test(warning)));

  const lagging = shopbyMall({ products: { 131987854: { setting: 'AVAILABLE_FOR_SALE' } }, lagReads: 2 });
  const late = await lagging.api.send({ mallKey: 'thirtymall', codes: ['131987854'] });
  assert.equal(late.confirmed, 1);
  assert.equal(late.warnings.length, 0);

  const loggedOut = shopbyMall({ products: { 131987854: { setting: 'AVAILABLE_FOR_SALE' } }, loggedOut: true });
  const nothing = await loggedOut.api.send({ mallKey: 'thirtymall', codes: ['131987854'] });
  assert.equal(nothing.success, false);
  assert.match(nothing.error, /떠리몰 파트너 어드민 로그인이 풀렸습니다/);
  assert.equal(loggedOut.log.puts.length, 0);
  assert.equal(loggedOut.log.searches.length, 0);

  const forbidden = shopbyMall({ products: { 131987854: { setting: 'AVAILABLE_FOR_SALE' } }, status: 403 });
  const denied = await forbidden.api.send({ mallKey: 'thirtymall', codes: ['131987854'] });
  assert.equal(denied.success, false);
  assert.match(denied.error, /떠리몰 상품을 읽지 못했습니다\(권한이 없습니다\.\)/);
  assert.equal(forbidden.log.puts.length, 0);
});

it('떠리몰 지금 상태 — 살 수 있으면 재고 모름, 아니면 몰의 말(판매중지 · 판매금지 · 품절 · 승인거부)로 읽는다', async () => {
  const { api, log } = shopbyMall({ products: {
    131987854: { setting: 'AVAILABLE_FOR_SALE' },
    132154733: { setting: 'STOP_SELLING', soldOut: true },
    132154700: { setting: 'PROHIBITION_SALE' },
    132154701: { setting: 'AVAILABLE_FOR_SALE', soldOut: true },
    132154702: { setting: 'AVAILABLE_FOR_SALE', sale: 'PRE_APPROVAL_STATUS', apply: 'APPROVAL_REJECTION' },
  } });
  const result = await api.read({ mallKey: 'thirtymall', codes: ['131987854', '132154733', '132154700', '132154701', '132154702', '999999999'] });
  assert.equal(result.success, true);
  const byCode = Object.fromEntries(result.products.map((product: any) => [product.code, product.options[0]]));
  assert.deepEqual(plain(byCode['131987854']), { optionCode: '131987854', stock: null, rocket: false, state: '판매중' });
  assert.equal(byCode['132154733'].state, '판매중지');
  assert.equal(byCode['132154700'].state, '판매금지');
  assert.equal(byCode['132154701'].state, '품절');
  assert.equal(byCode['132154702'].state, '승인거부');
  assert.deepEqual(plain(result.missing), ['999999999']);
  assert.equal(log.puts.length, 0, '읽기만 한다');
});
