import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/orders/11st-listings.js?raw';
import { listingsPageCall } from './sites/listings-page-script.fake';

// 11번가 셀러오피스 등록 상품 목록 처리기(ISOLATED, 옛 `read11stListings` 이식, KID-381). 전체 수를 주지 않는 목록을 한 쪽이 덜 찰
// 때까지 읽는다. 픽스처는 옛 스위트 그대로다.
const ST11 = 'https://soffice.11st.co.kr';
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: '11st',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
  sourceOrigin: ST11,
  pageSize: 100,
};
const CODES: Record<number, string> = { 0: '103', 1: '105', 2: '108', 3: '104' };
const ITEMS = Array.from({ length: 150 }, (_, index) => ({
  prdNo: String(3352000000 + index),
  prdNm: `상품 ${index}`,
  selStatCd: CODES[index] ?? '103',
  selPrc: 5000,
  createDt: '2026/08/10',
  sellerPrdCd: index === 0 ? '8801234567890' : null,
}));

async function run(options: { landAt?: string; body?: string } = {}) {
  const starts: Array<[number, number, string | null]> = [];
  const read = listingsPageCall(source, '11st.listings', {
    location: new URL(`${ST11}/view/8006`),
    fetch: async (url: string) => {
      const parsed = new URL(url, `${ST11}/`);
      const start = Number(parsed.searchParams.get('start'));
      const limit = Number(parsed.searchParams.get('limit'));
      starts.push([start, limit, parsed.searchParams.get('prdNo')]);
      // TOTAL_COUNT 는 "한 쪽 + 1" 이다 — 믿지 않는다.
      const payload = { TOTAL_COUNT: String(limit + 1), DATA_LIST: ITEMS.slice(start, start + limit) };
      return { ok: true, status: 200, url: options.landAt ?? parsed.href, text: async () => options.body ?? `(${JSON.stringify(payload)})` };
    },
  });
  return { result: await read(PLAN), starts };
}

describe('11st listings page script', () => {
  it('전체 수를 주지 않는 목록을 한 쪽이 덜 찰 때까지 읽고, 판매상태 코드를 화면 글자로 넘긴다', async () => {
    const { result, starts } = await run();
    expect(result.success).toBe(true);
    expect(starts).toEqual([[0, 100, ''], [100, 100, '']]);
    const byCode = new Map(result.snapshot.rows.map((row: { mallProductCode: string }) => [row.mallProductCode, row]));
    expect(byCode.get('3352000000')).toMatchObject({ statusWords: ['판매중'], sellerCode: '8801234567890' });
    expect(byCode.get('3352000001')).toMatchObject({ statusWords: ['판매중지'], registeredOn: '2026-08-10' });
    expect(byCode.get('3352000002')).toMatchObject({ statusWords: ['판매금지'] });
    expect(byCode.get('3352000003')).toMatchObject({ statusWords: ['품절'] });
    expect(result.snapshot.collection).toEqual({ totalRecords: 150, recordsRead: 150, pagesRead: 2, totalPages: 2, detailsRead: 0, detailsMissing: 0 });
  });

  it('로그인 화면으로 넘어가거나 로그인 안내가 오면 로그인이 필요하다', async () => {
    expect((await run({ landAt: 'https://login.11st.co.kr/auth/front/selleroffice/login.tmall' })).result).toEqual({ success: false, errorCode: 'mall_login_required' });
    expect((await run({ body: '<html>로그인이 필요합니다</html>' })).result).toEqual({ success: false, errorCode: 'mall_login_required' });
  });
});
