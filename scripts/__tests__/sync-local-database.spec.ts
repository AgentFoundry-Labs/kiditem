import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertLocalDevelopmentDatabase } from '../_shared/local-development-database';
import { dataMigrations, retiredDataMigrations } from '../data-migrations/index';
import { checkLedgerSources, type LedgerRun } from '../data-migrations/ledger';
import {
  APPLY_DATA_MIGRATIONS_CONFIRMATION as RUNNER_CONFIRMATION,
  DATA_MIGRATIONS_SCHEMA_VERSION,
  FAIL_ON_SOURCE_DRIFT_ENV as RUNNER_FAIL_ON_SOURCE_DRIFT_ENV,
  dataMigrationRegistryStatus,
  migrationSourceIdentities,
} from '../run-data-migrations';
import {
  APPLY_DATA_MIGRATIONS_CONFIRMATION,
  FAIL_ON_SOURCE_DRIFT_ENV,
  LOCAL_SYNC_HELP,
  PRISMA_USER_CONSENT_ENV,
  backupFileName,
  classifyPendingMigrations,
  classifyPlannedDdl,
  compareReleaseVersions,
  createChildEnvironment,
  createCommandRunner,
  dockerUnavailableMessage,
  parseLocalSyncArgs,
  parseRunnerStatus,
  planLocalSync,
  resolvePostgresContainer,
  resolveRuntimeTools,
  runLocalSync,
  sourceDriftRefusedBySync,
  type LocalSyncCommand,
  type LocalSyncCommandResult,
  type LocalSyncDependencies,
  type LocalSyncOptions,
  type RegisteredMigration,
} from '../sync-local-database';

const repoRoot = path.resolve(__dirname, '..', '..');
const LOCAL_URL = 'postgresql://kiditem:kiditem@localhost:5433/kiditem';
const OPEN_TRAIN = '0.1.31';
const OLD_PRE = 'v0.1.30:003_earlier_pre_schema';
const OLD_POST = 'v0.1.30:005_earlier_post_schema';
const OPEN_PRE = 'v0.1.31:001_open_pre_schema';
const OPEN_POST = 'v0.1.31:002_open_post_schema';
const REGISTRY: readonly RegisteredMigration[] = [
  { id: OLD_PRE, releaseVersion: '0.1.30', phase: 'pre-schema' },
  { id: OLD_POST, releaseVersion: '0.1.30', phase: 'post-schema' },
  { id: OPEN_PRE, releaseVersion: OPEN_TRAIN, phase: 'pre-schema' },
  { id: OPEN_POST, releaseVersion: OPEN_TRAIN, phase: 'post-schema' },
];
const ALL_IDS = REGISTRY.map((migration) => migration.id);
const DESTRUCTIVE_SQL = [
  '-- AlterTable',
  'ALTER TABLE "alerts" DROP COLUMN "legacy_note",',
  'ADD COLUMN "dedupe_key" TEXT;',
  '',
  '-- DropTable',
  'DROP TABLE "retired_rows";',
  '',
].join('\n');
const ADDITIVE_SQL = '-- CreateIndex\nCREATE INDEX "alerts_kind_idx" ON "alerts"("kind");\n';
const EMPTY_SQL = '-- This is an empty migration.\n\n';
const OPTIONS: LocalSyncOptions = { dryRun: false, acceptDataLoss: false, noBackup: false };

type StatusFixture = {
  tableExists?: boolean;
  succeeded?: readonly string[];
  failed?: readonly string[];
  sourceDrift?: unknown;
};

type Scenario = {
  statuses?: readonly StatusFixture[];
  statusExitCode?: number;
  survey?: { exitCode: number; stdout?: string; stderr?: string };
  ddl?: string;
  dockerPs?: Partial<LocalSyncCommandResult>;
  dumpHeader?: string;
  dumpExitCode?: number;
  push?: Partial<LocalSyncCommandResult>;
};

function ok(stdout = '', stderr = ''): LocalSyncCommandResult {
  return { exitCode: 0, signal: null, stdout, stderr };
}

function statusReport(fixture: StatusFixture = {}): string {
  const tableExists = fixture.tableExists ?? true;
  const succeeded = fixture.succeeded ?? ALL_IDS;
  const runs = [
    ...succeeded.map((migrationId) => ({ migrationId, status: 'succeeded', affectedRows: 0 })),
    ...(fixture.failed ?? []).map((migrationId) => ({ migrationId, status: 'failed', affectedRows: 0 })),
    { migrationId: 'v0.1.21:001_unregistered_office_row', status: 'succeeded', affectedRows: 3 },
  ];
  return `${JSON.stringify({
    schemaVersion: 'kiditem.data-migrations.v1',
    releaseVersion: OPEN_TRAIN,
    migrations: REGISTRY.map(({ id, releaseVersion }) => ({ id, releaseVersion, name: id })),
    retiredMigrations: [],
    database: tableExists
      ? {
        tableExists: true,
        runs,
        ...(fixture.sourceDrift === undefined ? {} : { sourceDrift: fixture.sourceDrift }),
      }
      : { tableExists: false, runs: [] },
  }, null, 2)}\n`;
}

function surveyReport(blockers: unknown[] = [], pending: unknown[] = []): string {
  return `${JSON.stringify({ blockers, pending, clear: 4 }, null, 2)}\n`;
}

function createHarness(scenario: Scenario = {}, overrides: Partial<LocalSyncDependencies> = {}) {
  const commands: LocalSyncCommand[] = [];
  const lines: string[] = [];
  const files = new Map<string, Buffer>();
  const removed: string[] = [];
  const statuses = scenario.statuses ?? [{}];
  let statusCalls = 0;

  const run = async (command: LocalSyncCommand): Promise<LocalSyncCommandResult> => {
    commands.push(command);
    switch (command.step) {
      case 'status':
      case 'final-status': {
        const fixture = statuses[Math.min(statusCalls, statuses.length - 1)];
        statusCalls += 1;
        return { ...ok(statusReport(fixture)), exitCode: scenario.statusExitCode ?? 0 };
      }
      case 'survey': {
        const survey = scenario.survey ?? { exitCode: 0 };
        return {
          exitCode: survey.exitCode,
          signal: null,
          stdout: survey.stdout ?? (survey.exitCode === 2 ? '' : surveyReport()),
          stderr: survey.stderr ?? '',
        };
      }
      case 'ddl-preview':
        return ok(scenario.ddl ?? ADDITIVE_SQL);
      case 'find-container':
        return { ...ok('kiditem-postgres\n'), ...scenario.dockerPs };
      case 'backup-dump':
        files.set(command.stdoutFile ?? '', Buffer.from(`${scenario.dumpHeader ?? 'PGDMP'}`));
        return { ...ok(), exitCode: scenario.dumpExitCode ?? 0 };
      case 'db-push':
        return { ...ok('Your database is now in sync with your Prisma schema.'), ...scenario.push };
      default:
        return ok();
    }
  };

  const deps: LocalSyncDependencies = {
    platform: 'darwin',
    env: { DATABASE_URL: LOCAL_URL, PATH: '/usr/bin:/bin' },
    prismaUserConsent: undefined,
    repoRoot: '/repo',
    backupDirectory: '/repo/.data/db-backups',
    tools: { node: '/bin/node', tsxCli: '/repo/node_modules/tsx/dist/cli.mjs', prismaCli: '/repo/node_modules/prisma/build/index.js' },
    run,
    loadRegistry: async () => REGISTRY,
    makeDirectory: async () => {},
    readFileHead: async (file, bytes) => (files.get(file) ?? Buffer.alloc(0)).subarray(0, bytes),
    removeFile: async (file) => {
      removed.push(file);
      files.delete(file);
    },
    now: () => new Date('2026-09-17T05:49:12.345Z'),
    log: (line) => lines.push(line),
    warn: (line) => lines.push(line),
    ...overrides,
  };

  return {
    deps,
    commands,
    removed,
    output: () => lines.join('\n'),
    steps: () => commands.map((command) => command.step),
    command: (step: LocalSyncCommand['step']) => commands.find((command) => command.step === step),
    commandsFor: (step: LocalSyncCommand['step']) => commands.filter((command) => command.step === step),
  };
}

