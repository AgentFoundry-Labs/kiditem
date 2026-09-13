import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { AdTrafficSourceController } from '../adapter/in/http/ad-traffic-source.controller';
import { AdTrafficSourceRepository } from '../adapter/out/repository/ad-traffic-source.repository';
import {
  AD_TRAFFIC_READ_PORT,
  AD_TRAFFIC_SOURCE_PORT,
} from '../application/port/in/ad-traffic-source.port';
import { currentBusinessDate } from '../domain/business-date';
import { readListingTrafficWindowFacts } from '../../channels/read/channel-listing-daily-facts';
import { WingTrafficAggregationRepositoryAdapter } from '../../analytics/dashboard/adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import type { INestApplication } from '@nestjs/common';

const base = '/api/ads/traffic';
const DAY_MS = 86_400_000;
const WING_URL = 'https://wing.coupang.com/tenants/business-insight/sales-analysis';

type Range = { startDate: string; endDate: string; url: string };
type Attempt = { attemptId: string; attemptToken: string };
type Summary = {
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  providerConversionRate: number | null;
};

const dateText = (value: Date): string => value.toISOString().slice(0, 10);
const closedDate = (): string => dateText(new Date(currentBusinessDate().getTime() - DAY_MS));
const dateShift = (date: string, days: number): string =>
  dateText(new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS));

function range(days = 1, endDate = closedDate()): Range {
  const startDate = dateShift(endDate, -(days - 1));
  return {
    startDate,
    endDate,
    url: `${WING_URL}?startDate=${startDate}&endDate=${endDate}`,
  };
}

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    visitors: 10,
    views: 20,
    cartAdds: 3,
    orders: 2,
    salesQty: 4,
    revenue: 300,
    providerConversionRate: 10,
    ...overrides,
  };
}

function row(externalOptionId: string, values: Partial<Omit<Summary, 'providerConversionRate'>> = {}) {
  return {
    vendorItemId: externalOptionId,
    visitors: values.visitors ?? 10,
    views: values.views ?? 20,
    cartAdds: values.cartAdds ?? 3,
    orders: values.orders ?? 2,
    salesQty: values.salesQty ?? 4,
    revenue: values.revenue ?? 300,
  };
}

