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
  WING_TRACKED_PRODUCTS_ALERT_DEDUPE_KEY,
  WING_TRACKED_PRODUCTS_SOURCE_TYPE,
  WingTrackedProductSourceAttemptRepositoryAdapter,
} from '../adapter/out/repository/wing-tracked-product-source-attempt.repository.adapter';
import { WingTrackedProductRepositoryAdapter } from '../adapter/out/repository/wing-tracked-product.repository.adapter';
import type { PrismaClient } from '@prisma/client';
import type {
  WingTrackedProductAttemptPlan,
  WingTrackedProductAttemptUpload,
  WingTrackedProductRow,
} from '../application/port/out/repository/wing-tracked-product.repository.port';

const FIRST_KEY = 'wing-tracked-first';
const SECOND_KEY = 'wing-tracked-second';

describe('Coupang Wing tracked-products source owner (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let owner: WingTrackedProductSourceAttemptRepositoryAdapter;
  let trackers: WingTrackedProductRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    owner = createOwner(prisma);
    trackers = new WingTrackedProductRepositoryAdapter(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('replays an identical start, rejects a fingerprint drift, and keeps a prior complete snapshot READY while refresh is RUNNING', async () => {
    await registerTracker('wing-1', 'A Pencil');
    const first = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
      keywords: ['A Pencil'],
    });

    await expect(owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
      keywords: ['A Pencil'],
    })).resolves.toEqual(first);
    await expect(owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
      keywords: ['Different Pencil'],
    })).rejects.toThrow('SOURCE_IDEMPOTENCY_KEY_REUSED');

    await owner.submitAttempt(upload(first, 10_000));
    await expect(owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
      keywords: ['A Pencil'],
    })).resolves.toMatchObject({
      attemptId: first.attemptId,
      state: 'COMPLETE',
    });
    await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
      latestAttempt: { attemptId: first.attemptId, state: 'COMPLETE' },
      latestComplete: { sourceImportRunId: first.attemptId, capturedProductCount: 1 },
      status: 'READY',
    });
    await expect(snapshotFor('wing-1')).resolves.toMatchObject({ salePriceKrw: 10_000 });

    const refresh = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
      keywords: ['A Pencil'],
    });
    await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
      latestAttempt: { attemptId: refresh.attemptId, state: 'RUNNING' },
      latestComplete: { sourceImportRunId: first.attemptId },
      status: 'READY',
    });
  });

  it('fences control and terminal writes by organization and server-issued attempt token', async () => {
    await registerTracker('wing-1', 'A Pencil');
    const attempt = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: FIRST_KEY,
      keywords: ['A Pencil'],
    });

    await expect(owner.readAttemptControl({
      organizationId: OTHER_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    })).resolves.toBeNull();
    await expect(owner.submitAttempt({
      ...upload(attempt, 10_000),
      organizationId: OTHER_ORGANIZATION_ID,
    })).rejects.toThrow('WING_TRACKED_ATTEMPT_NOT_FOUND');
    await expect(owner.submitAttempt({
      ...upload(attempt, 10_000),
      attemptToken: '33333333-3333-4333-8333-333333333333',
    })).rejects.toThrow('ATTEMPT_FENCE_LOST');

    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } }))
      .resolves.toMatchObject({ status: 'running' });
  });

  it('keeps the prior complete facts current when an incomplete collection becomes FAILED', async () => {
    await registerTracker('wing-1', 'A Pencil');
    await registerTracker('wing-2', 'Other Pencil');
    const baseline = await completeAttempt(FIRST_KEY, ['A Pencil', 'Other Pencil'], 10_000);
    const before = await snapshotFor('wing-1');
    const incomplete = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
      keywords: ['A Pencil', 'Other Pencil'],
    });

    await expect(owner.submitAttempt({
      ...upload(incomplete, 99_000),
      items: upload(incomplete, 99_000).items.slice(0, 1),
    })).rejects.toThrow('WING_TRACKED_SNAPSHOT_INCOMPLETE');
    await owner.failAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: incomplete.attemptId,
      attemptToken: incomplete.attemptToken,
      code: 'WING_TRACKED_SNAPSHOT_INCOMPLETE',
      message: 'Wing did not return every planned product.',
    });
    await expect(owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
      keywords: ['A Pencil', 'Other Pencil'],
    })).resolves.toMatchObject({
      attemptId: incomplete.attemptId,
      state: 'FAILED',
    });

    await expect(snapshotFor('wing-1')).resolves.toMatchObject({
      id: before?.id,
      salePriceKrw: before?.salePriceKrw,
    });
    await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
      latestAttempt: { attemptId: incomplete.attemptId, state: 'FAILED' },
      latestComplete: { sourceImportRunId: baseline.attemptId },
      status: 'STALE',
    });
    await expect(prisma.alert.findUniqueOrThrow({
      where: {
        organizationId_dedupeKey: {
          organizationId: TEST_ORGANIZATION_ID,
          dedupeKey: WING_TRACKED_PRODUCTS_ALERT_DEDUPE_KEY,
        },
      },
    })).resolves.toMatchObject({ href: '/sourcing-ai/product-tracking', status: 'OPEN' });
  });

  it('rolls the terminal fact replacement and state back when Alert resolution fails', async () => {
    await registerTracker('wing-1', 'A Pencil');
    const baseline = await completeAttempt(FIRST_KEY, ['A Pencil'], 10_000);
    const before = await snapshotFor('wing-1');
    const replacement = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
      keywords: ['A Pencil'],
    });
    const failingAlerts = new SourceFailureAlerts(new AlertsRepository(prisma as never));
    failingAlerts.resolveSourceFailure = async () => {
      throw new Error('alert write failed');
    };
    const failingOwner = new WingTrackedProductSourceAttemptRepositoryAdapter(
      prisma as never,
      failingAlerts,
    );

    await expect(failingOwner.submitAttempt(upload(replacement, 99_000))).rejects.toThrow('alert write failed');

    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: replacement.attemptId } }))
      .resolves.toMatchObject({ status: 'running' });
    await expect(snapshotFor('wing-1')).resolves.toMatchObject({
      id: before?.id,
      salePriceKrw: before?.salePriceKrw,
    });
    await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
      latestAttempt: { attemptId: replacement.attemptId, state: 'RUNNING' },
      latestComplete: { sourceImportRunId: baseline.attemptId },
      status: 'READY',
    });
  });

  it.each(['addition', 'removal', 'source-keyword change'] as const)(
    'derives STALE from a completed source when current tracker targets have a %s',
    async (change) => {
      const first = await registerTracker('wing-1', 'A Pencil');
      const second = change === 'removal'
        ? await registerTracker('wing-2', 'Other Pencil')
        : null;
      const baseline = await completeAttempt(
        FIRST_KEY,
        change === 'removal' ? ['A Pencil', 'Other Pencil'] : ['A Pencil'],
        10_000,
      );

      if (change === 'addition') await registerTracker('wing-3', 'Extra Pencil');
      if (change === 'removal') await trackers.delete(second!.id, TEST_ORGANIZATION_ID);
      if (change === 'source-keyword change') await registerTracker(first.productId, 'Changed Pencil');

      await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
        latestAttempt: { attemptId: baseline.attemptId, state: 'COMPLETE' },
        latestComplete: { sourceImportRunId: baseline.attemptId },
        status: 'STALE',
      });
    },
  );

  it.each(['addition', 'removal', 'source-keyword change'] as const)(
    'rejects terminal publication after a frozen tracker plan sees a %s',
    async (change) => {
      const first = await registerTracker('wing-1', 'A Pencil');
      const second = change === 'removal'
        ? await registerTracker('wing-2', 'Other Pencil')
        : null;
      await completeAttempt(
        FIRST_KEY,
        change === 'removal' ? ['A Pencil', 'Other Pencil'] : ['A Pencil'],
        10_000,
      );
      const candidate = await owner.beginAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        idempotencyKey: SECOND_KEY,
        keywords: change === 'removal' ? ['A Pencil', 'Other Pencil'] : ['A Pencil'],
      });
      if (change === 'addition') await registerTracker('wing-3', 'Extra Pencil');
      if (change === 'removal') await trackers.delete(second!.id, TEST_ORGANIZATION_ID);
      if (change === 'source-keyword change') await registerTracker(first.productId, 'Changed Pencil');
      const before = await snapshotFor('wing-1');

      await expect(owner.submitAttempt(upload(candidate, 99_000))).rejects.toThrow('WING_TRACKED_TARGET_CHANGED');
      await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: candidate.attemptId } }))
        .resolves.toMatchObject({ status: 'running' });
      await expect(snapshotFor('wing-1')).resolves.toMatchObject({
        id: before?.id,
        salePriceKrw: before?.salePriceKrw,
      });
    },
  );

  it('serializes tracker registration and terminal publication on one source lock', async () => {
    await registerTracker('wing-1', 'A Pencil');
    const baseline = await completeAttempt(FIRST_KEY, ['A Pencil'], 10_000);
    const candidate = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: SECOND_KEY,
      keywords: ['A Pencil'],
    });

    let releaseLock!: () => void;
    let lockAcquired!: () => void;
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const acquired = new Promise<void>((resolve) => { lockAcquired = resolve; });
    const heldLock = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`kiditem.coupang-wing-tracked-products:${TEST_ORGANIZATION_ID}`}, 0)
        )::text AS "lock"
      `;
      lockAcquired();
      await release;
    });
    await acquired;
    const publication = owner.submitAttempt(upload(candidate, 99_000)).then(
      () => ({ kind: 'COMPLETE' as const }),
      (error: unknown) => ({ kind: 'REJECTED' as const, error }),
    );
    const registration = registerTracker('wing-3', 'Extra Pencil');
    await waitForBlockedAdvisoryLock(prisma);
    releaseLock();
    await heldLock;
    await registration;
    const result = await publication;

    const attempt = await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: candidate.attemptId } });
    expect(['completed', 'running']).toContain(attempt.status);
    if (result.kind === 'COMPLETE') {
      expect(attempt.status).toBe('completed');
    } else {
      expect((result.error as Error).message).toContain('WING_TRACKED_TARGET_CHANGED');
      expect(attempt.status).toBe('running');
    }
    await expect(owner.readSourceStatus({ organizationId: TEST_ORGANIZATION_ID })).resolves.toMatchObject({
      latestComplete: {
        sourceImportRunId: result.kind === 'COMPLETE' ? candidate.attemptId : baseline.attemptId,
      },
      status: 'STALE',
    });
  });

  async function registerTracker(productId: string, sourceKeyword: string): Promise<WingTrackedProductRow> {
    return trackers.registerWithInitialSnapshot({
      productId,
      productName: `Tracked ${productId}`,
      sourceKeyword,
      salePriceKrw: 1_000,
      ratingCount: 1,
      ratingAverage: 4.5,
      pvLast28Day: 10,
      salesLast28d: 2,
      estimatedRevenue28d: 2_000,
      conversionRate28d: 0.2,
    }, TEST_ORGANIZATION_ID);
  }

  async function completeAttempt(
    idempotencyKey: string,
    keywords: readonly string[],
    price: number,
  ): Promise<WingTrackedProductAttemptPlan> {
    const plan = await owner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey,
      keywords,
    });
    await owner.submitAttempt(upload(plan, price));
    return plan;
  }

  function upload(
    plan: WingTrackedProductAttemptPlan,
    price: number,
  ): WingTrackedProductAttemptUpload {
    return {
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: plan.attemptId,
      attemptToken: plan.attemptToken,
      items: plan.products.map((product, index) => ({
        productId: product.productId,
        sourceKeyword: product.sourceKeyword ?? plan.keywords[0]!,
        salePriceKrw: price + index,
        ratingCount: 3,
        ratingAverage: 4.5,
        pvLast28Day: 10,
        salesLast28d: 2,
        estimatedRevenue28d: (price + index) * 2,
        conversionRate28d: 0.2,
      })),
    };
  }

  function snapshotFor(productId: string) {
    return prisma.coupangWingTrackedProductDailySnapshot.findFirst({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        trackedProduct: { productId },
      },
      orderBy: { businessDate: 'desc' },
    });
  }
});

function createOwner(prisma: PrismaClient): WingTrackedProductSourceAttemptRepositoryAdapter {
  return new WingTrackedProductSourceAttemptRepositoryAdapter(
    prisma as never,
    new SourceFailureAlerts(new AlertsRepository(prisma as never)),
  );
}

async function waitForBlockedAdvisoryLock(prisma: PrismaClient): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_locks
        WHERE locktype = 'advisory' AND granted = false
      ) AS waiting
    `;
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for tracked-Wing source lock');
}
