import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { prepareOperationAutomationCutover } from '../data-migrations/v0.1.31/003_prepare_operation_automation_cutover';

const repoRoot = join(__dirname, '..', '..');

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

type Table = (typeof PREPARED_TABLES)[number];

const PRE_CUTOVER_ROWS: Record<Table, number> = {
  operation_runs: 2,
  operation_run_checkpoints: 3,
  operation_schedules: 1,
  workflow_templates: 4,
  workflow_runs: 5,
  marketplace: 6,
  rules_evaluation_applications: 9,
  action_tasks: 7,
};

/**
 * A transaction over named tables. Like PostgreSQL, it refuses a statement that
 * names a table the database does not have, so a passing run proves the
 * migration never reached for one.
 */
function fakeTransaction(
  rows: Partial<Record<Table, number>>,
  gates: { activeLedgerRows?: number; enabledScheduleRows?: number } = {},
) {
  const tables = new Map(Object.entries(rows) as Array<[Table, number]>);
  const statements: string[] = [];
  const sqlOf = (strings: TemplateStringsArray) => strings.join('?').replace(/\s+/g, ' ').trim();
  const namedTables = (sql: string) =>
    [...sql.matchAll(/\bFROM\s+([a-z_]+)/gi)]
      .map((match) => match[1]!.toLowerCase())
      .filter((table) => table !== 'information_schema');
  const assertPresent = (sql: string) => {
    for (const table of namedTables(sql)) {
      if (!tables.has(table as Table)) throw new Error(`relation "${table}" does not exist`);
    }
  };
  const count = (table: Table) => BigInt(tables.get(table) ?? 0);

  return {
    statements,
    rowsOf: (table: Table) => tables.get(table),
    tx: {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = sqlOf(strings);
        statements.push(sql);
        if (sql.includes('information_schema.tables')) {
          return [...tables.keys()].map((table_name) => ({ table_name }));
        }
        assertPresent(sql);
        if (sql.includes('ledger_rows')) {
          return [{
            ledger_rows: count('operation_runs'),
            active_ledger_rows: BigInt(gates.activeLedgerRows ?? 0),
          }];
        }
        if (sql.includes('schedule_rows')) {
          return [{
            schedule_rows: count('operation_schedules'),
            enabled_schedule_rows: BigInt(gates.enabledScheduleRows ?? 0),
          }];
        }
        return [{ count: count(namedTables(sql)[0] as Table) }];
      }),
      $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = sqlOf(strings);
        statements.push(sql);
        assertPresent(sql);
        const table = namedTables(sql)[0] as Table;
        const deleted = tables.get(table) ?? 0;
        tables.set(table, 0);
        return deleted;
      }),
    },
  };
}

const EMPTY_DETAILS = {
  activeLedgerRows: 0,
  enabledScheduleRows: 0,
  ledgerRows: 0,
  checkpointRows: 0,
  scheduleRows: 0,
  workflowDefinitionRows: 0,
  workflowExecutionRows: 0,
  catalogRows: 0,
  deletedRulesApplicationRows: 0,
  deletedCheckpointRows: 0,
  deletedLedgerRows: 0,
  deletedScheduleRows: 0,
  deletedWorkflowExecutionRows: 0,
  deletedWorkflowDefinitionRows: 0,
  deletedCatalogRows: 0,
  dormantActionRows: 0,
};

