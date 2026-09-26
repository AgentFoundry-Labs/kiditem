// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/teacher-mall-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 티쳐몰(퍼스트몰 selleradmin) 등록 상품 목록 처리기(ISOLATED, 옛 `readTeacherListings` 이식, KID-381). 칸 머리(상품명이 두 칸을
// 덮는다)로 판매가 · 상태 · 노출을 찾고, 이름 링크만 상품명으로 넘긴다. DOM 파서는 jsdom, 픽스처는 옛 스위트 그대로다.
const TEACHER = 'https://shop.teacherville.co.kr';
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'teacher-mall',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: TEACHER,
  pageSize: 100,
};

const row = (index: number, state: [string, string], shown: string) => `
  <tr><td><input type="checkbox" name="goods_seq[]" value="${1117000 + index}"></td><td></td><td class="page_no">${index}</td>
    <td><a href="#"><img src="https://shop.teacherville.co.kr/data/${index}.jpg"></a></td>
    <td><a href="#">[상품번호: ${1117000 + index}]</a><a href="#">상품 ${index} (1p)</a></td>
    <td>900</td><td>2,000</td><td>1,500</td><td>40 %</td><td>[1] 10 / 10</td><td>-</td><td>택배(2500)</td><td>0 0</td>
    <td>2026-08-10 10:00:00 2026-08-11 10:00:00</td><td><span>${state[0]}</span><span>${state[1]}</span></td><td>${shown}</td><td></td></tr>
  <tr><td colspan="17">옵션</td></tr>`;
const HTML = `<html><body><table>
  <tr><th></th><th></th><th>번호</th><th colspan="2">상품명</th><th>공급가</th><th>정가</th><th>판매가</th><th>마진율</th><th>재고/가용</th><th>재고판매</th><th>배송</th><th>구매/PV</th><th>등록일▼ /수정일</th><th>상태</th><th>노출</th><th>관리</th></tr>
  ${row(0, ['승인', '정상'], '노출')}${row(1, ['미승인', '판매중지'], '노출')}${row(2, ['승인', '재고확보중'], '미노출')}
</table></body></html>`;

async function run(serve: (url: URL) => { url: string; html: string }) {
  const pages: Array<Array<string | null>> = [];
  const read = listingsPageCall(source, 'teacher-mall.listings', {
    location: new URL(`${TEACHER}/selleradmin/goods/catalog`),
    fetch: async (url: string) => {
      const parsed = new URL(url, `${TEACHER}/`);
      pages.push([parsed.searchParams.get('page'), parsed.searchParams.get('perpage')]);
      const answer = serve(parsed);
      return { ok: true, status: 200, url: answer.url, text: async () => answer.html };
    },
  });
  return { result: await read(PLAN), pages };
}

describe('teacher-mall listings page script', () => {
  it('칸 머리로 판매가 · 상태 · 노출을 찾고, 이름 링크만 상품명으로 넘긴다(한 쪽이 덜 차면 끝)', async () => {
    const { result, pages } = await run((url) => ({ url: url.href, html: HTML }));
    expect(result.success).toBe(true);
    expect(pages).toEqual([['1', '100']]);
    const byCode = new Map(result.snapshot.rows.map((item: { mallProductCode: string }) => [item.mallProductCode, item]));
    expect(byCode.get('1117000')).toEqual({
      mallProductCode: '1117000',
      productName: '상품 0 (1p)',
      sellpiaName: null,
      sellerCode: null,
      salePrice: 1500,
      statusWords: ['승인', '정상', '노출'],
      registeredOn: '2026-08-10',
      imageUrl: 'https://shop.teacherville.co.kr/data/0.jpg',
    });
    expect(byCode.get('1117001')).toMatchObject({ statusWords: ['미승인', '판매중지', '노출'] });
    expect(byCode.get('1117002')).toMatchObject({ statusWords: ['승인', '재고확보중', '미노출'] });
  });

  it('목록 화면을 벗어나거나 비밀번호 칸이 있으면 로그인이 필요하다', async () => {
    expect((await run(() => ({ url: `${TEACHER}/selleradmin/login/index`, html: '<html></html>' }))).result).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect((await run((url) => ({ url: url.href, html: '<html><body><input type="password"></body></html>' }))).result).toEqual({ success: false, errorCode: 'mall_login_required' });
  });
});
