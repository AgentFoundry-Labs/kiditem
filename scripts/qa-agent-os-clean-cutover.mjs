#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const databasePort = 5432;
const fixtureMarker = 'retired-agent-os-fixture';
const prismaUserConsentEnvironmentKey = 'PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION';
const browserQaSeedTargetEnvironmentKey = 'KIDITEM_BROWSER_QA_SEED_TARGET';
const browserQaEmailEnvironmentKey = 'KIDITEM_BROWSER_QA_EMAIL';
const browserQaWebUrl = 'http://127.0.0.1:3000';
const browserQaApiUrl = 'http://127.0.0.1:4000';

const INVOCATION_REPOSITORY_TEST_PATH =
  'src/agent-os/adapter/out/repository/prisma-capability-invocation.repository.spec.ts';
const INVOCATION_RACE_TEST_PATH =
  'src/agent-os/__tests__/capability-invocation-races.pg.integration.spec.ts';

export const GENERATED_DATABASE_MARKER = 'kiditem_agent_os_clean_cutover';
export const DEFAULT_DEVELOPMENT_DATABASE_NAMES = new Set([
  'kiditem',
  'kiditem_dev',
  'kiditem_development',
  'kiditem_local',
  'postgres',
]);
export const RETIRED_AGENT_OS_TABLES = Object.freeze([
  'agent_work_versions',
  'agent_work_sessions',
  'agent_work_tasks',
  'agent_attempts',
  'agent_capability_invocations',
  'agent_capability_approvals',
]);

export function createGeneratedDatabaseName(random = randomBytes) {
  return `${GENERATED_DATABASE_MARKER}_${random(8).toString('hex')}`;
}

export function assertSafeCleanCutoverArgs(args) {
  parseCleanCutoverArgs(args);
}

export function parseCleanCutoverArgs(args) {
  let serveBrowserQa = false;
  let browserQaEmail;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--force-reset' || arg.startsWith('--force-reset=')) {
      throw new Error('--force-reset is blocked by the isolated clean-cutover helper.');
    }
    if (arg === '--serve-browser-qa') {
      if (serveBrowserQa) throw new Error('--serve-browser-qa may be supplied only once.');
      serveBrowserQa = true;
      continue;
    }
    if (arg === '--email') {
      const email = args[index + 1];
      if (!email || email.startsWith('--')) throw new Error('--email requires a value.');
      browserQaEmail = email;
      index += 1;
      continue;
    }
    if (arg.startsWith('--email=')) {
      browserQaEmail = arg.slice('--email='.length);
      continue;
    }
    throw new Error(`Unsupported argument for the isolated clean-cutover helper: ${arg}`);
  }

  if (browserQaEmail !== undefined && !serveBrowserQa) {
    throw new Error('--email is supported only with --serve-browser-qa.');
  }

  return { serveBrowserQa, browserQaEmail };
}

export function assertIsolatedTestcontainerTarget({
  databaseUrl,
  containerHost,
  mappedPort,
  databaseName,
}) {
  const parsedUrl = parsePostgresUrl(databaseUrl);
  const expectedHost = normalizeHost(containerHost);
  const actualHost = normalizeHost(parsedUrl.hostname);
  const expectedPort = normalizeMappedPort(mappedPort);
  const actualPort = Number(parsedUrl.port || '5432');
  const actualDatabaseName = readDatabaseName(parsedUrl);

  assertNotDefaultDevelopmentDatabaseName(databaseName);
  assertNotDefaultDevelopmentDatabaseName(actualDatabaseName);
  assertGeneratedDatabaseName(databaseName);
  assertGeneratedDatabaseName(actualDatabaseName);

  if (isOfficeHost(expectedHost) || isOfficeHost(actualHost)) {
    throw new Error('Refusing Office host for the isolated clean-cutover database.');
  }
  if (actualHost !== expectedHost) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: host does not match the started container.');
  }
  if (actualPort !== expectedPort) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: port does not match the started container.');
  }
  if (actualDatabaseName !== databaseName) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: database does not match the generated container database.');
  }

  return {
    databaseUrl,
    databaseName,
    host: expectedHost,
    mappedPort: expectedPort,
  };
}

