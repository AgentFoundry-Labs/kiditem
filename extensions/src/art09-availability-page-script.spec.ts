import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import pageSource from '../kiditem-os/content/page-call/mall-availability.js?raw';
import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/art09/availability';

/**
 * 아트공구(카페24 공급사 관리자) 품절 = 상품목록의 [판매안함], 재개 = [판매함](실측 2026-09-19, 옛 스펙 이식). 버튼은 고른 줄의
 * 체크박스 값(`is_display`·`is_selling`)을 읽어 `product_no[]`·`change=is_selling`·`state`·`market[번호][…]`로 POST
 * /exec/admin/product/ProductManageState에 보낸다. 화면 안 함수(`cafe24ListOnPage`·`requestOnPage`)를 실제로 돌린다 — 목록 HTML은
 * 카페24 모양 그대로다.
 */
const CAFE24 = 'https://zzogzzog1.cafe24.com';
const { DOMParser } = new JSDOM('').window;

type Product = { display?: boolean | string; selling?: boolean | string; set?: boolean };

function cafe24ListHtml(total: number, rows: Array<[string, Product]>) {
  const flag = (value: unknown) => (typeof value === 'string' ? value : value ? 'T' : 'F');
  const row = ([no, product]: [string, Product]) => `<tr>
    <td><input type="checkbox" class="rowChk _product_no" value="${no}" is_display="${flag(product.display)}"
      is_selling="${flag(product.selling)}" is_funding_product="F" is_set_product="${product.set ? 'T' : 'F'}" data-option-type="T"></td>
    <td>${no}</td><td>기본상품</td><td>P000${no}</td>
    <td><p><a href="/disp/admin/shop1/product/ProductRegister?product_no=${no}" class="txtLink eProductDetail ec-product-list-productname">상품 ${no}</a></p></td>
    <td></td><td>9,490</td><td>9,490</td><td>9,490</td><td>SMS발송</td>
  </tr>`;
  return `<html><body><form id="eProductSearchForm"></form><p class="total">[총 <strong>${total}</strong>개]</p>
    <table><thead><tr><th></th><th>No</th><th>상품구분</th><th>상품코드</th><th>상품명</th><th>마켓연동</th><th>판매가</th></tr></thead>
    <tbody>${rows.map(row).join('')}</tbody></table></body></html>`;
}

