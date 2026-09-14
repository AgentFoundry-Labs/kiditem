import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { SOURCE_IMPORT_RUN_STATUSES } from '@kiditem/shared/source-import';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import type { PrismaClient } from '@prisma/client';

const repoRoot = path.resolve(__dirname, '../../../../..');

/**
 * `SourceImportRun.status` is a Prisma String, and PostgreSQL holds it to
 * SOURCE_IMPORT_RUN_STATUSES. The integration setup creates the constraint
 * after `db push` from the module data migration v0.1.31:012 uses.
 */
describe('source_import_runs_status_check (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('is in place after the integration schema setup, as the migration creates it', async () => {
    await expect(prisma.$queryRaw`
      SELECT pg_get_expr(conbin, conrelid) AS expression, convalidated AS validated
      FROM pg_constraint
      WHERE conrelid = 'public.source_import_runs'::regclass
        AND conname = ${SOURCE_IMPORT_RUN_STATUS_CHECK}
    `).resolves.toEqual([
      { expression: sourceImportRunStatusCheckExpression(), validated: true },
    ]);
    await expect(
      prisma.$transaction((tx) => ensureSourceImportRunStatusCheck(tx)),
    ).resolves.toBe('unchanged');
  });

  it('accepts every allowed status and rejects any other on insert and update', async () => {
    for (const status of SOURCE_IMPORT_RUN_STATUSES) {
      await expect(createRun(status)).resolves.toMatchObject({ status });
    }
    for (const status of ['complete', 'COMPLETED', 'cancelled', '']) {
      await expect(createRun(status)).rejects.toThrow(SOURCE_IMPORT_RUN_STATUS_CHECK);
    }

    const run = await createRun('running');
    await expect(prisma.sourceImportRun.update({
      where: { id: run.id },
      data: { status: 'complete' },
    })).rejects.toThrow(SOURCE_IMPORT_RUN_STATUS_CHECK);
    await expect(prisma.$executeRaw`
      UPDATE source_import_runs SET status = 'superseded' WHERE id = ${run.id}::uuid
    `).rejects.toThrow(SOURCE_IMPORT_RUN_STATUS_CHECK);

    await expect(prisma.sourceImportRun.groupBy({
      by: ['status'],
      where: { organizationId: TEST_ORGANIZATION_ID },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    })).resolves.toEqual([
      { status: 'completed', _count: { _all: 1 } },
      { status: 'failed', _count: { _all: 1 } },
      { status: 'running', _count: { _all: 2 } },
    ]);
  });

  it('is not in the SQL `prisma db push` plans for a changed source_import_runs table', async () => {
    // Drift that makes Prisma alter source_import_runs itself.
    await prisma.$executeRaw`ALTER TABLE source_import_runs ADD COLUMN kid124_schema_drift text`;
    try {
      // prisma.config.ts reads DATABASE_URL, which the integration setup points at this container.
      const plan = execFileSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma', '--script'],
        { cwd: repoRoot, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      expect(plan).toMatch(/ALTER TABLE "source_import_runs" DROP COLUMN "kid124_schema_drift"/);
      expect(plan).not.toContain(SOURCE_IMPORT_RUN_STATUS_CHECK);
      expect(plan).not.toMatch(/ALTER TABLE "source_import_runs"[^;]*DROP CONSTRAINT/);
    } finally {
      await prisma.$executeRaw`ALTER TABLE source_import_runs DROP COLUMN IF EXISTS kid124_schema_drift`;
    }
  }, 60_000);

  function createRun(status: string) {
    return prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'kid124_status_check',
        status,
      },
    });
  }
});
