#!/usr/bin/env tsx
/**
 * `npm run db:sync:local` brings the local development database up to the
 * checked-out `prisma/` schema and `scripts/data-migrations/` registry, in the
 * order the Office cutover uses:
 *
 *   refuse a non-local target → build shared JavaScript → status
 *   → the open release train's pre-schema migrations → cutover survey
 *   → DDL preview → backup (accepted destructive DDL only) → db push
 *   → prisma generate → post-schema migrations of every release (that `up`
 *   also re-applies the ensure steps) → final status
 *
 * Pushing first loses data: `db push --accept-data-loss` drops columns that
 * pre-schema migrations still have to read, and those migrations then record
 * `succeeded` over zero rows.
 *
 * With DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT set, `up` refuses a selection that
 * holds an applied migration whose recorded source changed, and `status` exits
 * 3. The command then stops before its first change when either `up` it runs
 * would refuse, rather than pushing the schema and failing at the post-schema
 * phase.
 *
 * Pre-schema migrations run for the open train only (`--release-version`, as
 * the Office deployer passes it). An earlier release's pre-schema migration
 * prepared rows for a schema change this database is already past, and may no
 * longer run at all: v0.1.30:003 reads `product_variant_components`, which the
 * schema has dropped. Those ids are reported as not applicable. A database
 * without the ledger table gets the schema first and then the same phases.
 *
 * Prerequisites, flags, verification and recovery:
 * docs/runbooks/local-development.md.
 */
import { spawn, type StdioOptions } from 'node:child_process';
import { mkdir, open, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { assertLocalDevelopmentDatabase } from './_shared/local-development-database';

export const PRISMA_USER_CONSENT_ENV = 'PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION';
/** Same value as `APPLY_DATA_MIGRATIONS_CONFIRMATION` in run-data-migrations.ts. */
export const APPLY_DATA_MIGRATIONS_CONFIRMATION = 'APPLY_DATA_MIGRATIONS';
/** Same value as `FAIL_ON_SOURCE_DRIFT_ENV` in run-data-migrations.ts. */
export const FAIL_ON_SOURCE_DRIFT_ENV = 'DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT';
/** `data:migrate status` exit code for recorded source drift under FAIL_ON_SOURCE_DRIFT_ENV. */
const STATUS_SOURCE_DRIFT_EXIT_CODE = 3;

const RUNNER_SCRIPT = 'scripts/run-data-migrations.ts';
const SURVEY_SCRIPT = 'scripts/check-cutover-data-blockers.mjs';
const DB_PUSH_SCRIPT = 'scripts/safe-prisma-db-push.mjs';
const PG_DUMP_HEADER = 'PGDMP';
// The database name arrives as "$1", so it is never parsed by the shell.
const PG_DUMP_SHELL =
  'PGUSER="${POSTGRES_USER:-postgres}" PGPASSWORD="${POSTGRES_PASSWORD:-}" ' +
  'exec pg_dump --format=custom --no-password --dbname="$1"';

export const LOCAL_SYNC_HELP = `Usage: npm run db:sync:local -- [--dry-run] [--accept-data-loss] [--no-backup]

Brings the local development database (DATABASE_URL, loopback host only) up
to the checked-out prisma/ schema and scripts/data-migrations/ registry, in
the Office cutover order:

   1. refuse a non-local DATABASE_URL (and Windows)
   2. build @kiditem/shared JavaScript (type declarations are left as they are)
   3. data:migrate status
   4. pre-schema data migrations of the open release train (root VERSION)
   5. cutover survey (check:cutover-data-blockers)
   6. DDL preview (prisma migrate diff, read-only)
   7. backup, only when the DDL drops a table or column or changes a column
      type and --accept-data-loss is given
   8. db push (never --force-reset), then prisma generate
   9. post-schema data migrations of every release; the same data:migrate up
      then re-applies the ensure steps (scripts/data-migrations/README.md)
  10. final data:migrate status: every open-train migration and every
      post-schema migration must have succeeded (ensure steps write no
      ledger row)

A database without data_migration_runs skips step 4 and runs it after the
push instead.

Pre-schema migrations of earlier releases are reported as not applicable and
never run: they prepared rows for a schema change this database is already
past, as the Office deploy runs pre-schema migrations for its own release
only. A database that skipped them cannot catch up through this command;
restore it from a copy that ran them, or recreate it.

Flags:
  --dry-run            Run only steps 1, 3, 5 and 6. Nothing is built,
                       migrated, backed up or pushed. The survey then measures
                       the database before any pre-schema migration, so it can
                       report rows those migrations would remove. Ensure steps
                       are not previewed.
  --accept-data-loss   Allow DDL that drops a table or column or changes a
                       column type, and pass --accept-data-loss to db push.
                       A backup is written first unless --no-backup is given.
                       Prisma also needs it before adding a unique index or
                       primary key to a table that has rows; no backup is
                       taken for that alone.
  --no-backup          Skip that backup. Take your own backup first.
  -h, --help           Show this help and exit.

Environment:
  DATABASE_URL         Target database, from the shell or the root .env.
                       Only localhost, 127.0.0.1 or ::1 is accepted.
  ${PRISMA_USER_CONSENT_ENV}
                       Read only from the environment of this command and
                       passed only to the db push process. Prisma requires it
                       when an AI agent runs db push --accept-data-loss; the
                       value must be the user's exact consent text. This
                       command never creates, defaults or prints it.
  ${FAIL_ON_SOURCE_DRIFT_ENV}
                       Passed to data:migrate. When it is 1 or true and a
                       migration that step 4 or 9 selects already succeeded
                       from a source that has changed since, data:migrate up
                       would refuse, so this command stops after step 3,
                       before any change. Other drift only warns.

Backup:
  .data/db-backups/<database>-<UTC time>.dump (pg_dump custom format), taken
  through docker exec in the one running container that publishes the
  DATABASE_URL port. Restore steps: docs/runbooks/local-development.md.

Exit codes:
  0  done, or already in sync (--dry-run: nothing would stop the real run)
  1  stopped for a decision: survey blockers, destructive DDL without
     --accept-data-loss, Prisma data-loss warnings, missing AI consent, or
     source drift that ${FAIL_ON_SOURCE_DRIFT_ENV} refuses
  2  refused target, invalid usage, or a failed step
`;

export type LocalSyncOptions = Readonly<{
  dryRun: boolean;
  acceptDataLoss: boolean;
  noBackup: boolean;
}>;

export type LocalSyncArgs =
  | Readonly<{ help: true }>
  | Readonly<{ help: false; options: LocalSyncOptions }>;

export type LocalSyncStep =
  | 'build-shared'
  | 'status'
  | 'pre-schema'
  | 'survey'
  | 'ddl-preview'
  | 'backup'
  | 'db-push'
  | 'generate'
  | 'post-schema'
  | 'final-status';

export type LocalSyncCommandStep =
  | Exclude<LocalSyncStep, 'backup'>
  | 'find-container'
  | 'backup-dump';

export type LocalSyncCommand = Readonly<{
  step: LocalSyncCommandStep;
  command: string;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  /** inherit: straight to the terminal. capture: returned only. tee: both. */
  output: 'inherit' | 'capture' | 'tee';
  /** Stream stdout into this new file (created exclusively, mode 0600). */
  stdoutFile?: string;
}>;

export type LocalSyncCommandResult = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  /** Set when the executable could not be started at all, e.g. ENOENT. */
  spawnError?: NodeJS.ErrnoException;
}>;

