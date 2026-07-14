#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
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
} from './data-migrations/index';
import type {
  DataMigrationContext,
  DataMigrationTarget,
  DataMigration,
  MigrationResult,
} from './data-migrations/types';

const execFileAsync = promisify(execFile);

export const DATA_MIGRATIONS_SCHEMA_VERSION = 'kiditem.data-migrations.v1';
export const APPLY_DATA_MIGRATIONS_CONFIRMATION = 'APPLY_DATA_MIGRATIONS';
export const DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS = 120_000;

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
  env: Readonly<Record<string, string | undefined>> = process.env,
): asserts target is DataMigrationTarget {
  if (target === 'local' || target === 'staging') {
    if (isDefinitelyProductionDatabaseUrl(dbUrl)) {
      throw new Error('Refusing to run data migrations against a database URL that looks like production.');
    }
    return;
  }
  if (target === 'production') {
    if (env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Production data migrations may run only inside GitHub Actions.');
    }
    if (env.DATA_MIGRATION_PRODUCTION_CONFIRM !== 'DEPLOY_PRODUCTION') {
      throw new Error('Production data migrations require DATA_MIGRATION_PRODUCTION_CONFIRM=DEPLOY_PRODUCTION.');
    }
    return;
  }
  throw new Error('Data migrations require --target local, staging, or production.');
}

async function dataMigrationRunsTableExists(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.data_migration_runs') IS NOT NULL AS exists
  `;
  return rows[0]?.exists === true;
}

async function findMigrationRun(
  prisma: PrismaClient,
  migrationId: string,
): Promise<{ status: string; affectedRows: number } | null> {
  const rows = await prisma.$queryRaw<Array<{ status: string; affectedRows: number }>>`
    SELECT status, affected_rows AS "affectedRows"
    FROM data_migration_runs
    WHERE migration_id = ${migrationId}
  `;
  return rows[0] ?? null;
}

async function markMigrationRunning(
  prisma: PrismaClient,
  migration: DataMigration,
  schemaGitSha: string,
  schemaHash: string,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO data_migration_runs (
      migration_id,
      release_version,
      name,
      status,
      git_sha,
      prisma_schema_hash,
      affected_rows,
      details,
      error,
      started_at,
      completed_at,
      created_at,
      updated_at
    )
    VALUES (
      ${migration.id},
      ${migration.releaseVersion},
      ${migration.name},
      'running',
      ${schemaGitSha},
      ${schemaHash},
      0,
      '{}'::jsonb,
      NULL,
      now(),
      NULL,
      now(),
      now()
    )
    ON CONFLICT (migration_id) DO UPDATE SET
      name = EXCLUDED.name,
      release_version = EXCLUDED.release_version,
      status = 'running',
      git_sha = EXCLUDED.git_sha,
      prisma_schema_hash = EXCLUDED.prisma_schema_hash,
      affected_rows = 0,
      details = '{}'::jsonb,
      error = NULL,
      started_at = now(),
      completed_at = NULL,
      updated_at = now()
  `;
}

