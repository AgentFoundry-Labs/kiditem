import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { TrendCollectionRepositoryAdapter } from '../adapter/out/repository/trend-collection.repository.adapter';
import { SourcingRecommendationSourceRepositoryAdapter } from '../adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { LiveCommerceRepositoryAdapter } from '../adapter/out/repository/live-commerce.repository.adapter';
import {
  map1688HotProductsToAuthorizedOutput,
  mapTrendTypedRecordsToAuthorizedOutput,
} from '../application/service/sourcing-collection-mappers';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  SourcingBrowserSourceAttempt,
  SourcingBrowserSourceAttemptPlan,
} from '../application/port/out/repository/sourcing-browser-source-attempt.repository.port';

const SOURCE_KEY = '1688.hot_product';
const PLAN: SourcingBrowserSourceAttemptPlan = {
  source: SOURCE_KEY,
  keywords: ['铅笔'],
};
const PLAN_CHECKSUM = checksum(PLAN);
const ALERT = {
  sourceType: SOURCE_KEY,
  dedupeKey: 'source:1688-hot-product',
  title: '1688 인기상품 수집 실패',
  href: '/sourcing-ai/market',
};
const LIVE_SOURCE_KEY = 'douyin.live_commerce';
const LIVE_PLAN: SourcingBrowserSourceAttemptPlan = {
  source: 'douyin',
  pageUrl: 'https://live.douyin.com/fixture',
  maxProducts: 100,
};
const LIVE_PLAN_CHECKSUM = checksum(LIVE_PLAN);
const LIVE_ALERT = {
  sourceType: LIVE_SOURCE_KEY,
  dedupeKey: 'source:douyin-live-commerce',
  title: '도우인 라이브 수집 실패',
  href: '/sourcing-ai/market',
};

