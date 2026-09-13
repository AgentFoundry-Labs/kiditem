import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
import { AdAccountDailyKpiSourceController } from '../adapter/in/http/ad-account-daily-kpi-source.controller';
import { AdAccountDailyKpiSourceRepository } from '../adapter/out/repository/ad-account-daily-kpi-source.repository';
import { currentBusinessDate } from '../domain/business-date';
import {
  AD_ACCOUNT_DAILY_KPI_READ_PORT,
  AD_ACCOUNT_DAILY_KPI_SOURCE_PORT,
} from '../application/port/in/ad-account-daily-kpi-source.port';
import type { INestApplication } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

const base = '/api/ads/account-daily-kpis';

describe('Advertising account daily KPI source incoming HTTP + disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let accountId: string;
  let owner: AdAccountDailyKpiSourceRepository;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = new AdAccountDailyKpiSourceRepository(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
    );
    const module = await Test.createTestingModule({
      controllers: [AdAccountDailyKpiSourceController],
      providers: [
        { provide: AD_ACCOUNT_DAILY_KPI_SOURCE_PORT, useValue: owner },
        { provide: AD_ACCOUNT_DAILY_KPI_READ_PORT, useValue: owner },
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
    // One suite-owned listener avoids supertest binding and closing a fresh
    // ephemeral socket for each receipt.
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
    accountId = (
      await prisma.channelAccount.create({
        data: {
          organizationId: ORG,
          channel: 'coupang',
          name: 'Primary ads',
          isPrimary: true,
          vendorId: 'VENDOR-A',
        },
      })
    ).id;
  });

  const begin = (key = randomUUID(), body: string | object = {}) =>
    request(httpUrl)
      .post(`${base}/attempts`)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
  const get = (path: string) => request(httpUrl).get(`${base}${path}`);
  const control = (attemptId: string) => get(`/attempts/${attemptId}/control`).expect(200);
  const receipt = (
    attempt: { attemptId: string; attemptToken: string },
    sequence: number,
    date: string,
    providerAdvertiserId: string | null = 'VENDOR-A',
    normalizedOverrides: Record<string, unknown> = {},
  ) =>
    request(httpUrl)
      .put(`${base}/attempts/${attempt.attemptId}/receipts/${sequence}`)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send({
        businessDate: date,
        observedAt: '2026-09-06T01:00:00.000+00:00',
        ...(providerAdvertiserId === null ? {} : { providerAdvertiserId }),
        rawJson: {
          data: [{ date, adSpend: '123', conversions: '456', orders: '7' }],
          kpis: { date, spend: 123, conversionRevenue: 456 },
          campaigns: [{ campaignId: 'campaign-1', adSpend: 123 }],
        },
        normalized: {
          date,
          adSpend: 123,
          adRevenue: 456,
          impressions: 1000,
          clicks: 10,
          conversions: 456,
          orders: 7,
          roas: 3.7,
          ctr: 1,
          conversionRate: 70,
          observedMetrics: {
            adSpend: true,
            adRevenue: true,
            impressions: true,
            clicks: true,
            conversions: true,
            orders: true,
          },
          rowCount: 1,
          ...normalizedOverrides,
        },
      });

  const legacyReceiptBody = (date: string) => ({
    businessDate: date,
    observedAt: '2026-09-06T01:00:00.000+00:00',
    providerAdvertiserId: 'VENDOR-A',
    rawJson: {
      data: [{ date, adSpend: '123', conversions: '456', orders: '7' }],
      kpis: { date, spend: 123, conversionRevenue: 456 },
      campaigns: [{ campaignId: 'campaign-1', adSpend: 123 }],
    },
    normalized: {
      date,
      adSpend: 123,
      adRevenue: 456,
      impressions: 1000,
      clicks: 10,
      conversions: 456,
      orders: 7,
      roas: 3.7,
      ctr: 1,
      conversionRate: 70,
      rowCount: 1,
    },
  });

  async function seedLegacyV1Attempt(date: string) {
    const attemptId = randomUUID();
    const attemptToken = randomUUID();
    const observedAt = new Date('2026-09-06T01:00:00.000+00:00');
    const parserVersion = 'ad-account-daily-kpi-v1';
    const plan = {
      sourceType: 'coupang_ads_daily',
      parserVersion,
      channelAccountId: accountId,
      expectedAdvertiserId: 'VENDOR-A',
      coverageRangeStartDate: date,
      coverageRangeEndDate: date,
      expectedDates: [date],
      businessDates: [date],
    };
    const payload = legacyReceiptBody(date);
    const checksum = canonicalOwnerInputHash(payload);
    const sourceImportRun = await prisma.sourceImportRun.create({
      data: {
        id: attemptId,
        organizationId: ORG,
        sourceType: 'coupang_ads_daily',
        channelAccountId: accountId,
        status: 'running',
        rowCount: payload.normalized.rowCount,
        attemptToken,
        idempotencyKey: randomUUID(),
        requestFingerprint: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
        plan,
        parserVersion,
        freshnessGeneration: 1n,
        coverageStartDate: new Date(`${date}T00:00:00.000Z`),
        coverageEndDate: new Date(`${date}T00:00:00.000Z`),
      },
    });
    const scrapeRun = await prisma.channelScrapeRun.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        sourceImportRunId: sourceImportRun.id,
        channel: 'coupang',
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        businessDate: new Date(`${date}T00:00:00.000Z`),
        periodStart: new Date(`${date}T00:00:00.000Z`),
        periodEnd: new Date(`${date}T00:00:00.000Z`),
        status: 'running',
        period: '1d',
        parserVersion,
      },
    });
    const snapshot = await prisma.channelScrapeSnapshot.create({
      data: {
        organizationId: ORG,
        sourceImportRunId: sourceImportRun.id,
        scrapeRunId: scrapeRun.id,
        channel: 'coupang',
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        businessDate: new Date(`${date}T00:00:00.000Z`),
        observedAt,
        matchStatus: 'unmatched',
        matchReason: 'legacy v1 account daily KPI fixture',
        rowHash: checksum,
        rawJson: payload.rawJson,
        normalizedJson: payload.normalized,
      },
    });
    const receipt = {
      sequence: 0,
      businessDate: date,
      observedAt: payload.observedAt,
      checksum,
      rowCount: payload.normalized.rowCount,
      snapshotId: snapshot.id,
    };
    await prisma.channelScrapeChunk.create({
      data: {
        organizationId: ORG,
        scrapeRunId: scrapeRun.id,
        kind: 'account_daily_kpi',
        sequence: 0,
        checksum,
        itemCount: payload.normalized.rowCount,
        payload,
        publicationJson: { receipt },
      },
    });
    return {
      attemptId,
      attemptToken,
      checksum,
      payload,
      receipt,
      snapshot,
    };
  }

  async function seedCompletedSnapshot(input: {
    date: string;
    generation: bigint;
    parserVersion: string;
    normalized: Prisma.InputJsonValue;
    observedAt: string;
  }) {
    const dateAtUtc = new Date(`${input.date}T00:00:00.000Z`);
    const sourceImportRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'coupang_ads_daily',
        channelAccountId: accountId,
        status: 'completed',
        importedAt: new Date(input.observedAt),
        lastVerifiedAt: new Date(input.observedAt),
        contentChecksum: canonicalOwnerInputHash({
          generation: input.generation.toString(),
          normalized: input.normalized,
        }),
        plan: {
          sourceType: 'coupang_ads_daily',
          parserVersion: input.parserVersion,
          channelAccountId: accountId,
          expectedAdvertiserId: 'VENDOR-A',
          coverageRangeStartDate: input.date,
          coverageRangeEndDate: input.date,
          expectedDates: [input.date],
          businessDates: [input.date],
        },
        parserVersion: input.parserVersion,
        freshnessGeneration: input.generation,
        coverageStartDate: dateAtUtc,
        coverageEndDate: dateAtUtc,
      },
    });
    const scrapeRun = await prisma.channelScrapeRun.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        sourceImportRunId: sourceImportRun.id,
        channel: 'coupang',
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        businessDate: dateAtUtc,
        periodStart: dateAtUtc,
        periodEnd: dateAtUtc,
        status: 'complete',
        period: '1d',
        parserVersion: input.parserVersion,
      },
    });
    return prisma.channelScrapeSnapshot.create({
      data: {
        organizationId: ORG,
        sourceImportRunId: sourceImportRun.id,
        scrapeRunId: scrapeRun.id,
        channel: 'coupang',
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        businessDate: dateAtUtc,
        observedAt: new Date(input.observedAt),
        matchStatus: 'unmatched',
        matchReason: 'published-row fixture',
        rawJson: { generation: input.generation.toString() },
        normalizedJson: input.normalized,
      },
    });
  }

  it('freezes missing dates, keeps receipts private, then publishes exact account rows atomically', async () => {
    const attempt = (await begin()).body;
    const controlAttempt = (await control(attempt.attemptId)).body;
    expect(attempt).not.toHaveProperty('attemptToken');
    expect(attempt).not.toHaveProperty('receipts');
    expect(attempt.plan.channelAccountId).toBe(accountId);
    expect(attempt.plan.businessDates.length).toBeGreaterThan(0);

    for (const [sequence, date] of attempt.plan.businessDates.entries()) {
      await receipt(
        { attemptId: attempt.attemptId, attemptToken: controlAttempt.attemptToken },
        sequence,
        date,
      ).expect(200);
    }
    expect((await get('/source').expect(200)).body).toMatchObject({
      ready: false,
      latestComplete: null,
    });
    expect(
      await prisma.channelAccountDailyKpiSnapshot.count({
        where: { organizationId: ORG, channelAccountId: accountId },
      }),
    ).toBe(0);

    const staged = (await control(attempt.attemptId)).body;
    expect(staged.receipts).toHaveLength(attempt.plan.businessDates.length);
    const complete = await request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/complete`)
      .set('X-Source-Attempt-Token', staged.attemptToken)
      .send({ manifestChecksum: staged.manifestChecksum })
      .expect(201);
    expect(complete.body).toMatchObject({
      channelAccountId: accountId,
      ready: true,
      latestComplete: { sourceImportRunId: attempt.attemptId },
    });
    expect(complete.body.actualCutoffAt).toBe(
      `${attempt.plan.coverageRangeEndDate}T00:00:00.000Z`,
    );

    const published = (await get('/published').expect(200)).body;
    expect(published.channelAccountId).toBe(accountId);
    // The rows are the whole answer: a published day with real spend is the
    // evidence, and the account they belong to is named beside them.
    expect(published.channelAccountId).toBe(accountId);
    expect(published.rows).toHaveLength(attempt.plan.businessDates.length);
    expect(published.rows[0]).toMatchObject({
      businessDate: attempt.plan.businessDates[0],
      normalized: {
        conversions: 456,
        orders: 7,
        providerRoas: 3.7,
      },
    });
    const raw = await prisma.channelScrapeSnapshot.findFirstOrThrow({
      where: { sourceImportRunId: attempt.attemptId },
    });
    expect(raw.rawJson).toMatchObject({ campaigns: [{ campaignId: 'campaign-1' }] });
    expect(raw.normalizedJson).toMatchObject({ conversions: 456, orders: 7 });
    expect(
      await prisma.channelAccountDailyKpiSnapshot.count({
        where: { organizationId: ORG, channelAccountId: accountId },
      }),
    ).toBe(0);
  });

  it('resumes a true v1 receipt without fabricating observed metric evidence', async () => {
    const targetDate = new Date(currentBusinessDate().getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const fixture = await seedLegacyV1Attempt(targetDate);
    expect(fixture.payload.normalized).not.toHaveProperty('observedMetrics');

    const initialControl = (await control(fixture.attemptId)).body;
    expect(initialControl).toMatchObject({
      attemptId: fixture.attemptId,
      state: 'RUNNING',
      receiptCount: 1,
      plan: {
        parserVersion: 'ad-account-daily-kpi-v1',
        businessDates: [targetDate],
      },
      receipts: [
        {
          sequence: 0,
          businessDate: targetDate,
          checksum: fixture.checksum,
          snapshotId: fixture.snapshot.id,
        },
      ],
    });
    expect(initialControl.receipts[0]).not.toHaveProperty('observedMetrics');

    const read = await get(`/attempts/${fixture.attemptId}`).expect(200);
    expect(read.body).toMatchObject({
      attemptId: fixture.attemptId,
      state: 'RUNNING',
      receiptCount: 1,
      manifestChecksum: initialControl.manifestChecksum,
    });

    const replay = await request(httpUrl)
      .put(`${base}/attempts/${fixture.attemptId}/receipts/0`)
      .set('X-Source-Attempt-Token', fixture.attemptToken)
      .send(fixture.payload)
      .expect(200);
    expect(replay.body).toEqual(fixture.receipt);
    await expect(
      prisma.channelScrapeChunk.count({
        where: { scrapeRunId: fixture.snapshot.scrapeRunId!, kind: 'account_daily_kpi' },
      }),
    ).resolves.toBe(1);

    const conflictingReplay = {
      ...fixture.payload,
      rawJson: { ...fixture.payload.rawJson, replay: 'different-body' },
    };
    await request(httpUrl)
      .put(`${base}/attempts/${fixture.attemptId}/receipts/0`)
      .set('X-Source-Attempt-Token', fixture.attemptToken)
      .send(conflictingReplay)
      .expect(409);

    const completed = await request(httpUrl)
      .post(`${base}/attempts/${fixture.attemptId}/complete`)
      .set('X-Source-Attempt-Token', fixture.attemptToken)
      .send({ manifestChecksum: initialControl.manifestChecksum })
      .expect((response) => {
        if (response.status !== 201) {
          throw new Error(
            `v1 finalize failed (${response.status}): ${JSON.stringify(response.body).slice(0, 1200)}`,
          );
        }
      })
      .expect(201);
    expect(completed.body.latestComplete).toMatchObject({
      sourceImportRunId: fixture.attemptId,
      state: 'COMPLETE',
      plan: { parserVersion: 'ad-account-daily-kpi-v1' },
    });
    expect(
      await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: fixture.attemptId } }),
    ).toMatchObject({
      status: 'completed',
      contentChecksum: initialControl.manifestChecksum,
      parserVersion: 'ad-account-daily-kpi-v1',
    });
    const stored = await prisma.channelScrapeSnapshot.findUniqueOrThrow({
      where: { id: fixture.snapshot.id },
    });
    expect(stored.normalizedJson).not.toHaveProperty('observedMetrics');
    expect((await get('/published').expect(200)).body.rows).toEqual([]);
  });

  it('recollects every recent date on the default refresh and replaces the prior generation', async () => {
    const first = (await begin()).body;
    const firstAttempt = (await control(first.attemptId)).body;
    for (const [sequence, date] of first.plan.businessDates.entries()) {
      await receipt(
        { attemptId: first.attemptId, attemptToken: firstAttempt.attemptToken },
        sequence,
        date,
      ).expect(200);
    }
    const firstControl = (await control(first.attemptId)).body;
    await request(httpUrl)
      .post(`${base}/attempts/${first.attemptId}/complete`)
      .set('X-Source-Attempt-Token', firstControl.attemptToken)
      .send({ manifestChecksum: firstControl.manifestChecksum })
      .expect(201);

    const second = (await begin()).body;
    const secondAttempt = (await control(second.attemptId)).body;
    expect(second.plan.businessDates).toEqual(first.plan.businessDates);
    expect(second.plan.businessDates).toHaveLength(30);
    for (const [sequence, date] of second.plan.businessDates.entries()) {
      await receipt(
        { attemptId: second.attemptId, attemptToken: secondAttempt.attemptToken },
        sequence,
        date,
        'VENDOR-A',
        { adSpend: 999, roas: null, ctr: null, conversionRate: null },
      ).expect(200);
    }
    const secondControl = (await control(second.attemptId)).body;
    await request(httpUrl)
      .post(`${base}/attempts/${second.attemptId}/complete`)
      .set('X-Source-Attempt-Token', secondControl.attemptToken)
      .send({ manifestChecksum: secondControl.manifestChecksum })
      .expect(201);

    const published = (await get('/published').expect(200)).body;
    expect(published.rows).toHaveLength(first.plan.businessDates.length);
    expect(published.rows.every((row: { normalized: { adSpend: number } }) =>
      row.normalized.adSpend === 999)).toBe(true);
    expect(published.rows[0].normalized).toMatchObject({
      providerRoas: null,
      providerCtr: null,
      providerConversionRate: null,
    });
  });

  it('rejects a receipt with missing additive metric evidence instead of synthesizing zero', async () => {
    const attempt = (await begin()).body;
    const attemptControl = (await control(attempt.attemptId)).body;
    await receipt(
      { attemptId: attempt.attemptId, attemptToken: attemptControl.attemptToken },
      0,
      attempt.plan.businessDates[0],
      'VENDOR-A',
      {
        observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: false,
          conversions: true,
          orders: true,
        },
      },
    ).expect(400);
    expect((await control(attempt.attemptId)).body.state).toBe('RUNNING');
    expect(
      await prisma.channelScrapeSnapshot.count({
        where: { sourceImportRunId: attempt.attemptId },
      }),
    ).toBe(0);
  });

  it('rejects omitted and invalid v2 observed metric evidence over HTTP', async () => {
    const omitted = (await begin()).body;
    const omittedControl = (await control(omitted.attemptId)).body;
    await receipt(
      { attemptId: omitted.attemptId, attemptToken: omittedControl.attemptToken },
      0,
      omitted.plan.businessDates[0],
      'VENDOR-A',
      { observedMetrics: undefined },
    ).expect(400);
    expect((await control(omitted.attemptId)).body.state).toBe('RUNNING');

    const invalid = omitted;
    const invalidControl = (await control(invalid.attemptId)).body;
    await receipt(
      { attemptId: invalid.attemptId, attemptToken: invalidControl.attemptToken },
      0,
      invalid.plan.businessDates[0],
      'VENDOR-A',
      {
        observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: 'unknown',
          conversions: true,
          orders: true,
        },
      },
    ).expect(400);
    expect((await control(invalid.attemptId)).body.state).toBe('RUNNING');
    expect(
      await prisma.channelScrapeSnapshot.count({
        where: {
          organizationId: ORG,
          sourceImportRunId: omitted.attemptId,
        },
      }),
    ).toBe(0);
  });

  it('freezes an explicit targetDate as one-day coverage and publishes only that row', async () => {
    const targetDate = new Date(currentBusinessDate().getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const attempt = (await begin(randomUUID(), { targetDate })).body;
    expect(attempt.plan).toMatchObject({
      coverageRangeStartDate: targetDate,
      coverageRangeEndDate: targetDate,
      expectedDates: [targetDate],
      businessDates: [targetDate],
    });

    const attemptControl = (await control(attempt.attemptId)).body;
    await receipt(
      { attemptId: attempt.attemptId, attemptToken: attemptControl.attemptToken },
      0,
      targetDate,
    ).expect(200);
    const staged = (await control(attempt.attemptId)).body;
    await request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/complete`)
      .set('X-Source-Attempt-Token', staged.attemptToken)
      .send({ manifestChecksum: staged.manifestChecksum })
      .expect(201);

    const published = (await get('/published').expect(200)).body;
    expect(published.rows).toHaveLength(1);
    expect(published.rows[0]).toMatchObject({ businessDate: targetDate });
  });

  it('publishes an explicit all-zero day as a measured zero rather than absent evidence', async () => {
    const targetDate = new Date(currentBusinessDate().getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const attempt = (await begin(randomUUID(), { targetDate })).body;
    const attemptControl = (await control(attempt.attemptId)).body;
    // The collector emits this exact row for a day whose ad report is empty:
    // every additive metric observed and zero, no provider ratios, no source
    // rows. It is proof of no spend, so it must publish like any other day.
    await receipt(
      { attemptId: attempt.attemptId, attemptToken: attemptControl.attemptToken },
      0,
      targetDate,
      'VENDOR-A',
      {
        adSpend: 0,
        adRevenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        orders: 0,
        roas: null,
        ctr: null,
        conversionRate: null,
        rowCount: 0,
      },
    ).expect(200);
    const staged = (await control(attempt.attemptId)).body;
    await request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/complete`)
      .set('X-Source-Attempt-Token', staged.attemptToken)
      .send({ manifestChecksum: staged.manifestChecksum })
      .expect(201);

    const published = (await get('/published').expect(200)).body;
    expect(published).toMatchObject({
      channelAccountId: accountId,
    });
    expect(published.rows).toHaveLength(1);
    expect(published.rows[0]).toMatchObject({
      businessDate: targetDate,
      normalized: {
        adSpend: 0,
        adRevenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        orders: 0,
        providerRoas: null,
        providerCtr: null,
        providerConversionRate: null,
        observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: true,
          conversions: true,
          orders: true,
        },
      },
    });
  });

  it('answers a null account for an organization with no advertising account', async () => {
    const published = (
      await request(httpUrl)
        .get(`${base}/published`)
        .set('x-test-org', OTHER_ORG)
        .expect(200)
    ).body;
    // No account can never become a collection, so this is a business answer,
    // not a missing resource: a null account and no rows.
    expect(published).toEqual({
      channelAccountId: null,
      rows: [],
    });

    // The owner's own account keeps its separate answer: an account that has
    // published nothing is absent evidence, never a zero.
    expect((await get('/published').expect(200)).body).toEqual({
      channelAccountId: accountId,
      rows: [],
    });

    // Collection status stays not ready for the account-less organization. That
    // endpoint reports whether a complete collection exists, and `null`
    // channelAccountId already carries the not-applicable fact.
    expect(
      (
        await request(httpUrl)
          .get(`${base}/source`)
          .set('x-test-org', OTHER_ORG)
          .expect(200)
      ).body,
    ).toMatchObject({
      channelAccountId: null,
      ready: false,
      latestAttempt: null,
      latestComplete: null,
    });
  });

  it('does not treat an unowned legacy KPI row as published evidence or a complete date', async () => {
    const yesterday = new Date(currentBusinessDate().getTime() - 86_400_000);
    await prisma.channelAccountDailyKpiSnapshot.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        channel: 'coupang',
        source: 'coupang_ads',
        kpiType: 'coupang_ads_daily',
        businessDate: yesterday,
        normalizedJson: {
          adSpend: 999,
          adRevenue: 999,
          impressions: 999,
          clicks: 999,
          conversions: 999,
          orders: 999,
          providerRoas: 1,
          providerCtr: 1,
          providerConversionRate: 1,
        },
      },
    });
    expect((await get('/published').expect(200)).body.rows).toEqual([]);

    const attempt = (await begin()).body;
    expect(attempt.plan.businessDates).toEqual(attempt.plan.expectedDates);
  });

  it('filters stored legacy and incomplete unknown rows before same-date deduplication', async () => {
    const targetDate = new Date(currentBusinessDate().getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const baseNormalized = {
      adSpend: 100,
      adRevenue: 200,
      impressions: 300,
      clicks: 40,
      conversions: 5,
      orders: 3,
      providerRoas: null,
      providerCtr: null,
      providerConversionRate: null,
    };
    await seedCompletedSnapshot({
      date: targetDate,
      generation: 1n,
      parserVersion: 'ad-account-daily-kpi-v1',
      normalized: baseNormalized,
      observedAt: '2026-09-06T01:00:00.000+00:00',
    });
    await seedCompletedSnapshot({
      date: targetDate,
      generation: 2n,
      parserVersion: 'ad-account-daily-kpi-v2',
      normalized: {
        ...baseNormalized,
        adSpend: 777,
        adRevenue: 888,
        observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: true,
          conversions: true,
          orders: true,
        },
      },
      observedAt: '2026-09-06T02:00:00.000+00:00',
    });
    await seedCompletedSnapshot({
      date: targetDate,
      generation: 3n,
      parserVersion: 'ad-account-daily-kpi-v2',
      normalized: { ...baseNormalized, adSpend: 888 },
      observedAt: '2026-09-06T03:00:00.000+00:00',
    });
    await seedCompletedSnapshot({
      date: targetDate,
      generation: 4n,
      parserVersion: 'ad-account-daily-kpi-v2',
      normalized: {
        ...baseNormalized,
        adSpend: 999,
        observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: false,
          conversions: true,
          orders: true,
        },
      },
      observedAt: '2026-09-06T04:00:00.000+00:00',
    });

    expect(
      await prisma.channelScrapeSnapshot.count({
        where: {
          organizationId: ORG,
          source: 'coupang_ads',
          pageType: 'dashboard_daily',
          businessDate: new Date(`${targetDate}T00:00:00.000Z`),
        },
      }),
    ).toBe(4);
    const published = (await get('/published').expect(200)).body;
    expect(published.rows).toHaveLength(1);
    expect(published.rows[0]).toMatchObject({
      businessDate: targetDate,
      normalized: {
        adSpend: 777,
        adRevenue: 888,
        observedMetrics: {
          adSpend: true,
          clicks: true,
        },
      },
    });
  });

  it('fails and alerts when a receipt has no observed provider identity', async () => {
    const attempt = (await begin()).body;
    const attemptControl = (await control(attempt.attemptId)).body;
    await receipt(
      { attemptId: attempt.attemptId, attemptToken: attemptControl.attemptToken },
      0,
      attempt.plan.businessDates[0],
      null,
    ).expect(409);

    const source = (await get('/source').expect(200)).body;
    expect(source.latestAttempt).toMatchObject({
      state: 'FAILED',
      errorCode: 'ADVERTISER_IDENTITY_MISSING',
    });
    expect(
      await prisma.channelScrapeSnapshot.count({
        where: { sourceImportRunId: attempt.attemptId },
      }),
    ).toBe(0);
    expect(
      await prisma.alert.count({
        where: { organizationId: ORG, sourceType: 'coupang_ads_daily' },
      }),
    ).toBe(1);
    await expect(prisma.alert.findFirst({
      where: { organizationId: ORG, sourceType: 'coupang_ads_daily', attemptId: attempt.attemptId },
    })).resolves.toMatchObject({ href: '/ad-ops' });
    expect((await get('/published').expect(200)).body.rows).toEqual([]);
  });

  it('does not publish failed generations and skips alerts only for USER_CANCELLED', async () => {
    const cancelled = (await begin()).body;
    const cancelledControl = (await control(cancelled.attemptId)).body;
    await request(httpUrl)
      .post(`${base}/attempts/${cancelled.attemptId}/fail`)
      .set('X-Source-Attempt-Token', cancelledControl.attemptToken)
      .send({ code: 'USER_CANCELLED', message: 'User stopped collection.' })
      .expect(201);
    expect(
      await prisma.alert.count({
        where: { organizationId: ORG, sourceType: 'coupang_ads_daily' },
      }),
    ).toBe(0);

    const failed = (await begin()).body;
    const failedControl = (await control(failed.attemptId)).body;
    await request(httpUrl)
      .post(`${base}/attempts/${failed.attemptId}/fail`)
      .set('X-Source-Attempt-Token', failedControl.attemptToken)
      .send({ code: 'NETWORK', message: 'Provider unavailable.' })
      .expect(201);
    expect(
      await prisma.alert.count({
        where: { organizationId: ORG, sourceType: 'coupang_ads_daily' },
      }),
    ).toBe(1);
    expect((await get('/published').expect(200)).body.rows).toEqual([]);
  });
});
