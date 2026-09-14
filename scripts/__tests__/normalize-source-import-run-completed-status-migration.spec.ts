import { describe, expect, it, vi } from "vitest";
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from "@kiditem/shared/source-import";
import { normalizeSourceImportRunCompletedStatus } from "../data-migrations/v0.1.31/007_normalize_source_import_run_completed_status";

describe("normalizeSourceImportRunCompletedStatus", () => {
  it("rewrites only the legacy complete spelling and reports the updated rows", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 4 });

    await expect(
      normalizeSourceImportRunCompletedStatus({
        sourceImportRun: { updateMany },
      } as never),
    ).resolves.toEqual({
      affectedRows: 4,
      details: { normalizedSourceImportRuns: 4 },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { status: "complete" },
      data: { status: SOURCE_IMPORT_RUN_COMPLETED_STATUS },
    });
  });
});
