import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/smartstore-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 스마트스토어 등록 상품 목록 처리기(MAIN world, 옛 `readSmartstoreListings` 이식, KID-381). 화면의 Angular `$http` 로 원상품 목록을
// 읽고 채널상품번호를 코드로 · 원상품번호를 다른 코드로 넘긴다. 픽스처는 옛 스위트 그대로다.
const NAVER = 'https://sell.smartstore.naver.com';
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'smartstore',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: NAVER,
  pageSize: 100,
};
const CONTENT = [
  { id: 10091000001, productName: '상품 A', productStatusType: 'SALE', salePrice: 5000, singleChannelProducts: [{ channelProductNo: 5441000001 }], sellerManagementCode: '1234-1', regDate: '2026-08-10T10:00:00', representImageUrl: 'https://shop-phinf.pstatic.net/a.jpg' },
  { id: 10091000002, productName: '상품 B', productStatusType: 'SUSPENSION', salePrice: 6000, singleChannelProducts: [{ channelProductNo: 5441000002 }] },
];

function smartstore(http: (config: { data: unknown }) => Promise<unknown>, options: { angular?: boolean; hostname?: string } = {}) {
  const read = listingsPageCall(source, 'smartstore.listings', {
    document: { body: {} },
    window: options.angular === false ? {} : { angular: { element: () => ({ injector: () => ({ get: () => http }) }) } },
    location: { hostname: options.hostname ?? 'sell.smartstore.naver.com', href: `${NAVER}/#/products/origin-list` },
  });
  return () => read(PLAN);
}

describe('smartstore listings page script (MAIN)', () => {
  it('화면의 $http 로 원상품 목록을 읽고, 채널상품번호를 코드로 · 원상품번호를 다른 코드로 넘긴다', async () => {
    const calls: unknown[] = [];
    // 원상품 목록 답은 전체 수를 `total` 에 싣는다(공개 번들 app.js).
    const result = await smartstore(async (config) => {
      calls.push(config.data);
      return { status: 200, data: { content: CONTENT, pageable: { page: 0, size: 100 }, total: CONTENT.length } };
    })();
    expect(result.success).toBe(true);
    expect(calls).toEqual([{
      searchPeriodType: 'PROD_REG_DAY',
      searchKeywordType: 'CHANNEL_PRODUCT_NO',
      searchOrderType: 'REG_DATE',
      searchKeyword: '',
      searchDynamicPricingType: 'ALL',
      page: 0,
      size: 100,
    }]);
    expect(result.snapshot.rows[0]).toMatchObject({ imageUrl: 'https://shop-phinf.pstatic.net/a.jpg', sellerCode: '1234-1' });
    expect(result.snapshot.rows.map((row: { mallProductCode: string; alternateCodes: string[]; statusWords: string[] }) => [row.mallProductCode, row.alternateCodes, row.statusWords[0]])).toEqual([
      ['5441000001', ['10091000001'], '판매중'],
      ['5441000002', ['10091000002'], '판매중지'],
    ]);
  });

  it('화면이 아닌 곳(네이버 로그인)에 있거나 401 이면 로그인이 필요하다', async () => {
    expect(await smartstore(async () => ({}), { angular: false, hostname: 'accounts.commerce.naver.com' })()).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect(await smartstore(async () => { throw Object.assign(new Error('401'), { status: 401 }); })()).toEqual({ success: false, errorCode: 'mall_login_required' });
  });
});