export type LocalSyncTools = Readonly<{
  node: string;
  tsxCli: string;
  prismaCli: string;
}>;

export type DataMigrationPhase = 'pre-schema' | 'post-schema';

export type RegisteredMigration = Readonly<{
  id: string;
  releaseVersion: string;
  phase: DataMigrationPhase;
}>;

export type LocalSyncDependencies = Readonly<{
  platform: NodeJS.Platform;
  /** Environment the target is read from and every child starts from. */
  env: NodeJS.ProcessEnv;
  /** Prisma AI consent, taken from the caller's environment only. */
  prismaUserConsent: string | undefined;
  repoRoot: string;
  backupDirectory: string;
  tools: LocalSyncTools;
  run(command: LocalSyncCommand): Promise<LocalSyncCommandResult>;
  /** Phases of the registered migrations, read after the shared build. */
  loadRegistry(): Promise<readonly RegisteredMigration[]>;
  makeDirectory(directory: string): Promise<void>;
  readFileHead(file: string, bytes: number): Promise<Buffer>;
  removeFile(file: string): Promise<void>;
  now(): Date;
  log(line: string): void;
  warn(line: string): void;
}>;

export type LocalSyncOutcome = Readonly<{
  exitCode: 0 | 1 | 2;
  state: 'in-sync' | 'applied' | 'would-apply' | 'blocked' | 'failed';
  steps: readonly LocalSyncStep[];
}>;

export type LocalSyncPlan = Readonly<{
  steps: readonly LocalSyncStep[];
  /** When the open train's pre-schema migrations run, if at all. */
  preSchema: 'before-push' | 'after-push' | null;
}>;

export type LocalSyncTarget = Readonly<{
  databaseUrl: string;
  databaseName: string;
  host: string;
  port: string;
}>;

export type LocalSyncStatus = Readonly<{
  /** The open release train: root VERSION as the runner read it. */
  releaseVersion: string;
  tableExists: boolean;
  registered: ReadonlyArray<Readonly<{ id: string; releaseVersion: string }>>;
  /** Registered ids without a succeeded ledger row. */
  pendingIds: readonly string[];
  /** Pending ids whose ledger row says failed or interrupted. */
  failedIds: readonly string[];
  sourceDrift: ReadonlyArray<Readonly<{ migrationId: string; sourceCheck: string }>>;
}>;

export type PendingMigrations = Readonly<{
  /** Pending ids this command runs: the open train's and every post-schema one. */
  toApply: readonly string[];
  /** Pending pre-schema ids of earlier releases, which this command never runs. */
  notApplicable: readonly string[];
}>;

export type SurveyFinding = Readonly<Record<string, unknown>>;

export type SurveyReport = Readonly<{
  blockers: readonly SurveyFinding[];
  pending: readonly SurveyFinding[];
  clear: number;
}>;

export type PlannedDdl = Readonly<{
  empty: boolean;
  statements: readonly string[];
  /** Drops a table or column or changes a column type: needs the flag and a backup. */
  destructive: readonly string[];
  /**
   * Adds a unique index or primary key to a table this diff does not create.
   * Prisma asks for --accept-data-loss before these when the table has rows,
   * although they fail rather than lose data.
   */
  warned: readonly string[];
}>;

/** Stops the sync with an exit code: 1 needs a decision, 2 is an error. */
export class LocalSyncStop extends Error {
  constructor(readonly exitCode: 1 | 2, message: string) {
    super(message);
    this.name = 'LocalSyncStop';
  }
}

const FLAGS: Readonly<Record<string, keyof LocalSyncOptions>> = {
  '--dry-run': 'dryRun',
  '--accept-data-loss': 'acceptDataLoss',
  '--no-backup': 'noBackup',
};

export function parseLocalSyncArgs(argv: readonly string[]): LocalSyncArgs {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const options = { dryRun: false, acceptDataLoss: false, noBackup: false };
  for (const arg of argv) {
    if (arg === '--force-reset' || arg.startsWith('--force-reset=')) {
      throw new LocalSyncStop(
        2,
        'db:sync:local never resets the database. Restore a backup or recreate the local volume yourself.',
      );
    }
    const option = FLAGS[arg];
    if (!option) {
      throw new LocalSyncStop(
        2,
        `Unknown argument: ${arg}. Run \`npm run db:sync:local -- --help\` for the supported flags.`,
      );
    }
    options[option] = true;
  }
  return { help: false, options };
}

