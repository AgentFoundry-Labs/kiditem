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
import { backfillAdActionExecutionTasksMigration } from '../../../../../scripts/data-migrations/v0.1.31/011_backfill_ad_action_execution_tasks';
import {
  closeStaleAdApprovalsAtCutoverMigration,
  MANUAL_AD_ACTION_MESSAGE as MIGRATION_MANUAL_AD_ACTION_MESSAGE,
  MANUAL_AD_ACTION_TYPES as MIGRATION_MANUAL_AD_ACTION_TYPES,
} from '../../../../../scripts/data-migrations/v0.1.31/015_close_stale_ad_approvals_at_cutover';
import type { Prisma, PrismaClient } from '@prisma/client';

const STORED_EXECUTION_COLUMNS = 5;

/** The failure message of a closed approval that is not applied by hand (KID-230 decision). */
const CUTOVER_CLOSED_MESSAGE =
  '배포 전환 때 실행하지 않고 닫은 옛 승인입니다. 캠페인 등록이 필요하면 다시 요청해 주세요.';

interface LegacyAction {
  key: string;
  actionType?: string;
  approvalStatus: 'pending_review' | 'approved' | 'rejected';
  executeStatus: string;
  afterJson?: Record<string, unknown>;
  errorMessage?: string;
  executedAt?: Date;
}

/**
 * At the v0.1.31 cutover, 011 carries each action's stored execution words
 * into its latest ExecutionTask, and then 015 closes every approved action the
 * old Office never ran, so the executor queue offers none of them (KID-230).
 * Both run in the pre-schema phase, each in its own transaction, while
 * ad_actions still stores the words; once `db push` drops them, both record a
 * no-op and an approval made after the cutover stays executable.
 */
