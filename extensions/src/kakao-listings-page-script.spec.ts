import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/kakao-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 카카오 톡스토어 등록 상품 목록 처리기(ISOLATED, 옛 `readKakaoListings` 이식, KID-381). 목록 API 를 100개씩 0쪽부터 읽고, 판매상태 ·
// 전시를 몰 글자로 넘긴다. 픽스처는 옛 스위트 그대로다.
const KAKAO = 'https://shopping-seller.kakao.com';
const CONTENTS = Array.from({ length: 120 }, (_, index) => ({
  id: String(793412000 + index),
  name: `상품 ${index}`,
  displayedSaleStatus: index === 1 ? '판매중지' : '판매중',
  displayStatus: index === 2 ? '전시안함' : '전시함',
  salePrice: '4900',
  storeManagementCode: index === 0 ? '1234-1' : '-',
  createdAt: '2026-08-10 10:00:00',
  imageUrl: 'https://st.kakaocdn.net/a.jpg',
}));

async function run(options: { status?: number; landAt?: string } = {}) {
  const pages: number[] = [];
  const read = listingsPageCall(source, 'kakao.listings', {
    location: new URL(`${KAKAO}/product/store-seller/list`),
    fetch: async (url: string) => {
      const parsed = new URL(url, `${KAKAO}/`);
      const page = Number(parsed.searchParams.get('page'));
      const size = Number(parsed.searchParams.get('size'));
      pages.push(page);
      const status = options.status ?? 200;
      const payload = { contents: CONTENTS.slice(page * size, page * size + size), totalCount: CONTENTS.length, last: (page + 1) * size >= CONTENTS.length };
      return { ok: status < 300, status, url: options.landAt ?? parsed.href, json: async () => payload };
    },
  });
  const result = await read({
    sourceType: 'mall_admin_listings',
    parserVersion: 'mall-admin-listings-v1',
    mallKey: 'kakao',
    channelAccountId: '33333333-3333-4333-8333-333333333333',
    sourceOrigin: KAKAO,
    pageSize: 100,
  });
  return { result, pages };
}

describe('kakao listings page script', () => {
  it('목록 API 를 100개씩 0쪽부터 읽고, 판매상태 · 전시를 몰 글자로 넘긴다', async () => {
    const { result, pages } = await run();
    expect(result.success).toBe(true);
    expect(pages).toEqual([0, 1]);
    expect(result.snapshot.rows).toHaveLength(120);
    const byCode = new Map(result.snapshot.rows.map((row: { mallProductCode: string }) => [row.mallProductCode, row]));
    expect(byCode.get('793412000')).toMatchObject({ statusWords: ['판매중', '전시함'], sellerCode: '1234-1' });
    expect(byCode.get('793412001')).toMatchObject({ statusWords: ['판매중지', '전시함'], sellerCode: null });
    expect(byCode.get('793412002')).toMatchObject({ statusWords: ['판매중', '전시안함'] });
  });

  it('카카오 로그인으로 넘어가거나 401 · 403 이면 로그인이 필요하다', async () => {
    expect((await run({ landAt: 'https://accounts.kakao.com/login' })).result).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect((await run({ status: 401 })).result).toEqual({ success: false, errorCode: 'mall_login_required' });
  });
});
