import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CheckError,
  classifyBlockers,
  copyBaseSchema,
  COVERAGE_SCHEMA_VERSION,
  formatReport,
  main,
  matchCoverage,
  OFFLINE_DATABASE_URL,
  parseArguments,
  prismaCommand,
  prismaEnvironment,
  resolveBase,
  runCoverageCheck,
  suggestedEntry,
  validateCoverage,
} from '../check-cutover-blocker-coverage.mjs';

/**
 * The check reads Prisma's own diff offline and fails a PR whose schema change
 * existing rows could stop without a reviewed answer. A miss here surfaces
 * only in the Office cutover, so the rules are pinned against the SQL shapes
 * `prisma migrate diff --script` emits.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = join(repoRoot, 'scripts', 'check-cutover-blocker-coverage.mjs');
const fixtures = join(repoRoot, 'scripts', '__tests__', 'fixtures', 'cutover-blocker-coverage');

const keys = (changes) => changes.map((found) => found.key);
const clearances = (changes) => changes.map(({ key, clearedBy }) => ({ key, clearedBy }));
const classify = (diffSql, baseDdl = '') => classifyBlockers({ diffSql, baseDdl });
const coverage = (entries) => ({ schemaVersion: COVERAGE_SCHEMA_VERSION, entries });
const validEntries = (entries, headVersion = '0.1.31') => {
  const result = validateCoverage(coverage(entries), { headVersion });
  assert.deepEqual(result.errors, []);
  return result.entries;
};

function temporaryDirectory(t, prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function gitIn(cwd) {
  return (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A repository with one commit holding `files`, for base resolution without the real history. */
function commitRepository(t, files) {
  const repository = temporaryDirectory(t, 'cutover-blocker-repo-');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), content);
  }
  const git = gitIn(repository);
  git(['init', '-q']);
  git(['add', '--all']);
  git([
    '-c', 'user.name=Coverage Test',
    '-c', 'user.email=coverage-test@example.invalid',
    '-c', 'commit.gpgsign=false',
    'commit', '-q', '-m', 'base',
  ]);
  return { repository, git };
}

test('reports a required column without a database default, and passes one the database fills', () => {
  const { blockers, cleared } = classify(`
-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "dedupe_key" TEXT NOT NULL,
ADD COLUMN     "score" DECIMAL(12,6) NOT NULL,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "position" SERIAL NOT NULL,
ADD COLUMN     "href" TEXT;
`);
  assert.deepEqual(keys(blockers), ['not-null:alerts.dedupe_key', 'not-null:alerts.score']);
  assert.deepEqual(blockers[1], {
    key: 'not-null:alerts.score',
    kind: 'not-null',
    table: 'alerts',
    columns: ['score'],
    detail: 'ADD COLUMN "score" DECIMAL(12,6) NOT NULL',
  });
  assert.deepEqual(cleared, []);
});

test('never reports a table the same diff creates', () => {
  assert.deepEqual(
    classify(`
CREATE TABLE "fresh" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "fresh_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fresh_code_key" ON "fresh"("code");
ALTER TABLE "fresh" ADD CONSTRAINT "fresh_owner_fkey" FOREIGN KEY ("code") REFERENCES "owners"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
`),
    { blockers: [], cleared: [] },
  );
});

test('reports SET NOT NULL and a type change on an existing column', () => {
  const { blockers } = classify(`
ALTER TABLE "evaluations" ALTER COLUMN "formula_version_id" SET NOT NULL,
ALTER COLUMN "calculated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "score" SET DATA TYPE DECIMAL(20,6),
ALTER COLUMN "note" DROP NOT NULL,
ALTER COLUMN "formula_key" DROP DEFAULT;
`);
  assert.deepEqual(keys(blockers), [
    'set-not-null:evaluations.formula_version_id',
    'type-change:evaluations.score',
  ]);
  assert.equal(blockers[1].detail, 'ALTER COLUMN "score" SET DATA TYPE DECIMAL(20,6)');
});

