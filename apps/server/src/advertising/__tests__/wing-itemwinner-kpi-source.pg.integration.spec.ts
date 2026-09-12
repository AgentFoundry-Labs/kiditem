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
} from '../../test-helpers/real-prisma';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { AdvertisingIngestController } from '../adapter/in/http/advertising-ingest.controller';
import { WingItemwinnerKpiSourceController } from '../adapter/in/http/wing-itemwinner-kpi-source.controller';
import { ChannelScrapeRepositoryAdapter } from '../adapter/out/repository/channel-scrape.repository.adapter';
import { WingItemwinnerKpiSourceRepository } from '../adapter/out/repository/wing-itemwinner-kpi-source.repository';
import {
  WING_ITEMWINNER_KPI_READ_PORT,
  WING_ITEMWINNER_KPI_SOURCE_PORT,
  type WingItemwinnerKpiReadPort,
  type WingItemwinnerSourceControl,
} from '../application/port/in/wing-itemwinner-kpi-source.port';
import { AdvertisingExtensionService } from '../application/service/advertising-extension.service';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

const base = '/api/ads/wing-itemwinner';
const CURRENT_ITEMWINNER_URL = 'https://wing.coupang.com/item-winner/list';

describe('Wing itemwinner KPI source owner HTTP + disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let accountId: string;
  let listingId: string;
  let listingOptionId: string;
  let owner: WingItemwinnerKpiSourceRepository;
  let wingRead: WingItemwinnerKpiReadPort;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = new WingItemwinnerKpiSourceRepository(
      prisma as never,
      new SourceFailureAlerts(prisma as never),
    );
    wingRead = owner;
    const channelScrape = new ChannelScrapeRepositoryAdapter(
      prisma as never,
      {
        readSourceStatus: (input) => wingRead.readSourceStatus(input),
        readPublished: (input) => wingRead.readPublished(input),
      },
    );
    const extension = new AdvertisingExtensionService(channelScrape);
    const module = await Test.createTestingModule({
      controllers: [
        AdvertisingIngestController,
        WingItemwinnerKpiSourceController,
      ],
      providers: [
        { provide: WING_ITEMWINNER_KPI_SOURCE_PORT, useValue: owner },
        { provide: WING_ITEMWINNER_KPI_READ_PORT, useValue: owner },
        { provide: AdvertisingExtensionService, useValue: extension },
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
    wingRead = owner;
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
        externalId: 'PRODUCT-A',
        displayName: 'Winner Toy',
        isActive: true,
      },
    });
    listingId = listing.id;
    const option = await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: 'VENDOR-ITEM-A',
        isActive: true,
      },
    });
    listingOptionId = option.id;
  });

  const begin = (
    key = randomUUID(),
    body: Record<string, unknown> = { targetUrl: CURRENT_ITEMWINNER_URL },
  ) =>
    request(httpUrl)
      .post(`${base}/attempts`)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

  const source = () => request(httpUrl).get(`${base}/source`).expect(200);
  const extensionStatus = () =>
    request(httpUrl).get('/api/ads/extension/status').expect(200);

  const captureFor = (
    attempt: { plan: { businessDate: string } },
    overrides: Record<string, unknown> = {},
  ) => ({
    providerVendorId: 'VENDOR-A',
    observedAt: `${attempt.plan.businessDate}T01:00:00.000Z`,
    data: [
      {
        productName: 'Winner Toy',
        externalId: 'PRODUCT-A',
        vendorItemId: 'VENDOR-ITEM-A',
        isWinner: true,
        myPrice: 12000,
        winnerPrice: 11500,
      },
    ],
    kpis: { itemWinnerCount: '1', visibleCard: 'confirmed' },
    url: CURRENT_ITEMWINNER_URL,
    title: '아이템위너',
    timestamp: `${attempt.plan.businessDate}T01:00:00.000Z`,
    ...overrides,
  });

  const complete = (
    attempt: WingItemwinnerSourceControl,
    body: Record<string, unknown>,
  ) =>
    request(httpUrl)
      .post(`${base}/attempts/${attempt.attemptId}/complete`)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send(body);

  it('requires the observed current itemwinner page URL before admission', async () => {
    await request(httpUrl)
      .post(`${base}/attempts`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(400);
    await request(httpUrl)
      .post(`${base}/attempts`)
      .set('Idempotency-Key', randomUUID())
      .send({ targetUrl: 'https://wing.coupang.com/ads/dashboard' })
      .expect(400);
  });

  it('publishes raw current-page KPI plus winner listing/option facts atomically', async () => {
    const attempt = (await begin()).body as WingItemwinnerSourceControl;
    const body = captureFor(attempt);
    const result = await complete(attempt, body).expect(201);

    expect(result.body).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'COMPLETE',
      itemCount: 1,
      actualCutoffAt: body.observedAt,
      observedAt: body.observedAt,
    });
    expect(result.body.plan.businessDate).toBe(attempt.plan.businessDate);

    const snapshot = await prisma.channelScrapeSnapshot.findFirstOrThrow({
      where: { sourceImportRunId: attempt.attemptId },
    });
    const sourceRun = await prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: attempt.attemptId },
    });
    expect(sourceRun.coverageStartDate).toBeNull();
    expect(sourceRun.coverageEndDate).toBeNull();
    expect(snapshot.rawJson).toMatchObject({
      providerVendorId: 'VENDOR-A',
      data: [{ vendorItemId: 'VENDOR-ITEM-A' }],
    });
    expect(snapshot.normalizedJson).toEqual({
      kpis: body.kpis,
      rowCount: 1,
      timestamp: body.timestamp,
      listingObservations: [
        {
          listingId,
          isOfferWinner: true,
          lastObservedAt: body.observedAt,
        },
      ],
    });

    const listingDaily = await prisma.channelListingDailySnapshot.findFirstOrThrow({
      where: { organizationId: ORG, listingId },
    });
    expect(listingDaily).toMatchObject({
      isOfferWinner: true,
      myPrice: 12000,
      winnerPrice: 11500,
      winnerGapPrice: -500,
      rawSnapshotId: snapshot.id,
    });
    const optionDaily = await prisma.channelListingOptionDailySnapshot.findFirstOrThrow({
      where: { organizationId: ORG, listingOptionId },
    });
    expect(optionDaily).toMatchObject({
      isOfferWinner: true,
      myPrice: 12000,
      winnerPrice: 11500,
      winnerGapPrice: -500,
      rawSnapshotId: snapshot.id,
    });
    expect(
      await prisma.channelAccountDailyKpiSnapshot.count({
        where: { organizationId: ORG, channelAccountId: accountId },
      }),
    ).toBe(0);

    const published = (await request(httpUrl).get(`${base}/published`).expect(200)).body;
    expect(published).toMatchObject({
      channelAccountId: accountId,
      attemptId: attempt.attemptId,
      businessDate: attempt.plan.businessDate,
      observedAt: body.observedAt,
      normalizedJson: { kpis: body.kpis, rowCount: 1 },
    });
    const extensionStatus = await new ChannelScrapeRepositoryAdapter(
      prisma as never,
      owner,
    ).findExtensionStatusSnapshot(ORG);
    expect(extensionStatus.wingKpi).toMatchObject({
      normalizedJson: { kpis: body.kpis, rowCount: 1 },
      lastObservedAt: new Date(body.observedAt),
    });
  });

  it('keeps extension status on the newest confirmed-empty publication after a later failure', async () => {
    const first = (await begin()).body as WingItemwinnerSourceControl;
    const firstBody = captureFor(first);
    await complete(first, firstBody).expect(201);

    const afterFirst = await extensionStatus();
    expect(afterFirst.body).toMatchObject({
      currentWinnerCount: 1,
      currentWinnerObservedListings: 1,
      wing: { kpis: { itemWinnerCount: '1' } },
    });

    const empty = (await begin()).body as WingItemwinnerSourceControl;
    const emptyObservedAt = `${empty.plan.businessDate}T02:00:00.000Z`;
    const emptyBody = captureFor(empty, {
      data: [],
      kpis: { visibleCard: 'confirmed-empty' },
      observedAt: emptyObservedAt,
      timestamp: emptyObservedAt,
    });
    await complete(empty, emptyBody).expect(201);

    const afterEmpty = await extensionStatus();
    expect(afterEmpty.body).toMatchObject({
      listingCount: 1,
      currentWinnerCount: 0,
      currentNonWinnerCount: 0,
      currentUnknownWinnerCount: 0,
      currentWinnerObservedListings: 0,
      rawSnapshotCount: 1,
      latestScrapePageType: 'itemwinner',
      wing: {
        kpis: { visibleCard: 'confirmed-empty' },
        lastSync: emptyObservedAt,
      },
    });

    const failed = (await begin()).body as WingItemwinnerSourceControl;
    await request(httpUrl)
      .post(`${base}/attempts/${failed.attemptId}/fail`)
      .set('X-Source-Attempt-Token', failed.attemptToken)
      .send({ code: 'PROVIDER_TIMEOUT', message: 'provider timed out' })
      .expect(201);

    const afterFailure = await extensionStatus();
    expect(afterFailure.body).toMatchObject({
      currentWinnerCount: 0,
      currentWinnerObservedListings: 0,
      rawSnapshotCount: 1,
      wing: {
        kpis: { visibleCard: 'confirmed-empty' },
        lastSync: emptyObservedAt,
      },
    });
    expect(afterFailure.body.currentNonWinnerCount).toBe(0);
    expect(afterFailure.body.currentUnknownWinnerCount).toBe(0);
  });

  it('keeps KPI and listing observations on the same publication across an intervening write', async () => {
    const first = (await begin()).body as WingItemwinnerSourceControl;
    const firstBody = captureFor(first);
    await complete(first, firstBody).expect(201);

    const second = (await begin()).body as WingItemwinnerSourceControl;
    const secondObservedAt = `${second.plan.businessDate}T02:00:00.000Z`;
    const secondBody = captureFor(second, {
      data: [
        {
          productName: 'Winner Toy',
          externalId: 'PRODUCT-A',
          vendorItemId: 'VENDOR-ITEM-A',
          isWinner: false,
          myPrice: 12000,
          winnerPrice: 11500,
        },
      ],
      kpis: { itemWinnerCount: '0', visibleCard: 'intervening' },
      observedAt: secondObservedAt,
      timestamp: secondObservedAt,
    });

    let intervened = false;
    wingRead = {
      readSourceStatus: (input) => owner.readSourceStatus(input),
      readPublished: async (input) => {
        const selected = await owner.readPublished(input);
        if (!intervened) {
          intervened = true;
          await complete(second, secondBody).expect(201);
        }
        return selected;
      },
    };

    try {
      const status = await extensionStatus();
      expect(intervened).toBe(true);
      expect(status.body).toMatchObject({
        currentWinnerCount: 1,
        currentNonWinnerCount: 0,
        currentUnknownWinnerCount: 0,
        currentWinnerObservedListings: 1,
        rawSnapshotCount: 1,
        wing: {
          kpis: { itemWinnerCount: '1', visibleCard: 'confirmed' },
          lastSync: firstBody.observedAt,
        },
      });
    } finally {
      wingRead = owner;
    }
  });

  it('does not inherit a prior winner when the latest capture omits winner state', async () => {
    const first = (await begin()).body as WingItemwinnerSourceControl;
    await complete(first, captureFor(first)).expect(201);

    const second = (await begin()).body as WingItemwinnerSourceControl;
    const secondObservedAt = `${second.plan.businessDate}T02:00:00.000Z`;
    await complete(
      second,
      captureFor(second, {
        data: [
          {
            productName: 'Winner Toy',
            externalId: 'PRODUCT-A',
            vendorItemId: 'VENDOR-ITEM-A',
            myPrice: 12000,
            winnerPrice: 11500,
          },
        ],
        kpis: { visibleCard: 'missing-winner' },
        observedAt: secondObservedAt,
        timestamp: secondObservedAt,
      }),
    ).expect(201);

    const status = await extensionStatus();
    expect(status.body).toMatchObject({
      currentWinnerCount: 0,
      currentNonWinnerCount: 0,
      currentUnknownWinnerCount: 1,
      currentWinnerObservedListings: 1,
      wing: {
        kpis: { visibleCard: 'missing-winner' },
        lastSync: secondObservedAt,
      },
    });
  });

  it('replays the exact terminal body without duplicating facts and rejects client normalization fields', async () => {
    const attempt = (await begin()).body as WingItemwinnerSourceControl;
    const body = captureFor(attempt);
    await complete(attempt, { ...body, rowCount: 999 }).expect(400);
    await complete(attempt, body).expect(201);
    await complete(attempt, body).expect(201);

    expect(
      await prisma.channelScrapeSnapshot.count({
        where: { sourceImportRunId: attempt.attemptId },
      }),
    ).toBe(1);
    expect(
      await prisma.channelListingDailySnapshot.count({
        where: { organizationId: ORG, listingId },
      }),
    ).toBe(1);
    expect(
      await prisma.channelListingOptionDailySnapshot.count({
        where: { organizationId: ORG, listingOptionId },
      }),
    ).toBe(1);
  });

  it('fails a vendor/date/page boundary atomically and leaves the prior complete published', async () => {
    const first = (await begin()).body as WingItemwinnerSourceControl;
    const firstBody = captureFor(first);
    await complete(first, firstBody).expect(201);

    const second = (await begin()).body as WingItemwinnerSourceControl;
    await complete(second, captureFor(second, { providerVendorId: 'VENDOR-OTHER' })).expect(409);
    const status = (await source()).body;
    expect(status).toMatchObject({
      ready: false,
      latestAttempt: { state: 'FAILED', errorCode: 'VENDOR_IDENTITY_MISMATCH' },
      latestComplete: { attemptId: first.attemptId },
      actualCutoffAt: firstBody.observedAt,
    });
    expect((await request(httpUrl).get(`${base}/published`).expect(200)).body.attemptId).toBe(
      first.attemptId,
    );
    expect(
      await prisma.channelScrapeSnapshot.count({
        where: { sourceImportRunId: second.attemptId },
      }),
    ).toBe(0);
    expect(
      await prisma.channelScrapeRun.findFirstOrThrow({
        where: { sourceImportRunId: second.attemptId },
      }),
    ).toMatchObject({ status: 'error', errorCount: 1 });

    const third = (await begin()).body as WingItemwinnerSourceControl;
    await complete(
      third,
      captureFor(third, {
        observedAt: `${third.plan.businessDate}T15:00:00.000-09:00`,
      }),
    ).expect(409);
    const fourth = (await begin()).body as WingItemwinnerSourceControl;
    await complete(
      fourth,
      captureFor(fourth, { url: 'https://wing.coupang.com/ads/dashboard' }),
    ).expect(409);
    expect(
      await prisma.channelScrapeSnapshot.count({ where: { organizationId: ORG } }),
    ).toBe(1);
    expect(
      await prisma.alert.count({
        where: { organizationId: ORG, sourceType: 'coupang_wing_itemwinner' },
      }),
    ).toBe(1);
    await expect(prisma.alert.findFirst({
      where: { organizationId: ORG, sourceType: 'coupang_wing_itemwinner' },
    })).resolves.toMatchObject({ href: '/ad-ops' });
  });

  it('requires observed vendor identity and does not alert USER_CANCELLED', async () => {
    const missing = (await begin()).body as WingItemwinnerSourceControl;
    await complete(missing, captureFor(missing, { providerVendorId: undefined })).expect(409);
    expect((await source()).body.latestAttempt).toMatchObject({
      state: 'FAILED',
      errorCode: 'VENDOR_IDENTITY_MISSING',
    });
    expect(
      await prisma.alert.count({
        where: { organizationId: ORG, sourceType: 'coupang_wing_itemwinner' },
      }),
    ).toBe(1);

    const cancelled = (await begin()).body as WingItemwinnerSourceControl;
    await request(httpUrl)
      .post(`${base}/attempts/${cancelled.attemptId}/fail`)
      .set('X-Source-Attempt-Token', cancelled.attemptToken)
      .send({ code: 'USER_CANCELLED', message: 'User stopped collection.' })
      .expect(201);
    expect(
      await prisma.alert.count({
        where: { organizationId: ORG, sourceType: 'coupang_wing_itemwinner' },
      }),
    ).toBe(1);
  });

  it('does not turn an empty page with no provider cards into a confirmed zero', async () => {
    const attempt = (await begin()).body as WingItemwinnerSourceControl;
    await complete(
      attempt,
      captureFor(attempt, { data: [], kpis: {} }),
    ).expect(409);
    expect((await source()).body.latestAttempt).toMatchObject({
      state: 'FAILED',
      errorCode: 'EMPTY_CAPTURE_EVIDENCE',
    });
    expect(
      await prisma.channelScrapeSnapshot.count({
        where: { sourceImportRunId: attempt.attemptId },
      }),
    ).toBe(0);
  });

  it('uses the database running fence even when a second writer bypasses the owner lock', async () => {
    const attempt = (await begin()).body as WingItemwinnerSourceControl;
    const duplicate = {
      organizationId: ORG,
      sourceType: 'coupang_wing_itemwinner',
      channelAccountId: accountId,
      idempotencyKey: randomUUID(),
      requestFingerprint: 'f'.repeat(64),
      attemptToken: randomUUID(),
      freshnessGeneration: BigInt(Number(attempt.generation) + 1),
      plan: {
        sourceType: 'coupang_wing_itemwinner',
        parserVersion: 'wing-itemwinner-v1',
        channelAccountId: accountId,
        expectedVendorId: 'VENDOR-A',
        businessDate: attempt.plan.businessDate,
        pageType: 'itemwinner',
      },
      parserVersion: 'wing-itemwinner-v1',
      expiresAt: new Date(Date.now() + 60_000),
    } as const;
    await expect(
      prisma.sourceImportRun.create({
        data: {
          status: 'running',
          ...duplicate,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await complete(attempt, captureFor(attempt)).expect(201);
    await expect(
      prisma.sourceImportRun.create({
        data: {
          ...duplicate,
          status: 'completed',
          freshnessGeneration: BigInt(attempt.generation),
          expiresAt: null,
          importedAt: new Date(),
          lastVerifiedAt: new Date(),
          contentChecksum: 'e'.repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('does not treat an unowned legacy KPI row as published evidence', async () => {
    await prisma.channelAccountDailyKpiSnapshot.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        channel: 'coupang',
        source: 'wing',
        kpiType: 'wing_itemwinner_kpi',
        businessDate: new Date(),
        normalizedJson: { kpis: { legacy: 'must-not-read' }, rowCount: 1 },
      },
    });
    const legacyRun = await prisma.channelScrapeRun.create({
      data: {
        organizationId: ORG,
        channelAccountId: accountId,
        channel: 'coupang',
        source: 'wing',
        pageType: 'itemwinner',
        status: 'complete',
        businessDate: new Date(),
        finishedAt: new Date(),
      },
    });
    const legacySnapshot = await prisma.channelScrapeSnapshot.create({
      data: {
        organizationId: ORG,
        scrapeRunId: legacyRun.id,
        channel: 'coupang',
        source: 'wing',
        pageType: 'itemwinner',
        businessDate: new Date(),
        listingId,
        rawJson: { legacy: true },
      },
    });
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: ORG,
        listingId,
        channel: 'coupang',
        externalId: 'PRODUCT-A',
        businessDate: new Date(),
        isOfferWinner: true,
        rawSnapshotId: legacySnapshot.id,
      },
    });
    expect(await owner.readPublished({ organizationId: ORG })).toBeNull();
    const extensionStatus = await new ChannelScrapeRepositoryAdapter(
      prisma as never,
      owner,
    ).findExtensionStatusSnapshot(ORG);
    expect(extensionStatus.wingKpi).toBeNull();
    // Nest serializes a null JSON return as an empty response body, which
    // supertest exposes as `{}`; either way no legacy KPI is published.
    expect((await request(httpUrl).get(`${base}/published`).expect(200)).body).toEqual({});
  });
});
