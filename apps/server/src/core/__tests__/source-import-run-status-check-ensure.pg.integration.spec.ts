import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import {
  ensureSourceImportRunStatusCheck,
  SOURCE_IMPORT_RUN_STATUS_CHECK,
  sourceImportRunStatusCheckExpression,
} from '../../../../../scripts/data-migrations/helpers/source-import-run-status-check';
import { runEnsureSteps } from '../../../../../scripts/data-migrations/ensure/index';
import {
  SOURCE_IMPORT_RUN_STATUS_CHECK_GUIDANCE,
  SourceImportRunStatusCheckError,
  sourceImportRunStatusCheckStep,
} from '../../../../../scripts/data-migrations/ensure/source-import-run-status-check';

/** A status set that still admitted a word the current set dropped. */
const PREVIOUS_STATUS_CHECK = `(status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'superseded'::text]))`;

/**
 * `ensure:source_import_run_status_check` re-applies the status CHECK after
 * every post-schema `data:migrate -- up`. Tests that change the constraint
 * roll it back or restore it, because later suites share this database.
 */
describe('ensure:source_import_run_status_check (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterEach(async () => {
    await resetDb(prisma);
    await prisma.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT IF EXISTS source_import_runs_status_check`;
    await prisma.$transaction((tx) => ensureSourceImportRunStatusCheck(tx));
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('reports no change for the constraint the schema setup applied', async () => {
    await expect(runStep()).resolves.toEqual([{
      migrationId: 'ensure:source_import_run_status_check',
      status: 'ensured',
      affectedRows: 0,
      details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome: 'unchanged' },
    }]);
    await expect(readConstraint()).resolves.toEqual([
      { expression: sourceImportRunStatusCheckExpression(), validated: true },
    ]);
  });

  it('creates a missing constraint and re-creates one with another status set', async () => {
    const rollback = new Error('keep the applied constraint for later suites');
    const outcomes: unknown[] = [];

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT source_import_runs_status_check`;
      outcomes.push(await sourceImportRunStatusCheckStep.run(tx, { target: 'local' }));
      outcomes.push(await sourceImportRunStatusCheckStep.run(tx, { target: 'local' }));

      await tx.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT source_import_runs_status_check`;
      await tx.$executeRaw`
        ALTER TABLE source_import_runs
        ADD CONSTRAINT source_import_runs_status_check CHECK (status IN ('running', 'completed'))
      `;
      outcomes.push(await sourceImportRunStatusCheckStep.run(tx, { target: 'local' }));
      // The re-created constraint admits the whole current set again.
      await tx.sourceImportRun.create({
        data: { organizationId: TEST_ORGANIZATION_ID, sourceType: 'kid243_status_check', status: 'failed' },
      });
      throw rollback;
    }, { timeout: 30_000 })).rejects.toBe(rollback);

    expect(outcomes).toEqual([
      { changedRows: 1, details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome: 'created' } },
      { changedRows: 0, details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome: 'unchanged' } },
      { changedRows: 1, details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome: 'recreated' } },
    ]);
    await expect(readConstraint()).resolves.toEqual([
      { expression: sourceImportRunStatusCheckExpression(), validated: true },
    ]);
  });

  it('refuses the new status set while a run holds a dropped status, keeps the previous constraint, and applies once the run is cleaned up', async () => {
    // A database from before the set dropped `superseded`, with a run still in it.
    await prisma.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT source_import_runs_status_check`;
    await prisma.$executeRaw`
      ALTER TABLE source_import_runs
      ADD CONSTRAINT source_import_runs_status_check
      CHECK (status IN ('running', 'completed', 'failed', 'superseded'))
    `;
    const stale = await prisma.sourceImportRun.create({
      data: { organizationId: TEST_ORGANIZATION_ID, sourceType: 'kid243_status_check', status: 'superseded' },
    });

    const failure = await runStep().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SourceImportRunStatusCheckError);
    expect((failure as Error).message).toContain(
      `${SOURCE_IMPORT_RUN_STATUS_CHECK} was not applied: ${SOURCE_IMPORT_RUN_STATUS_CHECK_GUIDANCE}.`,
    );
    expect((failure as Error).message).toContain('violated by some row');
    expect((failure as SourceImportRunStatusCheckError).cause).toMatchObject({
      meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
    });
    // The failed step rolled back its DROP, so the previous constraint still holds.
    await expect(readConstraint()).resolves.toEqual([
      { expression: PREVIOUS_STATUS_CHECK, validated: true },
    ]);

    // A pre-schema cleanup would remove the run; after it, the same command applies.
    await prisma.sourceImportRun.delete({ where: { id: stale.id } });
    await expect(runStep()).resolves.toMatchObject([
      { affectedRows: 1, details: { outcome: 'recreated' } },
    ]);
    await expect(runStep()).resolves.toMatchObject([
      { affectedRows: 0, details: { outcome: 'unchanged' } },
    ]);
    await expect(readConstraint()).resolves.toEqual([
      { expression: sourceImportRunStatusCheckExpression(), validated: true },
    ]);
  });

  function runStep() {
    return runEnsureSteps(prisma, [sourceImportRunStatusCheckStep], { target: 'local' }, 30_000);
  }

  function readConstraint() {
    return prisma.$queryRaw<Array<{ expression: string; validated: boolean }>>`
      SELECT pg_get_expr(conbin, conrelid) AS expression, convalidated AS validated
      FROM pg_constraint
      WHERE conrelid = 'public.source_import_runs'::regclass
        AND conname = ${SOURCE_IMPORT_RUN_STATUS_CHECK}
    `;
  }
});
