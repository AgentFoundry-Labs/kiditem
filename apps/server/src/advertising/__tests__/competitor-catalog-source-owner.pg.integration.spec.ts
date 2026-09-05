import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsRepository } from '../../alerts/alerts.repository';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import {
  COMPETITOR_CATALOG_SOURCE_ALERT_DEDUPE_KEY,
  COMPETITOR_CATALOG_SOURCE_TYPE,
  CompetitorCatalogSourceAttemptRepositoryAdapter,
} from '../adapter/out/repository/competitor-catalog-source-attempt.repository.adapter';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { KeywordRankIngestHandler } from '../application/service/keyword-rank-ingest.handler';
import { KeywordSerpSourceRepository } from '../adapter/out/repository/keyword-serp-source.repository';
import type { PrismaClient } from '@prisma/client';
import type {
  CompetitorCatalogAttemptPlan,
  CompetitorCatalogTargetPlan,
} from '../application/port/out/repository/competitor-catalog-source-attempt.repository.port';

const FIRST_KEY = 'competitor-first';
const SECOND_KEY = 'competitor-second';
const SELLER_A: CompetitorCatalogTargetPlan = {
  sellerId: 'seller-a',
  sellerName: '판매자 A',
  sellerStoreUrl: 'https://shop.coupang.com/seller-a',
  keyword: '연필',
};
const SELLER_B: CompetitorCatalogTargetPlan = {
  sellerId: 'seller-b',
  sellerName: '판매자 B',
  sellerStoreUrl: 'https://shop.coupang.com/seller-b',
  keyword: '지우개',
};

