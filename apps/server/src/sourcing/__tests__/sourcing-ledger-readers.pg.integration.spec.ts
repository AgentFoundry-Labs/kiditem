import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import {
  readCompleteObservationProvenanceByIds,
  readCurrentObservationHeads,
} from '../adapter/out/repository/source-evidence.reader';
import { readCurrentCompleteRuns } from '../adapter/out/repository/source-evidence.reader';
import { LiveCommerceRepositoryAdapter } from '../adapter/out/repository/live-commerce.repository.adapter';
import { TrendCollectionRepositoryAdapter } from '../adapter/out/repository/trend-collection.repository.adapter';
import { SourcingLaunchCandidateRepositoryAdapter } from '../adapter/out/repository/sourcing-launch-candidate.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';

const SOURCE_WINDOW_START = new Date('2026-09-10T00:00:00.000Z');
const SOURCE_WINDOW_END = new Date('2026-09-11T00:00:00.000Z');

describe('Sourcing ledger readers (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let tx: Prisma.TransactionClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    tx = prisma as unknown as Prisma.TransactionClient;
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('distinguishes a completed empty declared window from a source that never ran', async () => {
    await expect(readCurrentCompleteRuns(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
      targetKey: 'keyword:empty',
    })).resolves.toEqual([]);

    const run = await seedRun(prisma, {
      sourceKey: '1688.hot_product',
      targetKey: 'keyword:empty',
      coverageNumerator: 1,
      coverageDenominator: 1,
      acceptedCount: 0,
    });

    await expect(readCurrentCompleteRuns(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
      targetKey: 'keyword:empty',
    })).resolves.toEqual([
      expect.objectContaining({
        id: run.id,
        sourceWindowStartAt: SOURCE_WINDOW_START,
        sourceWindowEndAt: SOURCE_WINDOW_END,
        coverageNumerator: 1,
        coverageDenominator: 1,
        acceptedCount: 0,
      }),
    ]);
  });

  it('does not let fact rows replace missing or out-of-range owner coverage dates', async () => {
    const naverRun = await seedRun(prisma, {
      sourceKey: 'naver.trend',
      targetKey: 'missing-naver-window',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: naverRun.id },
      data: {
        attemptPlan: {
          source: 'naver.trend',
          businessDate: '2026-09-10',
          keywords: ['pencil'],
          boardKeys: ['stationery'],
        },
        sourceWindowStartAt: null,
      },
    });
    await prisma.naverKeywordDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: naverRun.id,
        keyword: 'pencil',
        businessDate: SOURCE_WINDOW_START,
        capturedAt: SOURCE_WINDOW_END,
      },
    });
    await prisma.naverPopularKeywordDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: naverRun.id,
        boardKey: 'stationery',
        businessDate: SOURCE_WINDOW_START,
        rank: 1,
        keyword: 'pencil case',
        capturedAt: SOURCE_WINDOW_END,
      },
    });

    const shortsRun = await seedRun(prisma, {
      sourceKey: 'shortstrend.trend',
      targetKey: 'missing-shorts-window',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: shortsRun.id },
      data: {
        attemptPlan: {
          source: 'shortstrend.trend',
          businessDate: '2026-09-10',
          keywords: ['pencil'],
        },
        sourceWindowStartAt: null,
      },
    });
    await prisma.shortsTrendDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: shortsRun.id,
        businessDate: SOURCE_WINDOW_START,
        videoKey: 'missing-window-video',
        capturedAt: SOURCE_WINDOW_END,
      },
    });

    const offerRun = await seedRun(prisma, {
      sourceKey: '1688.hot_product',
      targetKey: 'missing-offer-window',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: offerRun.id },
      data: {
        attemptPlan: { source: '1688.hot_product', keywords: ['pencil'] },
        sourceWindowEndAt: null,
      },
    });
    const offerEvidence = await seedObservation(prisma, offerRun.id, {
      observationKey: sha256('missing-window-offer'),
      revision: 1,
    });
    await prisma.sourcing1688OfferKeywordObservation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: offerRun.id,
        evidenceObservationId: offerEvidence.id,
        businessDate: SOURCE_WINDOW_START,
        sourceKeywordNormalized: 'pencil',
        externalOfferId: 'missing-window-offer',
        capturedAt: SOURCE_WINDOW_END,
      },
    });

    const tiktokRun = await seedRun(prisma, {
      sourceKey: 'tiktok.creative',
      targetKey: 'all',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: tiktokRun.id },
      data: {
        attemptPlan: { source: 'tiktok.creative', targetSeeds: [] },
        sourceWindowEndAt: null,
      },
    });
    await prisma.tiktokCreativeTrendDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: tiktokRun.id,
        businessDate: SOURCE_WINDOW_START,
        region: 'KR',
        trendType: 'hashtag',
        entityKey: 'missing-window-hashtag',
        capturedAt: SOURCE_WINDOW_END,
      },
    });

    const liveRun = await seedRun(prisma, {
      sourceKey: 'douyin.live_commerce',
      targetKey: 'missing-live-window',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: liveRun.id },
      data: {
        attemptPlan: { source: 'douyin', pageUrl: 'https://live.douyin.com/1' },
        sourceWindowEndAt: null,
      },
    });
    await prisma.liveCommerceBroadcastDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: liveRun.id,
        businessDate: SOURCE_WINDOW_START,
        source: 'douyin',
        broadcastId: 'missing-window-broadcast',
        capturedAt: SOURCE_WINDOW_END,
      },
    });
    await prisma.liveCommerceProductDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: liveRun.id,
        businessDate: SOURCE_WINDOW_START,
        source: 'douyin',
        broadcastId: 'missing-window-broadcast',
        productId: 'missing-window-product',
        capturedAt: SOURCE_WINDOW_END,
      },
    });

    const outOfRangeLiveRun = await seedRun(prisma, {
      sourceKey: 'douyin.live_commerce',
      targetKey: 'old-live-window',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: outOfRangeLiveRun.id },
      data: {
        attemptPlan: { source: 'douyin', pageUrl: 'https://live.douyin.com/old' },
        sourceWindowStartAt: null,
        sourceWindowEndAt: new Date('2024-01-01T01:00:00.000Z'),
      },
    });
    await prisma.liveCommerceProductDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: outOfRangeLiveRun.id,
        businessDate: SOURCE_WINDOW_START,
        source: 'douyin',
        broadcastId: 'old-window-broadcast',
        productId: 'current-row-under-old-window',
        capturedAt: SOURCE_WINDOW_END,
      },
    });

    const trends = new TrendCollectionRepositoryAdapter(prisma as unknown as PrismaService);
    await expect(trends.findNaverKeywordHistory({
      organizationId: TEST_ORGANIZATION_ID,
      days: 365,
    })).resolves.toEqual([]);
    await expect(trends.findPopularKeywordHistory({
      organizationId: TEST_ORGANIZATION_ID,
      days: 365,
    })).resolves.toEqual({ coverage: [], rows: [] });
    await expect(trends.findShortsHistory({
      organizationId: TEST_ORGANIZATION_ID,
      days: 365,
    })).resolves.toEqual([]);
    await expect(trends.find1688HotHistory({
      organizationId: TEST_ORGANIZATION_ID,
      days: 365,
    })).resolves.toEqual([]);
    await expect(trends.findTiktokCcHistory({
      organizationId: TEST_ORGANIZATION_ID,
      days: 365,
    })).resolves.toEqual([]);

    const live = new LiveCommerceRepositoryAdapter(prisma as unknown as PrismaService);
    await expect(live.findBroadcastSnapshots({
      organizationId: TEST_ORGANIZATION_ID,
      source: 'douyin',
      days: 365,
    })).resolves.toEqual([]);
    await expect(live.findProductSnapshots({
      organizationId: TEST_ORGANIZATION_ID,
      source: 'douyin',
      days: 365,
    })).resolves.toEqual([]);
  });

  it('does not let an inverted declared window publish live-commerce facts', async () => {
    const run = await seedRun(prisma, {
      sourceKey: '1688.live_commerce',
      targetKey: 'inverted-live-window',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: run.id },
      data: {
        attemptPlan: { source: '1688', pageUrl: 'https://zb.1688.com/1' },
        sourceWindowStartAt: SOURCE_WINDOW_END,
        sourceWindowEndAt: SOURCE_WINDOW_START,
      },
    });
    await prisma.liveCommerceProductDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: run.id,
        businessDate: SOURCE_WINDOW_START,
        source: '1688',
        broadcastId: 'inverted-window-broadcast',
        productId: 'inverted-window-product',
        capturedAt: SOURCE_WINDOW_END,
      },
    });

    const repository = new LiveCommerceRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    await expect(repository.findProductSnapshots({
      organizationId: TEST_ORGANIZATION_ID,
      source: '1688',
      days: 365,
    })).resolves.toEqual([]);
  });

  it('limits daily facts to the owner-declared date and frozen plan dimensions', async () => {
    const capturedAt = new Date('2026-09-10T01:00:00.000Z');
    const outsideDate = new Date('2026-09-11T00:00:00.000Z');
    const naverRun = await seedRun(prisma, {
      sourceKey: 'naver.trend',
      targetKey: 'declared-naver-scope',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: naverRun.id },
      data: {
        attemptPlan: {
          source: 'naver.trend',
          businessDate: '2026-09-10',
          keywords: ['planned-keyword'],
          boardKeys: ['planned-board'],
        },
        sourceWindowEndAt: capturedAt,
      },
    });
    await prisma.naverKeywordDailySnapshot.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: naverRun.id,
          keyword: 'planned-keyword',
          businessDate: SOURCE_WINDOW_START,
          capturedAt,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: naverRun.id,
          keyword: 'planned-keyword',
          businessDate: outsideDate,
          capturedAt,
        },
      ],
    });
    await prisma.naverPopularKeywordDailySnapshot.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: naverRun.id,
          boardKey: 'planned-board',
          businessDate: SOURCE_WINDOW_START,
          rank: 1,
          keyword: 'planned-board-row',
          capturedAt,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: naverRun.id,
          boardKey: 'unplanned-board',
          businessDate: SOURCE_WINDOW_START,
          rank: 1,
          keyword: 'unplanned-board-row',
          capturedAt,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: naverRun.id,
          boardKey: 'planned-board',
          businessDate: outsideDate,
          rank: 2,
          keyword: 'outside-date-board-row',
          capturedAt,
        },
      ],
    });

    const boardlessRun = await seedRun(prisma, {
      sourceKey: 'naver.trend',
      targetKey: 'missing-board-plan',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: boardlessRun.id },
      data: {
        attemptPlan: {
          source: 'naver.trend',
          businessDate: '2026-09-10',
          keywords: [],
        },
        sourceWindowEndAt: capturedAt,
      },
    });
    await prisma.naverPopularKeywordDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: boardlessRun.id,
        boardKey: 'row-only-board',
        businessDate: SOURCE_WINDOW_START,
        rank: 1,
        keyword: 'row-only-board-row',
        capturedAt,
      },
    });

    const priorOfferRun = await seedRun(prisma, {
      sourceKey: '1688.hot_product',
      targetKey: 'declared-offer-scope',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: priorOfferRun.id },
      data: {
        attemptPlan: { source: '1688.hot_product', keywords: ['prior-offer-keyword'] },
        sourceWindowStartAt: null,
        sourceWindowEndAt: capturedAt,
        isCurrentComplete: false,
      },
    });
    const priorOfferEvidence = await seedObservation(prisma, priorOfferRun.id, {
      observationKey: sha256('prior-offer'),
      revision: 1,
    });
    await prisma.sourcing1688OfferKeywordObservation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ingestionRunId: priorOfferRun.id,
        evidenceObservationId: priorOfferEvidence.id,
        businessDate: SOURCE_WINDOW_START,
        sourceKeywordNormalized: 'prior-offer-keyword',
        externalOfferId: 'prior-offer',
        capturedAt,
      },
    });

    const offerRun = await seedRun(prisma, {
      sourceKey: '1688.hot_product',
      targetKey: 'declared-offer-scope',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: offerRun.id },
      data: {
        attemptPlan: { source: '1688.hot_product', keywords: ['planned-offer-keyword'] },
        sourceWindowStartAt: null,
        sourceWindowEndAt: capturedAt,
      },
    });
    const plannedOfferEvidence = await seedObservation(prisma, offerRun.id, {
      observationKey: sha256('planned-offer'),
      revision: 1,
    });
    const unplannedOfferEvidence = await seedObservation(prisma, offerRun.id, {
      observationKey: sha256('unplanned-offer'),
      revision: 1,
    });
    await prisma.sourcing1688OfferKeywordObservation.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: offerRun.id,
          evidenceObservationId: plannedOfferEvidence.id,
          businessDate: SOURCE_WINDOW_START,
          sourceKeywordNormalized: 'planned-offer-keyword',
          externalOfferId: 'planned-offer',
          capturedAt,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: offerRun.id,
          evidenceObservationId: unplannedOfferEvidence.id,
          businessDate: SOURCE_WINDOW_START,
          sourceKeywordNormalized: 'unplanned-offer-keyword',
          externalOfferId: 'unplanned-offer',
          capturedAt,
        },
      ],
    });

    const repository = new TrendCollectionRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    await expect(repository.findNaverKeywordHistory({
      organizationId: TEST_ORGANIZATION_ID,
      days: 365,
    })).resolves.toEqual([
      expect.objectContaining({ keyword: 'planned-keyword', businessDate: SOURCE_WINDOW_START }),
    ]);
    await expect(repository.findPopularKeywordHistory({
      organizationId: TEST_ORGANIZATION_ID,
      days: 365,
    })).resolves.toEqual({
      coverage: [{ boardKey: 'planned-board', businessDate: SOURCE_WINDOW_START }],
      rows: [expect.objectContaining({
        boardKey: 'planned-board',
        businessDate: SOURCE_WINDOW_START,
      })],
    });
    const offers = await repository.find1688HotHistory({
      organizationId: TEST_ORGANIZATION_ID,
      days: 365,
    });
    expect(offers.map((row) => [row.offerId, row.sourceKeyword]).sort()).toEqual([
      ['planned-offer', 'planned-offer-keyword'],
      ['prior-offer', 'prior-offer-keyword'],
    ]);
  });

  it('returns only the current complete run and current observation revision while preserving exact provenance', async () => {
    const oldRun = await seedRun(prisma, {
      sourceKey: '1688.hot_product',
      targetKey: 'keyword:pencil',
    });
    const revisionOne = await seedObservation(prisma, oldRun.id, {
      observationKey: sha256('pencil-offer'),
      revision: 1,
    });
    const revisionTwo = await seedObservation(prisma, oldRun.id, {
      observationKey: revisionOne.observationKey,
      revision: 2,
      supersedesObservationId: revisionOne.id,
    });

    await expect(readCurrentObservationHeads(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
      targetKey: 'keyword:pencil',
    })).resolves.toMatchObject([{ id: revisionTwo.id, revision: 2 }]);

    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: oldRun.id },
      data: { isCurrentComplete: false },
    });
    await seedRun(prisma, {
      sourceKey: '1688.hot_product',
      targetKey: 'keyword:pencil',
      acceptedCount: 0,
    });

    await expect(readCurrentObservationHeads(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: '1688.hot_product',
      scopeKey: 'default',
      targetKey: 'keyword:pencil',
    })).resolves.toEqual([]);
    await expect(readCompleteObservationProvenanceByIds(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      observationIds: [revisionOne.id, revisionTwo.id],
    })).resolves.toMatchObject([
      { id: revisionOne.id, revision: 1 },
      { id: revisionTwo.id, revision: 2 },
    ]);
  });

  it('limits current observation heads by observed time rather than hashed identity', async () => {
    const run = await seedRun(prisma, {
      sourceKey: '1688.hot_product',
      targetKey: 'keyword:latest',
    });
    const old = await seedObservation(prisma, run.id, {
      observationKey: '0'.repeat(64), revision: 1,
    });
    const latest = await seedObservation(prisma, run.id, {
      observationKey: 'f'.repeat(64), revision: 1,
    });
    await prisma.sourcingEvidenceObservation.update({
      where: { id: latest.id },
      data: { observedAt: SOURCE_WINDOW_END },
    });
    await expect(readCurrentObservationHeads(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: '1688.hot_product',
      targetKey: 'keyword:latest',
      limit: 1,
    })).resolves.toMatchObject([{ id: latest.id }]);
    expect(old.id).not.toBe(latest.id);
  });

  it.each(['naver', 'shorts'] as const)('keeps the latest %s coverage scope after a late historical backfill', async (source) => {
    const sourceKey = source === 'naver' ? 'naver.trend' : 'shortstrend.trend';
    await seedRun(prisma, { sourceKey, targetKey: 'latest-window' });
    const historical = await seedRun(prisma, { sourceKey, targetKey: 'historical-window' });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: historical.id },
      data: {
        sourceWindowStartAt: new Date('2026-09-08T00:00:00Z'),
        sourceWindowEndAt: new Date('2026-09-09T00:00:00Z'),
        completedAt: new Date('2026-09-12T00:00:00Z'),
      },
    });
    const repository = new TrendCollectionRepositoryAdapter(prisma as unknown as PrismaService);
    await expect(repository.findLatestCompleteTrendScope({
      organizationId: TEST_ORGANIZATION_ID, source,
    })).resolves.toBe('latest-window');
  });

  it('returns only launch-candidate revision heads in current lists', async () => {
    const run = await seedRun(prisma, {
      sourceKey: '1688.hot_product',
      targetKey: 'keyword:launch',
    });
    const observation = await seedObservation(prisma, run.id, {
      observationKey: sha256('launch-offer'),
      revision: 1,
    });
    const supplierOffer = await prisma.supplierOfferSkuSnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        evidenceObservationId: observation.id,
        identityStatus: 'exact_variant',
        sourcePlatform: '1688',
        externalOfferId: 'offer-1',
        productName: 'Pencil set',
        currency: 'CNY',
        capturedAt: SOURCE_WINDOW_END,
        snapshotHash: sha256('supplier-offer'),
      },
    });
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Launch account',
        externalAccountId: randomUUID(),
      },
    });
    const first = await seedLaunchCandidate(prisma, {
      supplierOfferSkuSnapshotId: supplierOffer.id,
      targetChannelAccountId: account.id,
      revision: 1,
    });
    const second = await seedLaunchCandidate(prisma, {
      supplierOfferSkuSnapshotId: supplierOffer.id,
      targetChannelAccountId: account.id,
      revision: 2,
      supersedesLaunchCandidateId: first.id,
    });

    const repository = new SourcingLaunchCandidateRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    await expect(repository.findByIds({
      organizationId: TEST_ORGANIZATION_ID,
      ids: [second.id, first.id],
    })).resolves.toMatchObject([
      { id: second.id, version: 2 },
      { id: first.id, version: 1 },
    ]);
    await expect(repository.list({
      organizationId: TEST_ORGANIZATION_ID,
      limit: 20,
    })).resolves.toMatchObject([{ id: second.id, version: 2 }]);
  });

  it('sorts unranked live-commerce products after ranked products', async () => {
    const liveCapturedAt = new Date('2026-09-10T01:00:00.000Z');
    const run = await seedRun(prisma, {
      sourceKey: '1688.live_commerce',
      targetKey: 'live-products',
    });
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: run.id },
      data: { sourceWindowEndAt: liveCapturedAt },
    });
    await prisma.liveCommerceProductDailySnapshot.createMany({
      data: [
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: run.id,
          businessDate: SOURCE_WINDOW_START,
          source: '1688',
          broadcastId: 'broadcast-1',
          productId: 'unranked',
          rank: null,
          capturedAt: liveCapturedAt,
        },
        {
          organizationId: TEST_ORGANIZATION_ID,
          ingestionRunId: run.id,
          businessDate: SOURCE_WINDOW_START,
          source: '1688',
          broadcastId: 'broadcast-1',
          productId: 'ranked',
          rank: 1,
          capturedAt: liveCapturedAt,
        },
      ],
    });
    const repository = new LiveCommerceRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

    await expect(repository.findProductSnapshots({
      organizationId: TEST_ORGANIZATION_ID,
      source: '1688',
      days: 30,
    })).resolves.toMatchObject([
      { productId: 'ranked', rank: 1 },
      { productId: 'unranked', rank: null },
    ]);
  });
});

