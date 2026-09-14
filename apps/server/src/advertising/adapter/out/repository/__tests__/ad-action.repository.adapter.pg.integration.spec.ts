import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { AdActionRepositoryAdapter } from '../ad-action.repository.adapter';
import type { PrismaClient } from '@prisma/client';
import type { ActionCandidate } from '../../../../domain/ad-action-rules';

const PAUSE_KEYWORD_LOCK_NAMESPACE = 'kiditem_ad_action_pause_keyword';

describe('AdActionRepositoryAdapter pause_keyword concurrency (PG integration)', () => {
  let observerPrisma: PrismaClient;

  beforeAll(async () => {
    observerPrisma = makeTestPrisma();
    await observerPrisma.$connect();
  });

  afterAll(async () => {
    await observerPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(observerPrisma);
    await seedBaseFixture(observerPrisma);
  });

  async function seedKeywordTarget() {
    const channelAccount = await observerPrisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Advertising proposal test',
        externalAccountId: 'advertising-proposal-test',
      },
    });
    return observerPrisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: channelAccount.id,
        channel: 'coupang',
        businessDate: new Date('2026-07-31T00:00:00.000Z'),
        targetType: 'keyword',
        targetKey: 'account:proposal-test:keyword:콩순이 비눗방울',
        externalId: 'vendor-item-proposal-test',
        keyword: '콩순이 비눗방울',
      },
    });
  }

  function pauseCandidate(adTargetDailyId: string): ActionCandidate {
    return {
      adTargetDailyId,
      listingId: null,
      actionType: 'pause_keyword',
      targetType: 'keyword',
      externalId: 'vendor-item-proposal-test',
      targetLabel: '콩순이 비눗방울',
      reason: '상품과 무관한 캐릭터 키워드',
      priority: 'high',
      currentValue: null,
      proposedValue: null,
      payload: { source: 'keyword_relevance' },
    };
  }

  it('serializes competing proposals on the organization advisory lock and creates one open action', async () => {
    const channelAccount = await observerPrisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Advertising concurrency test',
        externalAccountId: 'advertising-concurrency-test',
      },
    });
    const target = await observerPrisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: channelAccount.id,
        channel: 'coupang',
        businessDate: new Date('2026-07-31T00:00:00.000Z'),
        targetType: 'keyword',
        targetKey: 'account:concurrency-test:keyword:콩순이 비눗방울',
        externalId: 'vendor-item-concurrency-test',
        keyword: '콩순이 비눗방울',
      },
    });
    const candidate: ActionCandidate = {
      adTargetDailyId: target.id,
      listingId: null,
      actionType: 'pause_keyword',
      targetType: 'keyword',
      externalId: 'vendor-item-concurrency-test',
      targetLabel: '콩순이 비눗방울',
      reason: '상품과 무관한 캐릭터 키워드',
      priority: 'high',
      currentValue: null,
      proposedValue: null,
      payload: { source: 'keyword_relevance' },
    };

    const lockPrisma = makeTestPrisma();
    const firstPrisma = makeTestPrisma();
    const secondPrisma = makeTestPrisma();
    await Promise.all([
      lockPrisma.$connect(),
      firstPrisma.$connect(),
      secondPrisma.$connect(),
    ]);

    let releaseLock = () => {};
    let signalLockReady = () => {};
    const lockRelease = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockReady = new Promise<void>((resolve) => {
      signalLockReady = resolve;
    });
    const lockHolder = lockPrisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${PAUSE_KEYWORD_LOCK_NAMESPACE}::text),
          hashtext(${TEST_ORGANIZATION_ID}::text)
        )::text AS locked
      `;
      signalLockReady();
      await lockRelease;
    });

    await lockReady;

    const firstRepository = new AdActionRepositoryAdapter(
      firstPrisma as never,
      {} as never,
    );
    const secondRepository = new AdActionRepositoryAdapter(
      secondPrisma as never,
      {} as never,
    );
    const competingCalls = [
      firstRepository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]),
      secondRepository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]),
    ] as const;

    try {
      await waitForAdvisoryWaiters(observerPrisma, 2);
      expect(await observerPrisma.adAction.count({
        where: { organizationId: TEST_ORGANIZATION_ID },
      })).toBe(0);

      releaseLock();
      await lockHolder;

      const results = await Promise.all(competingCalls);
      expect(results.flat()).toHaveLength(1);
      expect(await observerPrisma.adAction.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          actionType: 'pause_keyword',
          targetType: 'keyword',
          externalId: candidate.externalId,
          targetLabel: candidate.targetLabel,
          approvalStatus: { in: ['pending_review', 'approved'] },
        },
      })).toBe(1);
    } finally {
      releaseLock();
      await Promise.allSettled([lockHolder, ...competingCalls]);
      await Promise.all([
        lockPrisma.$disconnect(),
        firstPrisma.$disconnect(),
        secondPrisma.$disconnect(),
      ]);
    }
  });

  it('keeps one open pause_keyword proposal across duplicates in a run and a serial rerun', async () => {
    const candidate = pauseCandidate((await seedKeywordTarget()).id);
    const repository = new AdActionRepositoryAdapter(observerPrisma as never, {} as never);

    const first = await repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [
      candidate,
      { ...candidate, reason: '같은 키워드가 다시 들어옴' },
    ]);
    const rerun = await repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]);

    expect(first.map((action) => [action.approvalStatus, action.executeStatus])).toEqual([
      ['pending_review', 'queued'],
    ]);
    expect(rerun).toEqual([]);
    expect(await observerPrisma.adAction.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(1);
  });

  it('proposes a keyword again once the earlier proposal was executed or rejected', async () => {
    const candidate = pauseCandidate((await seedKeywordTarget()).id);
    const repository = new AdActionRepositoryAdapter(observerPrisma as never, {} as never);

    const [executed] = await repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]);
    await repository.approveAdActions([executed.id], TEST_ORGANIZATION_ID);
    await repository.reportActionExecution(executed.id, TEST_ORGANIZATION_ID, { status: 'running' });
    await expect(
      repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]),
    ).resolves.toEqual([]);
    await repository.reportActionExecution(executed.id, TEST_ORGANIZATION_ID, { status: 'done' });

    const [rejected] = await repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]);
    expect(rejected).toBeDefined();
    await repository.rejectAdActions([rejected.id], TEST_ORGANIZATION_ID);

    await expect(
      repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]),
    ).resolves.toHaveLength(1);
  });
});

async function waitForAdvisoryWaiters(
  prisma: PrismaClient,
  expectedCount: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted = false
        AND classid::bigint = (
          hashtext(${PAUSE_KEYWORD_LOCK_NAMESPACE}::text)::bigint & 4294967295
        )
        AND objid::bigint = (
          hashtext(${TEST_ORGANIZATION_ID}::text)::bigint & 4294967295
        )
    `;
    if ((row?.count ?? 0) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(
    `Timed out waiting for ${expectedCount} blocked pause_keyword advisory-lock transactions.`,
  );
}
