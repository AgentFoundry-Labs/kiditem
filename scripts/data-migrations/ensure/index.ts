import type { PrismaClient } from '@prisma/client';
import type { DataMigrationContext } from '../types';
import { absoluteProductAbcFormulaStep } from './absolute-product-abc-formula';
import { sourceImportRunStatusCheckStep } from './source-import-run-status-check';
import type { EnsureStep } from './types';

export type { EnsureStep, EnsureStepResult } from './types';

/** Run in this order after the selected migrations of every post-schema or `all` run. */
export const ensureSteps: readonly EnsureStep[] = Object.freeze([
  sourceImportRunStatusCheckStep,
  absoluteProductAbcFormulaStep,
]);

export const ENSURE_STEP_IDS = Object.freeze(ensureSteps.map((step) => step.id));

export type EnsureStepRunResult = {
  migrationId: EnsureStep['id'];
  status: 'ensured';
  affectedRows: number;
  details: Record<string, unknown>;
};

/**
 * Ensure steps work on the pushed schema, so a pre-schema run has none. They
 * do not follow `--release-version`: the state they keep belongs to the
 * current schema, not to a release.
 */
export function selectEnsureStepsForPhase(
  phase: 'all' | 'pre-schema' | 'post-schema',
): readonly EnsureStep[] {
  return phase === 'pre-schema' ? [] : ensureSteps;
}

/**
 * Runs each step in its own transaction, in order, and stops at the first
 * failure. The failing step's transaction rolls back; steps before it stay
 * applied, which is safe because every step is idempotent. Nothing is recorded
 * in `data_migration_runs`, so the results appear only in the `up` output.
 */
export async function runEnsureSteps(
  prisma: Pick<PrismaClient, '$transaction'>,
  steps: readonly EnsureStep[],
  context: DataMigrationContext,
  timeoutMs: number,
): Promise<EnsureStepRunResult[]> {
  const results: EnsureStepRunResult[] = [];
  for (const step of steps) {
    const result = await prisma.$transaction((tx) => step.run(tx, context), {
      timeout: timeoutMs,
    });
    results.push({
      migrationId: step.id,
      status: 'ensured',
      affectedRows: result.changedRows,
      details: result.details,
    });
  }
  return results;
}
