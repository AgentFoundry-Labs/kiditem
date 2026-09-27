// 옛 `extensions/tests/mall-availability-send.test.mjs`의 kidsnote 절을 옮긴 스펙(KID-256) — 서비스워커 쪽 몰 쓰기 모듈을 가짜 탭에서
// 돌리고, 화면 안 요청은 실제 페이지 파일(`content/page-call/mall-availability.js`)을 몰 모양 가짜 fetch 위에서 돌린다.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';

import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/kidsnote/availability';

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
 * 키즈노트(WISA 스마트윙) 품절 = 상태 품절(3), 판매 재개 = 정상(2). 판매 상품 내역(body=2010)의 [상태/노출일괄수정]
 * 폼(edt_layer_4)을 "선택한 상품의" 로 [확인]한 요청 그대로다(실측 2026-09-19). 상품번호 검색이 없어 목록을 100개씩 넘긴다.
 */
const KIDSNOTE = 'https://shop.kidsnote.com';

function kidsnoteListHtml(rows: any, allPnos: any) {
  const body = rows.map(([pno, stat, price = 1950]: any) => `<tr>
      <td><input type="checkbox" name="check_pno[]" id="check_pno" value="${pno}"><input type="hidden" name="pno[]" value="${pno}"></td>
      <td>1</td><td><img></td><td><span>2128-${pno}</span><a href="./?body=product@product_register&pno=${pno}">상품</a></td>
      <td>26/09/16</td><td>${price.toLocaleString('ko-KR')} 원</td><td>3,000 원</td><td>0 원</td><td>${stat}</td><td>회</td>
    </tr>`).join('');
  return `<html><body>
    <form name="prdFrm" id="prdFrm" method="post" action="/_manage/index.php">
      <input type="hidden" name="body" value="product@product_list.exe"><input type="hidden" name="exec" value="">
      <table><thead><tr><th><input type="checkbox"></th><th>번호</th><th>이미지</th><th>상품명</th><th>등록일</th><th>판매가</th>
        <th>소비자가</th><th>적립금</th><th>상태</th><th>판매설정</th></tr></thead><tbody>${body}</tbody></table>
    </form>
    <form id="edt_layer_4" method="post" action="./" target="hidden1" onsubmit="return edtConfirm(this)">
      <input type="hidden" name="body" value="product@product_price.exe">
      <input type="hidden" name="w" value=" and p.partner_no='367' and p.stat!=5">
      <input type="hidden" name="prd_no" value="${allPnos.join(',')}">
      <input type="hidden" name="nums" value="">
      <input type="hidden" name="exec" value="stat">
      <select name="where"><option value="1">선택한 상품의</option><option value="2">현재 검색된 모든 상품</option></select>
      <label><input type="radio" name="change_stat" value="" checked> 변화없음</label>
      <label><input type="radio" name="change_stat" value="2"> 정상</label>
      <label><input type="radio" name="change_stat" value="3"> 품절</label>
      <label><input type="radio" name="change_stat" value="4"> 숨김</label>
      <label><input type="radio" name="perm_lst" value="" checked> 변화없음</label><label><input type="radio" name="perm_lst" value="Y"> 노출</label>
      <label><input type="radio" name="perm_dtl" value="" checked> 변화없음</label><label><input type="radio" name="perm_dtl" value="Y"> 노출</label>
      <label><input type="radio" name="perm_sch" value="" checked> 변화없음</label><label><input type="radio" name="perm_sch" value="Y"> 노출</label>
      <input type="submit" value="확인">
    </form>
    <form id="edt_layer_2" method="post" action="./" target="hidden1" onsubmit="return edtConfirm(this)">
      <input type="hidden" name="body" value="product@product_price.exe">
      <input type="hidden" name="w" value=" and p.partner_no='367' and p.stat!=5">
      <input type="hidden" name="prd_no" value="${allPnos.join(',')}">
      <input type="hidden" name="nums" value="">
      <input type="hidden" name="exec" value="sell_prc">
      <input type="hidden" name="ori_no" value="">
      <textarea name="partner_cmt"></textarea>
      <label><input type="radio" name="prc_chg_type" value="1" checked> 할인 적용</label>
      <label><input type="radio" name="prc_chg_type" value="2"> 균일가 적용</label>
      <select name="where"><option value="1">선택한 상품</option><option value="2">현재 검색된 모든 상품</option></select>
      <select name="o1"><option value="normal_prc">소비자가</option><option value="sell_prc">판매가</option></select>
      <input type="text" name="p1" value="">
      <select name="p2"><option value="1">%</option><option value="2">원</option></select>
      <select name="p3"><option value="-">할인</option><option value="+">할증</option></select>
      <select name="o2"><option value="normal_prc">소비자가</option><option value="sell_prc">판매가</option></select>
      <select name="r1"><option value="1">1</option><option value="10">10</option></select>
      <select name="r2"><option value="1">내림</option><option value="2">반올림</option></select>
      <select name="o3"><option value="normal_prc">소비자가</option><option value="sell_prc">판매가</option></select>
      <input type="text" name="replace_prc" value="">
      <input type="submit" value="확인">
    </form></body></html>`;
}

