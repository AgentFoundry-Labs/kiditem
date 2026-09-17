import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  columnAdditions,
  notNullAdditions,
  predicateWithInitialValues,
  prismaDiffCommand,
  surveyExitCode,
  uniqueIndexes,
} from '../check-cutover-data-blockers.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const surveyPath = join(repoRoot, 'scripts', 'check-cutover-data-blockers.mjs');

/**
 * The survey's correctness rests on reading Prisma's own DDL faithfully. Missing
 * one statement means a cutover halts on something this was supposed to find, so
 * the parsers are tested against the exact shapes `prisma migrate diff` emits.
 */

test('reads a unique index over several columns', () => {
  const [index] = uniqueIndexes(
    'CREATE UNIQUE INDEX "alerts_organization_id_dedupe_key_key" ON "alerts"("organization_id", "dedupe_key");',
  );
  assert.equal(index.table, 'alerts');
  assert.deepEqual(index.columns, ['organization_id', 'dedupe_key']);
  assert.equal(index.where, null);
});

test('keeps a partial index predicate, which decides which rows can collide', () => {
  const [index] = uniqueIndexes(
    'CREATE UNIQUE INDEX "reviews_key" ON "reviews"("organization_id", "external_review_id") WHERE source_import_run_id IS NOT NULL;',
  );
  assert.deepEqual(index.columns, ['organization_id', 'external_review_id']);
  assert.equal(index.where, 'WHERE source_import_run_id IS NOT NULL');
});

test('ignores a non-unique index', () => {
  assert.deepEqual(
    uniqueIndexes('CREATE INDEX "alerts_organization_id_idx" ON "alerts"("organization_id");'),
    [],
  );
});

test('reads every NOT NULL column of a multi-clause ALTER TABLE', () => {
  // Prisma folds several additions into one statement; reading only the first is
  // how ten blockers on one table would be reported as one.
  const additions = notNullAdditions(`
-- AlterTable
ALTER TABLE "master_product_abc_evaluations" ADD COLUMN     "abc_grade" TEXT NOT NULL,
ADD COLUMN     "advertising_generation" BIGINT NOT NULL,
ADD COLUMN     "grade_basis_cutoff_date" DATE NOT NULL;
`);
  assert.deepEqual(
    additions.map((addition) => addition.column),
    ['abc_grade', 'advertising_generation', 'grade_basis_cutoff_date'],
  );
  assert.ok(additions.every((addition) => addition.table === 'master_product_abc_evaluations'));
});

test('passes over a NOT NULL column the database can fill itself', () => {
  // A DEFAULT in the DDL means existing rows are filled by Postgres. Prisma's
  // `@default(uuid())` is client-side and emits no DEFAULT, which is exactly the
  // case that blocks — so the distinction is the whole point of this check.
  assert.deepEqual(
    notNullAdditions('ALTER TABLE "alerts" ADD COLUMN "kind" TEXT NOT NULL DEFAULT \'system\';'),
    [],
  );
  assert.deepEqual(
    notNullAdditions('ALTER TABLE "alerts" ADD COLUMN "dedupe_key" TEXT NOT NULL;'),
    [{ table: 'alerts', column: 'dedupe_key' }],
  );
});

test('passes over a nullable column', () => {
  assert.deepEqual(notNullAdditions('ALTER TABLE "alerts" ADD COLUMN "href" TEXT;'), []);
});

// Prisma writes a precision's comma inside the clause. Splitting there once
// read `DECIMAL(12,6) NOT NULL` as `DECIMAL(12` and passed eight required ABC
// columns over.
test('blocks a DECIMAL(12,6) NOT NULL column without a default', () => {
  assert.deepEqual(
    notNullAdditions('ALTER TABLE "evaluations" ADD COLUMN "score" DECIMAL(12,6) NOT NULL;'),
    [{ table: 'evaluations', column: 'score' }],
  );
  assert.deepEqual(
    columnAdditions('ALTER TABLE "evaluations" ADD COLUMN "score" DECIMAL(12,6) NOT NULL;'),
    [{ table: 'evaluations', column: 'score', initialSql: null }],
  );
});

test('passes over a DECIMAL(12,6) NOT NULL column with a default', () => {
  const sql = 'ALTER TABLE "evaluations" ADD COLUMN "score" DECIMAL(12,6) NOT NULL DEFAULT 0;';
  assert.deepEqual(notNullAdditions(sql), []);
  assert.deepEqual(columnAdditions(sql), [{ table: 'evaluations', column: 'score', initialSql: '0' }]);
});

test('passes over a nullable VARCHAR(80) column', () => {
  const sql = 'ALTER TABLE "evaluations" ADD COLUMN "label" VARCHAR(80);';
  assert.deepEqual(notNullAdditions(sql), []);
  assert.deepEqual(columnAdditions(sql), [{ table: 'evaluations', column: 'label', initialSql: 'NULL' }]);
});