test('clears a unique index over a new nullable column, but not over a new required or defaulted one', () => {
  const { blockers, cleared } = classify(`
ALTER TABLE "runs" ADD COLUMN     "idempotency_key" VARCHAR(128),
ADD COLUMN     "attempt" INTEGER NOT NULL,
ADD COLUMN     "generation" BIGINT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "runs_idempotency_key" ON "runs"("organization_id", "idempotency_key") WHERE (idempotency_key IS NOT NULL);
CREATE UNIQUE INDEX "runs_attempt_key" ON "runs"("organization_id", "attempt");
CREATE UNIQUE INDEX "runs_generation_key" ON "runs"("organization_id", "generation");
CREATE UNIQUE INDEX "runs_strict_key" ON "runs"("organization_id", "idempotency_key") NULLS NOT DISTINCT;
`);
  assert.deepEqual(keys(blockers), [
    'not-null:runs.attempt',
    'unique:runs_attempt_key',
    'unique:runs_generation_key',
    'unique:runs_strict_key',
  ]);
  assert.deepEqual(clearances(cleared), [
    { key: 'unique:runs_idempotency_key', clearedBy: { rule: 'new-nullable-column', column: 'idempotency_key' } },
  ]);
});

test('clears a unique index a full base key or primary key implies, but not one a partial base index implies', () => {
  const baseDdl = `
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "external_review_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reviews_org_platform_external_key" ON "reviews"("organization_id", "platform", "external_review_id");
CREATE UNIQUE INDEX "reviews_running_key" ON "reviews"("organization_id", "platform") WHERE (status = 'running');
`;
  const { blockers, cleared } = classify(`
DROP INDEX "reviews_org_platform_external_key";
DROP INDEX "reviews_running_key";
CREATE UNIQUE INDEX "reviews_legacy_key" ON "reviews"("organization_id", "platform", "external_review_id") WHERE (status = 'legacy');
CREATE UNIQUE INDEX "reviews_id_org_key" ON "reviews"("id", "organization_id");
CREATE UNIQUE INDEX "reviews_running_key" ON "reviews"("organization_id", "platform") WHERE (status = 'RUNNING');
`, baseDdl);
  // The same name with a new predicate can hold rows the old index never compared.
  assert.deepEqual(keys(blockers), ['unique:reviews_running_key']);
  assert.deepEqual(clearances(cleared), [
    {
      key: 'unique:reviews_id_org_key',
      clearedBy: { rule: 'base-unique-key', key: 'reviews_pkey', columns: ['id'] },
    },
    {
      key: 'unique:reviews_legacy_key',
      clearedBy: {
        rule: 'base-unique-key',
        key: 'reviews_org_platform_external_key',
        columns: ['organization_id', 'platform', 'external_review_id'],
      },
    },
  ]);
});

test('does not trust a base key over a column this diff drops and re-adds or retypes', () => {
  const baseDdl = `
CREATE TABLE "sales" ("id" UUID NOT NULL, "code" TEXT NOT NULL, "month" TEXT NOT NULL, "region" TEXT NOT NULL, CONSTRAINT "sales_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "sales_code_key" ON "sales"("code");
CREATE UNIQUE INDEX "sales_month_key" ON "sales"("month");
`;
  const { blockers, cleared } = classify(`
ALTER TABLE "sales" DROP COLUMN "code",
ADD COLUMN     "code" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "month" SET DATA TYPE VARCHAR(7);
CREATE UNIQUE INDEX "sales_code_region_key" ON "sales"("code", "region");
CREATE UNIQUE INDEX "sales_month_region_key" ON "sales"("month", "region");
`, baseDdl);
  assert.deepEqual(keys(blockers), [
    'type-change:sales.month',
    'unique:sales_code_region_key',
    'unique:sales_month_region_key',
  ]);
  assert.deepEqual(cleared, []);
});

test('does not trust a base key whose columns it could not read', () => {
  const baseDdl = `
CREATE TABLE "tokens" ("id" UUID NOT NULL, "value" TEXT NOT NULL, CONSTRAINT "tokens_exclusion" EXCLUDE USING gist ("value" WITH =));
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_value_key" UNIQUE USING INDEX "tokens_value_idx";
`;
  const { blockers, cleared } = classify(
    'CREATE UNIQUE INDEX "tokens_value_owner_key" ON "tokens"("value", "owner");',
    baseDdl,
  );
  assert.deepEqual(keys(blockers), ['unique:tokens_value_owner_key']);
  assert.deepEqual(cleared, []);
});

