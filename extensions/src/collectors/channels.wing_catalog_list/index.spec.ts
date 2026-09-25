import { describe, expect, it } from 'vitest';
import type { CoupangCatalogBasicProductV1 } from '@kiditem/shared/coupang-catalog-snapshot';
import { collectorFor } from '../index';
import { RuntimeError } from '../../core/errors';
import { wingCatalogListCollector, type WingCatalogListSite } from './index';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function basic(id: string, padding = 0): CoupangCatalogBasicProductV1 {
  return {
    externalProductId: id, registeredName: id, displayName: id, category: null, manufacturer: null, brand: null,
    productStatus: 'ON_SALE', media: [], raw: { modifiedOn: '2026-09-01', padding: 'x'.repeat(padding) },
    options: [{ externalOptionId: `${id}-O`, optionName: null, skuStatus: null, salePrice: null, sellerSku: null, modelNumber: null, barcode: null, attributes: [], media: [], raw: {} }],
  };
}

/** 가짜 Wing: 페이지마다 정해 둔 상품과 전체 수를 돌려준다. */
function fakeWing(pages: Array<{ totalItems: number; totalPages: number; products: CoupangCatalogBasicProductV1[] }>) {
  const calls: Array<{ page: number; vendorId: string | null }> = [];
  const site: WingCatalogListSite = {
    async searchInventory(page, vendorId) {
      calls.push({ page, vendorId });
      const found = pages[page - 1];
      if (!found) throw new Error(`no page ${page}`);
      return { page, pageSize: 500, ...found };
    },
  };
  return { site, calls };
}

async function collect(site: WingCatalogListSite, plan: Record<string, unknown> = { channelAccountId: ACCOUNT, startedBy: null, vendorId: 'A1' }) {
  const chunks = [];
  for await (const chunk of wingCatalogListCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: 1 })) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('collectors/channels.wing_catalog_list', () => {
  it('kind 이름으로 등록되고 wing 사이트를 쓴다', () => {
    expect(collectorFor('channels.wing_catalog_list')).toBe(wingCatalogListCollector);
    expect(wingCatalogListCollector.site).toBe('wing');
  });

  it('목록 전체 페이지를 순서대로 받아 listing_basics를 20개씩 내고, 계정의 판매자 ID로 거른다', async () => {
    const page1 = Array.from({ length: 500 }, (_, index) => basic(`P${index}`));
    const page2 = Array.from({ length: 25 }, (_, index) => basic(`Q${index}`));
    const wing = fakeWing([
      { totalItems: 525, totalPages: 2, products: page1 },
      { totalItems: 525, totalPages: 2, products: page2 },
    ]);
    const chunks = await collect(wing.site);
    expect(wing.calls).toEqual([{ page: 1, vendorId: 'A1' }, { page: 2, vendorId: 'A1' }]);
    expect(chunks.every((chunk) => chunk.chunkKind === 'listing_basics')).toBe(true);
    expect(chunks.map((chunk) => chunk.payload.length)).toEqual([...Array(25).fill(20), 20, 5]);
    expect(chunks.flatMap((chunk) => chunk.payload.map((item) => (item as CoupangCatalogBasicProductV1).externalProductId)))
      .toEqual([...page1, ...page2].map((product) => product.externalProductId));
    expect(chunks.at(-1)?.progress).toEqual({ listedProducts: 525, totalProducts: 525, page: 2, totalPages: 2 });
  });

  it('청크 하나는 1MiB를 넘지 않게 20개보다 적게도 자른다', async () => {
    const products = Array.from({ length: 6 }, (_, index) => basic(`B${index}`, 300_000));
    const chunks = await collect(fakeWing([{ totalItems: 6, totalPages: 1, products }]).site);
    expect(chunks.map((chunk) => chunk.payload.length)).toEqual([3, 3]);
    for (const chunk of chunks) expect(new TextEncoder().encode(JSON.stringify(chunk.payload)).byteLength).toBeLessThanOrEqual(1024 * 1024);
  });

  it('빈 목록은 청크 없이 끝난다(서버가 사라진 상품을 계획한다)', async () => {
    expect(await collect(fakeWing([{ totalItems: 0, totalPages: 0, products: [] }]).site)).toEqual([]);
  });

  it.each([
    ['전체 수가 페이지 사이에 바뀜', [
      { totalItems: 501, totalPages: 2, products: Array.from({ length: 500 }, (_, index) => basic(`P${index}`)) },
      { totalItems: 502, totalPages: 2, products: [basic('X')] },
    ]],
    ['페이지를 가로질러 같은 상품', [
      { totalItems: 501, totalPages: 2, products: Array.from({ length: 500 }, (_, index) => basic(`P${index}`)) },
      { totalItems: 501, totalPages: 2, products: [basic('P0')] },
    ]],
    ['받은 수가 전체 수와 다름', [
      { totalItems: 3, totalPages: 1, products: [basic('A'), basic('B')] },
    ]],
  ])('pagination과 맞지 않으면 CATALOG_LIST_INCOMPLETE로 실패한다 — %s', async (_label, pages) => {
    const error = await collect(fakeWing(pages).site).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(RuntimeError);
    expect((error as RuntimeError).code).toBe('CATALOG_LIST_INCOMPLETE');
  });
});
