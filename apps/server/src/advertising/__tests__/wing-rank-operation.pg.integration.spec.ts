import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  WING_RANK_CHUNK_KIND,
  WING_RANK_KIND,
  type WingRankChunkItem,
  type WingRankItem,
} from '@kiditem/shared/advertising-operations';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { advertisingKeywordOperationsApp, seedCoupangAccount } from '../../test-helpers/advertising-operations';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { CoupangMomentumReadService } from '../application/service/coupang-momentum-read.service';

// 확장 수집기(advertising.wing_rank)가 밟는 길을 서버에서 그대로: begin → 키워드마다 wing_rank_keyword 청크 → finish.
// 자사 상품 판매순위 행은 finish 트랜잭션에서만, 실행 ID와 함께 쓰인다(ADR-0025).
describe('advertising.wing_rank owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof advertisingKeywordOperationsApp>>;
  let momentum: CoupangMomentumReadService;
  let account: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = await advertisingKeywordOperationsApp(prisma);
    const channelFacts = channelFactTestPorts(prisma as never);
    momentum = new CoupangMomentumReadService(new KeywordRankRepositoryAdapter(channelFacts.listings, channelFacts.recipes, prisma as never));
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    account = await seedCoupangAccount(prisma, ORG);
    await ownProduct('OWN', '슬라임');
    await ownProduct('MISS', '슬라임');
    await ownProduct('PEN', '연필');
  });

  async function ownProduct(vendorItemId: string, keyword: string) {
    const listing = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: account, externalId: vendorItemId, channelName: `${vendorItemId} 상품` },
    });
    await prisma.channelListingOption.create({ data: { organizationId: ORG, listingId: listing.id, externalOptionId: vendorItemId } });
    await prisma.coupangRepresentativeKeywordOverride.create({ data: { organizationId: ORG, vendorItemId, keyword } });
  }

  const item = (vendorItemId: string, salesRank: number): WingRankItem => ({
    productId: `p-${vendorItemId}`,
    itemId: null,
    vendorItemId,
    productName: `${vendorItemId} 상품`,
    categoryHierarchy: '완구>슬라임',
    salesRank,
    salePrice: 5_000,
    ratingCount: 10,
    pvLast28Day: 100,
    salesLast28d: 20,
    estimatedRevenue28d: 100_000,
    conversionRate28d: 0.2,
  });
  const chunk = (keyword: string, items: WingRankItem[]): WingRankChunkItem => ({
    keyword, capturedAt: new Date().toISOString(), pagesScanned: 1, items,
  });

  it('plan은 대표 키워드마다 자사 상품을 대상으로 계정·키워드 슬롯을 잠그고, finish가 그날 판매순위를 실행 ID와 함께 쓴다', async () => {
    const run = await harness.beginRun(WING_RANK_KIND, { channelAccountId: account });
    expect(run.operation.lockKeys).toEqual([`account:${account}`, 'resource:keyword:슬라임', 'resource:keyword:연필']);
    expect(run.operation.plan).toMatchObject({
      channelAccountId: account,
      maxPages: 5,
      keywords: [
        { keyword: '슬라임', targets: [{ vendorItemId: 'MISS' }, { vendorItemId: 'OWN' }] },
        { keyword: '연필', targets: [{ vendorItemId: 'PEN' }] },
      ],
    });
    await harness.put(run, [
      { chunkKind: WING_RANK_CHUNK_KIND, payload: [chunk('슬라임', [item('OTHER', 1), item('OWN', 2)])] },
      { chunkKind: WING_RANK_CHUNK_KIND, payload: [chunk('연필', [])] },
    ]);
    const done = await harness.finish(run).expect(200);
    expect(done.body.operation).toMatchObject({ status: 'succeeded', lockKeys: [], result: { keywords: 2, rows: 3, rankedCount: 1 } });

    const rows = await prisma.coupangWingSalesRankDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: { vendorItemId: 'asc' } });
    expect(rows.map((row) => [row.keyword, row.vendorItemId, row.salesRank, row.operationId, row.sourceImportRunId])).toEqual([
      ['슬라임', 'MISS', null, run.operation.id, null],
      ['슬라임', 'OWN', 2, run.operation.id, null],
      ['연필', 'PEN', null, run.operation.id, null],
    ]);
    // 소싱 모멘텀 capability는 실행이 발행한 행을 본다.
    await expect(momentum.readWingSalesMomentum(ORG, 7)).resolves.toHaveLength(3);
  });

  it('키워드 청크가 빠지면 수집 미완으로 거절되고, failed로 끝난 실행은 원장에 아무것도 남기지 않고 알림을 연다 — 옛 행은 읽지 않는다', async () => {
    await prisma.coupangWingSalesRankDailySnapshot.create({
      data: { organizationId: ORG, keyword: '슬라임', vendorItemId: 'OWN', businessDate: new Date('2026-09-01'), capturedAt: new Date(), salesRank: 1 },
    });
    const run = await harness.beginRun(WING_RANK_KIND, { channelAccountId: account, keywords: ['슬라임', '연필'] });
    await harness.put(run, [{ chunkKind: WING_RANK_CHUNK_KIND, payload: [chunk('슬라임', [item('OWN', 1)])] }]);
    expect((await harness.finish(run).expect(409)).body).toMatchObject({ code: 'ADVERTISING_COLLECTION_INCOMPLETE' });
    await harness.finish(run, { outcome: 'failed', errorCode: 'ADVERTISING_COLLECTION_INCOMPLETE' }).expect(200);

    await expect(prisma.coupangWingSalesRankDailySnapshot.count({ where: { organizationId: ORG, operationId: { not: null } } })).resolves.toBe(0);
    await expect(momentum.readWingSalesMomentum(ORG, 3650)).resolves.toEqual([]);
    await expect(prisma.alert.findFirst({ where: { organizationId: ORG, dedupeKey: 'source:coupang_wing_rank' } }))
      .resolves.toMatchObject({ status: 'OPEN', attemptId: run.operation.id });
  });

  it('키워드를 주면 오늘 이미 본 키워드라도 그 키워드만 돌고, 같은 키워드 슬롯이 잡혀 있으면 다른 계정 실행도 OPERATION_IN_PROGRESS', async () => {
    const first = await harness.beginRun(WING_RANK_KIND, { channelAccountId: account, keywords: ['연필'] });
    expect(first.operation.lockKeys).toEqual([`account:${account}`, 'resource:keyword:연필']);
    const other = await seedCoupangAccount(prisma, ORG);
    expect((await harness.begin(WING_RANK_KIND, { channelAccountId: other, keywords: ['연필'] }).expect(409)).body)
      .toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: first.operation.id } });
    const unrelated = await harness.beginRun(WING_RANK_KIND, { channelAccountId: other, keywords: ['슬라임'] });
    expect(unrelated.operation.lockKeys).toEqual([`account:${other}`, 'resource:keyword:슬라임']);
    expect((await harness.begin(WING_RANK_KIND, { channelAccountId: account, keywords: ['없는 키워드'] }).expect(422)).body)
      .toMatchObject({ code: 'ADVERTISING_RANK_TARGETS_EMPTY' });
  });
});
