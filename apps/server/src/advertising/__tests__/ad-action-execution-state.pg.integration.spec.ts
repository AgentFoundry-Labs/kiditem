import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { AdActionRepositoryAdapter } from '../adapter/out/repository/ad-action.repository.adapter';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import { AdListingRepositoryAdapter } from '../adapter/out/repository/ad-listing.repository.adapter';
import { AdCampaignsService } from '../application/service/ad-campaigns.service';

/**
 * An AdAction's execution words come from its latest ExecutionTask. These
 * cases write tasks directly and read the actions back through every
 * Advertising read that filters or counts on those words, so the SQL
 * predicates must agree with the words each action displays.
 */
describe('AdAction execution state from the latest ExecutionTask (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: AdActionRepositoryAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new AdActionRepositoryAdapter(
      prisma as never,
      new AdListingRepositoryAdapter(prisma as never),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 0, minute));

  async function seedAction(
    targetLabel: string,
    overrides: {
      organizationId?: string;
      approvalStatus?: string;
      actionType?: string;
      targetType?: string;
      externalId?: string;
      reason?: string;
      createdAt?: Date;
    } = {},
  ): Promise<string> {
    const action = await prisma.adAction.create({
      data: {
        organizationId: overrides.organizationId ?? TEST_ORGANIZATION_ID,
        actionType: overrides.actionType ?? 'change_bid',
        targetType: overrides.targetType ?? 'keyword',
        externalId: overrides.externalId ?? null,
        targetLabel,
        reason: overrides.reason ?? 'rule',
        approvalStatus: overrides.approvalStatus ?? 'approved',
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      },
      select: { id: true },
    });
    return action.id;
  }

  async function seedTask(
    actionId: string,
    task: {
      status: string;
      createdAt: Date;
      id?: string;
      beforeJson?: Prisma.InputJsonValue;
      afterJson?: Prisma.InputJsonValue;
      errorMessage?: string;
      startedAt?: Date;
      finishedAt?: Date;
    },
  ): Promise<string> {
    const created = await prisma.executionTask.create({
      data: {
        ...(task.id ? { id: task.id } : {}),
        actionId,
        status: task.status,
        createdAt: task.createdAt,
        beforeJson: task.beforeJson,
        afterJson: task.afterJson,
        errorMessage: task.errorMessage,
        startedAt: task.startedAt,
        finishedAt: task.finishedAt,
      },
      select: { id: true },
    });
    return created.id;
  }

  it('reads each action from its latest task, names that task, and filters and counts on the same words', async () => {
    const finishedAt = at(30);
    const pending = await seedAction('pending', { approvalStatus: 'pending_review' });
    const retried = await seedAction('retried');
    await seedTask(retried, { status: 'failed', createdAt: at(1), errorMessage: 'first attempt' });
    const retriedAttempt = await seedTask(retried, { status: 'queued', createdAt: at(2) });
    const running = await seedAction('running');
    const runningAttempt = await seedTask(running, {
      status: 'running',
      createdAt: at(1),
      startedAt: new Date(Date.now() - 60 * 1000),
      beforeJson: { bid: 700 },
    });
    const done = await seedAction('done');
    const doneAttempt = await seedTask(done, {
      status: 'done',
      createdAt: at(1),
      beforeJson: { bid: 700 },
      afterJson: { bid: 600 },
      finishedAt,
    });
    const failed = await seedAction('failed');
    const failedAttempt = await seedTask(failed, {
      status: 'failed',
      createdAt: at(1),
      errorMessage: 'row not found',
      finishedAt,
    });
    const rejected = await seedAction('rejected', { approvalStatus: 'rejected' });
    const rejectedAttempt = await seedTask(rejected, {
      status: 'cancelled',
      createdAt: at(1),
      errorMessage: '사용자 보류 처리',
      finishedAt,
    });
    // Two tasks created in the same instant: the greater id is the latest.
    const tied = await seedAction('tied');
    await seedTask(tied, {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'failed',
      createdAt: at(5),
      errorMessage: 'lower id',
    });
    const tiedAttempt = await seedTask(tied, {
      id: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
      status: 'done',
      createdAt: at(5),
      finishedAt,
    });
    const unexpected = await seedAction('unexpected');
    const unexpectedAttempt = await seedTask(unexpected, { status: 'paused', createdAt: at(1) });
    const foreign = await seedAction('foreign', { organizationId: OTHER_ORGANIZATION_ID });
    await seedTask(foreign, { status: 'queued', createdAt: at(1) });

    const review = await repository.findAdActionsForReview({ limit: 200 }, TEST_ORGANIZATION_ID);

    const none = { beforeJson: null, afterJson: null, errorMessage: null, executedAt: null };
    expect(Object.fromEntries(review.items.map((item) => [item.id, {
      executionTaskId: item.executionTaskId,
      executeStatus: item.executeStatus,
      beforeJson: item.beforeJson,
      afterJson: item.afterJson,
      errorMessage: item.errorMessage,
      executedAt: item.executedAt,
    }]))).toEqual({
      [pending]: { ...none, executionTaskId: null, executeStatus: 'queued' },
      [retried]: { ...none, executionTaskId: retriedAttempt, executeStatus: 'queued' },
      [running]: {
        ...none,
        executionTaskId: runningAttempt,
        executeStatus: 'running',
        beforeJson: { bid: 700 },
      },
      [done]: {
        executionTaskId: doneAttempt,
        executeStatus: 'done',
        beforeJson: { bid: 700 },
        afterJson: { bid: 600 },
        errorMessage: null,
        executedAt: finishedAt,
      },
      [failed]: {
        ...none,
        executionTaskId: failedAttempt,
        executeStatus: 'failed',
        errorMessage: 'row not found',
      },
      [rejected]: { ...none, executionTaskId: rejectedAttempt, executeStatus: 'queued' },
      [tied]: { ...none, executionTaskId: tiedAttempt, executeStatus: 'done', executedAt: finishedAt },
      [unexpected]: { ...none, executionTaskId: unexpectedAttempt, executeStatus: 'paused' },
    });
    expect(review.summary).toMatchObject({
      pendingReview: 1,
      approvedQueued: 1,
      running: 1,
      done: 2,
      failed: 1,
    });

    const idsByWord: Record<string, string[]> = {
      queued: [pending, retried, rejected],
      running: [running],
      done: [done, tied],
      failed: [failed],
      paused: [unexpected],
    };
    for (const [word, ids] of Object.entries(idsByWord)) {
      const filtered = await repository.findAdActionsForReview(
        { executeStatus: word, limit: 200 },
        TEST_ORGANIZATION_ID,
      );
      expect(filtered.items.map((item) => item.id).sort()).toEqual([...ids].sort());
      expect(filtered.items.every((item) => item.executeStatus === word)).toBe(true);
    }

    // The browser extension's queue: approvalStatus=approved&executeStatus=queued.
    const extensionQueue = await repository.findAdActionsForReview(
      { approvalStatus: 'approved', executeStatus: 'queued', limit: 50 },
      TEST_ORGANIZATION_ID,
    );
    expect(extensionQueue.items.map((item) => item.id)).toEqual([retried]);
  });

  it('reads a running attempt past its 30-minute deadline as failed in the listing, its filters and its counts', async () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);
    const inDeadline = await seedAction('in-deadline');
    const inDeadlineAttempt = await seedTask(inDeadline, {
      status: 'running',
      createdAt: at(1),
      startedAt: minutesAgo(29),
      beforeJson: { bid: 700 },
    });
    const expired = await seedAction('expired');
    const expiredAttempt = await seedTask(expired, {
      status: 'running',
      createdAt: at(1),
      startedAt: minutesAgo(31),
      beforeJson: { bid: 700 },
    });
    // A running attempt with no start time has no executor that could still report.
    const unstarted = await seedAction('running-without-start');
    const unstartedAttempt = await seedTask(unstarted, { status: 'running', createdAt: at(1) });

    const review = await repository.findAdActionsForReview({ limit: 200 }, TEST_ORGANIZATION_ID);

    expect(Object.fromEntries(review.items.map((item) => [item.id, {
      executionTaskId: item.executionTaskId,
      executeStatus: item.executeStatus,
      errorMessage: item.errorMessage,
      beforeJson: item.beforeJson,
      executedAt: item.executedAt,
    }]))).toEqual({
      [inDeadline]: {
        executionTaskId: inDeadlineAttempt,
        executeStatus: 'running',
        errorMessage: null,
        beforeJson: { bid: 700 },
        executedAt: null,
      },
      [expired]: {
        executionTaskId: expiredAttempt,
        executeStatus: 'failed',
        errorMessage: '실행 기한 초과',
        beforeJson: { bid: 700 },
        executedAt: null,
      },
      [unstarted]: {
        executionTaskId: unstartedAttempt,
        executeStatus: 'failed',
        errorMessage: '실행 기한 초과',
        beforeJson: null,
        executedAt: null,
      },
    });
    expect(review.summary).toMatchObject({ running: 1, failed: 2 });
    for (const [word, ids] of Object.entries({
      running: [inDeadline],
      failed: [expired, unstarted],
    })) {
      const filtered = await repository.findAdActionsForReview(
        { executeStatus: word, limit: 200 },
        TEST_ORGANIZATION_ID,
      );
      expect(filtered.items.map((item) => item.id).sort()).toEqual([...ids].sort());
    }
    // Reading writes nothing: the expired attempt is still stored running.
    expect(
      await prisma.executionTask.findUniqueOrThrow({ where: { id: expiredAttempt } }),
    ).toMatchObject({ status: 'running', finishedAt: null, errorMessage: null });
  });

  it('keeps a proposal open for dedupe only while its latest task is queued or running within its deadline', async () => {
    await seedAction('pending', { approvalStatus: 'pending_review' });
    await seedTask(await seedAction('queued'), { status: 'queued', createdAt: at(1) });
    await seedTask(await seedAction('running'), {
      status: 'running',
      createdAt: at(1),
      startedAt: new Date(Date.now() - 60 * 1000),
    });
    await seedTask(await seedAction('running-expired'), {
      status: 'running',
      createdAt: at(1),
      startedAt: new Date(Date.now() - 31 * 60 * 1000),
    });
    await seedTask(await seedAction('done'), { status: 'done', createdAt: at(1) });
    await seedTask(await seedAction('failed'), { status: 'failed', createdAt: at(1) });
    const retried = await seedAction('retried');
    await seedTask(retried, { status: 'failed', createdAt: at(1) });
    await seedTask(retried, { status: 'queued', createdAt: at(2) });
    await seedTask(await seedAction('rejected', { approvalStatus: 'rejected' }), {
      status: 'cancelled',
      createdAt: at(1),
    });
    await seedAction('stale', {
      approvalStatus: 'pending_review',
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    await seedAction('foreign', {
      approvalStatus: 'pending_review',
      organizationId: OTHER_ORGANIZATION_ID,
    });

    const inflight = await repository.findExistingInflightActions(
      TEST_ORGANIZATION_ID,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    expect(inflight.map((row) => row.targetLabel).sort()).toEqual([
      'pending',
      'queued',
      'retried',
      'running',
    ]);
  });

  /** One complete keyword collection of a Coupang account holding these keywords. */
  async function seedKeywordCollection(
    keywords: Array<[externalOptionId: string, keyword: string]>,
  ): Promise<void> {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Ads',
        status: 'active',
        isPrimary: true,
      },
      select: { id: true },
    });
    const businessDate = '2026-09-14';
    const capturedAt = new Date().toISOString();
    const collection = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        sourceType: 'coupang_ad_keyword',
        parserVersion: 'ad-keyword-v1',
        status: 'completed',
        importedAt: new Date(),
        plan: { captureMode: 'keyword' },
        qualityReport: {
          rosterCapturedAt: capturedAt,
          keywordCoverage: [
            { campaignIdentity: 'campaign:1', adGroupId: 'group-1', capturedAt, businessDate },
          ],
        },
      },
      select: { id: true },
    });
    await prisma.channelAdTargetDailySnapshot.createMany({
      data: keywords.map(([externalOptionId, keyword]) => ({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        sourceImportRunId: collection.id,
        channel: 'coupang',
        businessDate: new Date(`${businessDate}T00:00:00.000Z`),
        targetType: 'keyword',
        targetKey: `account:${account.id}:keyword:campaign:1:${externalOptionId}::${keyword}`,
        campaignIdentity: 'campaign:1',
        campaignId: '1',
        campaignName: 'Campaign',
        adGroupId: 'group-1',
        adGroup: 'Group',
        keyword,
        externalOptionId,
        impressions: 100,
        metaJson: {
          source: 'advertising.keyword.target',
          data: { origin: 'smart_targeting', windowDays: 7 },
        },
      })),
    });
  }

  it("carries each keyword's latest pause proposal with its execution state on the keyword read, and none once that proposal is rejected (KID-138)", async () => {
    await seedKeywordCollection([
      ['VID-1', '콩순이'],
      ['VID-1', '타요'],
      ['VID-1', '뽀로로'],
      ['VID-1', '핑크퐁'],
      ['VID-1', '아기상어'],
      ['VID-1', '브레드'],
      ['VID-1', '쥬쥬'],
      ['VID-1', '캐치'],
      ['VID-1', '시크릿'],
      ['VID-1', '입찰가'],
      ['VID-1', '미미'],
      ['VID-2', '콩순이'],
    ]);
    const pause = (label: string, overrides: Parameters<typeof seedAction>[1] = {}) =>
      seedAction(label, {
        actionType: 'pause_keyword',
        targetType: 'keyword',
        externalId: 'VID-1',
        reason: `${label} 연관 없음`,
        ...overrides,
      });
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

    const pending = await pause('콩순이', { approvalStatus: 'pending_review' });
    const queued = await pause('타요');
    await seedTask(queued, { status: 'queued', createdAt: at(1) });
    const running = await pause('뽀로로');
    await seedTask(running, { status: 'running', createdAt: at(1), startedAt: minutesAgo(1) });
    const failed = await pause('핑크퐁');
    await seedTask(failed, { status: 'failed', createdAt: at(1), errorMessage: 'row not found' });
    const expired = await pause('아기상어');
    await seedTask(expired, { status: 'running', createdAt: at(1), startedAt: minutesAgo(31) });
    const done = await pause('브레드');
    await seedTask(done, { status: 'done', createdAt: at(1), finishedAt: at(2) });
    // The agent proposed again after the earlier pause finished: the newer proposal is read.
    await seedTask(await pause('쥬쥬', { createdAt: at(1) }), { status: 'done', createdAt: at(1) });
    const reproposed = await pause('쥬쥬', { approvalStatus: 'pending_review', createdAt: at(2) });
    // A rejected proposal is left out.
    await seedTask(await pause('캐치', { approvalStatus: 'rejected' }), {
      status: 'cancelled',
      createdAt: at(1),
    });
    // Rejecting the newest proposal leaves the keyword unmarked; an older failed one does not come back.
    await seedTask(await pause('시크릿', { createdAt: at(1) }), {
      status: 'failed',
      createdAt: at(1),
      errorMessage: 'timeout',
    });
    await seedTask(await pause('시크릿', { approvalStatus: 'rejected', createdAt: at(2) }), {
      status: 'cancelled',
      createdAt: at(2),
    });
    // Neither another kind of action nor another organization's proposal marks a keyword.
    await seedAction('입찰가', { externalId: 'VID-1', approvalStatus: 'pending_review' });
    await pause('미미', { approvalStatus: 'pending_review', organizationId: OTHER_ORGANIZATION_ID });

    const service = new AdCampaignsService(
      new AdCampaignRepositoryAdapter(prisma as never),
      new AdListingRepositoryAdapter(prisma as never),
      repository,
      {} as never,
    );
    const { keywords } = await service.getKeywords('7d', TEST_ORGANIZATION_ID);

    const flagged = (
      label: string,
      actionId: string,
      approvalStatus: string,
      executeStatus: string,
      errorMessage: string | null = null,
    ) => ({
      relevance: 'irrelevant',
      relevanceReason: `${label} 연관 없음`,
      pauseProposal: { actionId, approvalStatus, executeStatus, errorMessage },
    });
    const unmarked = { relevance: null, relevanceReason: null, pauseProposal: null };
    expect(Object.fromEntries(keywords.map((row) => [
      `${row.externalOptionId}:${row.keyword}`,
      {
        relevance: row.relevance,
        relevanceReason: row.relevanceReason,
        pauseProposal: row.pauseProposal,
      },
    ]))).toEqual({
      'VID-1:콩순이': flagged('콩순이', pending, 'pending_review', 'queued'),
      'VID-1:타요': flagged('타요', queued, 'approved', 'queued'),
      'VID-1:뽀로로': flagged('뽀로로', running, 'approved', 'running'),
      'VID-1:핑크퐁': flagged('핑크퐁', failed, 'approved', 'failed', 'row not found'),
      'VID-1:아기상어': flagged('아기상어', expired, 'approved', 'failed', '실행 기한 초과'),
      'VID-1:브레드': flagged('브레드', done, 'approved', 'done'),
      'VID-1:쥬쥬': flagged('쥬쥬', reproposed, 'pending_review', 'queued'),
      'VID-1:캐치': unmarked,
      'VID-1:시크릿': unmarked,
      'VID-1:입찰가': unmarked,
      'VID-1:미미': unmarked,
      'VID-2:콩순이': unmarked,
    });
  });

  it('treats a create_campaign name as taken while its latest task is queued, running within its deadline, or done', async () => {
    const campaign = { actionType: 'create_campaign', targetType: 'campaign' };
    const ids: Record<string, string> = {};
    const recently = new Date(Date.now() - 60 * 1000);
    for (const status of ['queued', 'running', 'done', 'failed']) {
      ids[status] = await seedAction('Camp ' + status, campaign);
      await seedTask(ids[status], {
        status,
        createdAt: at(1),
        ...(status === 'queued' ? {} : { startedAt: recently }),
      });
    }
    await seedTask(await seedAction('Camp expired', campaign), {
      status: 'running',
      createdAt: at(1),
      startedAt: new Date(Date.now() - 31 * 60 * 1000),
    });

    for (const status of ['queued', 'running', 'done']) {
      await expect(
        repository.findOpenCreateCampaignAction(TEST_ORGANIZATION_ID, 'Camp ' + status),
      ).resolves.toEqual({ id: ids[status], executeStatus: status });
    }
    await expect(
      repository.findOpenCreateCampaignAction(TEST_ORGANIZATION_ID, 'Camp failed'),
    ).resolves.toBeNull();
    // Registering the name again is allowed; the extension skips creating a
    // campaign the ad center already has.
    await expect(
      repository.findOpenCreateCampaignAction(TEST_ORGANIZATION_ID, 'Camp expired'),
    ).resolves.toBeNull();
    await expect(
      repository.findOpenCreateCampaignAction(OTHER_ORGANIZATION_ID, 'Camp done'),
    ).resolves.toBeNull();
  });
});