describe('Competitor catalog source owner (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let owner: CompetitorCatalogSourceAttemptRepositoryAdapter;
  let serp: KeywordSerpSourceRepository;
  const captures = new Map<string, { id: string; document: unknown }>();

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = createOwner(prisma);
    const ranks = new KeywordRankRepositoryAdapter(prisma as never);
    serp = new KeywordSerpSourceRepository(
      prisma as never,
      new SourceFailureAlerts(new AlertsRepository(prisma as never)),
      ranks,
      new KeywordRankIngestHandler(ranks),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    captures.clear();
    await seedSerpBaseline(SELLER_A.keyword);
    await seedSerpBaseline(SELLER_B.keyword);
  });

  it('replays an identical frozen plan, rejects scope drift, and keeps a complete snapshot READY during a refresh', async () => {
    const first = await begin(FIRST_KEY, { target: 'all' }, [SELLER_A]);

    await expect(
      owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: FIRST_KEY,
        input: { target: 'all' },
        targets: [SELLER_B],
      }),
    ).resolves.toEqual(first);
    await expect(
      owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: FIRST_KEY,
        input: { target: 'seller_id', sellerId: SELLER_A.sellerId },
        targets: [SELLER_A],
      }),
    ).rejects.toThrow('SOURCE_IDEMPOTENCY_KEY_REUSED');

    await owner.submitAttempt(submission(first));
    expect(await readSellerCatalogs(SELLER_A.keyword)).toHaveLength(1);
    const original = captures.get(SELLER_A.keyword)!;
    expect(await serp.capture(TEST_ORGANIZATION_ID, original.id)).toEqual(
      original.document,
    );
    await expect(
      owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID }),
    ).resolves.toMatchObject({
      status: 'READY',
      latestAttempt: { attemptId: first.attemptId, state: 'COMPLETE' },
      latestComplete: {
        sourceImportRunId: first.attemptId,
        expectedTargetCount: 1,
      },
    });

    const refresh = await begin(SECOND_KEY, { target: 'all' }, [SELLER_A]);
    await expect(
      owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID }),
    ).resolves.toMatchObject({
      status: 'READY',
      latestAttempt: { attemptId: refresh.attemptId, state: 'RUNNING' },
      latestComplete: { sourceImportRunId: first.attemptId },
    });
  });

  it('allows one organization-scoped RUNNING attempt and atomically expires its fixed lease before a new begin', async () => {
    const first = await begin(FIRST_KEY, { target: 'all' }, [SELLER_A]);
    const concurrent = await Promise.allSettled([
      owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: 'competing-key',
        input: { target: 'all' },
        targets: [SELLER_A],
      }),
      owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: 'other-competing-key',
        input: { target: 'all' },
        targets: [SELLER_A],
      }),
    ]);
    expect(
      concurrent.filter((result) => result.status === 'rejected'),
    ).toHaveLength(2);
    expect(
      await prisma.sourceImportRun.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
          status: 'running',
        },
      }),
    ).toBe(1);

    await prisma.sourceImportRun.update({
      where: { id: first.attemptId },
      data: { expiresAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    await expect(
      owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: FIRST_KEY,
        input: { target: 'all' },
        targets: [SELLER_A],
      }),
    ).resolves.toMatchObject({ state: 'FAILED' });
    await expect(
      prisma.sourceImportRun.findUniqueOrThrow({
        where: { id: first.attemptId },
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    await expect(
      prisma.alert.findUniqueOrThrow({
        where: {
          organizationId_dedupeKey: {
            organizationId: TEST_ORGANIZATION_ID,
            dedupeKey: COMPETITOR_CATALOG_SOURCE_ALERT_DEDUPE_KEY,
          },
        },
      }),
    ).resolves.toMatchObject({ status: 'OPEN' });
  });

  it('keeps the historical no-target selection as an explicit complete zero baseline', async () => {
    const zero = await begin(FIRST_KEY, { target: 'all' }, []);

    expect(zero).toMatchObject({ state: 'COMPLETE', targets: [] });
    await expect(
      owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID }),
    ).resolves.toMatchObject({
      status: 'READY',
      latestAttempt: { attemptId: zero.attemptId, state: 'COMPLETE' },
      latestComplete: {
        sourceImportRunId: zero.attemptId,
        expectedTargetCount: 0,
        capturedTargetCount: 0,
      },
    });
  });

  it('fences terminal writes by organization, server token, and the exact frozen target set', async () => {
    const attempt = await begin(FIRST_KEY, { target: 'all' }, [
      SELLER_A,
      SELLER_B,
    ]);

    await expect(
      owner.readAttemptControl({
        organizationId: OTHER_ORGANIZATION_ID,
        attemptId: attempt.attemptId,
      }),
    ).resolves.toBeNull();
    await expect(
      owner.submitAttempt({
        ...submission(attempt),
        organizationId: OTHER_ORGANIZATION_ID,
      }),
    ).rejects.toThrow('COMPETITOR_CATALOG_ATTEMPT_NOT_FOUND');
    await expect(
      owner.submitAttempt({
        ...submission(attempt),
        attemptToken: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toThrow('ATTEMPT_FENCE_LOST');
    await expect(
      owner.submitAttempt({
        ...submission(attempt),
        catalogs: [catalogFor(SELLER_A)],
      }),
    ).rejects.toThrow('COMPETITOR_CATALOG_SNAPSHOT_INCOMPLETE');

    await expect(
      prisma.sourceImportRun.findUniqueOrThrow({
        where: { id: attempt.attemptId },
      }),
    ).resolves.toMatchObject({ status: 'running' });
    await expect(readSellerCatalogs(SELLER_A.keyword)).resolves.toEqual([]);
  });

  it('keeps prior facts current when a failed attempt cannot prove every frozen seller, then exposes stale failure provenance', async () => {
    const baseline = await begin(FIRST_KEY, { target: 'all' }, [SELLER_A]);
    await owner.submitAttempt(submission(baseline));
    const before = await readSellerCatalogs(SELLER_A.keyword);
    const incomplete = await begin(SECOND_KEY, { target: 'all' }, [
      SELLER_A,
      SELLER_B,
    ]);

    await owner.failAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: incomplete.attemptId,
      attemptToken: incomplete.attemptToken,
      code: 'COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED',
      message: 'A planned seller catalog could not be collected.',
    });

    await expect(readSellerCatalogs(SELLER_A.keyword)).resolves.toEqual(before);
    await expect(
      owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID }),
    ).resolves.toMatchObject({
      status: 'STALE',
      latestAttempt: {
        attemptId: incomplete.attemptId,
        state: 'FAILED',
        errorCode: 'COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED',
      },
      latestComplete: { sourceImportRunId: baseline.attemptId },
    });
    await expect(
      prisma.alert.findUniqueOrThrow({
        where: {
          organizationId_dedupeKey: {
            organizationId: TEST_ORGANIZATION_ID,
            dedupeKey: COMPETITOR_CATALOG_SOURCE_ALERT_DEDUPE_KEY,
          },
        },
      }),
    ).resolves.toMatchObject({
      href: '/sourcing-ai/competitor-analysis',
      status: 'OPEN',
    });
  });

  it('rolls source completion and catalog facts back when resolving the source alert fails', async () => {
    const attempt = await begin(FIRST_KEY, { target: 'all' }, [SELLER_A]);
    const alerts = new SourceFailureAlerts(
      new AlertsRepository(prisma as never),
    );
    alerts.resolveSourceFailure = async () => {
      throw new Error('alert write failed');
    };
    const failingOwner = createOwner(prisma, alerts);

    await expect(
      failingOwner.submitAttempt(submission(attempt)),
    ).rejects.toThrow('alert write failed');
    await expect(
      prisma.sourceImportRun.findUniqueOrThrow({
        where: { id: attempt.attemptId },
      }),
    ).resolves.toMatchObject({ status: 'running' });
    await expect(readSellerCatalogs(SELLER_A.keyword)).resolves.toEqual([]);
  });

  async function begin(
    idempotencyKey: string,
    input: CompetitorCatalogAttemptPlan['input'],
    plannedTargets: readonly CompetitorCatalogTargetPlan[],
  ) {
    return owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey,
      input,
      targets: plannedTargets,
    });
  }

  function submission(plan: CompetitorCatalogAttemptPlan) {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: plan.attemptId,
      attemptToken: plan.attemptToken,
      catalogs: plan.targets.map(catalogFor),
    };
  }

  function catalogFor(target: CompetitorCatalogTargetPlan) {
    return {
      keyword: target.keyword,
      sellerId: target.sellerId,
      sellerName: target.sellerName,
      sellerStoreUrl: target.sellerStoreUrl,
      totalProductCount: 1,
      collectedProductCount: 1,
      isTruncated: false,
      sort: 'newest' as const,
      capturedAt: new Date().toISOString(),
      products: [
        {
          sourceRank: 1,
          productId: `product-${target.sellerId}`,
          itemId: null,
          vendorItemId: `vendor-${target.sellerId}`,
          name: `${target.sellerName} 상품`,
          priceKrw: 12_000,
          reviewCount: 4,
          imageUrl: null,
          link: `https://www.coupang.com/vp/products/${target.sellerId}`,
        },
      ],
    };
  }

  async function seedSerpBaseline(keyword: string) {
    const attempt = await serp.begin(TEST_ORGANIZATION_ID, `serp-${keyword}`, {
      keyword,
      maxPages: 1,
    });
    await serp.complete(
      TEST_ORGANIZATION_ID,
      attempt.attemptId,
      attempt.attemptToken,
      {
        keyword,
        capturedAt: new Date().toISOString(),
        pagesScanned: 1,
        items: [
          {
            rank: 1,
            page: 1,
            positionInPage: 1,
            productId: 'baseline',
            name: 'Baseline',
          },
        ],
        pagination: {
          requestedMaxPages: 1,
          stoppedAtPage: 1,
          stopReason: 'page_limit',
        },
      },
    );
    captures.set(keyword, {
      id: attempt.attemptId,
      document: await serp.capture(TEST_ORGANIZATION_ID, attempt.attemptId),
    });
  }

  async function readSellerCatalogs(keyword: string) {
    const snapshot = await new KeywordRankRepositoryAdapter(
      prisma as never,
    ).findLatestSerp(TEST_ORGANIZATION_ID, keyword);
    const value = snapshot!.items as { sellerCatalogs?: unknown[] };
    return value.sellerCatalogs ?? [];
  }
});

function createOwner(
  prisma: PrismaClient,
  alerts = new SourceFailureAlerts(new AlertsRepository(prisma as never)),
) {
  const ranks = new KeywordRankRepositoryAdapter(prisma as never);
  const handler = new KeywordRankIngestHandler(ranks);
  return new CompetitorCatalogSourceAttemptRepositoryAdapter(
    prisma as never,
    alerts,
    handler,
  );
}