function kidsnoteMall({ products = {}, loggedOut = false, lagReads = 0, saveStatus = 200, omitTabGet = false }: any = {}) {
  // 목록 순서 = 넣은 순서. 상태 글자는 화면 그대로(정상 · 품절 · 숨김).
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([pno, value]: any) => [pno, typeof value === 'string'
    ? { stat: value, price: 1950, previous: null }
    : { price: 1950, ...value, previous: null }]));
  const log: any = { tabs: [], removed: [], pages: [], saves: [] };
  let listReads = 0;
  let saved = false;
  const fetch = async (path: any, init: any = {}) => {
    const url = new URL(path, KIDSNOTE);
    if (loggedOut) {
      return { url: `${KIDSNOTE}/_manage/login.php`, ok: true, status: 200, text: async () => '<html><body><input type="password"></body></html>' };
    }
    if (url.pathname === '/_manage/' && (init.method || 'GET') === 'GET') {
      assert.equal(url.searchParams.get('body'), '2010');
      const size = Number(url.searchParams.get('row'));
      const page = Number(url.searchParams.get('page'));
      log.pages.push(page);
      if (page === 1 && saved) listReads += 1;
      const lagging = saved && listReads <= lagReads;
      const all = [...state.entries()];
      const rows = all.slice((page - 1) * size, page * size)
        .map(([pno, product]: any) => [pno, lagging && product.previous ? product.previous : product.stat, product.price]);
      return { url: url.href, ok: true, status: 200, text: async () => kidsnoteListHtml(rows, all.map(([pno]: any) => pno)) };
    }
    if (url.pathname === '/_manage/' && init.method === 'POST') {
      assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      const body = [...new URLSearchParams(init.body).entries()];
      log.saves.push(body);
      if (saveStatus !== 200) return { url: url.href, ok: false, status: saveStatus, text: async () => '' };
      const form = new URLSearchParams(init.body);
      if (form.get('exec') === 'sell_prc') {
        assert.equal(form.get('prc_chg_type'), '2');
        assert.equal(form.get('o3'), 'sell_prc');
        for (const pno of form.get('nums').split('@').filter(Boolean)) state.get(pno).price = Number(form.get('replace_prc'));
        saved = true;
        return { url: url.href, ok: true, status: 200, text: async () => "<script>alert('수정되었습니다.');</script>" };
      }
      const next: any = ({ 2: '정상', 3: '품절', 4: '숨김' } as any)[form.get('change_stat')];
      for (const pno of form.get('nums').split('@').filter(Boolean)) {
        const product = state.get(pno);
        product.previous = product.stat;
        product.stat = next;
      }
      saved = true;
      return { url: url.href, ok: true, status: 200, text: async () => "<script>parent.removeLoading();alert('수정되었습니다.');parent.location.reload();</script>" };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const harness = availabilityHarness({ mallKey: 'kidsnote', sources: [pageSource], page: { fetch, DOMParser: PageDOMParser, FormData: PageFormData, location: new URL(`${KIDSNOTE}/_manage/?body=2010`) } });
  const api: any = harness.api;
  return { api, log, state };
}

it('⭐ 키즈노트 품절은 [상태/노출일괄수정]을 "선택한 상품의" 로 보낸 요청 그대로 — 정상인 상품만 품절로, 다시 읽어 확인한다', async () => {
  const { api, log, state } = kidsnoteMall({ products: { 155982: '정상', 187336: '품절', 114708: '숨김' } });
  const result = await api.send({ mallKey: 'kidsnote', codes: ['155982', '187336', '114708', '999999', 'LO1'] });
  assert.deepEqual(plain(log.saves), [[
    ['body', 'product@product_price.exe'],
    ['w', " and p.partner_no='367' and p.stat!=5"],
    ['prd_no', '114708,155982,187336'],
    ['nums', '@155982'],
    ['exec', 'stat'],
    ['where', '1'],
    ['change_stat', '3'],
    ['perm_lst', ''],
    ['perm_dtl', ''],
    ['perm_sch', ''],
  ]]);
  assert.equal(state.get('155982').stat, '품절');
  assert.equal(state.get('114708').stat, '숨김', '숨김은 건드리지 않는다');
  assert.equal(result.success, true);
  // 숨김은 이미 못 산다 — 품절로는 이미 된 것이다(바꾸지는 않는다).
  assert.equal(result.sent, 3, '보낸 1 + 이미 품절 1 + 숨김 1');
  assert.equal(result.confirmed, 3);
  assert.equal(result.already, 2);
  assert.equal(result.failed, 2, '없는 상품 1 · 모양이 다른 코드 1');
});

it('키즈노트 판매 재개는 품절인 상품만 정상(2)으로 되돌린다', async () => {
  const { api, log } = kidsnoteMall({ products: { 1: '품절', 2: '정상', 3: '품절' } });
  const result = await api.send({ mallKey: 'kidsnote', codes: ['1', '2', '3'], resume: true });
  assert.deepEqual(log.saves.map((body: any) => [body.find(([name]: any) => name === 'nums')[1], body.find(([name]: any) => name === 'change_stat')[1]]), [['@1@3', '2']]);
  assert.equal(result.confirmed, 3);
  assert.equal(result.already, 1);
});

it('키즈노트 — 목록은 100개씩 넘기되 찾던 상품을 다 찾으면 멈춘다', async () => {
  const products = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [String(100000 + index), '정상']));
  const { api, log } = kidsnoteMall({ products });
  const read = await api.read({ mallKey: 'kidsnote', codes: ['100150'] });
  assert.deepEqual(log.pages, [1, 2], '두 번째 쪽에서 찾았으니 세 번째 쪽은 읽지 않는다');
  assert.deepEqual(plain(read.products), [{ code: '100150', options: [{ optionCode: '100150', stock: null, rocket: false }] }]);
  log.pages.length = 0;
  const miss = await api.read({ mallKey: 'kidsnote', codes: ['777'] });
  assert.deepEqual(log.pages, [1, 2, 3], '끝 쪽(100개 미만)까지 읽고 멈춘다');
  assert.deepEqual(plain(miss.missing), ['777']);
});

