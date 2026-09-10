import type { Prisma } from '@prisma/client';
import type { DataMigration, MigrationResult } from '../types';

type CountRow = {
  ledger_rows: bigint | number | string;
  active_ledger_rows: bigint | number | string;
  checkpoint_rows: bigint | number | string;
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
      (SELECT COUNT(*)::bigint FROM operation_runs) AS ledger_rows,
      (SELECT COUNT(*)::bigint FROM operation_runs
        WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')) AS active_ledger_rows,
      (SELECT COUNT(*)::bigint FROM operation_run_checkpoints) AS checkpoint_rows,
      (SELECT COUNT(*)::bigint FROM operation_schedules) AS schedule_rows,
      (SELECT COUNT(*)::bigint FROM operation_schedules WHERE enabled = TRUE) AS enabled_schedule_rows,
      (SELECT COUNT(*)::bigint FROM workflow_templates) AS workflow_definition_rows,
      (SELECT COUNT(*)::bigint FROM workflow_runs) AS workflow_execution_rows,
      (SELECT COUNT(*)::bigint FROM marketplace) AS catalog_rows,
      (SELECT COUNT(*)::bigint FROM action_tasks) AS dormant_action_rows
  `;

  const counts = normalizeCounts(before);
  if (counts.activeLedgerRows > 0) {
    throw new Error(
      'Operation/Automation cutover is blocked while active ledger rows remain.',
    );
  }
  if (counts.enabledScheduleRows > 0) {
    throw new Error(
      'Operation/Automation cutover is blocked while enabled schedules remain.',
    );
  }

  const deletedAlertRows = (await tx.alert.deleteMany()).count;
  const deletedRulesApplicationRows = (
    await tx.rulesEvaluationApplication.deleteMany()
  ).count;

  // Delete children before their retired parent tables. These statements use
  // fixed identifiers so the migration remains valid after Prisma models are
  // removed from the post-cutover client.
  const deletedCheckpointRows = await tx.$executeRaw`
    DELETE FROM operation_run_checkpoints
  `;
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

  const [after] = await tx.$queryRaw<{
    dormant_action_rows: bigint | number | string;
  }[]>`
    SELECT COUNT(*)::bigint AS dormant_action_rows
    FROM action_tasks
  `;
  const retainedDormantActionRows = toCount(after?.dormant_action_rows);
  if (retainedDormantActionRows !== counts.dormantActionRows) {
    throw new Error('Dormant action rows changed during the cutover preparation.');
  }

  const affectedRows = deletedAlertRows
    + deletedRulesApplicationRows
    + deletedCheckpointRows
    + deletedLedgerRows
    + deletedScheduleRows
    + deletedWorkflowExecutionRows
    + deletedWorkflowDefinitionRows
    + deletedCatalogRows;

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
      deletedAlertRows,
      deletedRulesApplicationRows,
      deletedCheckpointRows,
      deletedLedgerRows,
      deletedScheduleRows,
      deletedWorkflowExecutionRows,
      deletedWorkflowDefinitionRows,
      deletedCatalogRows,
      dormantActionRows: retainedDormantActionRows,
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

function normalizeCounts(row: CountRow | undefined): CutoverCounts {
  if (!row) throw new Error('Operation/Automation cutover count query returned no row.');
  return {
    ledgerRows: toCount(row.ledger_rows),
    activeLedgerRows: toCount(row.active_ledger_rows),
    checkpointRows: toCount(row.checkpoint_rows),
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
