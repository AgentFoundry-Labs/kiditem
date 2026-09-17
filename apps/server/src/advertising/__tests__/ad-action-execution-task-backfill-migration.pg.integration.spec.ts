import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { AdActionRepositoryAdapter } from '../adapter/out/repository/ad-action.repository.adapter';
import { AdListingRepositoryAdapter } from '../adapter/out/repository/ad-listing.repository.adapter';
import {
  MANUAL_AD_ACTION_MESSAGE,
  MANUAL_AD_ACTION_TYPES,
} from '../domain/execution-task-lifecycle';
import {
  deriveAdActionExecution,
  readLatestExecutionTasks,
  type AdActionExecution,
} from '../read/ad-action-execution';
import {
  backfillAdActionExecutionTasksMigration,
  MANUAL_AD_ACTION_MESSAGE as MIGRATION_MANUAL_AD_ACTION_MESSAGE,
  MANUAL_AD_ACTION_TYPES as MIGRATION_MANUAL_AD_ACTION_TYPES,
} from '../../../../../scripts/data-migrations/v0.1.31/011_backfill_ad_action_execution_tasks';
import type { Prisma, PrismaClient } from '@prisma/client';

const STORED_EXECUTION_COLUMNS = 5;

/** The failure message of an approval closed at the cutover (KID-230 decision). */
const CUTOVER_CLOSED_MESSAGE =
  '배포 전환 때 실행하지 않고 닫은 옛 승인입니다. 필요하면 다시 승인해 주세요.';

interface LegacyAction {
  key: string;
  actionType?: string;
  targetType?: string;
  approvalStatus: 'pending_review' | 'approved' | 'rejected';
  executeStatus: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  errorMessage?: string;
  approvedAt?: Date;
  executedAt?: Date;
}

/**
 * The pre-schema migration runs while ad_actions still stores its execution
 * words. It makes each action's latest ExecutionTask carry what the extension
 * recorded, so the derived state reads the same words. It closes every
 * approved action that never ran, so the executor queue offers none of them
 * after the cutover (KID-230). It is a zero-row no-op on every later run,
 * including after `db push` drops the stored columns.
 */