it('키즈노트 — 목록이 늦게 따라와도 다시 읽어 확인하고, 몰이 받지 않으면 실패로 센다 · 로그인이 풀렸으면 보내지 않는다', async () => {
  const late = kidsnoteMall({ products: { 1: '정상' }, lagReads: 1 });
  const caught = await late.api.send({ mallKey: 'kidsnote', codes: ['1'] });
  assert.equal(caught.confirmed, 1);

  const refused = kidsnoteMall({ products: { 1: '정상' }, saveStatus: 500 });
  const answer = await refused.api.send({ mallKey: 'kidsnote', codes: ['1'] });
  assert.equal(answer.sent, 0);
  assert.equal(answer.failed, 1);

  const loggedOut = kidsnoteMall({ products: { 1: '정상' }, loggedOut: true });
  const halted = await loggedOut.api.send({ mallKey: 'kidsnote', codes: ['1'] });
  assert.equal(halted.success, false);
  assert.match(halted.error, /키즈노트 로그인이 풀렸습니다/);
  assert.equal(loggedOut.log.saves.length, 0);
});

it('키즈노트 지금 상태 읽기 — 정상이면 모름, 품절 · 숨김이면 살 수 없어 0', async () => {
  const { api, log } = kidsnoteMall({ products: { 1: '정상', 2: '품절', 3: '숨김' } });
  assert.deepEqual(plain(await api.read({ mallKey: 'kidsnote', codes: ['1', '2', '3', '4'] })), {
    success: true,
    products: [
      { code: '1', options: [{ optionCode: '1', stock: null, rocket: false }] },
      { code: '2', options: [{ optionCode: '2', stock: 0, rocket: false, state: '품절' }] },
      { code: '3', options: [{ optionCode: '3', stock: 0, rocket: false, state: '숨김' }] },
    ],
    missing: ['4'],
  });
  assert.equal(log.saves.length, 0, '읽기만 한다');
});


