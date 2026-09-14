import type { Prisma } from "@prisma/client";
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from "@kiditem/shared/source-import";
import type { DataMigration, MigrationResult } from "../types";

export async function normalizeSourceImportRunCompletedStatus(
  tx: Prisma.TransactionClient,
): Promise<MigrationResult> {
  const updated = await tx.sourceImportRun.updateMany({
    where: { status: "complete" },
    data: { status: SOURCE_IMPORT_RUN_COMPLETED_STATUS },
  });
  return {
    affectedRows: updated.count,
    details: { normalizedSourceImportRuns: updated.count },
  };
}

export const normalizeSourceImportRunCompletedStatusMigration: DataMigration = {
  id: "v0.1.31:007_normalize_source_import_run_completed_status",
  releaseVersion: "0.1.31",
  name: "Normalize SourceImportRun completed status",
  phase: "pre-schema",
  run: normalizeSourceImportRunCompletedStatus,
};