export function planLocalSync(input: {
  ledgerTableExists: boolean;
  dryRun: boolean;
}): LocalSyncPlan {
  if (input.dryRun) {
    return { steps: ['status', 'survey', 'ddl-preview'], preSchema: null };
  }
  const push = ['survey', 'ddl-preview', 'backup', 'db-push', 'generate'] as const;
  // `up` needs the ledger table, so a database without it gets the schema
  // first; the open train's pre-schema migrations skip what they do not find.
  if (!input.ledgerTableExists) {
    return {
      steps: ['build-shared', 'status', ...push, 'pre-schema', 'post-schema', 'final-status'],
      preSchema: 'after-push',
    };
  }
  return {
    steps: ['build-shared', 'status', 'pre-schema', ...push, 'post-schema', 'final-status'],
    preSchema: 'before-push',
  };
}

export function compareReleaseVersions(left: string, right: string): number | null {
  const parse = (version: string) => {
    const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

/**
 * Applied migrations with recorded source drift that this command's `up`
 * calls select: the open train's pre-schema migrations (an exact
 * `--release-version` match, as the runner filters) and every post-schema
 * one. Under DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT, `up` refuses to start while
 * its selection holds one. Derived drift never stops `up`; an id whose phase
 * cannot be read counts as selected.
 */
export function sourceDriftRefusedBySync(
  status: LocalSyncStatus,
  registry: readonly RegisteredMigration[],
): string[] {
  const migrationById = new Map(registry.map((migration) => [migration.id, migration]));
  return status.sourceDrift
    .filter((entry) => entry.sourceCheck === 'drift')
    .map((entry) => entry.migrationId)
    .filter((id) => {
      const migration = migrationById.get(id);
      return migration === undefined
        || migration.phase === 'post-schema'
        || migration.releaseVersion === status.releaseVersion;
    });
}

/**
 * Only a pre-schema migration of a release older than the open train is not
 * applicable. Anything else pending, including an id whose phase or release
 * cannot be read, is something this command must run.
 */
export function classifyPendingMigrations(
  status: LocalSyncStatus,
  registry: readonly RegisteredMigration[],
): PendingMigrations {
  const phaseById = new Map(registry.map((migration) => [migration.id, migration.phase]));
  const releaseById = new Map(status.registered.map((migration) => [migration.id, migration.releaseVersion]));
  const toApply: string[] = [];
  const notApplicable: string[] = [];
  for (const id of status.pendingIds) {
    const olderRelease =
      compareReleaseVersions(releaseById.get(id) ?? '', status.releaseVersion) === -1;
    if (phaseById.get(id) === 'pre-schema' && olderRelease) notApplicable.push(id);
    else toApply.push(id);
  }
  return { toApply, notApplicable };
}

export function resolveLocalSyncTarget(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): LocalSyncTarget {
  if (platform === 'win32') {
    throw new LocalSyncStop(
      2,
      'db:sync:local is for macOS local development. Office schema changes go through the deployment cutover (docs/runbooks/office-deploy.md).',
    );
  }
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new LocalSyncStop(2, 'DATABASE_URL is required. Set it in the root .env (docs/runbooks/local-development.md).');
  }
  let url: URL;
  try {
    url = assertLocalDevelopmentDatabase(databaseUrl);
  } catch (error) {
    throw new LocalSyncStop(
      2,
      `${errorMessage(error)}. db:sync:local accepts only a loopback development database.`,
    );
  }
  return {
    databaseUrl,
    databaseName: decodeURIComponent(url.pathname.replace(/^\//, '')),
    host: url.hostname,
    port: url.port || '5432',
  };
}

/** Every child starts from this: the target URL, and no Prisma consent. */
export function createChildEnvironment(
  base: NodeJS.ProcessEnv,
  databaseUrl: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, DATABASE_URL: databaseUrl };
  delete env[PRISMA_USER_CONSENT_ENV];
  // The command chooses the release filter per phase; one left in the shell
  // would silently skip post-schema migrations.
  delete env.DATA_MIGRATION_RELEASE_VERSION;
  return env;
}

/**
 * The db push child alone receives the caller's consent. Without it the
 * variable is set empty, so a value in `.env` (which Prisma's config loads
 * only for unset variables) cannot stand in for the caller's consent.
 */
export function createDbPushEnvironment(
  childEnvironment: NodeJS.ProcessEnv,
  prismaUserConsent: string | undefined,
): NodeJS.ProcessEnv {
  return {
    ...childEnvironment,
    [PRISMA_USER_CONSENT_ENV]:
      typeof prismaUserConsent === 'string' ? prismaUserConsent : '',
  };
}

/** The runner and the survey print one pretty-printed JSON document. */
export function extractJsonReport(output: string): unknown {
  const lines = output.split(/\r?\n/);
  const start = lines.indexOf('{');
  const end = lines.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('the output has no JSON report');
  return JSON.parse(lines.slice(start, end + 1).join('\n'));
}

export function parseRunnerStatus(output: string): LocalSyncStatus {
  const report = extractJsonReport(output) as {
    releaseVersion?: unknown;
    migrations?: unknown;
    database?: {
      tableExists?: unknown;
      runs?: unknown;
      sourceDrift?: unknown;
    } | null;
  };
  if (typeof report.releaseVersion !== 'string') {
    throw new Error('the status report has no releaseVersion');
  }
  if (!Array.isArray(report.migrations)) {
    throw new Error('the status report has no migrations list');
  }
  const database = report.database;
  if (!database || typeof database.tableExists !== 'boolean') {
    throw new Error('the status report has no database section');
  }
  const registered = report.migrations
    .map((migration) => migration as { id?: unknown; releaseVersion?: unknown })
    .filter((migration): migration is { id: string; releaseVersion?: unknown } =>
      typeof migration.id === 'string')
    .map((migration) => ({
      id: migration.id,
      releaseVersion: typeof migration.releaseVersion === 'string' ? migration.releaseVersion : '',
    }));
  const statusById = new Map<string, unknown>();
  for (const run of Array.isArray(database.runs) ? database.runs : []) {
    const { migrationId, status } = run as { migrationId?: unknown; status?: unknown };
    if (typeof migrationId === 'string') statusById.set(migrationId, status);
  }
  const pendingIds = registered
    .map((migration) => migration.id)
    .filter((id) => statusById.get(id) !== 'succeeded');
  const sourceDrift = (Array.isArray(database.sourceDrift) ? database.sourceDrift : [])
    .map((entry) => entry as { migrationId?: unknown; sourceCheck?: unknown })
    .filter((entry) => typeof entry.migrationId === 'string')
    .map((entry) => ({
      migrationId: entry.migrationId as string,
      sourceCheck: typeof entry.sourceCheck === 'string' ? entry.sourceCheck : 'drift',
    }));
  return {
    releaseVersion: report.releaseVersion,
    tableExists: database.tableExists,
    registered,
    pendingIds,
    failedIds: pendingIds.filter((id) => statusById.has(id)),
    sourceDrift,
  };
}

export function parseSurveyReport(output: string): SurveyReport {
  const report = extractJsonReport(output) as {
    blockers?: unknown;
    pending?: unknown;
    clear?: unknown;
  };
  if (!Array.isArray(report.blockers) || !Array.isArray(report.pending)) {
    throw new Error('the survey report has no blockers or pending list');
  }
  return {
    blockers: report.blockers as SurveyFinding[],
    pending: report.pending as SurveyFinding[],
    clear: typeof report.clear === 'number' ? report.clear : 0,
  };
}

export function describeSurveyFinding(finding: SurveyFinding): string {
  const table = String(finding.table ?? '?');
  if (finding.kind === 'not-null') {
    return `not-null ${table}.${String(finding.column)}: ${String(finding.rows)} existing row(s) and no database default`;
  }
  const columns = Array.isArray(finding.columns) ? finding.columns.join(', ') : '?';
  if (Array.isArray(finding.missing)) {
    return `unique   ${table}(${columns}): needs a backfill decision for new column(s) ${finding.missing.join(', ')} (${String(finding.name)})`;
  }
  return `unique   ${table}(${columns}): ${String(finding.groups)} duplicate group(s) across ${String(finding.rows)} row(s) (${String(finding.name)})`;
}

const DESTRUCTIVE_DDL = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bSET\s+DATA\s+TYPE\b/i,
];

export function classifyPlannedDdl(sql: string): PlannedDdl {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = withoutComments
    .split(/;[ \t]*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  const createdTables = new Set(
    statements
      .map((statement) => statement.match(/^CREATE TABLE\s+"([^"]+)"/i)?.[1])
      .filter((table): table is string => table !== undefined),
  );
  const existingTable = (table: string | undefined) =>
    table !== undefined && !createdTables.has(table);
  return {
    empty: statements.length === 0,
    statements,
    destructive: statements.filter((statement) =>
      DESTRUCTIVE_DDL.some((pattern) => pattern.test(statement))),
    warned: statements.filter((statement) =>
      existingTable(statement.match(/^CREATE UNIQUE INDEX\s+"[^"]+"\s+ON\s+"([^"]+)"/i)?.[1])
      || (/\bADD\s+CONSTRAINT\s+"[^"]+"\s+PRIMARY\s+KEY\b/i.test(statement)
        && existingTable(statement.match(/^ALTER TABLE\s+"([^"]+)"/i)?.[1]))),
  };
}

export function resolvePostgresContainer(dockerPsOutput: string, port: string): string {
  const names = dockerPsOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length === 0) {
    throw new LocalSyncStop(
      2,
      `No running Docker container publishes port ${port}, so the automatic backup cannot run. Start the local database with \`docker compose up -d --wait\`, or take your own backup and rerun with --no-backup.`,
    );
  }
  throw new LocalSyncStop(
    2,
    `${names.length} running Docker containers publish port ${port} (${names.join(', ')}), so the backup cannot tell which one holds the database. Stop the extra container, or take your own backup and rerun with --no-backup.`,
  );
}

export function dockerUnavailableMessage(result: LocalSyncCommandResult): string {
  if (result.spawnError?.code === 'ENOENT') {
    return 'The automatic backup needs the Docker CLI, but `docker` was not found on PATH. Start Docker Desktop (or install its CLI), or take your own backup and rerun with --no-backup.';
  }
  const detail = firstLine(result.stderr) ?? result.spawnError?.message ?? 'no error output';
  return `\`docker ps\` failed (${describeExit(result)}): ${detail}. Start Docker Desktop, or take your own backup and rerun with --no-backup.`;
}

export function backupFileName(databaseName: string, at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${databaseName}-${stamp}.dump`;
}

export async function runLocalSync(
  options: LocalSyncOptions,
  deps: LocalSyncDependencies,
): Promise<LocalSyncOutcome> {
  const steps: LocalSyncStep[] = [];
  try {
    const target = resolveLocalSyncTarget(deps.platform, deps.env);
    const env = createChildEnvironment(deps.env, target.databaseUrl);
    deps.log(
      `db:sync:local${options.dryRun ? ' --dry-run (read-only)' : ''}: database "${target.databaseName}" on ${target.host}:${target.port}`,
    );

    if (!options.dryRun) {
      await buildShared(deps, env);
      steps.push('build-shared');
    }

    const { status: before, failsOnSourceDrift } = await readStatus(deps, env, 'status', options.dryRun);
    steps.push('status');
    const registry = await loadRegistry(deps);
    const pending = classifyPendingMigrations(before, registry);
    reportStatus(deps, before, pending);
    // `up` would refuse these only after an earlier phase, or the push, has
    // already run, so the sync refuses them before its first change.
    const refusedDrift = failsOnSourceDrift ? sourceDriftRefusedBySync(before, registry) : [];
    if (refusedDrift.length > 0 && !options.dryRun) {
      throw new LocalSyncStop(1, sourceDriftStopMessage(refusedDrift));
    }
    const plan = planLocalSync({ ledgerTableExists: before.tableExists, dryRun: options.dryRun });

    if (plan.preSchema === 'before-push') {
      await applyPreSchemaMigrations(deps, env, before.releaseVersion);
      steps.push('pre-schema');
    }

    const survey = await runSurvey(deps, env);
    steps.push('survey');
    const surveyBlocked = survey.blockers.length + survey.pending.length > 0;
    if (surveyBlocked && !options.dryRun) {
      throw new LocalSyncStop(1, SURVEY_STOP_MESSAGE);
    }

    const ddl = await previewDdl(deps, env);
    steps.push('ddl-preview');
    const destructive = ddl.destructive.length > 0;
    if (destructive && pending.notApplicable.length > 0) {
      deps.warn(
        '    The not-applicable pre-schema migrations above never ran here, so rows they would have moved may sit in what this change drops.',
      );
    }

    if (options.dryRun) {
      return finishDryRun(deps, { before, pending, refusedDrift, surveyBlocked, ddl, options, steps });
    }
    if (destructive && !options.acceptDataLoss) {
      throw new LocalSyncStop(1, DESTRUCTIVE_STOP_MESSAGE);
    }

    if (destructive && !options.noBackup) {
      await backUp(deps, target, env);
      steps.push('backup');
    } else if (destructive) {
      deps.log('==> Backup skipped (--no-backup)');
    }

    if (ddl.empty) {
      deps.log('==> db push skipped: the database already matches prisma/');
    } else {
      await pushSchema(deps, env, options.acceptDataLoss);
      steps.push('db-push');
    }

    await generateClient(deps, env);
    steps.push('generate');

    if (plan.preSchema === 'after-push') {
      await applyPreSchemaMigrations(deps, env, before.releaseVersion);
      steps.push('pre-schema');
    }
    await applyPostSchemaMigrations(deps, env);
    steps.push('post-schema');

    const { status: after } = await readStatus(deps, env, 'final-status', false);
    steps.push('final-status');
    const remaining = classifyPendingMigrations(after, registry);
    reportStatus(deps, after, remaining);
    if (remaining.toApply.length > 0) {
      throw new LocalSyncStop(
        2,
        `Migrations this command must apply are still pending: ${remaining.toApply.join(', ')}.`,
      );
    }

    const alreadyInSync = pending.toApply.length === 0 && ddl.empty;
    deps.log(
      alreadyInSync
        ? 'Result: already in sync. The schema and the data-migration ledger needed no change.'
        : 'Result: synced. The schema matches prisma/, and every open-train and post-schema migration has succeeded.',
    );
    return { exitCode: 0, state: alreadyInSync ? 'in-sync' : 'applied', steps };
  } catch (error) {
    const stop = error instanceof LocalSyncStop
      ? error
      : new LocalSyncStop(2, `db:sync:local failed: ${errorMessage(error)}`);
    deps.warn(stop.message);
    return { exitCode: stop.exitCode, state: stop.exitCode === 1 ? 'blocked' : 'failed', steps };
  }
}

const SURVEY_STOP_MESSAGE = [
  'Stopped before db push: the cutover survey found rows this schema change cannot be applied over (listed above).',
  'Do not delete them by hand. Report the missing cleanup against the open release train, as KID-239 did for v0.1.31,',
  'so a pre-schema migration removes them on every database. Then rerun `npm run db:sync:local`.',
].join('\n');

const DESTRUCTIVE_STOP_MESSAGE = [
  'Stopped before db push: the schema change drops a table or column or changes a column type (statements above).',
  'Review them. To apply, rerun `npm run db:sync:local -- --accept-data-loss`;',
  'a backup is written to .data/db-backups/ first unless you also pass --no-backup.',
].join('\n');

const CONSENT_STOP_MESSAGE = [
  'Stopped at db push: Prisma refused `db push --accept-data-loss` because an AI agent started it without the user\'s consent. Nothing was pushed.',
  `Whoever runs this command must set ${PRISMA_USER_CONSENT_ENV} to the user's exact consent text in the environment of \`npm run db:sync:local\`.`,
  'This command never creates that value, and a value in .env is not used. Then rerun the same command.',
].join('\n');

function sourceDriftStopMessage(migrationIds: readonly string[]): string {
  return [
    `Stopped before any change: ${FAIL_ON_SOURCE_DRIFT_ENV} is set, and ${migrationIds.join(', ')} already succeeded from a source that has changed since (source drift above).`,
    'data:migrate up refuses to start while its selection holds such a migration, so nothing was migrated or pushed.',
    `An applied migration was edited: restore its source and put the fix in a new migration id, or unset ${FAIL_ON_SOURCE_DRIFT_ENV} to continue with a warning. Then rerun \`npm run db:sync:local\`.`,
  ].join('\n');
}

const PRISMA_WARNINGS_STOP_MESSAGE = [
  'Stopped at db push: Prisma listed data-loss warnings (above) and needs --accept-data-loss. Nothing was pushed.',
  'The DDL preview found no dropped table or column and no type change, so these are warnings such as a new unique index on a table with rows.',
  'Review them, then rerun with --accept-data-loss. No automatic backup is taken for these warnings; take your own first if you want one.',
].join('\n');

function finishDryRun(
  deps: LocalSyncDependencies,
  input: {
    before: LocalSyncStatus;
    pending: PendingMigrations;
    refusedDrift: readonly string[];
    surveyBlocked: boolean;
    ddl: PlannedDdl;
    options: LocalSyncOptions;
    steps: LocalSyncStep[];
  },
): LocalSyncOutcome {
  const { before, pending, refusedDrift, surveyBlocked, ddl, options, steps } = input;
  const destructive = ddl.destructive.length > 0;
  deps.log(
    'Dry run: the survey measured the database before any pre-schema migration, so it can report rows those migrations would remove.',
  );
  if (!before.tableExists) {
    deps.log('Dry run: data_migration_runs is missing, so the real run pushes the schema before any migration phase.');
  }
  const stops: string[] = [];
  if (refusedDrift.length > 0) {
    stops.push(`source drift in ${refusedDrift.join(', ')} (${FAIL_ON_SOURCE_DRIFT_ENV} is set)`);
  }
  if (surveyBlocked) stops.push('survey findings (listed above)');
  if (destructive && !options.acceptDataLoss) stops.push('destructive DDL without --accept-data-loss');
  if (stops.length > 0) {
    deps.log(`Result: the real run would stop at ${stops.join(' and ')}.`);
    return { exitCode: 1, state: 'blocked', steps };
  }
  if (pending.toApply.length === 0 && ddl.empty) {
    deps.log('Result: in sync. Nothing to apply.');
    return { exitCode: 0, state: 'in-sync', steps };
  }
  const backupNote = destructive
    ? (options.noBackup ? ', without a backup (--no-backup)' : ', after writing a backup to .data/db-backups/')
    : '';
  const warningNote = ddl.warned.length > 0 && !options.acceptDataLoss
    ? ' db push may still stop for --accept-data-loss (see the preview above).'
    : '';
  deps.log(
    `Result: the real run would apply ${pending.toApply.length} pending migration(s) and ${ddl.statements.length} DDL statement(s)${backupNote}.${warningNote}`,
  );
  return { exitCode: 0, state: 'would-apply', steps };
}

async function buildShared(deps: LocalSyncDependencies, env: NodeJS.ProcessEnv): Promise<void> {
  deps.log('==> Build @kiditem/shared JavaScript (the migration runner imports it from dist; type declarations are left as they are)');
  const result = await deps.run({
    step: 'build-shared',
    command: 'npm',
    // --no: never download a package; --no-clean keeps existing declarations.
    args: ['exec', '--no', '--workspace=packages/shared', 'tsup', '--', '--no-dts', '--no-clean'],
    env,
    output: 'capture',
  });
  throwIfFailed(result, '@kiditem/shared build', `${result.stdout}\n${result.stderr}`);
}

async function readStatus(
  deps: LocalSyncDependencies,
  env: NodeJS.ProcessEnv,
  step: 'status' | 'final-status',
  dryRun: boolean,
): Promise<{ status: LocalSyncStatus; failsOnSourceDrift: boolean }> {
  deps.log(step === 'status' ? '==> Data-migration status' : '==> Final data-migration status');
  const result = await deps.run({
    step,
    command: deps.tools.node,
    args: [deps.tools.tsxCli, RUNNER_SCRIPT, 'status'],
    env,
    output: 'capture',
  });
  // Exit 3 means DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT is set and found recorded
  // drift; the report is still complete.
  const failsOnSourceDrift = result.exitCode === STATUS_SOURCE_DRIFT_EXIT_CODE;
  if (result.spawnError || result.signal || (result.exitCode !== 0 && !failsOnSourceDrift)) {
    throw new LocalSyncStop(2, `${failureMessage(result, 'data:migrate status', result.stderr)}${sharedBuildHint(dryRun)}`);
  }
  try {
    return { status: parseRunnerStatus(result.stdout), failsOnSourceDrift };
  } catch (error) {
    throw new LocalSyncStop(2, `data:migrate status printed no usable report: ${errorMessage(error)}.`);
  }
}

async function loadRegistry(deps: LocalSyncDependencies): Promise<readonly RegisteredMigration[]> {
  try {
    return await deps.loadRegistry();
  } catch (error) {
    throw new LocalSyncStop(
      2,
      `Could not load the data-migration registry: ${errorMessage(error)}.${sharedBuildHint(true)}`,
    );
  }
}

function sharedBuildHint(show: boolean): string {
  return show
    ? '\nIf the error names @kiditem/shared, run `npm run build --workspace=packages/shared` first, or run without --dry-run.'
    : '';
}

function reportStatus(
  deps: LocalSyncDependencies,
  status: LocalSyncStatus,
  pending: PendingMigrations,
): void {
  const succeeded = status.registered.length - status.pendingIds.length;
  const counts = `${status.registered.length} registered: ${succeeded} succeeded, ${pending.toApply.length} to apply, ${pending.notApplicable.length} not applicable`;
  deps.log(status.tableExists ? `    ${counts}` : `    data_migration_runs is missing. ${counts}`);
  if (pending.toApply.length > 0) {
    deps.log(`    to apply: ${pending.toApply.join(', ')}`);
  }
  const retried = pending.toApply.filter((id) => status.failedIds.includes(id));
  if (retried.length > 0) {
    deps.warn(`    recorded as failed or interrupted (they run again): ${retried.join(', ')}`);
  }
  if (pending.notApplicable.length > 0) {
    deps.log(
      `    not applicable to this database: ${pending.notApplicable.join(', ')}`,
    );
    deps.log(
      `    These pre-schema migrations belong to releases before ${status.releaseVersion} and never ran here. This command runs only the open release's pre-schema migrations, as the Office deploy does.`,
    );
  }
  if (status.sourceDrift.length > 0) {
    deps.warn(
      `    source drift: ${status.sourceDrift.map((entry) => `${entry.migrationId} (${entry.sourceCheck})`).join(', ')}`,
    );
    deps.warn('    These ran from a different source than the current file and will not run again. A fix needs a new migration id.');
  }
}

async function applyPreSchemaMigrations(
  deps: LocalSyncDependencies,
  env: NodeJS.ProcessEnv,
  releaseVersion: string,
): Promise<void> {
  await applyDataMigrations(deps, env, 'pre-schema', ['--phase', 'pre-schema', '--release-version', releaseVersion]);
}

async function applyPostSchemaMigrations(
  deps: LocalSyncDependencies,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await applyDataMigrations(deps, env, 'post-schema', ['--phase', 'post-schema']);
}

async function applyDataMigrations(
  deps: LocalSyncDependencies,
  env: NodeJS.ProcessEnv,
  step: 'pre-schema' | 'post-schema',
  selection: readonly string[],
): Promise<void> {
  const label = `data:migrate up ${selection.join(' ')}`;
  deps.log(`==> ${label}`);
  const result = await deps.run({
    step,
    command: deps.tools.node,
    args: [
      deps.tools.tsxCli,
      RUNNER_SCRIPT,
      'up',
      '--target',
      'local',
      ...selection,
      '--confirm',
      APPLY_DATA_MIGRATIONS_CONFIRMATION,
    ],
    env,
    output: 'inherit',
  });
  throwIfFailed(result, label, result.stderr);
}

async function runSurvey(deps: LocalSyncDependencies, env: NodeJS.ProcessEnv): Promise<SurveyReport> {
  deps.log('==> Cutover survey (check:cutover-data-blockers)');
  const result = await deps.run({
    step: 'survey',
    command: deps.tools.node,
    args: [SURVEY_SCRIPT, '--json'],
    env,
    output: 'capture',
  });
  if (result.spawnError || result.signal || (result.exitCode !== 0 && result.exitCode !== 1)) {
    throw new LocalSyncStop(2, failureMessage(result, 'The cutover survey', result.stderr));
  }
  let report: SurveyReport;
  try {
    report = parseSurveyReport(result.stdout);
  } catch (error) {
    throw new LocalSyncStop(2, `The cutover survey printed no usable report: ${errorMessage(error)}.`);
  }
  const findings = report.blockers.length + report.pending.length;
  if ((result.exitCode === 1) !== (findings > 0)) {
    throw new LocalSyncStop(
      2,
      `The cutover survey exited ${result.exitCode} but reported ${findings} finding(s).`,
    );
  }
  if (findings === 0) {
    deps.log(`    clear (${report.clear} check(s))`);
    return report;
  }
  for (const finding of report.blockers) deps.log(`    BLOCKER ${describeSurveyFinding(finding)}`);
  for (const finding of report.pending) deps.log(`    PENDING ${describeSurveyFinding(finding)}`);
  return report;
}

async function previewDdl(deps: LocalSyncDependencies, env: NodeJS.ProcessEnv): Promise<PlannedDdl> {
  deps.log('==> Schema change preview (prisma migrate diff, read-only)');
  const result = await deps.run({
    step: 'ddl-preview',
    command: deps.tools.node,
    args: [
      deps.tools.prismaCli,
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma',
      '--script',
    ],
    env,
    output: 'capture',
  });
  throwIfFailed(result, 'prisma migrate diff', result.stderr);
  const ddl = classifyPlannedDdl(result.stdout);
  if (ddl.empty) {
    deps.log('    empty: the database already matches prisma/');
    return ddl;
  }
  deps.log(`    ${ddl.statements.length} statement(s), ${ddl.destructive.length} destructive`);
  for (const statement of ddl.destructive) {
    deps.log(`    DESTRUCTIVE ${statement.replace(/\s+/g, ' ')}`);
  }
  if (ddl.warned.length > 0) {
    deps.log(
      `    ${ddl.warned.length} statement(s) add a unique index or primary key to an existing table. If that table has rows, db push stops until --accept-data-loss is given; the survey above checked new unique indexes for duplicates.`,
    );
  }
  return ddl;
}

async function backUp(
  deps: LocalSyncDependencies,
  target: LocalSyncTarget,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  deps.log(`==> Backup of "${target.databaseName}" before the destructive push`);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_$-]*$/.test(target.databaseName)) {
    throw new LocalSyncStop(
      2,
      `The automatic backup does not handle the database name "${target.databaseName}". Take your own backup and rerun with --no-backup.`,
    );
  }
  const lookup = await deps.run({
    step: 'find-container',
    command: 'docker',
    args: ['ps', '--filter', `publish=${target.port}`, '--format', '{{.Names}}'],
    env,
    output: 'capture',
  });
  if (lookup.spawnError || lookup.signal || lookup.exitCode !== 0) {
    throw new LocalSyncStop(2, dockerUnavailableMessage(lookup));
  }
  const container = resolvePostgresContainer(lookup.stdout, target.port);

  await deps.makeDirectory(deps.backupDirectory);
  const file = path.join(deps.backupDirectory, backupFileName(target.databaseName, deps.now()));
  const dump = await deps.run({
    step: 'backup-dump',
    command: 'docker',
    args: ['exec', container, 'sh', '-c', PG_DUMP_SHELL, 'sh', target.databaseName],
    env,
    output: 'capture',
    stdoutFile: file,
  });
  if (dump.spawnError || dump.signal || dump.exitCode !== 0) {
    await deps.removeFile(file);
    throw new LocalSyncStop(2, failureMessage(dump, `pg_dump in container ${container}`, dump.stderr));
  }
  const header = (await deps.readFileHead(file, PG_DUMP_HEADER.length)).toString('latin1');
  if (header !== PG_DUMP_HEADER) {
    await deps.removeFile(file);
    throw new LocalSyncStop(
      2,
      `The backup from container ${container} is not a pg_dump custom-format archive, so it was removed. Take your own backup and rerun with --no-backup.`,
    );
  }
  deps.log(`    wrote ${path.relative(deps.repoRoot, file) || file} (container ${container})`);
}

async function pushSchema(
  deps: LocalSyncDependencies,
  env: NodeJS.ProcessEnv,
  acceptDataLoss: boolean,
): Promise<void> {
  deps.log(`==> db push${acceptDataLoss ? ' --accept-data-loss' : ''}`);
  const result = await deps.run({
    step: 'db-push',
    command: deps.tools.node,
    args: [DB_PUSH_SCRIPT, ...(acceptDataLoss ? ['--accept-data-loss'] : [])],
    env: createDbPushEnvironment(env, deps.prismaUserConsent),
    output: 'tee',
  });
  if (!result.spawnError && !result.signal && result.exitCode === 0) return;
  const output = `${result.stdout}\n${result.stderr}`;
  if (output.includes(PRISMA_USER_CONSENT_ENV)) {
    throw new LocalSyncStop(1, CONSENT_STOP_MESSAGE);
  }
  if (!acceptDataLoss && output.includes('--accept-data-loss')) {
    throw new LocalSyncStop(1, PRISMA_WARNINGS_STOP_MESSAGE);
  }
  throw new LocalSyncStop(2, failureMessage(result, 'db push', ''));
}

async function generateClient(deps: LocalSyncDependencies, env: NodeJS.ProcessEnv): Promise<void> {
  deps.log('==> prisma generate');
  const result = await deps.run({
    step: 'generate',
    command: deps.tools.node,
    args: [deps.tools.prismaCli, 'generate'],
    env,
    output: 'inherit',
  });
  throwIfFailed(result, 'prisma generate', result.stderr);
}

function throwIfFailed(result: LocalSyncCommandResult, label: string, output: string): void {
  if (!result.spawnError && !result.signal && result.exitCode === 0) return;
  throw new LocalSyncStop(2, failureMessage(result, label, output));
}

function failureMessage(result: LocalSyncCommandResult, label: string, output: string): string {
  const tail = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-12);
  const details = tail.length > 0 ? `\n${tail.map((line) => `    ${line}`).join('\n')}` : '';
  if (result.spawnError) return `${label} could not start: ${result.spawnError.message}${details}`;
  return `${label} failed (${describeExit(result)}).${details}`;
}

