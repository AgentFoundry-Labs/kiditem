// 옛 `extensions/tests/mall-availability-send.test.mjs`의 kidkids 절을 옮긴 스펙(KID-256) — 서비스워커 쪽 몰 쓰기 모듈을 가짜 탭에서
// 돌리고, 화면 안 요청은 실제 페이지 파일(`content/page-call/mall-availability.js`)을 몰 모양 가짜 fetch 위에서 돌린다.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';

import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/kidkids/availability';

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
 * 키드키즈 일시품절 = [일시품절](changeUseFlag('N')), 해제 = [품절해제]('Y'). 상품코드로 검색한 목록 폼을 화면처럼 EUC-KR 로
 * 숨은 창에 제출한다(실측 2026-09-19 — 예전 코드는 commitType 을 틀리게 보냈고 목록 1쪽만 봤다).
 */
const KIDKIDS = 'https://partner.kidkids.net';
const EUC_KR = (() => {
  const decoder = new TextDecoder('euc-kr');
  const map: any = new Map();
  for (let lead = 0xa1; lead <= 0xfe; lead += 1) {
    for (let trail = 0xa1; trail <= 0xfe; trail += 1) {
      const char = decoder.decode(Uint8Array.of(lead, trail));
      if (char.length === 1 && !map.has(char)) map.set(char, [lead, trail]);
    }
  }
  return (text: any) => {
    const bytes: any = [];
    for (const char of text) {
      const code = char.codePointAt(0);
      if (code < 0x80) bytes.push(code);
      else bytes.push(...(map.get(char) ?? [0x3f]));
    }
    return Uint8Array.from(bytes).buffer;
  };
})();

function kidkidsListHtml(code: any, product: any) {
  if (!product) return '<html><body><form name="frmGoodsList"><table><tr><th></th><th>코드</th><th>△품절상품▽</th></tr></table></form></body></html>';
  return `<html><body><form name="frmGoodsList" method="post">
    <table>
      <tr><th></th><th>수정</th><th>코드</th><th>상품명(20글자)</th><th>송장용 상품명</th><th>△판매상태▽</th><th>△품절상품▽</th><th>TAX</th></tr>
      <tr>
        <td><input type="checkbox" name="goods_code[]" value="${code}" tax_type="${product.tax ?? 'A'}"></td>
        <td>수정</td><td>${code}</td>
        <td><input type="text" name="goods_name_${code}" value="[키드아이템] 할로윈 볼젤리"></td>
        <td><input type="text" name="dev_name_${code}" value="500할로윈호박모양볼젤리"></td>
        <td>노출중</td><td>${product.flag === 'N' ? '품절' : '판매'}</td><td>과세</td>
      </tr>
    </table>
    <input type="hidden" name="re_stocked_date" value="">
    <input type="hidden" name="commitType" value="">
    <input type="hidden" name="use_flag" value="">
  </form></body></html>`;
}

function kidkidsMall({ products = {}, loggedOut = false, logoutAfterSubmits = null }: any = {}) {
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([code, product]: any) => [code, { flag: 'Y', ...product }]));
  const log: any = { tabs: [], removed: [], lists: [], submits: [] };
  const fetch = async (path: any) => {
    const url = new URL(path, KIDKIDS);
    if (loggedOut || (logoutAfterSubmits !== null && log.submits.length >= logoutAfterSubmits)) return { url: `${KIDKIDS}/login.htm`, ok: true, status: 200, arrayBuffer: async () => EUC_KR('<input type="password">') };
    assert.equal(url.pathname, '/sales/goods_list_renewal.htm');
    assert.equal(url.searchParams.get('s_option'), 'goods_code');
    const code = url.searchParams.get('s_key') as string;
    log.lists.push(code);
    return { url: url.href, ok: true, status: 200, arrayBuffer: async () => EUC_KR(kidkidsListHtml(code, state.get(code))) };
  };
  // 화면 문서: 폼과 숨은 창을 만들어 제출하면 답 화면을 창에 싣고 load 를 쏜다.
  const body: any = { children: [], appendChild(element: any) { this.children.push(element); } };
  const document: any = {
    body,
    createElement(tag: any) {
      const element: any = {
        tagName: tag.toUpperCase(), style: {}, attrs: {}, children: [], listeners: {},
        setAttribute(name: any, value: any) { this.attrs[name] = value; },
        appendChild(child: any) { this.children.push(child); },
        addEventListener(type: any, listener: any) { (this.listeners[type] ||= []).push(listener); },
        removeEventListener(type: any, listener: any) { this.listeners[type] = (this.listeners[type] || []).filter((entry: any) => entry !== listener); },
        remove() { body.children = body.children.filter((entry: any) => entry !== this); },
      };
      if (tag === 'form') {
        element.submit = () => {
          const pairs = element.children.map((input: any) => [input.name, input.value]);
          log.submits.push({ action: element.action, method: element.method, charset: element.acceptCharset, pairs });
          const frame = body.children.find((entry: any) => entry.tagName === 'IFRAME' && entry.name === element.target);
          assert.ok(frame, '숨은 창으로 제출한다');
          assert.equal(frame.attrs.sandbox, 'allow-same-origin', '답 화면의 스크립트는 돌지 않는다');
          const form = new URLSearchParams(pairs);
          const code = form.get('goods_code[]');
          if (form.get('commitType') === 'change_use_flag' && state.has(code)) state.get(code).flag = form.get('use_flag');
          setTimeout(() => {
            frame.contentWindow = { location: { href: `${KIDKIDS}/sales/proc_logis.htm`, pathname: '/sales/proc_logis.htm' } };
            frame.contentDocument = { documentElement: { outerHTML: "<script>parent.hideHiddenFrameLoading();alert('처리되었습니다.');</script>" } };
            for (const listener of frame.listeners.load || []) listener();
          }, 0);
        };
      }
      return element;
    },
  };
  const harness = availabilityHarness({ mallKey: 'kidkids', sources: [pageSource], page: { fetch, DOMParser: PageDOMParser, FormData: PageFormData, TextDecoder, document, location: new URL(`${KIDKIDS}/sales/goods_list_renewal.htm?pNum=1`) } });
  const api: any = harness.api;
  return { api, log, state, body };
}

