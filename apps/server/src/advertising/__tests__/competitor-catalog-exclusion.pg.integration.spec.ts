import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { json } from 'express';
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
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { CompetitorCatalogSourceController } from '../adapter/in/http/competitor-catalog-source.controller';
import { CompetitorTrackingController } from '../adapter/in/http/competitor-tracking.controller';
import { KeywordSerpSourceController } from '../adapter/in/http/keyword-serp-source.controller';
import { KeywordRankController } from '../adapter/in/http/keyword-rank.controller';
import { KeywordRankService } from '../application/service/keyword-rank.service';
import { CompetitorCatalogSourceAttemptService } from '../application/service/competitor-catalog-source-attempt.service';
import { CompetitorTrackingService } from '../application/service/competitor-tracking.service';
import { KeywordRankIngestHandler } from '../application/service/keyword-rank-ingest.handler';
import { CompetitorCatalogSourceAttemptRepositoryAdapter } from '../adapter/out/repository/competitor-catalog-source-attempt.repository.adapter';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { KeywordSerpSourceRepository } from '../adapter/out/repository/keyword-serp-source.repository';
import type {
  CompetitorCatalogAttemptPlan,
  CompetitorCatalogTargetPlan,
} from '../application/port/out/repository/competitor-catalog-source-attempt.repository.port';

