import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH } from '@kiditem/shared/product-abc';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestPrisma, resetDb } from '../test-helpers/real-prisma';
import {
  ensureSourceImportRunStatusCheck,
  SOURCE_IMPORT_RUN_STATUS_CHECK,
  sourceImportRunStatusCheckExpression,
} from '../../../../scripts/data-migrations/helpers/source-import-run-status-check';

const repoRoot = path.resolve(__dirname, '../../../..');
const tsxCli = require.resolve('tsx/cli');
/** A release no migration belongs to, so `up` runs only the ensure steps. */
const NO_MIGRATION_RELEASE = '9.9.9';
const INVENTORY_ORGANIZATION_ID = 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70';
const UNINSTALLED_ORGANIZATION_ID = 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81';

type UpReport = {
  migrationIds: string[];
  results: Array<{
    migrationId: string;
    status: string;
    affectedRows: number;
    details?: Record<string, unknown>;
  }>;
};

/**
 * A database right after a plain `db push` has no ledger rows, no status
 * CHECK and no ABC formula: neither v0.1.31:012 nor v0.1.31:002 has touched
 * it. The real `data:migrate` and bootstrap commands must still leave it with
 * the constraint and a formula for every organization created later.
 */
describe('data:migrate ensure steps on a freshly pushed database (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await dropStatusCheck();
  });

  afterEach(async () => {
    // Later suites share this database, so restore the pushed shape.
    await resetDb(prisma);
    await dropStatusCheck();
    await prisma.$transaction((tx) => ensureSourceImportRunStatusCheck(tx));
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('creates the status CHECK and gives every later organization the current formula', async () => {
    await expect(readStatusCheck()).resolves.toEqual([]);

    // Pre-schema selects no ensure step.
    const preSchema = up('pre-schema');
    expect(preSchema).toMatchObject({ migrationIds: [], results: [] });
    await expect(readStatusCheck()).resolves.toEqual([]);

    const first = up('post-schema');
    expect(first.migrationIds).toEqual([]);
    expect(first.results).toEqual([
      {
        migrationId: 'ensure:source_import_run_status_check',
        status: 'ensured',
        affectedRows: 1,
        details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome: 'created' },
      },
      {
        migrationId: 'ensure:absolute_product_abc_formula',
        status: 'ensured',
        affectedRows: 0,
        details: {
          organizationCount: 0,
          createdFormulaVersionCount: 0,
          createdFormulaStateCount: 0,
          attachedMappingOnlyStateCount: 0,
        },
      },
    ]);
    await expect(readStatusCheck()).resolves.toEqual([
      { expression: sourceImportRunStatusCheckExpression(), validated: true },
    ]);

    // Organizations the bootstrap commands create get the formula in their own transaction.
    runScript('scripts/bootstrap-authoritative-inventory-dev.ts', [
      '--organization-id', INVENTORY_ORGANIZATION_ID,
      '--organization-name', 'KID-243 Inventory',
      '--organization-slug', 'kid243-inventory',
      '--coupang-vendor-id', 'KID243-VENDOR',
    ]);
    runScript('scripts/bootstrap-local-auth-user.ts', [
      '--email', 'kid243.bootstrap@example.test',
      '--name', 'KID-243 Bootstrap',
      '--organization-name', 'KID-243 Login',
      '--organization-slug', 'kid243-login',
      '--password-stdin',
    ], 'synthetic-kid243-password\n');
    await expect(readFormulas()).resolves.toEqual([
      installedFormula('kid243-inventory'),
      installedFormula('kid243-login'),
    ]);

    // An organization that arrived without one gets it from the next run.
    await prisma.organization.create({
      data: { id: UNINSTALLED_ORGANIZATION_ID, name: 'KID-243 Without Formula', slug: 'kid243-without-formula' },
    });
    const second = up('post-schema');
    expect(second.results).toEqual([
      expect.objectContaining({ migrationId: 'ensure:source_import_run_status_check', affectedRows: 0 }),
      {
        migrationId: 'ensure:absolute_product_abc_formula',
        status: 'ensured',
        affectedRows: 2,
        details: {
          organizationCount: 3,
          createdFormulaVersionCount: 1,
          createdFormulaStateCount: 1,
          attachedMappingOnlyStateCount: 0,
        },
      },
    ]);
    await expect(readFormulas()).resolves.toEqual([
      installedFormula('kid243-inventory'),
      installedFormula('kid243-login'),
      installedFormula('kid243-without-formula'),
    ]);

    const third = up('post-schema');
    expect(third.results.map(({ affectedRows }) => affectedRows)).toEqual([0, 0]);
    // Ensure steps leave no ledger rows.
    await expect(prisma.dataMigrationRun.count()).resolves.toBe(0);
  }, 180_000);

  function up(phase: 'pre-schema' | 'post-schema'): UpReport {
    const stdout = runScript('scripts/run-data-migrations.ts', [
      'up',
      '--phase', phase,
      '--release-version', NO_MIGRATION_RELEASE,
      '--target', 'local',
      '--confirm', 'APPLY_DATA_MIGRATIONS',
    ]);
    return JSON.parse(stdout.slice(stdout.indexOf('{'))) as UpReport;
  }

  function runScript(script: string, args: string[], input?: string): string {
    // The integration setup points DATABASE_URL at this container; a local
    // .env never overrides a variable that is already set.
    return execFileSync(process.execPath, [tsxCli, script, ...args], {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  async function dropStatusCheck() {
    await prisma.$executeRaw`ALTER TABLE source_import_runs DROP CONSTRAINT IF EXISTS source_import_runs_status_check`;
  }

  function readStatusCheck() {
    return prisma.$queryRaw<Array<{ expression: string; validated: boolean }>>`
      SELECT pg_get_expr(conbin, conrelid) AS expression, convalidated AS validated
      FROM pg_constraint
      WHERE conrelid = 'public.source_import_runs'::regclass
        AND conname = ${SOURCE_IMPORT_RUN_STATUS_CHECK}
    `;
  }

  async function readFormulas() {
    const organizations = await prisma.organization.findMany({
      orderBy: { slug: 'asc' },
      select: {
        slug: true,
        masterProductAbcFormulaState: {
          select: {
            formulaRevision: true,
            publicationRevision: true,
            publishedAt: true,
            activeFormulaVersion: {
              select: { formulaKey: true, version: true, formulaChecksum: true },
            },
          },
        },
      },
    });
    return organizations.map(({ slug, masterProductAbcFormulaState }) => ({
      slug,
      state: masterProductAbcFormulaState,
    }));
  }
});

function installedFormula(slug: string) {
  return {
    slug,
    state: {
      formulaRevision: 1,
      publicationRevision: 0,
      publishedAt: null,
      activeFormulaVersion: {
        formulaKey: 'PRODUCT_ABC_ABSOLUTE',
        version: 2,
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
      },
    },
  };
}
