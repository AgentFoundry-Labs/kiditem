import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { json } from 'express';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { AlertsController } from '../../alerts/alerts.controller';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { KeywordRankController } from '../adapter/in/http/keyword-rank.controller';
import { WingRankSourceController } from '../adapter/in/http/wing-rank-source.controller';
import { KeywordRankService } from '../application/service/keyword-rank.service';
import { WingSalesRankIngestHandler } from '../application/service/wing-sales-rank-ingest.handler';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { WingRankSourceRepository } from '../adapter/out/repository/wing-rank-source.repository';
import { currentBusinessDate } from '../domain/business-date';

const base = '/api/ads/keyword-rank/wing';
describe('Wing rank owner incoming HTTP + PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let alerts: SourceFailureAlerts;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    const rank = new KeywordRankRepositoryAdapter(prisma as never);
    const owner = new WingRankSourceRepository(
      prisma as never,
      alerts,
      rank,
      new WingSalesRankIngestHandler(rank),
      new KeywordRankService(rank),
    );
    const module = await Test.createTestingModule({
      controllers: [
        WingRankSourceController,
        KeywordRankController,
        AlertsController,
      ],
      providers: [
        { provide: WingRankSourceRepository, useValue: owner },
        { provide: KeywordRankService, useValue: new KeywordRankService(rank) },
        { provide: SourceFailureAlerts, useValue: alerts },
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
        if (req.headers['x-test-org'])
          req.authUser = {
            id: USER,
            organizationId: req.headers['x-test-org'],
          };
        next();
      },
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await prisma.channelAccount.create({
      data: { organizationId: ORG, channel: 'coupang', name: 'Wing' },
    });
    for (const [vendorItemId, name] of [
      ['OWN', '투명 슬라임'],
      ['MISS', '치즈 슬라임'],
    ]) {
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: ORG,
          channelAccountId: account.id,
          externalId: vendorItemId,
          channelName: name,
          category: '완구 > 촉감완구 > 슬라임',
        },
      });
      await prisma.channelListingOption.create({
        data: {
          organizationId: ORG,
          listingId: listing.id,
          externalOptionId: vendorItemId,
        },
      });
      await prisma.coupangRepresentativeKeywordOverride.create({
        data: { organizationId: ORG, vendorItemId, keyword: '슬라임' },
      });
    }
  });
  const start = (
    key = randomUUID(),
    body = { keyword: '슬라임', maxPages: 5 },
  ) =>
    request(app.getHttpServer())
      .post(`${base}/attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', key)
      .send(body);
  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('x-test-org', ORG);
  const submit = (
    a: { attemptId: string; attemptToken: string },
    body = capture(),
  ) =>
    request(app.getHttpServer())
      .put(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send(body);
  const fail = (
    a: { attemptId: string; attemptToken: string },
    code = 'PROVIDER_FAILED',
  ) =>
    request(app.getHttpServer())
      .post(`${base}/attempts/${a.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', a.attemptToken)
      .send({ code, message: 'Wing provider interrupted.' });

  it('freezes real own assignments, publishes a hit and null miss, and exposes COMPLETE through exact capture and original overview', async () => {
    const admission = await start();
    expect({ status: admission.status, body: admission.body }).toMatchObject({
      status: 201,
    });
    const a = admission.body;
    expect(a).toMatchObject({
      state: 'RUNNING',
      generation: '1',
      plan: { keyword: '슬라임', maxPages: 5 },
    });
    expect(
      a.plan.targets
        .map((target: { vendorItemId: string }) => target.vendorItemId)
        .sort(),
    ).toEqual(['MISS', 'OWN']);
    const payload = capture();
    expect((await submit(a, payload).expect(200)).body).toMatchObject({
      state: 'COMPLETE',
      itemCount: 1,
    });
    expect(
      (await get(`${base}/source?keyword=슬라임`).expect(200)).body,
    ).toMatchObject({
      status: 'READY',
      latestComplete: { attemptId: a.attemptId },
    });
    expect(
      (await get(`${base}/attempts/${a.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(payload);
    const overview = (await get('/api/ads/keyword-rank/products').expect(200))
      .body;
    expect(overview.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendorItemId: 'OWN',
          currentSalesRank: 1,
          salesLast28d: 120,
          viewsLast28d: 1000,
          revenueLast28d: 1200000,
        }),
        expect.objectContaining({
          vendorItemId: 'MISS',
          currentSalesRank: null,
          status: 'out_of_range',
        }),
      ]),
    );
    expect((await get('/api/alerts').expect(200)).body).toEqual([]);
  });
  it('preserves frozen assignments on replay and completion after configuration drift, while rejecting zero-target admission', async () => {
    await start(randomUUID(), { keyword: '없는 키워드', maxPages: 5 }).expect(
      422,
    );
    const key = randomUUID();
    const a = (await start(key).expect(201)).body;
    await prisma.coupangRepresentativeKeywordOverride.updateMany({
      where: { organizationId: ORG, vendorItemId: 'MISS' },
      data: { keyword: '다른' },
    });
    await prisma.channelListing.updateMany({
      where: { organizationId: ORG, externalId: 'OWN' },
      data: { channelName: '변경된 상품명' },
    });
    expect((await start(key).expect(201)).body).toEqual(a);
    await start(key, { keyword: '슬라임', maxPages: 4 }).expect(409);
    await submit(a).expect(200);
    expect(
      (await get(`${base}/source?keyword=슬라임`).expect(200)).body,
    ).toMatchObject({
      status: 'STALE',
      latestComplete: { attemptId: a.attemptId },
    });
    expect(
      (await get(`${base}/attempts/${a.attemptId}`).expect(200)).body.plan,
    ).toEqual(a.plan);
    await prisma.coupangRepresentativeKeywordOverride.updateMany({
      where: { organizationId: ORG, vendorItemId: 'MISS' },
      data: { keyword: '슬라임' },
    });
    expect(
      (await get('/api/ads/keyword-rank/products').expect(200)).body.rows,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendorItemId: 'MISS',
          currentSalesRank: null,
          status: 'out_of_range',
        }),
      ]),
    );
  });
  it('publishes an observed empty result as null misses but rejects unavailable extraction and interrupted pagination', async () => {
    const a = (await start().expect(201)).body;
    const empty = {
      ...capture(),
      items: [],
      collectedCount: 0,
      totalResults: null,
      proof: {
        maxPages: 5,
        stopReason: 'empty_page',
        pages: [
          {
            searchPage: 0,
            itemCount: 0,
            nextSearchPage: null,
            resultArrayObserved: true,
          },
        ],
      },
    };
    expect((await submit(a, empty).expect(200)).body).toMatchObject({
      state: 'COMPLETE',
      itemCount: 0,
    });
    expect(
      (await get('/api/ads/keyword-rank/products').expect(200)).body.summary,
    ).toMatchObject({ outOfRangeCount: 2, notCollectedCount: 0 });
    for (const stopReason of [
      'authentication_token_missing',
      'non_json_response',
      'next_page_not_advancing',
      'max_pages_reached',
    ]) {
      const next = (await start().expect(201)).body;
      const payload = capture();
      payload.proof.stopReason = stopReason;
      expect((await submit(next, payload).expect(200)).body.state).toBe(
        'FAILED',
      );
      expect(
        (await get(`${base}/source?keyword=슬라임`).expect(200)).body,
      ).toMatchObject({
        status: 'STALE',
        latestComplete: { attemptId: a.attemptId },
      });
    }
    const missing = (await start().expect(201)).body;
    empty.proof.pages[0].resultArrayObserved = false;
    expect((await submit(missing, empty).expect(200)).body.state).toBe(
      'FAILED',
    );
    const next = (
      await start(randomUUID(), { keyword: '슬라임', maxPages: 2 }).expect(201)
    ).body;
    const paged = capture();
    paged.pagesScanned = 2;
    paged.proof = {
      maxPages: 2,
      stopReason: 'next_page_not_advancing',
      pages: [
        {
          searchPage: 0,
          itemCount: 1,
          nextSearchPage: 5,
          resultArrayObserved: true,
        },
        {
          searchPage: 5,
          itemCount: 1,
          nextSearchPage: 5,
          resultArrayObserved: true,
        },
      ],
    };
    expect((await submit(next, paged).expect(200)).body.state).toBe('COMPLETE');
    const bounded = (
      await start(randomUUID(), { keyword: '슬라임', maxPages: 1 }).expect(201)
    ).body;
    const one = capture();
    one.proof = {
      maxPages: 1,
      stopReason: 'next_page_not_advancing',
      pages: [
        {
          searchPage: 0,
          itemCount: 1,
          nextSearchPage: 0,
          resultArrayObserved: true,
        },
      ],
    };
    expect((await submit(bounded, one).expect(200)).body.state).toBe(
      'COMPLETE',
    );
  });
  it('keeps exact A, replaces the entire same-day group with B, and preserves B after failed C and delayed older D', async () => {
    const now = Date.now();
    const a = (await start().expect(201)).body;
    const aPayload = {
      ...capture(),
      capturedAt: new Date(now - 20_000).toISOString(),
    };
    await submit(a, aPayload).expect(200);
    await prisma.coupangRepresentativeKeywordOverride.updateMany({
      where: { organizationId: ORG, vendorItemId: 'MISS' },
      data: { keyword: '다른' },
    });
    const b = (await start().expect(201)).body;
    const bPayload = {
      ...capture(),
      capturedAt: new Date(now - 10_000).toISOString(),
    };
    bPayload.items[0].salesLast28d = 240;
    await submit(b, bPayload).expect(200);
    await prisma.coupangRepresentativeKeywordOverride.updateMany({
      where: { organizationId: ORG, vendorItemId: 'MISS' },
      data: { keyword: '슬라임' },
    });
    const overview = (await get('/api/ads/keyword-rank/products').expect(200))
      .body;
    expect(overview.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vendorItemId: 'OWN', salesLast28d: 240 }),
        expect.objectContaining({
          vendorItemId: 'MISS',
          status: 'not_collected',
          capturedAt: null,
        }),
      ]),
    );
    const c = (await start().expect(201)).body;
    await fail(c).expect(201);
    const d = (await start().expect(201)).body;
    const dPayload = {
      ...capture(),
      capturedAt: new Date(now - 30_000).toISOString(),
    };
    await submit(d, dPayload).expect(200);
    expect(
      (await get('/api/ads/keyword-rank/products').expect(200)).body,
    ).toEqual(overview);
    expect(
      (await get(`${base}/source?keyword=슬라임`).expect(200)).body
        .latestComplete,
    ).toMatchObject({
      attemptId: b.attemptId,
      actualCutoffAt: bPayload.capturedAt,
    });
    expect(
      (await get(`${base}/attempts/${a.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(aPayload);
    expect(
      (await get(`${base}/attempts/${d.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(dPayload);
    await submit(a, aPayload).expect(200);
    await submit(a, bPayload).expect(409);
    await fail(a).expect(409);
  });
  it('fences concurrent admission, organization, token and proof, and makes terminal replay a no-op', async () => {
    const starts = await Promise.all([start(), start()]);
    expect(starts.map((reply) => reply.status).sort()).toEqual([201, 409]);
    const a = starts.find((reply) => reply.status === 201)!.body;
    await request(app.getHttpServer())
      .get(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', randomUUID())
      .expect(404);
    await request(app.getHttpServer())
      .put(`${base}/attempts/${a.attemptId}`)
      .set('x-test-org', randomUUID())
      .set('x-source-attempt-token', a.attemptToken)
      .send(capture())
      .expect(404);
    await submit({ ...a, attemptToken: randomUUID() }).expect(409);
    const invalid = {
      ...capture(),
      keyword: '변경',
      proof: { ...capture().proof, maxPages: 4 },
    };
    expect((await submit(a, invalid).expect(200)).body.state).toBe('FAILED');
    const alert = (await get('/api/alerts').expect(200)).body;
    await submit(a, invalid).expect(200);
    expect((await get('/api/alerts').expect(200)).body).toEqual(alert);
    await submit(a).expect(409);
    await get(`${base}/attempts/${a.attemptId}/capture`).expect(404);
    const b = (await start().expect(201)).body;
    const payload = capture();
    await submit(b, payload).expect(200);
    const reordered = {
      ...payload,
      items: payload.items.map((item) =>
        Object.fromEntries(Object.entries(item).reverse()),
      ),
    };
    await submit(b, reordered as typeof payload).expect(200);
    expect((await get('/api/alerts').expect(200)).body).toMatchObject([
      { status: 'RESOLVED', attemptId: b.attemptId },
    ]);
  });
  it('reads expiry without writes and atomically settles its failure on the next begin', async () => {
    const a = (await start().expect(201)).body;
    expect(new Date(a.expiresAt).getTime() - Date.now()).toBeGreaterThan(
      24 * 60_000,
    );
    await prisma.sourceImportRun.update({
      where: { id: a.attemptId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      (await get(`${base}/attempts/${a.attemptId}`).expect(200)).body,
    ).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    expect((await get('/api/alerts').expect(200)).body).toEqual([]);
    await submit(a).expect(409);
    expect((await start().expect(201)).body.generation).toBe('2');
    expect((await get('/api/alerts').expect(200)).body).toMatchObject([
      { status: 'OPEN', attemptId: a.attemptId },
    ]);
  });
  it('uses every original automatic candidate and only COMPLETE observed categories, without certifying newer legacy rows', async () => {
    // Existing ownership ignores account activation, but excludes inactive options.
    await prisma.channelAccount.updateMany({
      where: { organizationId: ORG },
      data: { status: 'inactive' },
    });
    const listing = await prisma.channelListing.findFirstOrThrow({
      where: { organizationId: ORG, externalId: 'OWN' },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: 'INACTIVE',
        isActive: false,
      },
    });
    await prisma.coupangRepresentativeKeywordOverride.deleteMany({
      where: { organizationId: ORG, vendorItemId: 'OWN' },
    });
    await prisma.channelListing.updateMany({
      where: { organizationId: ORG, externalId: 'OWN' },
      data: { channelName: '공예 재료', category: null },
    });
    const legacy = await prisma.coupangWingSalesRankDailySnapshot.create({
      data: {
        organizationId: ORG,
        keyword: '공예',
        vendorItemId: 'OWN',
        businessDate: currentBusinessDate(),
        capturedAt: new Date(Date.now() + 60_000),
        categoryHierarchy: '인증되지 않은 분류',
        salesRank: 99,
      },
    });
    const untouched = await prisma.coupangWingSalesRankDailySnapshot.create({
      data: {
        organizationId: ORG,
        keyword: '과거 키워드',
        vendorItemId: 'OWN',
        businessDate: currentBusinessDate(),
        capturedAt: new Date(),
        categoryHierarchy: '또 다른 과거 분류',
        salesRank: 88,
      },
    });
    const original = (
      await get('/api/ads/keyword-rank/wing-targets').expect(200)
    ).body;
    expect(
      original.targets
        .map((target: { keyword: string }) => target.keyword)
        .sort(),
    ).toEqual(['공예', '슬라임', '재료']);
    expect(
      (await get('/api/ads/keyword-rank/products').expect(200)).body.summary
        .notCollectedCount,
    ).toBe(2);
    const a = (
      await start(randomUUID(), { keyword: '공예', maxPages: 5 }).expect(201)
    ).body;
    expect(a.plan.targets).toEqual([
      {
        vendorItemId: 'OWN',
        productName: '공예 재료',
        category: null,
        keyword: '공예',
        candidateIndex: 0,
      },
    ]);
    const payload = { ...capture(), keyword: '공예' };
    payload.items[0].categoryHierarchy = '완구 > 만들기 키트';
    await submit(a, payload).expect(200);
    expect(
      await prisma.coupangWingSalesRankDailySnapshot.findUnique({
        where: { id: legacy.id },
      }),
    ).toBeNull();
    expect(
      await prisma.coupangWingSalesRankDailySnapshot.findUnique({
        where: { id: untouched.id },
      }),
    ).toMatchObject({ sourceImportRunId: null });
    const updated = (
      await get('/api/ads/keyword-rank/wing-targets').expect(200)
    ).body;
    expect(updated).toMatchObject({
      keywordCount: 4,
      targetKeywordCount: 3,
      resumed: true,
    });
    expect(
      updated.targets
        .map((target: { keyword: string }) => target.keyword)
        .sort(),
    ).toEqual(['만들기 키트', '슬라임', '재료']);
    for (const [keyword, candidateIndex] of [
      ['만들기 키트', 0],
      ['공예', 1],
      ['재료', 2],
    ] as const) {
      const next = (
        await start(randomUUID(), { keyword, maxPages: 5 }).expect(201)
      ).body;
      expect(next.plan.targets).toEqual([
        {
          vendorItemId: 'OWN',
          productName: '공예 재료',
          category: '완구 > 만들기 키트',
          keyword,
          candidateIndex,
        },
      ]);
      await fail(next).expect(201);
    }
  });
  it('stores a representative existing five-page / 100-item capture in one terminal transaction', async () => {
    const a = (await start().expect(201)).body;
    const payload = capture();
    payload.pagesScanned = 5;
    payload.collectedCount = 100;
    payload.totalResults = 340;
    payload.items = Array.from({ length: 100 }, (_, index) => ({
      ...capture().items[0],
      salesRank: index + 1,
      vendorItemId: index === 0 ? 'OWN' : `COMPETITOR-${index}`,
      productId: `PRODUCT-${index}`,
      itemId: `ITEM-${index}`,
      salesLast28d: 200 - index,
    }));
    payload.proof = {
      maxPages: 5,
      stopReason: 'max_pages_reached',
      pages: Array.from({ length: 5 }, (_, index) => ({
        searchPage: index * 5,
        itemCount: 20,
        nextSearchPage: (index + 1) * 5,
        resultArrayObserved: true,
      })),
    };
    const began = performance.now();
    expect((await submit(a, payload).expect(200)).body).toMatchObject({
      state: 'COMPLETE',
      itemCount: 100,
    });
    const terminalMs = performance.now() - began;
    const readBegan = performance.now();
    expect(
      (await get(`${base}/attempts/${a.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(payload);
    process.stdout.write(
      `Wing five-page measurement ${JSON.stringify({ bytes: Buffer.byteLength(JSON.stringify(payload)), terminalMs: Math.round(terminalMs), exactReadMs: Math.round(performance.now() - readBegan) })}\n`,
    );
    expect(
      (await get('/api/ads/keyword-rank/products').expect(200)).body.rows,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendorItemId: 'OWN',
          currentSalesRank: 1,
          salesLast28d: 200,
        }),
        expect.objectContaining({
          vendorItemId: 'MISS',
          currentSalesRank: null,
          status: 'out_of_range',
        }),
      ]),
    );
  });
  it('rolls capture and grouped replacement back with a failed success Alert, and rolls failed terminal back with its Alert', async () => {
    const a = (await start().expect(201)).body;
    const payload = capture();
    await submit(a, payload).expect(200);
    const baseline = (await get('/api/ads/keyword-rank/products').expect(200))
      .body;
    const b = (await start().expect(201)).body;
    const changed = capture();
    changed.items[0].salesLast28d = 999;
    vi.spyOn(alerts, 'resolveSourceFailure').mockRejectedValueOnce(
      new Error('Alert persistence failed'),
    );
    await submit(b, changed).expect(500);
    expect(
      (await get(`${base}/attempts/${b.attemptId}`).expect(200)).body.state,
    ).toBe('RUNNING');
    await get(`${base}/attempts/${b.attemptId}/capture`).expect(404);
    expect(
      (await get('/api/ads/keyword-rank/products').expect(200)).body,
    ).toEqual(baseline);
    vi.spyOn(alerts, 'upsertSourceFailure').mockRejectedValueOnce(
      new Error('Alert persistence failed'),
    );
    await fail(b).expect(500);
    expect(
      (await get(`${base}/attempts/${b.attemptId}`).expect(200)).body.state,
    ).toBe('RUNNING');
    await fail(b).expect(201);
    expect(
      (await get('/api/ads/keyword-rank/products').expect(200)).body,
    ).toEqual(baseline);
  });
});

function capture() {
  return {
    keyword: '슬라임',
    capturedAt: new Date().toISOString(),
    pagesScanned: 1,
    collectedCount: 1,
    totalResults: 1 as number | null,
    items: [
      {
        salesRank: 1,
        productId: 'P',
        itemId: 'I',
        vendorItemId: 'OWN',
        productName: 'Wing 투명 슬라임',
        categoryHierarchy: '완구 > 촉감완구 > 슬라임',
        salesLast28d: 120,
        pvLast28Day: 1000,
        estimatedRevenue28d: 1200000,
        conversionRate28d: 0.12,
        salePrice: 10000,
        ratingCount: 45,
      },
    ],
    proof: {
      maxPages: 5,
      stopReason: 'no_next_search_page',
      pages: [
        {
          searchPage: 0,
          itemCount: 1,
          nextSearchPage: null as number | null,
          resultArrayObserved: true,
        },
      ],
    },
  };
}
