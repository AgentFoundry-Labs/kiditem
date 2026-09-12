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

test('uses only SELECT and rejects a writable execution mode', () => {
  const sql = buildPreflightSql();
  assert.match(sql, /\bselect\b/i);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|drop|truncate)\b/i);
  assert.throws(() => parseArgs(['--apply']), /read-only/);
});

test('prints counts and bounded names without row payloads or secrets', async () => {
  const queryLog = [];
  const fixtureRows = {
    operation_runs: 4,
    operation_runs_active: 1,
    operation_schedules_enabled: 1,
    workflow_templates: 2,
    workflow_runs: 3,
    marketplace: 2,
    action_tasks: 5,
    alerts_operation: 1,
    rules_evaluation_applications: 2,
  };
  const client = {
    async query(text) {
      queryLog.push(text);
      const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('begin')) return { rows: [] };
      if (normalized.startsWith('rollback')) return { rows: [] };
      if (normalized.includes('information_schema.tables')) {
        return {
          rows: [
            { table_name: 'operation_runs' },
            { table_name: 'operation_schedules' },
            { table_name: 'workflow_templates' },
            { table_name: 'workflow_runs' },
            { table_name: 'marketplace' },
            { table_name: 'action_tasks' },
            { table_name: 'alerts' },
            { table_name: 'rules_evaluation_applications' },
          ],
        };
      }
      if (
        normalized.includes('select count(*)') &&
        normalized.includes('from operation_runs') &&
        normalized.includes('where status in')
      ) {
        return {
          rows: [
            {
              active_operation_runs: String(fixtureRows.operation_runs_active),
            },
          ],
        };
      }
      if (normalized.includes('select count(*)') && normalized.includes('from operation_runs')) {
        return { rows: [{ count: String(fixtureRows.operation_runs) }] };
      }
      if (
        normalized.includes('select count(*)') &&
        normalized.includes('from operation_schedules')
      ) {
        return {
          rows: [{ count: String(fixtureRows.operation_schedules_enabled) }],
        };
      }
      if (
        normalized.includes('select count(*)') &&
        normalized.includes('from workflow_templates')
      ) {
        return { rows: [{ count: String(fixtureRows.workflow_templates) }] };
      }
      if (normalized.includes('select count(*)') && normalized.includes('from workflow_runs')) {
        return { rows: [{ count: String(fixtureRows.workflow_runs) }] };
      }
      if (normalized.includes('select count(*)') && normalized.includes('from marketplace')) {
        return { rows: [{ count: String(fixtureRows.marketplace) }] };
      }
      if (normalized.includes('select count(*)') && normalized.includes('from action_tasks')) {
        return { rows: [{ count: String(fixtureRows.action_tasks) }] };
      }
      if (normalized.includes('select count(*)') && normalized.includes('from alerts')) {
        return { rows: [{ count: String(fixtureRows.alerts_operation) }] };
      }
      if (
        normalized.includes('select count(*)') &&
        normalized.includes('from rules_evaluation_applications')
      ) {
        return {
          rows: [{ count: String(fixtureRows.rules_evaluation_applications) }],
        };
      }
      if (normalized.includes('select distinct operation_key')) {
        return { rows: [{ operationKey: 'inventory.refresh' }] };
      }
      if (normalized.includes('select distinct name')) {
        return { rows: [{ name: 'fixture workflow' }] };
      }
      throw new Error(`Unexpected fixture query: ${text}`);
    },
  };

  const report = await runPreflight({
    client,
    databaseUrl: 'postgresql://readonly.example/kiditem',
    deployedSha: 'deployed-sha',
    releaseOfficeSha: 'release-office-sha',
    now: new Date('2026-09-03T00:00:00.000Z'),
  });

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
  const client = {
    async query(text) {
      const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('begin') || normalized.startsWith('rollback')) {
        return { rows: [] };
      }
      if (normalized.includes('information_schema.tables')) {
        return {
          rows: [
            { table_name: 'operation_runs' },
            { table_name: 'operation_schedules' },
            { table_name: 'workflow_templates' },
            { table_name: 'workflow_runs' },
            { table_name: 'marketplace' },
            { table_name: 'action_tasks' },
            { table_name: 'alerts' },
          ],
        };
      }
      if (normalized.includes('from rules_evaluation_applications')) {
        throw new Error('optional table must not be queried when absent');
      }
      if (normalized.includes('select distinct operation_key')) return { rows: [] };
      if (normalized.includes('select distinct name')) return { rows: [] };
      return {
        rows: [
          {
            count: '0',
            active_operation_runs: '0',
          },
        ],
      };
    },
  };

  const report = await runPreflight({
    client,
    databaseUrl: 'postgresql://readonly.example/kiditem',
    deployedSha: 'deployed-sha',
    releaseOfficeSha: 'release-office-sha',
    now: new Date('2026-09-03T00:00:00.000Z'),
  });

  assert.equal(report.counts.rulesApplications, 0);
  assert.deepEqual(report.absentOptionalTables, ['rules_evaluation_applications']);
});