async function markMigrationSucceeded(
  prisma: PrismaClient,
  migration: DataMigration,
  schemaGitSha: string,
  schemaHash: string,
  result: MigrationResult,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE data_migration_runs
    SET status = 'succeeded',
        release_version = ${migration.releaseVersion},
        git_sha = ${schemaGitSha},
        prisma_schema_hash = ${schemaHash},
        affected_rows = ${result.affectedRows},
        details = ${JSON.stringify(result.details)}::jsonb,
        error = NULL,
        completed_at = now(),
        updated_at = now()
    WHERE migration_id = ${migration.id}
  `;
}

async function markMigrationFailed(
  prisma: PrismaClient,
  migration: DataMigration,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await prisma.$executeRaw`
    UPDATE data_migration_runs
    SET status = 'failed',
        error = ${message},
        completed_at = now(),
        updated_at = now()
    WHERE migration_id = ${migration.id}
  `;
}

async function runOneMigration(
  prisma: PrismaClient,
  migration: DataMigration,
  context: DataMigrationContext,
  schemaGitSha: string,
  schemaHash: string,
): Promise<{ migrationId: string; status: 'skipped' | 'succeeded'; affectedRows: number }> {
  const existing = await findMigrationRun(prisma, migration.id);
  if (existing?.status === 'succeeded') {
    return { migrationId: migration.id, status: 'skipped', affectedRows: existing.affectedRows };
  }

  await markMigrationRunning(prisma, migration, schemaGitSha, schemaHash);
  try {
    const result = await prisma.$transaction((tx) => migration.run(tx, context), {
      timeout: dataMigrationTransactionTimeoutMs(),
    });
    await markMigrationSucceeded(prisma, migration, schemaGitSha, schemaHash, result);
    return { migrationId: migration.id, status: 'succeeded', affectedRows: result.affectedRows };
  } catch (error) {
    await markMigrationFailed(prisma, migration, error);
    throw error;
  }
}

async function commandStatus(args: CliArgs): Promise<void> {
  const dbUrl = databaseUrl(args);
  const releaseVersion = await appReleaseVersion();
  const baseReport = {
    schemaVersion: DATA_MIGRATIONS_SCHEMA_VERSION,
    releaseVersion,
    schemaGitSha: await gitSha(),
    prismaSchemaHash: await prismaSchemaHash(),
    migrations: dataMigrations.map((migration) => ({
      id: migration.id,
      releaseVersion: migration.releaseVersion,
      name: migration.name,
    })),
    checkedAt: new Date().toISOString(),
  };

  if (!dbUrl) {
    console.log(JSON.stringify({ ...baseReport, database: null }, null, 2));
    return;
  }

  const prisma = createPrisma(dbUrl);
  try {
    await prisma.$connect();
    const tableExists = await dataMigrationRunsTableExists(prisma);
    if (!tableExists) {
      console.log(JSON.stringify({ ...baseReport, database: { tableExists, runs: [] } }, null, 2));
      return;
    }
    const runs = await prisma.$queryRaw`
      SELECT migration_id AS "migrationId",
             name,
             release_version AS "releaseVersion",
             status,
             affected_rows AS "affectedRows",
             git_sha AS "gitSha",
             prisma_schema_hash AS "prismaSchemaHash",
             completed_at AS "completedAt",
             error
      FROM data_migration_runs
      ORDER BY started_at, migration_id
    `;
    console.log(JSON.stringify({ ...baseReport, database: { tableExists, runs } }, null, 2));
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
  const selectedMigrations = selectDataMigrationsForPhase(dataMigrations, phase);

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
    for (const migration of selectedMigrations) {
      results.push(await runOneMigration(
        prisma,
        migration,
        { target },
        schemaGitSha,
        schemaHash,
      ));
    }
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
    results,
  }, null, 2));
}

function printHelp(): void {
  console.log(`Usage:
  npm run data:migrate -- status [--database-url <url>]
  npm run data:migrate -- up [--phase all|pre-schema|post-schema] --target local|staging|production --confirm ${APPLY_DATA_MIGRATIONS_CONFIRMATION}

Env:
  DATABASE_URL                 Database URL used when --database-url is omitted.
  DATA_MIGRATION_TARGET        local, staging, or production. Production additionally requires GitHub Actions and the production confirmation below.
  DATA_MIGRATION_CONFIRM       ${APPLY_DATA_MIGRATIONS_CONFIRMATION}
  DATA_MIGRATION_PRODUCTION_CONFIRM
                               Must be DEPLOY_PRODUCTION for target production.
  DATA_MIGRATION_PHASE         all, pre-schema, or post-schema. Defaults to all.
  DATA_MIGRATION_TRANSACTION_TIMEOUT_MS
                               Interactive transaction timeout in ms. Defaults to ${DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS}.
`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.command === 'help') {
    printHelp();
    return;
  }
  if (args.command === 'status') {
    await commandStatus(args);
    return;
  }
  await commandUp(args);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
