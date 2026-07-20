import type { DataMigration } from "../types";

const SELLPIA_SOURCE_ORIGIN = "https://kiditem.sellpia.com";
const SELLPIA_SOURCE_ACCOUNT_KEY = "kiditem";

export const sellpiaInventoryFreshnessMigration: DataMigration = {
  id: "v0.1.19:001_sellpia_inventory_freshness",
  releaseVersion: "0.1.19",
  name: "Backfill Sellpia inventory freshness and verification provenance",
  async run(tx) {
    const completedRuns = await tx.sourceImportRun.findMany({
      where: {
        sourceType: "sellpia_inventory",
        status: "completed",
        importedAt: { not: null },
      },
      orderBy: [
        { organizationId: "asc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        organizationId: true,
        importedAt: true,
        lastVerifiedAt: true,
        verificationCount: true,
        lastTrigger: true,
      },
    });

    let updatedRunCount = 0;
    for (const run of completedRuns) {
      if (run.importedAt === null) continue;
      const data: {
        lastVerifiedAt?: Date;
        verificationCount?: number;
        lastTrigger?: string;
      } = {};
      if (run.lastVerifiedAt === null) data.lastVerifiedAt = run.importedAt;
      if (run.verificationCount === 0) data.verificationCount = 1;
      if (run.lastTrigger === null) data.lastTrigger = "legacy_manual_import";
      if (Object.keys(data).length === 0) continue;

      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: run.id,
          organizationId: run.organizationId,
          sourceType: "sellpia_inventory",
          status: "completed",
        },
        data,
      });
      updatedRunCount += updated.count;
    }

    const latestRunByOrganization = new Map<
      string,
      (typeof completedRuns)[number]
    >();
    for (const run of completedRuns) {
      if (run.importedAt === null) continue;
      if (!latestRunByOrganization.has(run.organizationId)) {
        latestRunByOrganization.set(run.organizationId, run);
      }
    }

    const organizations = await tx.organization.findMany({
      select: { id: true },
    });
    const refreshRequestedAt = new Date();
    const stateRows = organizations.map(({ id: organizationId }) => {
      const latestRun = latestRunByOrganization.get(organizationId);
      if (latestRun?.importedAt == null) {
        return {
          organizationId,
          sourceOrigin: SELLPIA_SOURCE_ORIGIN,
          sourceAccountKey: SELLPIA_SOURCE_ACCOUNT_KEY,
          lastVerifiedAt: null,
          lastCompletedImportRunId: null,
          refreshRequestedAt,
          refreshReason: "initial_snapshot",
          requestedGeneration: 1n,
          verifiedGeneration: 0n,
          lastAttemptAt: null,
          lastAttemptStatus: null,
        };
      }
      return {
        organizationId,
        sourceOrigin: SELLPIA_SOURCE_ORIGIN,
        sourceAccountKey: SELLPIA_SOURCE_ACCOUNT_KEY,
        lastVerifiedAt: latestRun.lastVerifiedAt ?? latestRun.importedAt,
        lastCompletedImportRunId: latestRun.id,
        refreshRequestedAt: null,
        refreshReason: "legacy_manual_import",
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastAttemptAt: latestRun.importedAt,
        lastAttemptStatus: "completed",
      };
    });
    const created =
      stateRows.length > 0
        ? await tx.sellpiaInventoryState.createMany({
            data: stateRows,
            skipDuplicates: true,
          })
        : { count: 0 };

    return {
      affectedRows: updatedRunCount + created.count,
      details: {
        completedRunCount: completedRuns.length,
        updatedRunCount,
        organizationCount: organizations.length,
        createdStateCount: created.count,
      },
    };
  },
};
