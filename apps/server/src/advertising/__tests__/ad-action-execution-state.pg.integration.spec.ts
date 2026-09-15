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
import { AdListingRepositoryAdapter } from '../adapter/out/repository/ad-listing.repository.adapter';

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

  it('keeps a proposal open for dedupe only while its latest task is queued or running', async () => {
    await seedAction('pending', { approvalStatus: 'pending_review' });
    await seedTask(await seedAction('queued'), { status: 'queued', createdAt: at(1) });
    await seedTask(await seedAction('running'), { status: 'running', createdAt: at(1) });
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

  it('badges only pause_keyword proposals whose latest task is still open', async () => {
    const pauseKeyword = { actionType: 'pause_keyword', targetType: 'keyword' };
    await seedAction('콩순이', {
      ...pauseKeyword,
      approvalStatus: 'pending_review',
      externalId: 'VID-1',
      reason: '캐릭터 키워드',
    });
    await seedTask(
      await seedAction('타요', { ...pauseKeyword, externalId: 'VID-2', reason: '중지 중' }),
      { status: 'running', createdAt: at(1) },
    );
    await seedTask(
      await seedAction('뽀로로', { ...pauseKeyword, externalId: 'VID-3', reason: '중지함' }),
      { status: 'done', createdAt: at(1) },
    );
    await seedTask(
      await seedAction('핑크퐁', {
        ...pauseKeyword,
        approvalStatus: 'rejected',
        externalId: 'VID-4',
      }),
      { status: 'cancelled', createdAt: at(1) },
    );
    await seedAction('입찰가', { approvalStatus: 'pending_review' });

    const open = await repository.findOpenKeywordRelevanceActions(TEST_ORGANIZATION_ID);

    expect(open.map((row) => [row.externalId, row.targetLabel, row.reason]).sort()).toEqual([
      ['VID-1', '콩순이', '캐릭터 키워드'],
      ['VID-2', '타요', '중지 중'],
    ]);
  });

  it('treats a create_campaign name as taken while its latest task is queued, running or done', async () => {
    const campaign = { actionType: 'create_campaign', targetType: 'campaign' };
    const ids: Record<string, string> = {};
    for (const status of ['queued', 'running', 'done', 'failed']) {
      ids[status] = await seedAction('Camp ' + status, campaign);
      await seedTask(ids[status], { status, createdAt: at(1) });
    }

    for (const status of ['queued', 'running', 'done']) {
      await expect(
        repository.findOpenCreateCampaignAction(TEST_ORGANIZATION_ID, 'Camp ' + status),
      ).resolves.toEqual({ id: ids[status], executeStatus: status });
    }
    await expect(
      repository.findOpenCreateCampaignAction(TEST_ORGANIZATION_ID, 'Camp failed'),
    ).resolves.toBeNull();
    await expect(
      repository.findOpenCreateCampaignAction(OTHER_ORGANIZATION_ID, 'Camp done'),
    ).resolves.toBeNull();
  });
});
