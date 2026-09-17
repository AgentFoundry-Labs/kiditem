import type { PrismaClient } from '@prisma/client';
import {
  classifySourceCheck,
  detailsWithRunnerSource,
  migrationSourcePath,
  RUNNER_DETAILS_KEY,
  recordedRunnerSourceSha256,
  type RunnerSourceIdentity,
  type SourceCheck,
} from './source-identity';
import type {
  DataMigration,
  DataMigrationContext,
  MigrationResult,
} from './types';

/**
 * The `data_migration_runs` ledger: one row per migration id. A succeeded row
 * is never run or rewritten again. Each run records the source it executed in
 * `details._runner`, so a later check can report an applied migration whose
 * file has changed since. SQL here spells that key as the literal `'_runner'`
 * (`RUNNER_DETAILS_KEY`).
 */

export type DataMigrationRunIdentity = {
  schemaGitSha: string;
  prismaSchemaHash: string;
};

export type AppliedMigrationRun = {
  status: string;
  affectedRows: number;
  gitSha: string | null;
  recordedSourceSha256: string | null;
};

export type AppliedDataMigrationResult = {
  migrationId: string;
  status: 'skipped' | 'succeeded';
  affectedRows: number;
};

export type SourceDriftEntry = {
  migrationId: string;
  sourceCheck: 'drift' | 'unrecorded-derived-drift';
  sourcePath: string;
  ranSourceSha256: string;
  currentSourceSha256: string;
  gitSha: string | null;
};

export type LedgerRun = {
  migrationId: string;
  name: string;
  releaseVersion: string;
  status: string;
  affectedRows: number;
  gitSha: string | null;
  prismaSchemaHash: string | null;
  completedAt: Date | null;
  error: string | null;
  runner: unknown;
};

export type CheckedLedgerRun = LedgerRun & { sourceCheck: SourceCheck };

export type LedgerSourceContext = {
  /** Current source of every registered migration id. */
  current: ReadonlyMap<string, RunnerSourceIdentity>;
  retiredIds: ReadonlySet<string>;
  /** Normalized hash of `sourcePath` at `gitSha`, or null when unavailable. */
  deriveSourceSha256(gitSha: string, sourcePath: string): Promise<string | null>;
};

export async function dataMigrationRunsTableExists(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.data_migration_runs') IS NOT NULL AS exists
  `;
  return rows[0]?.exists === true;
}

export async function readAppliedMigrationRun(
  prisma: PrismaClient,
  migrationId: string,
): Promise<AppliedMigrationRun | null> {
  const rows = await prisma.$queryRaw<
    Array<{ status: string; affectedRows: number; gitSha: string | null; runner: unknown }>
  >`
    SELECT status,
           affected_rows AS "affectedRows",
           git_sha AS "gitSha",
           details->'_runner' AS runner
    FROM data_migration_runs
    WHERE migration_id = ${migrationId}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    status: row.status,
    affectedRows: row.affectedRows,
    gitSha: row.gitSha,
    recordedSourceSha256: recordedRunnerSourceSha256(row.runner),
  };
}

export async function readDataMigrationLedger(prisma: PrismaClient): Promise<LedgerRun[]> {
  return prisma.$queryRaw<LedgerRun[]>`
    SELECT migration_id AS "migrationId",
           name,
           release_version AS "releaseVersion",
           status,
           affected_rows AS "affectedRows",
           git_sha AS "gitSha",
           prisma_schema_hash AS "prismaSchemaHash",
           completed_at AS "completedAt",
           error,
           details->'_runner' AS runner
    FROM data_migration_runs
    ORDER BY started_at, migration_id
  `;
}

export function requireCurrentSource(
  current: ReadonlyMap<string, RunnerSourceIdentity>,
  migrationId: string,
): RunnerSourceIdentity {
  const source = current.get(migrationId);
  if (!source) {
    throw new Error(`No source identity was read for data migration ${migrationId}.`);
  }
  return source;
}

