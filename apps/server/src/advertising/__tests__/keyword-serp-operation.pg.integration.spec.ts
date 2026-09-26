import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  KEYWORD_SERP_CHUNK_KIND,
  KEYWORD_SERP_KIND,
  WING_RANK_KIND,
  type KeywordSerpChunkItem,
  type KeywordSerpItem,
} from '@kiditem/shared/advertising-operations';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { advertisingKeywordOperationsApp, seedCoupangAccount } from '../../test-helpers/advertising-operations';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { CoupangMomentumReadService } from '../application/service/coupang-momentum-read.service';
import { KeywordRankService } from '../application/service/keyword-rank.service';

// 확장 수집기(advertising.keyword_serp)가 밟는 길을 서버에서 그대로: begin → 키워드마다 keyword_serp 청크 → finish.
// 트래커·순위·SERP 스냅샷은 finish 트랜잭션에서만, 실행 ID와 함께 쓰인다(ADR-0025).
describe('advertising.keyword_serp owner over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof advertisingKeywordOperationsApp>>;
  let rank: KeywordRankRepositoryAdapter;
  let account: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    harness = await advertisingKeywordOperationsApp(prisma);
    const channelFacts = channelFactTestPorts(prisma as never);
    rank = new KeywordRankRepositoryAdapter(channelFacts.listings, channelFacts.recipes, prisma as never);
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    account = await seedCoupangAccount(prisma, ORG);
    const listing = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: account, externalId: 'OWN', channelName: '자사 슬라임' },
    });
    await prisma.channelListingOption.create({ data: { organizationId: ORG, listingId: listing.id, externalOptionId: 'OWN' } });
    await prisma.coupangRepresentativeKeywordOverride.create({ data: { organizationId: ORG, vendorItemId: 'OWN', keyword: '슬라임' } });
  });

  const item = (rankValue: number, vendorItemId: string, isAd = false): KeywordSerpItem => ({
    rank: rankValue,
    page: 1,
    positionInPage: rankValue,
    isAd,
    productId: `p-${vendorItemId}`,
    itemId: null,
    vendorItemId,
    name: `${vendorItemId} 상품`,
    priceKrw: 5_000,
    reviewCount: 10,
    ratingScore: 4.5,
    imageUrl: null,
    link: `https://www.coupang.com/vp/products/p-${vendorItemId}?vendorItemId=${vendorItemId}`,
  });
  const chunk = (keyword: string, items: KeywordSerpItem[]): KeywordSerpChunkItem => ({
    keyword, capturedAt: new Date().toISOString(), pagesScanned: 1, stopReason: 'empty_page', items,
  });

  it('plan은 키워드 슬롯만 잠그고 트래커 설정을 고정하며, finish가 트래커·자사/명시 순위·SERP 스냅샷을 실행 ID와 함께 쓴다', async () => {
    await rank.upsertTrackerByKeyword({ keyword: '연필', vendorItemIds: ['TRACKED'], maxPages: 2 }, ORG);
    const run = await harness.beginRun(KEYWORD_SERP_KIND, { keywords: ['슬라임', '연필'] });
    expect(run.operation.lockKeys).toEqual(['resource:keyword:슬라임', 'resource:keyword:연필']);
    expect(run.operation.plan).toMatchObject({
      keywords: [
        { keyword: '슬라임', maxPages: 3, explicitVendorItemIds: [] },
        { keyword: '연필', maxPages: 2, explicitVendorItemIds: ['TRACKED'] },
      ],
      ownItems: [{ vendorItemId: 'OWN' }],
    });
    await harness.put(run, [
      { chunkKind: KEYWORD_SERP_CHUNK_KIND, payload: [chunk('슬라임', [item(1, 'OTHER', true), item(2, 'OWN'), item(3, 'OWN')])] },
      { chunkKind: KEYWORD_SERP_CHUNK_KIND, payload: [chunk('연필', [item(1, 'OTHER')])] },
    ]);
    const done = await harness.finish(run).expect(200);
    expect(done.body.operation).toMatchObject({ status: 'succeeded', lockKeys: [], result: { keywords: 2, items: 4, rankRows: 2 } });

    const rows = await prisma.coupangKeywordRankDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: { vendorItemId: 'asc' } });
    expect(rows.map((row) => [row.keyword, row.vendorItemId, row.overallRank, row.operationId])).toEqual([
      ['슬라임', 'OWN', 2, run.operation.id],
      ['연필', 'TRACKED', null, run.operation.id],
    ]);
    const serp = await prisma.coupangKeywordSerpDailySnapshot.findMany({ where: { organizationId: ORG }, orderBy: { itemCount: 'desc' } });
    expect(serp.map((row) => [row.keyword, row.itemCount, row.operationId, row.sourceImportRunId])).toEqual([
      ['슬라임', 3, run.operation.id, null],
      ['연필', 1, run.operation.id, null],
    ]);
    await expect(prisma.coupangKeywordTracker.count({ where: { organizationId: ORG } })).resolves.toBe(2);
    // 순위 추이·소싱 모멘텀 읽기는 실행이 발행한 행을 본다.
    const history = await new KeywordRankService(rank).getHistory('슬라임', 7, ORG);
    expect(history.series.map((series) => series.vendorItemId)).toEqual(['OWN']);
    const channelFacts = channelFactTestPorts(prisma as never);
    await expect(new CoupangMomentumReadService(new KeywordRankRepositoryAdapter(channelFacts.listings, channelFacts.recipes, prisma as never))
      .readSerpMomentum(ORG, 7)).resolves.toHaveLength(2);
  });

  it('키워드 청크가 빠지면 수집 미완, failed로 끝난 실행은 트래커·순위·SERP 어디에도 쓰지 않는다 — 옛 행은 읽지 않는다', async () => {
    await prisma.coupangKeywordSerpDailySnapshot.create({
      data: { organizationId: ORG, keyword: '슬라임', businessDate: new Date('2026-09-01'), items: { serpItems: [], sellerCatalogs: [] }, capturedAt: new Date() },
    });
    const run = await harness.beginRun(KEYWORD_SERP_KIND, { keywords: ['슬라임', '연필'] });
    await harness.put(run, [{ chunkKind: KEYWORD_SERP_CHUNK_KIND, payload: [chunk('슬라임', [item(1, 'OWN')])] }]);
    expect((await harness.finish(run).expect(409)).body).toMatchObject({ code: 'ADVERTISING_COLLECTION_INCOMPLETE' });
    await harness.finish(run, { outcome: 'failed', errorCode: 'ADVERTISING_COLLECTION_INCOMPLETE' }).expect(200);

    await expect(prisma.coupangKeywordRankDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(prisma.coupangKeywordSerpDailySnapshot.count({ where: { organizationId: ORG, operationId: { not: null } } })).resolves.toBe(0);
    await expect(prisma.coupangKeywordTracker.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(rank.findLatestSerp(ORG, '슬라임')).resolves.toBeNull();
    await expect(prisma.alert.findFirst({ where: { organizationId: ORG, dedupeKey: 'source:coupang_keyword_serp' } }))
      .resolves.toMatchObject({ status: 'OPEN', attemptId: run.operation.id });
  });

  it('보안 화면에서 멈춘 SERP(provider_wall)는 순위권 밖을 증명하지 못해 실행이 실패하고 원장에 아무것도 남지 않는다', async () => {
    const run = await harness.beginRun(KEYWORD_SERP_KIND, { keywords: ['슬라임'] });
    await harness.put(run, [{ chunkKind: KEYWORD_SERP_CHUNK_KIND, payload: [{ ...chunk('슬라임', [item(1, 'OWN')]), stopReason: 'provider_wall' }] }]);
    expect((await harness.finish(run).expect(409)).body).toMatchObject({ code: 'ADVERTISING_COLLECTION_INCOMPLETE', details: { reason: 'serp_capture_incomplete' } });
    await harness.finish(run, { outcome: 'failed', errorCode: 'ADVERTISING_COLLECTION_INCOMPLETE' }).expect(200);
    await expect(prisma.coupangKeywordRankDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
    await expect(prisma.coupangKeywordSerpDailySnapshot.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('같은 키워드의 Wing 순위와 SERP 순위는 한 슬롯이라 나중에 시작한 쪽이 OPERATION_IN_PROGRESS를 받는다', async () => {
    const wing = await harness.beginRun(WING_RANK_KIND, { channelAccountId: account, keywords: ['슬라임'] });
    expect((await harness.begin(KEYWORD_SERP_KIND, { keywords: ['연필', ' 슬라임 '] }).expect(409)).body)
      .toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: wing.operation.id, kind: WING_RANK_KIND } });
    const serp = await harness.beginRun(KEYWORD_SERP_KIND, { keywords: ['연필'] });
    await harness.finish(wing, { outcome: 'failed', errorCode: 'USER_CANCELLED' }).expect(200);
    await harness.finish(serp, { outcome: 'failed', errorCode: 'USER_CANCELLED' }).expect(200);

    const serpFirst = await harness.beginRun(KEYWORD_SERP_KIND, { keywords: ['슬라임'] });
    expect((await harness.begin(WING_RANK_KIND, { channelAccountId: account, keywords: ['슬라임'] }).expect(409)).body)
      .toMatchObject({ code: 'OPERATION_IN_PROGRESS', details: { operationId: serpFirst.operation.id, kind: KEYWORD_SERP_KIND } });
  });
});
