import {
  isSourceImportStatus,
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
  type SourceImportStatus,
} from '@kiditem/shared/source-import';

export type SourceImportRunState = 'RUNNING' | 'COMPLETE' | 'FAILED';

export type SourceImportRunStateFact = Readonly<{
  status: string;
  expiresAt: Date | null;
}>;

/**
 * PostgreSQL rejects any other value (source_import_runs_status_check), but
 * Prisma still reads the column as a string, so an unexpected one fails closed.
 */
export function sourceImportRunDbState(status: string): SourceImportStatus {
  return isSourceImportStatus(status) ? status : SOURCE_IMPORT_RUN_FAILED_STATUS;
}

export function effectiveSourceImportRunState(
  attempt: SourceImportRunStateFact,
  now: Date,
): SourceImportRunState {
  const persisted = sourceImportRunDbState(attempt.status);
  if (persisted === SOURCE_IMPORT_RUN_COMPLETED_STATUS) return 'COMPLETE';
  if (
    persisted === SOURCE_IMPORT_RUN_RUNNING_STATUS &&
    (!attempt.expiresAt || attempt.expiresAt > now)
  ) {
    return 'RUNNING';
  }
  return 'FAILED';
}
