#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  parseRawArgs,
  requiredValue,
  value,
  type ParsedArgs,
} from './_shared/cli-args';
import {
  dataMigrations,
  retiredDataMigrations,
} from './data-migrations/index';
import type {
  DataMigrationTarget,
  DataMigration,
} from './data-migrations/types';
import {
  applyDataMigrations,
  checkLedgerSources,
  dataMigrationRunsTableExists,
  readDataMigrationLedger,
  requireCurrentSource,
  sourceDriftExitCode,
  type SourceDriftEntry,
} from './data-migrations/ledger';
import {
  migrationSourcePath,
  normalizedSourceSha256,
  SOURCE_HASH_ALGORITHM,
  type RunnerSourceIdentity,
} from './data-migrations/source-identity';

const execFileAsync = promisify(execFile);

export const DATA_MIGRATIONS_SCHEMA_VERSION = 'kiditem.data-migrations.v1';
export const APPLY_DATA_MIGRATIONS_CONFIRMATION = 'APPLY_DATA_MIGRATIONS';
export const DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS = 120_000;
export const FAIL_ON_SOURCE_DRIFT_OPTION = 'fail-on-source-drift';
export const FAIL_ON_SOURCE_DRIFT_ENV = 'DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT';
const COMMANDS = ['status', 'up', 'help'] as const;
const DATA_MIGRATION_PHASES = ['all', 'pre-schema', 'post-schema'] as const;
type Command = (typeof COMMANDS)[number];
type DataMigrationPhase = (typeof DATA_MIGRATION_PHASES)[number];
type CliArgs = ParsedArgs<Command>;

function parseArgs(argv = process.argv.slice(2)): CliArgs {
  return parseRawArgs(argv, { commands: COMMANDS, defaultCommand: 'status' });
}

function repoRoot(): string {
  return path.resolve(__dirname, '..');
}

