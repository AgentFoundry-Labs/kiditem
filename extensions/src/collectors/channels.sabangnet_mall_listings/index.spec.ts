import { describe, expect, it } from 'vitest';
import { SabangnetMallListingsScanSchema } from '@kiditem/shared/sabangnet-mall-listings';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { sabangnetMallListingsCollector, type SabangnetListItem, type SabangnetListingsSite } from './index';

const PLAN = {
  sourceType: 'sabangnet_mall_listings',
  parserVersion: 'sabangnet-mall-listings-v1',
  sourceOrigin: 'https://sbadmin08.sabangnet.co.kr',
  listPath: '/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists',
  pageSize: 500,
  dateFrom: '20000101',
  dateTo: '20260926',
  malls: [{ mallKey: 'kidsnote', channelAccountId: '11111111-1111-4111-8111-111111111111', sabangnetShopIds: ['shop0472'] }],
};

function item(index: number, overrides: Partial<SabangnetListItem> = {}): SabangnetListItem {
  return {
    shmaId: 'shop0472',
    prdRegsTrnmSrno: 5_010_000_000 + index,
    shmaPrdNo: `KN-${index}`,
    prdNo: '103177',
    prdNm: '할로윈  아트 네일팁',
    prdSplyStsCdNm: '공급중',
    modlNm: '10162-1',
    onsfPrdCd: '8806381806625',
    sepr: '1950',
    prdRegsFstTrnmDt: '20260914 13:47',
    ...overrides,
  };
}

function fakeSabangnet(pages: Array<{ total: number; items: SabangnetListItem[] }>) {
  const asked: number[] = [];
  let closed = 0;
  const site: SabangnetListingsSite = {
    async mallListingPage(query, currentPage) {
      expect(query).toEqual({ listPath: PLAN.listPath, dateFrom: '20000101', dateTo: '20260926', pageSize: 500 });
      asked.push(currentPage);
      const page = pages[currentPage - 1];
      if (!page) throw new Error(`no page ${currentPage}`);
      return page;
    },
    async close() {
      closed += 1;
    },
  };
  return { site, asked, closed: () => closed };
}

async function collectAll(plan: Record<string, unknown>, site: SabangnetListingsSite, reports: Array<Record<string, unknown>> = []) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of sabangnetMallListingsCollector.collect(plan as never, site, {
    signal: new AbortController().signal,
    tabId: null,
    report: async (progress) => {
      reports.push(progress);
    },
  })) chunks.push(chunk);
  return chunks;
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('collectors/channels.sabangnet_mall_listings', () => {
  it('kind 이름으로 등록되고 sabangnet 사이트를 쓴다', () => {
    expect(collectorFor('channels.sabangnet_mall_listings')).toBe(sabangnetMallListingsCollector);
    expect(sabangnetMallListingsCollector.site).toBe('sabangnet');
  });

  it('전체 수로 쪽 수를 정해 끝까지 읽고, 계획의 쇼핑몰 행만 500줄씩 내고, 끝에 읽은 증거 하나를 낸다', async () => {
    const first = [
      ...Array.from({ length: 498 }, (_, index) => item(index)),
      item(900, { shmaId: 'shop0075' }), // 계획에 없는 쇼핑몰(쿠팡) — 세기만 한다
      item(901, { shmaPrdNo: '' }), // 몰 상품코드가 비었다
    ];
    const second = [item(1_000), item(1_001), item(0)]; // 같은 송신번호가 다시 오면 한 번만 센다
    const fake = fakeSabangnet([{ total: 503, items: first }, { total: 503, items: second }]);
    const reports: Array<Record<string, unknown>> = [];
    const chunks = await collectAll(PLAN, fake.site, reports);

    expect(fake.asked).toEqual([1, 2]);
    expect(fake.closed()).toBe(1);
    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length])).toEqual([
      ['listing_rows', 500],
      ['listing_scan', 1],
    ]);
    expect(chunks[0]!.payload[0]).toEqual({
      sendSerial: '5010000000',
      sabangnetShopId: 'shop0472',
      mallProductCode: 'KN-0',
      sabangnetProductNo: '103177',
      modelName: '10162-1',
      ownProductCode: '8806381806625',
      productName: '할로윈 아트 네일팁',
      salePrice: 1950,
      supplyStatus: '공급중',
      firstSentAt: '20260914 13:47',
    });
    const scan = SabangnetMallListingsScanSchema.parse(chunks[1]!.payload[0]);
    expect(scan).toEqual({
      collection: { totalRecords: 503, recordsRead: 502, pagesRead: 2, totalPages: 2, truncated: false, skippedByShop: { shop0075: 1 }, missingMallCode: 1 },
      proof: { dateFrom: '20000101', dateTo: '20260926', pageSize: 500, validatedList: true },
    });
    expect(reports).toEqual([
      { pagesRead: 1, totalPages: 2, rows: 498 },
      { pagesRead: 2, totalPages: 2, rows: 500 },
    ]);
  });

  it('빈 목록도 한 쪽을 읽은 증거를 낸다', async () => {
    const chunks = await collectAll(PLAN, fakeSabangnet([{ total: 0, items: [] }]).site);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['listing_scan']);
  });

  it('읽는 사이 전체 수가 바뀌면 SOURCE_SNAPSHOT_INVALID로 멈추고 탭을 닫는다', async () => {
    const fake = fakeSabangnet([
      { total: 501, items: Array.from({ length: 500 }, (_, index) => item(index)) },
      { total: 502, items: [item(600)] },
    ]);
    const error = await failure(collectAll(PLAN, fake.site));
    expect(error).toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { stage: 'total_changed' } });
    expect(fake.closed()).toBe(1);
  });

  it('마지막이 아닌 쪽이 덜 찼거나 필수 칸이 없으면 MALL_CONTRACT_CHANGED', async () => {
    const short = await failure(collectAll(PLAN, fakeSabangnet([
      { total: 600, items: [item(1)] },
    ]).site));
    expect(short).toMatchObject({ code: 'MALL_CONTRACT_CHANGED', details: { stage: 'page_size' } });

    const nameless = await failure(collectAll(PLAN, fakeSabangnet([{ total: 1, items: [item(1, { prdNm: null })] }]).site));
    expect(nameless).toMatchObject({ code: 'MALL_CONTRACT_CHANGED', details: { stage: 'product_name' } });
  });

  it('plan이 틀리면 읽지 않고 RUNTIME_PLAN_INVALID', async () => {
    const fake = fakeSabangnet([{ total: 0, items: [] }]);
    const error = await failure(collectAll({ ...PLAN, pageSize: 100 }, fake.site));
    expect(error.code).toBe('RUNTIME_PLAN_INVALID');
    expect(fake.asked).toEqual([]);
  });
});