describe('v0.1.31:015 close stale ad approvals at cutover (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let actions: AdActionRepositoryAdapter;
  let storedColumnsAtStart = 0;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    actions = new AdActionRepositoryAdapter(
      prisma as never,
      new AdListingRepositoryAdapter(prisma as never),
    );
    storedColumnsAtStart = await storedColumnCount();
    if (storedColumnsAtStart !== 0 && storedColumnsAtStart !== STORED_EXECUTION_COLUMNS) {
      throw new Error(`ad_actions has ${storedColumnsAtStart} of the stored execution columns`);
    }
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    // The current schema has dropped the stored words; each case starts from
    // the shape the old Office database has before the schema step.
    await addStoredColumns();
  });

  afterAll(async () => {
    if (!prisma) return;
    // Later suites share this database, so leave the schema shape it had.
    if (storedColumnsAtStart === 0) await dropStoredColumns(prisma);
    else await addStoredColumns();
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('closes every approved action the old Office never ran as failed, and leaves every other action as it was', async () => {
    const queuedAt = new Date('2026-09-10T01:00:00.000Z');
    const cancelledAt = new Date('2026-09-10T02:00:00.000Z');
    const executedAt = new Date('2026-09-10T03:00:00.000Z');
    const aheadOfDatabase = new Date('2099-01-01T00:00:00.000Z');

    // A keyword pause approved without an attempt: 011 gives it a queued one.
    const pauseWithoutTask = await insertAction({
      key: 'pause-without-task',
      actionType: 'pause_keyword',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    // Campaign registrations the extension never ran, one left leased by the
    // retired worker route, which 011 queues again.
    const campaignQueued = await insertAction({
      key: 'campaign-queued',
      actionType: 'create_campaign',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    const campaignAttempt = await insertTask(campaignQueued, 'queued', queuedAt);
    const campaignLeased = await insertAction({
      key: 'campaign-leased',
      actionType: 'create_campaign',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    const leasedAttempt = await insertTask(campaignLeased, 'leased', queuedAt);
    // Approved while the latest attempt is cancelled, which reads queued. A
    // closed attempt follows it, even one stamped ahead of the database clock.
    const bidAfterCancel = await insertAction({
      key: 'bid-after-cancel',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    const cancelledBidAttempt = await insertTask(bidAfterCancel, 'cancelled', queuedAt, cancelledAt);
    const budgetAfterLateCancel = await insertAction({
      key: 'budget-after-late-cancel',
      actionType: 'change_daily_budget',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    const lateCancelledAttempt = await insertTask(
      budgetAfterLateCancel,
      'cancelled',
      aheadOfDatabase,
      aheadOfDatabase,
    );
    // Outcomes the extension reported keep what 011 carried.
    const campaignDone = await insertAction({
      key: 'campaign-done',
      actionType: 'create_campaign',
      approvalStatus: 'approved',
      executeStatus: 'done',
      afterJson: { campaignId: 'c-1' },
      executedAt,
    });
    const campaignDoneAttempt = await insertTask(campaignDone, 'queued', queuedAt);
    const budgetFailed = await insertAction({
      key: 'budget-failed',
      actionType: 'change_daily_budget',
      approvalStatus: 'approved',
      executeStatus: 'failed',
      errorMessage: 'row not found',
    });
    const budgetFailedAttempt = await insertTask(budgetFailed, 'queued', queuedAt);
    const bidRunning = await insertAction({
      key: 'bid-running',
      approvalStatus: 'approved',
      executeStatus: 'running',
    });
    const bidRunningAttempt = await insertTask(bidRunning, 'queued', queuedAt);
    // Proposals in review and rejected ones stay as they are.
    const pendingCampaign = await insertAction({
      key: 'pending-campaign',
      actionType: 'create_campaign',
      approvalStatus: 'pending_review',
      executeStatus: 'queued',
    });
    const rejectedAfterCancel = await insertAction({
      key: 'rejected-after-cancel',
      approvalStatus: 'rejected',
      executeStatus: 'queued',
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
      approvalStatus: 'rejected',
      executeStatus: 'queued',
    });
    const rejectedQueuedAttempt = await insertTask(rejectedWithQueuedAttempt, 'queued', queuedAt);

    // Before the cutover the executor's queue offers every attempt still
    // queued, and a registration of the same name is still in progress.
    expect(await executorQueue(prisma)).toEqual({
      ids: [
        pauseWithoutTask,
        campaignQueued,
        bidAfterCancel,
        budgetAfterLateCancel,
        campaignDone,
        budgetFailed,
        bidRunning,
      ].sort(),
      approvedQueued: 7,
    });
    expect(await actions.findOpenCreateCampaignAction(TEST_ORGANIZATION_ID, 'campaign-queued'))
      .toMatchObject({ id: campaignQueued });

    await expect(runCutover()).resolves.toEqual({
      backfill: {
        affectedRows: 5,
        details: {
          storedExecutionColumnsPresent: true,
          normalizedLeasedTasks: 1,
          carriedIntoQueuedTasks: [
            { status: 'done', rows: 1 },
            { status: 'failed', rows: 1 },
            { status: 'running', rows: 1 },
          ],
          insertedTasks: [{ status: 'queued', rows: 1 }],
        },
      },
      closure: {
        affectedRows: 5,
        details: {
          storedExecutionColumnsPresent: true,
          closedAtCutover: [
            { kind: 'manual', rows: 3 },
            { kind: 'other', rows: 2 },
          ],
        },
      },
    });

    const derived = await derivedExecutions({
      pauseWithoutTask,
      campaignQueued,
      campaignLeased,
      bidAfterCancel,
      budgetAfterLateCancel,
      campaignDone,
      budgetFailed,
      bidRunning,
      pendingCampaign,
      rejectedAfterCancel,
      rejectedWithQueuedAttempt,
    });
    const closed = (executionTaskId: string, errorMessage: string) => ({
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
      pauseWithoutTask: closed(expect.any(String), MANUAL_AD_ACTION_MESSAGE),
      campaignQueued: closed(campaignAttempt, CUTOVER_CLOSED_MESSAGE),
      campaignLeased: closed(leasedAttempt, CUTOVER_CLOSED_MESSAGE),
      bidAfterCancel: closed(expect.any(String), MANUAL_AD_ACTION_MESSAGE),
      budgetAfterLateCancel: closed(expect.any(String), MANUAL_AD_ACTION_MESSAGE),
      campaignDone: {
        executionTaskId: campaignDoneAttempt,
        executeStatus: 'done',
        beforeJson: null,
        afterJson: { campaignId: 'c-1' },
        errorMessage: null,
        executedAt,
      },
      budgetFailed: {
        executionTaskId: budgetFailedAttempt,
        executeStatus: 'failed',
        beforeJson: null,
        afterJson: null,
        errorMessage: 'row not found',
        executedAt: null,
      },
      // A running attempt without a start time reads past its deadline (KID-160).
      bidRunning: {
        executionTaskId: bidRunningAttempt,
        executeStatus: 'failed',
        beforeJson: null,
        afterJson: null,
        errorMessage: '실행 기한 초과',
        executedAt: null,
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
    expect(await tasksOf(campaignLeased)).toEqual([
      { id: leasedAttempt, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(bidAfterCancel)).toEqual([
      { id: cancelledBidAttempt, status: 'cancelled', startedAt: null, closed: true },
      { id: derived.bidAfterCancel.executionTaskId, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(budgetAfterLateCancel)).toEqual([
      { id: lateCancelledAttempt, status: 'cancelled', startedAt: null, closed: true },
      { id: derived.budgetAfterLateCancel.executionTaskId, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(bidRunning)).toEqual([
      { id: bidRunningAttempt, status: 'running', startedAt: null, closed: false },
    ]);
    expect(await tasksOf(pendingCampaign)).toEqual([]);
    expect(await tasksOf(rejectedAfterCancel)).toEqual([
      { id: rejectedCancelledAttempt, status: 'cancelled', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(rejectedWithQueuedAttempt)).toEqual([
      { id: rejectedQueuedAttempt, status: 'queued', startedAt: null, closed: false },
    ]);

    // The queue offers none of them, and the closed registration no longer
    // holds its name, so it can be requested again.
    expect(await executorQueue(prisma)).toEqual({ ids: [], approvedQueued: 0 });
    expect(await actions.findOpenCreateCampaignAction(TEST_ORGANIZATION_ID, 'campaign-queued'))
      .toBeNull();

    // Re-running both changes nothing.
    await expect(runCutover()).resolves.toEqual({
      backfill: backfillNoOp(true),
      closure: closureNoOp(true),
    });
  });

  it('leaves a campaign registered after the schema step in the executor queue when both migrations run again', async () => {
    const staleCampaign = await insertAction({
      key: 'campaign-before-cutover',
      actionType: 'create_campaign',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    await insertTask(staleCampaign, 'queued', new Date('2026-09-10T01:00:00.000Z'));
    await expect(runCutover()).resolves.toMatchObject({
      closure: { affectedRows: 1 },
    });
    await dropStoredColumns(prisma);

    // The web registers the campaign again once the new release runs.
    const registered = await actions.createCampaignActionWithTask({
      organizationId: TEST_ORGANIZATION_ID,
      campaignName: 'campaign-before-cutover',
      priority: 'high',
      reason: 'registered after the cutover',
      payload: { pageType: 'campaign_registration' },
    });

    await expect(runCutover()).resolves.toEqual({
      backfill: backfillNoOp(false),
      closure: closureNoOp(false),
    });
    expect(await executorQueue(prisma)).toEqual({
      ids: [registered.actionId],
      approvedQueued: 1,
    });
    expect(await derivedExecutions({ registered: registered.actionId })).toEqual({
      registered: {
        executionTaskId: registered.taskId,
        executeStatus: 'queued',
        beforeJson: null,
        afterJson: null,
        errorMessage: null,
        executedAt: null,
      },
    });
  });

  it('changes nothing unless ad_actions still has all five stored execution columns', async () => {
    const queuedAt = new Date('2026-09-10T01:00:00.000Z');
    const campaignQueued = await insertAction({
      key: 'campaign-queued',
      actionType: 'create_campaign',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    const campaignAttempt = await insertTask(campaignQueued, 'queued', queuedAt);
    const bidAfterCancel = await insertAction({
      key: 'bid-after-cancel',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    const cancelledAttempt = await insertTask(
      bidAfterCancel,
      'cancelled',
      queuedAt,
      new Date('2026-09-10T02:00:00.000Z'),
    );
    const schemaSteps: Record<string, (tx: Prisma.TransactionClient) => Promise<unknown>> = {
      'execute_status dropped': (tx) =>
        tx.$executeRaw`ALTER TABLE ad_actions DROP COLUMN execute_status`,
      'before_json dropped': (tx) =>
        tx.$executeRaw`ALTER TABLE ad_actions DROP COLUMN before_json`,
      'after_json dropped': (tx) =>
        tx.$executeRaw`ALTER TABLE ad_actions DROP COLUMN after_json`,
      'error_message dropped': (tx) =>
        tx.$executeRaw`ALTER TABLE ad_actions DROP COLUMN error_message`,
      'executed_at dropped': (tx) =>
        tx.$executeRaw`ALTER TABLE ad_actions DROP COLUMN executed_at`,
      'every stored column dropped': dropStoredColumns,
    };

    for (const [schemaStep, apply] of Object.entries(schemaSteps)) {
      const rollback = new Error(`roll back: ${schemaStep}`);
      let observed: unknown;
      await expect(prisma.$transaction(async (tx) => {
        await apply(tx);
        observed = {
          result: await closeStaleAdApprovalsAtCutoverMigration.run(tx),
          campaignTasks: await tasksOf(campaignQueued, tx),
          bidTasks: await tasksOf(bidAfterCancel, tx),
        };
        throw rollback;
      })).rejects.toBe(rollback);
      expect(observed, schemaStep).toEqual({
        result: closureNoOp(false),
        campaignTasks: [{ id: campaignAttempt, status: 'queued', startedAt: null, closed: false }],
        bidTasks: [{ id: cancelledAttempt, status: 'cancelled', startedAt: null, closed: true }],
      });
    }

    // With every stored column in place the same approvals are closed.
    await expect(runMigration(closeStaleAdApprovalsAtCutoverMigration)).resolves.toEqual({
      affectedRows: 2,
      details: {
        storedExecutionColumnsPresent: true,
        closedAtCutover: [
          { kind: 'manual', rows: 1 },
          { kind: 'other', rows: 1 },
        ],
      },
    });
  });

  it('takes the task with the greater id as the latest of two created at the same instant', async () => {
    const createdAt = new Date('2026-09-10T01:00:00.000Z');
    const cancelledAt = new Date('2026-09-10T02:00:00.000Z');
    // The cancelled attempt has the greater id, so it is the latest: a closed
    // attempt follows it, and the queued attempt below it stays as it was.
    const bidTied = await insertAction({
      key: 'bid-tied',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    const bidQueuedBelow = await insertTask(
      bidTied,
      'queued',
      createdAt,
      null,
      '10000000-0000-4000-8000-000000000001',
    );
    const bidCancelledAbove = await insertTask(
      bidTied,
      'cancelled',
      createdAt,
      cancelledAt,
      '20000000-0000-4000-8000-000000000001',
    );
    // The queued attempt has the greater id, so it is the latest and closes in place.
    const campaignTied = await insertAction({
      key: 'campaign-tied',
      actionType: 'create_campaign',
      approvalStatus: 'approved',
      executeStatus: 'queued',
    });
    const campaignCancelledBelow = await insertTask(
      campaignTied,
      'cancelled',
      createdAt,
      cancelledAt,
      '10000000-0000-4000-8000-000000000002',
    );
    const campaignQueuedAbove = await insertTask(
      campaignTied,
      'queued',
      createdAt,
      null,
      '20000000-0000-4000-8000-000000000002',
    );

    await expect(runCutover()).resolves.toEqual({
      backfill: backfillNoOp(true),
      closure: {
        affectedRows: 2,
        details: {
          storedExecutionColumnsPresent: true,
          closedAtCutover: [
            { kind: 'manual', rows: 1 },
            { kind: 'other', rows: 1 },
          ],
        },
      },
    });

    const derived = await derivedExecutions({ bidTied, campaignTied });
    expect(derived).toEqual({
      bidTied: {
        executionTaskId: expect.any(String),
        executeStatus: 'failed',
        beforeJson: null,
        afterJson: null,
        errorMessage: MANUAL_AD_ACTION_MESSAGE,
        executedAt: null,
      },
      campaignTied: {
        executionTaskId: campaignQueuedAbove,
        executeStatus: 'failed',
        beforeJson: null,
        afterJson: null,
        errorMessage: CUTOVER_CLOSED_MESSAGE,
        executedAt: null,
      },
    });
    expect(await tasksOf(bidTied)).toEqual([
      { id: bidQueuedBelow, status: 'queued', startedAt: null, closed: false },
      { id: bidCancelledAbove, status: 'cancelled', startedAt: null, closed: true },
      { id: derived.bidTied.executionTaskId, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await tasksOf(campaignTied)).toEqual([
      { id: campaignCancelledBelow, status: 'cancelled', startedAt: null, closed: true },
      { id: campaignQueuedAbove, status: 'failed', startedAt: null, closed: true },
    ]);
    expect(await executorQueue(prisma)).toEqual({ ids: [], approvedQueued: 0 });
  });

  it('restates the manual action types and message of the KID-138 domain policy', () => {
    // 015 keeps what it did when the policy changes later. Once v0.1.31 has
    // run on Office, a policy change pins these literals here and leaves 015.
    expect([...MIGRATION_MANUAL_AD_ACTION_TYPES].sort()).toEqual([...MANUAL_AD_ACTION_TYPES].sort());
    expect(MIGRATION_MANUAL_AD_ACTION_MESSAGE).toBe(MANUAL_AD_ACTION_MESSAGE);
  });

  it('registers as a pre-schema v0.1.31 migration', () => {
    expect(closeStaleAdApprovalsAtCutoverMigration).toMatchObject({
      id: 'v0.1.31:015_close_stale_ad_approvals_at_cutover',
      releaseVersion: '0.1.31',
      phase: 'pre-schema',
    });
  });

  function runMigration(migration: { run(tx: Prisma.TransactionClient): Promise<unknown> }) {
    return prisma.$transaction((tx) => migration.run(tx));
  }

  /** The pre-schema phase runs 011 and then 015, each in its own transaction. */
  async function runCutover() {
    const backfill = await runMigration(backfillAdActionExecutionTasksMigration);
    const closure = await runMigration(closeStaleAdApprovalsAtCutoverMigration);
    return { backfill, closure };
  }

  function backfillNoOp(storedExecutionColumnsPresent: boolean) {
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

  function closureNoOp(storedExecutionColumnsPresent: boolean) {
    return {
      affectedRows: 0,
      details: { storedExecutionColumnsPresent, closedAtCutover: [] },
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

  async function addStoredColumns(): Promise<void> {
    await prisma.$executeRaw`
      ALTER TABLE ad_actions
        ADD COLUMN IF NOT EXISTS execute_status text NOT NULL DEFAULT 'queued',
        ADD COLUMN IF NOT EXISTS before_json jsonb,
        ADD COLUMN IF NOT EXISTS after_json jsonb,
        ADD COLUMN IF NOT EXISTS error_message text,
        ADD COLUMN IF NOT EXISTS executed_at timestamptz
    `;
  }

  /** What `db push --accept-data-loss` does to ad_actions after the pre-schema phase. */
  async function dropStoredColumns(db: Prisma.TransactionClient): Promise<void> {
    await db.$executeRaw`
      ALTER TABLE ad_actions
        DROP COLUMN IF EXISTS execute_status,
        DROP COLUMN IF EXISTS before_json,
        DROP COLUMN IF EXISTS after_json,
        DROP COLUMN IF EXISTS error_message,
        DROP COLUMN IF EXISTS executed_at
    `;
  }

  /** An action as the old Office database stores it, with its execution words. */
  async function insertAction(action: LegacyAction): Promise<string> {
    const actionType = action.actionType ?? 'change_bid';
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
        after_json,
        error_message,
        approved_at,
        executed_at
      )
      VALUES (
        gen_random_uuid(),
        ${TEST_ORGANIZATION_ID}::uuid,
        ${actionType},
        ${actionType === 'create_campaign' ? 'campaign' : 'keyword'},
        ${action.key},
        'legacy',
        ${action.approvalStatus},
        ${action.executeStatus},
        ${jsonText(action.afterJson)}::jsonb,
        ${action.errorMessage ?? null},
        ${action.approvalStatus === 'pending_review' ? null : new Date('2026-09-10T01:00:00.000Z')}::timestamptz,
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
    id: string | null = null,
  ): Promise<string> {
    const [row] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO execution_tasks (id, action_id, status, created_at, finished_at)
      VALUES (
        COALESCE(${id}::uuid, gen_random_uuid()),
        ${actionId}::uuid,
        ${status},
        ${createdAt}::timestamptz,
        ${finishedAt}::timestamptz
      )
      RETURNING id
    `;
    return row.id;
  }

  /**
   * Every attempt of the action in order. `closed` says the attempt has a
   * finish time no earlier than its creation.
   */
  async function tasksOf(actionId: string, db: Prisma.TransactionClient = prisma) {
    const tasks = await db.executionTask.findMany({
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
    named: Record<Name, string>,
  ): Promise<Record<Name, AdActionExecution>> {
    const latestTasks = await readLatestExecutionTasks(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      actionIds: Object.values<string>(named),
    });
    const now = new Date();
    return Object.fromEntries(
      Object.entries<string>(named).map(([name, id]) => [
        name,
        deriveAdActionExecution(latestTasks.get(id) ?? null, now),
      ]),
    ) as Record<Name, AdActionExecution>;
  }
});

function jsonText(value: Record<string, unknown> | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}
