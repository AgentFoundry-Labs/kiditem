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
  OTHER_ORGANIZATION_ID as OTHER,
} from '../../test-helpers/real-prisma';
import { AlertsController } from '../../alerts/alerts.controller';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { SellerIdentitySourceController } from '../adapter/in/http/seller-identity-source.controller';
import { CompetitorTrackingController } from '../adapter/in/http/competitor-tracking.controller';
import { KeywordSerpSourceController } from '../adapter/in/http/keyword-serp-source.controller';
import { KeywordRankController } from '../adapter/in/http/keyword-rank.controller';
import { CompetitorCatalogSourceController } from '../adapter/in/http/competitor-catalog-source.controller';
import { KeywordRankService } from '../application/service/keyword-rank.service';
import { CompetitorCatalogSourceAttemptService } from '../application/service/competitor-catalog-source-attempt.service';
import { CompetitorCatalogSourceAttemptRepositoryAdapter } from '../adapter/out/repository/competitor-catalog-source-attempt.repository.adapter';
import { CompetitorTrackingService } from '../application/service/competitor-tracking.service';
import { KeywordRankIngestHandler } from '../application/service/keyword-rank-ingest.handler';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { KeywordSerpSourceRepository } from '../adapter/out/repository/keyword-serp-source.repository';
import { SellerIdentitySourceRepository } from '../adapter/out/repository/seller-identity-source.repository';