describe('v0.1.31:011 backfill ad action execution tasks (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let recreatedStoredColumns = false;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const present = await storedColumnCount();
    if (present === 0) {
      // Once the schema drops the stored words, recreate them as the legacy shape.
      await prisma.$executeRaw`
        ALTER TABLE ad_actions
          ADD COLUMN execute_status text NOT NULL DEFAULT 'queued',
          ADD COLUMN before_json jsonb,
          ADD COLUMN after_json jsonb,
          ADD COLUMN error_message text,
          ADD COLUMN executed_at timestamptz
      `;
      recreatedStoredColumns = true;
    } else if (present !== STORED_EXECUTION_COLUMNS) {
      throw new Error(`ad_actions has ${present} of the stored execution columns`);
    }
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    // Later suites share this database, so restore the current schema shape.
    if (recreatedStoredColumns) {
      await prisma.$executeRaw`
        ALTER TABLE ad_actions
          DROP COLUMN IF EXISTS execute_status,
          DROP COLUMN IF EXISTS before_json,
          DROP COLUMN IF EXISTS after_json,
          DROP COLUMN IF EXISTS error_message,
          DROP COLUMN IF EXISTS executed_at
      `;
    }
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('carries the stored words into the latest task and is a no-op on every re-run', async () => {
    const approvedAt = new Date('2026-09-10T01:00:00.000Z');
    const executedAt = new Date('2026-09-10T03:00:00.000Z');
    const firstTaskAt = new Date('2026-09-10T01:00:00.000Z');
    const retryTaskAt = new Date('2026-09-10T02:00:00.000Z');

    const executed = await insertAction({
      key: 'executed-by-extension',
      approvalStatus: 'approved',
      executeStatus: 'done',
      beforeJson: { bid: 700 },
      afterJson: { bid: 600 },
      approvedAt,
      executedAt,
    });
    await insertTask(executed, 'queued', firstTaskAt);
    const failed = await insertAction({
      key: 'failed-by-extension',
      approvalStatus: 'approved',
      executeStatus: 'failed',
      afterJson: { url: 'x' },
      errorMessage: 'row not found',
      approvedAt,
    });
    await insertTask(failed, 'queued', firstTaskAt);
    const runningAfterLease = await insertAction({
      key: 'running-after-lease',
      approvalStatus: 'approved',
      executeStatus: 'running',
      beforeJson: { rowText: 'row' },
      approvedAt,
    });
    await insertTask(runningAfterLease, 'leased', firstTaskAt);
    const retried = await insertAction({
      key: 'retried-then-executed',
      approvalStatus: 'approved',
      executeStatus: 'done',
      approvedAt,
      executedAt,
    });
    await insertTask(retried, 'queued', firstTaskAt);
    await insertTask(retried, 'queued', retryTaskAt);
    const executedAfterReject = await insertAction({
      key: 'executed-after-reject',
      approvalStatus: 'rejected',
      executeStatus: 'done',
      approvedAt,
      executedAt,
    });
    await insertTask(executedAfterReject, 'cancelled', firstTaskAt);
    const reportedWithoutTask = await insertAction({
      key: 'reported-without-task',
      approvalStatus: 'pending_review',
      executeStatus: 'failed',
      errorMessage: 'manual report',
    });
    const approvedWithoutTask = await insertAction({
      key: 'approved-without-task',
      approvalStatus: 'approved',
      executeStatus: 'queued',
      approvedAt,
    });
    const waiting = await insertAction({
      key: 'waiting',
      approvalStatus: 'approved',
      executeStatus: 'queued',
      approvedAt,
    });
    await insertTask(waiting, 'queued', firstTaskAt);
    const pending = await insertAction({
      key: 'pending',
      approvalStatus: 'pending_review',
      executeStatus: 'queued',
    });
    const reportRouteDone = await insertAction({
      key: 'report-route-done',
      approvalStatus: 'approved',
      executeStatus: 'done',
      approvedAt,
      executedAt,
    });
    await insertTask(reportRouteDone, 'done', firstTaskAt, executedAt);
    const taskRanAfterStoredQueued = await insertAction({
      key: 'task-ran-after-stored-queued',
      approvalStatus: 'approved',
      executeStatus: 'queued',
      approvedAt,
    });
    await insertTask(taskRanAfterStoredQueued, 'running', firstTaskAt);

    await expect(runMigration()).resolves.toEqual({
      affectedRows: 10,
      details: {
        storedExecutionColumnsPresent: true,
        normalizedLeasedTasks: 1,
        carriedIntoQueuedTasks: [
          { status: 'done', rows: 2 },
          { status: 'failed', rows: 1 },
          { status: 'running', rows: 1 },
        ],
        insertedTasks: [
          { status: 'done', rows: 1 },
          { status: 'failed', rows: 1 },
          { status: 'queued', rows: 1 },
        ],
        // approvedWithoutTask and waiting never ran (KID-230).
        closedAtCutover: [{ kind: 'manual', rows: 2 }],
      },
    });

    const actions = {
      executed,
      failed,
      runningAfterLease,
      retried,
      executedAfterReject,
      reportedWithoutTask,
      approvedWithoutTask,
      waiting,
      pending,
      reportRouteDone,
      taskRanAfterStoredQueued,
    };
    const latestTasks = await readLatestExecutionTasks(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      actionIds: Object.values(actions),
    });
    const now = new Date();
    const derived = Object.fromEntries(
      Object.entries(actions).map(([name, id]) => [
        name,
        deriveAdActionExecution(latestTasks.get(id) ?? null, now),
      ]),
    );
    expect(Object.fromEntries(
      Object.entries(derived).map(([name, state]) => [name, state.executeStatus]),
    )).toEqual({
      executed: 'done',
      failed: 'failed',
      // A running task the migration left without a start time has no
      // executor that could still report for it, so it reads past its
      // execution deadline (KID-160). Its stored status is checked below.
      runningAfterLease: 'failed',
      retried: 'done',
      executedAfterReject: 'done',
      reportedWithoutTask: 'failed',
      // An approved action that never ran does not stay executable after the
      // cutover (KID-230); a bid change is applied by hand (KID-138).
      approvedWithoutTask: 'failed',
      waiting: 'failed',
      pending: 'queued',
      reportRouteDone: 'done',
      // A stored queued word never rewrites a task that ran.
      taskRanAfterStoredQueued: 'failed',
    });
    expect(await taskStatuses(runningAfterLease)).toEqual(['running']);
    expect(await taskStatuses(taskRanAfterStoredQueued)).toEqual(['running']);
    expect(derived.executed).toEqual({
      executionTaskId: latestTasks.get(executed)?.id,
      executeStatus: 'done',
      beforeJson: { bid: 700 },
      afterJson: { bid: 600 },
      errorMessage: null,
      executedAt,
    });
    expect(derived.failed).toMatchObject({ afterJson: { url: 'x' }, errorMessage: 'row not found' });
    expect(derived.runningAfterLease).toMatchObject({ beforeJson: { rowText: 'row' } });
    expect(derived.retried).toMatchObject({ executedAt });
    expect(derived.executedAfterReject).toMatchObject({ executedAt });
    expect(derived.reportedWithoutTask).toMatchObject({ errorMessage: 'manual report' });
    expect(derived.approvedWithoutTask).toMatchObject({ errorMessage: MANUAL_AD_ACTION_MESSAGE });
    expect(derived.waiting).toMatchObject({ errorMessage: MANUAL_AD_ACTION_MESSAGE });
    expect(await taskStatuses(retried)).toEqual(['queued', 'done']);
    expect(await taskStatuses(executedAfterReject)).toEqual(['cancelled', 'done']);
    expect(await taskStatuses(approvedWithoutTask)).toEqual(['failed']);
    expect(await taskStatuses(waiting)).toEqual(['failed']);
    expect(await taskStatuses(pending)).toEqual([]);

    await expect(runMigration()).resolves.toEqual(noOp(true));

    // `db push --accept-data-loss` drops the stored words after the pre-schema phase.
    const rollback = new Error('roll back the dropped-column probe');
    let afterDrop: unknown;
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE ad_actions DROP COLUMN execute_status`;
      afterDrop = await backfillAdActionExecutionTasksMigration.run(tx);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(afterDrop).toEqual(noOp(false));
  });

  it('closes every approved action that never ran as failed, so no stale approval stays executable after the cutover (KID-230)', async () => {
    const approvedAt = new Date('2026-09-10T01:00:00.000Z');
    const queuedAt = new Date('2026-09-10T01:00:00.000Z');
    const cancelledAt = new Date('2026-09-10T02:00:00.000Z');
    const executedAt = new Date('2026-09-10T03:00:00.000Z');
    const aheadOfDatabase = new Date('2099-01-01T00:00:00.000Z');

    // A keyword pause approved without an attempt gets one, closed.
    const pauseWithoutTask = await insertAction({
      key: 'pause-without-task',
      actionType: 'pause_keyword',
      approvalStatus: 'approved',
      executeStatus: 'queued',
      approvedAt,
    });
    // A campaign registration the extension never ran closes its own attempt.
    const campaignQueued = await insertAction({
      key: 'campaign-queued',
      actionType: 'create_campaign',
      targetType: 'campaign',
      approvalStatus: 'approved',
      executeStatus: 'queued',
      approvedAt,
    });
    const campaignAttempt = await insertTask(campaignQueued, 'queued', queuedAt);
    // Approved again after its attempt was cancelled, which reads queued: a
    // closed attempt follows the cancelled one, even one stamped ahead of the
    // database clock.
    const bidAfterCancel = await insertAction({
      key: 'bid-after-cancel',
      approvalStatus: 'approved',
      executeStatus: 'queued',
      approvedAt,
    });
    const cancelledBidAttempt = await insertTask(bidAfterCancel, 'cancelled', queuedAt, cancelledAt);
    const budgetAfterLateCancel = await insertAction({
      key: 'budget-after-late-cancel',
      actionType: 'change_daily_budget',
      approvalStatus: 'approved',
      executeStatus: 'queued',
      approvedAt,
    });
    const lateCancelledAttempt = await insertTask(
      budgetAfterLateCancel,
      'cancelled',
      aheadOfDatabase,
      aheadOfDatabase,
    );
    // A registration the extension reported done keeps its carried outcome.
    const campaignDone = await insertAction({
      key: 'campaign-done',
      actionType: 'create_campaign',
      targetType: 'campaign',
      approvalStatus: 'approved',
      executeStatus: 'done',
      afterJson: { campaignId: 'c-1' },
      approvedAt,
      executedAt,
    });
    const campaignDoneAttempt = await insertTask(campaignDone, 'queued', queuedAt);
    // Proposals in review and rejected ones stay as they are.
    const pendingCampaign = await insertAction({
      key: 'pending-campaign',
      actionType: 'create_campaign',
      targetType: 'campaign',
      approvalStatus: 'pending_review',
      executeStatus: 'queued',
    });
    const rejectedAfterCancel = await insertAction({
      key: 'rejected-after-cancel',
      approvalStatus: 'rejected',
      executeStatus: 'queued',
      approvedAt,
    });
    const rejectedCancelledAttempt = await insertTask(
      rejectedAfterCancel,
      'cancelled',
      queuedAt,
      cancelledAt,
    );
    const rejectedWithQueuedAttempt = await insertAction({
      key: 'rejected-with-queued-attempt',
      actionType: 'create_campaign',
      targetType: 'campaign',
      approvalStatus: 'rejected',
      executeStatus: 'queued',
      approvedAt,
    });
    const rejectedQueuedAttempt = await insertTask(rejectedWithQueuedAttempt, 'queued', queuedAt);

    // Before the cutover the executor's queue offers every approval that never
    // ran, and the registration whose done report only the action recorded.
    expect(await executorQueue(prisma)).toEqual({
      ids: [pauseWithoutTask, campaignQueued, bidAfterCancel, budgetAfterLateCancel, campaignDone].sort(),
      approvedQueued: 5,
    });

    await expect(runMigration()).resolves.toEqual({
      affectedRows: 6,
      details: {
        storedExecutionColumnsPresent: true,
        normalizedLeasedTasks: 0,
        carriedIntoQueuedTasks: [{ status: 'done', rows: 1 }],
        insertedTasks: [{ status: 'queued', rows: 1 }],
        closedAtCutover: [
          { kind: 'manual', rows: 3 },
          { kind: 'other', rows: 1 },
        ],
      },
    });

    const derived = await derivedExecutions({
      pauseWithoutTask,
      campaignQueued,
      bidAfterCancel,
      budgetAfterLateCancel,
      campaignDone,
      pendingCampaign,
      rejectedAfterCancel,
      rejectedWithQueuedAttempt,
    });
    const closedAttempt = (executionTaskId: string | null, errorMessage: string) => ({
      executionTaskId,
      executeStatus: 'failed',
      beforeJson: null,
      afterJson: null,
      errorMessage,
      executedAt: null,
    });
    const stillQueued = (executionTaskId: string | null) => ({
      executionTaskId,
      executeStatus: 'queued',
      beforeJson: null,
      afterJson: null,
      errorMessage: null,
      executedAt: null,
    });
    expect(derived).toEqual({
      pauseWithoutTask: closedAttempt(expect.any(String), MANUAL_AD_ACTION_MESSAGE),
      campaignQueued: closedAttempt(campaignAttempt, CUTOVER_CLOSED_MESSAGE),
      bidAfterCancel: closedAttempt(expect.any(String), MANUAL_AD_ACTION_MESSAGE),
      budgetAfterLateCancel: closedAttempt(expect.any(String), MANUAL_AD_ACTION_MESSAGE),
      campaignDone: {
        executionTaskId: campaignDoneAttempt,
        executeStatus: 'done',
        beforeJson: null,
        afterJson: { campaignId: 'c-1' },
        errorMessage: null,
        executedAt,
      },
      pendingCampaign: stillQueued(null),
      rejectedAfterCancel: stillQueued(rejectedCancelledAttempt),
      rejectedWithQueuedAttempt: stillQueued(rejectedQueuedAttempt),
    });
    expect(await tasksOf(pauseWithoutTask)).toEqual([
      { id: derived.pauseWithoutTask.executionTaskId, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(campaignQueued)).toEqual([
      { id: campaignAttempt, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(bidAfterCancel)).toEqual([
      { id: cancelledBidAttempt, status: 'cancelled', startedAt: null, closed: true },
      { id: derived.bidAfterCancel.executionTaskId, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(budgetAfterLateCancel)).toEqual([
      { id: lateCancelledAttempt, status: 'cancelled', startedAt: null, closed: true },
      { id: derived.budgetAfterLateCancel.executionTaskId, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(campaignDone)).toEqual([
      { id: campaignDoneAttempt, status: 'done', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(pendingCampaign)).toEqual([]);
    expect(await tasksOf(rejectedAfterCancel)).toEqual([
      { id: rejectedCancelledAttempt, status: 'cancelled', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(rejectedWithQueuedAttempt)).toEqual([
      { id: rejectedQueuedAttempt, status: 'queued', startedAt: null, closed: false },
    ]);

    await expect(runMigration()).resolves.toEqual(noOp(true));

    // After `db push --accept-data-loss` drops the stored words, the migration
    // is a no-op and the executor's queue offers no action.
    const rollback = new Error('roll back the schema step');
    let afterSchemaStep: unknown;
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        ALTER TABLE ad_actions
          DROP COLUMN execute_status,
          DROP COLUMN before_json,
          DROP COLUMN after_json,
          DROP COLUMN error_message,
          DROP COLUMN executed_at
      `;
      afterSchemaStep = {
        migration: await backfillAdActionExecutionTasksMigration.run(tx),
        queue: await executorQueue(tx),
      };
      throw rollback;
    })).rejects.toBe(rollback);
    expect(afterSchemaStep).toEqual({
      migration: noOp(false),
      queue: { ids: [], approvedQueued: 0 },
    });
  });

  it('restates the manual action types and message of the KID-138 domain policy', () => {
    // 011 keeps what it did when the policy changes later. Once v0.1.31 has
    // run on Office, a policy change pins these literals here and leaves 011.
    expect([...MIGRATION_MANUAL_AD_ACTION_TYPES].sort()).toEqual([...MANUAL_AD_ACTION_TYPES].sort());
    expect(MIGRATION_MANUAL_AD_ACTION_MESSAGE).toBe(MANUAL_AD_ACTION_MESSAGE);
  });

  it('registers as a pre-schema v0.1.31 migration', () => {
    expect(backfillAdActionExecutionTasksMigration).toMatchObject({
      id: 'v0.1.31:011_backfill_ad_action_execution_tasks',
      releaseVersion: '0.1.31',
      phase: 'pre-schema',
    });
  });

  function runMigration() {
    return prisma.$transaction((tx) => backfillAdActionExecutionTasksMigration.run(tx));
  }

  function noOp(storedExecutionColumnsPresent: boolean) {
    return {
      affectedRows: 0,
      details: {
        storedExecutionColumnsPresent,
        normalizedLeasedTasks: 0,
        carriedIntoQueuedTasks: [],
        insertedTasks: [],
        closedAtCutover: [],
      },
    };
  }

  async function storedColumnCount(): Promise<number> {
    const [row] = await prisma.$queryRaw<Array<{ present: number }>>`
      SELECT COUNT(*)::int AS present
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ad_actions'
        AND column_name IN ('execute_status', 'before_json', 'after_json', 'error_message', 'executed_at')
    `;
    return Number(row?.present ?? 0);
  }

  async function insertAction(action: LegacyAction): Promise<string> {
    const [row] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ad_actions (
        id,
        organization_id,
        action_type,
        target_type,
        target_label,
        reason,
        approval_status,
        execute_status,
        before_json,
        after_json,
        error_message,
        approved_at,
        executed_at
      )
      VALUES (
        gen_random_uuid(),
        ${TEST_ORGANIZATION_ID}::uuid,
        ${action.actionType ?? 'change_bid'},
        ${action.targetType ?? 'keyword'},
        ${action.key},
        'legacy',
        ${action.approvalStatus},
        ${action.executeStatus},
        ${jsonText(action.beforeJson)}::jsonb,
        ${jsonText(action.afterJson)}::jsonb,
        ${action.errorMessage ?? null},
        ${action.approvedAt ?? null}::timestamptz,
        ${action.executedAt ?? null}::timestamptz
      )
      RETURNING id
    `;
    return row.id;
  }

  async function insertTask(
    actionId: string,
    status: string,
    createdAt: Date,
    finishedAt: Date | null = null,
  ): Promise<string> {
    const [row] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO execution_tasks (id, action_id, status, created_at, finished_at)
      VALUES (
        gen_random_uuid(),
        ${actionId}::uuid,
        ${status},
        ${createdAt}::timestamptz,
        ${finishedAt}::timestamptz
      )
      RETURNING id
    `;
    return row.id;
  }

  async function taskStatuses(actionId: string): Promise<string[]> {
    const tasks = await prisma.executionTask.findMany({
      where: { actionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { status: true },
    });
    return tasks.map((task) => task.status);
  }

  /**
   * Every attempt of the action in order. `closed` says the attempt has a
   * finish time no earlier than its creation.
   */
  async function tasksOf(actionId: string) {
    const tasks = await prisma.executionTask.findMany({
      where: { actionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, status: true, startedAt: true, createdAt: true, finishedAt: true },
    });
    return tasks.map(({ id, status, startedAt, createdAt, finishedAt }) => ({
      id,
      status,
      startedAt,
      closed: finishedAt !== null && finishedAt.getTime() >= createdAt.getTime(),
    }));
  }

  /**
   * The browser extension's queue, read as
   * `GET /api/ads/actions?approvalStatus=approved&executeStatus=queued` reads it.
   */
  async function executorQueue(db: Prisma.TransactionClient) {
    const repository = new AdActionRepositoryAdapter(
      db as never,
      new AdListingRepositoryAdapter(db as never),
    );
    const queue = await repository.findAdActionsForReview(
      { approvalStatus: 'approved', executeStatus: 'queued', limit: 50 },
      TEST_ORGANIZATION_ID,
    );
    return {
      ids: queue.items.map((item) => item.id).sort(),
      approvedQueued: queue.summary.approvedQueued,
    };
  }

  /** The execution words each named action reads from its latest task. */
  async function derivedExecutions<Name extends string>(
    actions: Record<Name, string>,
  ): Promise<Record<Name, AdActionExecution>> {
    const ids: string[] = Object.values(actions);
    const latestTasks = await readLatestExecutionTasks(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      actionIds: ids,
    });
    const now = new Date();
    return Object.fromEntries(
      Object.entries<string>(actions).map(([name, id]) => [
        name,
        deriveAdActionExecution(latestTasks.get(id) ?? null, now),
      ]),
    ) as Record<Name, AdActionExecution>;
  }
});

function jsonText(value: Record<string, unknown> | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}
