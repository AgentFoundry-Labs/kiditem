// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/onch-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 온채널 공급사 등록 상품 목록 처리기(ISOLATED, 옛 `readOnchannelListings` 이식, KID-381). 등록 상품 관리 화면을 쪽마다 15줄씩
// 쪽 번호 링크가 말하는 끝 쪽까지 읽는다. 옛 스위트에 픽스처가 없어 읽기기의 규칙(상품코드 칸이 `CH…`인 표 · 판매상태와 재고상태가
// 한 칸 · 5번째 칸 이름 · 7번째 칸 판매가)으로 화면을 그렸다. DOM 파서는 jsdom이다.
const ONCH = 'https://www.onch3.co.kr';
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'onch',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: ONCH,
  pageSize: 15,
};
const TOTAL = 20;

function pageHtml(page: number, lastPage = 2) {
  const rows = Array.from({ length: TOTAL }, (_, index) => index).slice((page - 1) * 15, page * 15).map((index) => `
    <tr><td><input type="checkbox"></td><td>${index}</td><td>CH${4410000 + index}</td>
      <td>판매중
        ${index === 1 ? '일시품절' : '정상'}</td>
      <td><img src="${index === 2 ? '/img/relative.jpg' : `https://img.onch3.co.kr/${index}.jpg`}"></td>
      <td>온채널 상품 ${index}</td><td>공급가</td><td>${(1000 + index).toLocaleString('en-US')}원</td></tr>`).join('');
  const links = Array.from({ length: lastPage }, (_, index) => `<a href="/products_management.php?page=${index + 1}">${index + 1}</a>`).join('');
  return `<html><body>
    <table><tr><td>검색</td></tr><tr><td>안내</td><td></td><td>상품코드</td></tr></table>
    <table><tr><th>선택</th><th>번호</th><th>상품코드</th><th>상태</th><th>이미지</th><th>상품명</th><th>공급가</th><th>판매가</th></tr>${rows}</table>
    ${links}</body></html>`;
}

async function run(serve: (page: number, url: URL) => { url: string; html: string }) {
  const pages: number[] = [];
  const read = listingsPageCall(source, 'onch.listings', {
    location: new URL(`${ONCH}/products_management.php`),
    fetch: async (url: string) => {
      const parsed = new URL(url, `${ONCH}/`);
      const page = Number(parsed.searchParams.get('page'));
      pages.push(page);
      const answer = serve(page, parsed);
      return { ok: true, status: 200, url: answer.url, text: async () => answer.html };
    },
  });
  return { result: await read(PLAN), pages };
}

describe('onch listings page script', () => {
  it('쪽 번호 링크의 끝 쪽까지 15줄씩 읽고, 판매상태와 재고상태를 함께, 상품명 · 판매가 · https 사진만 넘긴다', async () => {
    const { result, pages } = await run((page, url) => ({ url: url.href, html: pageHtml(page) }));
    expect(result.success).toBe(true);
    expect(pages).toEqual([1, 2]);
    expect(result.snapshot.rows).toHaveLength(TOTAL);
    const byCode = new Map(result.snapshot.rows.map((row: { mallProductCode: string }) => [row.mallProductCode, row]));
    expect(byCode.get('CH4410000')).toEqual({
      mallProductCode: 'CH4410000',
      productName: '온채널 상품 0',
      sellpiaName: null,
      sellerCode: null,
      salePrice: 1000,
      statusWords: ['판매중', '정상'],
      registeredOn: null,
      imageUrl: 'https://img.onch3.co.kr/0.jpg',
    });
    expect(byCode.get('CH4410001')).toMatchObject({ statusWords: ['판매중', '일시품절'] });
    expect(byCode.get('CH4410002')).not.toHaveProperty('imageUrl');
    expect(result.snapshot.collection).toEqual({ totalRecords: TOTAL, recordsRead: TOTAL, pagesRead: 2, totalPages: 2, detailsRead: 0, detailsMissing: 0 });
  });

  it('로그인 화면으로 넘어가면 로그인이 필요하고, 상품 표가 없는 쪽은 형식 변화다', async () => {
    expect((await run(() => ({ url: `${ONCH}/login/login_web.php`, html: '<html></html>' }))).result).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect((await run((_page, url) => ({ url: url.href, html: '<html><body><table><tr><td>점검</td></tr></table></body></html>' }))).result)
      .toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'goods_table' });
  });
});
