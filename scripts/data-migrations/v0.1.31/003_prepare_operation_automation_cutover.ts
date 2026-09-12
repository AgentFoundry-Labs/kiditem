import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type CountRow = {
  ledger_rows: bigint | number | string;
  active_ledger_rows: bigint | number | string;
  checkpoint_table_exists: boolean;
  rules_applications_table_exists: boolean;
  schedule_rows: bigint | number | string;
  enabled_schedule_rows: bigint | number | string;
  workflow_definition_rows: bigint | number | string;
  workflow_execution_rows: bigint | number | string;
  catalog_rows: bigint | number | string;
  dormant_action_rows: bigint | number | string;
};

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
  const [before] = await tx.$queryRaw<CountRow[]>`
    SELECT
      to_regclass('public.operation_run_checkpoints') IS NOT NULL AS checkpoint_table_exists,
      to_regclass('public.rules_evaluation_applications') IS NOT NULL AS rules_applications_table_exists,
      (SELECT COUNT(*)::bigint FROM operation_runs) AS ledger_rows,
      (SELECT COUNT(*)::bigint FROM operation_runs
        WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')) AS active_ledger_rows,
      (SELECT COUNT(*)::bigint FROM operation_schedules) AS schedule_rows,
      (SELECT COUNT(*)::bigint FROM operation_schedules WHERE enabled = TRUE) AS enabled_schedule_rows,
      (SELECT COUNT(*)::bigint FROM workflow_templates) AS workflow_definition_rows,
      (SELECT COUNT(*)::bigint FROM workflow_runs) AS workflow_execution_rows,
      (SELECT COUNT(*)::bigint FROM marketplace) AS catalog_rows,
      (SELECT COUNT(*)::bigint FROM action_tasks) AS dormant_action_rows
  `;

  const counts = normalizeCounts(before, 0);
  if (counts.activeLedgerRows > 0) {
    throw new Error('Operation/Automation cutover is blocked while active ledger rows remain.');
  }
  if (counts.enabledScheduleRows > 0) {
    throw new Error('Operation/Automation cutover is blocked while enabled schedules remain.');
  }

  const checkpointTablePresent = before?.checkpoint_table_exists === true;
  const rulesApplicationsTablePresent = before?.rules_applications_table_exists === true;
  if (checkpointTablePresent) {
    const [checkpoint] = await tx.$queryRaw<
      Array<{
        checkpoint_rows: bigint | number | string;
      }>
    >`
      SELECT COUNT(*)::bigint AS checkpoint_rows
      FROM operation_run_checkpoints
    `;
    counts.checkpointRows = toCount(checkpoint?.checkpoint_rows);
  }

  const deletedRulesApplicationRows = rulesApplicationsTablePresent
    ? await tx.$executeRaw`DELETE FROM rules_evaluation_applications`
    : 0;

  // Delete children before their retired parent tables. These statements use
  // fixed identifiers so the migration remains valid after Prisma models are
  // removed from the post-cutover client.
  const deletedCheckpointRows = checkpointTablePresent
    ? await tx.$executeRaw`DELETE FROM operation_run_checkpoints`
    : 0;
  const deletedLedgerRows = await tx.$executeRaw`
    DELETE FROM operation_runs
  `;
  const deletedScheduleRows = await tx.$executeRaw`
    DELETE FROM operation_schedules
  `;
  const deletedWorkflowExecutionRows = await tx.$executeRaw`
    DELETE FROM workflow_runs
  `;
  const deletedWorkflowDefinitionRows = await tx.$executeRaw`
    DELETE FROM workflow_templates
  `;
  const deletedCatalogRows = await tx.$executeRaw`
    DELETE FROM marketplace
  `;

  const [after] = await tx.$queryRaw<
    {
      dormant_action_rows: bigint | number | string;
    }[]
  >`
    SELECT COUNT(*)::bigint AS dormant_action_rows
    FROM action_tasks
  `;
  const retainedDormantActionRows = toCount(after?.dormant_action_rows);
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
      checkpointTablePresent,
      rulesApplicationsTablePresent,
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

function normalizeCounts(row: CountRow | undefined, checkpointRows: number): CutoverCounts {
  if (!row) throw new Error('Operation/Automation cutover count query returned no row.');
  return {
    ledgerRows: toCount(row.ledger_rows),
    activeLedgerRows: toCount(row.active_ledger_rows),
    checkpointRows,
    scheduleRows: toCount(row.schedule_rows),
    enabledScheduleRows: toCount(row.enabled_schedule_rows),
    workflowDefinitionRows: toCount(row.workflow_definition_rows),
    workflowExecutionRows: toCount(row.workflow_execution_rows),
    catalogRows: toCount(row.catalog_rows),
    dormantActionRows: toCount(row.dormant_action_rows),
  };
}

function toCount(value: bigint | number | string | undefined): number {
  if (value === undefined) throw new Error('Cutover count query returned no count.');
  const count = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Cutover count query returned an invalid count.');
  }
  return count;
}