const base = '/api/ads/competitor-catalogs/attempts';
describe('Catalog exclusion admission HTTP + PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let serpAttemptId: string;
  const storefront = { listNewProducts: vi.fn() };
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const rank = new KeywordRankRepositoryAdapter(prisma as never);
    const ingest = new KeywordRankIngestHandler(rank);
    const alerts = new SourceFailureAlerts(prisma as never);
    const tracking = new CompetitorTrackingService(rank, storefront);
    const module = await Test.createTestingModule({
      controllers: [
        CompetitorCatalogSourceController,
        CompetitorTrackingController,
        KeywordSerpSourceController,
        KeywordRankController,
      ],
      providers: [
        { provide: CompetitorTrackingService, useValue: tracking },
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
        {
          provide: KeywordSerpSourceRepository,
          useValue: new KeywordSerpSourceRepository(
            prisma as never,
            alerts,
            rank,
            ingest,
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
        req.authUser = { id: USER, organizationId: req.headers['x-test-org'] };
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
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    storefront.listNewProducts
      .mockReset()
      .mockResolvedValue([
        {
          externalId: 'OWN',
          name: '초등 캐릭터 연필 문구세트',
          link: 'https://kiditem.com/own',
        },
      ]);
    const serpBase = '/api/ads/keyword-rank/serp/attempts';
    const serp = (
      await request(app.getHttpServer())
        .post(serpBase)
        .set('x-test-org', ORG)
        .set('Idempotency-Key', randomUUID())
        .send({ keyword: '연필 문구', maxPages: 1 })
        .expect(201)
    ).body;
    serpAttemptId = serp.attemptId;
    const published = await request(app.getHttpServer())
      .put(`${serpBase}/${serp.attemptId}`)
      .set('x-test-org', ORG)
      .set('X-Source-Attempt-Token', serp.attemptToken)
      .send({
        keyword: '연필 문구',
        capturedAt: new Date().toISOString(),
        pagesScanned: 1,
        pagination: {
          requestedMaxPages: 1,
          stopReason: 'page_limit',
          stoppedAtPage: 1,
        },
        items: Array.from({ length: 30 }, (_, index) => ({
          rank: index + 1,
          positionInPage: index + 1,
          page: 1,
          isAd: false,
          productId: String(1000 + index),
          vendorItemId: `V${index}`,
          name: '초등 캐릭터 연필 문구세트',
          link: `https://www.coupang.com/vp/products/${1000 + index}`,
          sellerName: `문구상점 ${index}`,
          sellerId: `seller-${index}`,
          sellerStoreUrl: `https://shop.coupang.com/seller-${index}`,
        })),
      })
      .expect(200);
    expect(published.body.state).toBe('COMPLETE');
  });
  const get = (path: string, org = ORG) =>
    request(app.getHttpServer()).get(path).set('x-test-org', org);
  const begin = (body: unknown, key = randomUUID(), org = ORG) =>
    request(app.getHttpServer())
      .post(base)
      .set('x-test-org', org)
      .set('Idempotency-Key', key)
      .send(body);
  const complete = (plan: CompetitorCatalogAttemptPlan, org = ORG) =>
    request(app.getHttpServer())
      .put(`${base}/${plan.attemptId}`)
      .set('x-test-org', org)
      .set('X-Source-Attempt-Token', plan.attemptToken)
      .send({ catalogs: plan.targets.map(catalog) })
      .expect(200);
  function catalog(target: CompetitorCatalogTargetPlan) {
    return {
      ...target,
      totalProductCount: 1,
      collectedProductCount: 1,
      isTruncated: false,
      sort: 'newest',
      capturedAt: new Date().toISOString(),
      products: [
        {
          sourceRank: 1,
          productId: '9000',
          itemId: null,
          vendorItemId: 'CAT9000',
          name: '연필',
          priceKrw: 1200,
          reviewCount: 1,
          imageUrl: null,
          link: 'https://www.coupang.com/vp/products/9000',
        },
      ],
    };
  }
  it('excludes only the exact COMPLETE receipt sellers from the original top20 without filling from later targets', async () => {
    storefront.listNewProducts.mockResolvedValueOnce([]);
    const initial = (await begin({ target: 'rank_enrichment' }).expect(201))
      .body;
    expect(initial.targets.length).toBeGreaterThan(0);
    expect(initial.targets.length).toBeLessThan(20);
    expect((await complete(initial)).body.latestAttempt.state).toBe('COMPLETE');
    const selected = (
      await get('/api/ads/competitors/seller-targets?days=30&limit=20').expect(
        200,
      )
    ).body.targets;
    expect(selected).toHaveLength(20);
    const completedSellers = new Set(
      initial.targets.map(
        (target: CompetitorCatalogTargetPlan) => target.sellerId,
      ),
    );
    const expected = selected.filter(
      (target: CompetitorCatalogTargetPlan) =>
        !completedSellers.has(target.sellerId),
    );
    const later = (
      await begin({
        target: 'seller_id',
        sellerId: expected[0].sellerId,
      }).expect(201)
    ).body;
    await complete(later);
    const next = (
      await begin({
        target: 'rank_enrichment',
        excludeCompletedAttemptId: initial.attemptId,
      }).expect(201)
    ).body;
    expect(next.input).toEqual({
      target: 'rank_enrichment',
      excludeCompletedAttemptId: initial.attemptId,
    });
    expect(
      next.targets.map(
        (target: CompetitorCatalogTargetPlan) => target.sellerId,
      ),
    ).toEqual(
      expected.map((target: CompetitorCatalogTargetPlan) => target.sellerId),
    );
    expect(next.targets).toHaveLength(20 - initial.targets.length);
  });
  it('replays the original input and frozen receipt without provider IO, and conflicts on changed exclusion input', async () => {
    const initialKey = randomUUID();
    const initial = (
      await begin({ target: 'rank_enrichment' }, initialKey).expect(201)
    ).body;
    await complete(initial);
    const input = {
      target: 'rank_enrichment',
      excludeCompletedAttemptId: initial.attemptId,
    };
    const key = randomUUID();
    const remaining = (await begin(input, key).expect(201)).body;
    expect(remaining).toMatchObject({ state: 'COMPLETE', input, targets: [] });
    const originalReceipt = (
      await get(`${base}/${initial.attemptId}`).expect(200)
    ).body;
    const calls = storefront.listNewProducts.mock.calls.length;
    storefront.listNewProducts.mockRejectedValue(
      new Error('Replay must not select targets'),
    );
    expect((await begin(input, key).expect(201)).body).toEqual(remaining);
    expect(
      (await begin({ target: 'rank_enrichment' }, initialKey).expect(201)).body,
    ).toEqual(originalReceipt);
    await begin({ target: 'all' }, key).expect(409);
    await begin(
      { target: 'rank_enrichment', excludeCompletedAttemptId: randomUUID() },
      key,
    ).expect(409);
    expect(storefront.listNewProducts.mock.calls).toHaveLength(calls);
  });
  it('rejects missing, foreign-org, other-source and non-COMPLETE references without admitting a new attempt', async () => {
    await begin({
      target: 'rank_enrichment',
      excludeCompletedAttemptId: 'not-a-uuid',
    }).expect(400);
    await begin({
      target: 'rank_enrichment',
      excludeCompletedAttemptId: null,
    }).expect(400);
    await begin({
      target: 'all',
      excludeCompletedAttemptId: randomUUID(),
    }).expect(400);
    const foreign = (
      await begin({ target: 'rank_enrichment' }, randomUUID(), OTHER).expect(
        201,
      )
    ).body;
    await complete(foreign, OTHER);
    for (const ref of [randomUUID(), foreign.attemptId, serpAttemptId]) {
      const rejected = await begin({
        target: 'rank_enrichment',
        excludeCompletedAttemptId: ref,
      }).expect(422);
      expect(rejected.body.message).toBe(
        'COMPETITOR_CATALOG_EXCLUSION_NOT_COMPLETE',
      );
    }
    const standalone = (await begin({ target: 'all' }).expect(201)).body;
    await complete(standalone);
    await begin({
      target: 'rank_enrichment',
      excludeCompletedAttemptId: standalone.attemptId,
    }).expect(422);
    const original = (await begin({ target: 'rank_enrichment' }).expect(201))
      .body;
    await begin({
      target: 'rank_enrichment',
      excludeCompletedAttemptId: original.attemptId,
    }).expect(422);
    await begin({
      target: 'seller_id',
      sellerId: original.targets[0].sellerId,
      excludeCompletedAttemptId: foreign.attemptId,
    }).expect(400);
    expect(
      (await get(`${base}/current`).expect(200)).body.latestAttempt.attemptId,
    ).toBe(original.attemptId);
    await request(app.getHttpServer())
      .post(`${base}/${original.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('X-Source-Attempt-Token', original.attemptToken)
      .send({ code: 'PROVIDER_FAILED', message: 'No complete catalog' })
      .expect(201);
    await begin({
      target: 'rank_enrichment',
      excludeCompletedAttemptId: original.attemptId,
    }).expect(422);
    expect(
      (await get(`${base}/current`).expect(200)).body.latestAttempt,
    ).toMatchObject({ attemptId: original.attemptId, state: 'FAILED' });
  });
  it('replays RUNNING and FAILED standalone receipts without selection, while new keys retain the existing provider policy', async () => {
    const key = randomUUID();
    const original = (await begin({ target: 'all' }, key).expect(201)).body;
    const calls = storefront.listNewProducts.mock.calls.length;
    storefront.listNewProducts.mockRejectedValue(
      new Error('Provider unavailable'),
    );
    expect((await begin({ target: 'all' }, key).expect(201)).body).toEqual(
      original,
    );
    await request(app.getHttpServer())
      .post(`${base}/${original.attemptId}/fail`)
      .set('x-test-org', ORG)
      .set('X-Source-Attempt-Token', original.attemptToken)
      .send({ code: 'PROVIDER_FAILED', message: 'No complete catalog' })
      .expect(201);
    expect((await begin({ target: 'all' }, key).expect(201)).body).toEqual({
      ...original,
      state: 'FAILED',
    });
    expect(storefront.listNewProducts.mock.calls).toHaveLength(calls);
    await begin({ target: 'all' }).expect(201);
    expect(storefront.listNewProducts.mock.calls).toHaveLength(calls + 1);
  });
  it('retains the original rank500 rows and sourceRank while fencing standalone catalogs to100', async () => {
    const rank = (await begin({ target: 'rank_enrichment' }).expect(201))
      .body as CompetitorCatalogAttemptPlan;
    const seller = rank.targets.find(
      (target) => target.keyword === '연필 문구',
    )!;
    expect(seller).toBeDefined();
    function rows(target: CompetitorCatalogTargetPlan, count: number) {
      const item = catalog(target);
      return {
        ...item,
        totalProductCount: count,
        collectedProductCount: count,
        products: Array.from({ length: count }, (_, index) => ({
          ...item.products[0],
          sourceRank: index + 1,
          productId: String(9000 + index),
          vendorItemId: `CAT${index}`,
        })),
      };
    }
    const put = (attempt: CompetitorCatalogAttemptPlan, catalogs: unknown[]) =>
      request(app.getHttpServer())
        .put(`${base}/${attempt.attemptId}`)
        .set('x-test-org', ORG)
        .set('X-Source-Attempt-Token', attempt.attemptToken)
        .send({ catalogs });
    const rankCatalogs = rank.targets.map((target) =>
      rows(target, target.sellerId === seller.sellerId ? 500 : 1),
    );
    await put(rank, rankCatalogs).expect(200);
    const serving = (
      await get(
        `/api/ads/keyword-rank/serp?keyword=${encodeURIComponent('연필 문구')}`,
      ).expect(200)
    ).body.items;
    const saved = serving.sellerCatalogs.find(
      (item: { sellerId: string }) => item.sellerId === seller.sellerId,
    );
    expect(saved.products).toHaveLength(500);
    expect(saved.products[499]).toMatchObject({
      sourceRank: 500,
      vendorItemId: 'CAT499',
    });
    const standalone = (
      await begin({ target: 'seller_id', sellerId: seller.sellerId }).expect(
        201,
      )
    ).body;
    await put(standalone, [rows(seller, 101)]).expect(422);
    const invalidRank = rows(seller, 1);
    invalidRank.products[0].sourceRank = 101;
    await put(standalone, [invalidRank]).expect(422);
    expect(
      (await get(`${base}/${standalone.attemptId}`).expect(200)).body.state,
    ).toBe('RUNNING');
    await put(standalone, [rows(seller, 100)]).expect(200);
    const all = (await begin({ target: 'all' }).expect(201))
      .body as CompetitorCatalogAttemptPlan;
    await put(
      all,
      all.targets.map((target) => rows(target, 101)),
    ).expect(422);
    await put(
      all,
      all.targets.map((target) => rows(target, 100)),
    ).expect(200);
  });
});
