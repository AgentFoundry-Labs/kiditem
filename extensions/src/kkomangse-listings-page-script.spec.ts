// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/kkomangse-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 꼬망세(EduPre 입점관리자) 등록 상품 목록 처리기(ISOLATED, 옛 `readKkomangseListings` 이식, KID-381). 배송상품 목록을
// `listmaxcount`(=쪽 크기 10000)로 한 번에 받는다. 옛 스위트에 픽스처가 없어 읽기기의 규칙(상품코드 체크박스가 있는 표 · 상태 칸 ·
// 상품정보 칸에서 코드와 몰 내부번호를 뗀 이름 · 판매가 칸의 마지막 금액)으로 화면을 그렸다. DOM 파서는 jsdom이다.
const KKOMANGSE = 'https://nstore.edupre.co.kr';
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'kkomangse',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: KKOMANGSE,
  pageSize: 10000,
};

type Product = { code: string; name: string; status: string; prices: string; image?: string };
const product = (item: Product) => `
  <tr><td><input type="checkbox" name="chk_pcode[${item.code}]" value="Y"></td><td>1</td><td>${item.status}</td>
    <td>${item.image ? `<img src="${item.image}">` : ''}${item.name} ${item.code} [17726127426200]</td><td>교구</td><td>${item.prices}</td></tr>`;
const listHtml = (items: Product[]) => `<html><body>
  <table><tr><td>검색</td></tr><tr><td><input name="search_keyword"></td></tr><tr><td>기간</td></tr></table>
  <table><tr><th>선택</th><th>번호</th><th>상태</th><th>상품정보</th><th>분류</th><th>판매가</th></tr>
  ${items.map(product).join('')}</table></body></html>`;

async function run(serve: (url: URL) => { url: string; html: string }) {
  const requests: string[] = [];
  const read = listingsPageCall(source, 'kkomangse.listings', {
    location: new URL(`${KKOMANGSE}/subAdmin/_product.list.php`),
    fetch: async (url: string, init: { credentials: string }) => {
      const parsed = new URL(url, `${KKOMANGSE}/`);
      requests.push(`${parsed.pathname}${parsed.search} ${init.credentials}`);
      const answer = serve(parsed);
      return { ok: true, status: 200, url: answer.url, text: async () => answer.html };
    },
  });
  return { result: await read(PLAN), requests };
}

describe('kkomangse listings page script', () => {
  it('상품코드 체크박스가 있는 표에서 한 번에 읽고, 이름에서 코드와 몰 내부번호를 떼고, 판매가는 아래(마지막) 금액이다', async () => {
    const { result, requests } = await run((url) => ({
      url: url.href,
      html: listHtml([
        { code: 'P2000-1', name: '[키드아이템] 색종이 12색', status: '판매중', prices: '12,000원<br>9,900원', image: 'https://nstore.edupre.co.kr/data/a.jpg' },
        { code: 'P1000-9', name: '비눗방울 세트', status: '품절', prices: '3,000원', image: '/data/relative.jpg' },
        { code: 'P2000-1', name: '[키드아이템] 색종이 12색', status: '판매중', prices: '9,900원' },
      ]),
    }));
    expect(requests).toEqual(['/subAdmin/_product.list.php?listmaxcount=10000 include']);
    expect(result.success).toBe(true);
    expect(result.snapshot.rows).toEqual([
      // https 가 아닌 사진 주소는 싣지 않는다.
      { mallProductCode: 'P1000-9', productName: '비눗방울 세트', sellpiaName: null, sellerCode: null, salePrice: 3000, statusWords: ['품절'], registeredOn: null },
      {
        mallProductCode: 'P2000-1',
        productName: '[키드아이템] 색종이 12색',
        sellpiaName: null,
        sellerCode: null,
        salePrice: 9900,
        statusWords: ['판매중'],
        registeredOn: null,
        imageUrl: 'https://nstore.edupre.co.kr/data/a.jpg',
      },
    ]);
    expect(result.snapshot.collection).toEqual({ totalRecords: 2, recordsRead: 2, pagesRead: 1, totalPages: 1, detailsRead: 0, detailsMissing: 0 });
    expect(result.snapshot.proof).toEqual({ mallKey: 'kkomangse', pageSize: 10000, validatedList: true });
  });

  it('로그인 화면으로 넘어가면 로그인이 필요하고, 상품 표가 없거나 비었으면 형식 변화다', async () => {
    expect((await run(() => ({ url: `${KKOMANGSE}/subAdmin/login.php`, html: '<html></html>' }))).result).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect((await run((url) => ({ url: url.href, html: '<html><body><table><tr><td>안내</td></tr></table></body></html>' }))).result)
      .toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'goods_table' });
  });
});
