import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../../test-helpers/real-prisma';
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
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

const base = '/api/sellpia-sales';

describe('Sellpia sales source owner HTTP + disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let owner: SellpiaSalesSourceService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = new SellpiaSalesSourceService(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
    );
    const summary = new SellpiaSalesService(
      {
        aggregateCoupangAds: async () => ({
          spend: 0,
          revenue: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          orders: 0,
          hasData: false,
          lastObservedAt: null,
        }),
      } as never,
      owner,
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
    const published = await owner.readPublishedRows(ORG, range.from, range.to);
    expect(published).toHaveLength(4);
    expect(published.some((row) => row.sellerId === 'legacy-unowned')).toBe(false);
    expect(published).toContainEqual(expect.objectContaining({
      sellerId: '118',
      businessDate: new Date('2026-07-16T00:00:00.000Z'),
      revenueKrw: 1_200,
      qty: 2,
      costKrw: 700,
    }));
    expect(published.filter((row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID)).toHaveLength(2);
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

    const published = await owner.readPublishedRows(ORG, '2026-07-16', '2026-07-18');
    expect(published).toHaveLength(6);
    expect([...new Set(published.map((row) => row.businessDate.toISOString().slice(0, 10)))]).toEqual([
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ]);
    expect(published.filter((row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID)).toHaveLength(3);
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
