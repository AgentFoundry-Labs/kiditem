import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPreflightSql,
  parseArgs,
  runPreflight,
} from '../operation-automation-cutover-preflight.mjs';

const expectedCountKeys = [
  'operationRuns',
  'activeOperationRuns',
  'enabledSchedules',
  'workflowTemplates',
  'workflowRuns',
  'marketplaceItems',
  'actionTasks',
  'operationAlerts',
  'rulesApplications',
];

const ALL_TABLES = Object.freeze([
  'operation_runs',
  'operation_schedules',
  'workflow_templates',
  'workflow_runs',
  'marketplace',
  'action_tasks',
  'alerts',
  'rules_evaluation_applications',
]);

const RUN = Object.freeze({
  databaseUrl: 'postgresql://readonly.example/kiditem',
  deployedSha: 'deployed-sha',
  releaseOfficeSha: 'release-office-sha',
  now: new Date('2026-09-03T00:00:00.000Z'),
});

/**
 * A read-only client over named tables and `table.column` names. Like
 * PostgreSQL, it refuses a query that reads a table or column the database does
 * not have, so a passing report proves the preflight never reached for one.
 */
function fakeDatabase({ tables = ALL_TABLES, columns = ['alerts.kind'], counts = {} } = {}) {
  const queryLog = [];
  const client = {
    async query(text) {
      queryLog.push(text);
      const sql = text.replace(/\s+/g, ' ').trim().toLowerCase();
      if (sql.startsWith('begin') || sql.startsWith('rollback')) return { rows: [] };
      if (sql.includes('information_schema.tables')) {
        return { rows: tables.map((table_name) => ({ table_name })) };
      }
      if (sql.includes('information_schema.columns')) {
        return { rows: columns.map((column_name) => ({ column_name })) };
      }
      const table = /\bfrom ([a-z_]+)/.exec(sql)?.[1];
      if (!tables.includes(table)) throw new Error(`relation "${table}" does not exist`);
      if (/\bkind\b/.test(sql) && !columns.includes(`${table}.kind`)) {
        throw new Error('column "kind" does not exist');
      }
      if (sql.startsWith('select distinct operation_key')) {
        return { rows: (counts.operationKeys ?? []).map((operationKey) => ({ operationKey })) };
      }
      if (sql.startsWith('select distinct name')) {
        return { rows: (counts.workflowNames ?? []).map((name) => ({ name })) };
      }
      if (sql.includes('active_operation_runs')) {
        return { rows: [{ active_operation_runs: String(counts.activeOperationRuns ?? 0) }] };
      }
      if (sql.includes('enabled = true')) {
        return { rows: [{ count: String(counts.enabledSchedules ?? 0) }] };
      }
      const key = table === 'alerts' ? 'operationAlerts' : table;
      return { rows: [{ count: String(counts[key] ?? 0) }] };
    },
  };
  return { client, queryLog };
}

test('uses only SELECT and rejects a writable execution mode', () => {
  const sql = buildPreflightSql();
  assert.match(sql, /\bselect\b/i);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|drop|truncate)\b/i);
  assert.throws(() => parseArgs(['--apply']), /read-only/);
});

test('prints counts and bounded names without row payloads or secrets', async () => {
  const { client, queryLog } = fakeDatabase({
    counts: {
      operation_runs: 4,
      activeOperationRuns: 1,
      enabledSchedules: 1,
      workflow_templates: 2,
      workflow_runs: 3,
      marketplace: 2,
      action_tasks: 5,
      operationAlerts: 1,
      rules_evaluation_applications: 2,
      operationKeys: ['inventory.refresh'],
      workflowNames: ['fixture workflow'],
    },
  });

  const report = await runPreflight({ client, ...RUN });

  assert.deepEqual(Object.keys(report.counts), expectedCountKeys);
  assert.deepEqual(report.counts, {
    operationRuns: 4,
    activeOperationRuns: 1,
    enabledSchedules: 1,
    workflowTemplates: 2,
    workflowRuns: 3,
    marketplaceItems: 2,
    actionTasks: 5,
    operationAlerts: 1,
    rulesApplications: 2,
  });
  assert.deepEqual(report.absentOptionalTables, []);
  assert.deepEqual(report.absentOptionalColumns, []);
  assert.deepEqual(report.activeOperationKeys, ['inventory.refresh']);
  assert.deepEqual(report.enabledScheduleKeys, ['inventory.refresh']);
  assert.deepEqual(report.installedWorkflowNames, ['fixture workflow']);
  assert.equal(report.deployedSha, 'deployed-sha');
  assert.equal(report.releaseOfficeSha, 'release-office-sha');
  assert.equal(JSON.stringify(report).includes('input'), false);
  assert.equal(JSON.stringify(report).includes('result'), false);
  assert.match(queryLog[0], /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY$/);
  assert.ok(queryLog.some((query) => /information_schema\.tables/i.test(query)));
  assert.ok(
    queryLog.every((query) =>
      /^(?:\s*(?:begin\s+transaction\s+isolation\s+level\s+repeatable\s+read\s+read\s+only|rollback)\b|\s*select\b)/i.test(
        query,
      ),
    ),
  );
});

test('treats an absent optional rules application table as zero rows', async () => {
  const { client } = fakeDatabase({
    tables: ALL_TABLES.filter((table) => table !== 'rules_evaluation_applications'),
  });

  const report = await runPreflight({ client, ...RUN });

  assert.equal(report.counts.rulesApplications, 0);
  assert.deepEqual(report.absentOptionalTables, ['rules_evaluation_applications']);
});

test('counts a dropped ActionTask table and alert kind column as zero without reading them', async () => {
  const { client } = fakeDatabase({
    tables: ALL_TABLES.filter(
      (table) => table !== 'action_tasks' && table !== 'rules_evaluation_applications',
    ),
    columns: [],
    counts: { operation_runs: 3 },
  });

  const report = await runPreflight({ client, ...RUN });

  assert.equal(report.counts.operationRuns, 3);
  assert.equal(report.counts.actionTasks, 0);
  assert.equal(report.counts.operationAlerts, 0);
  assert.deepEqual(report.absentOptionalTables, ['rules_evaluation_applications', 'action_tasks']);
  assert.deepEqual(report.absentOptionalColumns, ['alerts.kind']);
});

test('still stops when a table the admission gate reads is missing', async () => {
  const { client } = fakeDatabase({
    tables: ALL_TABLES.filter((table) => table !== 'operation_runs'),
  });

  await assert.rejects(
    runPreflight({ client, ...RUN }),
    /required tables are missing: operation_runs\./,
  );
});
