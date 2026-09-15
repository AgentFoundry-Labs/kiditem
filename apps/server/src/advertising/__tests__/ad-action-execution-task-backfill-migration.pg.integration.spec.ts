import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import {
  deriveAdActionExecution,
  readLatestExecutionTasks,
} from '../read/ad-action-execution';
import { backfillAdActionExecutionTasksMigration } from '../../../../../scripts/data-migrations/v0.1.31/011_backfill_ad_action_execution_tasks';

const STORED_EXECUTION_COLUMNS = 5;

interface LegacyAction {
  key: string;
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
 * recorded, so the derived state reads the same words, and it is a zero-row
 * no-op on every later run, including after `db push` drops the stored columns.
 */
describe('v0.1.31:011 backfill ad action execution tasks (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let recreatedStoredColumns = false;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
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
      affectedRows: 8,
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
      approvedWithoutTask: 'queued',
      waiting: 'queued',
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
    expect(await taskStatuses(retried)).toEqual(['queued', 'done']);
    expect(await taskStatuses(executedAfterReject)).toEqual(['cancelled', 'done']);
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
        'change_bid',
        'keyword',
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
  ): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO execution_tasks (id, action_id, status, created_at, finished_at)
      VALUES (
        gen_random_uuid(),
        ${actionId}::uuid,
        ${status},
        ${createdAt}::timestamptz,
        ${finishedAt}::timestamptz
      )
    `;
  }

  async function taskStatuses(actionId: string): Promise<string[]> {
    const tasks = await prisma.executionTask.findMany({
      where: { actionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { status: true },
    });
    return tasks.map((task) => task.status);
  }
});

function jsonText(value: Record<string, unknown> | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}
