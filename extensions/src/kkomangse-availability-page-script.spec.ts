// 옛 `extensions/tests/mall-availability-send.test.mjs`의 kkomangse 절을 옮긴 스펙(KID-256) — 서비스워커 쪽 몰 쓰기 모듈을 가짜 탭에서
// 돌리고, 화면 안 요청은 실제 페이지 파일(`content/page-call/mall-availability.js`)을 몰 모양 가짜 fetch 위에서 돌린다.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';

import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/kkomangse/availability';

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
 * 꼬망세 품절 = 재고 0, 재개 = 재고 999(실측 2026-09-19). 노출/재고/KC 설정 화면의 줄마다 있는 [개별수정]이
 * `_mode=view_direct_change` · pcode · _view · _stock · _stock_control · _kc_yn · _kc_num · _kc_date 를 POST 한다.
 * 지금 값은 같은 화면을 상품코드로 검색해 읽는다. 화면 안 함수를 실제로 돌린다.
 */
const KKOMANGSE = 'https://nstore.edupre.co.kr';

function kkomangseRowHtml(code: any, product: any) {
  const radio = (name: any, value: any, on: any) => `<input type="radio" name="${name}[${code}]" value="${value}"${on ? ' checked' : ''}>`;
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

function kkomangseMall({ products = {}, loggedOut = false, answer = null }: any = {}) {
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([code, product]: any) => [code, {
    view: 'Y', control: 'N', stock: '1', kcYn: 'Y', kcNum: 'CB065R2807-5003', kcDate: '0000-00-00', ...product,
  }]));
  const log: any = { tabs: [], removed: [], searches: [], posts: [] };
  const fetch = async (path: any, init: any = {}) => {
    const url = new URL(path, KKOMANGSE);
    if (url.pathname === '/subAdmin/_product_mass.view.php') {
      assert.equal(url.searchParams.get('mode'), 'search');
      assert.equal(url.searchParams.get('pass_input_type'), 'pcode');
      const code = url.searchParams.get('pass_input_value') as string;
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
  const harness = availabilityHarness({ mallKey: 'kkomangse', sources: [pageSource], page: { fetch, DOMParser: PageDOMParser, location: new URL(`${KKOMANGSE}/subAdmin/_product_mass.view.php`) } });
  const api: any = harness.api;
  return { api, log, state };
}

it('⭐ 꼬망세 품절은 [개별수정]과 같은 요청으로 — 그 줄의 지금 값을 싣고 재고만 0, 다시 읽어 확인한다', async () => {
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
});

it('꼬망세 판매 재개는 재고 0 인 상품만 재고 999 로 되돌린다', async () => {
  const { api, log } = kkomangseMall({ products: { 'A0000-A0000-A0001': { stock: '0' }, 'A0000-A0000-A0002': { stock: '999' } } });
  const result = await api.send({ mallKey: 'kkomangse', codes: ['A0000-A0000-A0001', 'A0000-A0000-A0002'], resume: true });
  assert.deepEqual(log.posts.map((post: any) => [post.find(([key]: any) => key === 'pcode')[1], post.find(([key]: any) => key === '_stock')[1]]), [['A0000-A0000-A0001', '999']]);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
});

it('꼬망세 — 로그인이 풀렸으면 보내지 않고, 몰이 거절하면 실패로 센다', async () => {
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

it('꼬망세 지금 재고 읽기 — 재고 0 이면 품절(0), 아니면 모름', async () => {
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


it('꼬망세 — 노출 · 재고관리 칸을 못 읽으면 빈 값을 보내지 않는다', async () => {
  const { api, log } = kkomangseMall({ products: { 'A1111-B2222-C3333': { view: '', stock: '999' } } });
  const result = await api.send({ mallKey: 'kkomangse', codes: ['A1111-B2222-C3333'] });
  assert.equal(log.posts.length, 0);
  assert.equal(result.failed, 1);
});