test('reads each clause of an ALTER TABLE that mixes precision types, defaults, and nullability', () => {
  const sql = `
-- AlterTable
ALTER TABLE "evaluations" DROP COLUMN "adjusted_score",
ADD COLUMN     "consistency_score" DECIMAL(12,6) NOT NULL,
ADD COLUMN     "margin_score" DECIMAL(12,6),
ADD COLUMN     "label" VARCHAR(80),
ADD COLUMN     "weight" DECIMAL(20,6) NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY['a', 'b']::TEXT[],
ADD COLUMN     "profit_score" DECIMAL(12,6) NOT NULL,
ALTER COLUMN "calculated_at" SET NOT NULL;
`;
  assert.deepEqual(notNullAdditions(sql), [
    { table: 'evaluations', column: 'consistency_score' },
    { table: 'evaluations', column: 'profit_score' },
  ]);
  assert.deepEqual(columnAdditions(sql), [
    { table: 'evaluations', column: 'consistency_score', initialSql: null },
    { table: 'evaluations', column: 'margin_score', initialSql: 'NULL' },
    { table: 'evaluations', column: 'label', initialSql: 'NULL' },
    { table: 'evaluations', column: 'weight', initialSql: '0' },
    { table: 'evaluations', column: 'tags', initialSql: "ARRAY['a', 'b']::TEXT[]" },
    { table: 'evaluations', column: 'profit_score', initialSql: null },
  ]);
});

test("does not read an ADD COLUMN out of a different table's statement", () => {
  const additions = notNullAdditions(`
ALTER TABLE "first" ADD COLUMN "a" TEXT NOT NULL;
ALTER TABLE "second" ADD COLUMN "b" TEXT NOT NULL;
`);
  assert.deepEqual(additions, [
    { table: 'first', column: 'a' },
    { table: 'second', column: 'b' },
  ]);
});

test('records the value PostgreSQL gives existing rows for a new column', () => {
  const additions = columnAdditions(`
ALTER TABLE "snapshots" ADD COLUMN "source_import_run_id" UUID,
ADD COLUMN "is_current_complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "required_without_default" TEXT NOT NULL;
`);

  assert.deepEqual(additions, [
    { table: 'snapshots', column: 'source_import_run_id', initialSql: 'NULL' },
    { table: 'snapshots', column: 'is_current_complete', initialSql: 'false' },
    {
      table: 'snapshots',
      column: 'required_without_default',
      initialSql: null,
    },
  ]);
});

test('evaluates a partial-index predicate using new-column values for existing rows', () => {
  const additions = columnAdditions(`
ALTER TABLE "snapshots" ADD COLUMN "source_import_run_id" UUID,
ADD COLUMN "is_current_complete" BOOLEAN NOT NULL DEFAULT false;
`);

  assert.deepEqual(
    predicateWithInitialValues(
      'WHERE source_import_run_id IS NULL AND is_current_complete = true',
      'snapshots',
      additions,
    ),
    {
      where: 'WHERE NULL IS NULL AND false = true',
      replaced: ['is_current_complete', 'source_import_run_id'],
    },
  );
});

test('blocks a schema cutover while any survey item is still pending', () => {
  assert.equal(surveyExitCode([], []), 0);
  assert.equal(surveyExitCode([{}], []), 1);
  assert.equal(surveyExitCode([], [{}]), 1);
});

/**
 * The Office deployer runs this survey on the Windows host between the
 * pre-schema migrations and `db push`, and any non-zero exit stops the cutover.
 * A survey that cannot start there would stop every cutover.
 */
test("runs this checkout's Prisma CLI with the current Node executable, from the repository root", () => {
  const command = prismaDiffCommand();
  assert.equal(command.file, process.execPath);
  assert.match(command.args[0], /[\\/]node_modules[\\/]prisma[\\/]build[\\/]index\.js$/);
  assert.ok(command.args[0].startsWith(repoRoot), 'the Prisma CLI comes from this checkout');
  assert.deepEqual(command.args.slice(1), [
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema=prisma',
    '--script',
  ]);
  assert.equal(command.cwd, repoRoot);

  const source = readFileSync(surveyPath, 'utf8');
  assert.doesNotMatch(source, /['"]npx(?:\.cmd)?['"]/, 'npx is a .cmd shim on Windows');
  assert.doesNotMatch(source, /\bshell\s*:/, 'no shell parses the command');
});

test('issues only SELECT statements against the surveyed database', () => {
  const source = readFileSync(surveyPath, 'utf8');
  const statements = [...source.matchAll(/client\.query\(\s*`\s*(\w+)/g)].map((match) => match[1]);
  assert.ok(statements.length >= 3, 'the scan finds the survey queries');
  assert.deepEqual([...new Set(statements)], ['SELECT']);
  assert.equal(source.match(/client\.query\(/g)?.length, statements.length, 'every query is a template literal the scan can read');
});

test('exits non-zero without a database URL, before reaching any database', () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, [surveyPath], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /DATABASE_URL is required/);
});
