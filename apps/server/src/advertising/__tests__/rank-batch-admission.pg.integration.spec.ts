import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
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
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { KeywordRankController } from '../adapter/in/http/keyword-rank.controller';
import { KeywordSerpSourceController } from '../adapter/in/http/keyword-serp-source.controller';
import { WingRankSourceController } from '../adapter/in/http/wing-rank-source.controller';
import { KeywordRankService } from '../application/service/keyword-rank.service';
import { KeywordRankIngestHandler } from '../application/service/keyword-rank-ingest.handler';
import { WingSalesRankIngestHandler } from '../application/service/wing-sales-rank-ingest.handler';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { KeywordSerpSourceRepository } from '../adapter/out/repository/keyword-serp-source.repository';
import { WingRankSourceRepository } from '../adapter/out/repository/wing-rank-source.repository';

describe('Retained rank ordered admission/read incoming HTTP + PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(
      new AlertsRepository(prisma as never),
    );
    const rank = new KeywordRankRepositoryAdapter(prisma as never);
    const service = new KeywordRankService(rank);
    const module = await Test.createTestingModule({
      controllers: [
        KeywordSerpSourceController,
        WingRankSourceController,
        KeywordRankController,
      ],
      providers: [
        {
          provide: KeywordSerpSourceRepository,
          useValue: new KeywordSerpSourceRepository(
            prisma as never,
            alerts,
            rank,
            new KeywordRankIngestHandler(rank),
          ),
        },
        {
          provide: WingRankSourceRepository,
          useValue: new WingRankSourceRepository(
            prisma as never,
            alerts,
            rank,
            new WingSalesRankIngestHandler(rank),
            service,
          ),
        },
        { provide: KeywordRankService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
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
    vi.useRealTimers();
    await app?.close();
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    vi.useRealTimers();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing',
        status: 'inactive',
      },
    });
    for (const [vendorItemId, keyword] of [
      ['OWN', '슬라임'],
      ['MISS', '문구'],
    ]) {
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: ORG,
          channelAccountId: account.id,
          externalId: vendorItemId,
          channelName: `${keyword} 상품`,
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
        data: { organizationId: ORG, vendorItemId, keyword },
      });
    }
  });
  const begin = (source: string, key: string) =>
    request(app.getHttpServer())
      .post(`/api/ads/keyword-rank/${source}/batch-attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', key)
      .send({});
  const read = (source: string, key: string, org = ORG) =>
    request(app.getHttpServer())
      .get(`/api/ads/keyword-rank/${source}/batch-attempts`)
      .set('x-test-org', org)
      .set('Idempotency-Key', key);
  const control = (source: string, id: string) =>
    request(app.getHttpServer())
      .get(`/api/ads/keyword-rank/${source}/attempts/${id}`)
      .set('x-test-org', ORG);
  const single = (source: string, key: string, keyword: string) =>
    request(app.getHttpServer())
      .post(`/api/ads/keyword-rank/${source}/attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', key)
      .send({ keyword, maxPages: source === 'serp' ? 2 : 5 });
  const fail = async (source: string, id: string) => {
    const attempt = (await control(source, id).expect(200)).body;
    return request(app.getHttpServer())
      .post(`/api/ads/keyword-rank/${source}/attempts/${id}/fail`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({ code: 'PROVIDER_FAILED', message: 'Provider interrupted.' })
      .expect(201);
  };
  const seedTrackers = () =>
    prisma.coupangKeywordTracker.createMany({
      data: [
        {
          organizationId: ORG,
          keyword: '문구',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
        {
          organizationId: ORG,
          keyword: '슬라임',
          createdAt: new Date('2026-09-02T00:00:00Z'),
        },
      ],
    });
  const complete = async (source: string, id: string) => {
    const attempt = (await control(source, id).expect(200)).body;
    const payload =
      source === 'serp'
        ? {
            keyword: attempt.keyword,
            capturedAt: new Date().toISOString(),
            pagesScanned: 2,
            items: [
              {
                rank: 1,
                page: 1,
                positionInPage: 1,
                isAd: false,
                vendorItemId: 'OWN',
                productId: 'P1',
                name: '슬라임 상품',
              },
              {
                rank: 2,
                page: 2,
                positionInPage: 1,
                isAd: false,
                vendorItemId: 'MISS',
                productId: 'P2',
                name: '문구 상품',
              },
            ],
            pagination: {
              requestedMaxPages: 2,
              stoppedAtPage: 2,
              stopReason: 'page_limit',
            },
          }
        : {
            keyword: attempt.keyword,
            capturedAt: new Date().toISOString(),
            pagesScanned: 1,
            collectedCount: 0,
            totalResults: null,
            items: [],
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
    const response = await request(app.getHttpServer())
      .put(`/api/ads/keyword-rank/${source}/attempts/${id}`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send(payload)
      .expect(200);
    expect(response.body.state).toBe('COMPLETE');
    return payload;
  };

  it('freezes enabled SERP tracker order, page defaults and explicit/own scope in ordered safe attempts', async () => {
    for (const [keyword, createdAt, enabled, maxPages] of [
      ['문구', '2026-09-01T00:00:00Z', true, 1],
      ['슬라임', '2026-09-02T00:00:00Z', true, 3],
      ['disabled', '2026-09-04T00:00:00Z', false, 2],
      [' ', '2026-09-05T00:00:00Z', true, 2],
    ] as const) {
      await prisma.coupangKeywordTracker.create({
        data: {
          organizationId: ORG,
          keyword,
          createdAt: new Date(createdAt),
          enabled,
          maxPages,
          vendorItemIds: [`EXPLICIT-${keyword}`],
        },
      });
    }
    await prisma.coupangKeywordTracker.create({
      data: {
        organizationId: ORG,
        keyword: '공예',
        createdAt: new Date('2026-09-03T00:00:00Z'),
      },
    });
    const key = randomUUID();
    const response = (await begin('serp', key).expect(201)).body;
    expect(
      response.attempts.map((attempt: { keyword: string }) => attempt.keyword),
    ).toEqual(['공예', '슬라임', '문구']);
    expect(
      response.attempts.map(
        (attempt: { plan: { maxPages: number } }) => attempt.plan.maxPages,
      ),
    ).toEqual([2, 3, 1]);
    expect(response.attempts[1].plan).toMatchObject({
      explicitVendorItemIds: ['EXPLICIT-슬라임'],
      ownItems: expect.arrayContaining([
        { vendorItemId: 'OWN', productName: '슬라임 상품' },
        { vendorItemId: 'MISS', productName: '문구 상품' },
      ]),
    });
    expect(
      response.attempts.every(
        (attempt: Record<string, unknown>) =>
          !('attemptToken' in attempt) && attempt.state === 'RUNNING',
      ),
    ).toBe(true);
    expect((await read('serp', key).expect(200)).body).toEqual(response);
  });

  it('freezes the exact Wing pending selection and assignments once, preserving counts, order and replay after drift', async () => {
    const targets = (
      await request(app.getHttpServer())
        .get('/api/ads/keyword-rank/wing-targets')
        .set('x-test-org', ORG)
        .expect(200)
    ).body;
    const key = randomUUID();
    const response = (await begin('wing', key).expect(201)).body;
    expect(response.selection).toEqual(targets);
    expect(
      response.attempts.map((attempt: { keyword: string }) => attempt.keyword),
    ).toEqual(
      targets.targets.map((target: { keyword: string }) => target.keyword),
    );
    expect(response.attempts).toHaveLength(2);
    expect(
      response.attempts.map(
        (attempt: { plan: { maxPages: number } }) => attempt.plan.maxPages,
      ),
    ).toEqual([5, 5]);
    expect(
      response.attempts.flatMap(
        (attempt: { plan: { targets: unknown[] } }) => attempt.plan.targets,
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          vendorItemId: 'OWN',
          productName: '슬라임 상품',
          category: null,
          keyword: '슬라임',
          candidateIndex: 0,
        },
        {
          vendorItemId: 'MISS',
          productName: '문구 상품',
          category: null,
          keyword: '문구',
          candidateIndex: 0,
        },
      ]),
    );
    await prisma.coupangRepresentativeKeywordOverride.updateMany({
      where: { organizationId: ORG },
      data: { keyword: '변경' },
    });
    await prisma.channelListing.updateMany({
      where: { organizationId: ORG },
      data: { channelName: '변경된 이름' },
    });
    expect((await begin('wing', key).expect(201)).body).toEqual(response);
    expect((await read('wing', key).expect(200)).body).toEqual(response);
  });

  it.each(['serp', 'wing'])(
    '%s preserves all original members after anchor failure, config/day drift and later terminality',
    async (source) => {
      await seedTrackers();
      const key = randomUUID();
      const admitted = (await begin(source, key).expect(201)).body;
      const ids = admitted.attempts.map(
        (attempt: { attemptId: string }) => attempt.attemptId,
      );
      const plans = admitted.attempts.map(
        (attempt: { plan: unknown }) => attempt.plan,
      );
      await fail(source, ids[0]);
      await prisma.coupangKeywordTracker.updateMany({
        where: { organizationId: ORG },
        data: { enabled: false, vendorItemIds: ['CHANGED'], maxPages: 1 },
      });
      await prisma.coupangRepresentativeKeywordOverride.updateMany({
        where: { organizationId: ORG },
        data: { keyword: '변경' },
      });
      const failed = (await read(source, key).expect(200)).body;
      expect(
        failed.attempts.map((attempt: { state: string }) => attempt.state),
      ).toEqual(['FAILED', 'RUNNING']);
      expect(
        failed.attempts.map((attempt: { plan: unknown }) => attempt.plan),
      ).toEqual(plans);
      await fail(source, ids[1]);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 86_400_000);
      const replay = (await begin(source, key).expect(201)).body;
      expect(
        replay.attempts.map(
          (attempt: { attemptId: string }) => attempt.attemptId,
        ),
      ).toEqual(ids);
      expect(
        replay.attempts.map((attempt: { plan: unknown }) => attempt.plan),
      ).toEqual(plans);
      expect(
        replay.attempts.map((attempt: { state: string }) => attempt.state),
      ).toEqual(['FAILED', 'FAILED']);
    },
  );

  it.each(['serp', 'wing'])(
    '%s rejects overlapping admissions atomically and fences single/batch keys and every member read',
    async (source) => {
      await seedTrackers();
      const publicTargets =
        source === 'serp'
          ? ['슬라임', '문구']
          : (
              await request(app.getHttpServer())
                .get('/api/ads/keyword-rank/wing-targets')
                .set('x-test-org', ORG)
                .expect(200)
            ).body.targets.map((target: { keyword: string }) => target.keyword);
      const singleKey = randomUUID();
      const existing = (
        await single(source, singleKey, publicTargets[1]).expect(201)
      ).body;
      await begin(source, singleKey).expect(409);
      const key = randomUUID();
      await begin(source, key).expect(409);
      await read(source, key).expect(404);
      const firstStatus = await request(app.getHttpServer())
        .get(`/api/ads/keyword-rank/${source}/source`)
        .query({ keyword: publicTargets[0] })
        .set('x-test-org', ORG)
        .expect(200);
      expect(firstStatus.body.latestAttempt).toBeNull();
      await fail(source, existing.attemptId);
      const admitted = (await begin(source, key).expect(201)).body;
      await single(source, key, publicTargets[0]).expect(409);
      await read(source, key, randomUUID()).expect(404);
      await request(app.getHttpServer())
        .post(`/api/ads/keyword-rank/${source}/batch-attempts`)
        .set('x-test-org', ORG)
        .set('Idempotency-Key', key)
        .send({ maxPages: 1 })
        .expect(400);
      await prisma.sourceImportRun.update({
        where: { id: admitted.attempts[1].attemptId },
        data: { parserVersion: 'unrelated-parser' },
      });
      await read(source, key).expect(404);
      await begin(source, key).expect(404);
    },
  );

  it.each(['serp', 'wing'])(
    '%s issues fixed queue-aware expiry and does not renew it on replay or read',
    async (source) => {
      await seedTrackers();
      const key = randomUUID();
      const admitted = (await begin(source, key).expect(201)).body;
      const [first, second] = admitted.attempts;
      const firstExpiry = new Date(first.expiresAt).getTime();
      const secondExpiry = new Date(second.expiresAt).getTime();
      expect(secondExpiry - firstExpiry).toBe(
        source === 'serp' ? 608_000 : 1_502_500,
      );
      expect(firstExpiry - Date.now()).toBeGreaterThan(
        source === 'serp' ? 590_000 : 1_490_000,
      );
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(firstExpiry + 1);
      const response = (await read(source, key).expect(200)).body;
      expect(
        response.attempts.map((attempt: { state: string }) => attempt.state),
      ).toEqual(['FAILED', 'RUNNING']);
      expect((await begin(source, key).expect(201)).body).toEqual(response);
      expect(
        (await control(source, second.attemptId).expect(200)).body.expiresAt,
      ).toBe(second.expiresAt);
    },
  );

  it.each(['serp', 'wing'])(
    '%s empty selection is a nonpersisted no-op, then the same key can admit newly configured work',
    async (source) => {
      await prisma.channelListingOption.updateMany({
        where: { organizationId: ORG },
        data: { isActive: false },
      });
      const key = randomUUID();
      expect((await begin(source, key).expect(201)).body.attempts).toEqual([]);
      await read(source, key).expect(404);
      await seedTrackers();
      await prisma.channelListingOption.updateMany({
        where: { organizationId: ORG },
        data: { isActive: true },
      });
      expect((await begin(source, key).expect(201)).body.attempts).toHaveLength(
        2,
      );
    },
  );

  it.each(['serp', 'wing'])(
    '%s publishes each keyword immediately and preserves it after a later failure',
    async (source) => {
      await seedTrackers();
      const key = randomUUID();
      const admitted = (await begin(source, key).expect(201)).body;
      const [first, second] = admitted.attempts;
      const payload = await complete(source, first.attemptId);
      await fail(source, second.attemptId);
      const response = (await read(source, key).expect(200)).body;
      expect(
        response.attempts.map((attempt: { state: string }) => attempt.state),
      ).toEqual(['COMPLETE', 'FAILED']);
      expect(response.attempts[0].plan).toEqual(first.plan);
      expect((await begin(source, key).expect(201)).body).toEqual(response);
      const exact = await request(app.getHttpServer())
        .get(
          `/api/ads/keyword-rank/${source}/attempts/${first.attemptId}/capture`,
        )
        .set('x-test-org', ORG)
        .expect(200);
      expect(exact.body.capture).toEqual(payload);
      expect(
        (
          await request(app.getHttpServer())
            .get(`/api/ads/keyword-rank/${source}/source`)
            .query({ keyword: first.keyword })
            .set('x-test-org', ORG)
            .expect(200)
        ).body.latestComplete.attemptId,
      ).toBe(first.attemptId);
      if (source === 'wing') {
        const pending = (await begin(source, randomUUID()).expect(201)).body;
        expect(
          pending.attempts.map(
            (attempt: { keyword: string }) => attempt.keyword,
          ),
        ).toEqual([second.keyword]);
        expect(pending.selection).toMatchObject({
          resumed: true,
          keywordCount: 2,
          targetKeywordCount: 1,
        });
        await complete(source, pending.attempts[0].attemptId);
        const refresh = (await begin(source, randomUUID()).expect(201)).body;
        expect(refresh.selection).toMatchObject({
          resumed: false,
          keywordCount: 2,
          targetKeywordCount: 2,
          pendingProductCount: 0,
        });
        expect(
          refresh.attempts
            .map((attempt: { keyword: string }) => attempt.keyword)
            .sort(),
        ).toEqual([first.keyword, second.keyword].sort());
      }
    },
  );

  it.each(['serp', 'wing'])(
    '%s serializes concurrent same-key admission into the same exact member list',
    async (source) => {
      await seedTrackers();
      const key = randomUUID();
      const replies = await Promise.all([
        begin(source, key),
        begin(source, key),
      ]);
      expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
      expect(replies[0].body).toEqual(replies[1].body);
      await begin(source, randomUUID()).expect(409);
    },
  );

  it.each(['serp', 'wing'])(
    '%s retains selections beyond twenty keywords without adding a tracker/target cap',
    async (source) => {
      const account = await prisma.channelAccount.findFirstOrThrow({
        where: { organizationId: ORG },
      });
      for (let index = 0; index < 37; index++) {
        const keyword = `추가 키워드 ${index}`;
        if (source === 'serp') {
          await prisma.coupangKeywordTracker.create({
            data: { organizationId: ORG, keyword },
          });
        } else {
          const vendorItemId = `ADDITIONAL-${index}`;
          const listing = await prisma.channelListing.create({
            data: {
              organizationId: ORG,
              channelAccountId: account.id,
              externalId: vendorItemId,
              channelName: `추가 상품 ${index}`,
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
            data: { organizationId: ORG, vendorItemId, keyword },
          });
        }
      }
      const key = randomUUID();
      const started = performance.now();
      const response = (await begin(source, key).expect(201)).body;
      const elapsedMs = Math.round(performance.now() - started);
      expect(response.attempts).toHaveLength(source === 'serp' ? 37 : 39);
      expect((await read(source, key).expect(200)).body).toEqual(response);
      process.stdout.write(
        `Rank admission measurement ${JSON.stringify({ source, count: response.attempts.length, elapsedMs, responseBytes: Buffer.byteLength(JSON.stringify(response)) })}\n`,
      );
    },
  );
});