async function markMigrationRunning(
  prisma: PrismaClient,
  migration: DataMigration,
  identity: DataMigrationRunIdentity,
  runner: RunnerSourceIdentity,
): Promise<void> {
  const details = JSON.stringify({ [RUNNER_DETAILS_KEY]: runner });
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
      ${identity.schemaGitSha},
      ${identity.prismaSchemaHash},
      0,
      ${details}::jsonb,
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
      details = EXCLUDED.details,
      error = NULL,
      started_at = now(),
      completed_at = NULL,
      updated_at = now()
  `;
}

async function markMigrationSucceeded(
  prisma: PrismaClient,
  migration: DataMigration,
  identity: DataMigrationRunIdentity,
  result: MigrationResult,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE data_migration_runs
    SET status = 'succeeded',
        release_version = ${migration.releaseVersion},
        git_sha = ${identity.schemaGitSha},
        prisma_schema_hash = ${identity.prismaSchemaHash},
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

/**
 * Runs one migration unless its ledger row already succeeded. `runner` is the
 * source the caller read for this migration; it is stored with the run and
 * merged into the migration's own details inside the migration transaction.
 */
export async function applyDataMigration(
  prisma: PrismaClient,
  migration: DataMigration,
  context: DataMigrationContext,
  identity: DataMigrationRunIdentity,
  runner: RunnerSourceIdentity,
  transactionTimeoutMs: number,
): Promise<AppliedDataMigrationResult> {
  if (runner.sourcePath !== migrationSourcePath(migration.id)) {
    throw new Error(
      `Source identity ${runner.sourcePath} does not belong to data migration ${migration.id}.`,
    );
  }
  const existing = await readAppliedMigrationRun(prisma, migration.id);
  if (existing?.status === 'succeeded') {
    return { migrationId: migration.id, status: 'skipped', affectedRows: existing.affectedRows };
  }

  await markMigrationRunning(prisma, migration, identity, runner);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const migrationResult = await migration.run(tx, context);
      return {
        affectedRows: migrationResult.affectedRows,
        details: detailsWithRunnerSource(migration.id, migrationResult.details, runner),
      };
    }, { timeout: transactionTimeoutMs });
    await markMigrationSucceeded(prisma, migration, identity, result);
    return { migrationId: migration.id, status: 'succeeded', affectedRows: result.affectedRows };
  } catch (error) {
    await markMigrationFailed(prisma, migration, error);
    throw error;
  }
}

/**
 * Selected migrations whose succeeded row records a different source than the
 * current file. `up` still skips them, so the changed file never runs there.
 * Only the selected ids are read; ledger rows for other ids are not consulted.
 */
export async function findAppliedSourceDrift(
  migrations: readonly DataMigration[],
  current: ReadonlyMap<string, RunnerSourceIdentity>,
  readRun: (migrationId: string) => Promise<AppliedMigrationRun | null>,
): Promise<SourceDriftEntry[]> {
  const drift: SourceDriftEntry[] = [];
  for (const migration of migrations) {
    const source = requireCurrentSource(current, migration.id);
    const run = await readRun(migration.id);
    if (run?.status !== 'succeeded' || run.recordedSourceSha256 === null) continue;
    if (run.recordedSourceSha256 === source.sourceSha256) continue;
    drift.push({
      migrationId: migration.id,
      sourceCheck: 'drift',
      sourcePath: source.sourcePath,
      ranSourceSha256: run.recordedSourceSha256,
      currentSourceSha256: source.sourceSha256,
      gitSha: run.gitSha,
    });
  }
  return drift;
}

export function sourceDriftWarning(entry: SourceDriftEntry): string {
  return `Data migration ${entry.migrationId} ran from source ${entry.ranSourceSha256}, ` +
    `but ${entry.sourcePath} is now ${entry.currentSourceSha256}. ` +
    'It will not run again; a fix needs a new migration id.';
}

/**
 * The `up` preflight: warns once per drifted migration and, only when asked
 * to fail on drift, stops before the first migration runs.
 */
export async function preflightAppliedSourceDrift(
  migrations: readonly DataMigration[],
  current: ReadonlyMap<string, RunnerSourceIdentity>,
  readRun: (migrationId: string) => Promise<AppliedMigrationRun | null>,
  options: { failOnSourceDrift: boolean; warn(message: string): void },
): Promise<SourceDriftEntry[]> {
  const drift = await findAppliedSourceDrift(migrations, current, readRun);
  for (const entry of drift) options.warn(sourceDriftWarning(entry));
  if (drift.length > 0 && options.failOnSourceDrift) {
    throw new Error(
      `Refusing to run data migrations: source drift was found in ${drift.length} applied ` +
        `migration(s) (${drift.map(({ migrationId }) => migrationId).join(', ')}) and ` +
        'fail-on-source-drift is set.',
    );
  }
  return drift;
}

export type ApplyDataMigrationsOptions = {
  context: DataMigrationContext;
  identity: DataMigrationRunIdentity;
  /** Source of every selected migration, read before any database write. */
  currentSources: ReadonlyMap<string, RunnerSourceIdentity>;
  transactionTimeoutMs: number;
  failOnSourceDrift: boolean;
  warn(message: string): void;
};

/**
 * `up` for a selection. The source drift preflight runs first, so a refusal
 * happens before any migration runs or any ledger row is written.
 */
export async function applyDataMigrations(
  prisma: PrismaClient,
  migrations: readonly DataMigration[],
  options: ApplyDataMigrationsOptions,
): Promise<{ sourceDrift: SourceDriftEntry[]; results: AppliedDataMigrationResult[] }> {
  const sourceDrift = await preflightAppliedSourceDrift(
    migrations,
    options.currentSources,
    (migrationId) => readAppliedMigrationRun(prisma, migrationId),
    options,
  );
  const results: AppliedDataMigrationResult[] = [];
  for (const migration of migrations) {
    results.push(await applyDataMigration(
      prisma,
      migration,
      options.context,
      options.identity,
      requireCurrentSource(options.currentSources, migration.id),
      options.transactionTimeoutMs,
    ));
  }
  return { sourceDrift, results };
}

/**
 * Labels every ledger row with its source check. Rows without a recorded hash
 * are compared through `git_sha` when possible. Only succeeded rows can
 * drift: a failed or interrupted row runs again from the current file.
 */
export async function checkLedgerSources(
  runs: readonly LedgerRun[],
  sources: LedgerSourceContext,
): Promise<{ runs: CheckedLedgerRun[]; sourceDrift: SourceDriftEntry[] }> {
  const checkedRuns: CheckedLedgerRun[] = [];
  const sourceDrift: SourceDriftEntry[] = [];
  for (const run of runs) {
    const current = sources.current.get(run.migrationId) ?? null;
    const recordedSha256 = current ? recordedRunnerSourceSha256(run.runner) : null;
    const derivedSha256 = current && recordedSha256 === null && run.gitSha
      ? await sources.deriveSourceSha256(run.gitSha, current.sourcePath)
      : null;
    const sourceCheck = classifySourceCheck({
      registered: current !== null,
      retired: sources.retiredIds.has(run.migrationId),
      recordedSha256,
      currentSha256: current?.sourceSha256 ?? null,
      derivedSha256,
    });
    checkedRuns.push({ ...run, sourceCheck });
    const ranSourceSha256 = recordedSha256 ?? derivedSha256;
    if (
      current &&
      ranSourceSha256 !== null &&
      run.status === 'succeeded' &&
      (sourceCheck === 'drift' || sourceCheck === 'unrecorded-derived-drift')
    ) {
      sourceDrift.push({
        migrationId: run.migrationId,
        sourceCheck,
        sourcePath: current.sourcePath,
        ranSourceSha256,
        currentSourceSha256: current.sourceSha256,
        gitSha: run.gitSha,
      });
    }
  }
  return { runs: checkedRuns, sourceDrift };
}

/** `status` exits 3 only when asked to and a recorded hash differs. */
export function sourceDriftExitCode(
  sourceDrift: readonly SourceDriftEntry[],
  failOnSourceDrift: boolean,
): 0 | 3 {
  return failOnSourceDrift && sourceDrift.some(({ sourceCheck }) => sourceCheck === 'drift')
    ? 3
    : 0;
}