it('⭐ 키즈노트 가격은 가격 일괄수정(균일가 · 선택한 상품 · 판매가)으로 같은 가격끼리 묶어 보내고, 목록을 다시 읽어 확인한다', async () => {
  const { api, log, state } = kidsnoteMall({
    products: { 155982: { stat: '정상', price: 1950 }, 187336: { stat: '정상', price: 700 }, 114708: { stat: '품절', price: 1200 } },
  });
  const result = await api.sendPrice({
    mallKey: 'kidsnote',
    items: [
      { code: '155982', price: 2000, ifPrice: 1950 },
      { code: '187336', price: 2000, ifPrice: 700 },
      { code: '114708', price: 1300, ifPrice: 1100 },
      { code: '999999', price: 1000 },
    ],
  });
  assert.equal(log.saves.length, 1, '같은 가격(2,000원) 두 상품을 한 번에 보낸다 — 가격이 바뀐 상품은 보내지 않는다');
  const sentForm = new Map(log.saves[0]);
  assert.equal(sentForm.get('exec'), 'sell_prc');
  assert.equal(sentForm.get('where'), '1');
  assert.equal(sentForm.get('prc_chg_type'), '2');
  assert.equal(sentForm.get('o3'), 'sell_prc');
  assert.equal(sentForm.get('replace_prc'), '2000');
  assert.equal(sentForm.get('nums'), '@155982@187336');
  assert.equal(state.get('155982').price, 2000);
  assert.equal(state.get('114708').price, 1200, '그사이 바뀐 가격은 덮어쓰지 않는다');
  assert.equal(result.success, true);
  assert.equal(result.sent, 2);
  assert.equal(result.confirmed, 2);
  assert.equal(result.failed, 2, '가격이 바뀐 1 + 목록에 없는 1');
  assert.deepEqual(plain(result.results), [
    { code: '155982', before: 1950, after: 2000, confirmed: true, observedUrl: 'https://shop.kidsnote.com/_manage/?body=2010' },
    { code: '187336', before: 700, after: 2000, confirmed: true, observedUrl: 'https://shop.kidsnote.com/_manage/?body=2010' },
  ]);
  assert.ok(result.warnings[0].includes('본사 승인 전까지'), result.warnings.join(' / '));
  assert.ok(result.warnings.some((warning: any) => warning.includes('1,200원으로 바뀌어')), result.warnings.join(' / '));
});