function describeExit(result: LocalSyncCommandResult): string {
  return result.signal ? `signal ${result.signal}` : `exit ${result.exitCode ?? 'unknown'}`;
}

function firstLine(text: string): string | undefined {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs one child with stdin closed, so Prisma never prompts past a gate. */
export function createCommandRunner(cwd: string): LocalSyncDependencies['run'] {
  return async (command) => {
    const file = command.stdoutFile
      ? await open(command.stdoutFile, 'wx', 0o600)
      : undefined;
    const fileStream = file?.createWriteStream();
    const fileClosed = fileStream
      ? new Promise<void>((resolve) => {
        fileStream.once('close', () => resolve());
      })
      : Promise.resolve();
    const tee = command.output === 'tee';
    const inherit = command.output === 'inherit';
    const stdio: StdioOptions = [
      'ignore',
      inherit && !fileStream ? 'inherit' : 'pipe',
      inherit ? 'inherit' : 'pipe',
    ];

    return new Promise<LocalSyncCommandResult>((resolve) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;
      const settle = (result: LocalSyncCommandResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const child = spawn(command.command, [...command.args], {
        cwd,
        env: command.env,
        stdio,
      });
      child.once('error', (error: NodeJS.ErrnoException) => {
        if (child.pid !== undefined) return;
        fileStream?.end();
        void fileClosed.then(() => settle({
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: '',
          spawnError: error,
        }));
      });
      if (child.stdout) {
        if (fileStream) {
          child.stdout.pipe(fileStream);
        } else {
          child.stdout.on('data', (chunk: Buffer) => {
            stdout.push(chunk);
            if (tee) process.stdout.write(chunk);
          });
        }
      }
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr.push(chunk);
        if (tee) process.stderr.write(chunk);
      });
      child.once('close', (exitCode, signal) => {
        if (child.pid === undefined) return;
        void fileClosed.then(() => settle({
          exitCode,
          signal,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        }));
      });
    });
  };
}

