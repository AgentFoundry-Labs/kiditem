import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/esm-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 지마켓 · 옥션(ESM Plus) 등록 상품 목록 처리기(ISOLATED, 옛 `readEsmListings` 이식, KID-381). 마스터 목록을 끝까지 읽고 그 사이트
// 것만, 사방넷 모양 `{사이트번호}_{마스터번호}` 로 넘긴다. 픽스처는 옛 스위트 그대로다.
const ESM = 'https://item.esmplus.com';
const ITEMS = [
  { goodsNo: '9000000001', goodsName: '둘 다', siteGoodsNo: { gmkt: '2057000001', iac: 'F209000001' }, sellStatus: { gmkt: '11', iac: '21' }, price: { gmkt: 5000, iac: 5100 }, managedCode: '1234-1', createdDate: '2026-08-10 10:00:00', imgUrl: 'http://gdimg.gmarket.co.kr/a.jpg' },
  { goodsNo: '9000000002', goodsName: '지마켓만', siteGoodsNo: { gmkt: '2057000002', iac: null }, sellStatus: { gmkt: '31', iac: null }, price: { gmkt: 3000, iac: null }, managedCode: '', createdDate: '2026-08-11 10:00:00', imgUrl: null },
  { goodsNo: '9000000003', goodsName: '옥션만', siteGoodsNo: { gmkt: null, iac: 'C302000003' }, sellStatus: { gmkt: null, iac: '22' }, price: { gmkt: null, iac: 2000 }, managedCode: null, createdDate: '2026-08-12 10:00:00', imgUrl: null },
];

async function run(mallKey: 'gmarket' | 'auction', options: { status?: number; landAt?: string } = {}) {
  const read = listingsPageCall(source, 'esm.listings', {
    location: new URL(`${ESM}/goods/list`),
    fetch: async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      const start = (body.pageIndex - 1) * body.pageSize;
      const status = options.status ?? 200;
      const payload = { resultCode: 0, data: { totalCount: ITEMS.length, pageSize: body.pageSize, pageIndex: body.pageIndex, items: ITEMS.slice(start, start + body.pageSize) } };
      return { ok: status < 300, status, url: options.landAt ?? new URL(url, `${ESM}/`).href, json: async () => payload };
    },
  });
  return read({
    sourceType: 'mall_admin_listings',
    parserVersion: 'mall-admin-listings-v1',
    mallKey,
    channelAccountId: '33333333-3333-4333-8333-333333333333',
    sourceOrigin: ESM,
    pageSize: 500,
  });
}

describe('esm (gmarket · auction) listings page script', () => {
  it('지마켓은 지마켓에 올라간 마스터만, 사이트 번호를 다른 코드로 함께 싣는다', async () => {
    const gmarket = await run('gmarket');
    expect(gmarket.success).toBe(true);
    expect(gmarket.snapshot.rows.map((row: { mallProductCode: string; alternateCodes: string[]; statusWords: string[] }) => [row.mallProductCode, row.alternateCodes, row.statusWords[0]])).toEqual([
      ['2057000001_9000000001', ['2057000001'], '판매중'],
      ['2057000002_9000000002', ['2057000002'], 'SKU품절'],
    ]);
    expect(gmarket.snapshot.rows[0]).toMatchObject({ imageUrl: 'https://gdimg.gmarket.co.kr/a.jpg', sellerCode: '1234-1' });
    expect(gmarket.snapshot.collection.totalRecords).toBe(2);
  });

  it('옥션은 옥션 것만, 옥션 판매상태와 가격으로', async () => {
    const auction = await run('auction');
    expect(auction.snapshot.rows.map((row: { mallProductCode: string; statusWords: string[]; salePrice: number }) => [row.mallProductCode, row.statusWords[0], row.salePrice])).toEqual([
      ['C302000003_9000000003', '판매불가', 2000],
      ['F209000001_9000000001', '판매중지', 5100],
    ]);
  });

  it('로그인 화면으로 넘어가거나 401 이면 로그인이 필요하다', async () => {
    expect(await run('gmarket', { landAt: 'https://signin.esmplus.com/login' })).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect(await run('auction', { status: 401 })).toEqual({ success: false, errorCode: 'mall_login_required' });
  });
});
