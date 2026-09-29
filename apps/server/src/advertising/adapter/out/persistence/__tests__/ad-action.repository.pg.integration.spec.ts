import { AdLedgerReadPersistenceAdapter } from '../ad-ledger-read.repository';
import { profitCatalogTestReaders } from '../../../../../test-helpers/channel-fact-ports';
import { channelFactTestPorts } from '../../../../../test-helpers/channel-fact-ports';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';
import { AdActionRepositoryAdapter } from '../ad-action.repository';
import type { PrismaClient } from '@prisma/client';
import type { ActionCandidate } from '../../../../domain/ad-action-rules';

const PAUSE_KEYWORD_LOCK_NAMESPACE = 'kiditem_ad_action_pause_keyword';

/**
 * Keyword pauses are applied by hand, so none of these actions ever has an `advertising.ad_action` run; a review
 * still asks the operation contract for a live run first (KID-386) and finds none.
 */
const NO_AD_ACTION_RUNS = { findLive: async () => null } as never;

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

  function pauseCandidate(): ActionCandidate {
    return {
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
    const candidate: ActionCandidate = {
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

    const firstRepository = new AdActionRepositoryAdapter(channelFactTestPorts(firstPrisma as never).listings, channelFactTestPorts(firstPrisma as never).recipes,
      firstPrisma as never,
      {} as never, profitCatalogTestReaders(firstPrisma as never).accounts, new AdLedgerReadPersistenceAdapter(), {} as never
    );
    const secondRepository = new AdActionRepositoryAdapter(channelFactTestPorts(secondPrisma as never).listings, channelFactTestPorts(secondPrisma as never).recipes,
      secondPrisma as never,
      {} as never, profitCatalogTestReaders(secondPrisma as never).accounts, new AdLedgerReadPersistenceAdapter(), {} as never
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
    const candidate = pauseCandidate();
    const repository = new AdActionRepositoryAdapter(channelFactTestPorts(observerPrisma as never).listings, channelFactTestPorts(observerPrisma as never).recipes, observerPrisma as never, {} as never, profitCatalogTestReaders(observerPrisma as never).accounts, new AdLedgerReadPersistenceAdapter(), NO_AD_ACTION_RUNS);

    const first = await repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [
      candidate,
      { ...candidate, reason: '같은 키워드가 다시 들어옴' },
    ]);
    const rerun = await repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]);

    expect(first.map((action) => [action.approvalStatus, action.executeStatus])).toEqual([
      ['pending_review', 'not_prepared'],
    ]);
    expect(rerun).toEqual([]);
    expect(await observerPrisma.adAction.count({
      where: { organizationId: TEST_ORGANIZATION_ID },
    })).toBe(1);
  });

  it('keeps an approved keyword pause open until the operator closes it, and proposes the keyword again once it is closed (KID-138 decision A)', async () => {
    const candidate = pauseCandidate();
    const repository = new AdActionRepositoryAdapter(channelFactTestPorts(observerPrisma as never).listings, channelFactTestPorts(observerPrisma as never).recipes, observerPrisma as never, {} as never, profitCatalogTestReaders(observerPrisma as never).accounts, new AdLedgerReadPersistenceAdapter(), NO_AD_ACTION_RUNS);
    const propose = () => repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]);

    const [confirmed] = await propose();
    await repository.approveAdActions([confirmed.id], TEST_ORGANIZATION_ID);
    // The operator confirmed the pause and applies it in the ad center, so
    // another judgement run proposes nothing for the keyword.
    await expect(propose()).resolves.toEqual([]);

    // Closing it on the keyword tab is a rejection, which releases the keyword.
    await repository.rejectAdActions([confirmed.id], TEST_ORGANIZATION_ID);
    const [reproposed] = await propose();
    expect(reproposed).toMatchObject({
      approvalStatus: 'pending_review',
      externalId: candidate.externalId,
      targetLabel: candidate.targetLabel,
    });
    expect(reproposed.id).not.toBe(confirmed.id);

    // Rejecting a proposal before approval releases the keyword too.
    await repository.rejectAdActions([reproposed.id], TEST_ORGANIZATION_ID);
    await expect(propose()).resolves.toHaveLength(1);
  });

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

  it('blocks a keyword only with the proposal the keyword read shows: an older approved pause behind a newer rejected proposal neither shows nor blocks (KID-138 review)', async () => {
    const candidate = pauseCandidate();
    const repository = new AdActionRepositoryAdapter(channelFactTestPorts(observerPrisma as never).listings, channelFactTestPorts(observerPrisma as never).recipes, observerPrisma as never, {} as never, profitCatalogTestReaders(observerPrisma as never).accounts, new AdLedgerReadPersistenceAdapter(), NO_AD_ACTION_RUNS);
    const propose = () => repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [candidate]);
    const shown = async () =>
      (await repository.findKeywordPauseProposals(TEST_ORGANIZATION_ID)).map(
        ({ actionId, approvalStatus, executeStatus }) => ({ actionId, approvalStatus, executeStatus }),
      );
    const proposal = {
      organizationId: TEST_ORGANIZATION_ID,
      actionType: candidate.actionType,
      targetType: candidate.targetType,
      externalId: candidate.externalId,
      targetLabel: candidate.targetLabel,
      reason: candidate.reason,
    };
    // An approved pause the operator has not closed yet.
    const older = await observerPrisma.adAction.create({
      data: {
        ...proposal,
        approvalStatus: 'approved',
        approvedAt: minutesAgo(60),
        createdAt: minutesAgo(60),
      },
    });
    expect(await shown()).toEqual([
      { actionId: older.id, approvalStatus: 'approved', executeStatus: 'not_prepared' },
    ]);
    await expect(propose()).resolves.toEqual([]);

    // A newer proposal for the same keyword (written directly) is the one the keyword read shows.
    const newer = await observerPrisma.adAction.create({
      data: { ...proposal, approvalStatus: 'pending_review', createdAt: minutesAgo(1) },
    });
    expect(await shown()).toEqual([
      { actionId: newer.id, approvalStatus: 'pending_review', executeStatus: 'not_prepared' },
    ]);
    await expect(propose()).resolves.toEqual([]);

    // The operator rejects the proposal the keyword tab shows. Nothing is shown
    // any more, so nothing blocks the keyword.
    await repository.rejectAdActions([newer.id], TEST_ORGANIZATION_ID);
    expect(await shown()).toEqual([]);
    const [again] = await propose();
    expect(again).toMatchObject({ approvalStatus: 'pending_review', targetLabel: candidate.targetLabel });
    expect(await shown()).toEqual([
      { actionId: again.id, approvalStatus: 'pending_review', executeStatus: 'not_prepared' },
    ]);
  });

  it('never blocks a keyword the keyword read does not show, whatever its latest proposal holds (KID-138 review)', async () => {
    const repository = new AdActionRepositoryAdapter(channelFactTestPorts(observerPrisma as never).listings, channelFactTestPorts(observerPrisma as never).recipes, observerPrisma as never, {} as never, profitCatalogTestReaders(observerPrisma as never).accounts, new AdLedgerReadPersistenceAdapter(), NO_AD_ACTION_RUNS);
    const keywordProposal = async (targetLabel: string, approvalStatus: string, createdAt = minutesAgo(10)) => {
      const base = pauseCandidate();
      await observerPrisma.adAction.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          actionType: base.actionType,
          targetType: base.targetType,
          externalId: base.externalId,
          targetLabel,
          reason: base.reason,
          approvalStatus,
          createdAt,
        },
      });
    };
    await keywordProposal('승인 대기', 'pending_review');
    // An approved pause is applied by hand and stays open until the operator closes it.
    await keywordProposal('승인함', 'approved');
    // An older approved pause behind a newer rejected proposal.
    await keywordProposal('닫은 키워드', 'approved', minutesAgo(60));
    await keywordProposal('닫은 키워드', 'rejected', minutesAgo(1));
    const labels = ['승인 대기', '승인함', '닫은 키워드'];

    const shownLabels = (await repository.findKeywordPauseProposals(TEST_ORGANIZATION_ID))
      .map((row) => row.targetLabel);
    const created = await repository.createAdActionsFromCandidates(
      TEST_ORGANIZATION_ID,
      labels.map((targetLabel) => ({ ...pauseCandidate(), targetLabel })),
    );
    const blocked = labels.filter((label) => !created.some((action) => action.targetLabel === label));

    expect([...shownLabels].sort()).toEqual(['승인 대기', '승인함'].sort());
    expect([...blocked].sort()).toEqual(['승인 대기', '승인함'].sort());
  });
});