export async function readFileHead(file: string, bytes: number): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(bytes), 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Loaded after the shared build, because the registry imports @kiditem/shared
 * from dist. The computed specifier keeps the registry, with its JSON catalog
 * and frozen migration files, out of every TypeScript program that imports
 * this module, so its shape is checked here instead.
 */
export async function loadDataMigrationRegistry(
  registryUrl = pathToFileURL(path.join(__dirname, 'data-migrations', 'index.ts')).href,
): Promise<readonly RegisteredMigration[]> {
  const registry = (await import(registryUrl)) as {
    dataMigrations?: unknown;
    default?: { dataMigrations?: unknown };
  };
  const migrations = registry.dataMigrations ?? registry.default?.dataMigrations;
  if (!Array.isArray(migrations)) {
    throw new Error('scripts/data-migrations/index.ts exports no dataMigrations list');
  }
  return migrations.map((migration: unknown) => {
    const { id, releaseVersion, phase } = migration as {
      id?: unknown;
      releaseVersion?: unknown;
      phase?: unknown;
    };
    if (typeof id !== 'string' || typeof releaseVersion !== 'string') {
      throw new Error('a registered data migration has no id or releaseVersion');
    }
    if (phase !== undefined && phase !== 'pre-schema' && phase !== 'post-schema') {
      throw new Error(`data migration ${id} has an unknown phase`);
    }
    return { id, releaseVersion, phase: phase ?? 'post-schema' };
  });
}

