#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REQUIRED_TABLES = Object.freeze([
  'operation_runs',
  'operation_schedules',
  'workflow_templates',
  'workflow_runs',
  'marketplace',
  'action_tasks',
  'alerts',
  'rules_evaluation_applications',
]);

const MAX_IDENTITY_ITEMS = 100;
const MAX_IDENTITY_LENGTH = 256;
const ALLOWED_ARGUMENTS = new Set([
  'database-url',
  'deployed-sha',
  'release-office-sha',
]);

const PREFLIGHT_SQL = Object.freeze({
  tableNames: `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ANY($1::text[])
  `,
  operationRuns: `
    SELECT COUNT(*) AS count
    FROM operation_runs
  `,
  activeOperationRuns: `
    SELECT COUNT(*) AS active_operation_runs
    FROM operation_runs
    WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
  `,
  enabledSchedules: `
    SELECT COUNT(*) AS count
    FROM operation_schedules
    WHERE enabled = TRUE
  `,
  workflowTemplates: `
    SELECT COUNT(*) AS count
    FROM workflow_templates
  `,
  workflowRuns: `
    SELECT COUNT(*) AS count
    FROM workflow_runs
  `,
  marketplaceItems: `
    SELECT COUNT(*) AS count
    FROM marketplace
  `,
  actionTasks: `
    SELECT COUNT(*) AS count
    FROM action_tasks
  `,
  operationAlerts: `
    SELECT COUNT(*) AS count
    FROM alerts
    WHERE kind = 'operation'
  `,
  rulesApplications: `
    SELECT COUNT(*) AS count
    FROM rules_evaluation_applications
  `,
  activeOperationKeys: `
    SELECT DISTINCT operation_key AS "operationKey"
    FROM operation_runs
    WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
    ORDER BY operation_key
    LIMIT ${MAX_IDENTITY_ITEMS}
  `,
  enabledScheduleKeys: `
    SELECT DISTINCT operation_key AS "operationKey"
    FROM operation_schedules
    WHERE enabled = TRUE
    ORDER BY operation_key
    LIMIT ${MAX_IDENTITY_ITEMS}
  `,
  installedWorkflowNames: `
    SELECT DISTINCT name
    FROM workflow_templates
    ORDER BY name
    LIMIT ${MAX_IDENTITY_ITEMS}
  `,
});

const COUNT_FIELDS = Object.freeze([
  ['operationRuns', 'count'],
  ['activeOperationRuns', 'active_operation_runs'],
  ['enabledSchedules', 'count'],
  ['workflowTemplates', 'count'],
  ['workflowRuns', 'count'],
  ['marketplaceItems', 'count'],
  ['actionTasks', 'count'],
  ['operationAlerts', 'count'],
  ['rulesApplications', 'count'],
]);

export function buildPreflightSql() {
  return Object.values(PREFLIGHT_SQL).join('\n');
}

export function parsePostgresUrl(databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('--database-url is required.');
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl.trim());
  } catch {
    throw new Error('--database-url must be a valid PostgreSQL URL.');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('--database-url must be a PostgreSQL URL.');
  }
  if (!parsed.hostname || parsed.pathname.replace(/^\/+/, '') === '') {
    throw new Error('--database-url must include a PostgreSQL host and database.');
  }

  return parsed;
}

function normalizeIdentity(value, argumentName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`--${argumentName} is required.`);
  }

  const identity = value.trim();
  if (
    identity.length > 128
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(identity)
  ) {
    throw new Error(`--${argumentName} must be a bounded SHA identity.`);
  }
  return identity;
}

function readArgumentValue(argv, index, argumentName, inlineValue) {
  if (inlineValue !== undefined) {
    if (inlineValue === '') throw new Error(`--${argumentName} requires a value.`);
    return { value: inlineValue, nextIndex: index };
  }

  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`--${argumentName} requires a value.`);
  }
  return { value, nextIndex: index + 1 };
}