async function seedRun(
  prisma: PrismaClient,
  input: {
    sourceKey: string;
    targetKey: string;
    coverageNumerator?: number;
    coverageDenominator?: number;
    acceptedCount?: number;
  },
) {
  const idempotencyKey = randomUUID();
  return prisma.sourcingEvidenceIngestionRun.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: input.sourceKey,
      scopeKey: 'default',
      targetKey: input.targetKey,
      idempotencyKey,
      requestHash: sha256(idempotencyKey),
      collectorKey: 'reader-test',
      collectorVersion: 'v1',
      triggerKind: 'manual',
      triggeredByUserId: TEST_USER_ID,
      status: 'COMPLETE',
      isCurrentComplete: true,
      sourceWindowStartAt: SOURCE_WINDOW_START,
      sourceWindowEndAt: SOURCE_WINDOW_END,
      discoveredCount: input.acceptedCount ?? 1,
      acceptedCount: input.acceptedCount ?? 1,
      coverageNumerator: input.coverageNumerator ?? 1,
      coverageDenominator: input.coverageDenominator ?? 1,
      completedAt: SOURCE_WINDOW_END,
    },
  });
}

async function seedObservation(
  prisma: PrismaClient,
  ingestionRunId: string,
  input: {
    observationKey: string;
    revision: number;
    supersedesObservationId?: string;
  },
) {
  return prisma.sourcingEvidenceObservation.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      ingestionRunId,
      supersedesObservationId: input.supersedesObservationId,
      sourceKey: '1688.hot_product',
      platform: '1688',
      evidenceFamily: 'supplier_offer',
      signalRole: 'supply',
      conceptKey: 'pencil',
      supportsCandidate: true,
      observationKey: input.observationKey,
      revision: input.revision,
      sourceEntityType: 'supplier_offer',
      sourceEntityKey: 'offer-1',
      observationType: 'offer_snapshot',
      schemaVersion: '1688-hot-product/v2',
      evidenceClass: 'measured',
      eventAt: SOURCE_WINDOW_START,
      observedAt: SOURCE_WINDOW_START,
      availableAt: SOURCE_WINDOW_END,
      businessDate: SOURCE_WINDOW_START,
      payloadHash: sha256(`payload:${input.revision}`),
      envelopeHash: sha256(`envelope:${input.revision}`),
      payload: { offerId: 'offer-1' },
      ingestedAt: SOURCE_WINDOW_END,
    },
  });
}

