import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../../test-helpers/real-prisma';
import { SellpiaSalesSourceStatusSchema } from '@kiditem/shared/dashboard';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { SellpiaSalesController } from '../sellpia-sales.controller';
import { SellpiaSalesService } from '../sellpia-sales.service';
import {
  buildSellpiaSalesSourcePlan,
  SELLPIA_SALES_ALERT_DEDUPE_KEY,
  SELLPIA_SALES_SOURCE_TYPE,
  SellpiaSalesSourceService,
} from '../sellpia-sales-source.service';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from '../domain/snapshot-coverage';
import { readSellpiaSalesDailyFacts } from '../read/sellpia-sales-daily-facts';
import { FactInputError } from '../../../common/errors/fact-errors';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { CoupangAdsDailyRow } from '../../application/port/out/repository/dashboard/wing-traffic-aggregation.repository.port';

const base = '/api/sellpia-sales';

describe('Sellpia sales source owner HTTP + disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let owner: SellpiaSalesSourceService;
  let dailyAdsRead: CoupangAdsDailyRow[] | Error = [];

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = new SellpiaSalesSourceService(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
    );
    const summary = new SellpiaSalesService(
      {
        fetchDailyAds: async () => {
          if (dailyAdsRead instanceof Error) throw dailyAdsRead;
          return dailyAdsRead;
        },
      } as never,
      prisma as never,
    );
    const module = await Test.createTestingModule({
      controllers: [SellpiaSalesController],
      providers: [
        { provide: SellpiaSalesService, useValue: summary },
        { provide: SellpiaSalesSourceService, useValue: owner },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    app.use(json({ limit: '25mb' }));
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { headers: Record<string, string>; authUser?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        req.authUser = {
          id: USER,
          organizationId: req.headers['x-test-org'] ?? ORG,
        };
        next();
      },
    );
    await app.init();
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    dailyAdsRead = [];
  });

  const begin = async (
    range?: { from: string; to: string },
    idempotencyKey = randomUUID(),
  ) => {
    const response = await request(httpUrl)
      .post(`${base}/attempts`)
      .set('Idempotency-Key', idempotencyKey)
      .send(range ? { range } : {})
      .expect(201);
    return response.body as {
      attemptId: string;
      state: string;
      plan: { range: { from: string; to: string }; businessDates: string[] };
    };
  };

  const control = async (attemptId: string) => {
    const response = await request(httpUrl)
      .get(`${base}/attempts/${attemptId}/control`)
      .expect(200);
    return response.body as {
      attemptToken: string;
      manifestChecksum?: string;
    };
  };

  const payload = (range: { from: string; to: string }, capturedAt = '2026-07-18T01:00:00.000Z') => ({
    range,
    capturedAt,
    sellers: [
      {
        sellerId: '118',
        sellerName: '스마트스토어',
        days: [
          { date: range.from, price: 1_200, amount: 2, buyPrice: 700 },
          ...(range.to === range.from
            ? []
            : [{ date: range.to, price: 2_400, amount: 4, buyPrice: 1_400 }]),
        ],
      },
    ],
  });

  const complete = async (
    attemptId: string,
    attemptToken: string,
    body: ReturnType<typeof payload>,
  ) => {
    const response = await request(httpUrl)
      .post(`${base}/attempts/${attemptId}/complete`)
      .set('X-Source-Attempt-Token', attemptToken)
      .send(body)
      .expect(201);
    return response.body as {
      state: string;
      actualCutoffAt: string | null;
      completedAt: string | null;
      rowCount: number;
      sellerCount: number;
      businessDates: string[];
      contentChecksum: string | null;
    };
  };

  it('does not query an open current month on the first KST day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-31T15:00:00.000Z'));
    const transaction = vi.spyOn(prisma, '$transaction');
    try {
      const response = await request(httpUrl).get(base).expect(200);
      expect(transaction).not.toHaveBeenCalled();
      expect(response.body).toMatchObject({
        knownThrough: '2026-08-31',
        range: null,
        hasData: false,
        adCost: null,
        netProfit: null,
        profitRate: null,
      });
    } finally {
      transaction.mockRestore();
      vi.useRealTimers();
    }
  });

  it('reads only the first closed day on the second KST day through the canonical reader', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T15:00:00.000Z'));
    try {
      const range = { from: '2026-09-01', to: '2026-09-02' };
      const attempt = await begin(range);
      const attemptControl = await control(attempt.attemptId);
      await complete(attempt.attemptId, attemptControl.attemptToken,
        payload(range, '2026-09-01T15:00:00.000Z'));
      const response = await request(httpUrl).get(base).expect(200);
      expect(response.body).toMatchObject({
        knownThrough: '2026-09-01',
        range: { from: '2026-09-01', to: '2026-09-01' },
        hasData: true,
        totalRevenue: 1_200,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the collector default at exactly 93 inclusive KST dates', () => {
    expect(buildSellpiaSalesSourcePlan(new Date('2026-07-18T00:00:00.000Z')).range).toEqual({
      from: '2026-04-17',
      to: '2026-07-18',
    });
    expect(
      buildSellpiaSalesSourcePlan(new Date('2026-07-18T00:00:00.000Z')).businessDates,
    ).toHaveLength(93);
    expect(buildSellpiaSalesSourcePlan(new Date('2026-07-17T15:00:00.000Z')).range.to).toBe('2026-07-18');
  });

  it('publishes only a COMPLETE tagged snapshot and preserves actual business cutoff', async () => {
    const range = { from: '2026-07-16', to: '2026-07-17' };
    const attempt = await begin(range);
    expect(attempt.state).toBe('RUNNING');
    const attemptControl = await control(attempt.attemptId);
    const completed = await complete(
      attempt.attemptId,
      attemptControl.attemptToken,
      payload(range),
    );

    expect(completed).toMatchObject({
      state: 'COMPLETE',
      actualCutoffAt: '2026-07-17T00:00:00.000Z',
      rowCount: 4,
      sellerCount: 1,
      businessDates: ['2026-07-16', '2026-07-17'],
    });
    expect(completed.completedAt).not.toBe(completed.actualCutoffAt);
    expect(completed.contentChecksum).toMatch(/^[a-f0-9]{64}$/);

    const taggedRows = await prisma.sellpiaSalesDailySnapshot.findMany({
      where: { organizationId: ORG, sourceImportRunId: attempt.attemptId },
    });
    expect(taggedRows).toHaveLength(4);
    expect(taggedRows.every((row) => row.sourceImportRunId === attempt.attemptId)).toBe(true);
    expect(
      await prisma.sellpiaSalesDailySnapshot.count({
        where: { organizationId: ORG, sourceImportRunId: null },
      }),
    ).toBe(0);

    await prisma.sellpiaSalesDailySnapshot.create({
      data: {
        organizationId: ORG,
        businessDate: new Date('2026-07-16T00:00:00.000Z'),
        sellerId: 'legacy-unowned',
        sellerName: 'legacy row',
        channelGroup: 'others',
        revenueKrw: 99_999,
        qty: 99,
        costKrw: 1,
        capturedAt: new Date('2026-07-18T02:00:00.000Z'),
      },
    });
    const published = await prisma.$transaction((tx) => readSellpiaSalesDailyFacts(tx, {
      organizationId: ORG,
      from: range.from,
      to: range.to,
    }));
    expect(published.facts).toHaveLength(2);
    expect(published.facts.some((row) => row.sellerId === 'legacy-unowned')).toBe(false);
    expect(published.facts).toContainEqual(expect.objectContaining({
      sellerId: '118',
      businessDate: new Date('2026-07-16T00:00:00.000Z'),
      revenueKrw: 1_200,
      qty: 2,
      costKrw: 700,
    }));
    expect(published.coverage.includedDates).toEqual(['2026-07-16', '2026-07-17']);
  });

  it('returns an empty public summary before the owner publishes any coverage', async () => {
    const response = await request(httpUrl)
      .get(`${base}?from=2026-07-16&to=2026-07-17`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalRevenue: 0,
      totalCost: 0,
      adCost: null,
      netProfit: null,
      profitRate: null,
      hasData: false,
      rocket: { malls: [] },
      others: { malls: [] },
    });
  });

  it('keeps a partial owner range usable and exposes only confirmed daily points', async () => {
    const range = { from: '2026-07-16', to: '2026-07-16' };
    const attempt = await begin(range);
    const attemptControl = await control(attempt.attemptId);
    await complete(attempt.attemptId, attemptControl.attemptToken, payload(range));

    const response = await request(httpUrl)
      .get(`${base}?from=2026-07-16&to=2026-07-17`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalRevenue: 1_200,
      hasData: true,
      metricBasis: {
        totalRevenue: {
          includedDates: ['2026-07-16'],
        },
      },
    });
    expect(response.body.others.daily).toEqual([
      expect.objectContaining({ date: '2026-07-16', revenue: 1_200, qty: 2 }),
    ]);
  });

  it('rejects a malformed coverage sentinel instead of publishing its date', async () => {
    const range = { from: '2026-07-16', to: '2026-07-16' };
    const attempt = await begin(range);
    const attemptControl = await control(attempt.attemptId);
    await complete(attempt.attemptId, attemptControl.attemptToken, payload(range));
    await prisma.sellpiaSalesDailySnapshot.updateMany({
      where: {
        organizationId: ORG,
        sourceImportRunId: attempt.attemptId,
        sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
      },
      data: { revenueKrw: 1 },
    });

    const published = await prisma.$transaction((tx) => readSellpiaSalesDailyFacts(tx, {
      organizationId: ORG,
      from: range.from,
      to: range.to,
    }));
    expect(published).toMatchObject({
      facts: [],
      coverage: { includedDates: [], invalidDates: ['2026-07-16'] },
      latestCapturedAt: null,
    });

    const response = await request(httpUrl)
      .get(`${base}?from=${range.from}&to=${range.to}`)
      .expect(200);
    expect(response.body).toMatchObject({ totalRevenue: 0, hasData: false });
  });

  it('rejects a range that selects no business date with a typed input error', async () => {
    for (const range of [
      { from: '2026-07-16', to: '2026-07-15' },
      { from: '2026-07-32', to: '2026-08-01' },
    ]) {
      const read = prisma.$transaction((tx) => readSellpiaSalesDailyFacts(tx, {
        organizationId: ORG,
        ...range,
      }));
      await expect(read).rejects.toBeInstanceOf(FactInputError);
      await expect(read).rejects.toThrow('INVALID_DATE_RANGE');
    }
  });

  it('uses the exact sales and Ads date intersection and preserves negative profit', async () => {
    const range = { from: '2026-07-14', to: '2026-07-16' };
    const attempt = await begin(range);
    const attemptControl = await control(attempt.attemptId);
    await complete(attempt.attemptId, attemptControl.attemptToken, {
      range,
      capturedAt: '2026-07-18T01:00:00.000Z',
      sellers: [{
        sellerId: '118',
        sellerName: '스마트스토어',
        days: [
          { date: '2026-07-14', price: 100, amount: 1, buyPrice: 40 },
          { date: '2026-07-15', price: 200, amount: 2, buyPrice: 80 },
          { date: '2026-07-16', price: 300, amount: 3, buyPrice: 120 },
        ],
      }],
    });
    dailyAdsRead = [
      ads('2026-07-14', 110),
      ads('2026-07-16', 230),
    ];

    const response = await request(httpUrl)
      .get(`${base}?from=${range.from}&to=${range.to}`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalRevenue: 600,
      totalCost: 240,
      adCost: 340,
      netProfit: -100,
      profitRate: -25,
      profitInputs: {
        revenue: 400,
        cost: 160,
        adCost: 340,
        qty: 4,
        basis: {
          includedDates: ['2026-07-14', '2026-07-16'],
        },
      },
    });
  });

  it('does not turn invalid or failed Ads evidence into zero cost', async () => {
    const range = { from: '2026-07-16', to: '2026-07-16' };
    const attempt = await begin(range);
    const attemptControl = await control(attempt.attemptId);
    await complete(attempt.attemptId, attemptControl.attemptToken, payload(range));

    dailyAdsRead = [ads(range.from, Number.NaN)];
    const invalid = await request(httpUrl)
      .get(`${base}?from=${range.from}&to=${range.to}`)
      .expect(200);
    expect(invalid.body).toMatchObject({
      totalRevenue: 1_200,
      adCost: null,
      netProfit: null,
      profitRate: null,
    });

    dailyAdsRead = new Error('owner Ads read failed');
    const failed = await request(httpUrl)
      .get(`${base}?from=${range.from}&to=${range.to}`)
      .expect(200);
    expect(failed.body).toMatchObject({
      totalRevenue: 1_200,
      adCost: null,
      netProfit: null,
      profitRate: null,
      metricBasis: {
        profitInputs: { queryFailedSources: ['coupang_ads'] },
      },
    });
  });

  it('keeps prior COMPLETE dates when a later attempt fills an incremental date', async () => {
    const firstRange = { from: '2026-07-16', to: '2026-07-17' };
    const first = await begin(firstRange);
    const firstControl = await control(first.attemptId);
    await complete(first.attemptId, firstControl.attemptToken, payload(firstRange));

    const secondRange = { from: '2026-07-18', to: '2026-07-18' };
    const second = await begin(secondRange);
    const secondControl = await control(second.attemptId);
    await complete(second.attemptId, secondControl.attemptToken, payload(secondRange));

    const published = await prisma.$transaction((tx) => readSellpiaSalesDailyFacts(tx, {
      organizationId: ORG,
      from: '2026-07-16',
      to: '2026-07-18',
    }));
    expect(published.facts).toHaveLength(3);
    expect(published.coverage.includedDates).toEqual([
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ]);
    expect(published.facts.some((row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID)).toBe(false);
    expect(published.latestCapturedAt).toEqual(new Date('2026-07-18T01:00:00.000Z'));
  });

  it('keeps cancellation alert-free, alerts other failures, and resolves on the next COMPLETE', async () => {
    const range = { from: '2026-07-16', to: '2026-07-16' };
    const cancelled = await begin(range);
    const cancelledControl = await control(cancelled.attemptId);
    await request(httpUrl)
      .post(`${base}/attempts/${cancelled.attemptId}/fail`)
      .set('X-Source-Attempt-Token', cancelledControl.attemptToken)
      .send({ errorCode: 'USER_CANCELLED', errorMessage: 'User stopped collection.' })
      .expect(201);
    expect(
      await prisma.alert.count({ where: { organizationId: ORG, sourceType: SELLPIA_SALES_SOURCE_TYPE } }),
    ).toBe(0);

    const failed = await begin(range);
    const failedControl = await control(failed.attemptId);
    await request(httpUrl)
      .post(`${base}/attempts/${failed.attemptId}/fail`)
      .set('X-Source-Attempt-Token', failedControl.attemptToken)
      .send({ errorCode: 'NETWORK', errorMessage: 'Provider unavailable.' })
      .expect(201);
    await expect(
      prisma.alert.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: ORG,
            dedupeKey: SELLPIA_SALES_ALERT_DEDUPE_KEY,
          },
        },
      }),
    ).resolves.toMatchObject({
      status: 'OPEN',
      attemptId: failed.attemptId,
      sourceType: SELLPIA_SALES_SOURCE_TYPE,
    });

    const recovered = await begin(range);
    const recoveredControl = await control(recovered.attemptId);
    await complete(recovered.attemptId, recoveredControl.attemptToken, payload(range));
    await expect(
      prisma.alert.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: ORG,
            dedupeKey: SELLPIA_SALES_ALERT_DEDUPE_KEY,
          },
        },
      }),
    ).resolves.toMatchObject({ status: 'RESOLVED', attemptId: recovered.attemptId });
  });

  const cancel = (attemptId: string, organizationId = ORG) =>
    request(httpUrl).post(`${base}/attempts/${attemptId}/cancel`).set('x-test-org', organizationId);

  it('stops a running attempt for an operator without its token or an Alert, then admits the next begin at once', async () => {
    const range = { from: '2026-07-16', to: '2026-07-16' };
    const attempt = await begin(range);
    await cancel(attempt.attemptId, randomUUID()).expect(404);
    const stopped = (await cancel(attempt.attemptId).expect(200)).body;
    expect(stopped).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(stopped).not.toHaveProperty('attemptToken');
    expect(await prisma.alert.count({ where: { organizationId: ORG } })).toBe(0);
    await request(httpUrl).get(`${base}/attempts/${attempt.attemptId}/control`).expect(409);
    expect((await cancel(attempt.attemptId).expect(200)).body).toEqual(stopped);
    const next = await begin(range);
    expect(next.state).toBe('RUNNING');
    expect(next.attemptId).not.toBe(attempt.attemptId);
  });

  it('settles an operator stop after the lease passed as expiry with its Alert and leaves a COMPLETE attempt unchanged', async () => {
    const range = { from: '2026-07-16', to: '2026-07-16' };
    const expired = await begin(range);
    await prisma.sourceImportRun.update({
      where: { id: expired.attemptId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect((await cancel(expired.attemptId).expect(200)).body).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: expired.attemptId } }))
      .resolves.toMatchObject({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' });
    await expect(
      prisma.alert.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: ORG,
            dedupeKey: SELLPIA_SALES_ALERT_DEDUPE_KEY,
          },
        },
      }),
    ).resolves.toMatchObject({ status: 'OPEN', attemptId: expired.attemptId });

    const completed = await begin(range);
    const completedControl = await control(completed.attemptId);
    await complete(completed.attemptId, completedControl.attemptToken, payload(range));
    const view = (await request(httpUrl).get(`${base}/attempts/${completed.attemptId}`).expect(200)).body;
    expect(view.state).toBe('COMPLETE');
    expect((await cancel(completed.attemptId).expect(200)).body).toEqual(view);
  });

  it('reads the latest attempt and the latest COMPLETE collection for the organization', async () => {
    const read = async (organizationId = ORG) =>
      SellpiaSalesSourceStatusSchema.parse(
        (await request(httpUrl).get(`${base}/source`).set('x-test-org', organizationId).expect(200)).body,
      );
    expect(await read()).toEqual({ latestAttempt: null, latestComplete: null });

    const range = { from: '2026-07-16', to: '2026-07-17' };
    const first = await begin(range);
    expect(await read()).toMatchObject({
      latestAttempt: {
        attemptId: first.attemptId,
        state: 'RUNNING',
        plan: { range },
        errorCode: null,
        errorMessage: null,
      },
      latestComplete: null,
    });
    const firstControl = await control(first.attemptId);
    await complete(first.attemptId, firstControl.attemptToken, payload(range));

    const refresh = await begin(range);
    expect(await read()).toMatchObject({
      latestAttempt: { attemptId: refresh.attemptId, state: 'RUNNING' },
      latestComplete: {
        attemptId: first.attemptId,
        plan: { range },
        businessDates: ['2026-07-16', '2026-07-17'],
        rowCount: 4,
        sellerCount: 1,
      },
    });
    await cancel(refresh.attemptId).expect(200);
    expect(await read()).toMatchObject({
      latestAttempt: {
        attemptId: refresh.attemptId,
        state: 'FAILED',
        errorCode: 'USER_CANCELLED',
        errorMessage: '운영자가 수집을 중단했습니다.',
      },
      latestComplete: { attemptId: first.attemptId },
    });
    expect(await read(randomUUID())).toEqual({ latestAttempt: null, latestComplete: null });
  });

  it('derives expired GET metadata without mutating the running database row', async () => {
    const attempt = await begin({ from: '2026-07-16', to: '2026-07-16' });
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const response = await request(httpUrl)
      .get(`${base}/attempts/${attempt.attemptId}`)
      .expect(200);
    expect(response.body).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    await expect(prisma.sourceImportRun.findUnique({ where: { id: attempt.attemptId } })).resolves.toMatchObject({
      status: 'running',
    });
  });

  /** KID-85 follow-up 3c — the screen shows these shares; it computes none. */
  it('publishes revenue shares, null over a zero denominator', async () => {
    const range = { from: '2026-07-16', to: '2026-07-17' };
    const attempt = await begin(range);
    const attemptControl = await control(attempt.attemptId);
    await complete(attempt.attemptId, attemptControl.attemptToken, payload(range));

    const response = await request(httpUrl)
      .get(`${base}?from=${range.from}&to=${range.to}`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalRevenue: 3_600,
      // Rocket sold nothing: its share of the total is a measured 0, while a
      // share of its own zero revenue does not exist.
      rocket: {
        revenue: 0,
        revenueShare: 0,
        daily: [
          { date: '2026-07-16', revenue: 0, revenueShare: null },
          { date: '2026-07-17', revenue: 0, revenueShare: null },
        ],
      },
      others: {
        revenue: 3_600,
        revenueShare: 100,
        daily: [
          { date: '2026-07-16', revenue: 1_200, revenueShare: 33 },
          { date: '2026-07-17', revenue: 2_400, revenueShare: 67 },
        ],
        malls: [{
          sellerId: '118',
          revenueShare: 100,
          daily: [
            { date: '2026-07-16', revenueShare: 33 },
            { date: '2026-07-17', revenueShare: 67 },
          ],
        }],
      },
    });
  });

  it('publishes no share over the zero total of a summary without coverage', async () => {
    const response = await request(httpUrl)
      .get(`${base}?from=2026-07-16&to=2026-07-17`)
      .expect(200);

    expect(response.body).toMatchObject({
      totalRevenue: 0,
      rocket: { revenueShare: null },
      others: { revenueShare: null },
    });
  });

  it('public summary hides RUNNING/FAILED attempts and retains the prior COMPLETE publication', async () => {
    const range = { from: '2026-07-16', to: '2026-07-17' };
    const first = await begin(range);
    const firstControl = await control(first.attemptId);
    await complete(first.attemptId, firstControl.attemptToken, payload(range));

    const firstSummary = await request(httpUrl)
      .get(`${base}?from=${range.from}&to=${range.to}`)
      .expect(200);
    expect(firstSummary.body).toMatchObject({
      range,
      totalRevenue: 3_600,
      hasData: true,
    });

    const running = await begin(range);
    const runningSummary = await request(httpUrl)
      .get(`${base}?from=${range.from}&to=${range.to}`)
      .expect(200);
    expect(runningSummary.body).toMatchObject({
      range,
      totalRevenue: 3_600,
      hasData: true,
    });
    expect(runningSummary.body.others.malls).toEqual([
      expect.objectContaining({ sellerId: '118', revenue: 3_600 }),
    ]);

    const runningControl = await control(running.attemptId);
    await request(httpUrl)
      .post(`${base}/attempts/${running.attemptId}/fail`)
      .set('X-Source-Attempt-Token', runningControl.attemptToken)
      .send({ errorCode: 'NETWORK', errorMessage: 'Provider unavailable.' })
      .expect(201);

    const failedSummary = await request(httpUrl)
      .get(`${base}?from=${range.from}&to=${range.to}`)
      .expect(200);
    expect(failedSummary.body).toMatchObject({
      range,
      totalRevenue: 3_600,
      hasData: true,
    });
    expect(failedSummary.body.others.malls).toEqual([
      expect.objectContaining({ sellerId: '118', revenue: 3_600 }),
    ]);
  });
});

function ads(date: string, adCost: number): CoupangAdsDailyRow {
  return { date, ad_cost: adCost };
}