test('clears a foreign key over a new nullable column only', () => {
  const { blockers, cleared } = classify(`
ALTER TABLE "snapshots" ADD COLUMN     "source_import_run_id" UUID,
ADD COLUMN     "ingestion_run_id" UUID NOT NULL;
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_source_run_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_ingestion_run_fkey" FOREIGN KEY ("organization_id", "ingestion_run_id") REFERENCES "runs"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_owner_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_full_fkey" FOREIGN KEY ("source_import_run_id", "organization_id") REFERENCES "source_import_runs"("id", "organization_id") MATCH FULL;
`);
  assert.deepEqual(keys(blockers), [
    'foreign-key:snapshots_full_fkey',
    'foreign-key:snapshots_ingestion_run_fkey',
    'foreign-key:snapshots_owner_fkey',
    'not-null:snapshots.ingestion_run_id',
  ]);
  assert.equal(blockers[2].detail, 'FOREIGN KEY (owner_id) REFERENCES owners(id)');
  assert.deepEqual(clearances(cleared), [
    {
      key: 'foreign-key:snapshots_source_run_fkey',
      clearedBy: { rule: 'new-nullable-column', column: 'source_import_run_id' },
    },
  ]);
});

test('reports a primary key added to an existing table unless a base key implies it', () => {
  const baseDdl = `
CREATE TABLE "links" ("a" UUID NOT NULL, "b" UUID NOT NULL);
CREATE UNIQUE INDEX "links_a_key" ON "links"("a");
CREATE TABLE "pairs" ("a" UUID NOT NULL, "b" UUID NOT NULL);
`;
  const { blockers, cleared } = classify(`
ALTER TABLE "links" ADD CONSTRAINT "links_pkey" PRIMARY KEY ("a", "b");
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_pkey" PRIMARY KEY ("a", "b");
`, baseDdl);
  assert.deepEqual(keys(blockers), ['primary-key:pairs_pkey']);
  assert.deepEqual(keys(cleared), ['primary-key:links_pkey']);
});