describe('AdActionRepositoryAdapter reviews under row locks (PG integration)', () => {
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

  it('checks the review it expects under the row lock, so a rejection that waited for another review skips what that review changed (KID-138 review)', async () => {
    const proposal = await observerPrisma.adAction.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        actionType: 'pause_keyword',
        targetType: 'keyword',
        externalId: 'vendor-item-lock-test',
        targetLabel: '콩순이 비눗방울',
        reason: '상품과 무관한 캐릭터 키워드',
      },
      select: { id: true },
    });
    const holderPrisma = makeTestPrisma();
    const rejectingPrisma = makeTestPrisma();
    await Promise.all([holderPrisma.$connect(), rejectingPrisma.$connect()]);
    let release = () => {};
    let signalLocked = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    // Another operator's approval holds the row while it commits.
    const holding = holderPrisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM ad_actions
        WHERE id = ${proposal.id}::uuid AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `;
      signalLocked();
      await released;
      await tx.adAction.update({
        where: { id: proposal.id },
        data: { approvalStatus: 'approved', approvedAt: new Date() },
      });
    });

    try {
      await locked;
      const rejecting = new AdActionRepositoryAdapter(channelFactTestPorts(rejectingPrisma as never).listings, channelFactTestPorts(rejectingPrisma as never).recipes, rejectingPrisma as never, {} as never, profitCatalogTestReaders(rejectingPrisma as never).accounts, new AdLedgerReadPersistenceAdapter(), NO_AD_ACTION_RUNS)
        .rejectAdActions([proposal.id], TEST_ORGANIZATION_ID, {
          expectedApprovalStatus: 'pending_review',
        });
      await waitForRowLockWaiters(observerPrisma, 1);
      release();
      await holding;

      await expect(rejecting).resolves.toBe(0);
      expect(
        await observerPrisma.adAction.findUniqueOrThrow({
          where: { id: proposal.id },
          select: { approvalStatus: true },
        }),
      ).toEqual({ approvalStatus: 'approved' });
    } finally {
      release();
      await Promise.allSettled([holding]);
      await Promise.all([holderPrisma.$disconnect(), rejectingPrisma.$disconnect()]);
    }
  });
});

/** Waits until this many sessions wait for a row lock another transaction holds. */
async function waitForRowLockWaiters(
  prisma: PrismaClient,
  expectedCount: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM pg_locks
      WHERE granted = false
        AND locktype IN ('transactionid', 'tuple')
    `;
    if ((row?.count ?? 0) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for ${expectedCount} sessions blocked on a row lock.`);
}

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
