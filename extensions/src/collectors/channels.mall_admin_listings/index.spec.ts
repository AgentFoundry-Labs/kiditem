import { describe, expect, it } from 'vitest';
import { MallAdminListingsScanSchema } from '@kiditem/shared/mall-admin-listings';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { mallAdminListingsCollector, type MallAdminListingsSite, type MallListingsReader } from './index';

const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const PLAN = {
  sourceType: 'mall_admin_listings',
  parserVersion: 'mall-admin-listings-v1',
  mallKey: 'kidkids',
  channelAccountId: ACCOUNT,
  sourceOrigin: 'https://partner.kidkids.net',
  pageSize: 20000,
};
const row = (index: number) => ({
  mallProductCode: String(1_000_000 + index),
  productName: `[키드아이템] 상품 ${index} 1p`,
  sellpiaName: `${index}000상품`,
  sellerCode: null,
  salePrice: 1900,
  statusWords: ['정상'],
  registeredOn: null,
});
const snapshot = (rows: unknown[]) => ({
  collection: { totalRecords: rows.length, recordsRead: rows.length, pagesRead: 1, totalPages: 1, detailsRead: 0, detailsMissing: 0 },
  rows,
  proof: { mallKey: 'kidkids', pageSize: 20000, validatedList: true },
});

function fakeRouter(readers: Record<string, MallListingsReader>) {
  const asked: string[] = [];
  const site: MallAdminListingsSite = {
    reader(mallKey) {
      asked.push(mallKey);
      return readers[mallKey] ?? null;
    },
  };
  return { site, asked };
}

async function collectAll(plan: Record<string, unknown>, site: MallAdminListingsSite) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of mallAdminListingsCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
  return chunks;
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('collectors/channels.mall_admin_listings', () => {
  it('kind 이름으로 등록되고 몰 관리자 목록 라우터를 쓴다', () => {
    expect(collectorFor('channels.mall_admin_listings')).toBe(mallAdminListingsCollector);
    expect(mallAdminListingsCollector.site).toBe('mall-admin-listings');
  });

  it('plan의 몰 사이트로 목록 전체를 읽어 1,000줄씩 listing_rows로, 끝에 읽은 증거 하나를 낸다', async () => {
    const plans: unknown[] = [];
    const rows = Array.from({ length: 1_001 }, (_, index) => row(index));
    const router = fakeRouter({ kidkids: { async readListings(plan) { plans.push(plan); return snapshot(rows); } } });
    const chunks = await collectAll(PLAN, router.site);

    expect(router.asked).toEqual(['kidkids']);
    expect(plans).toEqual([PLAN]);
    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length])).toEqual([
      ['listing_rows', 1_000],
      ['listing_rows', 1],
      ['listing_scan', 1],
    ]);
    expect(MallAdminListingsScanSchema.parse(chunks.at(-1)!.payload[0])).toEqual({
      collection: snapshot(rows).collection,
      proof: snapshot(rows).proof,
    });
  });

  it('모양이 틀린 줄이 있으면 올리지 않고 SOURCE_SNAPSHOT_INVALID로 멈춘다', async () => {
    const router = fakeRouter({ kidkids: { async readListings() { return snapshot([row(1), { ...row(2), password: 'x' }]); } } });
    const error = await failure(collectAll(PLAN, router.site));
    expect(error).toMatchObject({ code: 'SOURCE_SNAPSHOT_INVALID', details: { stage: 'row', index: 1 } });
  });

  it('라우터가 모르는 몰(옮기지 않은 몰)이나 틀린 plan은 읽지 않고 RUNTIME_PLAN_INVALID', async () => {
    const router = fakeRouter({});
    expect((await failure(collectAll({ ...PLAN, mallKey: 'onch', sourceOrigin: 'https://www.onch3.co.kr', pageSize: 15 }, router.site))).code).toBe('RUNTIME_PLAN_INVALID');
    expect((await failure(collectAll({ ...PLAN, pageSize: 1 }, router.site))).code).toBe('RUNTIME_PLAN_INVALID');
  });
});