describe('Sourcing browser source owner (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let owner: SourcingBrowserSourceAttemptRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = createOwner(prisma);
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('replays the first frozen plan, rejects fingerprint drift, and keeps the prior COMPLETE READY while a refresh is RUNNING', async () => {
    const created = await owner.beginAttempt(beginInput('first'));
    expect(created.created).toBe(true);
    const first = created.attempt;
    await expect(owner.beginAttempt(beginInput('first'))).resolves.toEqual({ attempt: first, created: false });
    await expect(begin('first')).resolves.toEqual(first);
    await expect(owner.beginAttempt({
      ...beginInput('first'),
      requestFingerprint: checksum({ source: SOURCE_KEY, changed: true }),
    })).rejects.toThrow('SOURCE_IDEMPOTENCY_KEY_REUSED');

    await complete(first, 'first-content');
    await expect(owner.readSourceStatus(statusInput())).resolves.toMatchObject({
      status: 'READY',
      refreshing: false,
      latestAttempt: { attemptId: first.attemptId, state: 'COMPLETE' },
      latestComplete: { attemptId: first.attemptId, state: 'COMPLETE' },
    });

    const refresh = await begin('refresh');
    await expect(owner.readSourceStatus(statusInput())).resolves.toMatchObject({
      status: 'READY',
      refreshing: true,
      latestAttempt: { attemptId: refresh.attemptId, state: 'RUNNING' },
      latestComplete: { attemptId: first.attemptId, state: 'COMPLETE' },
    });
  });

  it('scopes a reused begin idempotency key to its Sourcing source', async () => {
    const hotProducts = await begin('shared-source-key');
    const liveCommerce = await beginLive('shared-source-key');

    expect(hotProducts).toMatchObject({ sourceKey: SOURCE_KEY });
    expect(liveCommerce).toMatchObject({ sourceKey: LIVE_SOURCE_KEY });
    expect(liveCommerce.attemptId).not.toBe(hotProducts.attemptId);
    await expect(begin('shared-source-key')).resolves.toEqual(hotProducts);
    await expect(beginLive('shared-source-key')).resolves.toEqual(liveCommerce);
  });

  it('serializes one RUNNING attempt, terminalizes an expired owner attempt with its Alert, and creates a new attempt', async () => {
    const first = await begin('first');
    const concurrent = await Promise.allSettled([
      begin('second'),
      begin('third'),
    ]);
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(2);
    await expect(prisma.sourcingEvidenceIngestionRun.count({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceKey: SOURCE_KEY, status: 'RUNNING' },
    })).resolves.toBe(1);

    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: first.attemptId },
      data: { leaseExpiresAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    const replacement = await begin('replacement');

    expect(replacement.attemptId).not.toBe(first.attemptId);
    await expect(prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: first.attemptId } }))
      .resolves.toMatchObject({ status: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    await expect(prisma.alert.findUniqueOrThrow({
      where: { organizationId_dedupeKey: { organizationId: TEST_ORGANIZATION_ID, dedupeKey: ALERT.dedupeKey } },
    })).resolves.toMatchObject({ status: 'OPEN', attemptId: first.attemptId });
  });

  it('projects an expired RUNNING attempt as FAILED at read time without mutating the owner record or Alert', async () => {
    const attempt = await begin('read-expired');
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: attempt.attemptId },
      data: { leaseExpiresAt: new Date('2026-01-01T00:00:00.000Z') },
    });

    await expect(owner.readAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    })).resolves.toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
      errorMessage: 'Source collection expired before a complete snapshot was published.',
    });
    await expect(prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({
        status: 'RUNNING',
        errorCode: null,
        errorMessage: null,
        completedAt: null,
      });
    await expect(prisma.alert.count({
      where: { organizationId: TEST_ORGANIZATION_ID, dedupeKey: ALERT.dedupeKey },
    })).resolves.toBe(0);
  });

  it('fences terminal writes by organization, server token, and the frozen plan checksum', async () => {
    const attempt = await begin('fence');

    await expect(owner.readAttempt({ organizationId: OTHER_ORGANIZATION_ID, attemptId: attempt.attemptId }))
      .resolves.toBeNull();
    await expect(owner.completeAttempt({
      ...completeInput(attempt, 'wrong-org'),
      organizationId: OTHER_ORGANIZATION_ID,
    })).rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');
    await expect(owner.failAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      code: 'SOURCE_COLLECTION_FAILED',
      message: 'An organization-scoped failure must not cross the source fence.',
      failureAlert: ALERT,
    })).rejects.toThrow('SOURCE_ATTEMPT_NOT_FOUND');
    await expect(owner.completeAttempt({
      ...completeInput(attempt, 'wrong-token'),
      attemptToken: '33333333-3333-4333-8333-333333333333',
    })).rejects.toThrow('ATTEMPT_FENCE_LOST');
    await expect(owner.completeAttempt({
      ...completeInput(attempt, 'wrong-plan'),
      planChecksum: checksum({ source: SOURCE_KEY, keywords: ['다른 키워드'] }),
    })).rejects.toThrow('SOURCE_PLAN_MISMATCH');
    await expect(prisma.sourcingEvidenceObservation.count({ where: { organizationId: TEST_ORGANIZATION_ID } }))
      .resolves.toBe(0);
  });

  it('does not publish a partial generation over previous COMPLETE facts and surfaces the actual failed attempt as STALE', async () => {
    const baseline = await begin('baseline');
    await complete(baseline, 'baseline-content');
    const priorFacts = await countFacts();
    const incomplete = await begin('incomplete');

    await expect(owner.completeAttempt({
      ...completeInput(incomplete, 'partial-content'),
      output: { ...outputFor(incomplete), rejectedCount: 1 },
    })).resolves.toMatchObject({
      attemptId: incomplete.attemptId,
      state: 'FAILED',
      errorCode: 'SOURCE_PLAN_INCOMPLETE',
    });

    await expect(countFacts()).resolves.toBe(priorFacts);
    await expect(prisma.alert.findUniqueOrThrow({
      where: { organizationId_dedupeKey: { organizationId: TEST_ORGANIZATION_ID, dedupeKey: ALERT.dedupeKey } },
    })).resolves.toMatchObject({
      status: 'OPEN',
      isRead: false,
      attemptId: incomplete.attemptId,
    });
    await expect(owner.readSourceStatus(statusInput())).resolves.toMatchObject({
      status: 'STALE',
      latestAttempt: {
        attemptId: incomplete.attemptId,
        state: 'FAILED',
        errorCode: 'SOURCE_PLAN_INCOMPLETE',
      },
      latestComplete: { attemptId: baseline.attemptId, state: 'COMPLETE' },
    });
  });

  it('commits a disabled-source terminal failure and its Alert instead of rolling both back', async () => {
    const attempt = await begin('disabled-source');
    await prisma.sourcingCollectionSourceControl.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceKey: SOURCE_KEY,
        enabled: false,
      },
    });

    await expect(owner.completeAttempt(completeInput(attempt, 'disabled-source-content')))
      .resolves.toMatchObject({
        attemptId: attempt.attemptId,
        state: 'FAILED',
        errorCode: 'SOURCE_DISABLED',
      });
    await expect(countFacts()).resolves.toBe(0);
    await expect(prisma.alert.findUniqueOrThrow({
      where: { organizationId_dedupeKey: { organizationId: TEST_ORGANIZATION_ID, dedupeKey: ALERT.dedupeKey } },
    })).resolves.toMatchObject({
      status: 'OPEN',
      attemptId: attempt.attemptId,
      message: expect.stringContaining('SOURCE_DISABLED'),
    });
  });

  it('allows exactly one terminal transition when complete and fail race behind the source lock', async () => {
    const attempt = await begin('terminal-race');
    const heldLock = await holdSourceScopeLock(prisma);
    const complete = owner.completeAttempt(completeInput(attempt, 'terminal-race-complete'));
    const fail = owner.failAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      code: 'SOURCE_COLLECTION_FAILED',
      message: 'A competing terminal failure arrived.',
      failureAlert: ALERT,
    });

    await waitForAdvisoryWaiters(prisma, 2);
    heldLock.release();
    await heldLock.done;

    const terminalResults = await Promise.allSettled([complete, fail]);
    expect(terminalResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(terminalResults.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: expect.stringMatching(/^(COMPLETE|FAILED)$/) });
  });

  it('does not use a pre-lock clock to complete or fail past a fixed expiry', async () => {
    const { attempt: completeAttempt } = await owner.beginAttempt({
      ...beginInput('expired-after-lock-complete'),
      targetKey: 'expired-after-lock-complete',
      expiresInMs: 50,
    });
    const completeResult = await terminalAfterScopeExpiry(
      prisma,
      { sourceKey: SOURCE_KEY, scopeKey: 'default', targetKey: 'expired-after-lock-complete' },
      () => owner.completeAttempt(completeInput(completeAttempt, 'expired-after-lock-complete')),
    );
    expect(completeResult.status).toBe('rejected');
    if (completeResult.status === 'rejected') {
      expect((completeResult.reason as Error).message).toContain('SOURCE_ATTEMPT_EXPIRED');
    }
    await expect(prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: completeAttempt.attemptId } }))
      .resolves.toMatchObject({ status: 'RUNNING', isCurrentComplete: false, completedAt: null });
    await expect(countFacts()).resolves.toBe(0);

    const { attempt: failAttempt } = await owner.beginAttempt({
      ...beginInput('expired-after-lock-fail'),
      targetKey: 'expired-after-lock-fail',
      expiresInMs: 50,
    });
    const failResult = await terminalAfterScopeExpiry(
      prisma,
      { sourceKey: SOURCE_KEY, scopeKey: 'default', targetKey: 'expired-after-lock-fail' },
      () => owner.failAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        attemptId: failAttempt.attemptId,
        attemptToken: failAttempt.attemptToken,
        code: 'SOURCE_COLLECTION_FAILED',
        message: 'A terminal failure waited behind the source lock.',
        failureAlert: ALERT,
      }),
    );
    expect(failResult.status).toBe('rejected');
    if (failResult.status === 'rejected') {
      expect((failResult.reason as Error).message).toContain('SOURCE_ATTEMPT_EXPIRED');
    }
    await expect(prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: failAttempt.attemptId } }))
      .resolves.toMatchObject({
        status: 'RUNNING',
        isCurrentComplete: false,
        completedAt: null,
        errorCode: null,
      });
    await expect(prisma.alert.count({
      where: { organizationId: TEST_ORGANIZATION_ID, dedupeKey: ALERT.dedupeKey },
    })).resolves.toBe(0);
  });

  it('rolls back facts and COMPLETE when resolving the concrete source Alert fails', async () => {
    const alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    alerts.resolveSourceFailure = async () => {
      throw new Error('alert write failed');
    };
    const failingOwner = new SourcingBrowserSourceAttemptRepositoryAdapter(
      prisma as unknown as PrismaService,
      alerts,
    );
    const { attempt } = await failingOwner.beginAttempt(beginInput('alert-rollback'));

    await expect(failingOwner.completeAttempt(completeInput(attempt, 'alert-rollback-content')))
      .rejects.toThrow('alert write failed');
    await expect(countFacts()).resolves.toBe(0);
    await expect(prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'RUNNING', isCurrentComplete: false });
  });

  it('maintains exactly one current COMPLETE pointer under sequential publications', async () => {
    const first = await begin('first');
    await complete(first, 'first-content');
    const second = await begin('second');
    expect(second.generation).toBe(first.generation + 1);
    await complete(second, 'second-content');

    await expect(prisma.sourcingEvidenceIngestionRun.count({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceKey: SOURCE_KEY,
        scopeKey: 'default',
        targetKey: 'all',
        isCurrentComplete: true,
      },
    })).resolves.toBe(1);
    await expect(owner.readSourceStatus(statusInput())).resolves.toMatchObject({
      status: 'READY',
      latestComplete: { attemptId: second.attemptId },
    });
  });

  it('uses only the current COMPLETE generation for 1688 rows, including explicit zero snapshots', async () => {
    const history = new TrendCollectionRepositoryAdapter(prisma as unknown as PrismaService);
    const recommendation = new SourcingRecommendationSourceRepositoryAdapter(prisma as unknown as PrismaService);
    const readOffers = () => recommendation.listLatestOfferObservations({
      organizationId: TEST_ORGANIZATION_ID, cutoffAt: new Date(), lookbackDays: 7, limit: 10,
    });

    const offerBaseline = await begin('reader-offer-baseline');
    await complete(offerBaseline, 'reader-offer-baseline');
    await expect(history.find1688HotHistory({ organizationId: TEST_ORGANIZATION_ID, days: 7 }))
      .resolves.toHaveLength(1);
    await expect(readOffers()).resolves.toMatchObject({
      items: [{ ingestionRunId: offerBaseline.attemptId }], rejectedCount: 0,
    });

    const offerFailure = await begin('reader-offer-failure');
    await owner.failAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: offerFailure.attemptId,
      attemptToken: offerFailure.attemptToken,
      code: 'SOURCE_COLLECTION_FAILED',
      message: 'provider timeout',
      failureAlert: ALERT,
    });
    await expect(history.find1688HotHistory({ organizationId: TEST_ORGANIZATION_ID, days: 7 }))
      .resolves.toHaveLength(1);
    await expect(readOffers()).resolves.toMatchObject({
      items: [{ ingestionRunId: offerBaseline.attemptId }], rejectedCount: 0,
    });

    const offerZero = await begin('reader-offer-zero');
    await owner.completeAttempt({
      ...completeInput(offerZero, 'reader-offer-zero'),
      output: map1688HotProductsToAuthorizedOutput({
        permit: permitFor(offerZero),
        rows: [],
        qualityReport: { source: SOURCE_KEY, completeSnapshot: true },
      }),
    });
    await expect(history.find1688HotHistory({ organizationId: TEST_ORGANIZATION_ID, days: 7 }))
      .resolves.toEqual([]);
    await expect(readOffers()).resolves.toEqual({ items: [], rejectedCount: 0 });
  });

  it('publishes browser live facts through the source-owner attempt and hides prior products after an explicit zero-product COMPLETE', async () => {
    const history = new LiveCommerceRepositoryAdapter(prisma as unknown as PrismaService);
    const baseline = await beginLive('reader-live-baseline');
    await completeLive(baseline, 'reader-live-baseline', true);
    await expect(history.findProductSnapshots({ organizationId: TEST_ORGANIZATION_ID, days: 7, source: 'douyin' }))
      .resolves.toHaveLength(1);

    const refresh = await beginLive('reader-live-zero');
    await completeLive(refresh, 'reader-live-zero', false);
    await expect(history.findBroadcastSnapshots({ organizationId: TEST_ORGANIZATION_ID, days: 7, source: 'douyin' }))
      .resolves.toHaveLength(1);
    await expect(history.findProductSnapshots({ organizationId: TEST_ORGANIZATION_ID, days: 7, source: 'douyin' }))
      .resolves.toEqual([]);
  });

  it('replays an incomplete terminal report atomically without facts and rejects conflicting failed terminal content', async () => {
    const baseline = await begin('failed-report-baseline');
    await complete(baseline, 'baseline');
    const attempt = await begin('failed-report');
    const input = { ...completeInput(attempt, 'failed-report-checksum'),
      output: { ...outputFor(attempt), discoveredCount: 2, rejectedCount: 1,
        qualityReport: { units: [{ keyword: '铅笔', status: 'failed', error: 'provider blocked' }] } } };
    const failed = await owner.completeAttempt(input);
    expect(failed).toMatchObject({ state: 'FAILED', contentChecksum: input.contentChecksum, acceptedCount: 0 });
    expect(await owner.completeAttempt(input)).toEqual(failed);
    await expect(owner.completeAttempt({ ...input, contentChecksum: 'different' })).rejects.toThrow('SOURCE_TERMINAL_REPLAY_CONFLICT');
    expect(await prisma.sourcingEvidenceIngestionRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .toMatchObject({ discoveredCount: 2, rejectedCount: 1, qualityReport: input.output.qualityReport });
    expect(await prisma.sourcing1688OfferKeywordObservation.count({ where: { ingestionRunId: attempt.attemptId } })).toBe(0);
    expect(await prisma.sourcingEvidenceObservation.count({ where: { ingestionRunId: attempt.attemptId } })).toBe(0);
    expect(await owner.readSourceStatus(statusInput())).toMatchObject({ latestComplete: { attemptId: baseline.attemptId } });
  });

  it('keeps same-timestamp 1688 facts and their evidence owned by each COMPLETE attempt', async () => {
    const first = await begin('same-time-first');
    const publish = (attempt: SourcingBrowserSourceAttempt) => {
      const original = outputFor(attempt).typedRecords[0];
      if (original.kind !== 'offer_1688_keyword_observation') throw new Error('fixture kind');
      const output = map1688HotProductsToAuthorizedOutput({ permit: permitFor(attempt),
        rows: [{ ...original.row, offerId: 'same-offer' }], qualityReport: { completeSnapshot: true } });
      return owner.completeAttempt({ ...completeInput(attempt, 'same-provider-content'), output });
    };
    await publish(first);
    const second = await begin('same-time-second');
    await publish(second);
    const rows = await prisma.sourcing1688OfferKeywordObservation.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOfferId: 'same-offer' }, include: { evidenceObservation: true } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.ingestionRunId))).toEqual(new Set([first.attemptId, second.attemptId]));
    for (const row of rows) expect(row.evidenceObservation.ingestionRunId).toBe(row.ingestionRunId);
    expect(rows[0].evidenceObservation.payloadHash).toBe(rows[1].evidenceObservation.payloadHash);
  });

  it.each(['naver_keyword', 'naver_popular_keyword', 'shorts'] as const)(
    'keeps same-timestamp %s evidence owned by each attempt without changing provider content',
    async (kind) => {
      const sourceKey = kind === 'shorts' ? 'shortstrend.trend' : 'naver.trend';
      const capturedAt = new Date('2026-09-06T00:00:00Z');
      const businessDate = capturedAt;
      const row = kind === 'shorts'
        ? { organizationId: TEST_ORGANIZATION_ID, capturedAt, businessDate, videoKey: 'video',
          rank: 1, title: '완구', channelName: null, viewCount: 10, likeCount: null, commentCount: null,
          keyword: '완구', publishedAt: null, thumbnailUrl: null, videoUrl: null }
        : kind === 'naver_keyword'
          ? { organizationId: TEST_ORGANIZATION_ID, capturedAt, businessDate, keyword: '완구',
            monthlyTotalSearchCount: 10, monthlyPcSearchCount: 1, monthlyMobileSearchCount: 9,
            competitionIndex: null, averageAdRank: null, trendRatio: null, trendDelta: null }
          : { organizationId: TEST_ORGANIZATION_ID, capturedAt, businessDate, boardKey: 'toys_dolls',
            boardLabel: '완구', cid: null, rank: 1, keyword: '완구', linkId: null };
      const ids: string[] = [];
      for (const idempotencyKey of ['trend-generation-1', 'trend-generation-2']) {
        const plan = { source: sourceKey, capturedAt: capturedAt.toISOString(),
          businessDate: '2026-09-06', keywords: ['완구'] };
        const { attempt } = await owner.beginAttempt({ ...beginInput(idempotencyKey), sourceKey,
          plan, planChecksum: checksum(plan) });
        ids.push(attempt.attemptId);
        const record = { kind, row } as Parameters<typeof mapTrendTypedRecordsToAuthorizedOutput>[0]['typedRecords'][number];
        const output = mapTrendTypedRecordsToAuthorizedOutput({ permit: permitFor(attempt),
          typedRecords: [record, record], qualityReport: { completeSnapshot: true } });
        await owner.completeAttempt({ ...completeInput(attempt, 'same-provider-content'),
          output, sourceWindowStartAt: businessDate, sourceWindowEndAt: capturedAt });
      }
      const observations = await prisma.sourcingEvidenceObservation.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID, sourceKey } });
      expect(observations).toHaveLength(2);
      expect(new Set(observations.map((row) => row.ingestionRunId))).toEqual(new Set(ids));
      expect(observations[0].payloadHash).toBe(observations[1].payloadHash);
      const typed = kind === 'shorts' ? await prisma.shortsTrendDailySnapshot.findMany()
        : kind === 'naver_keyword' ? await prisma.naverKeywordDailySnapshot.findMany()
          : await prisma.naverPopularKeywordDailySnapshot.findMany();
      expect(typed).toHaveLength(2);
      expect(new Set(typed.map((row) => row.ingestionRunId))).toEqual(new Set(ids));
    },
  );

  async function begin(idempotencyKey: string) {
    return (await owner.beginAttempt(beginInput(idempotencyKey))).attempt;
  }

  function complete(attempt: SourcingBrowserSourceAttempt, contentChecksum: string) {
    return owner.completeAttempt(completeInput(attempt, contentChecksum));
  }

  async function beginLive(idempotencyKey: string) {
    const { attempt } = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      sourceKey: LIVE_SOURCE_KEY,
      scopeKey: 'page-url',
      targetKey: 'https://live.douyin.com/fixture',
      idempotencyKey,
      requestFingerprint: checksum({ source: LIVE_SOURCE_KEY, pageUrl: LIVE_PLAN.pageUrl }),
      plan: LIVE_PLAN,
      planChecksum: LIVE_PLAN_CHECKSUM,
      requestedByUserId: TEST_USER_ID,
      collectorKey: 'extension-live-commerce',
      collectorVersion: 'test/v1',
      expiresInMs: 60_000,
      failureAlert: LIVE_ALERT,
    });
    return attempt;
  }

  function completeLive(
    attempt: SourcingBrowserSourceAttempt,
    contentChecksum: string,
    includeProduct: boolean,
  ) {
    const capturedAt = new Date('2026-09-04T00:00:00.000Z');
    return owner.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      planChecksum: attempt.planChecksum,
      contentChecksum,
      output: mapTrendTypedRecordsToAuthorizedOutput({
        permit: permitFor(attempt),
        typedRecords: [
          {
            kind: 'live_commerce_broadcast',
            row: {
              organizationId: TEST_ORGANIZATION_ID,
              ingestionRunId: attempt.attemptId,
              businessDate: capturedAt,
              source: 'douyin',
              broadcastId: 'fixture-broadcast',
              title: 'Fixture broadcast',
              broadcasterId: null,
              broadcasterName: null,
              status: null,
              viewerCount: null,
              likeCount: null,
              startedAt: null,
              endedAt: null,
              coverImageUrl: null,
              sourceUrl: LIVE_PLAN.pageUrl,
              capturedAt,
            },
          },
          ...(includeProduct ? [{
            kind: 'live_commerce_product' as const,
            row: {
              organizationId: TEST_ORGANIZATION_ID,
              ingestionRunId: attempt.attemptId,
              businessDate: capturedAt,
              source: 'douyin' as const,
              broadcastId: 'fixture-broadcast',
              productId: 'fixture-product',
              rank: 1,
              title: 'Fixture product',
              priceCny: null,
              salesCount: null,
              imageUrl: null,
              sourceUrl: null,
              capturedAt,
            },
          }] : []),
        ],
        qualityReport: { source: LIVE_SOURCE_KEY, completeSnapshot: true },
      }),
      sourceWindowStartAt: null,
      sourceWindowEndAt: capturedAt,
      failureAlert: LIVE_ALERT,
    });
  }

  function countFacts() {
    return prisma.sourcing1688OfferKeywordObservation.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
  }
});

