import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestPrisma } from '../test-helpers/real-prisma';
import { ENSURE_STEP_IDS } from '../../../../scripts/data-migrations/ensure/index';
import {
  FAIL_ON_SOURCE_DRIFT_ENV,
  PRISMA_USER_CONSENT_ENV,
  compareReleaseVersions,
  createCommandRunner,
  extractJsonReport,
  loadDataMigrationRegistry,
  readFileHead,
  resolveRuntimeTools,
  runLocalSync,
  type LocalSyncCommand,
  type LocalSyncCommandResult,
  type LocalSyncDependencies,
  type LocalSyncOptions,
  type RegisteredMigration,
} from '../../../../scripts/sync-local-database';

const repoRoot = path.resolve(__dirname, '../../../..');
const OPEN_TRAIN = readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();
const SYNC_TIMEOUT_MS = 240_000;
const APPLY: LocalSyncOptions = { dryRun: false, acceptDataLoss: false, noBackup: false };
const PROBE_SLUG = 'sync-probe';

type SyncRun = {
  deps: LocalSyncDependencies;
  commands: LocalSyncCommand[];
  results: Map<LocalSyncCommand['step'], LocalSyncCommandResult>;
  steps(): string[];
  text(): string;
};

/**
 * `db:sync:local` against databases of its own inside the integration
 * container. Status, the migration phases, the survey, the DDL preview, the
 * Docker backup and `db push` all run for real. Only the shared-package build
 * and `prisma generate` are skipped: they write build artifacts, and the suite
 * already runs on both.
 *
 * AI_AGENT=1 makes Prisma apply its AI consent gate no matter who runs the
 * suite, so an accepted destructive push is refused the same way everywhere.
 * This suite never supplies consent.
 */