function rawSummary(label: string, values: Summary = summary()) {
  return {
    source: 'wing.summary.body',
    label,
    summaryMetrics: {
      totalUniqueVisitor: values.visitors,
      totalPageViews: values.views,
      totalAddToCart: values.cartAdds,
      totalOrders: values.orders,
      totalUnitsSold: values.salesQty,
      totalGmv: values.revenue,
      pvToOrder: values.providerConversionRate === null
        ? null
        : values.providerConversionRate / 100,
    },
  };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('Wing traffic source incoming HTTP + disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let accountId: string;
  let listingId: string;
  let optionId: string;
  let owner: AdTrafficSourceRepository;
  let alerts: SourceFailureAlerts;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(prisma as never);
    owner = new AdTrafficSourceRepository(prisma as never, alerts);
    const module = await Test.createTestingModule({
      controllers: [AdTrafficSourceController],
      providers: [
        { provide: AD_TRAFFIC_SOURCE_PORT, useValue: owner },
        { provide: AD_TRAFFIC_READ_PORT, useValue: owner },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    app.use(json({ limit: '25mb' }));
    app.setGlobalPrefix('api');
    app.use((
      req: { headers: Record<string, string>; authUser?: unknown },
      _res: unknown,
      next: () => void,
    ) => {
      req.authUser = {
        id: USER,
        organizationId: req.headers['x-test-org'] ?? ORG,
      };
      next();
    });
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
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Primary Wing',
        isPrimary: true,
        vendorId: 'VENDOR-A',
      },
    });
    accountId = account.id;
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        externalId: 'EXT-TRAFFIC',
      },
    });
    listingId = listing.id;
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: '1001',
        isActive: true,
      },
    });
    optionId = option.id;
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        channel: 'coupang',
        externalId: 'EXT-TRAFFIC',
        businessDate: new Date(`${closedDate()}T00:00:00.000Z`),
        adSpend: 77,
        adRevenue: 88,
        adImpressions: 99,
        adClicks: 11,
        adConversions: 12,
        adOrders: 13,
        adCoverageStatus: 'OBSERVED',
      },
    });
  });

  async function begin(plan: Range = range(), organizationId = ORG): Promise<{ attempt: Attempt; control: any }> {
    const response = await request(httpUrl)
      .post(`${base}/attempts`)
      .set('Idempotency-Key', randomUUID())
      .set('x-test-org', organizationId)
      .send({ channelAccountId: accountId, ...plan })
      .expect(201);
    const control = await request(httpUrl)
      .get(`${base}/attempts/${response.body.attemptId}/control`)
      .set('x-test-org', organizationId)
      .expect(200);
    return {
      attempt: { ...response.body, attemptToken: control.body.attemptToken },
      control: control.body,
    };
  }

  function dailyReceipt(
    attempt: Attempt,
    plan: Range,
    businessDate: string,
    pageIndex: number,
    expectedPages: number,
    data: Array<Record<string, unknown>>,
    values: Summary = summary(),
    options: { includeSummary?: boolean; terminal?: boolean; key?: string } = {},
  ) {
    const terminal = options.terminal ?? pageIndex === expectedPages;
    return {
      key: options.key ?? `${attempt.attemptId}:daily:${businessDate}:${pageIndex}`,
      capturedAt: `${businessDate}T01:00:00.000Z`,
      url: plan.url,
      providerVendorId: 'VENDOR-A',
      kind: 'daily_page' as const,
      filterScope: 'ALL_NORMAL_RFM' as const,
      businessDate,
      startDate: businessDate,
      endDate: businessDate,
      period: 1 as const,
      pageIndex,
      proof: {
        expectedPages,
        visitedPages: Array.from({ length: pageIndex }, (_, index) => index + 1),
        terminalPageObserved: terminal,
        verified: true,
        complete: terminal,
        ...(data.length === 0 && expectedPages === 1 ? { explicitEmpty: true } : {}),
      },
      data,
      ...(options.includeSummary === false || pageIndex !== 1
        ? {}
        : { accountSummary: values, accountSummaryRaw: rawSummary(`daily:${businessDate}`, values) }),
    };
  }

  function periodReceipt(attempt: Attempt, plan: Range, values: Summary = summary()) {
    const days = Math.round((Date.parse(`${plan.endDate}T00:00:00.000Z`) - Date.parse(`${plan.startDate}T00:00:00.000Z`)) / DAY_MS) + 1;
    return {
      key: `${attempt.attemptId}:period`,
      capturedAt: `${plan.endDate}T02:00:00.000Z`,
      url: plan.url,
      providerVendorId: 'VENDOR-A',
      kind: 'period_summary' as const,
      filterScope: 'ALL_NORMAL_RFM' as const,
      startDate: plan.startDate,
      endDate: plan.endDate,
      period: days,
      accountSummary: values,
      accountSummaryRaw: rawSummary('period', values),
    };
  }

  function upload(
    attempt: Attempt,
    sequence: number,
    receipt: Record<string, unknown>,
    organizationId = ORG,
  ) {
    return request(httpUrl)
      .put(`${base}/attempts/${attempt.attemptId}/receipts/${sequence}`)
      .set('x-test-org', organizationId)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send(receipt);
  }

  async function complete(attempt: Attempt, expectedStatus = 201, organizationId = ORG) {
    const control = (
      await request(httpUrl)
        .get(`${base}/attempts/${attempt.attemptId}/control`)
        .set('x-test-org', organizationId)
        .expect(200)
    ).body;
    return request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/complete`)
      .set('x-test-org', organizationId)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send({ manifestChecksum: control.manifestChecksum })
      .expect(expectedStatus);
  }

  async function collectOne(
    plan: Range,
    values: Summary = summary(),
    data: Array<Record<string, unknown>> = [row('1001')],
  ) {
    const started = await begin(plan);
    const date = plan.startDate;
    await upload(started.attempt, 0, dailyReceipt(started.attempt, plan, date, 1, 1, data, values)).expect(200);
    await upload(started.attempt, 100, periodReceipt(started.attempt, plan, values)).expect(200);
    await complete(started.attempt, 201);
    return started.attempt;
  }

  async function collectRange(plan: Range, values: Summary = summary()) {
    const started = await begin(plan);
    const days = Math.round((Date.parse(`${plan.endDate}T00:00:00.000Z`) - Date.parse(`${plan.startDate}T00:00:00.000Z`)) / DAY_MS) + 1;
    for (let index = 0; index < days; index += 1) {
      const businessDate = dateShift(plan.startDate, index);
      await upload(
        started.attempt,
        index * 100,
        dailyReceipt(started.attempt, plan, businessDate, 1, 1, [row('1001', { visitors: values.visitors })], values),
      ).expect(200);
    }
    await upload(started.attempt, days * 100, periodReceipt(started.attempt, plan, values)).expect(200);
    await complete(started.attempt, 201);
    return started.attempt;
  }

  it('publishes daily account summaries, matched/unmatched options, raw evidence, and independent ad facts', async () => {
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId,
        externalOptionId: '1002',
        isActive: true,
      },
    });
    const plan = range();
    const started = await begin(plan);
    await upload(
      started.attempt,
      0,
      dailyReceipt(
        started.attempt,
        plan,
        plan.startDate,
        1,
        2,
        [row('1001', { visitors: 7, views: 11, revenue: 120 }), row('1002', { visitors: 3, views: 9, revenue: 80 })],
        summary({ visitors: 10, views: 20, revenue: 200 }),
      ),
    ).expect(200);
    await upload(
      started.attempt,
      1,
      dailyReceipt(
        started.attempt,
        plan,
        plan.startDate,
        2,
        2,
        [row('9999', { visitors: 1, views: 2, revenue: 5 })],
        summary(),
      ),
    ).expect(200);
    await upload(started.attempt, 100, periodReceipt(started.attempt, plan, summary({ visitors: 10, views: 20, revenue: 200 }))).expect(200);
    await complete(started.attempt, 201);

    const published = await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId })
      .expect(200);
    expect(published.body).toMatchObject({
      channelAccountId: accountId,
      attemptId: started.attempt.attemptId,
      coverage: { targetDays: 1, completedDays: 1, missingDates: [] },
      accountDaily: [{ businessDate: plan.startDate, visitors: 10, views: 20, revenue: 200 }],
      periodSummary: { startDate: plan.startDate, endDate: plan.endDate },
      reconciliation: {
        views: { dailySum: 20, periodValue: 20 },
        revenue: { dailySum: 200, periodValue: 200 },
      },
    });
    expect(published.body.optionDaily).toHaveLength(3);
    expect(published.body.optionDaily.find((value: any) => value.externalOptionId === '9999')).toMatchObject({
      listingId: null,
      listingOptionId: null,
    });

    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toMatchObject({
      adSpend: 77,
      adRevenue: 88,
      trafficVisitors: 10,
      trafficViews: 20,
      trafficRevenue: 200,
      trafficCoverageStatus: 'OBSERVED',
    });
    const run = await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: started.attempt.attemptId } });
    expect(run.qualityReport).toMatchObject({ rowCount: 3, matchedCount: 2, unmatchedCount: 1 });
    // The account summaries stay in the owner's receipts; the retired Wing
    // account KPI blob is no longer written.
    expect(run.qualityReport).not.toHaveProperty('dashboardSummaryPublished');
    await expect(prisma.channelAccountDailyKpiSnapshot.count({
      where: { organizationId: ORG },
    })).resolves.toBe(0);
  });

  it('requires every daily date and preserves repeated option rows across days', async () => {
    const plan = range(2);
    const started = await begin(plan);
    await upload(started.attempt, 0, dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001', { visitors: 4 })], summary({ visitors: 4 }))).expect(200);
    await upload(started.attempt, 100, dailyReceipt(started.attempt, plan, dateShift(plan.startDate, 1), 1, 1, [row('1001', { visitors: 6 })], summary({ visitors: 6 }))).expect(200);
    await upload(started.attempt, 200, periodReceipt(started.attempt, plan, summary({ visitors: 10, views: 40, cartAdds: 6, orders: 4, salesQty: 8, revenue: 600 }))).expect(200);
    await complete(started.attempt, 201);
    const published = await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId })
      .expect(200);
    expect(published.body.coverage).toMatchObject({ targetDays: 2, completedDays: 2, missingDates: [] });
    expect(published.body.accountDaily).toHaveLength(2);
    expect(published.body.optionDaily.filter((value: any) => value.externalOptionId === '1001')).toHaveLength(2);
  });

  it('keeps an explicit-empty date measured when another confirmed date has rows', async () => {
    const plan = range(2);
    const populatedDate = plan.endDate;
    const populated = summary({
      visitors: 6,
      views: 12,
      cartAdds: 2,
      orders: 1,
      salesQty: 2,
      revenue: 180,
      providerConversionRate: 5,
    });
    const zero = summary({
      visitors: 0,
      views: 0,
      cartAdds: 0,
      orders: 0,
      salesQty: 0,
      revenue: 0,
      providerConversionRate: null,
    });
    const startedRecord = await begin(plan);

    await upload(
      startedRecord.attempt,
      0,
      dailyReceipt(startedRecord.attempt, plan, plan.startDate, 1, 1, [], zero),
    ).expect(200);
    await upload(
      startedRecord.attempt,
      100,
      dailyReceipt(
        startedRecord.attempt,
        plan,
        populatedDate,
        1,
        1,
        [row('1001', populated)],
        populated,
      ),
    ).expect(200);
    await upload(
      startedRecord.attempt,
      200,
      periodReceipt(startedRecord.attempt, plan, populated),
    ).expect(200);
    await complete(startedRecord.attempt, 201);

    const facts = await readListingTrafficWindowFacts(prisma, {
      organizationId: ORG,
      listingIds: [listingId],
      from: new Date(`${plan.startDate}T00:00:00.000Z`),
      to: new Date(`${dateShift(plan.endDate, 1)}T00:00:00.000Z`),
    });
    expect(facts.observedDates).toEqual([populatedDate]);
    expect(facts.coverage).toEqual({
      includedDates: [plan.startDate, populatedDate],
      invalidDates: [],
      missingDates: [],
    });
    expect(facts.totals).toEqual({
      visitors: 6,
      views: 12,
      cartAdds: 2,
      orders: 1,
      salesQty: 2,
      revenue: 180,
    });

    const dashboard = new WingTrafficAggregationRepositoryAdapter(prisma as never);
    await expect(dashboard.aggregateTraffic(ORG, {
      sourceClass: 'closed_day_clipped',
      selectedDates: [plan.startDate, populatedDate],
      queryWindow: {
        from: new Date(`${plan.startDate}T00:00:00.000Z`),
        to: new Date(`${dateShift(plan.endDate, 1)}T00:00:00.000Z`),
      },
      knownThrough: populatedDate,
    })).resolves.toMatchObject({
      revenue: 180,
      orders: 1,
      visitors: 3,
      isCollected: true,
      hasData: true,
      coverage: {
        targetDays: 2,
        completedDays: 2,
        missingDates: [],
      },
    });
  });

  /**
   * Coupang publishes traffic and sales at different times, so the last day of a
   * requested window is routinely not ready while every earlier day is. The
   * collection used to throw the whole window away for that one day. A date that
   * verifies complete on its own is confirmed even when a later date is not.
   */
  describe('confirmed days', () => {
    it('publishes the confirmed days and leaves the unready one missing', async () => {
      const plan = range(2);
      const confirmed = { ...plan, endDate: plan.startDate };
      const started = await begin(plan);
      await upload(started.attempt, 0, dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001', { visitors: 4 })], summary({ visitors: 4 }))).expect(200);
      // The period summary is reconciliation evidence for what was confirmed,
      // so it covers the confirmed day rather than the requested window.
      // The period sequence stays keyed to the plan (periodDays * 100) even when
      // the summary covers fewer days, so it is stable across attempts.
      await upload(started.attempt, 200, periodReceipt(started.attempt, confirmed, summary({ visitors: 4 }))).expect(200);

      await complete(started.attempt, 201);

      const run = await prisma.sourceImportRun.findUniqueOrThrow({
        where: { id: started.attempt.attemptId },
        select: { status: true, coverageStartDate: true, coverageEndDate: true },
      });
      expect(run.status).toBe('completed');
      // The manifest records the confirmed window, not the requested one.
      expect(run.coverageStartDate?.toISOString().slice(0, 10)).toBe(plan.startDate);
      expect(run.coverageEndDate?.toISOString().slice(0, 10)).toBe(plan.startDate);

      const published = await request(httpUrl)
        .get(`${base}/published`)
        .set('x-test-org', ORG)
        .query({ channelAccountId: accountId, from: plan.startDate, to: plan.endDate })
        .expect(200);
      expect(published.body.coverage).toMatchObject({
        targetDays: 2,
        completedDays: 1,
        missingDates: [plan.endDate],
      });
      expect(published.body.accountDaily).toHaveLength(1);

      const status = await request(httpUrl)
        .get(`${base}/source`)
        .set('x-test-org', ORG)
        .query({ channelAccountId: accountId })
        .expect(200);
      expect(status.body).toMatchObject({
        ready: false,
        latestComplete: { attemptId: started.attempt.attemptId },
      });
    });

    it('publishes no period value to reconcile when the confirmed days do not cover the window', async () => {
      const plan = range(2);
      const confirmed = { ...plan, endDate: plan.startDate };
      const started = await begin(plan);
      await upload(started.attempt, 0, dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001', { visitors: 4 })], summary({ visitors: 4 }))).expect(200);
      await upload(started.attempt, 200, periodReceipt(started.attempt, confirmed, summary({ visitors: 4 }))).expect(200);
      await complete(started.attempt, 201);

      const published = await request(httpUrl)
        .get(`${base}/published`)
        .set('x-test-org', ORG)
        .query({ channelAccountId: accountId, from: plan.startDate, to: plan.endDate })
        .expect(200);
      expect(published.body.coverage).toMatchObject({ targetDays: 2, completedDays: 1 });
      // The exact-range period summary still travels as provenance, but a sum
      // over one of the two days is not comparable with it.
      expect(published.body.periodSummary).toMatchObject({ sourceAttemptId: started.attempt.attemptId });
      for (const metric of ['views', 'cartAdds', 'orders', 'salesQty', 'revenue']) {
        expect(published.body.reconciliation[metric].dailySum, metric).not.toBeNull();
        expect(published.body.reconciliation[metric].periodValue, metric).toBeNull();
      }
    });

    it('refuses a submission that confirms no date at all', async () => {
      const plan = range(2);
      const started = await begin(plan);
      await upload(started.attempt, 200, periodReceipt(started.attempt, plan)).expect(200);

      await complete(started.attempt, 409);

      await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: started.attempt.attemptId } }))
        .resolves.toMatchObject({ status: 'running' });
    });

    it('refuses a date the owner never planned', async () => {
      const plan = range(2);
      const outside = dateShift(plan.startDate, -1);
      const started = await begin(plan);

      // Confirming a subset never lets a client widen the window: an out-of-plan
      // date is refused on upload, before it can reach the terminal submission.
      await upload(
        started.attempt,
        300,
        dailyReceipt(started.attempt, plan, outside, 1, 1, [row('1001')], summary(), { key: `${started.attempt.attemptId}:daily:${outside}:1` }),
      ).expect(409);
    });

    it('refuses pages for a date outside the window the collection declared', async () => {
      const plan = range(2);
      const started = await begin(plan);
      await upload(started.attempt, 0, dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001')], summary())).expect(200);
      // A page for the second day, while the summary declares only the first.
      // Accepting this would drop the page silently, which is how an incomplete
      // day would come to read as an absent one.
      await upload(started.attempt, 100, dailyReceipt(started.attempt, plan, dateShift(plan.startDate, 1), 1, 1, [row('1001')], summary())).expect(200);
      await upload(started.attempt, 200, periodReceipt(started.attempt, { ...plan, endDate: plan.startDate })).expect(200);

      await complete(started.attempt, 409);
    });

    it('refuses a period summary wider than the plan', async () => {
      const plan = range(2);
      const started = await begin(plan);

      await upload(
        started.attempt,
        200,
        periodReceipt(started.attempt, { ...plan, endDate: dateShift(plan.endDate, 1) }),
      ).expect(409);
    });
  });

  it('rejects a missing-date terminal attempt, then resumes the same staged run', async () => {
    const plan = range(2);
    const started = await begin(plan);
    await upload(started.attempt, 0, dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001')], summary())).expect(200);
    await upload(started.attempt, 200, periodReceipt(started.attempt, plan, summary({ visitors: 20, views: 40, cartAdds: 6, orders: 4, salesQty: 8, revenue: 600 }))).expect(200);
    await complete(started.attempt, 409);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: started.attempt.attemptId } })).resolves.toMatchObject({ status: 'running' });
    await upload(started.attempt, 100, dailyReceipt(started.attempt, plan, dateShift(plan.startDate, 1), 1, 1, [row('1001')], summary())).expect(200);
    await complete(started.attempt, 201);
    const published = await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId })
      .expect(200);
    expect(published.body.coverage).toMatchObject({ targetDays: 2, completedDays: 2, missingDates: [] });
  });

  it('unions complete intervals and retains stale exact-period provenance', async () => {
    const oldPlan = range(2, dateShift(closedDate(), -1));
    const newerPlan = range(4, closedDate());
    const oldAttempt = await collectRange(oldPlan, summary({ visitors: 4, views: 8, revenue: 40 }));
    await collectRange(newerPlan, summary({ visitors: 6, views: 12, revenue: 60 }));
    const union = await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId })
      .expect(200);
    expect(union.body.coverage).toMatchObject({ targetDays: 4, completedDays: 4, missingDates: [] });
    expect(union.body.accountDaily).toHaveLength(4);
    const exact = await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId, from: oldPlan.startDate, to: oldPlan.endDate })
      .expect(200);
    expect(exact.body.periodSummary).toMatchObject({
      sourceAttemptId: oldAttempt.attemptId,
      startDate: oldPlan.startDate,
      endDate: oldPlan.endDate,
    });
    expect(exact.body.reconciliation.views.periodValue).toBeNull();
  });

  it('lets a complete explicit-empty replacement reset disappeared Wing rows without touching ad facts', async () => {
    const plan = range();
    await collectOne(plan, summary({ visitors: 8, views: 9, revenue: 99 }));
    const replacement = await begin(plan);
    await upload(replacement.attempt, 0, dailyReceipt(replacement.attempt, plan, plan.startDate, 1, 1, [], summary({ visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0, providerConversionRate: null }))).expect(200);
    await upload(replacement.attempt, 100, periodReceipt(replacement.attempt, plan, summary({ visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0, providerConversionRate: null }))).expect(200);
    await complete(replacement.attempt, 201);
    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toMatchObject({
      trafficVisitors: 0,
      trafficViews: 0,
      trafficRevenue: 0,
      adSpend: 77,
      adRevenue: 88,
      trafficCoverageStatus: 'OBSERVED',
      metaJson: { 'traffic.currentSource': 'wing.traffic' },
    });
    const published = await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId })
      .expect(200);
    expect(published.body.accountDaily[0]).toMatchObject({ visitors: 0, views: 0, revenue: 0 });
    expect(published.body.optionDaily).toHaveLength(0);
  });

  it('publishes provider-backed empty coverage for the canonical reader when no listing row exists', async () => {
    await prisma.channelListing.update({
      where: { id: listingId },
      data: { isActive: false },
    });
    const plan = range();
    const started = await begin(plan);
    const zero = summary({
      visitors: 0,
      views: 0,
      cartAdds: 0,
      orders: 0,
      salesQty: 0,
      revenue: 0,
      providerConversionRate: null,
    });
    await upload(
      started.attempt,
      0,
      dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [], zero),
    ).expect(200);
    await upload(
      started.attempt,
      100,
      periodReceipt(started.attempt, plan, zero),
    ).expect(200);
    await complete(started.attempt, 201);

    await expect(prisma.channelListingDailySnapshot.count({
      where: { organizationId: ORG, trafficObservedAt: { not: null } },
    })).resolves.toBe(0);
    const facts = await readListingTrafficWindowFacts(prisma, {
      organizationId: ORG,
      from: new Date(`${plan.startDate}T00:00:00.000Z`),
      to: new Date(`${dateShift(plan.startDate, 1)}T00:00:00.000Z`),
    });
    expect(facts).toMatchObject({
      rows: [],
      observedDates: [],
      coverage: {
        includedDates: [plan.startDate],
        invalidDates: [],
        missingDates: [],
      },
      totals: {
        visitors: 0,
        views: 0,
        cartAdds: 0,
        orders: 0,
        salesQty: 0,
        revenue: 0,
      },
    });
  });

  it('re-publishes a 534-option day with bounded statements and preserves shared fact namespaces', async () => {
    const plan = range();
    const oldObservedAt = new Date(`${plan.startDate}T00:30:00.000Z`);
    const extraListings = Array.from({ length: 533 }, (_, index) => ({
      listingId: randomUUID(),
      externalId: `EXT-PERF-${index + 1}`,
      optionId: randomUUID(),
      externalOptionId: String(index + 1002),
    }));
    await prisma.channelListing.createMany({
      data: extraListings.map((entry) => ({
        id: entry.listingId,
        organizationId: ORG,
        channelAccountId: accountId,
        externalId: entry.externalId,
      })),
    });
    await prisma.channelListingOption.createMany({
      data: extraListings.map((entry) => ({
        id: entry.optionId,
        organizationId: ORG,
        listingId: entry.listingId,
        externalOptionId: entry.externalOptionId,
        isActive: true,
      })),
    });

    const priorMeta = {
      'wing.traffic': { sourceAttemptId: 'previous-wing-attempt' },
      'ad.campaign': { spend: 17 },
      'inventory.stock': { available: 4 },
      'traffic.csv_upload': { fileName: 'traffic.csv' },
      'traffic.currentSource': 'traffic.csv_upload',
    };
    await prisma.channelListingDailySnapshot.update({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
      data: {
        trafficVisitors: 9,
        trafficViews: 8,
        trafficCartAdds: 7,
        trafficOrders: 6,
        trafficSalesQty: 5,
        trafficRevenue: 4,
        trafficCoverageStatus: 'OBSERVED',
        trafficObservedAt: oldObservedAt,
        lastObservedAt: oldObservedAt,
        metaJson: priorMeta,
      },
    });
    const oldRows = extraListings.map((entry, index) => ({
      organizationId: ORG,
      listingId: entry.listingId,
      channel: 'coupang',
      externalId: entry.externalId,
      businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
      trafficVisitors: 9,
      trafficViews: 8,
      trafficCartAdds: 7,
      trafficOrders: 6,
      trafficSalesQty: 5,
      trafficRevenue: 4,
      trafficCoverageStatus: 'OBSERVED',
      trafficObservedAt: oldObservedAt,
      lastObservedAt: oldObservedAt,
      metaJson: index === 0
        ? {
            'wing.traffic': { sourceAttemptId: 'previous-wing-attempt' },
            'ad.campaign': { spend: 17 },
            'inventory.stock': { available: 4 },
          }
        : index === 1
          ? {
              'wing.traffic': { sourceAttemptId: 'previous-wing-attempt' },
              'traffic.csv_upload': { fileName: 'traffic.csv' },
              'traffic.currentSource': 'traffic.csv_upload',
            }
          : { 'wing.traffic': { sourceAttemptId: 'previous-wing-attempt' } },
    }));
    await prisma.channelListingDailySnapshot.createMany({ data: oldRows });
    const previousFirst = await prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    });

    const omittedReset = extraListings[0]!;
    const omittedCsv = extraListings[1]!;
    const stagedRows = [
      row('1001', { visitors: 12, views: 24, cartAdds: 2, orders: 3, salesQty: 4, revenue: 120 }),
      ...extraListings
        .filter((entry) => entry !== omittedReset && entry !== omittedCsv)
        .map((entry, index) => row(entry.externalOptionId, {
          visitors: index + 1,
          views: (index + 1) * 2,
          cartAdds: 1,
          orders: 1,
          salesQty: 1,
          revenue: (index + 1) * 10,
        })),
    ];
    const started = await begin(plan);
    await upload(
      started.attempt,
      0,
      dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, stagedRows, summary()),
    ).expect(200);
    await upload(started.attempt, 100, periodReceipt(started.attempt, plan)).expect(200);

    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: started.attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running' });
    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toMatchObject({ trafficVisitors: 9, trafficRevenue: 4 });

    const control = (
      await request(httpUrl)
        .get(`${base}/attempts/${started.attempt.attemptId}/control`)
        .set('x-test-org', ORG)
        .expect(200)
    ).body;
    const measured = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
      log: [{ emit: 'event', level: 'query' }],
    });
    const statements: string[] = [];
    measured.$on('query', (event) => statements.push(event.query));
    try {
      const measuredOwner = new AdTrafficSourceRepository(
        measured as never,
        new SourceFailureAlerts(measured as never),
      );
      await measuredOwner.finalizeAttempt({
        organizationId: ORG,
        attemptId: started.attempt.attemptId,
        attemptToken: started.attempt.attemptToken,
        manifestChecksum: control.manifestChecksum,
      });
    } finally {
      await measured.$disconnect();
    }

    expect(statements.filter((sql) => /INSERT INTO channel_listing_daily_snapshots/i.test(sql)))
      .toHaveLength(1);
    // The retired Wing account KPI blob is no longer written.
    expect(statements.filter((sql) => /INSERT INTO channel_account_daily_kpi_snapshots/i.test(sql)))
      .toHaveLength(0);
    expect(statements.filter((sql) => /UPDATE channel_listing_daily_snapshots/i.test(sql)))
      .toHaveLength(0);

    const publishedFirst = await prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    });
    expect(publishedFirst).toMatchObject({
      id: previousFirst.id,
      trafficVisitors: 12,
      trafficViews: 24,
      trafficRevenue: 120,
      adSpend: 77,
      adRevenue: 88,
      metaJson: {
        'ad.campaign': { spend: 17 },
        'inventory.stock': { available: 4 },
        'traffic.csv_upload': { fileName: 'traffic.csv' },
        'traffic.currentSource': 'wing.traffic',
      },
    });
    expect(publishedFirst.firstObservedAt.getTime()).toBe(previousFirst.firstObservedAt.getTime());
    expect(publishedFirst.createdAt.getTime()).toBe(previousFirst.createdAt.getTime());

    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId: omittedReset.listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toMatchObject({
      trafficVisitors: 0,
      trafficViews: 0,
      trafficRevenue: 0,
      adSpend: 0,
      metaJson: {
        'ad.campaign': { spend: 17 },
        'inventory.stock': { available: 4 },
        'traffic.currentSource': 'wing.traffic',
      },
    });
    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId: omittedCsv.listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toMatchObject({
      trafficVisitors: 9,
      trafficRevenue: 4,
      metaJson: { 'traffic.currentSource': 'traffic.csv_upload' },
    });
  });

  it('rolls back listing and account publication when Alert resolution fails, then retries the same attempt', async () => {
    const plan = range();
    await collectOne(
      plan,
      summary({ visitors: 5, views: 6, revenue: 50 }),
      [row('1001', { visitors: 5, views: 6, revenue: 50 })],
    );
    const baselineListing = await prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    });
    const replacement = await begin(plan);
    const replacementValues = summary({ visitors: 99, views: 100, revenue: 990 });
    await upload(
      replacement.attempt,
      0,
      dailyReceipt(
        replacement.attempt,
        plan,
        plan.startDate,
        1,
        1,
        [row('1001', { visitors: 99, views: 100, revenue: 990 })],
        replacementValues,
      ),
    ).expect(200);
    await upload(
      replacement.attempt,
      100,
      periodReceipt(replacement.attempt, plan, replacementValues),
    ).expect(200);

    vi.spyOn(alerts, 'resolveSourceFailure').mockRejectedValueOnce(
      new Error('Injected Alert resolution failure'),
    );
    await complete(replacement.attempt, 500);

    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: replacement.attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running', importedAt: null, contentChecksum: null });
    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toEqual(baselineListing);

    await complete(replacement.attempt, 201);
    await complete(replacement.attempt, 201);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: replacement.attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'completed' });
    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toMatchObject({ trafficVisitors: 99, trafficViews: 100, trafficRevenue: 990 });
  });

  it('fails closed when a shared Wing/CSV row is explicitly marked CSV-current', async () => {
    const plan = range();
    const firstAttempt = await collectOne(
      plan,
      summary({ visitors: 8, views: 9, revenue: 99 }),
      [row('1001', { visitors: 8, views: 9, revenue: 99 })],
    );
    await prisma.channelListingDailySnapshot.update({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
      data: {
        metaJson: {
          'wing.traffic': {
            grain: 'listing_option_sum',
            scope: 'matched_listings',
            periodDays: 1,
            businessDate: plan.startDate,
            sourceAttemptId: firstAttempt.attemptId,
          },
          'traffic.csv_upload': { source: 'traffic_csv_upload', data: { fileName: 'traffic.csv' } },
          'traffic.currentSource': 'traffic.csv_upload',
        },
      },
    });
    const replacement = await begin(plan);
    await upload(replacement.attempt, 0, dailyReceipt(replacement.attempt, plan, plan.startDate, 1, 1, [], summary({ visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0, providerConversionRate: null }))).expect(200);
    await upload(replacement.attempt, 100, periodReceipt(replacement.attempt, plan, summary({ visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0, providerConversionRate: null }))).expect(200);
    await complete(replacement.attempt, 201);
    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toMatchObject({ trafficVisitors: 8, trafficViews: 9, trafficRevenue: 99, adSpend: 77 });
  });

  it('keeps a prior complete publication when a staged replacement fails', async () => {
    const plan = range();
    await collectOne(plan, summary({ visitors: 5, views: 6, revenue: 50 }), [row('1001', { visitors: 5 })]);
    const replacement = await begin(plan);
    await upload(replacement.attempt, 0, dailyReceipt(replacement.attempt, plan, plan.startDate, 1, 2, [row('1001', { visitors: 99 })], summary({ visitors: 99 }))).expect(200);
    await request(httpUrl)
      .post(`${base}/attempts/${replacement.attempt.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('X-Source-Attempt-Token', replacement.attempt.attemptToken)
      .send({ code: 'PROVIDER_ABORTED', message: 'Provider stopped before terminal proof.' })
      .expect(201);
    await expect(prisma.channelListingDailySnapshot.findUniqueOrThrow({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        },
      },
    })).resolves.toMatchObject({ trafficVisitors: 5, adSpend: 77 });
    await expect(prisma.alert.count({ where: { organizationId: ORG, sourceType: 'coupang_wing_traffic' } })).resolves.toBe(1);
  });

  it('rejects duplicate in-day options and supports identical receipt/terminal replay', async () => {
    const plan = range();
    const started = await begin(plan);
    const first = dailyReceipt(started.attempt, plan, plan.startDate, 1, 2, [row('1001')], summary());
    await upload(started.attempt, 0, first).expect(200);
    await upload(started.attempt, 1, { ...first, key: `${started.attempt.attemptId}:daily:${plan.startDate}:2`, pageIndex: 2, proof: { ...first.proof, visitedPages: [1, 2], terminalPageObserved: true, complete: true } }).expect(409);
    await upload(started.attempt, 0, first).expect(200);
    const changed = { ...first, key: `${started.attempt.attemptId}:changed`, data: [row('1001', { visitors: 99 })] };
    await upload(started.attempt, 0, changed).expect(409);
    await request(httpUrl)
      .post(`${base}/attempts/${started.attempt.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('X-Source-Attempt-Token', started.attempt.attemptToken)
      .send({ code: 'TEST_ABORTED', message: 'Conflicting replay cases are isolated.' })
      .expect(201);
    // The prior sequence already owns page one; use a fresh attempt for a
    // compact terminal replay check after the conflict cases above.
    const replay = await begin(plan);
    const terminal = dailyReceipt(replay.attempt, plan, plan.startDate, 1, 1, [row('1001')], summary());
    await upload(replay.attempt, 0, terminal).expect(200);
    await upload(replay.attempt, 100, periodReceipt(replay.attempt, plan)).expect(200);
    const done = await complete(replay.attempt, 201);
    expect(done.status).toBe(201);
    const replayed = await complete(replay.attempt, 201);
    expect(replayed.status).toBe(201);
    await request(httpUrl)
      .post(`${base}/attempts/${replay.attempt.attemptId}/complete`)
      .set('x-test-org', ORG)
      .set('X-Source-Attempt-Token', replay.attempt.attemptToken)
      .send({ manifestChecksum: digest('different') })
      .expect(409);
  });

  it('commits expiry and advertiser identity failures before returning conflict', async () => {
    const expiredAttempt = await begin();
    await prisma.sourceImportRun.update({
      where: { id: expiredAttempt.attempt.attemptId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await upload(expiredAttempt.attempt, 0, dailyReceipt(expiredAttempt.attempt, range(), closedDate(), 1, 1, [row('1001')], summary())).expect(409);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: expiredAttempt.attempt.attemptId } })).resolves.toMatchObject({ status: 'failed', errorCode: 'ATTEMPT_EXPIRED' });
    await expect(prisma.alert.count({ where: { organizationId: ORG, sourceType: 'coupang_wing_traffic', attemptId: expiredAttempt.attempt.attemptId } })).resolves.toBe(1);

    const identityAttempt = await begin();
    await prisma.channelAccount.update({ where: { id: accountId }, data: { vendorId: 'VENDOR-B' } });
    await upload(identityAttempt.attempt, 0, dailyReceipt(identityAttempt.attempt, range(), closedDate(), 1, 1, [row('1001')], summary())).expect(409);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: identityAttempt.attempt.attemptId } })).resolves.toMatchObject({ status: 'failed', errorCode: 'ADVERTISER_IDENTITY_MISMATCH' });
    await expect(prisma.alert.count({ where: { organizationId: ORG, sourceType: 'coupang_wing_traffic', attemptId: identityAttempt.attempt.attemptId } })).resolves.toBe(1);
  });

  it('fences attempts and reads by organization', async () => {
    await request(httpUrl)
      .post(`${base}/attempts`)
      .set('x-test-org', OTHER_ORG)
      .set('Idempotency-Key', randomUUID())
      .send({ channelAccountId: accountId, ...range() })
      .expect(404);
    await collectOne(range());
    await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', OTHER_ORG)
      .query({ channelAccountId: accountId })
      .expect(404);
  });

  it('reads a seeded v1 period as exact legacy evidence without treating it as a daily READY source', async () => {
    const plan = range();
    const observedAt = new Date(`${plan.endDate}T03:00:00.000Z`);
    const legacyPlan = {
      sourceType: 'coupang_wing_traffic' as const,
      parserVersion: 'wing-traffic-v1' as const,
      channelAccountId: accountId,
      expectedAdvertiserId: 'VENDOR-A',
      startDate: plan.startDate,
      endDate: plan.endDate,
      businessDate: plan.endDate,
      periodDays: 1,
      targetUrl: WING_URL,
    };
    const legacyPayload = {
      key: 'legacy:page:1',
      capturedAt: observedAt.toISOString(),
      url: WING_URL,
      startDate: plan.startDate,
      endDate: plan.endDate,
      period: 1,
      pageIndex: 1,
      proof: {
        expectedPages: 1,
        visitedPages: [1],
        terminalPageObserved: true,
        verified: true,
        complete: true,
      },
      data: [row('1001', { visitors: 7, views: 8, cartAdds: 2, orders: 1, salesQty: 2, revenue: 70 })],
      kpis: { visitor: { numValue: 7 } },
      summary: { visitors: 7, views: 8, orders: 1, revenue: 70 },
      adSummary: { spend: 11 },
    };
    const sourceRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'coupang_wing_traffic',
        channelAccountId: accountId,
        status: 'completed',
        parserVersion: 'wing-traffic-v1',
        freshnessGeneration: 1n,
        plan: legacyPlan,
        rowCount: 1,
        contentChecksum: digest(legacyPayload),
        importedAt: observedAt,
        lastVerifiedAt: observedAt,
        coverageStartDate: new Date(`${plan.startDate}T00:00:00.000Z`),
        coverageEndDate: new Date(`${plan.endDate}T00:00:00.000Z`),
      },
    });
    const scrapeRun = await prisma.channelScrapeRun.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        sourceImportRunId: sourceRun.id,
        channel: 'coupang',
        source: 'wing',
        pageType: 'traffic',
        parserVersion: 'wing-traffic-v1',
        businessDate: new Date(`${plan.endDate}T00:00:00.000Z`),
        periodStart: new Date(`${plan.startDate}T00:00:00.000Z`),
        periodEnd: new Date(`${plan.endDate}T00:00:00.000Z`),
        targetUrl: WING_URL,
        period: '1',
        status: 'complete',
        rowCount: 1,
        matchedCount: 1,
        finishedAt: observedAt,
      },
    });
    const snapshot = await prisma.channelScrapeSnapshot.create({
      data: {
        organizationId: ORG,
        sourceImportRunId: sourceRun.id,
        scrapeRunId: scrapeRun.id,
        channel: 'coupang',
        source: 'wing',
        pageType: 'traffic',
        businessDate: new Date(`${plan.endDate}T00:00:00.000Z`),
        observedAt,
        externalId: 'EXT-TRAFFIC',
        externalOptionId: '1001',
        listingId,
        listingOptionId: optionId,
        matchStatus: 'matched',
        rawJson: legacyPayload.data[0],
        normalizedJson: legacyPayload.data[0],
      },
    });
    const legacyReceipt = {
      sequence: 0,
      key: legacyPayload.key,
      checksum: digest(legacyPayload),
      pageIndex: 1,
      expectedPages: 1,
      rowCount: 1,
      matchedCount: 1,
      unmatchedCount: 0,
      snapshotIds: [snapshot.id],
      url: WING_URL,
      startDate: plan.startDate,
      endDate: plan.endDate,
      terminalPageObserved: true,
    };
    await prisma.channelScrapeChunk.create({
      data: {
        organizationId: ORG,
        scrapeRunId: scrapeRun.id,
        kind: 'traffic_page',
        sequence: 0,
        checksum: digest(legacyPayload),
        itemCount: 1,
        payload: legacyPayload,
        publicationJson: { receipt: legacyReceipt },
      },
    });
    await prisma.channelListingDailySnapshot.update({
      where: {
        organizationId_listingId_businessDate: {
          organizationId: ORG,
          listingId,
          businessDate: new Date(`${plan.endDate}T00:00:00.000Z`),
        },
      },
      data: {
        trafficVisitors: 7,
        trafficViews: 8,
        trafficCartAdds: 2,
        trafficOrders: 1,
        trafficSalesQty: 2,
        trafficRevenue: 70,
        trafficCoverageStatus: 'OBSERVED',
        trafficObservedAt: observedAt,
      },
    });
    // A second captured listing whose daily row never recorded a traffic
    // observation: the legacy read must drop it rather than borrow the row's
    // unrelated `lastObservedAt`.
    const unobservedListing = await prisma.channelListing.create({
      data: { organizationId: ORG, channelAccountId: accountId, externalId: 'EXT-TRAFFIC-UNOBSERVED' },
    });
    await prisma.channelScrapeSnapshot.create({
      data: {
        organizationId: ORG,
        sourceImportRunId: sourceRun.id,
        scrapeRunId: scrapeRun.id,
        channel: 'coupang',
        source: 'wing',
        pageType: 'traffic',
        businessDate: new Date(`${plan.endDate}T00:00:00.000Z`),
        observedAt,
        externalId: 'EXT-TRAFFIC-UNOBSERVED',
        externalOptionId: '1002',
        listingId: unobservedListing.id,
        matchStatus: 'matched',
        rawJson: legacyPayload.data[0],
        normalizedJson: legacyPayload.data[0],
      },
    });
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: ORG,
        listingId: unobservedListing.id,
        channel: 'coupang',
        externalId: 'EXT-TRAFFIC-UNOBSERVED',
        businessDate: new Date(`${plan.endDate}T00:00:00.000Z`),
        trafficVisitors: 3,
        lastObservedAt: observedAt,
        trafficObservedAt: null,
      },
    });
    const published = await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId })
      .expect(200);
    expect(published.body).toMatchObject({
      attemptId: sourceRun.id,
      plan: { parserVersion: 'wing-traffic-v1', startDate: plan.startDate, endDate: plan.endDate },
      rows: [{ listingId, businessDate: plan.endDate, traffic: { visitors: 7, views: 8, revenue: 70 } }],
    });
    expect(published.body.rows).toHaveLength(1);
    // The Wing dashboard blob is retired; the legacy read no longer carries it.
    expect(published.body).not.toHaveProperty('dashboard');
    const status = await request(httpUrl)
      .get(`${base}/source`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId })
      .expect(200);
    expect(status.body.ready).toBe(false);
    expect(status.body.latestComplete).not.toBeNull();
  });

  it('retains raw provider summaries and reports an unavailable ratio for zero denominators', async () => {
    const plan = range();
    const started = await begin(plan);
    const invalid = dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001')], summary({ views: 0, orders: 0, providerConversionRate: null }));
    delete (invalid as { accountSummaryRaw?: unknown }).accountSummaryRaw;
    await upload(started.attempt, 0, invalid).expect(400);
    const mismatched = dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001')], summary({ views: 0, orders: 0, providerConversionRate: null }));
    ((mismatched.accountSummaryRaw as Record<string, any>).summaryMetrics as Record<string, unknown>).totalGmv = 999;
    await upload(started.attempt, 0, mismatched).expect(409);
    const invalidOption = dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('0')], summary({ views: 0, orders: 0, providerConversionRate: null }));
    await upload(started.attempt, 0, invalidOption).expect(409);
    const malformedRatio = dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001')], summary({ views: 0, orders: 0, providerConversionRate: null }));
    ((malformedRatio.accountSummaryRaw as Record<string, any>).summaryMetrics as Record<string, unknown>).pvToOrder = 'not-a-number';
    await upload(started.attempt, 0, malformedRatio).expect(409);
    const valid = dailyReceipt(started.attempt, plan, plan.startDate, 1, 1, [row('1001')], summary({ views: 0, orders: 0, providerConversionRate: null }));
    delete ((valid.accountSummaryRaw as Record<string, any>).summaryMetrics as Record<string, unknown>).pvToOrder;
    await upload(started.attempt, 0, valid).expect(200);
    await upload(started.attempt, 100, periodReceipt(started.attempt, plan, summary({ views: 0, orders: 0, providerConversionRate: null }))).expect(200);
    await complete(started.attempt, 201);
    const published = await request(httpUrl)
      .get(`${base}/published`)
      .set('x-test-org', ORG)
      .query({ channelAccountId: accountId })
      .expect(200);
    expect(published.body.accountDaily[0].providerConversionRate).toBeNull();
    // The raw provider summary is retained with the owner's period evidence.
    expect(published.body.periodSummary.accountSummaryRaw).toMatchObject({ source: 'wing.summary.body' });
    expect(published.body.reconciliation.views.periodValue).not.toBeNull();
    expect(published.body.reconciliation.views.dailySum).toBe(published.body.reconciliation.views.periodValue);
  });
});