function createOwner(prisma: PrismaClient): SourcingBrowserSourceAttemptRepositoryAdapter {
  return new SourcingBrowserSourceAttemptRepositoryAdapter(
    prisma as unknown as PrismaService,
    new SourceFailureAlerts(new AlertsRepository(prisma as never)),
  );
}

function beginInput(idempotencyKey: string) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: SOURCE_KEY,
    scopeKey: 'default',
    targetKey: 'all',
    idempotencyKey,
    requestFingerprint: checksum({ source: SOURCE_KEY }),
    plan: PLAN,
    planChecksum: PLAN_CHECKSUM,
    requestedByUserId: TEST_USER_ID,
    collectorKey: 'extension-1688-trend',
    collectorVersion: 'test/v1',
    expiresInMs: 60_000,
    failureAlert: ALERT,
  };
}

function completeInput(attempt: SourcingBrowserSourceAttempt, contentChecksum: string) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    attemptId: attempt.attemptId,
    attemptToken: attempt.attemptToken,
    planChecksum: attempt.planChecksum,
    contentChecksum,
    output: outputFor(attempt),
    sourceWindowStartAt: null,
    sourceWindowEndAt: new Date('2026-09-04T00:00:00.000Z'),
    failureAlert: ALERT,
  };
}

function outputFor(attempt: SourcingBrowserSourceAttempt) {
  const capturedAt = new Date('2026-09-04T00:00:00.000Z');
  const permit = permitFor(attempt);
  return map1688HotProductsToAuthorizedOutput({
    permit,
    rows: [{
      organizationId: TEST_ORGANIZATION_ID,
      businessDate: new Date('2026-09-04T00:00:00.000Z'),
      offerId: `offer-${attempt.attemptId}`,
      sourceKeyword: '铅笔',
      rank: 1,
      title: '연필',
      priceCny: 12,
      monthlySales: 20,
      repurchaseRate: null,
      tradeScore: null,
      supplierName: null,
      imageUrl: null,
      sourceUrl: null,
      capturedAt,
    }],
    qualityReport: { source: SOURCE_KEY, completeSnapshot: true },
  });
}