const PRE_SCHEMA_ARGS = [
  '/repo/node_modules/tsx/dist/cli.mjs',
  'scripts/run-data-migrations.ts',
  'up',
  '--target',
  'local',
  '--phase',
  'pre-schema',
  '--release-version',
  OPEN_TRAIN,
  '--confirm',
  'APPLY_DATA_MIGRATIONS',
];
const POST_SCHEMA_ARGS = [
  '/repo/node_modules/tsx/dist/cli.mjs',
  'scripts/run-data-migrations.ts',
  'up',
  '--target',
  'local',
  '--phase',
  'post-schema',
  '--confirm',
  'APPLY_DATA_MIGRATIONS',
];

describe('db:sync:local plan', () => {
  it('runs the open train\'s pre-schema migrations before the survey when the ledger table exists', () => {
    expect(planLocalSync({ ledgerTableExists: true, dryRun: false })).toEqual({
      steps: [
        'build-shared',
        'status',
        'pre-schema',
        'survey',
        'ddl-preview',
        'backup',
        'db-push',
        'generate',
        'post-schema',
        'final-status',
      ],
      preSchema: 'before-push',
    });
  });

  it('pushes a database without the ledger table first, then runs both phases', () => {
    expect(planLocalSync({ ledgerTableExists: false, dryRun: false })).toEqual({
      steps: [
        'build-shared',
        'status',
        'survey',
        'ddl-preview',
        'backup',
        'db-push',
        'generate',
        'pre-schema',
        'post-schema',
        'final-status',
      ],
      preSchema: 'after-push',
    });
  });

  it('keeps a dry run to the read-only steps', () => {
    for (const ledgerTableExists of [true, false]) {
      expect(planLocalSync({ ledgerTableExists, dryRun: true })).toEqual({
        steps: ['status', 'survey', 'ddl-preview'],
        preSchema: null,
      });
    }
  });
});

describe('pending migration classification', () => {
  const status = (pendingIds: string[], releaseVersion = OPEN_TRAIN) => ({
    releaseVersion,
    tableExists: true,
    registered: [
      ...REGISTRY.map(({ id, releaseVersion: release }) => ({ id, releaseVersion: release })),
      { id: 'v0.1.32:001_newer_pre_schema', releaseVersion: '0.1.32' },
      { id: 'vX:001_unreadable_release', releaseVersion: 'not-a-version' },
      { id: 'v0.1.29:001_unknown_phase', releaseVersion: '0.1.29' },
    ],
    pendingIds,
    failedIds: [],
    sourceDrift: [],
  });
  const registry: RegisteredMigration[] = [
    ...REGISTRY,
    { id: 'v0.1.32:001_newer_pre_schema', releaseVersion: '0.1.32', phase: 'pre-schema' },
    { id: 'vX:001_unreadable_release', releaseVersion: 'not-a-version', phase: 'pre-schema' },
  ];

  it('treats only an earlier release\'s pre-schema migration as not applicable', () => {
    expect(classifyPendingMigrations(status([...ALL_IDS]), registry)).toEqual({
      toApply: [OLD_POST, OPEN_PRE, OPEN_POST],
      notApplicable: [OLD_PRE],
    });
  });

  it('applies anything whose phase or release it cannot place', () => {
    expect(classifyPendingMigrations(status([
      'v0.1.32:001_newer_pre_schema',
      'vX:001_unreadable_release',
      'v0.1.29:001_unknown_phase',
    ]), registry)).toEqual({
      toApply: ['v0.1.32:001_newer_pre_schema', 'vX:001_unreadable_release', 'v0.1.29:001_unknown_phase'],
      notApplicable: [],
    });
    expect(classifyPendingMigrations(status([OLD_PRE], 'unreadable'), registry)).toEqual({
      toApply: [OLD_PRE],
      notApplicable: [],
    });
  });

  it('compares release versions numerically', () => {
    expect(compareReleaseVersions('0.1.9', '0.1.31')).toBe(-1);
    expect(compareReleaseVersions('0.1.31', '0.1.31')).toBe(0);
    expect(compareReleaseVersions('0.2.0', '0.1.31')).toBe(1);
    expect(compareReleaseVersions('0.1.31-rc.1', '0.1.31')).toBe(0);
    expect(compareReleaseVersions('v0.1.31', '0.1.31')).toBeNull();
  });
});