async function seedLaunchCandidate(
  prisma: PrismaClient,
  input: {
    supplierOfferSkuSnapshotId: string;
    targetChannelAccountId: string;
    revision: number;
    supersedesLaunchCandidateId?: string;
  },
) {
  return prisma.sourcingLaunchCandidate.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      supplierOfferSkuSnapshotId: input.supplierOfferSkuSnapshotId,
      targetChannelAccountId: input.targetChannelAccountId,
      supersedesLaunchCandidateId: input.supersedesLaunchCandidateId,
      candidateSeriesKey: sha256('candidate-series'),
      revision: input.revision,
      identityHash: sha256(`candidate:${input.revision}`),
      name: `Pencil launch ${input.revision}`,
      productConceptVersionKey: 'concept-v1',
      koreanSellableBundleVersionKey: 'bundle-v1',
      launchPlanVersionKey: 'launch-v1',
      complianceAssessmentVersionKey: 'compliance-v1',
      ipClearanceVersionKey: 'ip-v1',
      qualitySpecVersionKey: 'quality-v1',
      intendedUse: 'stationery',
      materialProfileKey: 'wood',
      labelingProfileKey: 'label-v1',
      unitsPerSellableBundle: 1,
      initialOrderQuantity: 10,
      targetSalePriceKrw: 5000,
      fulfillmentMode: 'rocket',
      createdByUserId: TEST_USER_ID,
    },
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