function permitFor(attempt: SourcingBrowserSourceAttempt) {
  return {
    runId: attempt.attemptId,
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: attempt.sourceKey,
    scopeKey: attempt.scopeKey,
    targetKey: attempt.targetKey,
    leaseToken: attempt.attemptToken,
    generation: attempt.generation,
    leaseExpiresAt: attempt.expiresAt,
  };
}

function statusInput() {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    sourceKey: SOURCE_KEY,
    scopeKey: 'default',
    targetKey: 'all',
    currentPlanChecksum: PLAN_CHECKSUM,
  };
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

type SourceScope = {
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
};

async function terminalAfterScopeExpiry<T>(
  prisma: PrismaClient,
  scope: SourceScope,
  terminal: () => Promise<T>,
): Promise<PromiseSettledResult<T>> {
  const heldLock = await holdSourceScopeLock(prisma, scope);
  const result = Promise.allSettled([Promise.resolve().then(terminal)]);
  try {
    await waitForAdvisoryWaiters(prisma, 1);
    await new Promise((resolve) => setTimeout(resolve, 250));
  } finally {
    heldLock.release();
    await heldLock.done;
  }
  const [settled] = await result;
  if (!settled) throw new Error('Expected one terminal result after the source lock released.');
  return settled;
}

async function holdSourceScopeLock(prisma: PrismaClient, scope: SourceScope = {
  sourceKey: SOURCE_KEY,
  scopeKey: 'default',
  targetKey: 'all',
}): Promise<{
  release: () => void;
  done: Promise<unknown>;
}> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markLocked!: () => void;
  const locked = new Promise<void>((resolve) => {
    markLocked = resolve;
  });
  const scopeLockKey = `sourcing-source-attempt:${TEST_ORGANIZATION_ID}:${scope.sourceKey}:${scope.scopeKey}:${scope.targetKey}`;
  const done = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${scopeLockKey}, 0))::text AS "lock"
    `;
    markLocked();
    await released;
  });
  await locked;
  return { release, done };
}

async function waitForAdvisoryWaiters(prisma: PrismaClient, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS "count"
      FROM pg_locks
      WHERE locktype = 'advisory' AND granted = false
    `;
    if (Number(rows[0]?.count ?? 0n) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${expected} source-attempt lock waiters.`);
}
