import {
  ensureSourceImportRunStatusCheck,
  SOURCE_IMPORT_RUN_STATUS_CHECK,
  type SourceImportRunStatusCheckOutcome,
} from '../helpers/source-import-run-status-check';
import type { EnsureStep } from './types';

export const SOURCE_IMPORT_RUN_STATUS_CHECK_GUIDANCE =
  'statuses outside SOURCE_IMPORT_RUN_STATUSES exist; add a pre-schema cleanup before changing the set';

/** SQLSTATE check_violation: an existing row breaks the constraint being added. */
const CHECK_VIOLATION = '23514';

/**
 * Owns `source_import_runs_status_check`, which holds
 * `source_import_runs.status` to `SOURCE_IMPORT_RUN_STATUSES`. Prisma cannot
 * declare the constraint and `db push` keeps it, so this step creates it where
 * it is missing and re-creates it after the status set changes.
 *
 * v0.1.31:012 deletes the unknown-status runs of the 0.1.31 cutover before the
 * constraint first appears. A later change to the set needs its own pre-schema
 * cleanup: while a row holds a removed status, PostgreSQL refuses the new
 * constraint, this step fails with that guidance, and its transaction keeps
 * the previous constraint.
 */
export const sourceImportRunStatusCheckStep: EnsureStep = {
  id: 'ensure:source_import_run_status_check',
  name: 'Hold source_import_runs.status to SOURCE_IMPORT_RUN_STATUSES',
  async run(tx) {
    let outcome: SourceImportRunStatusCheckOutcome;
    try {
      outcome = await ensureSourceImportRunStatusCheck(tx);
    } catch (error) {
      if (!isCheckViolation(error)) throw error;
      throw new SourceImportRunStatusCheckError(error);
    }
    return {
      changedRows: outcome === 'unchanged' ? 0 : 1,
      details: { constraint: SOURCE_IMPORT_RUN_STATUS_CHECK, outcome },
    };
  },
};

export class SourceImportRunStatusCheckError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      `${SOURCE_IMPORT_RUN_STATUS_CHECK} was not applied: ${SOURCE_IMPORT_RUN_STATUS_CHECK_GUIDANCE}. `
        + `PostgreSQL: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'SourceImportRunStatusCheckError';
    this.cause = cause;
  }
}

/**
 * Prisma reports a failed raw statement as P2010 (P2039 for some driver
 * errors) and keeps the driver's PostgreSQL error, with its SQLSTATE, under
 * `meta.driverAdapterError`.
 */
function isCheckViolation(error: unknown): boolean {
  const meta = (error as {
    meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } };
  } | null)?.meta;
  return meta?.driverAdapterError?.cause?.originalCode === CHECK_VIOLATION;
}
