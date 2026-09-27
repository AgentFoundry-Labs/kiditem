// 옛 `extensions/tests/mall-availability-send.test.mjs`의 teacher-mall 절을 옮긴 스펙(KID-256) — 서비스워커 쪽 몰 쓰기 모듈을 가짜 탭에서
// 돌리고, 화면 안 요청은 실제 페이지 파일(`content/page-call/mall-availability.js`)을 몰 모양 가짜 fetch 위에서 돌린다.
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';

import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/teacher-mall/availability';

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
 * 티쳐몰 품절 = 재고 0, 재개 = 재고 999(실측 2026-09-19). [실물] 일괄 업데이트(batch_modify?mode=goodsetc)의 [업데이트하기]가
 * 폼 `goodsBatchUpdateForm` 에 검색 조건(get_search_field)을 붙여 goods_process/batch_goods_modify 로 보낸다.
 * 정보수정(goods/regist)은 승인이 풀려 쓰지 않는다. 화면 안 함수를 실제로 돌린다.
 */
const TEACHER = 'https://shop.teacherville.co.kr';

function teacherBatchHtml(code: any, product: any) {
  const options = product.options.map((option: any) => `
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

function teacherMall({ products = {}, loggedOut = false, loseApproval = false }: any = {}) {
  const state = new Map<string, any>(Object.entries(products as Record<string, any>).map(([code, product]: any) => [code, {
    approval: '승인', options: [{ seq: '2176308', stock: '999' }], ...product,
  }]));
  const log: any = { tabs: [], removed: [], batches: [], catalogs: [], posts: [] };
  const fetch = async (path: any, init: any = {}) => {
    const url = new URL(path, TEACHER);
    if (loggedOut && init.method !== 'POST') {
      return { url: `${TEACHER}/selleradmin/login/index`, ok: true, status: 200, text: async () => '<html><body>로그인</body></html>' };
    }
    if (url.pathname === '/selleradmin/goods/batch_modify') {
      assert.equal(url.searchParams.get('mode'), 'goodsetc');
      const code = url.searchParams.get('keyword') as string;
      log.batches.push(code);
      const html = state.has(code) ? teacherBatchHtml(code, state.get(code)) : '<html><body><form id="goodsBatchUpdateForm"></form></body></html>';
      return { url: url.href, ok: true, status: 200, text: async () => html };
    }
    if (url.pathname === '/selleradmin/goods/catalog') {
      const code = url.searchParams.get('keyword') as string;
      log.catalogs.push(code);
      const product = state.get(code);
      const soldOut = product && product.options.every((option: any) => Number(option.stock) === 0);
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
          const option = product.options.find((candidate: any) => candidate.seq === match[1]);
          if (option) option.stock = value;
        }
      }
      if (loseApproval) for (const product of state.values()) product.approval = '미승인';
      return { url: url.href, ok: true, status: 200, text: async () => '<script>parent.openDialogAlert("변경 되었습니다.")</script>' };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const harness = availabilityHarness({ mallKey: 'teacher-mall', sources: [pageSource], page: { fetch, DOMParser: PageDOMParser, location: new URL(`${TEACHER}/selleradmin/goods/catalog`) } });
  const api: any = harness.api;
  return { api, log, state };
}

it('⭐ 티쳐몰 품절은 [실물] 일괄 업데이트의 [업데이트하기]와 같은 요청으로 — 그 상품 재고만 0, 검색 조건을 붙여 보낸다', async () => {
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
  assert.deepEqual(plain(result.warnings.filter((warning: any) => /상품목록 상태/.test(warning))), []);
  assert.deepEqual(log.catalogs, ['1207830'], '보낸 뒤 상품목록에서 승인 · 판매 상태를 본다');
});

it('티쳐몰 판매 재개는 재고 0 인 상품만 재고 999 로 되돌린다', async () => {
  const { api, log } = teacherMall({ products: { 1: { options: [{ seq: '11', stock: '0' }] }, 2: { options: [{ seq: '22', stock: '999' }] } } });
  const result = await api.send({ mallKey: 'teacher-mall', codes: ['1', '2'], resume: true });
  assert.deepEqual(log.posts.map((post: any) => post.find(([name]: any) => name.startsWith('stock['))), [['stock[11]', '999']]);
  assert.equal(result.confirmed, 2);
  assert.equal(result.already, 1);
});

it('⭐ 티쳐몰 — 보낸 뒤 승인이 풀렸으면(미승인) 확인으로 세지 않고 알린다', async () => {
  const { api } = teacherMall({ products: { 1207830: {} }, loseApproval: true });
  const result = await api.send({ mallKey: 'teacher-mall', codes: ['1207830'] });
  assert.equal(result.sent, 1);
  assert.equal(result.confirmed, 0);
  assert.ok(result.warnings.some((warning: any) => /승인이 풀렸습니다/.test(warning)));
});

it('티쳐몰 — 옵션이 여럿인 상품은 보내지 않고, 로그인이 풀렸으면 아무것도 보내지 않는다', async () => {
  const multi = teacherMall({ products: { 5: { options: [{ seq: '51', stock: '999' }, { seq: '52', stock: '999' }] } } });
  const skipped = await multi.api.send({ mallKey: 'teacher-mall', codes: ['5'] });
  assert.equal(multi.log.posts.length, 0);
  assert.equal(skipped.failed, 1);
  assert.ok(skipped.warnings.some((warning: any) => /옵션이 여럿인 상품 1개/.test(warning)));

  const loggedOut = teacherMall({ products: { 1207830: {} }, loggedOut: true });
  const refused = await loggedOut.api.send({ mallKey: 'teacher-mall', codes: ['1207830'] });
  assert.equal(refused.success, false);
  assert.match(refused.error, /티쳐몰 로그인이 풀렸습니다/);
  assert.equal(loggedOut.log.posts.length, 0);
});

it('티쳐몰 지금 재고 읽기 — 재고 0 이면 품절(0), 아니면 모름', async () => {
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