describe('db:sync:local over disposable PostgreSQL databases', () => {
  const suffix = randomBytes(4).toString('hex');
  const databaseName = `kiditem_sync_${suffix}`;
  const pushedOnlyName = `kiditem_sync_pushed_${suffix}`;
  let admin: PrismaClient;
  let target: PrismaClient;
  let databaseUrl: string;
  let databaseUser: string;
  let backupDirectory: string;
  // The registry as the command loads it. Pre-schema migrations of earlier
  // releases prepared rows for a schema this database never had;
  // v0.1.30:003 reads a table the schema has dropped.
  let registry: readonly RegisteredMigration[];
  let notApplicableIds: string[];
  let appliedIds: string[];

  function urlFor(name: string): string {
    const url = new URL(databaseUrl);
    url.pathname = `/${name}`;
    return url.toString();
  }

  function clientFor(url: string): PrismaClient {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }

  beforeAll(async () => {
    registry = await loadDataMigrationRegistry();
    notApplicableIds = registry
      .filter((migration) => migration.phase === 'pre-schema'
        && compareReleaseVersions(migration.releaseVersion, OPEN_TRAIN) === -1)
      .map((migration) => migration.id);
    appliedIds = registry
      .map((migration) => migration.id)
      .filter((id) => !notApplicableIds.includes(id))
      .sort();
    admin = makeTestPrisma();
    await admin.$connect();
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(process.env.DATABASE_URL ?? '');
    databaseUser = decodeURIComponent(url.username);
    url.pathname = `/${databaseName}`;
    databaseUrl = url.toString();
    target = clientFor(databaseUrl);
    backupDirectory = await mkdtemp(path.join(tmpdir(), 'kiditem-sync-backup-'));
  });

  afterAll(async () => {
    await target?.$disconnect();
    if (admin) {
      for (const name of [databaseName, pushedOnlyName]) {
        await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      }
      await admin.$disconnect();
    }
    if (backupDirectory) await rm(backupDirectory, { recursive: true, force: true });
  });

  function startSync(url = databaseUrl, extraEnv: Record<string, string> = {}): SyncRun {
    const commands: LocalSyncCommand[] = [];
    const results = new Map<LocalSyncCommand['step'], LocalSyncCommandResult>();
    const lines: string[] = [];
    const run = createCommandRunner(repoRoot);
    const deps: LocalSyncDependencies = {
      platform: process.platform,
      env: { ...process.env, DATABASE_URL: url, AI_AGENT: '1', ...extraEnv },
      prismaUserConsent: undefined,
      repoRoot,
      backupDirectory,
      tools: resolveRuntimeTools(repoRoot),
      run: async (command) => {
        commands.push(command);
        if (command.step === 'build-shared' || command.step === 'generate') {
          return { exitCode: 0, signal: null, stdout: '', stderr: '' };
        }
        const result = await run({ ...command, output: 'capture' });
        results.set(command.step, result);
        lines.push(`[${command.step}] exit ${result.exitCode}`, result.stderr);
        return result;
      },
      loadRegistry: async () => registry,
      makeDirectory: async (directory) => {
        await mkdir(directory, { recursive: true });
      },
      readFileHead,
      removeFile: async (file) => {
        await rm(file, { force: true });
      },
      now: () => new Date(),
      log: (line) => lines.push(line),
      warn: (line) => lines.push(line),
    };
    return {
      deps,
      commands,
      results,
      steps: () => commands.map((command) => command.step),
      text: () => lines.join('\n'),
    };
  }

  async function ledger(client: PrismaClient = target) {
    return client.$queryRaw<Array<{ migrationId: string; status: string; updatedAt: Date }>>`
      SELECT migration_id AS "migrationId", status, updated_at AS "updatedAt"
      FROM data_migration_runs
      ORDER BY migration_id
    `;
  }

  async function relationExists(name: string): Promise<boolean> {
    const rows = await target.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass(${`public.${name}`}::text) IS NOT NULL AS present
    `;
    return rows[0]?.present === true;
  }

  async function columnExists(table: string, column: string): Promise<boolean> {
    const rows = await target.$queryRaw<Array<{ present: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
      ) AS present
    `;
    return rows[0]?.present === true;
  }

  it('leaves out exactly the earlier releases\' pre-schema migrations, including v0.1.30:003', () => {
    expect(notApplicableIds).toContain('v0.1.30:003_move_variant_recipes_to_channel_options');
    expect(notApplicableIds.every((id) => !id.startsWith(`v${OPEN_TRAIN}:`))).toBe(true);
    expect(appliedIds.length + notApplicableIds.length).toBe(registry.length);
  });

  it('creates the schema on a new database, then runs the open train\'s pre-schema and every post-schema migration', async () => {
    const sync = startSync();

    const outcome = await runLocalSync(APPLY, sync.deps);

    expect(outcome, sync.text()).toMatchObject({ exitCode: 0, state: 'applied' });
    expect(sync.steps()).toEqual([
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
    expect(sync.commands.find((command) => command.step === 'db-push')?.args)
      .toEqual(['scripts/safe-prisma-db-push.mjs']);
    expect(sync.commands.find((command) => command.step === 'pre-schema')?.args)
      .toEqual(expect.arrayContaining(['--phase', 'pre-schema', '--release-version', OPEN_TRAIN]));
    expect(sync.commands.find((command) => command.step === 'post-schema')?.args)
      .not.toContain('--release-version');
    const rows = await ledger();
    expect(rows.map((row) => row.migrationId)).toEqual(appliedIds);
    expect(new Set(rows.map((row) => row.status))).toEqual(new Set(['succeeded']));
    expect(sync.text()).toContain(`not applicable to this database: ${notApplicableIds.join(', ')}`);
    expect(await readdir(backupDirectory)).toEqual([]);

    // The post-schema `up` reports the ensure steps next to its migrations,
    // and the final status, with its per-row source checks, never lists them.
    const postSchema = extractJsonReport(sync.results.get('post-schema')?.stdout ?? '') as {
      results: Array<{ migrationId: string; status: string }>;
      sourceDrift: unknown[];
    };
    expect(postSchema.sourceDrift).toEqual([]);
    expect(postSchema.results.filter(({ migrationId }) => migrationId.startsWith('ensure:')))
      .toEqual(ENSURE_STEP_IDS.map((migrationId) => expect.objectContaining({ migrationId, status: 'ensured' })));
    const finalStatus = extractJsonReport(sync.results.get('final-status')?.stdout ?? '') as {
      database: { runs: Array<{ migrationId: string; sourceCheck: string }>; sourceDrift: unknown[] };
    };
    expect(finalStatus.database.runs.map((run) => run.migrationId).sort()).toEqual(appliedIds);
    expect(new Set(finalStatus.database.runs.map((run) => run.sourceCheck))).toEqual(new Set(['match']));
    expect(finalStatus.database.sourceDrift).toEqual([]);
  }, SYNC_TIMEOUT_MS);

  it('changes nothing on a second run', async () => {
    const before = await ledger();
    const sync = startSync();

    const outcome = await runLocalSync(APPLY, sync.deps);

    expect(outcome, sync.text()).toMatchObject({ exitCode: 0, state: 'in-sync' });
    expect(sync.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'generate',
      'post-schema',
      'final-status',
    ]);
    expect(await ledger()).toEqual(before);
  }, SYNC_TIMEOUT_MS);

  it('reports in sync from a dry run that only reads', async () => {
    const sync = startSync();

    const outcome = await runLocalSync({ ...APPLY, dryRun: true }, sync.deps);

    expect(outcome, sync.text()).toEqual({
      exitCode: 0,
      state: 'in-sync',
      steps: ['status', 'survey', 'ddl-preview'],
    });
    expect(sync.steps()).toEqual(['status', 'survey', 'ddl-preview']);
    expect(sync.text()).toContain('Result: in sync. Nothing to apply.');
  }, SYNC_TIMEOUT_MS);

  it('stops before any change when the fail setting covers an edited applied migration, and only warns without it', async () => {
    const driftedId = appliedIds.find((id) =>
      registry.find((migration) => migration.id === id)?.phase === 'post-schema');
    if (!driftedId) throw new Error('the registry has no post-schema migration');
    const staleSha256 = '0'.repeat(64);
    const [original] = await target.$queryRaw<Array<{ details: unknown }>>`
      SELECT details FROM data_migration_runs WHERE migration_id = ${driftedId}
    `;
    // The ledger now says this migration ran from another source than the checkout holds.
    await target.$executeRaw`
      UPDATE data_migration_runs
      SET details = jsonb_set(details, '{_runner,sourceSha256}', to_jsonb(${staleSha256}::text))
      WHERE migration_id = ${driftedId}
    `;
    try {
      const before = await ledger();
      const refused = startSync(databaseUrl, { [FAIL_ON_SOURCE_DRIFT_ENV]: '1' });

      const outcome = await runLocalSync(APPLY, refused.deps);

      expect(outcome, refused.text()).toMatchObject({ exitCode: 1, state: 'blocked' });
      expect(refused.steps()).toEqual(['build-shared', 'status']);
      expect(refused.results.get('status')?.exitCode).toBe(3);
      expect(refused.text()).toContain(
        `Stopped before any change: ${FAIL_ON_SOURCE_DRIFT_ENV} is set, and ${driftedId} already succeeded`,
      );
      expect(await ledger()).toEqual(before);

      const dryRun = startSync(databaseUrl, { [FAIL_ON_SOURCE_DRIFT_ENV]: '1' });
      await expect(runLocalSync({ ...APPLY, dryRun: true }, dryRun.deps))
        .resolves.toMatchObject({ exitCode: 1, state: 'blocked' });
      expect(dryRun.text()).toContain(`the real run would stop at source drift in ${driftedId}`);

      const warned = startSync(databaseUrl, { [FAIL_ON_SOURCE_DRIFT_ENV]: '0' });

      const warnedOutcome = await runLocalSync(APPLY, warned.deps);

      expect(warnedOutcome, warned.text()).toMatchObject({ exitCode: 0, state: 'in-sync' });
      expect(warned.text()).toContain(`source drift: ${driftedId} (drift)`);
      expect(warned.results.get('post-schema')?.stderr ?? '')
        .toContain(`Data migration ${driftedId} ran from source ${staleSha256}`);
      expect(await ledger()).toEqual(before);
    } finally {
      await target.$executeRaw`
        UPDATE data_migration_runs
        SET details = ${JSON.stringify(original.details)}::jsonb
        WHERE migration_id = ${driftedId}
      `;
    }
  }, SYNC_TIMEOUT_MS * 2);

  it('syncs a database that has rows but an empty ledger through the same gates', async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${pushedOnlyName}"`);
    const pushedOnlyUrl = urlFor(pushedOnlyName);
    // A teammate database that only ever ran `db:push`: schema and rows, no ledger rows.
    const push = spawnSync(process.execPath, ['scripts/safe-prisma-db-push.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: pushedOnlyUrl },
      encoding: 'utf8',
    });
    expect(push.status, push.stderr).toBe(0);
    const pushedOnly = clientFor(pushedOnlyUrl);
    try {
      await pushedOnly.$executeRaw`
        INSERT INTO organizations (id, name, slug)
        VALUES (gen_random_uuid(), 'Pushed only', 'pushed-only')
      `;
      expect(await ledger(pushedOnly)).toEqual([]);
      const sync = startSync(pushedOnlyUrl);

      const outcome = await runLocalSync(APPLY, sync.deps);

      expect(outcome, sync.text()).toMatchObject({ exitCode: 0, state: 'applied' });
      expect(sync.steps()).toEqual([
        'build-shared',
        'status',
        'pre-schema',
        'survey',
        'ddl-preview',
        'generate',
        'post-schema',
        'final-status',
      ]);
      expect(sync.text()).toContain(
        `${registry.length} registered: 0 succeeded, ${appliedIds.length} to apply, ${notApplicableIds.length} not applicable`,
      );
      expect((await ledger(pushedOnly)).map((row) => row.migrationId)).toEqual(appliedIds);
      // v0.1.31:002 installs the ABC formula for organizations that already exist.
      await expect(pushedOnly.$queryRaw`
        SELECT count(*)::int AS "count"
        FROM master_product_abc_formula_states state
        JOIN organizations organization ON organization.id = state.organization_id
        WHERE organization.slug = 'pushed-only'
      `).resolves.toEqual([{ count: 1 }]);
    } finally {
      await pushedOnly.$disconnect();
    }
  }, SYNC_TIMEOUT_MS * 2);

  it('stops at the survey over duplicate rows, then at Prisma\'s unique-index warning once they are resolved', async () => {
    await target.$executeRawUnsafe('DROP INDEX "organizations_slug_key"');
    await target.$executeRaw`
      INSERT INTO organizations (id, name, slug)
      VALUES (gen_random_uuid(), 'Sync probe A', ${PROBE_SLUG}),
             (gen_random_uuid(), 'Sync probe B', ${PROBE_SLUG})
    `;
    const blocked = startSync();

    const outcome = await runLocalSync(APPLY, blocked.deps);

    expect(outcome, blocked.text()).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(blocked.steps()).toEqual(['build-shared', 'status', 'pre-schema', 'survey']);
    expect(blocked.text()).toContain(
      'BLOCKER unique   organizations(slug): 1 duplicate group(s) across 2 row(s) (organizations_slug_key)',
    );
    expect(blocked.text()).toContain('Do not delete them by hand');
    expect(await relationExists('organizations_slug_key')).toBe(false);

    await target.$executeRaw`
      DELETE FROM organizations WHERE slug = ${PROBE_SLUG} AND name = 'Sync probe B'
    `;
    const resolved = startSync();

    const rerun = await runLocalSync(APPLY, resolved.deps);

    // The survey is clear now, but Prisma still asks for --accept-data-loss
    // before adding a unique index to a table with rows.
    expect(rerun, resolved.text()).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(resolved.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'db-push',
    ]);
    expect(resolved.text()).toContain('clear (');
    expect(resolved.text()).toContain('1 statement(s) add a unique index or primary key to an existing table.');
    expect(resolved.results.get('db-push')?.stderr ?? '').toContain('--accept-data-loss');
    expect(resolved.text()).toContain('Prisma listed data-loss warnings (above) and needs --accept-data-loss.');
    expect(await relationExists('organizations_slug_key')).toBe(false);

    // Recreate the index as db push would, so the next cases start in sync.
    await target.$executeRawUnsafe('CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug")');
    const inSync = startSync();
    await expect(runLocalSync({ ...APPLY, dryRun: true }, inSync.deps))
      .resolves.toMatchObject({ exitCode: 0, state: 'in-sync' });
  }, SYNC_TIMEOUT_MS * 2);

  it('stops before db push when the schema change would drop a column', async () => {
    await target.$executeRawUnsafe('ALTER TABLE organizations ADD COLUMN sync_probe_note text');
    await target.$executeRaw`
      UPDATE organizations SET sync_probe_note = 'kept' WHERE slug = ${PROBE_SLUG}
    `;
    const sync = startSync();

    const outcome = await runLocalSync(APPLY, sync.deps);

    expect(outcome, sync.text()).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(sync.steps()).toEqual(['build-shared', 'status', 'pre-schema', 'survey', 'ddl-preview']);
    expect(sync.text()).toContain('DESTRUCTIVE ALTER TABLE "organizations" DROP COLUMN "sync_probe_note"');
    expect(await columnExists('organizations', 'sync_probe_note')).toBe(true);

    const dryRun = startSync();
    await expect(runLocalSync({ ...APPLY, dryRun: true }, dryRun.deps))
      .resolves.toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(dryRun.text()).toContain('destructive DDL without --accept-data-loss');
  }, SYNC_TIMEOUT_MS * 2);

  it('writes a restorable backup before an accepted destructive push, which Prisma refuses without consent', async () => {
    const sync = startSync();

    const outcome = await runLocalSync({ ...APPLY, acceptDataLoss: true }, sync.deps);

    expect(outcome, sync.text()).toMatchObject({ exitCode: 1, state: 'blocked' });
    expect(sync.steps()).toEqual([
      'build-shared',
      'status',
      'pre-schema',
      'survey',
      'ddl-preview',
      'find-container',
      'backup-dump',
      'db-push',
    ]);
    const push = sync.commands.find((command) => command.step === 'db-push');
    expect(push?.args).toEqual(['scripts/safe-prisma-db-push.mjs', '--accept-data-loss']);
    expect(push?.env[PRISMA_USER_CONSENT_ENV]).toBe('');
    for (const command of sync.commands.filter((entry) => entry.step !== 'db-push')) {
      expect(command.env[PRISMA_USER_CONSENT_ENV]).toBeUndefined();
    }
    expect(sync.results.get('db-push')?.stderr ?? '').toContain(PRISMA_USER_CONSENT_ENV);
    expect(sync.text()).toContain(
      `must set ${PRISMA_USER_CONSENT_ENV} to the user's exact consent text`,
    );
    expect(await columnExists('organizations', 'sync_probe_note')).toBe(true);

    const backups = await readdir(backupDirectory);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(new RegExp(`^${databaseName}-\\d{8}T\\d{6}Z\\.dump$`));
    const backupFile = path.join(backupDirectory, backups[0]);
    expect((await readFileHead(backupFile, 5)).toString('latin1')).toBe('PGDMP');

    // Changes made after the backup, which the runbook's restore must undo.
    await target.$executeRaw`
      UPDATE organizations SET sync_probe_note = 'changed' WHERE slug = ${PROBE_SLUG}
    `;
    await target.$executeRawUnsafe('CREATE TABLE sync_probe_after_backup (id integer)');
    await target.$executeRawUnsafe('DELETE FROM data_migration_runs');
    await target.$disconnect();

    // The runbook's restore command, with this container's user: --create
    // drops and recreates the database named in the backup.
    const container = sync.results.get('find-container')?.stdout.trim() ?? '';
    expect(container).not.toBe('');
    const restore = spawnSync(
      'docker',
      [
        'exec', '-i', container,
        'pg_restore', '--clean', '--if-exists', '--create', '--no-owner',
        '--username', databaseUser, '--dbname', 'postgres',
      ],
      { input: readFileSync(backupFile), encoding: 'utf8' },
    );
    expect(restore.status, restore.stderr).toBe(0);
    target = clientFor(databaseUrl);
    await expect(target.$queryRaw`
      SELECT sync_probe_note AS "note" FROM organizations WHERE slug = ${PROBE_SLUG}
    `).resolves.toEqual([{ note: 'kept' }]);
    expect(await relationExists('sync_probe_after_backup')).toBe(false);
    expect((await ledger()).map((row) => row.migrationId)).toEqual(appliedIds);
  }, SYNC_TIMEOUT_MS);
});