const base = '/api/ads/competitor-seller-identities/attempts';
describe('Seller identity owner HTTP + PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let alerts: SourceFailureAlerts;
  const storefront = { listNewProducts: vi.fn() };
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const rank = new KeywordRankRepositoryAdapter(prisma as never);
    const ingest = new KeywordRankIngestHandler(rank);
    alerts = new SourceFailureAlerts(prisma as never);
    const tracking = new CompetitorTrackingService(rank, storefront);
    const module = await Test.createTestingModule({
      controllers: [
        SellerIdentitySourceController,
        CompetitorTrackingController,
        KeywordSerpSourceController,
        KeywordRankController,
        CompetitorCatalogSourceController,
        AlertsController,
      ],
      providers: [
        {
          provide: SellerIdentitySourceRepository,
          useValue: new SellerIdentitySourceRepository(
            prisma as never,
            alerts,
            tracking,
            ingest,
          ),
        },
        { provide: CompetitorTrackingService, useValue: tracking },
        {
          provide: KeywordSerpSourceRepository,
          useValue: new KeywordSerpSourceRepository(
            prisma as never,
            alerts,
            rank,
            ingest,
          ),
        },
        { provide: SourceFailureAlerts, useValue: alerts },
        { provide: KeywordRankService, useValue: new KeywordRankService(rank) },
        {
          provide: CompetitorCatalogSourceAttemptService,
          useValue: new CompetitorCatalogSourceAttemptService(
            new CompetitorCatalogSourceAttemptRepositoryAdapter(
              prisma as never,
              alerts,
              ingest,
            ),
            tracking,
          ),
        },
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
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    storefront.listNewProducts
      .mockReset()
      .mockResolvedValue([
        {
          externalId: 'OWN',
          name: '초등 캐릭터 연필 문구세트',
          link: 'https://kiditem.com/product/own',
        },
      ]);
    await publishSerp();
  });
  const get = (path: string, org = ORG) =>
    request(httpUrl).get(path).set('x-test-org', org);
  const serving = (keyword = '연필 문구') =>
    get(
      `/api/ads/keyword-rank/serp?keyword=${encodeURIComponent(keyword)}`,
    ).expect(200);
  const start = (key = randomUUID()) =>
    request(httpUrl)
      .post(base)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', key)
      .send({});
  const submit = (
    attempt: { attemptId: string; attemptToken: string },
    capture: unknown,
  ) =>
    request(httpUrl)
      .put(`${base}/${attempt.attemptId}`)
      .set('x-test-org', ORG)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send(capture);
  function identities(
    attempt: { plan: { targets: Array<Record<string, unknown>> } },
    capturedAt = new Date().toISOString(),
  ) {
    return {
      capturedAt,
      identities: attempt.plan.targets.map((target) => ({
        keyword: target.keyword,
        productKey: target.productKey,
        productId: target.productId,
        vendorItemId: target.vendorItemId,
        link: target.link,
        sellerName: '확인된 문구상점',
        sellerId: 'seller-1',
        sellerStoreUrl: 'https://shop.coupang.com/vid/seller-1',
        capturedAt,
      })),
    };
  }
  async function publishSerp(keyword = '연필 문구', items = [product()]) {
    const attempt = (
      await request(httpUrl)
        .post('/api/ads/keyword-rank/serp/attempts')
        .set('x-test-org', ORG)
        .set('Idempotency-Key', randomUUID())
        .send({ keyword, maxPages: 1 })
        .expect(201)
    ).body;
    const capture = {
      keyword,
      capturedAt: new Date().toISOString(),
      pagesScanned: 1,
      items,
      pagination: {
        requestedMaxPages: 1,
        stopReason: 'page_limit',
        stoppedAtPage: 1,
      },
    };
    const result = await request(httpUrl)
      .put(`/api/ads/keyword-rank/serp/attempts/${attempt.attemptId}`)
      .set('x-test-org', ORG)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send(capture)
      .expect(200);
    expect(result.body.state).toBe('COMPLETE');
    return { attempt, capture };
  }
  function product(
    id = '1',
    link = `https://www.coupang.com/vp/products/${id}`,
  ) {
    return {
      rank: 1,
      page: 1,
      positionInPage: 1,
      isAd: false,
      productId: id,
      vendorItemId: `V${id}`,
      name: '초등 캐릭터 연필 문구세트',
      link,
    };
  }
  it('freezes the existing server selection and replays it without repeating storefront IO', async () => {
    const selected = (
      await get(
        '/api/ads/competitors/product-detail-targets?days=30&limit=200',
      ).expect(200)
    ).body.targets;
    expect(selected).toHaveLength(1);
    const key = randomUUID();
    const first = (await start(key).expect(201)).body;
    expect(first).toMatchObject({
      state: 'RUNNING',
      generation: '1',
      plan: {
        sourceType: 'coupang_competitor_seller_identity',
        parserVersion: 'seller-identity-v1',
        days: 30,
        limit: 200,
        targets: selected,
      },
    });
    expect(Date.parse(first.expiresAt) - Date.now()).toBeGreaterThan(359_000);
    expect(Date.parse(first.expiresAt) - Date.now()).toBeLessThanOrEqual(
      360_000,
    );
    storefront.listNewProducts.mockRejectedValue(
      new Error('Replay must not call provider'),
    );
    const calls = storefront.listNewProducts.mock.calls.length;
    expect((await start(key).expect(201)).body).toEqual(first);
    expect(storefront.listNewProducts.mock.calls).toHaveLength(calls);
    expect((await get(`${base}/${first.attemptId}`).expect(200)).body).toEqual(
      first,
    );
    expect((await get(`${base}/current`).expect(200)).body).toMatchObject({
      ready: false,
      latestComplete: null,
    });
  });
  it('publishes one immutable capture and current serving identity, then replays without changing the source', async () => {
    const key = randomUUID();
    const attempt = (await start(key).expect(201)).body;
    const capture = identities(attempt);
    const terminal = (await submit(attempt, capture).expect(200)).body;
    expect(terminal).toMatchObject({
      state: 'COMPLETE',
      actualCutoffAt: capture.capturedAt,
      itemCount: 1,
    });
    expect(terminal).not.toHaveProperty('attemptToken');
    expect(
      (await get(`${base}/${attempt.attemptId}/capture`).expect(200)).body,
    ).toEqual({ attemptId: attempt.attemptId, capture });
    expect(
      (await get('/api/ads/competitors?days=30&limit=20').expect(200)).body
        .sellers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sellerId: 'seller-1', sellerResolved: true }),
      ]),
    );
    expect((await submit(attempt, capture).expect(200)).body).toEqual(terminal);
    expect((await start(key).expect(201)).body).toMatchObject({
      ...terminal,
      attemptToken: attempt.attemptToken,
    });
    await submit(attempt, {
      ...capture,
      capturedAt: new Date(Date.now() + 1).toISOString(),
    }).expect(409);
    expect((await get(`${base}/current`).expect(200)).body).toMatchObject({
      ready: true,
      latestComplete: terminal,
    });
  });
  it('fails incomplete evidence atomically and retains the prior COMPLETE capture and serving identity', async () => {
    const first = (await start().expect(201)).body;
    const firstCapture = identities(first);
    await submit(first, firstCapture).expect(200);
    await publishSerp('추가 연필 문구', [product('2')]);
    const next = (await start().expect(201)).body;
    expect(next.plan.targets).toHaveLength(1);
    const incomplete = { capturedAt: new Date().toISOString(), identities: [] };
    const failed = (await submit(next, incomplete).expect(200)).body;
    expect(failed).toMatchObject({
      state: 'FAILED',
      errorCode: 'IDENTITY_EVIDENCE_INCOMPLETE',
      actualCutoffAt: null,
    });
    expect((await submit(next, incomplete).expect(200)).body).toEqual(failed);
    await submit(next, identities(next)).expect(409);
    await get(`${base}/${next.attemptId}/capture`).expect(404);
    expect((await get(`${base}/current`).expect(200)).body).toMatchObject({
      ready: true,
      latestAttempt: failed,
      latestComplete: {
        attemptId: first.attemptId,
        actualCutoffAt: firstCapture.capturedAt,
      },
    });
    expect(
      (await get(`${base}/${first.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(firstCapture);
    const alert = (await get('/api/alerts').expect(200)).body;
    // The alert carries the sentence an operator reads. The reason code stays
    // on the run row, which the assertion above already checks.
    expect(JSON.stringify(alert)).toContain('Seller identities do not cover every eligible frozen target.');
    expect(
      (await get('/api/ads/competitors?days=30&limit=20').expect(200)).body
        .sellers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sellerId: 'seller-1', sellerResolved: true }),
      ]),
    );
  });
  it('keeps expiry reads side-effect-free, settles expiry on begin, and fences explicit failure replay', async () => {
    const admittedAt = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(admittedAt);
    const key = randomUUID();
    const first = (await start(key).expect(201)).body;
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(first.expiresAt) + 1);
    expect(
      (await get(`${base}/${first.attemptId}`).expect(200)).body,
    ).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    expect(
      JSON.stringify((await get('/api/alerts').expect(200)).body),
    ).not.toContain('Seller identity collection expired before publication.');
    await submit(first, identities(first)).expect(409);
    const next = (await start().expect(201)).body;
    expect(next.attemptId).not.toBe(first.attemptId);
    expect(
      JSON.stringify((await get('/api/alerts').expect(200)).body),
    ).toContain('Seller identity collection expired before publication.');
    const failure = {
      code: 'PROVIDER_INTERRUPTED',
      message: 'Original collector could not finish.',
    };
    const fail = (body = failure) =>
      request(httpUrl)
        .post(`${base}/${next.attemptId}/fail`)
        .set('x-test-org', ORG)
        .set('X-Source-Attempt-Token', next.attemptToken)
        .send(body);
    // Real wall clock remains before the new expiry; only the owner expiry predicate is advanced.
    vi.restoreAllMocks();
    const result = (await fail().expect(201)).body;
    expect(result).toMatchObject({ state: 'FAILED', errorCode: failure.code });
    expect((await fail().expect(201)).body).toEqual(result);
    await fail({ ...failure, message: 'Different failure' }).expect(409);
    expect((await start(key).expect(201)).body).toMatchObject({
      attemptId: first.attemptId,
      attemptToken: first.attemptToken,
      state: 'FAILED',
    });
  });
  it('fences organization, token, concurrent admission and malformed or foreign identity rows without mutation', async () => {
    const responses = await Promise.all([start(), start()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const attempt = responses.find((response) => response.status === 201)!.body;
    const capture = identities(attempt);
    await get(`${base}/${attempt.attemptId}`, OTHER).expect(404);
    await request(httpUrl)
      .put(`${base}/${attempt.attemptId}`)
      .set('x-test-org', OTHER)
      .set('X-Source-Attempt-Token', attempt.attemptToken)
      .send(capture)
      .expect(404);
    await submit({ ...attempt, attemptToken: randomUUID() }, capture).expect(
      409,
    );
    await submit(attempt, { ...capture, extra: true }).expect(400);
    await submit(attempt, {
      ...capture,
      identities: [{ ...capture.identities[0], sellerStoreUrl: 'not a url' }],
    }).expect(400);
    await submit(attempt, {
      ...capture,
      identities: [{ ...capture.identities[0], sellerId: 'different' }],
    }).expect(400);
    await submit(attempt, {
      ...capture,
      identities: [{ ...capture.identities[0], keyword: 'foreign' }],
    }).expect(422);
    await submit(attempt, {
      ...capture,
      identities: [capture.identities[0], capture.identities[0]],
    }).expect(422);
    expect(
      (await get(`${base}/${attempt.attemptId}`).expect(200)).body.state,
    ).toBe('RUNNING');
    await get(`${base}/${attempt.attemptId}/capture`).expect(404);
    expect((await submit(attempt, capture).expect(200)).body.state).toBe(
      'COMPLETE',
    );
  });
  it('retains fan-out coverage but counts unique eligible products once, and publishes a legitimate excluded-only empty capture', async () => {
    await publishSerp('다른 연필 문구', [product()]);
    const first = (await start().expect(201)).body;
    expect(first.plan.targets).toHaveLength(2);
    expect(Date.parse(first.expiresAt) - Date.now()).toBeGreaterThan(359_000);
    expect(Date.parse(first.expiresAt) - Date.now()).toBeLessThanOrEqual(
      360_000,
    );
    expect(
      (await submit(first, identities(first)).expect(200)).body,
    ).toMatchObject({ state: 'COMPLETE', itemCount: 2 });
    await publishSerp('연필 문구', [
      product('2', 'https://example.com/vp/products/2'),
    ]);
    const excluded = (await start().expect(201)).body;
    expect(excluded.plan.targets).toHaveLength(1);
    expect(Date.parse(excluded.expiresAt) - Date.now()).toBeLessThanOrEqual(
      300_000,
    );
    const capture = { capturedAt: new Date().toISOString(), identities: [] };
    expect((await submit(excluded, capture).expect(200)).body).toMatchObject({
      state: 'COMPLETE',
      itemCount: 0,
    });
    expect(
      (await get(`${base}/${excluded.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(capture);
    expect((await serving()).body.items.serpItems[0]).not.toHaveProperty(
      'sellerIdentitySourceImportRunId',
    );
  });
  it('rolls back capture, serving mutation and COMPLETE if the real Alert resolution cannot commit', async () => {
    const failed = (await start().expect(201)).body;
    await submit(failed, {
      capturedAt: new Date().toISOString(),
      identities: [],
    }).expect(200);
    const attempt = (await start().expect(201)).body;
    const capture = identities(attempt);
    // Disposable database fault: fail the final write, not an owner/repository mock.
    await prisma.$executeRaw`ALTER TABLE alerts ADD CONSTRAINT identity_test_no_resolve CHECK (status <> 'RESOLVED')`;
    try {
      await submit(attempt, capture).expect(500);
      expect(
        (await get(`${base}/${attempt.attemptId}`).expect(200)).body.state,
      ).toBe('RUNNING');
      await get(`${base}/${attempt.attemptId}/capture`).expect(404);
      expect((await serving()).body.items.serpItems[0]).not.toHaveProperty(
        'sellerIdentitySourceImportRunId',
      );
      expect(
        JSON.stringify((await get('/api/alerts').expect(200)).body),
      ).toContain('Seller identities do not cover every eligible frozen target.');
    } finally {
      await prisma.$executeRaw`ALTER TABLE alerts DROP CONSTRAINT identity_test_no_resolve`;
    }
    expect((await submit(attempt, capture).expect(200)).body.state).toBe(
      'COMPLETE',
    );
    expect((await serving()).body.items.serpItems[0]).toMatchObject({
      sellerIdentitySourceImportRunId: attempt.attemptId,
    });
    expect((await get('/api/alerts').expect(200)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'RESOLVED',
          attemptId: attempt.attemptId,
        }),
      ]),
    );
  });
  it('serializes concurrent catalog enrichment and SERP refresh without losing catalogs or resurrecting replaced products', async () => {
    const target = (
      await get('/api/ads/competitors/seller-targets?days=30&limit=20').expect(
        200,
      )
    ).body.targets[0];
    const original = await publishSerp(target.keyword, [product('2')]);
    const beginCatalog = async () =>
      (
        await request(httpUrl)
          .post('/api/ads/competitor-catalogs/attempts')
          .set('x-test-org', ORG)
          .set('Idempotency-Key', randomUUID())
          .send({ target: 'seller_id', sellerId: target.sellerId })
          .expect(201)
      ).body;
    const publishCatalog = (attempt: {
      attemptId: string;
      attemptToken: string;
    }) =>
      request(httpUrl)
        .put(`/api/ads/competitor-catalogs/attempts/${attempt.attemptId}`)
        .set('x-test-org', ORG)
        .set('X-Source-Attempt-Token', attempt.attemptToken)
        .send({
          catalogs: [
            {
              keyword: target.keyword,
              sellerId: target.sellerId,
              sellerName: target.sellerName,
              sellerStoreUrl: target.sellerStoreUrl,
              totalProductCount: 1,
              collectedProductCount: 1,
              isTruncated: false,
              sort: 'newest',
              capturedAt: new Date().toISOString(),
              products: [
                {
                  sourceRank: 1,
                  productId: '900',
                  itemId: null,
                  vendorItemId: 'CAT900',
                  name: '상점 연필',
                  priceKrw: 12_000,
                  reviewCount: 4,
                  imageUrl: null,
                  link: 'https://www.coupang.com/vp/products/900',
                },
              ],
            },
          ],
        })
        .expect(200);
    const identity = (await start().expect(201)).body;
    const catalog = await beginCatalog();
    const results = await Promise.all([
      submit(identity, identities(identity)).expect(200),
      publishCatalog(catalog),
    ]);
    expect(results[0].body.state).toBe('COMPLETE');
    const enriched = (await serving(target.keyword)).body.items;
    expect(enriched.serpItems[0]).toMatchObject({
      sellerIdentitySourceImportRunId: identity.attemptId,
    });
    expect(enriched.sellerCatalogs).toHaveLength(1);
    const originalCapturePath = `/api/ads/keyword-rank/serp/attempts/${original.attempt.attemptId}/capture`;
    expect((await get(originalCapturePath).expect(200)).body.capture).toEqual(
      original.capture,
    );

    await publishSerp(target.keyword, [product('3')]);
    const delayedIdentity = (await start().expect(201)).body;
    expect(
      delayedIdentity.plan.targets.map(
        (row: { productId: string }) => row.productId,
      ),
    ).toContain('3');
    const nextCatalog = await beginCatalog();
    const [terminal, , refreshed] = await Promise.all([
      submit(delayedIdentity, identities(delayedIdentity)).expect(200),
      publishCatalog(nextCatalog),
      publishSerp(target.keyword, [product('4')]),
    ]);
    expect(terminal.body.state).toBe('COMPLETE');
    const current = (await serving(target.keyword)).body.items;
    expect(current.serpItems).toHaveLength(1);
    expect(current.serpItems[0]).toMatchObject({ productId: '4' });
    expect(current.serpItems[0]).not.toHaveProperty(
      'sellerIdentitySourceImportRunId',
    );
    expect(current.sellerCatalogs).toHaveLength(1);
    expect(
      (
        await get(
          `/api/ads/keyword-rank/serp/attempts/${refreshed.attempt.attemptId}/capture`,
        ).expect(200)
      ).body.capture,
    ).toEqual(refreshed.capture);
    expect(
      (await get(`${base}/${delayedIdentity.attemptId}/capture`).expect(200))
        .body.capture.identities,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ productId: '3' })]),
    );
  });
  it('publishes the existing maximum 200 identities across representative SERP envelopes in one terminal', async () => {
    let serpBytes = 0;
    for (let keywordIndex = 0; keywordIndex < 10; keywordIndex += 1) {
      const items = Array.from({ length: 200 }, (_, index) => ({
        ...product(String(10_000 + keywordIndex * 200 + index)),
        rank: index + 1,
        positionInPage: index + 1,
        name:
          index < 20
            ? '초등 캐릭터 연필 문구세트'
            : `산업용 배관 부품 ${'비교관측 '.repeat(30)}${index}`,
      }));
      const published = await publishSerp(
        keywordIndex === 0 ? '연필 문구' : `연필 문구 ${keywordIndex}`,
        items,
      );
      serpBytes += Buffer.byteLength(JSON.stringify(published.capture));
    }
    const attempt = (await start().expect(201)).body;
    expect(attempt.plan.targets).toHaveLength(200);
    const capture = identities(attempt);
    const started = performance.now();
    const terminal = (await submit(attempt, capture).expect(200)).body;
    const durationMs = Math.round(performance.now() - started);
    expect(terminal).toMatchObject({ state: 'COMPLETE', itemCount: 200 });
    expect(
      (await get(`${base}/${attempt.attemptId}/capture`).expect(200)).body
        .capture,
    ).toEqual(capture);
    for (let keywordIndex = 0; keywordIndex < 10; keywordIndex += 1) {
      const current = (
        await serving(
          keywordIndex === 0 ? '연필 문구' : `연필 문구 ${keywordIndex}`,
        )
      ).body.items.serpItems;
      expect(
        current.filter(
          (row: { sellerIdentitySourceImportRunId?: string }) =>
            row.sellerIdentitySourceImportRunId === attempt.attemptId,
        ),
      ).toHaveLength(20);
    }
    process.stdout.write(
      `IDENTITY_MAXIMUM_MEASUREMENT ${JSON.stringify({ identityBytes: Buffer.byteLength(JSON.stringify(capture)), serpBytes, durationMs })}\n`,
    );
  });
});
