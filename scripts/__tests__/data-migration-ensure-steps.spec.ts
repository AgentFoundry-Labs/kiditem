import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DATA_MIGRATION_IDS,
  retiredDataMigrations,
} from '../data-migrations/index';
import {
  ENSURE_STEP_IDS,
  ensureSteps,
  runEnsureSteps,
  selectEnsureStepsForPhase,
  type EnsureStep,
} from '../data-migrations/ensure/index';
import {
  AbsoluteProductAbcFormulaConflictError,
  absoluteProductAbcFormulaLockKeys,
} from '../data-migrations/ensure/absolute-product-abc-formula';
import {
  SOURCE_IMPORT_RUN_STATUS_CHECK_GUIDANCE,
  SourceImportRunStatusCheckError,
  sourceImportRunStatusCheckStep,
} from '../data-migrations/ensure/source-import-run-status-check';
import {
  SOURCE_IMPORT_RUN_STATUS_CHECK,
  sourceImportRunStatusCheckExpression,
} from '../data-migrations/helpers/source-import-run-status-check';

const repoRoot = join(__dirname, '..', '..');

describe('data migration ensure steps', () => {
  it('runs the status CHECK before the ABC formula under ensure: ids no migration uses', () => {
    expect(ENSURE_STEP_IDS).toEqual([
      'ensure:source_import_run_status_check',
      'ensure:absolute_product_abc_formula',
    ]);
    for (const id of ENSURE_STEP_IDS) expect(id).toMatch(/^ensure:[a-z0-9_]+$/);
    expect(new Set(ENSURE_STEP_IDS).size).toBe(ENSURE_STEP_IDS.length);
    const migrationIds = new Set([
      ...DATA_MIGRATION_IDS,
      ...retiredDataMigrations.map(({ id }) => id),
    ]);
    expect(ENSURE_STEP_IDS.filter((id) => migrationIds.has(id))).toEqual([]);
  });

  it('selects every step after the schema push and none before it', () => {
    expect(selectEnsureStepsForPhase('pre-schema')).toEqual([]);
    expect(selectEnsureStepsForPhase('post-schema')).toBe(ensureSteps);
    expect(selectEnsureStepsForPhase('all')).toBe(ensureSteps);
  });

  it('runs each step in its own transaction with the migration timeout', async () => {
    const { prisma, transactions } = fakePrisma();
    const seen: string[] = [];
    const steps = [
      fakeStep('ensure:first', async (tx, context) => {
        seen.push(`${tx.label}:${context.target}`);
        return { changedRows: 0, details: { outcome: 'unchanged' } };
      }),
      fakeStep('ensure:second', async (tx, context) => {
        seen.push(`${tx.label}:${context.target}`);
        return { changedRows: 3, details: { createdCount: 3 } };
      }),
    ];

    await expect(runEnsureSteps(prisma, steps, { target: 'office' }, 45_000)).resolves.toEqual([
      { migrationId: 'ensure:first', status: 'ensured', affectedRows: 0, details: { outcome: 'unchanged' } },
      { migrationId: 'ensure:second', status: 'ensured', affectedRows: 3, details: { createdCount: 3 } },
    ]);
    expect(seen).toEqual(['tx1:office', 'tx2:office']);
    expect(transactions).toEqual([{ timeout: 45_000 }, { timeout: 45_000 }]);
  });

  it('stops at the first failing step', async () => {
    const { prisma, transactions } = fakePrisma();
    const failure = new Error('step failed');
    const later = vi.fn();
    const steps = [
      fakeStep('ensure:failing', async () => {
        throw failure;
      }),
      fakeStep('ensure:later', later),
    ];

    await expect(runEnsureSteps(prisma, steps, { target: 'local' }, 1_000)).rejects.toBe(failure);
    expect(later).not.toHaveBeenCalled();
    expect(transactions).toHaveLength(1);
  });
});