it('⭐ 키드키즈 품절은 상품코드로 검색한 목록 폼을 [일시품절]처럼 EUC-KR 로 숨은 창에 보내고, 다시 검색해 확인한다', async () => {
  const { api, log, state, body } = kidkidsMall({ products: { 1090904: {}, 949784: { flag: 'N' }, 1000057: { tax: '' } } });
  const result = await api.send({ mallKey: 'kidkids', codes: ['1090904', '949784', '1000057', '1234567', 'x'] });
  assert.equal(log.submits.length, 1);
  const [submit] = log.submits;
  assert.equal(submit.action, '/sales/proc_logis.htm');
  assert.equal(submit.method, 'post');
  assert.equal(submit.charset, 'euc-kr');
  assert.deepEqual(plain(submit.pairs), [
    ['goods_code[]', '1090904'],
    ['goods_name_1090904', '[키드아이템] 할로윈 볼젤리'],
    ['dev_name_1090904', '500할로윈호박모양볼젤리'],
    ['re_stocked_date', ''],
    ['commitType', 'change_use_flag'],
    ['use_flag', 'N'],
  ]);
  assert.equal(state.get('1090904').flag, 'N');
  assert.equal(result.success, true);
  assert.equal(result.sent, 2, '보낸 1 + 이미 품절 1');
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
  assert.equal(result.failed, 3, '세금 구분 미등록 1 · 없는 상품 1 · 모양이 다른 코드 1');
  assert.ok(result.warnings.some((warning: any) => /세금 구분/.test(warning)));
  assert.equal(body.children.length, 0, '만든 폼과 창은 치운다');
});

it('키드키즈 판매 재개는 품절인 상품만 [품절해제](Y)로 · 로그인이 풀렸으면 보내지 않는다 · 지금 상태 읽기', async () => {
  const { api, log } = kidkidsMall({ products: { 1: { flag: 'N' }, 2: {} } });
  const result = await api.send({ mallKey: 'kidkids', codes: ['0001', '0002'].map((code) => code.replace(/^0+/, '')).map((code) => code.padStart(3, '1')), resume: true });
  assert.equal(result.success, true);

  const resumeMall = kidkidsMall({ products: { 1090904: { flag: 'N' }, 949784: {} } });
  const resumed = await resumeMall.api.send({ mallKey: 'kidkids', codes: ['1090904', '949784'], resume: true });
  assert.deepEqual(resumeMall.log.submits.map((submit: any) => new URLSearchParams(submit.pairs).get('use_flag')), ['Y']);
  assert.equal(resumed.confirmed, 2);
  assert.equal(resumed.already, 1);

  const out = kidkidsMall({ products: { 1090904: {} }, loggedOut: true });
  const halted = await out.api.send({ mallKey: 'kidkids', codes: ['1090904'] });
  assert.equal(halted.success, false);
  assert.match(halted.error, /키드키즈 로그인이 풀렸습니다/);
  assert.equal(out.log.submits.length, 0);

  const reader = kidkidsMall({ products: { 1090904: {}, 949784: { flag: 'N' } } });
  assert.deepEqual(plain(await reader.api.read({ mallKey: 'kidkids', codes: ['1090904', '949784', '1234567'] })), {
    success: true,
    products: [
      { code: '1090904', options: [{ optionCode: '1090904', stock: null, rocket: false }] },
      { code: '949784', options: [{ optionCode: '949784', stock: 0, rocket: false, state: '품절' }] },
    ],
    missing: ['1234567'],
  });
  assert.equal(reader.log.submits.length, 0, '읽기만 한다');
  assert.ok(log.lists.length >= 0);
});

it('⭐ 도중에 로그인이 풀려도 이미 몰에 보낸 건수는 버리지 않는다(stopped)', async () => {
  // 키드키즈: 첫 상품을 보낸 뒤 로그인이 풀린다 — 첫 상품은 몰에 갔다.
  const { api, log } = kidkidsMall({ products: { 1090904: {}, 949784: {} }, logoutAfterSubmits: 1 });
  const result = await api.send({ mallKey: 'kidkids', codes: ['1090904', '949784'] });
  assert.equal(log.submits.length, 1);
  assert.equal(result.success, true, '하나라도 보냈으면 실패로 뭉개지 않는다');
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1, '못 보낸 1건');
  assert.equal(result.stopped, 'halted', '웹은 남은 묶음을 보내지 않는다');
  assert.ok(result.warnings.some((warning: any) => /로그인이 풀렸습니다/.test(warning)));

  // 하나도 못 보냈으면 그대로 실패다.
  const none = kidkidsMall({ products: { 1090904: {} }, logoutAfterSubmits: 0 });
  const failed = await none.api.send({ mallKey: 'kidkids', codes: ['1090904'] });
  assert.equal(failed.success, false);
});