export async function runCleanCutover({ args = [], dependencies } = {}) {
  const options = parseCleanCutoverArgs(args);
  if (!dependencies) {
    throw new Error('Clean-cutover runtime dependencies are required.');
  }

  const { serveBrowserQa, browserQaEmail } = options;
  let browserQaSeedCommand;
  if (serveBrowserQa) {
    if (
      !dependencies.assertBrowserQaInteractiveStdin
      || !dependencies.assertBrowserQaEmailConfigured
      || !dependencies.createBrowserQaSeedCommand
    ) {
      throw new Error('Built-in browser-QA seed dependencies are required.');
    }
    await dependencies.assertBrowserQaInteractiveStdin();
    await dependencies.assertBrowserQaEmailConfigured({ email: browserQaEmail });
    browserQaSeedCommand = await dependencies.createBrowserQaSeedCommand({ email: browserQaEmail });
  }
  const databaseName = dependencies.createDatabaseName();
  let container;
  let browserQaChildren = [];

  try {
    container = await dependencies.startPostgres({ databaseName });
    const databaseUrl = container.getConnectionUri();
    const target = assertIsolatedTestcontainerTarget({
      databaseUrl,
      containerHost: container.getHost(),
      mappedPort: container.getMappedPort(databasePort),
      databaseName,
    });

    await dependencies.installLegacyFixture({
      databaseUrl: target.databaseUrl,
      retiredTables: RETIRED_AGENT_OS_TABLES,
    });
    await runScopedCommand(dependencies, {
      step: 'db-push',
      command: 'npm',
      args: ['run', 'db:push', '--', '--accept-data-loss'],
      databaseUrl: target.databaseUrl,
    });
    await runScopedCommand(dependencies, {
      step: 'prisma-generate',
      command: 'npx',
      args: ['prisma', 'generate'],
      databaseUrl: target.databaseUrl,
    });
    await runScopedCommand(dependencies, {
      step: 'shared-build',
      command: 'npm',
      args: ['run', 'build', '--workspace=packages/shared'],
      databaseUrl: target.databaseUrl,
    });
    await dependencies.assertCleanCutover({
      databaseUrl: target.databaseUrl,
      retiredTables: RETIRED_AGENT_OS_TABLES,
    });
    await dependencies.runInvocationTests({ databaseUrl: target.databaseUrl });

    if (!serveBrowserQa) {
      return { databaseName, mode: 'verify' };
    }

    await dependencies.seedBrowserQaBundle({
      databaseUrl: target.databaseUrl,
      target,
      seedCommand: browserQaSeedCommand,
    });
    await runScopedCommand(dependencies, {
      step: 'server-build',
      command: 'npm',
      args: ['run', 'build', '--workspace=apps/server'],
      databaseUrl: target.databaseUrl,
    });
    browserQaChildren = await dependencies.startBrowserQaStack({
      databaseUrl: target.databaseUrl,
    });
    dependencies.reportPublicUrls({
      webUrl: browserQaWebUrl,
      apiUrl: browserQaApiUrl,
    });
    await dependencies.waitForShutdown();
    return { databaseName, mode: 'serve-browser-qa' };
  } finally {
    if (browserQaChildren.length > 0) {
      await dependencies.stopBrowserQaStack(browserQaChildren);
    }
    if (container) {
      await container.stop();
    }
  }
}

export function createLegacyFixtureStatements() {
  return RETIRED_AGENT_OS_TABLES.flatMap((table, index) => {
    const quotedTable = quoteIdentifier(table);
    return [
      `CREATE TABLE ${quotedTable} (id text PRIMARY KEY, fixture_marker text NOT NULL)`,
      `INSERT INTO ${quotedTable} (id, fixture_marker) VALUES ('retired-${index + 1}', '${fixtureMarker}')`,
    ];
  });
}

export function createRuntimeDependencies({
  prismaUserConsent = process.env[prismaUserConsentEnvironmentKey],
  browserQaInput = process.stdin,
  browserQaEmail = process.env[browserQaEmailEnvironmentKey],
} = {}) {
  return {
    createDatabaseName,
    startPostgres,
    installLegacyFixture,
    runCommand: runScopedChildProcess,
    prismaUserConsent,
    assertCleanCutover,
    runInvocationTests,
    assertBrowserQaInteractiveStdin: () => assertBrowserQaInteractiveStdin(browserQaInput),
    assertBrowserQaEmailConfigured: ({ email }) => assertBrowserQaEmailConfigured(email ?? browserQaEmail),
    createBrowserQaSeedCommand,
    seedBrowserQaBundle: ({ databaseUrl, target, seedCommand }) => seedBrowserQaBundle({
      databaseUrl,
      target,
      command: seedCommand,
    }),
    startBrowserQaStack,
    stopBrowserQaStack,
    waitForShutdown,
    reportPublicUrls,
  };
}

async function startPostgres({ databaseName }) {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  return new PostgreSqlContainer('postgres:17')
    .withDatabase(databaseName)
    .withUsername('qa_agent_os')
    .withPassword(randomBytes(24).toString('base64url'))
    .start();
}

async function installLegacyFixture({ databaseUrl }) {
  await withPostgresClient(databaseUrl, async (client) => {
    for (const statement of createLegacyFixtureStatements()) {
      await client.query(statement);
    }
  });
}

