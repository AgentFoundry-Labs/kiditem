import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/thirtymall-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 떠리몰(샵바이 파트너 어드민) 등록 상품 목록 처리기(ISOLATED, 옛 `readThirtymallListings` 이식, KID-381). 목록 화면이 부르는 상품
// 검색 API 를 겉 화면 안에서 100개씩 읽는다(라이브 2026-09-19: 479개 = 5쪽). 픽스처는 옛 스위트 그대로다.
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'thirtymall',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: 'https://partner.shopby.co.kr',
  pageSize: 100,
};

function product(index: number, overrides: Record<string, unknown> = {}) {
  return {
    mallProductNo: 132150000 + index,
    mallNo: 78859,
    productName: `야광 안테나 지시봉 ${index} (24개) (업체별도 무료배송)`,
    applyStatusType: 'FINISHED',
    saleStatusType: 'ON_SALE',
    saleSettingStatusType: 'AVAILABLE_FOR_SALE',
    isSoldOut: false,
    salePrice: 8000,
    productManagementCd: '',
    registerDateTime: '2026-08-10 15:12:20',
    mainImageUrl: '//shopby-images.cdn-nhncommerce.com/a.jpg',
    ...overrides,
  };
}

type Request = { origin: string; path: string; method: string; headers: Record<string, string>; body: Record<string, any> };

async function run({ products, cookie = 'a=1; SHOPBY_PARTNER_SESSAT=tok-page-123; b=2', totalShift = 0, status = 200 }: {
  products: unknown[]; cookie?: string; totalShift?: number; status?: number;
}) {
  const requests: Request[] = [];
  const read = listingsPageCall(source, 'thirtymall.listings', {
    document: { cookie },
    fetch: async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      const parsed = new URL(url);
      const body = JSON.parse(init.body);
      requests.push({ origin: parsed.origin, path: parsed.pathname, method: init.method, headers: init.headers, body });
      if (status !== 200) return { ok: false, status, json: async () => ({ code: 'A0003' }) };
      const total = products.length + totalShift;
      const start = (body.page - 1) * body.size;
      return {
        ok: true,
        status: 200,
        json: async () => ({ totalCount: total, totalPage: Math.max(1, Math.ceil(total / body.size)), contents: products.slice(start, start + body.size), lastId: null }),
      };
    },
  });
  return { result: await read(PLAN), requests };
}

describe('thirtymall listings page script', () => {
  it('검색 API 를 100개씩 1쪽부터 다 돌고, 승인 · 판매설정 · 판매상태 · 품절을 몰 글자로, 고른 칸만 넘긴다', async () => {
    const products = Array.from({ length: 205 }, (_, index) => product(index));
    products[1] = product(1, { saleSettingStatusType: 'STOP_SELLING' });
    products[2] = product(2, { saleSettingStatusType: 'PROHIBITION_SALE', isSoldOut: true });
    products[3] = product(3, { applyStatusType: 'APPROVAL_REJECTION', saleStatusType: 'PRE_APPROVAL_STATUS' });
    products[4] = product(4, { isSoldOut: true, productManagementCd: 'INV-10471-1' });
    const { result, requests } = await run({ products });
    expect(result.success).toBe(true);
    expect(requests.map((request) => [request.origin, request.path, request.method, request.body.page])).toEqual([
      ['https://admin-api.e-ncp.com', '/products/search', 'POST', 1],
      ['https://admin-api.e-ncp.com', '/products/search', 'POST', 2],
      ['https://admin-api.e-ncp.com', '/products/search', 'POST', 3],
    ]);
    for (const request of requests) {
      expect(request.headers).toMatchObject({
        accessToken: 'tok-page-123',
        Version: '1.0',
        // 화면 주소가 없으면 샵바이가 403 "권한이 없습니다" 로 막는다.
        ClientLocation: 'https://partner-remote.shopby.co.kr/product/management/list',
      });
      expect(request.body).toMatchObject({
        mallNos: [78859],
        size: 100,
        periodInfo: { type: 'REGISTER_DATE', period: { startYmdt: '2000-01-01 00:00:00', endYmdt: '2999-12-31 23:59:59' } },
        saleSettingStatus: { isAll: true, types: [] },
      });
    }
    expect(JSON.stringify(result)).not.toContain('tok-page-123');
    const { rows, collection } = result.snapshot;
    expect(rows).toHaveLength(205);
    expect(collection).toEqual({ totalRecords: 205, recordsRead: 205, pagesRead: 3, totalPages: 3, detailsRead: 0, detailsMissing: 0 });
    const byCode = new Map(rows.map((row: { mallProductCode: string }) => [row.mallProductCode, row]));
    expect(byCode.get('132150000')).toEqual({
      mallProductCode: '132150000',
      // 몰이 모든 상품에 붙이는 "(업체별도 무료배송)"은 뗀다.
      productName: '야광 안테나 지시봉 0 (24개)',
      sellpiaName: null,
      sellerCode: null,
      salePrice: 8000,
      statusWords: ['판매중'],
      registeredOn: '2026-08-10',
      // 스킴 없이 오는 사진 주소는 https 로 채운다.
      imageUrl: 'https://shopby-images.cdn-nhncommerce.com/a.jpg',
    });
    expect(byCode.get('132150001')).toMatchObject({ statusWords: ['판매중지'] });
    expect(byCode.get('132150002')).toMatchObject({ statusWords: ['판매금지', '품절'] });
    expect(byCode.get('132150003')).toMatchObject({ statusWords: ['승인거부'] });
    expect(byCode.get('132150004')).toMatchObject({ statusWords: ['품절'], sellerCode: 'INV-10471-1' });
  });

  it('로그인 쿠키가 없거나 401 이면 로그인이 필요하고, 403 · 모르는 상태 · 수 변화는 저장하지 않는다', async () => {
    const noCookie = await run({ products: [product(1)], cookie: 'a=1' });
    expect(noCookie.result).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect(noCookie.requests).toHaveLength(0);
    expect((await run({ products: [product(1)], status: 401 })).result).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect((await run({ products: [product(1)], status: 403 })).result).toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'forbidden' });
    expect((await run({ products: [product(1, { saleSettingStatusType: 'SOMETHING_NEW' })] })).result)
      .toEqual({ success: false, errorCode: 'mall_contract_drift', stage: 'sale_setting' });
    expect((await run({ products: [product(1), product(2)], totalShift: 1 })).result).toEqual({ success: false, errorCode: 'mall_total_changed' });
  });
});