describe('db:sync:local orchestration', () => {
  it('applies an existing database in the cutover order', async () => {
    const harness = createHarness({
      statuses: [{ succeeded: [OLD_PRE, OLD_POST] }, {}],
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'applied' });
    expect(harness.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'db-push',
      'generate',
      'post-schema',
      'final-status',
    ]);
    expect(harness.command('build-shared')).toMatchObject({
      command: 'npm',
      args: ['exec', '--no', '--workspace=packages/shared', 'tsup', '--', '--no-dts', '--no-clean'],
    });
    expect(harness.command('status')?.args).toEqual([
      '/repo/node_modules/tsx/dist/cli.mjs',
      'scripts/run-data-migrations.ts',
      'status',
    ]);
    expect(harness.command('pre-schema')?.args).toEqual(PRE_SCHEMA_ARGS);
    expect(harness.command('survey')?.args).toEqual(['scripts/check-cutover-data-blockers.mjs', '--json']);
    expect(harness.command('ddl-preview')?.args).toEqual([
      '/repo/node_modules/prisma/build/index.js',
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma',
      '--script',
    ]);
    expect(harness.command('db-push')?.args).toEqual(['scripts/safe-prisma-db-push.mjs']);
    expect(harness.command('generate')?.args).toEqual(['/repo/node_modules/prisma/build/index.js', 'generate']);
    expect(harness.command('post-schema')?.args).toEqual(POST_SCHEMA_ARGS);
    for (const command of harness.commands) {
      expect(command.args.some((arg) => arg.startsWith('--force-reset'))).toBe(false);
      expect(command.env.DATABASE_URL).toBe(LOCAL_URL);
    }
    expect(harness.output()).toContain('4 registered: 2 succeeded, 2 to apply, 0 not applicable');
    expect(harness.output()).toContain(`to apply: ${OPEN_PRE}, ${OPEN_POST}`);
    expect(harness.output()).toContain('Result: synced.');
  });

  it('pushes a database without the ledger table, then runs the open train\'s pre-schema and every post-schema migration', async () => {
    const harness = createHarness({
      statuses: [{ tableExists: false }, { succeeded: [OLD_POST, OPEN_PRE, OPEN_POST] }],
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'applied' });
    expect(harness.steps()).toEqual([
      'build-shared',
      'status',
      'survey',
      'ddl-preview',
      'db-push',
      'generate',
      'pre-schema',
      'post-schema',
      'final-status',
    ]);
    expect(harness.command('pre-schema')?.args).toEqual(PRE_SCHEMA_ARGS);
    expect(harness.command('post-schema')?.args).toEqual(POST_SCHEMA_ARGS);
    const output = harness.output();
    expect(output).toContain('data_migration_runs is missing. 4 registered: 0 succeeded, 3 to apply, 1 not applicable');
    expect(output).toContain(`not applicable to this database: ${OLD_PRE}`);
    expect(output).toContain(`belong to releases before ${OPEN_TRAIN} and never ran here`);
    expect(output).toContain('Result: synced.');
  });

  it('treats a database with an empty ledger like any existing database', async () => {
    const harness = createHarness({
      statuses: [{ succeeded: [] }, { succeeded: [OLD_POST, OPEN_PRE, OPEN_POST] }],
      ddl: EMPTY_SQL,
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'applied' });
    expect(harness.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'generate',
      'post-schema',
      'final-status',
    ]);
  });

  it('changes nothing on a second run, even with not-applicable migrations pending', async () => {
    const harness = createHarness({
      statuses: [{ succeeded: [OLD_POST, OPEN_PRE, OPEN_POST] }],
      ddl: EMPTY_SQL,
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'in-sync' });
    expect(harness.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'generate',
      'post-schema',
      'final-status',
    ]);
    expect(harness.output()).toContain('db push skipped');
    expect(harness.output()).toContain('Result: already in sync.');
  });

  it.each([
    ['an open-train pre-schema migration', OPEN_PRE],
    ['an open-train post-schema migration', OPEN_POST],
    ['an earlier release\'s post-schema migration', OLD_POST],
  ])('fails when %s is still pending after the run', async (_label, stillPending) => {
    const harness = createHarness({
      statuses: [{}, { succeeded: ALL_IDS.filter((id) => id !== stillPending && id !== OLD_PRE) }],
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 2, state: 'failed' });
    expect(harness.output()).toContain(`Migrations this command must apply are still pending: ${stillPending}.`);
  });

  it('retries a failed open-train migration and says so', async () => {
    const harness = createHarness({
      statuses: [{ succeeded: [OLD_PRE, OLD_POST, OPEN_POST], failed: [OPEN_PRE] }, {}],
    });

    await runLocalSync(OPTIONS, harness.deps);

    expect(harness.output()).toContain(`recorded as failed or interrupted (they run again): ${OPEN_PRE}`);
  });

  it('stops before the push when the DDL is destructive and --accept-data-loss is missing', async () => {
    const harness = createHarness({ ddl: DESTRUCTIVE_SQL });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(harness.steps()).toEqual(['build-shared', 'status', 'pre-schema', 'survey', 'ddl-preview']);
    expect(harness.output()).toContain('DESTRUCTIVE ALTER TABLE "alerts" DROP COLUMN "legacy_note", ADD COLUMN "dedupe_key" TEXT');
    expect(harness.output()).toContain('DESTRUCTIVE DROP TABLE "retired_rows"');
    expect(harness.output()).toContain('npm run db:sync:local -- --accept-data-loss');
  });

  it('warns that skipped earlier pre-schema migrations may leave rows in what a destructive change drops', async () => {
    const harness = createHarness({
      ddl: DESTRUCTIVE_SQL,
      statuses: [{ succeeded: [OLD_POST, OPEN_PRE, OPEN_POST] }],
    });

    await runLocalSync(OPTIONS, harness.deps);

    expect(harness.output()).toContain('rows they would have moved may sit in what this change drops');
  });

  it('writes and checks a backup before an accepted destructive push', async () => {
    const harness = createHarness({ ddl: DESTRUCTIVE_SQL });

    const outcome = await runLocalSync({ ...OPTIONS, acceptDataLoss: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'applied' });
    expect(harness.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'find-container',
      'backup-dump',
      'db-push',
      'generate',
      'post-schema',
      'final-status',
    ]);
    expect(outcome.steps).toContain('backup');
    expect(harness.command('find-container')).toMatchObject({
      command: 'docker',
      args: ['ps', '--filter', 'publish=5433', '--format', '{{.Names}}'],
    });
    const dump = harness.command('backup-dump');
    expect(dump?.command).toBe('docker');
    expect(dump?.args.slice(0, 4)).toEqual(['exec', 'kiditem-postgres', 'sh', '-c']);
    expect(dump?.args[4]).toContain('pg_dump --format=custom --no-password --dbname="$1"');
    expect(dump?.args.slice(5)).toEqual(['sh', 'kiditem']);
    expect(dump?.stdoutFile).toBe('/repo/.data/db-backups/kiditem-20260917T054912Z.dump');
    expect(harness.command('db-push')?.args).toEqual(['scripts/safe-prisma-db-push.mjs', '--accept-data-loss']);
    expect(harness.output()).toContain('wrote .data/db-backups/kiditem-20260917T054912Z.dump (container kiditem-postgres)');
  });

  it('skips the backup with --no-backup but still passes the data-loss flag', async () => {
    const harness = createHarness({ ddl: DESTRUCTIVE_SQL });

    const outcome = await runLocalSync(
      { ...OPTIONS, acceptDataLoss: true, noBackup: true },
      harness.deps,
    );

    expect(outcome.exitCode).toBe(0);
    expect(harness.commandsFor('find-container')).toEqual([]);
    expect(harness.commandsFor('backup-dump')).toEqual([]);
    expect(harness.command('db-push')?.args).toContain('--accept-data-loss');
    expect(harness.output()).toContain('Backup skipped (--no-backup)');
  });

  it('removes a backup that is not a pg_dump archive and does not push', async () => {
    const harness = createHarness({ ddl: DESTRUCTIVE_SQL, dumpHeader: 'ERROR' });

    const outcome = await runLocalSync({ ...OPTIONS, acceptDataLoss: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 2, state: 'failed' });
    expect(harness.removed).toEqual(['/repo/.data/db-backups/kiditem-20260917T054912Z.dump']);
    expect(harness.commandsFor('db-push')).toEqual([]);
    expect(harness.output()).toContain('not a pg_dump custom-format archive');
  });

  it('removes a partial backup when pg_dump fails and does not push', async () => {
    const harness = createHarness({ ddl: DESTRUCTIVE_SQL, dumpExitCode: 1 });

    const outcome = await runLocalSync({ ...OPTIONS, acceptDataLoss: true }, harness.deps);

    expect(outcome.exitCode).toBe(2);
    expect(harness.removed).toHaveLength(1);
    expect(harness.commandsFor('db-push')).toEqual([]);
    expect(harness.output()).toContain('pg_dump in container kiditem-postgres failed (exit 1)');
  });

  it('stops with 1 on survey blockers, after pre-schema and before the DDL preview', async () => {
    const harness = createHarness({
      survey: {
        exitCode: 1,
        stdout: surveyReport(
          [
            { kind: 'not-null', table: 'naver_keyword_daily_snapshots', column: 'ingestion_run_id', rows: 116 },
            { kind: 'unique', table: 'organizations', columns: ['slug'], name: 'organizations_slug_key', groups: 1, rows: 2 },
          ],
          [{ kind: 'unique', table: 'alerts', columns: ['organization_id', 'dedupe_key'], name: 'alerts_key', missing: ['dedupe_key'] }],
        ),
      },
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(harness.steps()).toEqual(['build-shared', 'status', 'pre-schema', 'survey']);
    const output = harness.output();
    expect(output).toContain('BLOCKER not-null naver_keyword_daily_snapshots.ingestion_run_id: 116 existing row(s)');
    expect(output).toContain('BLOCKER unique   organizations(slug): 1 duplicate group(s) across 2 row(s) (organizations_slug_key)');
    expect(output).toContain('PENDING unique   alerts(organization_id, dedupe_key): needs a backfill decision for new column(s) dedupe_key');
    expect(output).toContain('Do not delete them by hand');
    expect(output).toContain('KID-239');
  });

  it('stops with 2 when the survey itself fails', async () => {
    const harness = createHarness({
      survey: { exitCode: 2, stderr: 'connect ECONNREFUSED 127.0.0.1:5433' },
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 2, state: 'failed' });
    expect(harness.steps()).toEqual(['build-shared', 'status', 'pre-schema', 'survey']);
    expect(harness.output()).toContain('The cutover survey failed (exit 2).');
    expect(harness.output()).toContain('ECONNREFUSED');
  });

  it('treats a survey whose exit code contradicts its report as an error', async () => {
    const harness = createHarness({ survey: { exitCode: 1, stdout: surveyReport() } });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome.exitCode).toBe(2);
    expect(harness.commandsFor('ddl-preview')).toEqual([]);
  });

  it('stops with 2 when a data-migration phase fails, before the survey', async () => {
    const harness = createHarness();
    const fakeRun = harness.deps.run;
    const deps: LocalSyncDependencies = {
      ...harness.deps,
      run: async (command) => (command.step === 'pre-schema'
        ? { exitCode: 1, signal: null, stdout: '', stderr: 'migration exploded' }
        : fakeRun(command)),
    };

    const outcome = await runLocalSync(OPTIONS, deps);

    expect(outcome.exitCode).toBe(2);
    expect(harness.steps()).toEqual(['build-shared', 'status']);
    expect(harness.output()).toContain(
      `data:migrate up --phase pre-schema --release-version ${OPEN_TRAIN} failed (exit 1)`,
    );
  });

  it('stops with 2 when the registry cannot be loaded', async () => {
    const harness = createHarness({}, {
      loadRegistry: async () => {
        throw new Error('Cannot find module \'@kiditem/shared/product-abc\'');
      },
    });

    const outcome = await runLocalSync({ ...OPTIONS, dryRun: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 2, state: 'failed', steps: ['status'] });
    expect(harness.output()).toContain('Could not load the data-migration registry');
    expect(harness.output()).toContain('npm run build --workspace=packages/shared');
  });
});