async function assertCleanCutover({ databaseUrl, retiredTables }) {
  const namesToInspect = [
    ...retiredTables,
    'capability_invocations',
  ];
  const compatibilityPatterns = [
    ...retiredTables.flatMap((table) => [
      `${table}_%`,
      `legacy_${table}%`,
      `%_${table}`,
    ]),
    'capability_invocations_backup%',
    'capability_invocations_legacy%',
  ];

  await withPostgresClient(databaseUrl, async (client) => {
    const result = await client.query({
      text: `
        SELECT relation.relname AS name, relation.relkind AS kind
        FROM pg_catalog.pg_class AS relation
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND (
            relation.relname = ANY($1::text[])
            OR relation.relname LIKE ANY($2::text[])
          )
      `,
      values: [namesToInspect, compatibilityPatterns],
    });
    const capabilityInvocationTable = result.rows.find(
      (row) => row.name === 'capability_invocations' && ['r', 'p'].includes(row.kind),
    );
    if (!capabilityInvocationTable) {
      throw new Error('Clean-cutover verification failed: capability_invocations is not a physical table.');
    }

    const retiredRelations = result.rows.filter(
      (row) => row.name !== 'capability_invocations',
    );
    if (retiredRelations.length > 0) {
      throw new Error(
        'Clean-cutover verification failed: a retired Agent OS relation, compatibility view, or backup table remains.',
      );
    }
  });
}

async function runInvocationTests({ databaseUrl }) {
  const env = scopedDatabaseEnvironment(databaseUrl);
  await runScopedChildProcess({
    step: 'invocation-repository-tests',
    command: 'npm',
    args: [
      'exec',
      '--workspace=apps/server',
      'vitest',
      '--',
      'run',
      INVOCATION_REPOSITORY_TEST_PATH,
    ],
    env,
  });
  await runScopedChildProcess({
    step: 'invocation-race-tests',
    command: 'npm',
    args: [
      'run',
      'test:integration',
      '--workspace=apps/server',
      '--',
      INVOCATION_RACE_TEST_PATH,
    ],
    env,
  });
}

export function createBrowserQaSeedCommand({ email } = {}) {
  const args = ['run', 'seed:agent-os:browser-qa'];
  if (typeof email === 'string' && email.trim() !== '') {
    args.push('--', '--email', email);
  }
  return { command: 'npm', args };
}

export function assertBrowserQaInteractiveStdin(input = process.stdin) {
  if (!input?.isTTY) {
    throw new Error('--serve-browser-qa requires interactive stdin for the browser-QA password.');
  }
}

export function assertBrowserQaEmailConfigured(email) {
  if (typeof email !== 'string' || email.trim() === '') {
    throw new Error('--serve-browser-qa requires --email or KIDITEM_BROWSER_QA_EMAIL.');
  }
}

async function seedBrowserQaBundle({ databaseUrl, target, command }) {
  await runProcess(command.command, command.args, {
    env: createBrowserQaSeedEnvironment(databaseUrl, target),
    label: 'browser-QA deterministic seed',
  });
}

export function createBrowserQaChildSpecs(databaseUrl, baseEnvironment = process.env) {
  const environment = scopedDatabaseEnvironment(databaseUrl, undefined, baseEnvironment);
  const apiEnvironment = {
    ...environment,
    PORT: '4000',
    WEB_ORIGIN: browserQaWebUrl,
    CORS_ORIGINS: browserQaWebUrl,
    MCP_SDK_GENERATION: 'v2',
    MCP_PROTOCOL_NEGOTIATION: 'auto',
  };
  delete apiEnvironment.NEXT_PUBLIC_API_URL;

  const workerEnvironment = {
    ...environment,
    OPERATION_RUNTIME_WORKER_ENABLED: '1',
  };
  delete workerEnvironment.PORT;
  delete workerEnvironment.WEB_ORIGIN;
  delete workerEnvironment.CORS_ORIGINS;
  delete workerEnvironment.NEXT_PUBLIC_API_URL;
  delete workerEnvironment.MCP_SDK_GENERATION;
  delete workerEnvironment.MCP_PROTOCOL_NEGOTIATION;

  const webEnvironment = {
    ...environment,
    PORT: '3000',
    NEXT_PUBLIC_API_URL: browserQaApiUrl,
  };
  delete webEnvironment.WEB_ORIGIN;
  delete webEnvironment.CORS_ORIGINS;
  delete webEnvironment.MCP_SDK_GENERATION;
  delete webEnvironment.MCP_PROTOCOL_NEGOTIATION;

  return [
    {
      name: 'API',
      command: 'npm',
      args: ['run', 'start:prod', '--workspace=apps/server'],
      env: apiEnvironment,
    },
    {
      name: 'Operations worker',
      command: 'npm',
      args: ['run', 'start:worker:prod', '--workspace=apps/server'],
      env: workerEnvironment,
    },
    {
      name: 'Web',
      command: 'npm',
      args: ['run', 'dev', '--workspace=apps/web'],
      env: webEnvironment,
    },
  ];
}