describe('ensure:source_import_run_status_check', () => {
  const applied = [{ expression: sourceImportRunStatusCheckExpression(), validated: true }];

  it('counts one change only when the constraint is created or re-created', async () => {
    const unchanged = checkTransaction(applied);
    await expect(sourceImportRunStatusCheckStep.run(unchanged.client, { target: 'local' })).resolves.toEqual({
      changedRows: 0,
      details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome: 'unchanged' },
    });
    expect(unchanged.tx.$executeRaw).not.toHaveBeenCalled();

    const missing = checkTransaction([]);
    await expect(sourceImportRunStatusCheckStep.run(missing.client, { target: 'local' })).resolves.toEqual({
      changedRows: 1,
      details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome: 'created' },
    });

    const different = checkTransaction([{ expression: "(status = 'running'::text)", validated: true }]);
    await expect(sourceImportRunStatusCheckStep.run(different.client, { target: 'local' })).resolves.toEqual({
      changedRows: 1,
      details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome: 'recreated' },
    });
    expect(different.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('rethrows a row that violates the constraint with the cleanup guidance', async () => {
    const violation = prismaRawError('23514', 'check constraint "source_import_runs_status_check" of relation "source_import_runs" is violated by some row');
    const { client } = checkTransaction([], violation);

    const failure = await sourceImportRunStatusCheckStep.run(client, { target: 'local' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SourceImportRunStatusCheckError);
    expect((failure as Error).message).toBe(
      `${SOURCE_IMPORT_RUN_STATUS_CHECK} was not applied: `
        + 'statuses outside SOURCE_IMPORT_RUN_STATUSES exist; add a pre-schema cleanup before changing the set. '
        + `PostgreSQL: ${violation.message}`,
    );
    expect(SOURCE_IMPORT_RUN_STATUS_CHECK_GUIDANCE).toBe(
      'statuses outside SOURCE_IMPORT_RUN_STATUSES exist; add a pre-schema cleanup before changing the set',
    );
    expect((failure as SourceImportRunStatusCheckError).cause).toBe(violation);
  });

  it('passes any other failure through unchanged', async () => {
    const denied = prismaRawError('42501', 'must be owner of table source_import_runs');
    await expect(sourceImportRunStatusCheckStep.run(checkTransaction([], denied).client, { target: 'local' }))
      .rejects.toBe(denied);
  });
});

describe('ensure:absolute_product_abc_formula', () => {
  it('takes the server mapping lock and then the server ABC publication lock', () => {
    expect(absoluteProductAbcFormulaLockKeys('org-1')).toEqual([
      'kiditem.product-mapping:org-1',
      'kiditem.master-product-abc:org-1',
    ]);

    const mapping = readRepoFile('apps/server/src/common/product-mapping-generation.ts');
    expect(mapping).toContain("const PRODUCT_MAPPING_LOCK_PREFIX = 'kiditem.product-mapping:';");
    expect(mapping).toMatch(/pg_advisory_xact_lock\(\s*hashtextextended\(\$\{lockKey\}, 0\)\s*\)/);

    const publication = readRepoFile(
      'apps/server/src/products/adapter/out/repository/master-product-abc.repository.adapter.ts',
    );
    const lockOrder = [
      "await lockNamed(tx, 'kiditem.sellpia-product-profitability', input.organizationId);",
      "await lockNamed(tx, 'kiditem.coupang-ad-profitability', input.organizationId);",
      'await lockProductMapping(tx, input.organizationId);',
      "await lockNamed(tx, 'kiditem.master-product-abc', input.organizationId);",
    ].map((statement) => publication.indexOf(statement));
    expect(lockOrder.every((index) => index >= 0)).toBe(true);
    expect([...lockOrder].sort((left, right) => left - right)).toEqual(lockOrder);
    expect(publication).toContain('const lockKey = `${scope}:${organizationId}`;');
    expect(publication).toContain('pg_advisory_xact_lock(hashtextextended(${lockKey}, 0::bigint))');
  });

  it('names every conflicting organization by kind', () => {
    const error = new AbsoluteProductAbcFormulaConflictError(['org-a'], ['org-b', 'org-c']);

    expect(error.name).toBe('AbsoluteProductAbcFormulaConflictError');
    expect(error.message).toContain('PRODUCT_ABC_ABSOLUTE v2 is stored with a checksum other than');
    expect(error.message).toContain('for organizations org-a;');
    expect(error.message).toContain('is not mapping-only');
    expect(error.message).toContain('for organizations org-b, org-c.');
    expect(new AbsoluteProductAbcFormulaConflictError([], ['org-d']).message)
      .not.toContain('checksum');
  });
});

type FakeTransaction = { label: string };

function fakePrisma() {
  const transactions: unknown[] = [];
  const prisma = {
    $transaction: async (
      callback: (tx: FakeTransaction) => Promise<unknown>,
      options: unknown,
    ) => {
      transactions.push(options);
      return callback({ label: `tx${transactions.length}` });
    },
  };
  return { prisma: prisma as never, transactions };
}

function fakeStep(
  id: EnsureStep['id'],
  run: (
    tx: FakeTransaction,
    context: Parameters<EnsureStep['run']>[1],
  ) => Promise<Awaited<ReturnType<EnsureStep['run']>>>,
): EnsureStep {
  return { id, name: id, run: run as never };
}

/** The raw client calls `ensureSourceImportRunStatusCheck` makes. */
function checkTransaction(existing: unknown[], addFailure?: Error) {
  const tx = {
    $queryRaw: vi.fn(async () => existing),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      if (addFailure && strings.join('').includes('ADD CONSTRAINT')) throw addFailure;
      return 0;
    }),
  };
  return { tx, client: tx as never };
}

/** The shape Prisma gives a failed raw statement through the pg driver adapter. */
function prismaRawError(sqlState: string, message: string): Error {
  return Object.assign(
    new Error(`Raw query failed. Code: \`${sqlState}\`. Message: \`${message}\``),
    {
      code: 'P2010',
      meta: {
        driverAdapterError: Object.assign(new Error(message), {
          name: 'DriverAdapterError',
          cause: { originalCode: sqlState, originalMessage: message, kind: 'postgres', code: sqlState },
        }),
      },
    },
  );
}

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}
