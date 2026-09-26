import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/always-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 올웨이즈 등록 상품 목록 처리기(ISOLATED, 옛 `mall-admin-listings.js` `readAlwayzListings` 이식, KID-381). 판매자센터 화면 안에서
// 백엔드 목록 API 를 쪽마다 읽는다(라이브 2026-09-19: 197개 = 100 + 97). 픽스처는 옛 스위트 그대로다.
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'always',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: 'https://alwayzseller.ilevit.com',
  pageSize: 100,
};

function item(index: number, overrides: Record<string, unknown> = {}) {
  return {
    _id: `668b81adc75f21b22efa${index.toString(16).padStart(4, '0')}`,
    itemTitle: `[키드아이템] 상품 ${index}`,
    soldOut: index % 3 === 0,
    teamPurchasePrice: 8500,
    createdAt: '2024-07-08T16:05:33.157Z',
    mainImageUris: ['https://alwayz-product-images.ilevit.com/a.jpg'],
    manualItemCode: null,
    ...overrides,
  };
}

async function run({ items, token = 'eyJ-page-token', totalShift = 0 }: { items: unknown[]; token?: string | null; totalShift?: number }) {
  const requests: Array<{ path: string; body: Record<string, number>; token: string }> = [];
  const read = listingsPageCall(source, 'always.listings', {
    localStorage: { getItem: (key: string) => (key === '@alwayz@seller@token@' ? token : null) },
    fetch: async (url: string, init: { body: string; headers: Record<string, string> }) => {
      const parsed = new URL(url);
      const body = JSON.parse(init.body);
      requests.push({ path: parsed.pathname, body, token: init.headers['x-access-token']! });
      if (parsed.pathname === '/sellers/items/v2/count-request') {
        return { ok: true, status: 200, json: async () => ({ status: 200, data: items.length + totalShift }) };
      }
      const start = (body.page - 1) * body.pageLimit;
      return { ok: true, status: 200, json: async () => ({ status: 2000, data: { itemsInfo: items.slice(start, start + body.pageLimit) } }) };
    },
  });
  return { result: await read(PLAN), requests };
}

describe('always listings page script', () => {
  it('전체 수를 읽고 1쪽부터 100개씩 다 돌며, 품절 여부를 상태로, 고른 칸만 넘긴다(토큰은 요청 머리에만)', async () => {
    const { result, requests } = await run({ items: Array.from({ length: 197 }, (_, index) => item(index)) });
    expect(result.success).toBe(true);
    expect(requests.map((request) => [request.path, request.body.page ?? null])).toEqual([
      ['/sellers/items/v2/count-request', null],
      ['/sellers/items/v2/list-request', 1],
      ['/sellers/items/v2/list-request', 2],
    ]);
    expect(requests.every((request) => request.token === 'eyJ-page-token')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('eyJ-page-token');
    const { rows, collection } = result.snapshot;
    expect(rows).toHaveLength(197);
    expect(collection).toEqual({ totalRecords: 197, recordsRead: 197, pagesRead: 2, totalPages: 2, detailsRead: 0, detailsMissing: 0 });
    const first = rows.find((row: { productName: string }) => row.productName === '[키드아이템] 상품 0');
    expect(first).toEqual({
      mallProductCode: first.mallProductCode,
      productName: '[키드아이템] 상품 0',
      sellpiaName: null,
      sellerCode: null,
      salePrice: 8500,
      statusWords: ['품절'],
      registeredOn: '2024-07-09',
      imageUrl: 'https://alwayz-product-images.ilevit.com/a.jpg',
    });
    expect(rows.find((row: { productName: string }) => row.productName === '[키드아이템] 상품 1').statusWords).toEqual(['판매중']);
  });

  it('토큰이 없으면 요청 없이 로그인이 필요하다고 답하고, 읽는 사이 수가 바뀌면 저장하지 않는다', async () => {
    const noToken = await run({ items: [item(1)], token: null });
    expect(noToken.result).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect(noToken.requests).toHaveLength(0);
    expect((await run({ items: [item(1), item(2)], totalShift: 1 })).result).toEqual({ success: false, errorCode: 'mall_total_changed' });
  });
});