test('accepts a well-formed coverage file and keeps each entry position', () => {
  const entries = validEntries([
    { train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.31:014_remove_rows', note: 'emptied first' },
    { train: '0.1.30', keys: ['unique:a_key', 'foreign-key:b_fkey'], acceptedRisk: 'no two rows can share a key' },
  ]);
  assert.deepEqual(entries.map((entry) => entry.index), [0, 1]);
});

test('rejects each malformed entry by position', () => {
  const { entries, errors } = validateCoverage({
    schemaVersion: 'kiditem.cutover-blocker-coverage.v0',
    comment: 'not allowed',
    entries: [
      { train: '0.1', table: 'alerts', coveredBy: 'v0.1.31:014_x' },
      { train: '0.1.31', table: 'alerts', keys: ['unique:a'], coveredBy: 'v0.1.31:014_x' },
      { train: '0.1.31', acceptedRisk: 'nothing named' },
      { train: '0.1.31', keys: [], coveredBy: 'v0.1.31:014_x' },
      { train: '0.1.31', keys: ['duplicate:a', 'unique:b', 'unique:b'], acceptedRisk: 'x' },
      { train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.31:014_x', acceptedRisk: 'both' },
      { train: '0.1.31', table: 'alerts' },
      { train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.30:014_x' },
      { train: '0.1.31', table: 'public.alerts', coveredBy: '014' },
      { train: '0.1.31', table: 'alerts', acceptedRisk: '  ' },
      { train: '0.1.32', table: 'alerts', coveredBy: 'v0.1.32:001_x' },
      { train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.31:014_x', owner: 'someone', note: '' },
      'alerts',
    ],
  }, { headVersion: '0.1.31' });
  assert.deepEqual(entries, []);
  assert.deepEqual(errors, [
    'Unknown top-level field "comment".',
    'schemaVersion must be "kiditem.cutover-blocker-coverage.v1".',
    'entries[0].train must be a release version such as "0.1.31".',
    'entries[1] needs exactly one of "table" or "keys".',
    'entries[2] needs exactly one of "table" or "keys".',
    'entries[3].keys must be a non-empty array.',
    'entries[4].keys[0] must be "<kind>:<name>" with a kind of not-null, set-not-null, type-change, unique, primary-key, foreign-key.',
    'entries[4].keys names a key twice.',
    'entries[5] needs exactly one of "coveredBy" or "acceptedRisk".',
    'entries[6] needs exactly one of "coveredBy" or "acceptedRisk".',
    'entries[7].coveredBy v0.1.30:014_x belongs to 0.1.30, not to train 0.1.31.',
    'entries[8].table must be a table name.',
    'entries[8].coveredBy must be a data migration id such as "v0.1.31:014_remove_rows".',
    'entries[9].acceptedRisk must say why existing rows cannot stop the change.',
    "entries[10].train 0.1.32 is above this checkout's VERSION 0.1.31.",
    'entries[11] has unknown field "owner".',
    'entries[11].note must be text when present.',
    'entries[12] must be an object.',
  ]);
});

test('rejects the same table or key twice in one train, but not across trains', () => {
  const { errors } = validateCoverage(coverage([
    { train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.31:014_x' },
    { train: '0.1.31', table: 'alerts', acceptedRisk: 'again' },
    { train: '0.1.32', table: 'alerts', coveredBy: 'v0.1.32:001_x' },
    { train: '0.1.31', keys: ['unique:a'], coveredBy: 'v0.1.31:014_x' },
    { train: '0.1.31', keys: ['unique:b', 'unique:a'], acceptedRisk: 'again' },
  ]), { headVersion: '0.1.32' });
  assert.deepEqual(errors, [
    'entries[1] repeats table alerts for train 0.1.31, already in entries[0].',
    'entries[4] repeats unique:a for train 0.1.31, already in entries[3].',
  ]);
});

test('rejects a document that is not a coverage object', () => {
  assert.deepEqual(validateCoverage([]).errors, ['The coverage file must hold a JSON object.']);
  assert.deepEqual(validateCoverage({ schemaVersion: COVERAGE_SCHEMA_VERSION }).errors, ['entries must be an array.']);
});

const ALERTS_NOT_NULL = {
  key: 'not-null:alerts.dedupe_key',
  kind: 'not-null',
  table: 'alerts',
  columns: ['dedupe_key'],
  detail: 'ADD COLUMN "dedupe_key" TEXT NOT NULL',
};
const ALERTS_UNIQUE = {
  key: 'unique:alerts_dedupe_key',
  kind: 'unique',
  table: 'alerts',
  columns: ['organization_id', 'dedupe_key'],
  detail: 'UNIQUE INDEX (organization_id, dedupe_key)',
};
const RUNS_UNIQUE = {
  key: 'unique:runs_running_key',
  kind: 'unique',
  table: 'runs',
  columns: ['organization_id', 'source_type'],
  detail: "UNIQUE INDEX (organization_id, source_type) WHERE (status = 'running')",
};
const REVIEWS_FOREIGN_KEY = {
  key: 'foreign-key:reviews_run_fkey',
  kind: 'foreign-key',
  table: 'reviews',
  columns: ['source_import_run_id'],
  detail: 'FOREIGN KEY (source_import_run_id) REFERENCES source_import_runs(id)',
};

test('covers a blocker by its key before its table, and leaves the rest uncovered', () => {
  const entries = validEntries([
    { train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.31:014_remove_rows' },
    { train: '0.1.31', keys: ['unique:alerts_dedupe_key', 'unique:runs_running_key'], acceptedRisk: 'no duplicates' },
  ]);
  const result = matchCoverage({
    blockers: [ALERTS_NOT_NULL, ALERTS_UNIQUE, RUNS_UNIQUE, REVIEWS_FOREIGN_KEY],
    entries,
    baseVersion: '0.1.30',
  });
  assert.deepEqual(result.covered.map(({ key, entry }) => [key, entry.index]), [
    ['not-null:alerts.dedupe_key', 0],
    ['unique:alerts_dedupe_key', 1],
    ['unique:runs_running_key', 1],
  ]);
  assert.deepEqual(keys(result.uncovered), ['foreign-key:reviews_run_fkey']);
  assert.deepEqual(result.prunable, []);
  assert.deepEqual(result.stale, []);
});

test('ignores entries the base train already carries, and names entries that match nothing', () => {
  const entries = validEntries([
    { train: '0.1.30', table: 'alerts', coveredBy: 'v0.1.30:001_reset' },
    { train: '0.1.31', table: 'orders_archive', coveredBy: 'v0.1.31:002_empty' },
    {
      train: '0.1.31',
      keys: ['unique:runs_running_key', 'unique:gone_key', 'unique:cleared_key'],
      acceptedRisk: 'no duplicates',
    },
  ]);
  const clearedBy = { rule: 'new-nullable-column', column: 'a' };
  const result = matchCoverage({
    blockers: [ALERTS_NOT_NULL, RUNS_UNIQUE],
    cleared: [{ key: 'unique:cleared_key', kind: 'unique', table: 't', columns: ['a'], detail: '', clearedBy }],
    entries,
    baseVersion: '0.1.30',
  });
  assert.deepEqual(result.prunable.map((entry) => entry.index), [0]);
  assert.deepEqual(keys(result.uncovered), ['not-null:alerts.dedupe_key']);
  assert.deepEqual(result.stale.map(({ entry, target, ...rest }) => [entry.index, target, rest]), [
    [1, 'table orders_archive', {}],
    [2, 'unique:gone_key', {}],
    [2, 'unique:cleared_key', { clearedBy }],
  ]);
});

test('suggests an entry whose placeholder fails validation until someone names the migration', () => {
  const entry = suggestedEntry(RUNS_UNIQUE, '0.1.31');
  assert.deepEqual(entry.keys, ['unique:runs_running_key']);
  assert.deepEqual(validateCoverage(coverage([entry]), { headVersion: '0.1.31' }).errors, [
    'entries[0].coveredBy must be a data migration id such as "v0.1.31:014_remove_rows".',
  ]);
});

const BASE_SHA = 'a'.repeat(40);
const BASE_FILES = {
  'prisma/schema.prisma': 'datasource db {\n  provider = "postgresql"\n}\n',
  'prisma/models/core.prisma': 'model A {\n  id String @id\n}\n',
};

/** A git runner over one fake base commit, recording its calls. */
function fakeGit({ version = '0.1.30\n', missing = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') {
      if (missing) throw new Error('fatal: Needed a single revision');
      return `${BASE_SHA}\n`;
    }
    if (args[0] === 'ls-tree') return `${[...Object.keys(BASE_FILES), 'prisma/CLAUDE.md'].join('\0')}\0`;
    if (args[0] === 'show' && args[1] === `${BASE_SHA}:VERSION`) return version;
    if (args[0] === 'show' && args[1].slice(BASE_SHA.length + 1) in BASE_FILES) {
      return BASE_FILES[args[1].slice(BASE_SHA.length + 1)];
    }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  return { git, calls };
}

/** A Prisma runner that returns fixed SQL and records what it saw of the base copy. */
function fakePrisma({ diffSql, baseDdl = '', failure } = {}) {
  const calls = [];
  const prisma = (args, options) => {
    const schemaArgument = args.find((arg) => arg.startsWith(args.includes('--from-empty') ? '--to-schema=' : '--from-schema='));
    const baseSchema = schemaArgument.slice(schemaArgument.indexOf('=') + 1);
    calls.push({
      args,
      cwd: options.cwd,
      baseSchema,
      baseFiles: Object.fromEntries(Object.keys(BASE_FILES).map((file) => [
        file,
        readFileSync(join(baseSchema, ...file.split('/').slice(1)), 'utf8'),
      ])),
    });
    if (failure) throw failure;
    return args.includes('--from-empty') ? baseDdl : diffSql;
  };
  return { prisma, calls };
}

function checkoutWith(t, document) {
  const checkout = temporaryDirectory(t, 'cutover-blocker-checkout-');
  if (document !== undefined) {
    writeFileSync(
      join(checkout, 'coverage.json'),
      typeof document === 'string' ? document : JSON.stringify(document),
    );
  }
  return checkout;
}

const UNCOVERED_DIFF = `
ALTER TABLE "alerts" ADD COLUMN     "dedupe_key" TEXT NOT NULL;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_fkey" FOREIGN KEY ("source_import_run_id") REFERENCES "source_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

test('passes when every blocker is covered, diffing a temporary copy of the base schema from the checkout root', (t) => {
  const checkout = checkoutWith(t, coverage([
    { train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.31:014_remove_rows' },
    { train: '0.1.31', keys: ['foreign-key:reviews_run_fkey'], acceptedRisk: 'every review names a run' },
  ]));
  const { git } = fakeGit();
  const { prisma, calls } = fakePrisma({ diffSql: UNCOVERED_DIFF });
  const result = runCoverageCheck({
    repoRoot: checkout,
    coveragePath: 'coverage.json',
    headVersion: '0.1.31',
    git,
    prisma,
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.base, { ref: 'origin/release/office', sha: BASE_SHA, version: '0.1.30' });
  assert.deepEqual(keys(result.covered), ['foreign-key:reviews_run_fkey', 'not-null:alerts.dedupe_key']);
  assert.deepEqual(calls.map((call) => call.args.map((arg) => arg.replace(call.baseSchema, '<base>'))), [
    ['migrate', 'diff', '--from-schema=<base>', `--to-schema=${join(checkout, 'prisma')}`, '--script'],
    ['migrate', 'diff', '--from-empty', '--to-schema=<base>', '--script'],
  ]);
  assert.ok(calls.every((call) => call.cwd === checkout));
  assert.ok(calls.every((call) => call.baseSchema.startsWith(join(tmpdir(), 'cutover-blocker-base-'))));
  assert.deepEqual(calls[0].baseFiles, BASE_FILES);
  assert.equal(existsSync(calls[0].baseSchema), false, 'the base copy is removed after the run');

  const report = formatReport(result);
  assert.match(report, /^Cutover blocker coverage: origin\/release\/office aaaaaaaaa \(VERSION 0\.1\.30\) -> prisma \(VERSION 0\.1\.31\)$/m);
  assert.match(report, /^2 change\(s\) existing rows could stop \(not-null 1, foreign-key 1\)\.$/m);
  assert.match(report, /^ {2}table alerts \[0\.1\.31\]: 1 -> v0\.1\.31:014_remove_rows$/m);
  assert.match(report, /^ {2}1 key\(s\) \[0\.1\.31\]: 1 -> accepted risk: every review names a run$/m);
  assert.match(report, /PASS: every change existing rows could stop has a reviewed answer\.$/);
});

test('fails when a blocker is uncovered, with an entry to paste', (t) => {
  const checkout = checkoutWith(t, coverage([
    { train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.31:014_remove_rows' },
  ]));
  const result = runCoverageCheck({
    repoRoot: checkout,
    coveragePath: 'coverage.json',
    headVersion: '0.1.31',
    git: fakeGit().git,
    prisma: fakePrisma({ diffSql: UNCOVERED_DIFF }).prisma,
  });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(keys(result.uncovered), ['foreign-key:reviews_run_fkey']);
  const report = formatReport(result);
  assert.match(report, /^UNCOVERED \(1\):\n {2}foreign-key:reviews_run_fkey\n {6}reviews: FOREIGN KEY \(source_import_run_id\) REFERENCES source_import_runs\(id\)$/m);
  assert.ok(report.includes(`  ${JSON.stringify(suggestedEntry(result.uncovered[0], '0.1.31'))},`));
  assert.match(report, /FAIL: 1 change\(s\) existing rows could stop have no reviewed answer\.$/);
});

test('fails on an invalid coverage file before reading git or running Prisma', (t) => {
  const { git, calls: gitCalls } = fakeGit();
  const { prisma, calls: prismaCalls } = fakePrisma({ diffSql: UNCOVERED_DIFF });
  const run = (document) => runCoverageCheck({
    repoRoot: checkoutWith(t, document),
    coveragePath: 'coverage.json',
    headVersion: '0.1.31',
    git,
    prisma,
  });

  const unparsable = run('{"schemaVersion": ');
  assert.equal(unparsable.exitCode, 1);
  assert.match(unparsable.errors[0], /^coverage\.json is not valid JSON: /);

  const invalid = run(coverage([{ train: '0.1.31', table: 'alerts' }]));
  assert.equal(invalid.exitCode, 1);
  assert.equal(
    formatReport(invalid),
    'FAIL: coverage.json is invalid.\n  entries[0] needs exactly one of "coveredBy" or "acceptedRisk".',
  );
  assert.deepEqual(gitCalls, []);
  assert.deepEqual(prismaCalls, []);
});

test('stops with a check error when the coverage file, the base ref, its VERSION, or Prisma fails', (t) => {
  const isCheckError = (pattern) => (error) => error instanceof CheckError && pattern.test(error.message);
  const options = (overrides) => ({
    repoRoot: checkoutWith(t, coverage([])),
    coveragePath: 'coverage.json',
    headVersion: '0.1.31',
    git: fakeGit().git,
    prisma: fakePrisma({ diffSql: '' }).prisma,
    ...overrides,
  });

  assert.throws(
    () => runCoverageCheck(options({ repoRoot: checkoutWith(t) })),
    isCheckError(/^Coverage file coverage\.json does not exist\.$/),
  );
  assert.throws(
    () => runCoverageCheck(options({ git: fakeGit({ missing: true }).git })),
    isCheckError(/^Base ref origin\/release\/office is not available in this checkout\. Fetch it with: git fetch --no-tags origin \+refs\/heads\/release\/office:refs\/remotes\/origin\/release\/office$/),
  );
  assert.throws(
    () => runCoverageCheck(options({ baseRef: 'origin/main', git: fakeGit({ missing: true }).git })),
    isCheckError(/^Base ref origin\/main is not available in this checkout\. Fetch it, or pass another --base-ref\.$/),
  );
  assert.throws(
    () => runCoverageCheck(options({ git: fakeGit({ version: 'next\n' }).git })),
    isCheckError(/^origin\/release\/office:VERSION is "next", not a release version\.$/),
  );

  const { prisma, calls } = fakePrisma({ failure: new CheckError('prisma migrate failed: schema error') });
  assert.throws(() => runCoverageCheck(options({ prisma })), isCheckError(/schema error/));
  assert.equal(existsSync(calls[0].baseSchema), false, 'a failed run still removes the base copy');
});

test('an empty diff passes and leaves every active entry stale', (t) => {
  const result = runCoverageCheck({
    repoRoot: checkoutWith(t, coverage([{ train: '0.1.31', table: 'alerts', coveredBy: 'v0.1.31:014_remove_rows' }])),
    coveragePath: 'coverage.json',
    headVersion: '0.1.31',
    git: fakeGit().git,
    prisma: fakePrisma({ diffSql: '-- This is an empty migration.' }).prisma,
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.stale.map((item) => item.target), ['table alerts']);
  assert.match(formatReport(result), /^Stale \(not in this diff; remove or correct\):\n {2}entries\[0\] table alerts$/m);
});

test('copies every .prisma file of a real base commit, and only those', (t) => {
  const { git } = commitRepository(t, {
    VERSION: '0.1.30\n',
    'prisma/schema.prisma': BASE_FILES['prisma/schema.prisma'],
    'prisma/models/core.prisma': BASE_FILES['prisma/models/core.prisma'],
    'prisma/CLAUDE.md': '# not a schema\n',
    'prisma/migrations/001/migration.sql': 'SELECT 1;\n',
  });
  const base = resolveBase({ git, baseRef: 'HEAD' });
  assert.equal(base.sha, git(['rev-parse', 'HEAD']).trim());
  assert.equal(base.version, '0.1.30');
  assert.deepEqual(base.files, ['prisma/models/core.prisma', 'prisma/schema.prisma']);

  const directory = temporaryDirectory(t, 'cutover-blocker-copy-');
  const schema = copyBaseSchema({ git, base, directory });
  assert.equal(schema, join(directory, 'prisma'));
  assert.deepEqual(readdirSync(schema, { recursive: true }).sort(), ['models', 'models/core.prisma', 'schema.prisma']);
  assert.equal(readFileSync(join(schema, 'models', 'core.prisma'), 'utf8'), BASE_FILES['prisma/models/core.prisma']);

  assert.throws(
    () => copyBaseSchema({ git, base: { ...base, files: ['prisma/../escape.prisma'] }, directory }),
    (error) => error instanceof CheckError && /Unexpected schema path/.test(error.message),
  );
});

test("classifies the real Prisma CLI's diff of the fixture schemas", { timeout: 120_000 }, (t) => {
  const { git } = commitRepository(t, {
    VERSION: '0.1.0\n',
    'prisma/schema.prisma': readFileSync(join(fixtures, 'base', 'schema.prisma'), 'utf8'),
  });
  const checkout = checkoutWith(t, coverage([
    { train: '0.1.1', table: 'B', acceptedRisk: 'fixture rows never collide' },
  ]));
  const result = runCoverageCheck({
    repoRoot: repoRoot,
    baseRef: 'HEAD',
    headSchema: join(fixtures, 'head'),
    coveragePath: join(checkout, 'coverage.json'),
    headVersion: '0.1.1',
    git,
  });

  assert.equal(result.base.version, '0.1.0');
  assert.deepEqual(
    result.blockers.map(({ key, detail }) => [key, detail]),
    [
      ['not-null:A.slug', 'ADD COLUMN "slug" TEXT NOT NULL'],
      ['set-not-null:B.label', 'ALTER COLUMN "label" SET NOT NULL'],
      ['type-change:B.size', 'ALTER COLUMN "size" SET DATA TYPE BIGINT'],
      ['unique:B_code_key', 'UNIQUE INDEX (code)'],
    ],
  );
  assert.deepEqual(clearances(result.cleared), [
    { key: 'foreign-key:B_aId_fkey', clearedBy: { rule: 'new-nullable-column', column: 'aId' } },
    { key: 'unique:A_name_slug_key', clearedBy: { rule: 'base-unique-key', key: 'A_name_key', columns: ['name'] } },
  ]);
  assert.deepEqual(keys(result.uncovered), ['not-null:A.slug']);
  assert.equal(result.exitCode, 1);
});

test("runs this checkout's Prisma CLI with the current Node executable and an unreachable database URL", () => {
  const command = prismaCommand(['migrate', 'diff']);
  assert.equal(command.file, process.execPath);
  assert.match(command.args[0], /[\\/]node_modules[\\/]prisma[\\/]build[\\/]index\.js$/);
  assert.ok(command.args[0].startsWith(repoRoot), 'the Prisma CLI comes from this checkout');
  assert.deepEqual(command.args.slice(1), ['migrate', 'diff']);

  assert.equal(OFFLINE_DATABASE_URL, 'postgresql://offline:offline@127.0.0.1:1/offline');
  assert.deepEqual(
    prismaEnvironment({ DATABASE_URL: 'postgresql://developer@localhost:5433/kiditem', PATH: '/usr/bin' }),
    { DATABASE_URL: OFFLINE_DATABASE_URL, PATH: '/usr/bin' },
  );

  const source = readFileSync(scriptPath, 'utf8');
  assert.doesNotMatch(source, /['"]npx(?:\.cmd)?['"]/, 'npx could run another Prisma');
  assert.doesNotMatch(source, /\bshell\s*:/, 'no shell parses the command');
});

test('reads options in both spellings and refuses unknown or empty ones', () => {
  assert.deepEqual(
    parseArguments(['--base-ref', 'origin/main', '--head-schema=prisma/next', '--coverage', 'c.json', '--json']),
    { baseRef: 'origin/main', headSchema: 'prisma/next', coveragePath: 'c.json', json: true, help: false },
  );
  assert.deepEqual(parseArguments([]), {
    baseRef: 'origin/release/office',
    headSchema: 'prisma',
    coveragePath: 'scripts/cutover-blocker-coverage.json',
    json: false,
    help: false,
  });
  assert.throws(() => parseArguments(['--base']), /^CheckError: Unknown argument "--base"\./);
  assert.throws(() => parseArguments(['--coverage']), /--coverage needs a value\./);
  assert.throws(() => parseArguments(['--coverage', '--json']), /--coverage needs a value\./);
  assert.throws(() => parseArguments(['--base-ref=']), /--base-ref needs a value\./);
});

test('exits 0 for help and 2 when it cannot run', () => {
  const output = [];
  const record = (line) => output.push(line);
  assert.equal(main(['--help'], { log: record, error: record }), 0);
  assert.match(output.join('\n'), /--base-ref <ref>[\s\S]*Exit codes: 0 every change covered, 1 a change uncovered/);

  output.length = 0;
  assert.equal(main(['--bogus'], { log: record, error: record }), 2);
  assert.match(output.join('\n'), /^Unknown argument "--bogus"\./);

  output.length = 0;
  assert.equal(main(['--base-ref', 'refs/heads/kid-no-such-branch-for-coverage'], { log: record, error: record }), 2);
  assert.match(output.join('\n'), /^check:cutover-blocker-coverage could not run: Base ref refs\/heads\/kid-no-such-branch-for-coverage is not available/);
});

test('the command line exits 2 without a base ref, before running Prisma', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--base-ref', 'refs/heads/kid-no-such-branch-for-coverage'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /is not available in this checkout/);
});
