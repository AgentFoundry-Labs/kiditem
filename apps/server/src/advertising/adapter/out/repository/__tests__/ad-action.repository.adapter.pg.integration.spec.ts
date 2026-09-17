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

  it('keeps an approved keyword pause open until the operator closes it, and proposes the keyword again once it is closed (KID-138 decision A)', async () => {
    const candidate = pauseCandidate((await seedKeywordTarget()).id);
    const repository = new AdActionRepositoryAdapter(observerPrisma as never, {} as never);
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
    const candidate = pauseCandidate((await seedKeywordTarget()).id);
    const repository = new AdActionRepositoryAdapter(observerPrisma as never, {} as never);
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
    // Approved before decision A; the row executor could not find the keyword.
    // Written directly, since executors can no longer report for a pause.
    const older = await observerPrisma.adAction.create({
      data: {
        ...proposal,
        approvalStatus: 'approved',
        approvedAt: minutesAgo(60),
        createdAt: minutesAgo(60),
        executionTasks: {
          create: {
            status: 'failed',
            createdAt: minutesAgo(59),
            finishedAt: minutesAgo(59),
            errorMessage: '대상 행을 찾지 못했습니다: 콩순이 비눗방울',
          },
        },
      },
    });
    expect(await shown()).toEqual([
      { actionId: older.id, approvalStatus: 'approved', executeStatus: 'failed' },
    ]);
    await expect(propose()).resolves.toEqual([]);

    // Before decision A a failed pause released the keyword, so a newer proposal followed it.
    const newer = await observerPrisma.adAction.create({
      data: { ...proposal, approvalStatus: 'pending_review', createdAt: minutesAgo(1) },
    });
    expect(await shown()).toEqual([
      { actionId: newer.id, approvalStatus: 'pending_review', executeStatus: 'queued' },
    ]);
    await expect(propose()).resolves.toEqual([]);

    // The operator rejects the proposal the keyword tab shows. Nothing is shown
    // any more, so nothing blocks the keyword.
    await repository.rejectAdActions([newer.id], TEST_ORGANIZATION_ID);
    expect(await shown()).toEqual([]);
    const [again] = await propose();
    expect(again).toMatchObject({ approvalStatus: 'pending_review', targetLabel: candidate.targetLabel });
    expect(await shown()).toEqual([
      { actionId: again.id, approvalStatus: 'pending_review', executeStatus: 'queued' },
    ]);
  });

  it('never blocks a keyword the keyword read does not show, whatever its latest proposal holds (KID-138 review)', async () => {
    const adTargetDailyId = (await seedKeywordTarget()).id;
    const repository = new AdActionRepositoryAdapter(observerPrisma as never, {} as never);
    const keywordProposal = async (
      targetLabel: string,
      approvalStatus: string,
      attempt: { status: string; startedAt?: Date; finishedAt?: Date; errorMessage?: string } | null,
      createdAt = minutesAgo(10),
    ) => {
      const base = pauseCandidate(adTargetDailyId);
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
          ...(attempt ? { executionTasks: { create: { ...attempt, createdAt } } } : {}),
        },
      });
    };
    await keywordProposal('승인 대기', 'pending_review', null);
    await keywordProposal('승인함', 'approved', {
      status: 'failed',
      errorMessage: '자동 실행하지 않는 액션입니다. 광고센터에서 직접 처리해 주세요.',
    });
    // Approvals from before decision A.
    await keywordProposal('옛 실행 대기', 'approved', { status: 'queued' });
    await keywordProposal('옛 실행 중', 'approved', { status: 'running', startedAt: minutesAgo(1) });
    await keywordProposal('옛 기한 초과', 'approved', { status: 'running', startedAt: minutesAgo(31) });
    await keywordProposal('옛 완료', 'approved', { status: 'done', finishedAt: minutesAgo(1) });
    // A task status outside the lifecycle, which the keyword read does not offer.
    await keywordProposal('모르는 상태', 'approved', { status: 'paused' });
    // An older approved pause behind a newer rejected proposal.
    await keywordProposal('닫은 키워드', 'approved', { status: 'failed' }, minutesAgo(60));
    await keywordProposal('닫은 키워드', 'rejected', { status: 'cancelled' }, minutesAgo(1));
    const labels = [
      '승인 대기', '승인함', '옛 실행 대기', '옛 실행 중', '옛 기한 초과', '옛 완료', '모르는 상태', '닫은 키워드',
    ];

    const shownLabels = (await repository.findKeywordPauseProposals(TEST_ORGANIZATION_ID))
      .map((row) => row.targetLabel);
    const created = await repository.createAdActionsFromCandidates(
      TEST_ORGANIZATION_ID,
      labels.map((targetLabel) => ({ ...pauseCandidate(adTargetDailyId), targetLabel })),
    );
    const blocked = labels.filter((label) => !created.some((action) => action.targetLabel === label));

    expect([...shownLabels].sort()).toEqual(
      ['승인 대기', '승인함', '옛 실행 대기', '옛 실행 중', '옛 기한 초과', '옛 완료'].sort(),
    );
    // A pause that already ran before decision A is shown as done and releases the keyword.
    expect([...blocked].sort()).toEqual(
      ['승인 대기', '승인함', '옛 실행 대기', '옛 실행 중', '옛 기한 초과'].sort(),
    );
    expect(blocked.filter((label) => !shownLabels.includes(label))).toEqual([]);
  });

  it('releases a keyword whose approved pause ran before decision A, and keeps one whose earlier attempt failed', async () => {
    const adTargetDailyId = (await seedKeywordTarget()).id;
    const repository = new AdActionRepositoryAdapter(observerPrisma as never, {} as never);
    const paused = { ...pauseCandidate(adTargetDailyId), targetLabel: '이미 끈 키워드' };
    const unpaused = { ...pauseCandidate(adTargetDailyId), targetLabel: '못 끈 키워드' };
    // Before decision A the extension still executed keyword pauses. Executors
    // can no longer report, so these attempts are written directly.
    for (const [candidate, attempt] of [
      [paused, { status: 'done', finishedAt: new Date() }],
      [unpaused, { status: 'failed', finishedAt: new Date(), errorMessage: '대상 행을 찾지 못했습니다' }],
    ] as const) {
      await observerPrisma.adAction.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          actionType: candidate.actionType,
          targetType: candidate.targetType,
          externalId: candidate.externalId,
          targetLabel: candidate.targetLabel,
          reason: candidate.reason,
          approvalStatus: 'approved',
          approvedAt: new Date(),
          executionTasks: { create: attempt },
        },
      });
    }

    const created = await repository.createAdActionsFromCandidates(TEST_ORGANIZATION_ID, [
      paused,
      unpaused,
    ]);

    expect(created.map((action) => action.targetLabel)).toEqual(['이미 끈 키워드']);
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
