import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED, type SiteCaller } from '../../core/site-caller';
import {
  WING_SEARCH_PAYLOAD_INVALID,
  createWingCatalogSearchSite,
  createWingPreMatchingSearch,
  normalizeWingSearchProduct,
  parseWingSearchPage,
  toSourcingWingCatalogObservation,
} from './pre-matching-search';

// 녹화한 Wing pre-matching 검색 응답 한 쪽의 모양(값은 줄였다).
const RECORDED = {
  result: [
    {
      productId: 7051234567, itemId: 18000000001, vendorItemId: 85000000001, productName: '아동 필통 대용량',
      itemName: '블루', brandName: '키드', manufacture: '키드', imagePath: 'vendor_inventory/abc.jpg',
      displayCategoryInfo: [{ categoryHierarchy: '문구>필통' }], salePrice: '12900', rating: 4.7, ratingCount: '1203',
      pvLast28Day: 5000, salesLast28d: 250, deliveryInfo: 'ROCKET',
    },
    { productId: null, productName: '식별자 없음' },
  ],
  nextSearchPage: 1,
};

describe('Wing pre-matching search site (KID-360)', () => {
  it('normalizes a recorded page into rows with derived 28-day revenue and conversion', () => {
    const page = parseWingSearchPage(RECORDED);
    expect(page.nextSearchPage).toBe(1);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      productId: '7051234567', itemId: '18000000001', vendorItemId: '85000000001', categoryHierarchy: '문구>필통',
      salePrice: 12_900, ratingCount: 1_203, estimatedRevenue28d: 3_225_000, conversionRate28d: 0.05,
    });
  });

  it('refuses a response without a result array (the page shape changed)', () => {
    expect(() => parseWingSearchPage({ message: 'login' })).toThrow(expect.objectContaining({ code: WING_SEARCH_PAYLOAD_INVALID }));
  });

  it('bounds observation numbers like the old worker boundary (rating 0..5, conversion 0..1, integers only)', () => {
    const row = normalizeWingSearchProduct({ productId: 1, productName: 'x', salePrice: 12.5, rating: 9, pvLast28Day: 1, salesLast28d: 3 })!;
    const observation = toSourcingWingCatalogObservation(row, '필통', '2026-09-25T00:00:00.000Z');
    expect(observation).toMatchObject({ salePriceKrw: null, ratingAverage: null, conversionRate28d: null, sourceKeyword: '필통' });
  });

  it('asks again on 429 with the old backoff and gives up after four attempts', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const caller: SiteCaller = {
      async json() {
        calls += 1;
        throw new RuntimeError(SITE_REQUEST_FAILED, '429', { status: 429 });
      },
      text: async () => '',
      bytes: async () => new Uint8Array(),
    };
    const search = createWingPreMatchingSearch(caller, { sleep: async (ms) => { sleeps.push(ms); } });
    await expect(search.searchPage('필통', 0)).rejects.toThrow('429');
    expect(calls).toBe(4);
    expect(sleeps).toEqual([4_000, 8_000, 16_000]);
  });

  it('posts the keyword and page and drops rows without a product name from the observations', async () => {
    const bodies: unknown[] = [];
    const caller: SiteCaller = {
      async json<T>(_url: string, init?: RequestInit) {
        bodies.push(JSON.parse(String(init?.body)));
        return { result: [{ productId: 1, productName: '' }, { productId: 2, productName: '필통' }], nextSearchPage: null } as T;
      },
      text: async () => '',
      bytes: async () => new Uint8Array(),
    };
    const site = createWingCatalogSearchSite(caller, { sleep: async () => undefined });
    const page = await site.searchPage('필통', 3);
    expect(bodies).toEqual([{ keyword: '필통', excludedProductIds: [], searchPage: 3, searchOrder: 'DEFAULT', sortType: 'DEFAULT' }]);
    expect(page.rows.map((row) => site.toObservation(row, '필통', '2026-09-25T00:00:00.000Z')?.productId ?? null)).toEqual([null, '2']);
  });
});
