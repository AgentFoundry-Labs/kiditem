import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestPrisma, resetDb } from '../test-helpers/real-prisma';
import {
  applyDataMigration,
  applyDataMigrations,
  checkLedgerSources,
  readDataMigrationLedger,
  sourceDriftExitCode,
  type ApplyDataMigrationsOptions,
  type DataMigrationRunIdentity,
  type LedgerSourceContext,
  type SourceDriftEntry,
} from '../../../../scripts/data-migrations/ledger';
import {
  migrationSourcePath,
  normalizedSourceSha256,
  SOURCE_HASH_ALGORITHM,
  type RunnerSourceIdentity,
} from '../../../../scripts/data-migrations/source-identity';
import type { DataMigration, MigrationResult } from '../../../../scripts/data-migrations/types';

const repoRoot = path.resolve(__dirname, '../../../..');
const runnerPath = path.join(repoRoot, 'scripts/run-data-migrations.ts');

const PROBE_ID = 'v0.0.0:901_record_source_hash_probe';
const LATER_PROBE_ID = 'v0.0.0:902_later_source_hash_probe';
const RESERVED_KEY_PROBE_ID = 'v0.0.0:903_reserved_runner_key_probe';
const RUN_IDENTITY: DataMigrationRunIdentity = {
  schemaGitSha: 'a'.repeat(40),
  prismaSchemaHash: 'b'.repeat(64),
};
const LEGACY_COMMIT = 'c'.repeat(40);
const TRANSACTION_TIMEOUT_MS = 30_000;
// Ids an Office ledger still holds after they left the executable registry.
const UNREGISTERED_ID = 'v0.1.21:001_backfill_inventory_commitments';
const RETIRED_ID = 'v0.1.26:001_initialize_master_product_abc_policy';
const SEEDED_AT = new Date('2026-09-01T00:00:00.000Z');

type SeededRun = {
  migrationId: string;
  releaseVersion?: string;
  status: string;
  details: Prisma.InputJsonValue;
  gitSha?: string | null;
};

type CliResult = { code: number; stdout: string; stderr: string };

function sourceOf(migrationId: string, text: string): RunnerSourceIdentity {
  return {
    sourcePath: migrationSourcePath(migrationId),
    sourceSha256: normalizedSourceSha256(text),
    hashAlgorithm: SOURCE_HASH_ALGORITHM,
  };
}

function checkoutSourceSha256(migrationId: string): string {
  return normalizedSourceSha256(readFileSync(path.join(repoRoot, migrationSourcePath(migrationId))));
}

function probeMigration(id: string, details: () => Record<string, unknown>) {
  const run = vi.fn(async (tx: Prisma.TransactionClient): Promise<MigrationResult> => {
    await tx.$executeRaw`INSERT INTO data_migration_source_hash_probe (migration_id) VALUES (${id})`;
    return { affectedRows: 1, details: details() };
  });
  const migration: DataMigration = { id, releaseVersion: '0.0.0', name: `Probe ${id}`, run };
  return { migration, run };
}

function versionedResults(results: Array<{ migrationId: string }>) {
  return results.filter(({ migrationId }) => migrationId.startsWith('v'));
}

/**
 * The ledger records the source each data migration ran from in
 * `details._runner`. `up` keeps skipping succeeded ids and only warns when
 * their file changed, unless asked to fail; `status` labels every row, old
 * and unregistered rows included, without rewriting any of them.
 */
