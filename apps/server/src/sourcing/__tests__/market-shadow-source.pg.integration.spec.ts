import { unusedSalesProductDraftPort } from '../../test-helpers/sales-product-draft-port';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { SourcingShadowSignalService } from '../application/service/sourcing-shadow-signal.service';
import { MarketShadowSnapshotRepositoryAdapter } from '../adapter/out/repository/market-shadow-snapshot.repository.adapter';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from '../adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { TrendCollectionRepositoryAdapter } from '../adapter/out/repository/trend-collection.repository.adapter';
import type { PrismaClient } from '@prisma/client';

const NOW = new Date('2026-09-06T16:30:00Z');
describe('Market Shadow source owner public service + disposable PG', () => {
  let prisma: PrismaClient;
  let service: SourcingShadowSignalService;
  let alerts: SourceFailureAlerts;
  const google = {
    fetchTrending: vi.fn(async () => ({
      source: 'google-trends-rss' as const,
      generatedAt: NOW.toISOString(),
      items: [],
    })),
  };
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    service = new SourcingShadowSignalService(
      google,
      new MarketShadowSnapshotRepositoryAdapter(prisma as never),
      new TrendCollectionRepositoryAdapter(prisma as never),
      new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never, alerts, unusedSalesProductDraftPort),
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    google.fetchTrending.mockReset();
    google.fetchTrending.mockResolvedValue({
      source: 'google-trends-rss',
      generatedAt: NOW.toISOString(),
      items: [],
    });
    vi.stubEnv('SOURCING_LINKFOX_SHADOW_ENABLED', '0');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const collect = (idempotencyKey = randomUUID(), now = NOW) =>
    service.collect({ organizationId: ORG, requestedByUserId: USER, idempotencyKey }, now);
  it('publishes the complete document once and replays the exact receipt before next-day selection or IO', async () => {
    const key = randomUUID();
    const first = await collect(key);
    expect(first).toMatchObject({
      state: 'COMPLETE',
      snapshot: {
        businessDate: new Date('2026-09-07T00:00:00Z'),
        payload: { result: { status: 'complete', decisionImpact: 'disabled' } },
      },
    });
    expect(first).not.toHaveProperty('attemptToken');
    expect(await collect(key, new Date('2026-09-08T16:30:00Z'))).toEqual(first);
    expect(google.fetchTrending).toHaveBeenCalledTimes(1);
    expect(await service.readAttempt(ORG, first.attemptId)).toEqual(first);
    expect(await service.listRecent(ORG, 30, NOW)).toEqual([first.snapshot]);
  });
  it('rejects a different same-day key after COMPLETE and allows a new KST day', async () => {
    const first = await collect();
    await expect(collect()).rejects.toMatchObject({
      response: { code: 'SHADOW_DAILY_LIMIT', attemptId: first.attemptId },
    });
    expect(google.fetchTrending).toHaveBeenCalledTimes(1);
    const second = await collect(randomUUID(), new Date('2026-09-07T16:30:00Z'));
    expect(second.state).toBe('COMPLETE');
    expect(second.attemptId).not.toBe(first.attemptId);
    // The observation key is a hash; make its order oppose business-date order.
    await prisma.sourcingEvidenceObservation.updateMany({
      where: { organizationId: ORG, ingestionRunId: first.attemptId },
      data: { observationKey: '0'.repeat(64) },
    });
    await prisma.sourcingEvidenceObservation.updateMany({
      where: { organizationId: ORG, ingestionRunId: second.attemptId },
      data: { observationKey: 'f'.repeat(64) },
    });
    expect(await service.getStatus(ORG, new Date('2026-09-07T16:30:00Z'))).toMatchObject({
      latestComplete: second.snapshot,
      actualCutoffAt: new Date('2026-09-07T16:30:00Z'),
    });
    expect(
      (await service.listRecent(ORG, 30, new Date('2026-09-07T16:30:00Z'))).map((row) =>
        row.businessDate.toISOString(),
      ),
    ).toEqual(['2026-09-08T00:00:00.000Z', '2026-09-07T00:00:00.000Z']);
  });
  it('retains previous COMPLETE across failed days, resolves and reopens the stable source Alert', async () => {
    const first = await collect();
    expect(await service.getStatus(ORG, NOW)).toMatchObject({
      ready: true,
      latestComplete: first.snapshot,
      actualCutoffAt: NOW,
    });
    google.fetchTrending.mockRejectedValueOnce(
      new Error('Authorization: secret-token upstream failed'),
    );
    const nextDay = new Date('2026-09-07T16:30:00Z');
    const failedKey = randomUUID();
    const failed = await collect(failedKey, nextDay);
    expect(failed).toMatchObject({
      state: 'FAILED',
      snapshot: null,
      errorCode: 'SHADOW_COLLECTION_FAILED',
    });
    expect(failed.errorMessage).toContain('Authorization=[REDACTED]');
    expect(JSON.stringify(failed)).not.toContain('secret-token');
    expect(await service.getStatus(ORG, nextDay)).toMatchObject({
      ready: false,
      latestAttempt: { attemptId: failed.attemptId, state: 'FAILED', errorCode: failed.errorCode },
      latestComplete: first.snapshot,
      actualCutoffAt: NOW,
    });
    expect(await service.listRecent(ORG, 30, nextDay)).toEqual([first.snapshot]);
    expect(await collect(failedKey, new Date('2026-09-09T16:30:00Z'))).toEqual(failed);
    await expect(collect(randomUUID(), nextDay)).rejects.toMatchObject({
      response: { code: 'SHADOW_DAILY_LIMIT', attemptId: failed.attemptId },
    });
    const before = await alerts.list(ORG);
    expect(before).toMatchObject([{ status: 'OPEN', attemptId: failed.attemptId }]);
    const later = await collect(randomUUID(), new Date('2026-09-08T16:30:00Z'));
    expect(later.state).toBe('COMPLETE');
    expect(await alerts.list(ORG)).toMatchObject([
      { id: before[0].id, status: 'RESOLVED', attemptId: later.attemptId },
    ]);
    google.fetchTrending.mockRejectedValueOnce(new Error('next upstream failure'));
    const reopened = await collect(randomUUID(), new Date('2026-09-09T16:30:00Z'));
    expect(await alerts.list(ORG)).toMatchObject([
      { id: before[0].id, status: 'OPEN', attemptId: reopened.attemptId },
    ]);
  });
  it('admits only one concurrent provider request and preserves the active same-key receipt', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    google.fetchTrending.mockImplementationOnce(async () => {
      await blocked;
      return { source: 'google-trends-rss', generatedAt: NOW.toISOString(), items: [] };
    });
    const key = randomUUID();
    const pending = collect(key);
    try {
      await expect.poll(() => google.fetchTrending.mock.calls.length).toBe(1);
      const active = await collect(key);
      expect(active).toMatchObject({ state: 'RUNNING', snapshot: null });
      await expect(collect()).rejects.toMatchObject({
        response: { code: 'SHADOW_DAILY_LIMIT', attemptId: active.attemptId },
      });
      expect(await service.getStatus(ORG, NOW)).toMatchObject({
        ready: false,
        latestComplete: null,
      });
    } finally {
      release();
    }
    expect((await pending).state).toBe('COMPLETE');
    expect(google.fetchTrending).toHaveBeenCalledTimes(1);
  });
  it('commits expired FAILED plus Alert before denying the day, without publishing the late provider payload', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    google.fetchTrending.mockImplementationOnce(async () => {
      await blocked;
      return { source: 'google-trends-rss', generatedAt: NOW.toISOString(), items: [] };
    });
    const key = randomUUID();
    const pending = collect(key).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    try {
      await expect.poll(() => google.fetchTrending.mock.calls.length).toBe(1);
      const active = await collect(key);
      await prisma.sourcingEvidenceIngestionRun.update({
        where: { id: active.attemptId, organizationId: ORG },
        // Fixed past instant avoids the host/DB clock boundary.
        data: { leaseExpiresAt: new Date(0) },
      });
      expect(await service.readAttempt(ORG, active.attemptId)).toMatchObject({
        state: 'FAILED',
        errorCode: 'ATTEMPT_EXPIRED',
        snapshot: null,
      });
      expect(await alerts.list(ORG)).toEqual([]);
      await expect(collect()).rejects.toMatchObject({
        response: { code: 'SHADOW_DAILY_LIMIT', attemptId: active.attemptId },
      });
      expect(
        await prisma.sourcingEvidenceIngestionRun.findFirst({
          where: { id: active.attemptId, organizationId: ORG },
        }),
      ).toMatchObject({ status: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
      expect(await alerts.list(ORG)).toMatchObject([
        { status: 'OPEN', attemptId: active.attemptId },
      ]);
    } finally {
      release();
    }
    expect(await pending).toMatchObject({
      value: { state: 'FAILED', snapshot: null, errorCode: 'ATTEMPT_EXPIRED' },
    });
    expect(await service.listRecent(ORG, 30, NOW)).toEqual([]);
    expect(google.fetchTrending).toHaveBeenCalledTimes(1);
  });
  it('serializes two fresh day admissions before provider IO', async () => {
    const results = await Promise.allSettled([collect(), collect()]);
    const complete = results.find((result) => result.status === 'fulfilled');
    const denied = results.find((result) => result.status === 'rejected');
    expect(complete).toMatchObject({ status: 'fulfilled', value: { state: 'COMPLETE' } });
    expect(denied).toMatchObject({
      status: 'rejected',
      reason: {
        response: {
          code: 'SHADOW_DAILY_LIMIT',
          attemptId: complete!.status === 'fulfilled' ? complete!.value.attemptId : '',
        },
      },
    });
    expect(google.fetchTrending).toHaveBeenCalledTimes(1);
  });
  it('keeps status on one database snapshot when the provider completes between status reads', async () => {
    let releaseProvider!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    google.fetchTrending.mockImplementationOnce(async () => {
      await blocked;
      return { source: 'google-trends-rss', generatedAt: NOW.toISOString(), items: [] };
    });
    const pending = collect();
    await expect.poll(() => google.fetchTrending.mock.calls.length).toBe(1);
    let latestRead!: () => void;
    const latestReadPromise = new Promise<void>((resolve) => {
      latestRead = resolve;
    });
    let published!: () => void;
    const publishedPromise = new Promise<void>((resolve) => {
      published = resolve;
    });
    // Delay actual SQL only; the owner and database results are not substituted.
    const readClient = prisma.$extends({
      query: {
        sourcingEvidenceIngestionRun: {
          async findFirst({ args, query }) {
            const result = await query(args);
            latestRead();
            return result;
          },
        },
        sourcingMarketShadowFact: {
          async findFirst({ args, query }) {
            await publishedPromise;
            return query(args);
          },
        },
      },
    });
    const reader = new SourcingShadowSignalService(
      google,
      new MarketShadowSnapshotRepositoryAdapter(readClient as never),
      new TrendCollectionRepositoryAdapter(prisma as never),
      new SourcingBrowserSourceAttemptRepositoryAdapter(prisma as never, alerts, unusedSalesProductDraftPort),
    );
    const reading = reader.getStatus(ORG, NOW);
    await latestReadPromise;
    releaseProvider();
    try {
      await pending;
    } finally {
      published();
    }
    expect(await reading).toMatchObject({
      ready: false,
      latestAttempt: { state: 'RUNNING' },
      latestComplete: null,
    });
    expect(await service.getStatus(ORG, NOW)).toMatchObject({
      ready: true,
      latestAttempt: { state: 'COMPLETE' },
      latestComplete: { businessDate: new Date('2026-09-07T00:00:00Z') },
    });
  });
  it('rolls expiry and denial back when the same-transaction Alert cannot be stored', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    google.fetchTrending.mockImplementationOnce(async () => {
      await blocked;
      return { source: 'google-trends-rss', generatedAt: NOW.toISOString(), items: [] };
    });
    const key = randomUUID();
    const pending = collect(key);
    await expect.poll(() => google.fetchTrending.mock.calls.length).toBe(1);
    const active = await collect(key);
    await prisma.sourcingEvidenceIngestionRun.update({
      where: { id: active.attemptId, organizationId: ORG },
      data: { leaseExpiresAt: new Date(Date.now() - 1) },
    });
    await prisma.$executeRaw`ALTER TABLE alerts ADD CONSTRAINT shadow_alert_failure CHECK (source_type <> 'market_shadow_signals')`;
    try {
      await expect(collect()).rejects.toThrow();
      expect(
        await prisma.sourcingEvidenceIngestionRun.findFirst({
          where: { id: active.attemptId, organizationId: ORG },
        }),
      ).toMatchObject({ status: 'RUNNING', completedAt: null });
      expect(await alerts.list(ORG)).toEqual([]);
    } finally {
      await prisma.$executeRaw`ALTER TABLE alerts DROP CONSTRAINT shadow_alert_failure`;
      release();
    }
    expect(await pending).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
      snapshot: null,
    });
    await expect(collect()).rejects.toMatchObject({
      response: { code: 'SHADOW_DAILY_LIMIT', attemptId: active.attemptId },
    });
    expect(await alerts.list(ORG)).toMatchObject([{ status: 'OPEN', attemptId: active.attemptId }]);
    expect(await service.listRecent(ORG, 30, NOW)).toEqual([]);
  });
  it('rolls publication back with Alert resolution and retains the previous COMPLETE', async () => {
    const first = await collect();
    google.fetchTrending.mockRejectedValueOnce(new Error('upstream failed'));
    const failed = await collect(randomUUID(), new Date('2026-09-07T16:30:00Z'));
    const laterDay = new Date('2026-09-08T16:30:00Z');
    const key = randomUUID();
    await prisma.$executeRaw`ALTER TABLE alerts ADD CONSTRAINT shadow_resolution_failure CHECK (source_type <> 'market_shadow_signals' OR status <> 'RESOLVED')`;
    try {
      await expect(collect(key, laterDay)).rejects.toThrow();
      expect(await service.listRecent(ORG, 30, laterDay)).toEqual([first.snapshot]);
      expect(await alerts.list(ORG)).toMatchObject([
        { status: 'OPEN', attemptId: failed.attemptId },
      ]);
      const active = await collect(key, laterDay);
      expect(active).toMatchObject({ state: 'RUNNING', snapshot: null });
      await expect(collect(randomUUID(), laterDay)).rejects.toMatchObject({
        response: { code: 'SHADOW_DAILY_LIMIT', attemptId: active.attemptId },
      });
    } finally {
      await prisma.$executeRaw`ALTER TABLE alerts DROP CONSTRAINT shadow_resolution_failure`;
    }
  });
  it('reads only scoped COMPLETE evidence and never certifies legacy workspace rows', async () => {
    await prisma.sourcingWorkspaceSnapshot.create({
      data: {
        organizationId: ORG,
        scope: 'market_shadow_signals',
        businessDate: new Date('2026-09-07T00:00:00Z'),
        payload: { result: { status: 'complete' } },
      },
    });
    expect(await service.getStatus(ORG, NOW)).toMatchObject({
      ready: false,
      latestComplete: null,
      latestAttempt: null,
    });
    expect(await service.listRecent(ORG, 30, NOW)).toEqual([]);
    const result = await collect();
    await expect(service.readAttempt(randomUUID(), result.attemptId)).rejects.toMatchObject({
      status: 404,
    });
    expect(await service.listRecent(randomUUID(), 30, NOW)).toEqual([]);
    const evidence = await prisma.sourcingEvidenceObservation.findMany({
      where: { organizationId: ORG, ingestionRunId: result.attemptId },
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      supportsCandidate: false,
      sourceKey: 'market_shadow_signals',
      payload: result.snapshot!.payload,
    });
    expect(await prisma.sourcingMarketShadowFact.findMany({
      where: { organizationId: ORG, ingestionRunId: result.attemptId },
    })).toMatchObject([{ document: result.snapshot!.payload }]);
    expect(
      await prisma.sourcingWorkspaceSnapshot.count({
        where: { organizationId: ORG, scope: 'market_shadow_signals' },
      }),
    ).toBe(1);
  });

  it('does not expose historical COMPLETE market evidence without typed publication', async () => {
    const result = await collect();
    expect(await prisma.sourcingEvidenceObservation.count({
      where: { organizationId: ORG, ingestionRunId: result.attemptId },
    })).toBe(1);
    await prisma.sourcingMarketShadowFact.deleteMany({
      where: { organizationId: ORG, ingestionRunId: result.attemptId },
    });

    expect(await service.readAttempt(ORG, result.attemptId)).toMatchObject({
      state: 'COMPLETE',
      snapshot: null,
    });
    expect(await service.getStatus(ORG, NOW)).toMatchObject({
      ready: false,
      latestComplete: null,
      latestAttempt: { state: 'COMPLETE' },
    });
    expect(await service.listRecent(ORG, 30, NOW)).toEqual([]);
  });
});
