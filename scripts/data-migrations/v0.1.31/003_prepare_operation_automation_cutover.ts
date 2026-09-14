import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type Count = bigint | number | string;

/**
 * The tables this preparation reads. The v0.1.31 schema step drops the generic
 * Operation/Automation tables and the KID-90 schema step drops `action_tasks`
 * and `rules_evaluation_applications`, so a database past either step lacks
 * some of them. A table that is gone holds nothing to guard, count, or delete.
 */
const PREPARED_TABLES = [
  'operation_runs',
  'operation_run_checkpoints',
  'operation_schedules',
  'workflow_templates',
  'workflow_runs',
  'marketplace',
  'rules_evaluation_applications',
  'action_tasks',
] as const;

type PreparedTable = (typeof PREPARED_TABLES)[number];

type CutoverCounts = {
  ledgerRows: number;
  activeLedgerRows: number;
  checkpointRows: number;
  scheduleRows: number;
  enabledScheduleRows: number;
  workflowDefinitionRows: number;
  workflowExecutionRows: number;
  catalogRows: number;
  dormantActionRows: number;
};

/**
 * Prepare the disposable, writer-stopped database for the v0.1.31 schema
 * cutover. The preflight is the operator admission gate; this second guard
 * prevents deleting an admitted run or enabled schedule if one appeared
 * between the read-only snapshot and writer shutdown.
 */
export async function prepareOperationAutomationCutover(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const present = await readPresentTables(tx);
  const counts = await readCounts(tx, present);
  if (counts.activeLedgerRows > 0) {
    throw new Error('Operation/Automation cutover is blocked while active ledger rows remain.');
  }
  if (counts.enabledScheduleRows > 0) {
    throw new Error('Operation/Automation cutover is blocked while enabled schedules remain.');
  }

  // Delete children before their retired parent tables. These statements use
  // fixed identifiers so the migration remains valid after Prisma models are
  // removed from the post-cutover client.
  const deletedRulesApplicationRows = present.has('rules_evaluation_applications')
    ? await tx.$executeRaw`DELETE FROM rules_evaluation_applications`
    : 0;
  const deletedCheckpointRows = present.has('operation_run_checkpoints')
    ? await tx.$executeRaw`DELETE FROM operation_run_checkpoints`
    : 0;
  const deletedLedgerRows = present.has('operation_runs')
    ? await tx.$executeRaw`DELETE FROM operation_runs`
    : 0;
  const deletedScheduleRows = present.has('operation_schedules')
    ? await tx.$executeRaw`DELETE FROM operation_schedules`
    : 0;
  const deletedWorkflowExecutionRows = present.has('workflow_runs')
    ? await tx.$executeRaw`DELETE FROM workflow_runs`
    : 0;
  const deletedWorkflowDefinitionRows = present.has('workflow_templates')
    ? await tx.$executeRaw`DELETE FROM workflow_templates`
    : 0;
  const deletedCatalogRows = present.has('marketplace')
    ? await tx.$executeRaw`DELETE FROM marketplace`
    : 0;

  // ActionTask rows are left for the schema step that drops their table. A
  // count that moved while this ran means a writer is still running.
  const retainedDormantActionRows = present.has('action_tasks')
    ? await countActionTasks(tx)
    : 0;
  if (retainedDormantActionRows !== counts.dormantActionRows) {
    throw new Error('Dormant action rows changed during the cutover preparation.');
  }

  const affectedRows =
    deletedRulesApplicationRows +
    deletedCheckpointRows +
    deletedLedgerRows +
    deletedScheduleRows +
    deletedWorkflowExecutionRows +
    deletedWorkflowDefinitionRows +
    deletedCatalogRows;

  return {
    affectedRows,
    details: {
      activeLedgerRows: counts.activeLedgerRows,
      enabledScheduleRows: counts.enabledScheduleRows,
      ledgerRows: counts.ledgerRows,
      checkpointRows: counts.checkpointRows,
      scheduleRows: counts.scheduleRows,
      workflowDefinitionRows: counts.workflowDefinitionRows,
      workflowExecutionRows: counts.workflowExecutionRows,
      catalogRows: counts.catalogRows,
      deletedRulesApplicationRows,
      deletedCheckpointRows,
      deletedLedgerRows,
      deletedScheduleRows,
      deletedWorkflowExecutionRows,
      deletedWorkflowDefinitionRows,
      deletedCatalogRows,
      dormantActionRows: retainedDormantActionRows,
      checkpointTablePresent: present.has('operation_run_checkpoints'),
      rulesApplicationsTablePresent: present.has('rules_evaluation_applications'),
      absentTables: PREPARED_TABLES.filter((table) => !present.has(table)),
    },
  };
}