describe('prepareOperationAutomationCutover', () => {
  it('clears retired automation rows and leaves ActionTask rows to the schema step', async () => {
    const db = fakeTransaction(PRE_CUTOVER_ROWS);

    await expect(prepareOperationAutomationCutover(db.tx as never)).resolves.toEqual({
      affectedRows: 30,
      details: {
        activeLedgerRows: 0,
        enabledScheduleRows: 0,
        ledgerRows: 2,
        checkpointRows: 3,
        scheduleRows: 1,
        workflowDefinitionRows: 4,
        workflowExecutionRows: 5,
        catalogRows: 6,
        deletedRulesApplicationRows: 9,
        deletedCheckpointRows: 3,
        deletedLedgerRows: 2,
        deletedScheduleRows: 1,
        deletedWorkflowExecutionRows: 5,
        deletedWorkflowDefinitionRows: 4,
        deletedCatalogRows: 6,
        dormantActionRows: 7,
        checkpointTablePresent: true,
        rulesApplicationsTablePresent: true,
        absentTables: [],
      },
    });
    // Children go before their retired parents.
    expect(db.statements.filter((sql) => sql.startsWith('DELETE'))).toEqual([
      'DELETE FROM rules_evaluation_applications',
      'DELETE FROM operation_run_checkpoints',
      'DELETE FROM operation_runs',
      'DELETE FROM operation_schedules',
      'DELETE FROM workflow_runs',
      'DELETE FROM workflow_templates',
      'DELETE FROM marketplace',
    ]);
    expect(db.rowsOf('action_tasks')).toBe(7);
  });

  it('is an idempotent zero-row no-op after the first preparation', async () => {
    const db = fakeTransaction(PRE_CUTOVER_ROWS);
    await prepareOperationAutomationCutover(db.tx as never);

    await expect(prepareOperationAutomationCutover(db.tx as never)).resolves.toMatchObject({
      affectedRows: 0,
      details: { dormantActionRows: 7, absentTables: [] },
    });
  });

  it.each([
    ['active ledger rows', { activeLedgerRows: 1 }, /active ledger rows remain/i],
    ['enabled schedules', { enabledScheduleRows: 1 }, /enabled schedules remain/i],
  ] as const)('refuses the cutover while %s remain', async (_label, gates, message) => {
    const db = fakeTransaction(PRE_CUTOVER_ROWS, gates);

    await expect(prepareOperationAutomationCutover(db.tx as never)).rejects.toThrow(message);
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('treats absent optional checkpoint and rules receipt tables as zero rows', async () => {
    const {
      operation_run_checkpoints: _checkpoints,
      rules_evaluation_applications: _rules,
      ...rows
    } = PRE_CUTOVER_ROWS;
    const db = fakeTransaction(rows);

    await expect(prepareOperationAutomationCutover(db.tx as never)).resolves.toMatchObject({
      affectedRows: 18,
      details: {
        checkpointRows: 0,
        deletedCheckpointRows: 0,
        deletedRulesApplicationRows: 0,
        checkpointTablePresent: false,
        rulesApplicationsTablePresent: false,
        absentTables: ['operation_run_checkpoints', 'rules_evaluation_applications'],
      },
    });
  });

  it('changes nothing on a database past the v0.1.31 and KID-90 schema steps', async () => {
    const db = fakeTransaction({});

    await expect(prepareOperationAutomationCutover(db.tx as never)).resolves.toEqual({
      affectedRows: 0,
      details: {
        ...EMPTY_DETAILS,
        checkpointTablePresent: false,
        rulesApplicationsTablePresent: false,
        absentTables: [...PREPARED_TABLES],
      },
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
    expect(db.statements).toHaveLength(1);
  });

  it('counts only ActionTask rows where the generic tables are already gone', async () => {
    const db = fakeTransaction({ action_tasks: 7 });

    await expect(prepareOperationAutomationCutover(db.tx as never)).resolves.toEqual({
      affectedRows: 0,
      details: {
        ...EMPTY_DETAILS,
        dormantActionRows: 7,
        checkpointTablePresent: false,
        rulesApplicationsTablePresent: false,
        absentTables: PREPARED_TABLES.filter((table) => table !== 'action_tasks'),
      },
    });
    expect(db.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('removes the generic Operation/Automation models from the Prisma schema', () => {
    const schema = ['core.prisma', 'system.prisma', 'agent-work.prisma']
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
  });
});