export function parseArgs(argv = []) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply' || argument.startsWith('--apply=')) {
      throw new Error('This preflight is read-only; --apply is not supported.');
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unsupported argument: ${argument}`);
    }

    const separator = argument.indexOf('=');
    const argumentName = argument.slice(2, separator === -1 ? undefined : separator);
    if (!ALLOWED_ARGUMENTS.has(argumentName)) {
      throw new Error(`Unsupported argument: --${argumentName}`);
    }
    if (Object.hasOwn(values, argumentName)) {
      throw new Error(`--${argumentName} may be supplied only once.`);
    }

    const inlineValue = separator === -1 ? undefined : argument.slice(separator + 1);
    const parsed = readArgumentValue(argv, index, argumentName, inlineValue);
    values[argumentName] = parsed.value;
    index = parsed.nextIndex;
  }

  const databaseUrl = parsePostgresUrl(values['database-url']).toString();
  const deployedSha = normalizeIdentity(values['deployed-sha'], 'deployed-sha');
  const releaseOfficeSha = normalizeIdentity(
    values['release-office-sha'],
    'release-office-sha',
  );

  return Object.freeze({ databaseUrl, deployedSha, releaseOfficeSha });
}

function readRows(result, queryName) {
  if (!result || !Array.isArray(result.rows)) {
    throw new Error(`Read-only preflight returned an invalid ${queryName} result.`);
  }
  return result.rows;
}

function parseCount(raw, queryName) {
  if (!['bigint', 'number', 'string'].includes(typeof raw)) {
    throw new Error(`Read-only preflight returned an invalid ${queryName} count.`);
  }
  if (typeof raw === 'bigint') {
    if (raw < 0n || raw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Read-only preflight returned an invalid ${queryName} count.`);
    }
    return Number(raw);
  }

  if (typeof raw === 'string' && raw.trim() === '') {
    throw new Error(`Read-only preflight returned an invalid ${queryName} count.`);
  }
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Read-only preflight returned an invalid ${queryName} count.`);
  }
  return count;
}

function readCount(rows, field, queryName) {
  const row = rows[0];
  if (!row) throw new Error(`Read-only preflight returned no ${queryName} count.`);
  const camelField = field.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
  const raw = row[field]
    ?? row[camelField]
    ?? (field === 'count' ? row.count : undefined);
  if (raw === undefined || raw === null) {
    throw new Error(`Read-only preflight returned no ${queryName} count.`);
  }
  return parseCount(raw, queryName);
}

function sanitizeIdentity(value) {
  if (typeof value !== 'string') return null;
  const sanitized = value
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, MAX_IDENTITY_LENGTH);
  return sanitized || null;
}

function readBoundedIdentities(rows, fields) {
  const values = [];
  const seen = new Set();
  for (const row of rows) {
    const raw = fields.map((field) => row?.[field]).find((value) => value !== undefined);
    const value = sanitizeIdentity(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
    if (values.length === MAX_IDENTITY_ITEMS) break;
  }
  return values;
}

async function queryRows(client, sql, parameters, queryName) {
  const result = parameters === undefined
    ? await client.query(sql)
    : await client.query(sql, parameters);
  return readRows(result, queryName);
}

function assertRequiredTables(rows) {
  const found = new Set(
    rows
      .map((row) => row?.table_name ?? row?.tableName)
      .filter((name) => typeof name === 'string'),
  );
  const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
  if (missing.length > 0) {
    throw new Error(`Read-only preflight stopped; required tables are missing: ${missing.join(', ')}.`);
  }
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Read-only preflight requires a PostgreSQL client.');
  }
}

export async function runPreflight({
  client,
  databaseUrl,
  deployedSha,
  releaseOfficeSha,
  now = new Date(),
} = {}) {
  assertClient(client);
  parsePostgresUrl(databaseUrl);
  const normalizedDeployedSha = normalizeIdentity(deployedSha, 'deployed-sha');
  const normalizedReleaseOfficeSha = normalizeIdentity(
    releaseOfficeSha,
    'release-office-sha',
  );
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('Read-only preflight requires a valid timestamp.');
  }

  let transactionStarted = false;
  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    transactionStarted = true;

    const tableRows = await queryRows(
      client,
      PREFLIGHT_SQL.tableNames,
      [REQUIRED_TABLES],
      'table-existence',
    );
    assertRequiredTables(tableRows);

    const countResults = {};
    for (const [reportKey, field] of COUNT_FIELDS) {
      const queryName = reportKey;
      const rows = await queryRows(
        client,
        PREFLIGHT_SQL[reportKey],
        undefined,
        queryName,
      );
      countResults[reportKey] = readCount(rows, field, queryName);
    }

    const activeOperationKeys = readBoundedIdentities(
      await queryRows(
        client,
        PREFLIGHT_SQL.activeOperationKeys,
        undefined,
        'active-operation-keys',
      ),
      ['operationKey', 'operation_key'],
    );
    const enabledScheduleKeys = readBoundedIdentities(
      await queryRows(
        client,
        PREFLIGHT_SQL.enabledScheduleKeys,
        undefined,
        'enabled-schedule-keys',
      ),
      ['operationKey', 'operation_key'],
    );
    const installedWorkflowNames = readBoundedIdentities(
      await queryRows(
        client,
        PREFLIGHT_SQL.installedWorkflowNames,
        undefined,
        'installed-workflow-names',
      ),
      ['name'],
    );

    return {
      generatedAt: now.toISOString(),
      deployedSha: normalizedDeployedSha,
      releaseOfficeSha: normalizedReleaseOfficeSha,
      counts: {
        operationRuns: countResults.operationRuns,
        activeOperationRuns: countResults.activeOperationRuns,
        enabledSchedules: countResults.enabledSchedules,
        workflowTemplates: countResults.workflowTemplates,
        workflowRuns: countResults.workflowRuns,
        marketplaceItems: countResults.marketplaceItems,
        actionTasks: countResults.actionTasks,
        operationAlerts: countResults.operationAlerts,
        rulesApplications: countResults.rulesApplications,
      },
      activeOperationKeys,
      enabledScheduleKeys,
      installedWorkflowNames,
    };
  } finally {
    if (transactionStarted) await client.query('ROLLBACK');
  }
}

async function createRuntimeClient(databaseUrl) {
  parsePostgresUrl(databaseUrl);
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : 'Unknown preflight error.';
  return message.replace(/(?:postgres(?:ql)?):\/\/[^\s'"`]+/gi, '[database URL redacted]');
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const client = await createRuntimeClient(options.databaseUrl);
  try {
    const report = await runPreflight({ client, ...options });
    console.log(JSON.stringify(report));
    return report;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
