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
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
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
  let httpUrl: string;
  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(prisma as never);
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
    // Keep one real listener for the whole fixture. Passing an unbound
    // HttpServer to supertest makes each request lazily listen/close it;
    // concurrent admission and rendezvous tests can race that lifecycle.
    await app.listen(0, '127.0.0.1');
    httpUrl = await app.getUrl();
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
    request(httpUrl)
      .post(`/api/ads/keyword-rank/${source}/batch-attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', key)
      .send({});
  const read = (source: string, key: string, org = ORG) =>
    request(httpUrl)
      .get(`/api/ads/keyword-rank/${source}/batch-attempts`)
      .set('x-test-org', org)
      .set('Idempotency-Key', key);
  const cancel = (source: string, key: string, org = ORG) =>
    request(httpUrl)
      .post(`/api/ads/keyword-rank/${source}/batch-attempts/cancel`)
      .set('x-test-org', org)
      .set('Idempotency-Key', key);
  const control = (source: string, id: string) =>
    request(httpUrl)
      .get(`/api/ads/keyword-rank/${source}/attempts/${id}`)
      .set('x-test-org', ORG);
  const single = (source: string, key: string, keyword: string) =>
    request(httpUrl)
      .post(`/api/ads/keyword-rank/${source}/attempts`)
      .set('x-test-org', ORG)
      .set('Idempotency-Key', key)
      .send({ keyword, maxPages: source === 'serp' ? 2 : 5 });
  const fail = async (source: string, id: string) => {
    const attempt = (await control(source, id).expect(200)).body;
    return request(httpUrl)
      .post(`/api/ads/keyword-rank/${source}/attempts/${id}/fail`)
      .set('x-test-org', ORG)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({ code: 'PROVIDER_FAILED', message: 'Provider interrupted.' })
      .expect(201);
  };
  const capturePayload = (source: string, attempt: { keyword: string }) =>
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
  const seedLargeBatch = async (source: string) => {
    const keywords = Array.from(
      { length: 121 },
      (_, index) => `batch-${source}-${index}`,
    );
    if (source === 'serp') {
      await prisma.coupangKeywordTracker.createMany({
        data: keywords.map((keyword) => ({
          organizationId: ORG,
          keyword,
          maxPages: 2,
          createdAt: new Date('2026-09-01T00:00:00Z'),
        })),
      });
      return keywords;
    }
    await prisma.channelListingOption.updateMany({
      where: { organizationId: ORG },
      data: { isActive: false },
    });
    const account = await prisma.channelAccount.findFirstOrThrow({
      where: { organizationId: ORG },
    });
    const externalIds = keywords.map((_, index) => `BATCH-${index}`);
    await prisma.channelListing.createMany({
      data: externalIds.map((externalId, index) => ({
        organizationId: ORG,
        channelAccountId: account.id,
        externalId,
        channelName: `Batch 상품 ${index}`,
      })),
    });
    const listings = await prisma.channelListing.findMany({
      where: { organizationId: ORG, externalId: { in: externalIds } },
      select: { id: true, externalId: true },
    });
    await prisma.channelListingOption.createMany({
      data: listings.map(({ id, externalId }) => ({
        organizationId: ORG,
        listingId: id,
        externalOptionId: externalId,
      })),
    });
    await prisma.coupangRepresentativeKeywordOverride.createMany({
      data: externalIds.map((vendorItemId, index) => ({
        organizationId: ORG,
        vendorItemId,
        keyword: keywords[index],
      })),
    });
    return keywords;
  };
  const seedOtherBatch = async (source: string) => {
    const keyword = `batch-${source}-isolated`;
    if (source === 'serp') {
      await prisma.coupangKeywordTracker.updateMany({
        where: { organizationId: ORG, keyword: { startsWith: `batch-${source}-` } },
        data: { enabled: false },
      });
      await prisma.coupangKeywordTracker.create({
        data: { organizationId: ORG, keyword, maxPages: 2 },
      });
      return;
    }
    await prisma.channelListingOption.updateMany({
      where: { organizationId: ORG },
      data: { isActive: false },
    });
    const account = await prisma.channelAccount.findFirstOrThrow({
      where: { organizationId: ORG },
    });
    const externalId = 'BATCH-ISOLATED';
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        externalId,
        channelName: 'Isolated batch 상품',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: externalId,
      },
    });
    await prisma.coupangRepresentativeKeywordOverride.create({
      data: { organizationId: ORG, vendorItemId: externalId, keyword },
    });
  };
  const complete = async (source: string, id: string) => {
    const attempt = (await control(source, id).expect(200)).body;
    const payload = capturePayload(source, attempt);
    const response = await request(httpUrl)
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
      await request(httpUrl)
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
              await request(httpUrl)
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
      const firstStatus = await request(httpUrl)
        .get(`/api/ads/keyword-rank/${source}/source`)
        .query({ keyword: publicTargets[0] })
        .set('x-test-org', ORG)
        .expect(200);
      expect(firstStatus.body.latestAttempt).toBeNull();
      await fail(source, existing.attemptId);
      const admitted = (await begin(source, key).expect(201)).body;
      await single(source, key, publicTargets[0]).expect(409);
      await read(source, key, randomUUID()).expect(404);
      await request(httpUrl)
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
      const exact = await request(httpUrl)
        .get(
          `/api/ads/keyword-rank/${source}/attempts/${first.attemptId}/capture`,
        )
        .set('x-test-org', ORG)
        .expect(200);
      expect(exact.body.capture).toEqual(payload);
      expect(
        (
          await request(httpUrl)
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
    '%s cancels more than 120 members in bounded replays with expiry alerts and exact fences',
    async (source) => {
      await seedLargeBatch(source);
      const key = randomUUID();
      const admitted = (await begin(source, key).expect(201)).body;
      expect(admitted.attempts).toHaveLength(121);
      const [completedAttempt, failedAttempt, expiredAttempt] = admitted.attempts;
      const lateAttempt = admitted.attempts[100];
      const lateControl = (
        await control(source, lateAttempt.attemptId).expect(200)
      ).body;

      await complete(source, completedAttempt.attemptId);
      await fail(source, failedAttempt.attemptId);
      await prisma.sourceImportRun.update({
        where: { id: expiredAttempt.attemptId },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      await seedOtherBatch(source);
      const otherKey = randomUUID();
      const other = (await begin(source, otherKey).expect(201)).body;
      expect(other.attempts).toHaveLength(1);
      await cancel(source, key, OTHER_ORG).expect(404);

      const first = (await cancel(source, key).expect(201)).body;
      expect(first.attempts.filter((attempt: { state: string }) => attempt.state === 'RUNNING')).toHaveLength(69);
      expect(first.attempts[0].state).toBe('COMPLETE');
      expect(first.attempts[1]).toMatchObject({ state: 'FAILED', errorCode: 'PROVIDER_FAILED' });
      expect(first.attempts[2]).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });

      const second = (await cancel(source, key).expect(201)).body;
      expect(second.attempts.filter((attempt: { state: string }) => attempt.state === 'RUNNING')).toHaveLength(19);
      const third = (await cancel(source, key).expect(201)).body;
      expect(third.attempts.filter((attempt: { state: string }) => attempt.state === 'RUNNING')).toHaveLength(0);
      expect((await cancel(source, key).expect(201)).body).toEqual(third);

      const expiredAlert = await prisma.alert.findFirstOrThrow({
        where: { organizationId: ORG, attemptId: expiredAttempt.attemptId },
      });
      expect(expiredAlert).toMatchObject({
        status: 'OPEN',
        sourceType: source === 'serp' ? 'coupang_keyword_serp' : 'coupang_wing_rank',
        message: expect.stringContaining('ATTEMPT_EXPIRED'),
      });
      expect(await prisma.alert.findFirst({
        where: { organizationId: ORG, attemptId: lateAttempt.attemptId },
      })).toBeNull();
      expect((await read(source, otherKey).expect(200)).body.attempts.map(
        (attempt: { state: string }) => attempt.state,
      )).toEqual(['RUNNING']);

      const lateResponse = await request(httpUrl)
        .put(`/api/ads/keyword-rank/${source}/attempts/${lateAttempt.attemptId}`)
        .set('x-test-org', ORG)
        .set('x-source-attempt-token', lateControl.attemptToken)
        .send(capturePayload(source, lateControl));
      expect(lateResponse.status).toBe(409);
      expect((await read(source, key).expect(200)).body.attempts[100]).toMatchObject({
        state: 'FAILED',
        errorCode: 'COLLECTION_CANCELLED',
      });
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
