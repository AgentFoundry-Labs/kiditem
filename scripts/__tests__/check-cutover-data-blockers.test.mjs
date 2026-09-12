import assert from 'node:assert/strict';
import test from 'node:test';
import {
  columnAdditions,
  notNullAdditions,
  predicateWithInitialValues,
  surveyExitCode,
  uniqueIndexes,
} from '../check-cutover-data-blockers.mjs';

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
