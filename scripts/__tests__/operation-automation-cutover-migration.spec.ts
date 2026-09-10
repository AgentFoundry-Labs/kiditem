import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { prepareOperationAutomationCutover } from '../data-migrations/v0.1.31/003_prepare_operation_automation_cutover';

const repoRoot = join(__dirname, '..', '..');

function countRow(overrides: Record<string, bigint> = {}) {
  return {
    ledger_rows: 2n,
    active_ledger_rows: 0n,
    checkpoint_rows: 3n,
    schedule_rows: 1n,
    enabled_schedule_rows: 0n,
    workflow_definition_rows: 4n,
    workflow_execution_rows: 5n,
    catalog_rows: 6n,
    dormant_action_rows: 7n,
    ...overrides,
  };
}

function makeTransaction(
  before = countRow(),
  after = { dormant_action_rows: before.dormant_action_rows },
) {
  return {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([after]),
    $executeRaw: vi.fn()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(6),
    alert: { deleteMany: vi.fn().mockResolvedValue({ count: 8 }) },
    rulesEvaluationApplication: {
      deleteMany: vi.fn().mockResolvedValue({ count: 9 }),
    },
  };
}

describe('prepareOperationAutomationCutover', () => {
  it('clears retired rows, resets alerts/rules applications, and retains dormant tasks', async () => {
    const tx = makeTransaction();

    await expect(prepareOperationAutomationCutover(tx as never)).resolves.toEqual({
      affectedRows: 38,
      details: {
        activeLedgerRows: 0,
        enabledScheduleRows: 0,
        ledgerRows: 2,
        checkpointRows: 3,
        scheduleRows: 1,
        workflowDefinitionRows: 4,
        workflowExecutionRows: 5,
        catalogRows: 6,
        deletedAlertRows: 8,
        deletedRulesApplicationRows: 9,
        deletedCheckpointRows: 3,
        deletedLedgerRows: 2,
        deletedScheduleRows: 1,
        deletedWorkflowExecutionRows: 5,
        deletedWorkflowDefinitionRows: 4,
        deletedCatalogRows: 6,
        dormantActionRows: 7,
      },
    });
    expect(tx.alert.deleteMany).toHaveBeenCalledWith();
    expect(tx.rulesEvaluationApplication.deleteMany).toHaveBeenCalledWith();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(6);
  });

  it('is an idempotent zero-row no-op after the first preparation', async () => {
    const tx = makeTransaction(
      countRow({
        ledger_rows: 0n,
        checkpoint_rows: 0n,
        schedule_rows: 0n,
        workflow_definition_rows: 0n,
        workflow_execution_rows: 0n,
        catalog_rows: 0n,
      }),
      { dormant_action_rows: 7n },
    );
    tx.$executeRaw.mockReset();
    tx.$executeRaw.mockResolvedValue(0);
    tx.alert.deleteMany.mockResolvedValue({ count: 0 });
    tx.rulesEvaluationApplication.deleteMany.mockResolvedValue({ count: 0 });

    await expect(prepareOperationAutomationCutover(tx as never)).resolves.toMatchObject({
      affectedRows: 0,
      details: { dormantActionRows: 7 },
    });
  });

  it('refuses the cutover when the writer-stop gate is stale', async () => {
    const tx = makeTransaction(countRow({ active_ledger_rows: 1n }));

    await expect(prepareOperationAutomationCutover(tx as never)).rejects.toThrow(
      /active ledger rows remain/i,
    );
    expect(tx.alert.deleteMany).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('removes generic Prisma models while preserving the dormant ActionTask model', () => {
    const schema = [
      'core.prisma',
      'system.prisma',
      'agents.prisma',
    ]
      .map((file) => readFileSync(join(repoRoot, 'prisma', 'models', file), 'utf8'))
      .join('\n');

    for (const token of [
      'model OperationRun',
      'model OperationSchedule',
      'model WorkflowRun',
      'model WorkflowTemplate',
      'model Marketplace',
      'operationRunId',
      'operationKey',
      'actionTaskId',
    ]) {
      expect(schema).not.toContain(token);
    }
    expect(schema).toContain('model ActionTask');
  });
});