describe('db:sync:local target guard', () => {
  it.each([
    ['a remote host', 'postgresql://kiditem:kiditem@db.example.com:5432/kiditem'],
    ['a production-looking name', 'postgresql://kiditem:kiditem@localhost:5433/kiditem_production'],
    ['a host override in the query', 'postgresql://kiditem:kiditem@localhost:5433/kiditem?host=db.example.com'],
    ['a database override in the query', 'postgresql://kiditem:kiditem@localhost:5433/kiditem?database=office'],
    ['a non-PostgreSQL URL', 'mysql://kiditem:kiditem@localhost:3306/kiditem'],
    ['an invalid URL', 'not a url'],
  ])('refuses %s before running anything', async (_label, databaseUrl) => {
    const harness = createHarness({}, { env: { DATABASE_URL: databaseUrl } });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 2, state: 'failed', steps: [] });
    expect(harness.commands).toEqual([]);
    expect(harness.output()).toMatch(/Refusing non-local/);
    expect(harness.output()).not.toContain('kiditem:kiditem');
  });

  it('refuses a missing DATABASE_URL and Windows before running anything', async () => {
    const missing = createHarness({}, { env: {} });
    await expect(runLocalSync(OPTIONS, missing.deps)).resolves.toMatchObject({ exitCode: 2 });
    expect(missing.commands).toEqual([]);
    expect(missing.output()).toContain('DATABASE_URL is required');

    const windows = createHarness({}, { platform: 'win32' });
    await expect(runLocalSync(OPTIONS, windows.deps)).resolves.toMatchObject({ exitCode: 2 });
    expect(windows.commands).toEqual([]);
    expect(windows.output()).toContain('macOS local development');
  });

  it('keeps the shared guard strict for every local-database script', () => {
    expect(assertLocalDevelopmentDatabase('postgresql://kiditem:kiditem@[::1]:5433/kiditem?schema=public').hostname)
      .toBe('[::1]');
    expect(() => assertLocalDevelopmentDatabase('postgresql://kiditem:kiditem@localhost:5433/kiditem?hostaddr=10.0.0.5'))
      .toThrow(/non-local database: DATABASE_URL overrides the connection with hostaddr/);
    expect(() => assertLocalDevelopmentDatabase('postgresql://kiditem:kiditem@localhost:5433/kiditem?PORT=5432'))
      .toThrow(/overrides the connection with PORT/);
  });
});