function art09Mall({ products = {} as Record<string, Product>, loggedOut = false, stateAnswer = { passed: true, msg: null as string | null } } = {}) {
  const state = new Map(Object.entries(products).map(([no, product]) => [no, { display: true, selling: true, set: false, ...product } as Product]));
  const log = { lists: [] as number[], posts: [] as Array<Array<[string, string]>> };
  const fetch = async (path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const url = new URL(path, CAFE24);
    if (url.pathname === '/disp/admin/shop1/product/ProductManage') {
      log.lists.push(Number(url.searchParams.get('page')));
      if (loggedOut) return { url: 'https://eclogin.cafe24.com/Shop/', ok: true, status: 200, text: async () => '<html><body>로그인</body></html>' };
      const page = Number(url.searchParams.get('page'));
      const limit = Number(url.searchParams.get('limit'));
      expect(url.searchParams.get('orderby')).toBe('regist_d');
      const all = [...state.entries()];
      return { url: url.href, ok: true, status: 200, text: async () => cafe24ListHtml(all.length, all.slice((page - 1) * limit, page * limit)) };
    }
    if (url.pathname === '/exec/admin/product/ProductManageState' && init.method === 'POST') {
      expect(init.headers!['X-Requested-With']).toBe('XMLHttpRequest');
      expect(init.headers!['Content-Type']).toMatch(/^application\/x-www-form-urlencoded/);
      const body = new URLSearchParams(init.body);
      log.posts.push([...(body as unknown as Iterable<[string, string]>)]);
      if (stateAnswer.passed) for (const no of body.getAll('product_no[]')) state.get(no)!.selling = body.get('state') === 'T';
      return { url: url.href, ok: true, status: 200, text: async () => JSON.stringify(stateAnswer) };
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`);
  };
  const harness = availabilityHarness({
    mallKey: 'art09',
    sources: [pageSource],
    page: { fetch, DOMParser, location: new URL(`${CAFE24}/disp/admin/shop1/product/ProductManage`) },
  });
  return { ...harness, state, art09: log };
}

describe('아트공구 품절·재개(화면 안 함수를 실제로 돌린다)', () => {
  it('⭐ 품절은 상품목록 [판매안함]과 같은 요청으로 — 판매함인 상품만, 지금 값을 싣고, 다시 읽어 확인한다', async () => {
    const { api, art09, state, log } = art09Mall({ products: { 123858: {}, 123856: { display: false }, 123852: { selling: false }, 123851: { set: true } } });
    const result = await api.send({ codes: ['123858', '123856', '123852', '123851', '999999', 'P000HBFU'] });
    expect(art09.posts).toEqual([[
      ['product_no[]', '123858'], ['product_no[]', '123856'], ['change', 'is_selling'], ['state', 'F'],
      ['market[123858][is_display]', 'T'], ['market[123858][is_selling]', 'T'],
      ['market[123856][is_display]', 'F'], ['market[123856][is_selling]', 'T'],
    ]]);
    expect(state.get('123858')!.selling).toBe(false);
    expect(state.get('123851')!.selling).toBe(true);
    expect(result).toMatchObject({ success: true, sent: 3, confirmed: 3, already: 1, failed: 3 });
    expect(result.warnings!.some((warning) => /세트상품 1개/.test(warning))).toBe(true);
    expect(art09.lists).toEqual([1, 1]);
    expect(log.filter((line) => line.startsWith('navigate '))).toEqual([`navigate ${CAFE24}/disp/admin/shop1/product/ProductManage`]);
    expect(log).toContain('close 7');
  });

  it('판매 재개는 판매안함인 상품만 [판매함]으로 되돌린다', async () => {
    const { api, art09, state } = art09Mall({ products: { 1: { selling: false }, 2: {} } });
    const result = await api.send({ codes: ['1', '2'], resume: true });
    expect(art09.posts).toEqual([[['product_no[]', '1'], ['change', 'is_selling'], ['state', 'T'], ['market[1][is_display]', 'T'], ['market[1][is_selling]', 'F']]]);
    expect(state.get('1')!.selling).toBe(true);
    expect(result).toMatchObject({ confirmed: 2, already: 1 });
  });

  it('상품목록은 100개씩 끝까지 읽는다', async () => {
    const products = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [String(200000 + index), {}]));
    const { api, art09 } = art09Mall({ products });
    const result = await api.send({ codes: ['200149'] });
    expect(result.confirmed).toBe(1);
    expect(art09.lists).toEqual([1, 2, 1, 2]);
  });

  it('로그인이 풀렸으면 아무것도 보내지 않는다 · 몰이 거절하면 실패로 센다 · 판매 상태를 읽지 못한 상품은 보내지 않는다', async () => {
    const loggedOut = art09Mall({ products: { 1: {} }, loggedOut: true });
    const refused = await loggedOut.api.send({ codes: ['1'] });
    expect(refused.success).toBe(false);
    expect(refused.error).toMatch(/아트공구 로그인이 풀렸습니다/);
    expect(loggedOut.art09.posts).toHaveLength(0);

    const rejected = art09Mall({ products: { 1: {} }, stateAnswer: { passed: false, msg: '권한이 없습니다.' } });
    const result = await rejected.api.send({ codes: ['1'] });
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(result.warnings!.some((warning) => /판매상태 변경을 받지 않았습니다.*권한이 없습니다/.test(warning))).toBe(true);

    const unknown = art09Mall({ products: { 1001: { selling: 'X' } } });
    const skipped = await unknown.api.send({ codes: ['1001'] });
    expect(skipped).toMatchObject({ failed: 1, already: 0 });
    expect(skipped.warnings!.some((warning) => /상태를 읽지 못해/.test(warning))).toBe(true);
  });

  it('지금 상태 읽기 — 판매안함이면 품절(0), 판매함이면 모름', async () => {
    const { api, art09 } = art09Mall({ products: { 1: { selling: false }, 2: {} } });
    expect(await api.read({ codes: ['1', '2', '3'] })).toEqual({
      success: true,
      products: [
        { code: '1', options: [{ optionCode: '1', stock: 0, rocket: false }] },
        { code: '2', options: [{ optionCode: '2', stock: null, rocket: false }] },
      ],
      missing: ['3'],
    });
    expect(art09.posts).toHaveLength(0);
  });
});
