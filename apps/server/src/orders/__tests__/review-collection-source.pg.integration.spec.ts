import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  OTHER_ORGANIZATION_ID,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { allocatePublicationSequence } from '../../common/publication-sequence';
import {
  REVIEW_COLLECTION_SOURCE_PORT,
} from '../application/port/in/review-collection-source.port';
import { ReviewCollectionSourceRepository } from '../adapter/out/repository/review-collection-source.repository';
import { ReviewsController } from '../controllers/reviews.controller';
import { ReviewIngestService } from '../services/review-ingest.service';
import { ReviewsService } from '../services/reviews.service';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

const BASE = '/api/reviews';
const REVIEW_OPTION = 'VENDOR-ITEM-1';

describe('Coupang review collection source owner over disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let httpUrl: string;
  let owner: ReviewCollectionSourceRepository;
  let reviewIngest: ReviewIngestService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const alerts = new SourceFailureAlerts(prisma as never);
    reviewIngest = new ReviewIngestService(prisma as never);
    owner = new ReviewCollectionSourceRepository(prisma as never, alerts, reviewIngest);
    const module = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        { provide: ReviewsService, useValue: {} },
        { provide: REVIEW_COLLECTION_SOURCE_PORT, useValue: owner },
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
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Coupang Wing',
        externalAccountId: 'wing-review-account',
        vendorId: 'VENDOR-REVIEW',
        isPrimary: true,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        externalId: 'PRODUCT-1',
        channelName: 'Coupang product',
        displayName: 'Review product',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: REVIEW_OPTION,
        itemName: 'Red',
      },
    });
  });

  it('freezes the plan, stages generation-tagged facts, and keeps cumulative complete facts visible', async () => {
    await prisma.review.create({
      data: {
        organizationId: ORG,
        platform: 'coupang',
        externalReviewId: 'legacy-unowned',
        rating: 1,
        content: 'legacy row must stay hidden',
      },
    });
    const first = await begin(1);
    expect(first.plan.months).toBe(1);
    expect(first.plan.pageSize).toBe(50);
    expect(first.plan.maxPagesPerWindow).toBe(40);
    expect(first.plan.windows).toHaveLength(1);

    await append(first, [review('review-old', 'old generation')]);
    await completeWindow(first, 1);
    const completedFirst = await complete(first);
    expect(completedFirst).toMatchObject({
      state: 'COMPLETE',
      coverageStartDate: first.plan.windows[0].start,
      coverageEndDate: first.plan.windows[0].end,
      windowReceipts: [{
        windowIndex: 0,
        coverageStartDate: first.plan.windows[0].start,
        coverageEndDate: first.plan.windows[0].end,
        itemCount: 1,
        pageCount: 1,
        pageLimitReached: false,
      }],
    });

    const second = await begin(1);
    await append(second, [review('review-shared', 'new generation')]);
    await completeWindow(second, 1);
    const completedSecond = await complete(second);
    const replay = await request(httpUrl)
      .post(`${BASE}/attempts/${second.attemptId}/complete`)
      .set('x-source-attempt-token', second.attemptToken)
      .expect(201);
    expect(replay.body).toMatchObject({
      attemptId: second.attemptId,
      state: 'COMPLETE',
      collected: completedSecond.collected,
    });

    const runs = await prisma.sourceImportRun.findMany({
      where: { organizationId: ORG, sourceType: 'coupang_reviews' },
      select: {
        id: true,
        status: true,
        fileHash: true,
        contentChecksum: true,
        coverageStartDate: true,
        coverageEndDate: true,
        publicationSequence: true,
      },
    });
    const runsById = new Map(runs.map((run) => [run.id, run]));
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.status)).toEqual(['completed', 'completed']);
    expect(runs.every((run) => run.fileHash === null)).toBe(true);
    expect(runs.every((run) => !!run.contentChecksum)).toBe(true);
    expect(runsById.get(first.attemptId)?.publicationSequence).toBe(1n);
    expect(runsById.get(second.attemptId)?.publicationSequence).toBe(2n);
    expect(runs.every((run) => run.coverageStartDate?.toISOString().slice(0, 10) === first.plan.windows[0].start)).toBe(true);
    expect(runs.every((run) => run.coverageEndDate?.toISOString().slice(0, 10) === first.plan.windows[0].end)).toBe(true);

    const facts = await prisma.review.findMany({
      where: { organizationId: ORG, sourceImportRunId: { not: null } },
      orderBy: { externalReviewId: 'asc' },
      select: { externalReviewId: true, sourceImportRunId: true, content: true, listingId: true },
    });
    expect(facts).toHaveLength(2);
    expect(facts.every((fact) => fact.sourceImportRunId)).toBe(true);
    expect(facts.every((fact) => fact.listingId)).toBe(true);

    const service = new ReviewsService(prisma as never);
    const visible = await service.listItems(ORG, {});
    expect(visible.items.map((item) => item.content)).toEqual(
      expect.arrayContaining(['old generation', 'new generation']),
    );
    expect(visible.items).toHaveLength(2);
    await expect(prisma.reviewCollectionChunk.count({
      where: {
        organizationId: ORG,
        sourceImportRunId: { in: [first.attemptId, second.attemptId] },
      },
    })).resolves.toBe(0);

    const listingId = visible.items[0]?.listingId;
    expect(listingId).toBeTruthy();
    const foreignAccount = await prisma.channelAccount.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Other Coupang Wing',
        externalAccountId: 'other-review-account',
        vendorId: 'OTHER-VENDOR-REVIEW',
      },
    });
    const foreignListing = await prisma.channelListing.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: foreignAccount.id,
        externalId: 'OTHER-PRODUCT-1',
        channelName: 'Other Coupang product',
        displayName: 'Other review product',
      },
    });
    const foreignRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: foreignAccount.id,
        sourceType: 'coupang_reviews',
        status: 'completed',
        importedAt: new Date(),
      },
    });
    await prisma.review.create({
      data: {
        organizationId: OTHER_ORGANIZATION_ID,
        sourceImportRunId: foreignRun.id,
        listingId: foreignListing.id,
        platform: 'coupang',
        externalReviewId: 'foreign-review',
        rating: 1,
        content: 'foreign review must stay out of owner stats',
      },
    });
    await expect(
      service.loadListingReviewStats({
        organizationId: ORG,
        listingIds: [listingId as string, foreignListing.id],
        recentSince: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      }),
    ).resolves.toEqual({
      lifetime: [
        { listingId, totalReviews: 2, avgRating: 5 },
      ],
      recent: [{ listingId, count: 2 }],
    });
  });

  it('retains staged facts and raises one source Alert when an attempt fails', async () => {
    const prior = await begin(1);
    await append(prior, [review('review-prior', 'previous complete')]);
    await completeWindow(prior, 1);
    await complete(prior);

    const service = new ReviewsService(prisma as never);
    const priorVisible = await service.listItems(ORG, {});
    const priorListingId = priorVisible.items[0]?.listingId;
    expect(priorListingId).toBeTruthy();

    const attempt = await begin(1);
    await append(attempt, [review('review-failed', 'staged before failure')]);

    await expect(
      service.loadListingReviewStats({
        organizationId: ORG,
        listingIds: [priorListingId as string],
        recentSince: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      }),
    ).resolves.toEqual({
      lifetime: [{ listingId: priorListingId, totalReviews: 1, avgRating: 5 }],
      recent: [{ listingId: priorListingId, count: 1 }],
    });

    const failed = await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/fail`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({ errorCode: 'WINDOW_COLLECTION_FAILED', errorMessage: 'Wing request failed.' })
      .expect(201);
    expect(failed.body).toMatchObject({ state: 'FAILED', errorCode: 'WINDOW_COLLECTION_FAILED' });

    await expect(prisma.review.count({ where: { organizationId: ORG } })).resolves.toBe(2);
    await expect(prisma.reviewCollectionChunk.count({
      where: { organizationId: ORG, sourceImportRunId: attempt.attemptId },
    })).resolves.toBe(1);
    await expect(prisma.alert.findFirst({
      where: { organizationId: ORG, sourceType: 'coupang_reviews', attemptId: attempt.attemptId },
    })).resolves.toMatchObject({
      status: 'OPEN',
      severity: 'error',
      href: '/reviews',
    });

    const visible = await service.listItems(ORG, {});
    expect(visible.items.map((item) => item.content)).toEqual(['previous complete']);
    await expect(
      service.loadListingReviewStats({
        organizationId: ORG,
        listingIds: [priorListingId as string],
        recentSince: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      }),
    ).resolves.toEqual({
      lifetime: [{ listingId: priorListingId, totalReviews: 1, avgRating: 5 }],
      recent: [{ listingId: priorListingId, count: 1 }],
    });

    const next = await begin(1);
    expect(next.attemptId).not.toBe(attempt.attemptId);
  });

  it('rolls back terminal completion when Alert resolution fails', async () => {
    const attempt = await begin(1);
    await append(attempt, [review('review-rollback', 'rollback')]);
    await completeWindow(attempt, 1);

    const failingAlerts = new SourceFailureAlerts(prisma as never);
    const resolve = vi.spyOn(failingAlerts, 'resolveSourceFailure').mockRejectedValueOnce(
      new Error('alert persistence failed'),
    );
    const failingOwner = new ReviewCollectionSourceRepository(
      prisma as never,
      failingAlerts,
      reviewIngest,
    );
    try {
      await expect(failingOwner.completeAttempt({
        organizationId: ORG,
        attemptId: attempt.attemptId,
        attemptToken: attempt.attemptToken,
      })).rejects.toThrow('alert persistence failed');
    } finally {
      resolve.mockRestore();
    }

    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({
        status: 'running',
        importedAt: null,
        contentChecksum: null,
        coverageStartDate: null,
        coverageEndDate: null,
        publicationSequence: null,
      });
    await expect(prisma.review.count({
      where: { organizationId: ORG, sourceImportRunId: attempt.attemptId },
    })).resolves.toBe(1);
    await expect(prisma.reviewCollectionChunk.count({
      where: { organizationId: ORG, sourceImportRunId: attempt.attemptId },
    })).resolves.toBe(1);
  });

  it('rejects page-cap completion, unfenced writes, and cross-organization reads', async () => {
    const attempt = await begin(1);
    await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/chunks`)
      .send({ windowIndex: 0, sequence: 0, items: [review('review-fence', 'fence')] })
      .expect(400);

    await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/windows/0/complete`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({
        itemCount: 0,
        pageCount: 40,
        pageLimitReached: true,
        coverageStartDate: attempt.plan.windows[0].start,
        coverageEndDate: attempt.plan.windows[0].end,
      })
      .expect(409);

    await request(httpUrl)
      .get(`${BASE}/attempts/${attempt.attemptId}`)
      .set('x-test-org', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e')
      .expect(404);

    await request(httpUrl)
      .post(`${BASE}/ingest`)
      .send({ platform: 'coupang', items: [review('unfenced', 'must be rejected')] })
      .expect(404);
  });

  it('requires each public window completion to confirm the exact frozen interval', async () => {
    const attempt = await begin(1);
    const window = attempt.plan.windows[0];

    await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/windows/0/complete`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({ itemCount: 0, pageCount: 0, pageLimitReached: false })
      .expect(400);

    await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/windows/0/complete`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({
        itemCount: 0,
        pageCount: 0,
        pageLimitReached: false,
        coverageStartDate: '2000-01-01',
        coverageEndDate: window.end,
      })
      .expect(409);

    const observed = await request(httpUrl)
      .get(`${BASE}/attempts/${attempt.attemptId}`)
      .expect(200);
    expect(observed.body).toMatchObject({
      state: 'RUNNING',
      completedWindows: [],
      windowReceipts: [],
      coverageStartDate: null,
      coverageEndDate: null,
    });

    const confirmed = await completeWindow(attempt, 0);
    expect(confirmed.body).toMatchObject({
      state: 'RUNNING',
      completedWindows: [0],
      windowReceipts: [{
        windowIndex: 0,
        itemCount: 0,
        pageCount: 0,
        pageLimitReached: false,
        coverageStartDate: window.start,
        coverageEndDate: window.end,
      }],
      coverageStartDate: null,
      coverageEndDate: null,
    });
    await request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/windows/0/complete`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({
        itemCount: 0,
        pageCount: 0,
        pageLimitReached: false,
        coverageStartDate: '2000-01-01',
        coverageEndDate: window.end,
      })
      .expect(409);
  });

  it('publishes aggregate coverage only after retaining every confirmed window receipt', async () => {
    const attempt = await begin(3);
    for (const window of attempt.plan.windows) {
      await completeWindow(attempt, 0, window.index);
    }

    const completed = await complete(attempt);
    expect(completed).toMatchObject({
      state: 'COMPLETE',
      coverageStartDate: attempt.plan.windows[2].start,
      coverageEndDate: attempt.plan.windows[0].end,
    });
    expect(completed.windowReceipts).toEqual(attempt.plan.windows.map((window) => ({
      windowIndex: window.index,
      itemCount: 0,
      pageCount: 0,
      pageLimitReached: false,
      coverageStartDate: window.start,
      coverageEndDate: window.end,
    })));
  });

  it('uses publication order when completed generations share a timestamp and UUID order is reversed', async () => {
    const older = await forceAttemptId(await begin(1), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
    await append(older, [review('review-shared', 'older publication')]);
    await completeWindow(older, 1);
    await complete(older);

    const newer = await forceAttemptId(await begin(1), '00000000-0000-4000-8000-000000000001');
    await append(newer, [review('review-shared', 'newer publication')]);
    await completeWindow(newer, 1);
    await complete(newer);

    const identicalImportedAt = new Date('2026-09-07T00:00:00.000Z');
    await prisma.sourceImportRun.updateMany({
      where: { id: { in: [older.attemptId, newer.attemptId] } },
      data: { importedAt: identicalImportedAt },
    });

    const visible = await new ReviewsService(prisma as never).listItems(ORG, {});
    expect(visible.items.map((item) => item.content)).toEqual(['newer publication']);
  });

  it('serializes the review publication sequence with other publishers of the organization source', async () => {
    const attempt = await begin(1);
    await append(attempt, [review('review-serialized', 'serialized publication')]);
    await completeWindow(attempt, 1);

    let holderReady!: () => void;
    const holding = new Promise<void>((resolve) => { holderReady = resolve; });
    let releaseHolder!: () => void;
    const released = new Promise<void>((resolve) => { releaseHolder = resolve; });
    const otherPublication = prisma.$transaction(async (tx) => {
      const publicationSequence = await allocatePublicationSequence(tx, ORG, 'coupang_reviews');
      await tx.sourceImportRun.create({
        data: {
          organizationId: ORG,
          sourceType: 'coupang_reviews',
          status: 'completed',
          importedAt: new Date(),
          publicationSequence,
        },
      });
      holderReady();
      await released;
      return publicationSequence;
    }, { maxWait: 10_000, timeout: 30_000 });
    await holding;

    const completion = complete(attempt);
    try {
      await waitForBlockedSession(prisma);
    } finally {
      releaseHolder();
    }

    await expect(completion).resolves.toMatchObject({ state: 'COMPLETE', collected: 1 });
    await expect(otherPublication).resolves.toBe(1n);
    await expect(prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: attempt.attemptId },
      select: { publicationSequence: true },
    })).resolves.toEqual({ publicationSequence: 2n });

    // The partial unique index still rejects a reused sequence and leaves
    // unpublished runs unconstrained.
    await expect(prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'coupang_reviews',
        status: 'failed',
        publicationSequence: 2n,
      },
    })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.sourceImportRun.createMany({
      data: [
        { organizationId: ORG, sourceType: 'coupang_reviews', status: 'failed' },
        { organizationId: ORG, sourceType: 'coupang_reviews', status: 'failed' },
      ],
    })).resolves.toEqual({ count: 2 });
  });

  async function begin(months: number) {
    const response = await request(httpUrl)
      .post(`${BASE}/attempts`)
      .set('Idempotency-Key', randomUUID())
      .send({ months })
      .expect(201);
    return response.body as {
      attemptId: string;
      attemptToken: string;
      plan: {
        months: number;
        pageSize: number;
        maxPagesPerWindow: number;
        windows: Array<{ index: number; start: string; end: string }>;
      };
    };
  }

  async function forceAttemptId<T extends { attemptId: string }>(attempt: T, attemptId: string): Promise<T> {
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId },
      data: { id: attemptId },
    });
    return { ...attempt, attemptId };
  }

  async function append(
    attempt: { attemptId: string; attemptToken: string },
    items: unknown[],
  ) {
    return request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/chunks`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({ windowIndex: 0, sequence: 0, items })
      .expect(201);
  }

  async function completeWindow(
    attempt: {
      attemptId: string;
      attemptToken: string;
      plan: { windows: Array<{ start: string; end: string }> };
    },
    itemCount: number,
    windowIndex = 0,
  ) {
    const window = attempt.plan.windows[windowIndex];
    return request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/windows/${windowIndex}/complete`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .send({
        itemCount,
        pageCount: itemCount > 0 ? 1 : 0,
        pageLimitReached: false,
        coverageStartDate: window.start,
        coverageEndDate: window.end,
      })
      .expect(201);
  }

  async function complete(attempt: { attemptId: string; attemptToken: string }) {
    return request(httpUrl)
      .post(`${BASE}/attempts/${attempt.attemptId}/complete`)
      .set('x-source-attempt-token', attempt.attemptToken)
      .expect(201)
      .then((response) => response.body as {
        state: string;
        collected: number;
        coverageStartDate: string | null;
        coverageEndDate: string | null;
        windowReceipts: Array<{
          windowIndex: number;
          coverageStartDate: string;
          coverageEndDate: string;
          itemCount: number;
          pageCount: number;
          pageLimitReached: boolean;
        }>;
      });
  }
});

function review(externalReviewId: string, content: string) {
  return {
    externalReviewId,
    externalOptionId: REVIEW_OPTION,
    externalProductId: 'PRODUCT-1',
    itemName: 'Review product',
    rating: 5,
    title: 'Title',
    content,
    reviewerName: 'Reviewer',
    reviewedAt: Date.now(),
    imageCount: 0,
    videoCount: 0,
    isDeleted: false,
    isBlinded: false,
  };
}

async function waitForBlockedSession(prisma: PrismaClient): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [activity] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND state = 'active'
          AND wait_event_type = 'Lock'
      ) AS waiting
    `;
    if (activity?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for the review publication to block.');
}