describe('db:sync:local dry run', () => {
  it('reports in sync after reading only status, survey and DDL', async () => {
    const harness = createHarness({ ddl: EMPTY_SQL });

    const outcome = await runLocalSync({ ...OPTIONS, dryRun: true }, harness.deps);

    expect(outcome).toEqual({ exitCode: 0, state: 'in-sync', steps: ['status', 'survey', 'ddl-preview'] });
    expect(harness.steps()).toEqual(['status', 'survey', 'ddl-preview']);
    expect(harness.output()).toContain('--dry-run (read-only)');
    expect(harness.output()).toContain('before any pre-schema migration');
    expect(harness.output()).toContain('Result: in sync. Nothing to apply.');
  });

  it('still reports in sync when only not-applicable migrations are pending', async () => {
    const harness = createHarness({
      ddl: EMPTY_SQL,
      statuses: [{ succeeded: [OLD_POST, OPEN_PRE, OPEN_POST] }],
    });

    const outcome = await runLocalSync({ ...OPTIONS, dryRun: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'in-sync' });
    expect(harness.output()).toContain(`not applicable to this database: ${OLD_PRE}`);
  });

  it('reports what the real run would apply without applying it', async () => {
    const harness = createHarness({ statuses: [{ succeeded: [] }] });

    const outcome = await runLocalSync({ ...OPTIONS, dryRun: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'would-apply' });
    expect(harness.steps()).toEqual(['status', 'survey', 'ddl-preview']);
    expect(harness.output()).toContain('would apply 3 pending migration(s) and 1 DDL statement(s)');
  });

  it('exits 1 when the real run would stop, and still previews the DDL after survey findings', async () => {
    const harness = createHarness({
      ddl: DESTRUCTIVE_SQL,
      survey: {
        exitCode: 1,
        stdout: surveyReport([{ kind: 'not-null', table: 'alerts', column: 'dedupe_key', rows: 3 }]),
      },
    });

    const outcome = await runLocalSync({ ...OPTIONS, dryRun: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(harness.steps()).toEqual(['status', 'survey', 'ddl-preview']);
    expect(harness.output()).toContain(
      'would stop at survey findings (listed above) and destructive DDL without --accept-data-loss',
    );
  });

  it('says when db push may still stop for a Prisma warning', async () => {
    const harness = createHarness({
      ddl: 'CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");\n',
    });

    const outcome = await runLocalSync({ ...OPTIONS, dryRun: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'would-apply' });
    expect(harness.output()).toContain('1 statement(s) add a unique index or primary key to an existing table.');
    expect(harness.output()).toContain('db push may still stop for --accept-data-loss');
  });

  it('notes the backup an accepted destructive run would write', async () => {
    const harness = createHarness({ ddl: DESTRUCTIVE_SQL });

    const outcome = await runLocalSync({ ...OPTIONS, dryRun: true, acceptDataLoss: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 0, state: 'would-apply' });
    expect(harness.commandsFor('find-container')).toEqual([]);
    expect(harness.output()).toContain('after writing a backup to .data/db-backups/');
  });

  it('points at the shared build when status cannot load', async () => {
    const harness = createHarness({ statusExitCode: 1 });

    const outcome = await runLocalSync({ ...OPTIONS, dryRun: true }, harness.deps);

    expect(outcome.exitCode).toBe(2);
    expect(harness.output()).toContain('npm run build --workspace=packages/shared');
  });
});

describe('db:sync:local Prisma consent', () => {
  it('forwards externally supplied consent only to the db push child', async () => {
    const consent = 'yes, push the local schema with data loss';
    const harness = createHarness(
      { ddl: DESTRUCTIVE_SQL },
      {
        prismaUserConsent: consent,
        env: {
          DATABASE_URL: LOCAL_URL,
          [PRISMA_USER_CONSENT_ENV]: 'ambient approval that must not leak',
        },
      },
    );

    const outcome = await runLocalSync({ ...OPTIONS, acceptDataLoss: true }, harness.deps);

    expect(outcome.exitCode).toBe(0);
    const pushes = harness.commandsFor('db-push');
    expect(pushes).toHaveLength(1);
    expect(pushes[0].env[PRISMA_USER_CONSENT_ENV]).toBe(consent);
    const others = harness.commands.filter((command) => command.step !== 'db-push');
    expect(others.length).toBeGreaterThan(0);
    for (const command of others) {
      expect(command.env[PRISMA_USER_CONSENT_ENV]).toBeUndefined();
    }
    expect(harness.output()).not.toContain(consent);
  });

  it('does not let ambient consent reach any child when the caller supplied none', async () => {
    const harness = createHarness(
      { ddl: DESTRUCTIVE_SQL },
      {
        prismaUserConsent: undefined,
        env: {
          DATABASE_URL: LOCAL_URL,
          [PRISMA_USER_CONSENT_ENV]: 'ambient approval that must not leak',
        },
      },
    );

    await runLocalSync({ ...OPTIONS, acceptDataLoss: true }, harness.deps);

    expect(harness.command('db-push')?.env[PRISMA_USER_CONSENT_ENV]).toBe('');
    for (const command of harness.commands) {
      expect(command.env[PRISMA_USER_CONSENT_ENV] ?? '').toBe('');
    }
  });

  it('exits 1 and asks the caller for the exact consent text when Prisma refuses', async () => {
    const harness = createHarness({
      ddl: DESTRUCTIVE_SQL,
      push: {
        exitCode: 1,
        stderr: [
          'Error: Prisma Migrate detected that it was invoked by Claude Code.',
          `If the user explicitly consents, you may rerun this command with the ${PRISMA_USER_CONSENT_ENV} environment variable`,
        ].join('\n'),
      },
    });

    const outcome = await runLocalSync({ ...OPTIONS, acceptDataLoss: true }, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(harness.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'find-container',
      'backup-dump',
      'db-push',
    ]);
    const output = harness.output();
    expect(output).toContain(`must set ${PRISMA_USER_CONSENT_ENV} to the user's exact consent text`);
    expect(output).toContain('never creates that value');
    expect(output).toContain('Nothing was pushed.');
  });

  it('exits 1 when Prisma reports data-loss warnings the preview did not classify', async () => {
    const harness = createHarness({
      push: {
        exitCode: 1,
        stdout: 'There might be data loss when applying the changes:\n  A unique constraint covering the columns `[slug]` on the table `organizations` will be added.',
        stderr: 'Error: Use the --accept-data-loss flag to ignore the data loss warnings like prisma db push --accept-data-loss',
      },
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(harness.commandsFor('generate')).toEqual([]);
    expect(harness.output()).toContain('rerun with --accept-data-loss');
  });

  it('exits 2 on any other db push failure', async () => {
    const harness = createHarness({
      push: { exitCode: 1, stderr: 'Error: P1001 Can\'t reach database server' },
    });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toMatchObject({ exitCode: 2, state: 'failed' });
    expect(harness.output()).toContain('db push failed (exit 1).');
  });
});

describe('db:sync:local Docker backup target', () => {
  it('needs exactly one container publishing the database port', () => {
    expect(resolvePostgresContainer('kiditem-postgres\n', '5433')).toBe('kiditem-postgres');
    expect(() => resolvePostgresContainer('\n', '5433')).toThrow(
      'No running Docker container publishes port 5433, so the automatic backup cannot run.',
    );
    expect(() => resolvePostgresContainer('kiditem-postgres\nkiditem-qa-pg\n', '5433')).toThrow(
      '2 running Docker containers publish port 5433 (kiditem-postgres, kiditem-qa-pg)',
    );
  });

  it('stops before the push when no container publishes the port', async () => {
    const harness = createHarness({ ddl: DESTRUCTIVE_SQL, dockerPs: { stdout: '' } });

    const outcome = await runLocalSync({ ...OPTIONS, acceptDataLoss: true }, harness.deps);

    expect(outcome.exitCode).toBe(2);
    expect(harness.commandsFor('db-push')).toEqual([]);
    expect(harness.output()).toContain('rerun with --no-backup');
  });

  it('explains a missing docker CLI, without pushing', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'kiditem-sync-no-docker-'));
    try {
      const realRunner = createCommandRunner(workspace);
      const harness = createHarness({ ddl: DESTRUCTIVE_SQL });
      const fakeRun = harness.deps.run;
      const deps: LocalSyncDependencies = {
        ...harness.deps,
        // PATH names only an empty directory, so the real spawn finds no docker.
        env: { DATABASE_URL: LOCAL_URL, PATH: workspace },
        run: (command) => (command.command === 'docker' ? realRunner(command) : fakeRun(command)),
      };

      const outcome = await runLocalSync({ ...OPTIONS, acceptDataLoss: true }, deps);

      expect(outcome).toMatchObject({ exitCode: 2, state: 'failed' });
      expect(harness.steps()).not.toContain('db-push');
      expect(harness.output()).toContain(
        'The automatic backup needs the Docker CLI, but `docker` was not found on PATH.',
      );
      expect(harness.output()).toContain('take your own backup and rerun with --no-backup');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('explains a docker daemon that is not running', () => {
    expect(dockerUnavailableMessage({
      exitCode: 1,
      signal: null,
      stdout: '',
      stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n',
    })).toBe(
      '`docker ps` failed (exit 1): Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?. Start Docker Desktop, or take your own backup and rerun with --no-backup.',
    );
  });

  it('names backups by database and UTC second', () => {
    expect(backupFileName('kiditem', new Date('2026-01-02T03:04:05.678Z'))).toBe('kiditem-20260102T030405Z.dump');
  });
});

describe('classifyPlannedDdl', () => {
  it('treats Prisma\'s empty migration as empty', () => {
    const empty = { empty: true, statements: [], destructive: [], warned: [] };
    expect(classifyPlannedDdl(EMPTY_SQL)).toEqual(empty);
    expect(classifyPlannedDdl('')).toEqual(empty);
  });

  it('marks unique indexes and primary keys on existing tables as Prisma warnings, not as destructive', () => {
    const ddl = classifyPlannedDdl([
      '-- CreateTable',
      'CREATE TABLE "new_rows" ("id" UUID NOT NULL, CONSTRAINT "new_rows_pkey" PRIMARY KEY ("id"));',
      '-- CreateIndex',
      'CREATE UNIQUE INDEX "new_rows_id_key" ON "new_rows"("id");',
      '-- CreateIndex',
      'CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");',
      '-- AlterTable',
      'ALTER TABLE "alerts" DROP CONSTRAINT "alerts_pkey",',
      'ADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id", "organization_id");',
      '-- AddForeignKey',
      'ALTER TABLE "new_rows" ADD CONSTRAINT "new_rows_fkey" FOREIGN KEY ("id") REFERENCES "alerts"("id");',
      '',
    ].join('\n'));

    expect(ddl.destructive).toEqual([]);
    expect(ddl.warned).toEqual([
      'CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug")',
      'ALTER TABLE "alerts" DROP CONSTRAINT "alerts_pkey",\nADD CONSTRAINT "alerts_pkey" PRIMARY KEY ("id", "organization_id")',
    ]);
  });

  it('flags dropped tables, dropped columns and type changes', () => {
    const ddl = classifyPlannedDdl([
      '-- DropTable',
      'DROP TABLE "a";',
      '-- AlterTable',
      'ALTER TABLE "b" ADD COLUMN "c" TEXT,',
      'DROP COLUMN "d";',
      '-- AlterTable',
      'ALTER TABLE "e" ALTER COLUMN "f" SET DATA TYPE BIGINT;',
      '',
    ].join('\n'));

    expect(ddl.empty).toBe(false);
    expect(ddl.statements).toHaveLength(3);
    expect(ddl.destructive).toEqual([
      'DROP TABLE "a"',
      'ALTER TABLE "b" ADD COLUMN "c" TEXT,\nDROP COLUMN "d"',
      'ALTER TABLE "e" ALTER COLUMN "f" SET DATA TYPE BIGINT',
    ]);
  });

  it('does not flag additive or constraint-only changes, or comments', () => {
    const ddl = classifyPlannedDdl([
      '-- DropTable is only a heading here',
      '-- DropForeignKey',
      'ALTER TABLE "a" DROP CONSTRAINT "a_b_fkey";',
      '-- DropIndex',
      'DROP INDEX "a_c_idx";',
      '-- AlterTable',
      'ALTER TABLE "a" ALTER COLUMN "d" DROP NOT NULL,',
      'ALTER COLUMN "e" DROP DEFAULT;',
      '-- CreateTable',
      'CREATE TABLE "f" ("id" UUID NOT NULL, CONSTRAINT "f_pkey" PRIMARY KEY ("id"));',
      '-- CreateIndex',
      'CREATE UNIQUE INDEX "f_id_key" ON "f"("id") WHERE ("id" IS NOT NULL);',
      '',
    ].join('\n'));

    expect(ddl.statements).toHaveLength(5);
    expect(ddl.destructive).toEqual([]);
    expect(ddl.warned).toEqual([]);
  });
});

describe('db:sync:local status parsing', () => {
  it('derives pending and failed ids from registered migrations only', () => {
    const status = parseRunnerStatus(`[dotenv] noise before the report\n${statusReport({
      succeeded: [OLD_PRE, OLD_POST],
      failed: [OPEN_PRE],
    })}`);

    expect(status).toEqual({
      releaseVersion: OPEN_TRAIN,
      tableExists: true,
      registered: REGISTRY.map(({ id, releaseVersion }) => ({ id, releaseVersion })),
      pendingIds: [OPEN_PRE, OPEN_POST],
      failedIds: [OPEN_PRE],
      sourceDrift: [],
    });
  });

  const driftEntry = (migrationId: string, sourceCheck = 'drift') => ({
    migrationId,
    sourceCheck,
    sourcePath: `scripts/data-migrations/${migrationId.replace(':', '/')}.ts`,
    ranSourceSha256: 'a'.repeat(64),
    currentSourceSha256: 'b'.repeat(64),
    gitSha: null,
  });

  it('reads recorded source drift and, without the fail setting, only warns about it', async () => {
    const sourceDrift = [driftEntry(OPEN_PRE)];
    expect(parseRunnerStatus(statusReport({ sourceDrift })).sourceDrift).toEqual([
      { migrationId: OPEN_PRE, sourceCheck: 'drift' },
    ]);

    const dryRun = createHarness({ statuses: [{ sourceDrift }], ddl: EMPTY_SQL });
    await expect(runLocalSync({ ...OPTIONS, dryRun: true }, dryRun.deps))
      .resolves.toMatchObject({ exitCode: 0, state: 'in-sync' });
    expect(dryRun.output()).toContain(`source drift: ${OPEN_PRE} (drift)`);
    expect(dryRun.output()).toContain('A fix needs a new migration id.');

    const harness = createHarness({ statuses: [{ sourceDrift }], ddl: EMPTY_SQL });
    await expect(runLocalSync(OPTIONS, harness.deps))
      .resolves.toMatchObject({ exitCode: 0, state: 'in-sync' });
    expect(harness.steps()).toContain('post-schema');
  });

  it.each([
    ['the open train\'s pre-schema', OPEN_PRE],
    ['an earlier release\'s post-schema', OLD_POST],
    ['the open train\'s post-schema', OPEN_POST],
  ])('stops before any change when the fail setting covers %s migration', async (_label, migrationId) => {
    // `status` exits 3 only when DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT is set and a recorded hash differs.
    const statuses = [{ sourceDrift: [driftEntry(migrationId)] }];
    const harness = createHarness({ statuses, statusExitCode: 3, ddl: ADDITIVE_SQL });

    const outcome = await runLocalSync(OPTIONS, harness.deps);

    expect(outcome).toEqual({ exitCode: 1, state: 'blocked', steps: ['build-shared', 'status'] });
    expect(harness.steps()).toEqual(['build-shared', 'status']);
    expect(harness.output()).toContain(
      `Stopped before any change: ${FAIL_ON_SOURCE_DRIFT_ENV} is set, and ${migrationId} already succeeded from a source that has changed since`,
    );

    const dryRun = createHarness({ statuses, statusExitCode: 3, ddl: ADDITIVE_SQL });
    await expect(runLocalSync({ ...OPTIONS, dryRun: true }, dryRun.deps))
      .resolves.toEqual({ exitCode: 1, state: 'blocked', steps: ['status', 'survey', 'ddl-preview'] });
    expect(dryRun.output()).toContain(
      `Result: the real run would stop at source drift in ${migrationId} (${FAIL_ON_SOURCE_DRIFT_ENV} is set).`,
    );
  });

  it('continues under the fail setting when no migration it runs has recorded drift', async () => {
    // `up` never stops for derived drift or for a migration outside its selection.
    const statuses = [{
      sourceDrift: [driftEntry(OLD_PRE), driftEntry(OPEN_POST, 'unrecorded-derived-drift')],
    }];
    const harness = createHarness({ statuses, statusExitCode: 3, ddl: EMPTY_SQL });

    await expect(runLocalSync(OPTIONS, harness.deps))
      .resolves.toMatchObject({ exitCode: 0, state: 'in-sync' });
    expect(harness.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'generate',
      'post-schema',
      'final-status',
    ]);
    expect(harness.output()).toContain(
      `source drift: ${OLD_PRE} (drift), ${OPEN_POST} (unrecorded-derived-drift)`,
    );
  });

  it('counts recorded drift in exactly the migrations its own up calls select', () => {
    const status = parseRunnerStatus(statusReport({
      sourceDrift: [
        driftEntry(OLD_PRE),
        driftEntry(OLD_POST),
        driftEntry(OPEN_PRE, 'unrecorded-derived-drift'),
        driftEntry(OPEN_POST),
        driftEntry('v0.1.29:001_unknown_phase'),
      ],
    }));

    expect(sourceDriftRefusedBySync(status, REGISTRY)).toEqual([
      OLD_POST,
      OPEN_POST,
      'v0.1.29:001_unknown_phase',
    ]);
  });

  it('accepts the report data:migrate status prints, with source checks, retired and unregistered rows', async () => {
    // Built from the runner's own report parts over the real registry.
    const current = migrationSourceIdentities(dataMigrations);
    const registry: RegisteredMigration[] = dataMigrations.map((migration) => ({
      id: migration.id,
      releaseVersion: migration.releaseVersion,
      phase: migration.phase ?? 'post-schema',
    }));
    const openTrain = readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();
    const notApplicable = registry
      .filter((migration) => migration.phase === 'pre-schema'
        && compareReleaseVersions(migration.releaseVersion, openTrain) === -1)
      .map((migration) => migration.id);
    expect(notApplicable.length).toBeGreaterThan(0);
    const applied = registry.filter((migration) => !notApplicable.includes(migration.id));
    const drifted = applied.find((migration) => migration.phase === 'post-schema');
    if (!drifted) throw new Error('the registry has no post-schema migration');
    const retired = retiredDataMigrations[0];
    const ledgerRow = (migrationId: string, releaseVersion: string, runner: unknown): LedgerRun => ({
      migrationId,
      name: migrationId,
      releaseVersion,
      status: 'succeeded',
      affectedRows: 0,
      gitSha: null,
      prismaSchemaHash: null,
      completedAt: new Date('2026-09-17T00:00:00.000Z'),
      error: null,
      runner,
    });
    const { runs, sourceDrift } = await checkLedgerSources([
      ...applied.map(({ id, releaseVersion }) => ledgerRow(
        id,
        releaseVersion,
        id === drifted.id ? { ...current.get(id), sourceSha256: '0'.repeat(64) } : current.get(id),
      )),
      ledgerRow(retired.id, retired.releaseVersion, null),
      ledgerRow('v0.1.21:001_backfill_inventory_commitments', '0.1.21', null),
    ], {
      current,
      retiredIds: new Set(retiredDataMigrations.map(({ id }) => id)),
      deriveSourceSha256: async () => null,
    });
    expect(new Set(runs.map((run) => run.sourceCheck)))
      .toEqual(new Set(['match', 'drift', 'retired', 'unregistered']));
    const output = `${JSON.stringify({
      schemaVersion: DATA_MIGRATIONS_SCHEMA_VERSION,
      releaseVersion: openTrain,
      schemaGitSha: 'c'.repeat(40),
      prismaSchemaHash: 'd'.repeat(64),
      ...dataMigrationRegistryStatus(current),
      checkedAt: '2026-09-17T00:00:00.000Z',
      database: { tableExists: true, runs, sourceDrift },
    }, null, 2)}\n`;

    const status = parseRunnerStatus(output);

    expect(status.pendingIds).toEqual(notApplicable);
    expect(status.failedIds).toEqual([]);
    expect(status.sourceDrift).toEqual([{ migrationId: drifted.id, sourceCheck: 'drift' }]);
    expect(classifyPendingMigrations(status, registry)).toEqual({ toApply: [], notApplicable });
    expect(sourceDriftRefusedBySync(status, registry)).toEqual([drifted.id]);

    // The final check passes on this report; with the fail setting the sync stops first.
    for (const [statusExitCode, expected] of [
      [0, { exitCode: 0, state: 'in-sync' }],
      [3, { exitCode: 1, state: 'blocked' }],
    ] as const) {
      const harness = createHarness({ ddl: EMPTY_SQL }, { loadRegistry: async () => registry });
      const run = harness.deps.run;
      const outcome = await runLocalSync(OPTIONS, {
        ...harness.deps,
        run: async (command) => (command.step === 'status' || command.step === 'final-status'
          ? { exitCode: statusExitCode, signal: null, stdout: output, stderr: '' }
          : run(command)),
      });
      expect(outcome, `status exit ${statusExitCode}`).toMatchObject(expected);
    }
  });

  it('rejects a report without a release version or database section', () => {
    expect(() => parseRunnerStatus(`${JSON.stringify({ releaseVersion: OPEN_TRAIN, migrations: [], database: null }, null, 2)}\n`))
      .toThrow('no database section');
    expect(() => parseRunnerStatus(`${JSON.stringify({ migrations: [], database: { tableExists: true } }, null, 2)}\n`))
      .toThrow('no releaseVersion');
    expect(() => parseRunnerStatus('Error: no report')).toThrow('no JSON report');
  });

  it('starts children from the target URL without consent or a release filter', () => {
    const env = createChildEnvironment({
      DATABASE_URL: 'postgresql://kiditem:kiditem@localhost:5433/other',
      DATA_MIGRATION_RELEASE_VERSION: '0.1.30',
      DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT: '1',
      [PRISMA_USER_CONSENT_ENV]: 'ambient',
      PATH: '/usr/bin',
    }, LOCAL_URL);

    expect(env).toEqual({
      DATABASE_URL: LOCAL_URL,
      DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT: '1',
      PATH: '/usr/bin',
    });
  });
});

describe('db:sync:local command line', () => {
  it('parses every flag and refuses anything else', () => {
    expect(parseLocalSyncArgs([])).toEqual({
      help: false,
      options: { dryRun: false, acceptDataLoss: false, noBackup: false },
    });
    expect(parseLocalSyncArgs(['--dry-run', '--accept-data-loss', '--no-backup'])).toEqual({
      help: false,
      options: { dryRun: true, acceptDataLoss: true, noBackup: true },
    });
    expect(parseLocalSyncArgs(['--dry-run', '--help'])).toEqual({ help: true });
    expect(parseLocalSyncArgs(['-h'])).toEqual({ help: true });
    expect(() => parseLocalSyncArgs(['--force-reset'])).toThrow('never resets the database');
    expect(() => parseLocalSyncArgs(['--yes'])).toThrow('Unknown argument: --yes');
  });

  it('documents every flag, the release rule, the ensure steps, both variables, the backup and the exit codes', () => {
    for (const text of [
      '--dry-run',
      '--accept-data-loss',
      '--no-backup',
      '-h, --help',
      'pre-schema data migrations of the open release train (root VERSION)',
      'Pre-schema migrations of earlier releases are reported as not applicable',
      'cannot catch up through this command',
      're-applies the ensure steps',
      'Ensure steps\n                       are not previewed',
      'DATABASE_URL',
      PRISMA_USER_CONSENT_ENV,
      'never creates, defaults or prints it',
      FAIL_ON_SOURCE_DRIFT_ENV,
      'stops after step 3,\n                       before any change',
      '.data/db-backups/',
      'Exit codes:',
      `source drift that ${FAIL_ON_SOURCE_DRIFT_ENV} refuses`,
    ]) {
      expect(LOCAL_SYNC_HELP).toContain(text);
    }
  });

  it('prints help without a database and exits 2 on an unknown flag', () => {
    const tools = resolveRuntimeTools(repoRoot);
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
    const script = path.join('scripts', 'sync-local-database.ts');

    const help = spawnSync(tools.node, [tools.tsxCli, script, '--help'], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toBe(LOCAL_SYNC_HELP);

    const unknown = spawnSync(tools.node, [tools.tsxCli, script, '--force'], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    });
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('Unknown argument: --force');
    expect(unknown.stdout).toBe('');
  });

  it('loads the real registry phases under tsx', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'kiditem-sync-registry-'));
    try {
      const probe = path.join(workspace, 'probe.ts');
      await writeFile(probe, [
        `import { loadDataMigrationRegistry } from ${JSON.stringify(path.join(repoRoot, 'scripts', 'sync-local-database'))};`,
        'void loadDataMigrationRegistry().then((registry) => process.stdout.write(JSON.stringify(registry)));',
        '',
      ].join('\n'));
      const tools = resolveRuntimeTools(repoRoot);
      const result = spawnSync(tools.node, [tools.tsxCli, probe], { cwd: repoRoot, encoding: 'utf8' });

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(dataMigrations.map((migration) => ({
        id: migration.id,
        releaseVersion: migration.releaseVersion,
        phase: migration.phase ?? 'post-schema',
      })));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('matches the runner confirmation, fail setting and the package entrypoint', () => {
    expect(APPLY_DATA_MIGRATIONS_CONFIRMATION).toBe(RUNNER_CONFIRMATION);
    expect(FAIL_ON_SOURCE_DRIFT_ENV).toBe(RUNNER_FAIL_ON_SOURCE_DRIFT_ENV);
    const scripts = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts;
    expect(scripts['db:sync:local']).toBe('tsx scripts/sync-local-database.ts');
    expect(scripts['db:migrate']).toBeUndefined();
  });
});

describe('db:sync:local command runner', () => {
  const workspaces: string[] = [];
  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('captures output with stdin closed and reports exit codes', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'kiditem-sync-runner-'));
    workspaces.push(workspace);
    const run = createCommandRunner(workspace);

    const result = await run({
      step: 'status',
      command: process.execPath,
      args: ['-e', 'process.stdout.write(`cwd=${process.cwd()} tty=${Boolean(process.stdin.isTTY)}`); process.stderr.write("warned"); process.exit(3)'],
      env: { PATH: process.env.PATH },
      output: 'capture',
    });

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe(`cwd=${await realpath(workspace)} tty=false`);
    expect(result.stderr).toBe('warned');
    expect(result.spawnError).toBeUndefined();
  });

  it('streams stdout into a new private file and refuses to overwrite one', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'kiditem-sync-runner-'));
    workspaces.push(workspace);
    const run = createCommandRunner(workspace);
    const file = path.join(workspace, 'kiditem.dump');
    const command: LocalSyncCommand = {
      step: 'backup-dump',
      command: process.execPath,
      args: ['-e', 'process.stdout.write("PGDMP" + "x".repeat(100000))'],
      env: { PATH: process.env.PATH },
      output: 'capture',
      stdoutFile: file,
    };

    const result = await run(command);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    const written = await readFile(file, 'latin1');
    expect(written.startsWith('PGDMP')).toBe(true);
    expect(written).toHaveLength(100005);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(run(command)).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('reports a missing executable as a spawn error', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'kiditem-sync-runner-'));
    workspaces.push(workspace);
    const run = createCommandRunner(workspace);

    const result = await run({
      step: 'find-container',
      command: 'docker',
      args: ['ps'],
      env: { PATH: workspace },
      output: 'capture',
    });

    expect(result.exitCode).toBeNull();
    expect(result.spawnError?.code).toBe('ENOENT');
  });
});