export function resolveRuntimeTools(repoRoot: string): LocalSyncTools {
  const requireFromRoot = createRequire(path.join(repoRoot, 'package.json'));
  return {
    node: process.execPath,
    tsxCli: requireFromRoot.resolve('tsx/cli'),
    prismaCli: requireFromRoot.resolve('prisma/build/index.js'),
  };
}

export function createRuntimeDependencies(input: {
  repoRoot: string;
  prismaUserConsent: string | undefined;
}): LocalSyncDependencies {
  return {
    platform: process.platform,
    env: process.env,
    prismaUserConsent: input.prismaUserConsent,
    repoRoot: input.repoRoot,
    backupDirectory: path.join(input.repoRoot, '.data', 'db-backups'),
    tools: resolveRuntimeTools(input.repoRoot),
    run: createCommandRunner(input.repoRoot),
    loadRegistry: loadDataMigrationRegistry,
    makeDirectory: async (directory) => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
    },
    readFileHead,
    removeFile: async (file) => {
      await rm(file, { force: true });
    },
    now: () => new Date(),
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
    warn: (line) => {
      process.stderr.write(`${line}\n`);
    },
  };
}

async function main(argv: readonly string[]): Promise<number> {
  // Read before .env is loaded: consent comes only from the caller's environment.
  const prismaUserConsent = process.env[PRISMA_USER_CONSENT_ENV];
  let args: LocalSyncArgs;
  try {
    args = parseLocalSyncArgs(argv);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(LOCAL_SYNC_HELP);
    return 0;
  }
  const repoRoot = path.resolve(__dirname, '..');
  loadDotenv({ path: path.join(repoRoot, '.env'), quiet: true });
  const outcome = await runLocalSync(
    args.options,
    createRuntimeDependencies({ repoRoot, prismaUserConsent }),
  );
  return outcome.exitCode;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error: unknown) => {
      process.stderr.write(`db:sync:local failed: ${errorMessage(error)}\n`);
      process.exitCode = 2;
    },
  );
}