export const prepareOperationAutomationCutoverMigration: DataMigration = {
  id: 'v0.1.31:003_prepare_operation_automation_cutover',
  releaseVersion: '0.1.31',
  name: 'Prepare Operation/Automation schema cutover',
  phase: 'pre-schema',
  run: prepareOperationAutomationCutover,
};

async function readPresentTables(
  tx: Prisma.TransactionClient,
): Promise<ReadonlySet<PreparedTable>> {
  const rows = await tx.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ANY(${[...PREPARED_TABLES]}::text[])
  `;
  const found = new Set(rows.map((row) => row.table_name));
  return new Set(PREPARED_TABLES.filter((table) => found.has(table)));
}

async function readCounts(
  tx: Prisma.TransactionClient,
  present: ReadonlySet<PreparedTable>,
): Promise<CutoverCounts> {
  const [ledger] = present.has('operation_runs')
    ? await tx.$queryRaw<Array<{ ledger_rows: Count; active_ledger_rows: Count }>>`
        SELECT
          (SELECT COUNT(*)::bigint FROM operation_runs) AS ledger_rows,
          (SELECT COUNT(*)::bigint FROM operation_runs
            WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')) AS active_ledger_rows
      `
    : [{ ledger_rows: 0, active_ledger_rows: 0 }];
  const [schedules] = present.has('operation_schedules')
    ? await tx.$queryRaw<Array<{ schedule_rows: Count; enabled_schedule_rows: Count }>>`
        SELECT
          (SELECT COUNT(*)::bigint FROM operation_schedules) AS schedule_rows,
          (SELECT COUNT(*)::bigint FROM operation_schedules WHERE enabled = TRUE) AS enabled_schedule_rows
      `
    : [{ schedule_rows: 0, enabled_schedule_rows: 0 }];
  const [checkpoints] = present.has('operation_run_checkpoints')
    ? await tx.$queryRaw<Array<{ count: Count }>>`
        SELECT COUNT(*)::bigint AS count FROM operation_run_checkpoints
      `
    : [{ count: 0 }];
  const [workflowDefinitions] = present.has('workflow_templates')
    ? await tx.$queryRaw<Array<{ count: Count }>>`
        SELECT COUNT(*)::bigint AS count FROM workflow_templates
      `
    : [{ count: 0 }];
  const [workflowExecutions] = present.has('workflow_runs')
    ? await tx.$queryRaw<Array<{ count: Count }>>`
        SELECT COUNT(*)::bigint AS count FROM workflow_runs
      `
    : [{ count: 0 }];
  const [catalog] = present.has('marketplace')
    ? await tx.$queryRaw<Array<{ count: Count }>>`
        SELECT COUNT(*)::bigint AS count FROM marketplace
      `
    : [{ count: 0 }];

  return {
    ledgerRows: toCount(ledger?.ledger_rows),
    activeLedgerRows: toCount(ledger?.active_ledger_rows),
    checkpointRows: toCount(checkpoints?.count),
    scheduleRows: toCount(schedules?.schedule_rows),
    enabledScheduleRows: toCount(schedules?.enabled_schedule_rows),
    workflowDefinitionRows: toCount(workflowDefinitions?.count),
    workflowExecutionRows: toCount(workflowExecutions?.count),
    catalogRows: toCount(catalog?.count),
    dormantActionRows: present.has('action_tasks') ? await countActionTasks(tx) : 0,
  };
}

async function countActionTasks(tx: Prisma.TransactionClient): Promise<number> {
  const [row] = await tx.$queryRaw<Array<{ count: Count }>>`
    SELECT COUNT(*)::bigint AS count FROM action_tasks
  `;
  return toCount(row?.count);
}

function toCount(value: Count | undefined): number {
  if (value === undefined) throw new Error('Cutover count query returned no count.');
  const count = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Cutover count query returned an invalid count.');
  }
  return count;
}
