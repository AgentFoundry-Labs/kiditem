// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/kidsnote-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 키즈노트 등록 상품 목록 처리기(ISOLATED, 옛 `readKidsnoteListings` 이식, KID-381). 판매 상품 내역을 100개씩 전체 수만큼 읽는다.
// DOM 파서는 jsdom, 가짜는 페이지 경계(fetch·location)뿐이다. 픽스처는 옛 스위트 그대로다.
const KIDSNOTE = 'https://shop.kidsnote.com';
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'kidsnote',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: KIDSNOTE,
  pageSize: 100,
};

function pageHtml(total: number, page: number) {
  const rows = Array.from({ length: total }, (_, index) => index).slice((page - 1) * 100, page * 100).map((index) => `
    <tr><td><input type="checkbox" name="check_pno[]" value="${155000 + index}"></td><td>${index}</td>
    <td><img src="https://kids-wi.kakaocdn.net/dn/${index}.jpg"></td>
    <td><div class="box_setup"><a href="#">상품 ${index}</a><a href="#">복사</a></div></td>
    <td>26/08/10</td><td>1,200 원</td><td>2,000 원</td><td>0 원</td>
    <td>${index === 1 ? '품절' : index === 2 ? '숨김' : '정상'}</td><td></td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>999</td></tr>`).join('');
  return `<html><body><p>현재 검색된 모든 상품(${total}개)의</p><form name="prdFrm"><table>
    <tr><th></th><th>번호</th><th>이미지</th><th>상품명</th><th>등록일</th><th>판매가</th><th>소비자가</th><th>적립금</th><th>상태</th><th>판매설정</th><th>조회</th><th>주문</th><th>판매</th><th>관심</th><th>담기</th><th>재고</th></tr>
    ${rows}</table></form></body></html>`;
}

async function run(serve: (page: number, url: URL) => { url: string; html: string }) {
  const pages: Array<Array<string | null>> = [];
  const read = listingsPageCall(source, 'kidsnote.listings', {
    location: new URL(`${KIDSNOTE}/_manage/?body=2010`),
    fetch: async (url: string) => {
      const parsed = new URL(url, `${KIDSNOTE}/`);
      pages.push([parsed.searchParams.get('body'), parsed.searchParams.get('row'), parsed.searchParams.get('page')]);
      const answer = serve(Number(parsed.searchParams.get('page')), parsed);
      return { ok: true, status: 200, url: answer.url, text: async () => answer.html };
    },
  });
  return { result: await read(PLAN), pages };
}

describe('kidsnote listings page script', () => {
  it('판매 상품 내역을 100개씩 전체 수만큼 읽고, 상태 칸을 머리 이름으로 찾아 넘긴다', async () => {
    const { result, pages } = await run((page, url) => ({ url: url.href, html: pageHtml(130, page) }));
    expect(result.success).toBe(true);
    expect(pages).toEqual([['2010', '100', '1'], ['2010', '100', '2']]);
    const byCode = new Map(result.snapshot.rows.map((row: { mallProductCode: string }) => [row.mallProductCode, row]));
    expect(byCode.get('155000')).toEqual({
      mallProductCode: '155000',
      productName: '상품 0',
      sellpiaName: null,
      sellerCode: null,
      salePrice: 1200,
      statusWords: ['정상'],
      registeredOn: '2026-08-10',
      imageUrl: 'https://kids-wi.kakaocdn.net/dn/0.jpg',
    });
    expect(byCode.get('155001')).toMatchObject({ statusWords: ['품절'] });
    expect(byCode.get('155002')).toMatchObject({ statusWords: ['숨김'] });
    expect(result.snapshot.collection).toEqual({ totalRecords: 130, recordsRead: 130, pagesRead: 2, totalPages: 2, detailsRead: 0, detailsMissing: 0 });
  });

  it('로그인 화면으로 넘어가거나 비밀번호 칸만 있으면 로그인이 필요하고, 목록 폼이 없으면 형식 변화다', async () => {
    const redirected = await run(() => ({ url: `${KIDSNOTE}/member/login.php?url=/_manage/`, html: '<html><body></body></html>' }));
    expect(redirected.result).toEqual({ success: false, errorCode: 'mall_login_required' });
    const passwordForm = await run((_page, url) => ({ url: url.href, html: '<html><body><form><input type="password"></form></body></html>' }));
    expect(passwordForm.result).toEqual({ success: false, errorCode: 'mall_login_required' });
    const drifted = await run((_page, url) => ({ url: url.href, html: '<html><body><p>점검 중</p></body></html>' }));
    expect(drifted.result).toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'list_form' });
  });
});