export function normalizeReleaseVersion(raw: string): string {
  const version = raw.trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid root VERSION: ${raw}`);
  }
  return version;
}

async function appReleaseVersion(): Promise<string> {
  return normalizeReleaseVersion(await readFile(path.join(repoRoot(), 'VERSION'), 'utf8'));
}

async function prismaSchemaHash(): Promise<string> {
  const root = repoRoot();
  const files = [
    'prisma/schema.prisma',
    'prisma.config.ts',
    ...(await readdir(path.join(root, 'prisma/models')))
      .filter((name) => name.endsWith('.prisma'))
      .sort()
      .map((name) => `prisma/models/${name}`),
  ];
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function gitSha(): Promise<string> {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot() });
  return stdout.trim();
}

/**
 * Reads a migration source from the checkout this runner belongs to, never
 * from the working directory, so an exact-SHA worktree hashes its own files.
 */
export function migrationSourceIdentity(
  migrationId: string,
  root = repoRoot(),
): RunnerSourceIdentity {
  const sourcePath = migrationSourcePath(migrationId);
  return {
    sourcePath,
    sourceSha256: normalizedSourceSha256(readFileSync(path.join(root, sourcePath))),
    hashAlgorithm: SOURCE_HASH_ALGORITHM,
  };
}

export function migrationSourceIdentities(
  migrations: readonly DataMigration[],
  root = repoRoot(),
): Map<string, RunnerSourceIdentity> {
  return new Map(
    migrations.map((migration) => [migration.id, migrationSourceIdentity(migration.id, root)]),
  );
}

const FULL_GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * Hashes a migration source as it was at a ledger row's `git_sha`. Commits
 * this checkout does not have, and any other failure, give null.
 */
export function gitSourceSha256Reader(
  root = repoRoot(),
): (commit: string, sourcePath: string) => Promise<string | null> {
  const cache = new Map<string, Promise<string | null>>();
  return (commit, sourcePath) => {
    if (!FULL_GIT_OBJECT_ID.test(commit)) return Promise.resolve(null);
    const object = `${commit}:${sourcePath}`;
    let pending = cache.get(object);
    if (!pending) {
      pending = execFileAsync('git', ['show', object], {
        cwd: root,
        encoding: 'buffer',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30_000,
      }).then(({ stdout }) => normalizedSourceSha256(stdout), () => null);
      cache.set(object, pending);
    }
    return pending;
  };
}

/**
 * `--fail-on-source-drift` (bare, or `true`/`1`/`false`/`0`) wins over
 * `DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT`; both default to warning only.
 */
export function failOnSourceDriftSetting(
  option: string | true | undefined,
  env: string | undefined,
): boolean {
  if (option === true) return true;
  const raw = (option ?? env ?? '').trim().toLowerCase();
  if (raw === '' || raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true') return true;
  throw new Error(
    `--${FAIL_ON_SOURCE_DRIFT_OPTION} and ${FAIL_ON_SOURCE_DRIFT_ENV} accept 1, 0, true, or false.`,
  );
}

function failOnSourceDrift(args: CliArgs): boolean {
  return failOnSourceDriftSetting(
    args.flags.has(FAIL_ON_SOURCE_DRIFT_OPTION) ? true : value(args, FAIL_ON_SOURCE_DRIFT_OPTION),
    process.env[FAIL_ON_SOURCE_DRIFT_ENV],
  );
}

function databaseUrl(args: CliArgs): string | null {
  return value(args, 'database-url') ?? process.env.DATABASE_URL ?? null;
}

function createPrisma(dbUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: dbUrl });
  return new PrismaClient({ adapter });
}

export function dataMigrationTransactionTimeoutMs(
  raw = process.env.DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('DATA_MIGRATION_TRANSACTION_TIMEOUT_MS must be a positive integer.');
  }
  return value;
}

export function normalizeDataMigrationPhase(raw: string | undefined): DataMigrationPhase {
  if (raw === undefined || raw.trim() === '') return 'all';
  const phase = raw.trim();
  if (!DATA_MIGRATION_PHASES.includes(phase as DataMigrationPhase)) {
    throw new Error('DATA_MIGRATION_PHASE must be all, pre-schema, or post-schema.');
  }
  return phase as DataMigrationPhase;
}

export function selectDataMigrationsForPhase(
  migrations: readonly DataMigration[],
  phase: DataMigrationPhase,
): readonly DataMigration[] {
  if (phase === 'all') return migrations;
  return migrations.filter((migration) => (migration.phase ?? 'post-schema') === phase);
}

export function selectDataMigrationsForRelease(
  migrations: readonly DataMigration[],
  rawReleaseVersion: string | undefined,
): readonly DataMigration[] {
  if (rawReleaseVersion === undefined || rawReleaseVersion.trim() === '') return migrations;
  const releaseVersion = normalizeReleaseVersion(rawReleaseVersion);
  return migrations.filter((migration) => migration.releaseVersion === releaseVersion);
}

export function dataMigrationRegistryStatus(
  currentSources: ReadonlyMap<string, RunnerSourceIdentity> = migrationSourceIdentities(dataMigrations),
) {
  return {
    migrations: dataMigrations.map((migration) => {
      const source = requireCurrentSource(currentSources, migration.id);
      return {
        id: migration.id,
        releaseVersion: migration.releaseVersion,
        name: migration.name,
        sourcePath: source.sourcePath,
        sourceSha256: source.sourceSha256,
      };
    }),
    retiredMigrations: retiredDataMigrations.map((migration) => ({
      ...migration,
      execution: 'inactive' as const,
    })),
  };
}

export function isDefinitelyProductionDatabaseUrl(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl);
    return /\bprod(?:uction)?\b/i.test(`${url.hostname} ${url.pathname}`);
  } catch {
    return /\bprod(?:uction)?\b/i.test(databaseUrl);
  }
}

export function assertApplyDataMigrationsConfirmation(confirm: string | undefined): void {
  if (confirm !== APPLY_DATA_MIGRATIONS_CONFIRMATION) {
    throw new Error(`Data migrations require --confirm ${APPLY_DATA_MIGRATIONS_CONFIRMATION}`);
  }
}

export function assertMutatingTarget(
  target: string | undefined,
  dbUrl: string,
): asserts target is DataMigrationTarget {
  if (target !== 'local' && target !== 'office') {
    throw new Error('Data migrations require --target local or office.');
  }
  if (isDefinitelyProductionDatabaseUrl(dbUrl)) {
    throw new Error(
      'Refusing to run data migrations against a database URL that looks like production.',
    );
  }
}

async function commandStatus(args: CliArgs): Promise<number> {
  const failOnDrift = failOnSourceDrift(args);
  const dbUrl = databaseUrl(args);
  const releaseVersion = await appReleaseVersion();
  const currentSources = migrationSourceIdentities(dataMigrations);
  const baseReport = {
    schemaVersion: DATA_MIGRATIONS_SCHEMA_VERSION,
    releaseVersion,
    schemaGitSha: await gitSha(),
    prismaSchemaHash: await prismaSchemaHash(),
    ...dataMigrationRegistryStatus(currentSources),
    checkedAt: new Date().toISOString(),
  };

  if (!dbUrl) {
    console.log(JSON.stringify({ ...baseReport, database: null }, null, 2));
    return 0;
  }

  const prisma = createPrisma(dbUrl);
  try {
    await prisma.$connect();
    const tableExists = await dataMigrationRunsTableExists(prisma);
    if (!tableExists) {
      console.log(JSON.stringify({
        ...baseReport,
        database: { tableExists, runs: [], sourceDrift: [] },
      }, null, 2));
      return 0;
    }
    const { runs, sourceDrift } = await checkLedgerSources(await readDataMigrationLedger(prisma), {
      current: currentSources,
      retiredIds: new Set(retiredDataMigrations.map(({ id }) => id)),
      deriveSourceSha256: gitSourceSha256Reader(),
    });
    console.log(JSON.stringify({
      ...baseReport,
      database: { tableExists, runs, sourceDrift },
    }, null, 2));
    return sourceDriftExitCode(sourceDrift, failOnDrift);
  } finally {
    await prisma.$disconnect();
  }
}

async function commandUp(args: CliArgs): Promise<void> {
  const dbUrl = requiredValue(args, 'database-url', 'DATABASE_URL');
  const target = value(args, 'target') ?? process.env.DATA_MIGRATION_TARGET;
  assertMutatingTarget(target, dbUrl);
  assertApplyDataMigrationsConfirmation(
    value(args, 'confirm') ?? process.env.DATA_MIGRATION_CONFIRM,
  );
  const phase = normalizeDataMigrationPhase(value(args, 'phase') ?? process.env.DATA_MIGRATION_PHASE);
  const releaseVersionFilter = value(args, 'release-version') ??
    process.env.DATA_MIGRATION_RELEASE_VERSION;
  const selectedMigrations = selectDataMigrationsForRelease(
    selectDataMigrationsForPhase(dataMigrations, phase),
    releaseVersionFilter,
  );
  const failOnDrift = failOnSourceDrift(args);
  const transactionTimeoutMs = dataMigrationTransactionTimeoutMs();
  // Every selected source is read before connecting: an unreadable file stops the run unwritten.
  const sourceIdentities = migrationSourceIdentities(selectedMigrations);
  let sourceDrift: SourceDriftEntry[] = [];

  const prisma = createPrisma(dbUrl);
  const releaseVersion = await appReleaseVersion();
  const schemaGitSha = await gitSha();
  const schemaHash = await prismaSchemaHash();
  const results: Array<{ migrationId: string; status: string; affectedRows: number }> = [];
  try {
    await prisma.$connect();
    if (!(await dataMigrationRunsTableExists(prisma))) {
      throw new Error('data_migration_runs table is missing. Run `npm run db:push` before `npm run data:migrate -- up`.');
    }
    const applied = await applyDataMigrations(prisma, selectedMigrations, {
      context: { target },
      identity: { schemaGitSha, prismaSchemaHash: schemaHash },
      currentSources: sourceIdentities,
      transactionTimeoutMs,
      failOnSourceDrift: failOnDrift,
      warn: (message) => console.warn(message),
    });
    sourceDrift = applied.sourceDrift;
    results.push(...applied.results);
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({
    schemaVersion: DATA_MIGRATIONS_SCHEMA_VERSION,
    releaseVersion,
    phase,
    schemaGitSha,
    prismaSchemaHash: schemaHash,
    migrationIds: selectedMigrations.map((migration) => migration.id),
    releaseVersions: [...new Set(selectedMigrations.map((migration) => migration.releaseVersion))],
    sourceDrift,
    results,
  }, null, 2));
}

function printHelp(): void {
  console.log(`Usage:
  npm run data:migrate -- status [--database-url <url>] [--${FAIL_ON_SOURCE_DRIFT_OPTION}]
  npm run data:migrate -- up [--phase all|pre-schema|post-schema] [--release-version <version>] [--${FAIL_ON_SOURCE_DRIFT_OPTION}] --target local|office --confirm ${APPLY_DATA_MIGRATIONS_CONFIRMATION}

Source drift:
  Each run stores the migration file it executed in details._runner
  (sourcePath, sourceSha256, hashAlgorithm ${SOURCE_HASH_ALGORITHM}: SHA-256 after CRLF -> LF).
  status labels every ledger row with sourceCheck and lists succeeded rows whose
  source has changed since in database.sourceDrift; it exits 0.
  up warns on stderr for each already-applied migration whose file changed,
  still skips it, and exits 0.
  --${FAIL_ON_SOURCE_DRIFT_OPTION}
                               status exits 3 when a recorded source hash differs;
                               up stops before the first migration when one does.

Env:
  DATABASE_URL                 Database URL used when --database-url is omitted.
  DATA_MIGRATION_TARGET        local or office.
  DATA_MIGRATION_CONFIRM       ${APPLY_DATA_MIGRATIONS_CONFIRMATION}
  DATA_MIGRATION_PHASE         all, pre-schema, or post-schema. Defaults to all.
  DATA_MIGRATION_RELEASE_VERSION
                               Optional exact releaseVersion filter for phased Office promotions.
  DATA_MIGRATION_TRANSACTION_TIMEOUT_MS
                               Interactive transaction timeout in ms. Defaults to ${DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS}.
  ${FAIL_ON_SOURCE_DRIFT_ENV}
                               1 behaves like --${FAIL_ON_SOURCE_DRIFT_OPTION}; 0 or unset only warns.
`);
}

async function main(): Promise<number> {
  const args = parseArgs();
  if (args.command === 'help') {
    printHelp();
    return 0;
  }
  if (args.command === 'status') {
    return commandStatus(args);
  }
  await commandUp(args);
  return 0;
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