async function startBrowserQaStack({ databaseUrl }) {
  const childSpecs = createBrowserQaChildSpecs(databaseUrl);
  const children = [];
  try {
    for (const childSpec of childSpecs) {
      children.push(startLongRunningProcess(childSpec.command, childSpec.args, childSpec));
    }
    return children;
  } catch (error) {
    await stopBrowserQaStack(children);
    throw error;
  }
}

async function stopBrowserQaStack(children) {
  await Promise.all(children.map(stopLongRunningProcess));
}

function waitForShutdown() {
  return new Promise((resolve) => {
    const handleSignal = () => {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      resolve();
    };
    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);
  });
}

function reportPublicUrls({ webUrl, apiUrl }) {
  console.log(`Browser QA Web URL: ${webUrl}`);
  console.log(`Browser QA API URL: ${apiUrl}`);
}

async function withPostgresClient(databaseUrl, action) {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    return await action(client);
  } finally {
    await client.end();
  }
}

function createDatabaseName() {
  return createGeneratedDatabaseName();
}

function scopedDatabaseEnvironment(databaseUrl, prismaUserConsent, baseEnvironment = process.env) {
  const environment = {
    ...baseEnvironment,
    DATABASE_URL: databaseUrl,
  };
  delete environment[prismaUserConsentEnvironmentKey];
  if (typeof prismaUserConsent === 'string' && prismaUserConsent !== '') {
    environment[prismaUserConsentEnvironmentKey] = prismaUserConsent;
  }
  return environment;
}

export function createBrowserQaSeedEnvironment(databaseUrl, target, baseEnvironment = process.env) {
  const environment = scopedDatabaseEnvironment(databaseUrl, undefined, baseEnvironment);
  environment[browserQaSeedTargetEnvironmentKey] = JSON.stringify({
    databaseName: target.databaseName,
    host: target.host,
    mappedPort: target.mappedPort,
  });
  return environment;
}

async function runScopedChildProcess({ command, args, env, step }) {
  await runProcess(command, args, {
    env,
    label: step,
  });
}

function runProcess(command, args, { env, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveExecutable(command), args, {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed${signal ? ` with signal ${signal}` : ` with exit code ${code ?? 1}`}.`));
    });
  });
}

function startLongRunningProcess(command, args, { env, label }) {
  return spawn(resolveExecutable(command), args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
}

async function stopLongRunningProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null || child.killed) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 10_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function resolveExecutable(command) {
  return process.platform === 'win32' && (command === 'npm' || command === 'npx')
    ? `${command}.cmd`
    : command;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function runScopedCommand(dependencies, { step, command, args, databaseUrl }) {
  await dependencies.runCommand({
    step,
    command,
    args,
    env: scopedDatabaseEnvironment(
      databaseUrl,
      step === 'db-push' ? dependencies.prismaUserConsent : undefined,
    ),
  });
}

function parsePostgresUrl(databaseUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: a PostgreSQL URL is required.');
  }
  if (parsedUrl.protocol !== 'postgresql:' && parsedUrl.protocol !== 'postgres:') {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: a PostgreSQL URL is required.');
  }
  return parsedUrl;
}

function normalizeHost(host) {
  if (typeof host !== 'string' || host.trim() === '') {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: started container host is required.');
  }
  return host.trim().replace(/^\[|\]$/g, '').toLowerCase();
}

function normalizeMappedPort(mappedPort) {
  const port = Number(mappedPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: started container mapped port is required.');
  }
  return port;
}

function readDatabaseName(parsedUrl) {
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  if (!databaseName || databaseName.includes('/')) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: exactly one database name is required.');
  }
  return databaseName;
}

function assertNotDefaultDevelopmentDatabaseName(databaseName) {
  if (DEFAULT_DEVELOPMENT_DATABASE_NAMES.has(databaseName.toLowerCase())) {
    throw new Error('Refusing default development database name for the isolated clean-cutover helper.');
  }
}

function assertGeneratedDatabaseName(databaseName) {
  const databaseNamePattern = new RegExp(`^${GENERATED_DATABASE_MARKER}_[a-f0-9]{16}$`);
  if (!databaseNamePattern.test(databaseName)) {
    throw new Error('Refusing database without the helper-generated marker.');
  }
}

function isOfficeHost(host) {
  return /(^|[.-])office([.-]|$)|kiditem.*office|office.*kiditem/i.test(host);
}

export async function main(args = process.argv.slice(2)) {
  assertSafeCleanCutoverArgs(args);
  return runCleanCutover({
    args,
    dependencies: createRuntimeDependencies(),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