describe('data migration ledger source hash (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let databaseUrl: string;
  let cliWorkingDirectory: string | undefined;

  async function seedLedgerRow(row: SeededRun): Promise<void> {
    await prisma.dataMigrationRun.create({
      data: {
        migrationId: row.migrationId,
        releaseVersion: row.releaseVersion ?? row.migrationId.slice(1, row.migrationId.indexOf(':')),
        name: `Seeded ${row.migrationId}`,
        status: row.status,
        gitSha: row.gitSha ?? null,
        prismaSchemaHash: 'e'.repeat(64),
        affectedRows: 0,
        details: row.details,
        error: row.status === 'failed' ? 'seeded failure' : null,
        startedAt: SEEDED_AT,
        completedAt: SEEDED_AT,
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    });
  }

  async function ledgerRows(migrationId?: string) {
    return prisma.dataMigrationRun.findMany({
      where: migrationId ? { migrationId } : undefined,
      orderBy: { migrationId: 'asc' },
    });
  }

  async function probeWrites(): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ migration_id: string }>>`
      SELECT migration_id FROM data_migration_source_hash_probe ORDER BY migration_id
    `;
    return rows.map((row) => row.migration_id);
  }

  function upOptions(
    currentSources: ReadonlyMap<string, RunnerSourceIdentity>,
    overrides: Partial<ApplyDataMigrationsOptions> = {},
  ): ApplyDataMigrationsOptions {
    return {
      context: { target: 'local' },
      identity: RUN_IDENTITY,
      currentSources,
      transactionTimeoutMs: TRANSACTION_TIMEOUT_MS,
      failOnSourceDrift: false,
      warn: vi.fn(),
      ...overrides,
    };
  }

  function statusSources(
    current: ReadonlyMap<string, RunnerSourceIdentity>,
    overrides: Partial<LedgerSourceContext> = {},
  ): LedgerSourceContext {
    return {
      current,
      retiredIds: new Set([RETIRED_ID]),
      deriveSourceSha256: async () => null,
      ...overrides,
    };
  }

  async function sourceChecks(sources: LedgerSourceContext) {
    const report = await checkLedgerSources(await readDataMigrationLedger(prisma), sources);
    return {
      labels: Object.fromEntries(report.runs.map((run) => [run.migrationId, run.sourceCheck])),
      sourceDrift: report.sourceDrift,
    };
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    databaseUrl = process.env.DATABASE_URL as string;
    await prisma.$connect();
    await resetDb(prisma);
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS data_migration_source_hash_probe (migration_id text NOT NULL)
    `;
  });

  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM data_migration_runs`;
    await prisma.$executeRaw`DELETE FROM data_migration_source_hash_probe`;
  });

  afterAll(async () => {
    if (cliWorkingDirectory) await rm(cliWorkingDirectory, { recursive: true, force: true });
    if (!prisma) return;
    await prisma.$executeRaw`DROP TABLE IF EXISTS data_migration_source_hash_probe`;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('stores _runner next to the migration details, then skips the id without running or rewriting it', async () => {
    const ran = sourceOf(PROBE_ID, 'export const probe = 1;\n');
    const { migration, run } = probeMigration(PROBE_ID, () => ({ probe: 'ok' }));

    await expect(
      applyDataMigration(prisma, migration, { target: 'local' }, RUN_IDENTITY, ran, TRANSACTION_TIMEOUT_MS),
    ).resolves.toEqual({ migrationId: PROBE_ID, status: 'succeeded', affectedRows: 1 });

    const [row] = await ledgerRows(PROBE_ID);
    expect(row).toMatchObject({
      status: 'succeeded',
      releaseVersion: '0.0.0',
      affectedRows: 1,
      gitSha: RUN_IDENTITY.schemaGitSha,
      prismaSchemaHash: RUN_IDENTITY.prismaSchemaHash,
      error: null,
    });
    expect(row.details).toEqual({
      probe: 'ok',
      _runner: {
        sourcePath: 'scripts/data-migrations/v0.0.0/901_record_source_hash_probe.ts',
        sourceSha256: ran.sourceSha256,
        hashAlgorithm: 'sha256-lf',
      },
    });

    const changed = sourceOf(PROBE_ID, 'export const probe = 2;\n');
    await expect(
      applyDataMigration(prisma, migration, { target: 'local' }, RUN_IDENTITY, changed, TRANSACTION_TIMEOUT_MS),
    ).resolves.toEqual({ migrationId: PROBE_ID, status: 'skipped', affectedRows: 1 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await ledgerRows(PROBE_ID)).toEqual([row]);
    expect(await probeWrites()).toEqual([PROBE_ID]);
  });

  it('refuses a source identity that belongs to another migration before writing anything', async () => {
    const { migration, run } = probeMigration(PROBE_ID, () => ({}));

    await expect(
      applyDataMigration(
        prisma,
        migration,
        { target: 'local' },
        RUN_IDENTITY,
        sourceOf(LATER_PROBE_ID, 'export {};\n'),
        TRANSACTION_TIMEOUT_MS,
      ),
    ).rejects.toThrow(/does not belong to data migration/);
    expect(run).not.toHaveBeenCalled();
    expect(await ledgerRows()).toEqual([]);
  });

  it('reports a changed applied source as drift; up warns by default and the flag stops it before any migration runs', async () => {
    const ran = sourceOf(PROBE_ID, 'export const probe = 1;\n');
    const applied = probeMigration(PROBE_ID, () => ({ probe: 'first' }));
    await applyDataMigrations(prisma, [applied.migration], upOptions(new Map([[PROBE_ID, ran]])));
    const appliedRow = await ledgerRows(PROBE_ID);

    // A Windows checkout of the same file is not drift.
    const sameOnWindows = sourceOf(PROBE_ID, 'export const probe = 1;\r\n');
    expect(sameOnWindows.sourceSha256).toBe(ran.sourceSha256);
    const unchanged = await sourceChecks(statusSources(new Map([[PROBE_ID, sameOnWindows]])));
    expect(unchanged).toEqual({ labels: { [PROBE_ID]: 'match' }, sourceDrift: [] });

    const changed = sourceOf(PROBE_ID, 'export const probe = 1;\r\n// edited after it ran\r\n');
    const later = sourceOf(LATER_PROBE_ID, 'export const later = true;\n');
    const currentSources = new Map([
      [PROBE_ID, changed],
      [LATER_PROBE_ID, later],
    ]);
    const expectedDrift: SourceDriftEntry = {
      migrationId: PROBE_ID,
      sourceCheck: 'drift',
      sourcePath: changed.sourcePath,
      ranSourceSha256: ran.sourceSha256,
      currentSourceSha256: changed.sourceSha256,
      gitSha: RUN_IDENTITY.schemaGitSha,
    };

    const derive = vi.fn(async () => null);
    const status = await sourceChecks(statusSources(currentSources, { deriveSourceSha256: derive }));
    expect(status).toEqual({ labels: { [PROBE_ID]: 'drift' }, sourceDrift: [expectedDrift] });
    expect(derive).not.toHaveBeenCalled();
    expect(sourceDriftExitCode(status.sourceDrift, false)).toBe(0);
    expect(sourceDriftExitCode(status.sourceDrift, true)).toBe(3);

    const pendingForRefusal = probeMigration(LATER_PROBE_ID, () => ({ later: true }));
    const refusalWarn = vi.fn();
    await expect(
      applyDataMigrations(
        prisma,
        [applied.migration, pendingForRefusal.migration],
        upOptions(currentSources, { failOnSourceDrift: true, warn: refusalWarn }),
      ),
    ).rejects.toThrow(`Refusing to run data migrations: source drift was found in 1 applied migration(s) (${PROBE_ID})`);
    expect(refusalWarn).toHaveBeenCalledTimes(1);
    expect(pendingForRefusal.run).not.toHaveBeenCalled();
    expect(await ledgerRows()).toEqual(appliedRow);
    expect(await probeWrites()).toEqual([PROBE_ID]);

    const pending = probeMigration(LATER_PROBE_ID, () => ({ later: true }));
    const warn = vi.fn();
    await expect(
      applyDataMigrations(prisma, [applied.migration, pending.migration], upOptions(currentSources, { warn })),
    ).resolves.toEqual({
      sourceDrift: [expectedDrift],
      results: [
        { migrationId: PROBE_ID, status: 'skipped', affectedRows: 1 },
        { migrationId: LATER_PROBE_ID, status: 'succeeded', affectedRows: 1 },
      ],
    });
    expect(warn.mock.calls).toEqual([[
      `Data migration ${PROBE_ID} ran from source ${ran.sourceSha256}, but ${changed.sourcePath} ` +
        `is now ${changed.sourceSha256}. It will not run again; a fix needs a new migration id.`,
    ]]);
    expect(applied.run).toHaveBeenCalledTimes(1);
    expect(await ledgerRows(PROBE_ID)).toEqual(appliedRow);
    expect((await ledgerRows(LATER_PROBE_ID))[0].details).toEqual({ later: true, _runner: later });
    expect(await probeWrites()).toEqual([PROBE_ID, LATER_PROBE_ID]);
  });

  it('fails and rolls back a migration whose details use the reserved _runner key, and reruns the fixed source', async () => {
    const attempted = sourceOf(RESERVED_KEY_PROBE_ID, 'export const reserved = 1;\n');
    const reserved = probeMigration(RESERVED_KEY_PROBE_ID, () => ({ _runner: 'owned by the migration' }));

    await expect(
      applyDataMigration(prisma, reserved.migration, { target: 'local' }, RUN_IDENTITY, attempted, TRANSACTION_TIMEOUT_MS),
    ).rejects.toThrow(`Data migration ${RESERVED_KEY_PROBE_ID} returned details._runner`);
    expect(reserved.run).toHaveBeenCalledTimes(1);
    expect(await probeWrites()).toEqual([]);
    const [failed] = await ledgerRows(RESERVED_KEY_PROBE_ID);
    expect(failed).toMatchObject({ status: 'failed', affectedRows: 0 });
    expect(failed.error).toContain('a key reserved for the runner');
    expect(failed.details).toEqual({ _runner: attempted });

    // A failed attempt runs again from the current file, so it is never listed as drift.
    const fixedSource = sourceOf(RESERVED_KEY_PROBE_ID, 'export const reserved = 2;\n');
    const current = new Map([[RESERVED_KEY_PROBE_ID, fixedSource]]);
    const beforeRetry = await sourceChecks(statusSources(current));
    expect(beforeRetry).toEqual({ labels: { [RESERVED_KEY_PROBE_ID]: 'drift' }, sourceDrift: [] });

    const fixed = probeMigration(RESERVED_KEY_PROBE_ID, () => ({ owned: true }));
    const warn = vi.fn();
    await expect(
      applyDataMigrations(prisma, [fixed.migration], upOptions(current, { failOnSourceDrift: true, warn })),
    ).resolves.toEqual({
      sourceDrift: [],
      results: [{ migrationId: RESERVED_KEY_PROBE_ID, status: 'succeeded', affectedRows: 1 }],
    });
    expect(warn).not.toHaveBeenCalled();
    const [succeeded] = await ledgerRows(RESERVED_KEY_PROBE_ID);
    expect(succeeded).toMatchObject({ status: 'succeeded', affectedRows: 1, error: null });
    expect(succeeded.details).toEqual({ owned: true, _runner: fixedSource });
    expect(await probeWrites()).toEqual([RESERVED_KEY_PROBE_ID]);
  });

  it('keeps using ledger rows written before sources were recorded, without rewriting them', async () => {
    await seedLedgerRow({
      migrationId: PROBE_ID,
      status: 'succeeded',
      gitSha: LEGACY_COMMIT,
      details: { legacy: true },
    });
    const legacyRow = await ledgerRows(PROBE_ID);
    const current = sourceOf(PROBE_ID, 'export const probe = 1;\n');
    const currentSources = new Map([[PROBE_ID, current]]);
    const { migration, run } = probeMigration(PROBE_ID, () => ({}));
    const warn = vi.fn();

    await expect(
      applyDataMigrations(prisma, [migration], upOptions(currentSources, { failOnSourceDrift: true, warn })),
    ).resolves.toEqual({
      sourceDrift: [],
      results: [{ migrationId: PROBE_ID, status: 'skipped', affectedRows: 0 }],
    });
    expect(run).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(await ledgerRows(PROBE_ID)).toEqual(legacyRow);

    const sameAtCommit = vi.fn(async (_commit: string, _sourcePath: string) => current.sourceSha256);
    await expect(sourceChecks(statusSources(currentSources, { deriveSourceSha256: sameAtCommit }))).resolves.toEqual({
      labels: { [PROBE_ID]: 'unrecorded-derived-match' },
      sourceDrift: [],
    });
    expect(sameAtCommit).toHaveBeenCalledWith(LEGACY_COMMIT, current.sourcePath);

    await expect(sourceChecks(statusSources(currentSources))).resolves.toEqual({
      labels: { [PROBE_ID]: 'unrecorded-unknown' },
      sourceDrift: [],
    });

    const olderAtCommit = sourceOf(PROBE_ID, 'export const probe = 0;\n').sourceSha256;
    const derivedDrift = await sourceChecks(
      statusSources(currentSources, { deriveSourceSha256: async () => olderAtCommit }),
    );
    expect(derivedDrift).toEqual({
      labels: { [PROBE_ID]: 'unrecorded-derived-drift' },
      sourceDrift: [{
        migrationId: PROBE_ID,
        sourceCheck: 'unrecorded-derived-drift',
        sourcePath: current.sourcePath,
        ranSourceSha256: olderAtCommit,
        currentSourceSha256: current.sourceSha256,
        gitSha: LEGACY_COMMIT,
      }],
    });
    // Only a recorded hash can fail status.
    expect(sourceDriftExitCode(derivedDrift.sourceDrift, true)).toBe(0);
    expect(await ledgerRows(PROBE_ID)).toEqual(legacyRow);
  });

  it('never reads or rewrites ledger rows whose ids are no longer registered', async () => {
    const orphanRows: SeededRun[] = [
      { migrationId: UNREGISTERED_ID, status: 'succeeded', gitSha: LEGACY_COMMIT, details: {} },
      { migrationId: RETIRED_ID, status: 'succeeded', details: { _runner: { sourceSha256: 'f'.repeat(64), hashAlgorithm: 'sha256-lf' } } },
      { migrationId: 'v0.0.1:999_removed_probe', status: 'failed', details: { _runner: 'not a runner record' } },
      { migrationId: 'legacy_release_marker', releaseVersion: '0.1.0', status: 'succeeded', details: [] },
    ];
    for (const row of orphanRows) await seedLedgerRow(row);
    const orphansBefore = await ledgerRows();
    const current = new Map([[PROBE_ID, sourceOf(PROBE_ID, 'export const probe = 1;\n')]]);
    const { migration } = probeMigration(PROBE_ID, () => ({ probe: 'ok' }));
    const warn = vi.fn();

    await expect(
      applyDataMigrations(prisma, [migration], upOptions(current, { failOnSourceDrift: true, warn })),
    ).resolves.toEqual({
      sourceDrift: [],
      results: [{ migrationId: PROBE_ID, status: 'succeeded', affectedRows: 1 }],
    });
    expect(warn).not.toHaveBeenCalled();
    expect((await ledgerRows()).filter(({ migrationId }) => migrationId !== PROBE_ID)).toEqual(orphansBefore);

    const derive = vi.fn(async () => null);
    const status = await sourceChecks(statusSources(current, { deriveSourceSha256: derive }));
    expect(status).toEqual({
      labels: {
        [UNREGISTERED_ID]: 'unregistered',
        [RETIRED_ID]: 'retired',
        'v0.0.1:999_removed_probe': 'unregistered',
        legacy_release_marker: 'unregistered',
        [PROBE_ID]: 'match',
      },
      sourceDrift: [],
    });
    expect(derive).not.toHaveBeenCalled();
    expect(sourceDriftExitCode(status.sourceDrift, true)).toBe(0);
  });

  describe('data:migrate CLI', () => {
    const DRIFTED_ID = 'v0.1.4:001_record_agent_os_operator_backbone_release';
    const PENDING_ID = 'v0.1.6:001_record_rocket_read_model_release';
    const STALE_SHA256 = '0'.repeat(64);
    const DRIFTED_AT = '1'.repeat(40);
    const UP = ['up', '--phase', 'post-schema', '--target', 'local', '--confirm', 'APPLY_DATA_MIGRATIONS'];
    let tsxCli: string;

    function runCli(args: readonly string[], env: Record<string, string> = {}): Promise<CliResult> {
      const childEnv: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('DATA_MIGRATION_') && key !== 'DATABASE_URL') childEnv[key] = value;
      }
      Object.assign(childEnv, env, { DATABASE_URL: databaseUrl });
      return new Promise((resolve, reject) => {
        execFile(
          process.execPath,
          [tsxCli, runnerPath, ...args, '--database-url', databaseUrl],
          {
            // Keeps dotenv from loading a developer's .env next to the checkout.
            cwd: cliWorkingDirectory,
            env: childEnv,
            encoding: 'utf8',
            timeout: 90_000,
            maxBuffer: 16 * 1024 * 1024,
          },
          (error, stdout, stderr) => {
            if (error && typeof error.code !== 'number') {
              reject(error);
              return;
            }
            resolve({ code: error ? Number(error.code) : 0, stdout, stderr });
          },
        );
      });
    }

    beforeAll(async () => {
      const runnerRequire = createRequire(runnerPath);
      tsxCli = runnerRequire.resolve('tsx/cli');
      try {
        runnerRequire.resolve('@kiditem/shared/source-import');
        runnerRequire.resolve('@kiditem/shared/product-abc');
      } catch {
        throw new Error(
          'The data:migrate CLI loads @kiditem/shared from packages/shared/dist; build it first ' +
            '(npm exec --workspace=packages/shared tsup -- --no-dts).',
        );
      }
      cliWorkingDirectory = await mkdtemp(path.join(tmpdir(), 'kiditem-data-migrate-cli-'));
    });

    it('warns and exits 0 by default; the flag or environment fails up, and the flag fails status with exit 3', async () => {
      const staleSource = {
        sourcePath: migrationSourcePath(DRIFTED_ID),
        sourceSha256: STALE_SHA256,
        hashAlgorithm: SOURCE_HASH_ALGORITHM,
      };
      await seedLedgerRow({
        migrationId: DRIFTED_ID,
        status: 'succeeded',
        gitSha: DRIFTED_AT,
        details: { note: 'seeded', _runner: staleSource },
      });
      await seedLedgerRow({ migrationId: UNREGISTERED_ID, status: 'succeeded', details: {} });
      await seedLedgerRow({ migrationId: RETIRED_ID, status: 'succeeded', details: {} });
      const seeded = await ledgerRows();
      const driftEntry: SourceDriftEntry = {
        migrationId: DRIFTED_ID,
        sourceCheck: 'drift',
        sourcePath: staleSource.sourcePath,
        ranSourceSha256: STALE_SHA256,
        currentSourceSha256: checkoutSourceSha256(DRIFTED_ID),
        gitSha: DRIFTED_AT,
      };
      const upDrifted = [...UP, '--release-version', '0.1.4'];

      const warned = await runCli(upDrifted);
      expect(warned.code, warned.stderr).toBe(0);
      expect(warned.stderr).toContain(
        `Data migration ${DRIFTED_ID} ran from source ${STALE_SHA256}, but ${staleSource.sourcePath} ` +
          `is now ${driftEntry.currentSourceSha256}. It will not run again; a fix needs a new migration id.`,
      );
      const warnedReport = JSON.parse(warned.stdout);
      expect(warnedReport.sourceDrift).toEqual([driftEntry]);
      expect(versionedResults(warnedReport.results)).toEqual([
        { migrationId: DRIFTED_ID, status: 'skipped', affectedRows: 0 },
      ]);
      expect(await ledgerRows()).toEqual(seeded);

      const refusals = [
        await runCli([...upDrifted, '--fail-on-source-drift']),
        await runCli(upDrifted, { DATA_MIGRATION_FAIL_ON_SOURCE_DRIFT: '1' }),
      ];
      for (const refused of refusals) {
        expect(refused.code, refused.stderr).toBe(1);
        expect(refused.stderr).toContain(
          `Refusing to run data migrations: source drift was found in 1 applied migration(s) (${DRIFTED_ID})`,
        );
        expect(refused.stdout).toBe('');
      }
      expect(await ledgerRows()).toEqual(seeded);

      // Drift outside the selection does not stop another release, which records its own source.
      const other = await runCli([...UP, '--release-version', '0.1.6', '--fail-on-source-drift']);
      expect(other.code, other.stderr).toBe(0);
      expect(other.stderr).not.toContain('Data migration');
      const otherReport = JSON.parse(other.stdout);
      expect(otherReport.sourceDrift).toEqual([]);
      expect(versionedResults(otherReport.results)).toEqual([
        { migrationId: PENDING_ID, status: 'succeeded', affectedRows: 0 },
      ]);
      const pendingSource = {
        sourcePath: migrationSourcePath(PENDING_ID),
        sourceSha256: checkoutSourceSha256(PENDING_ID),
        hashAlgorithm: SOURCE_HASH_ALGORITHM,
      };
      const [pendingRow] = await ledgerRows(PENDING_ID);
      expect(pendingRow.details).toEqual({ note: expect.any(String), _runner: pendingSource });

      const status = await runCli(['status']);
      expect(status.code, status.stderr).toBe(0);
      const statusReport = JSON.parse(status.stdout);
      expect(statusReport.database.sourceDrift).toEqual([driftEntry]);
      const runs: Array<{ migrationId: string; sourceCheck: string; runner: unknown }> =
        statusReport.database.runs;
      expect(Object.fromEntries(runs.map((run) => [run.migrationId, run.sourceCheck]))).toEqual({
        [DRIFTED_ID]: 'drift',
        [PENDING_ID]: 'match',
        [UNREGISTERED_ID]: 'unregistered',
        [RETIRED_ID]: 'retired',
      });
      expect(runs.find((run) => run.migrationId === PENDING_ID)?.runner).toEqual(pendingSource);
      expect(statusReport.migrations).toContainEqual(expect.objectContaining({
        id: DRIFTED_ID,
        sourcePath: staleSource.sourcePath,
        sourceSha256: driftEntry.currentSourceSha256,
      }));

      const failingStatus = await runCli(['status', '--fail-on-source-drift']);
      expect(failingStatus.code, failingStatus.stderr).toBe(3);
      expect(JSON.parse(failingStatus.stdout).database.sourceDrift).toEqual([driftEntry]);
      expect((await ledgerRows()).filter(({ migrationId }) => migrationId !== PENDING_ID)).toEqual(seeded);
    }, 300_000);
  });
});
