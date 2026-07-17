import { describe, expect, it, vi } from "vitest";
import { sellpiaInventoryFreshnessMigration } from "../data-migrations/v0.1.19/001_sellpia_inventory_freshness";

const importedAt = new Date("2026-07-15T01:02:03.000Z");

function completedRun(
  overrides: Partial<{
    id: string;
    organizationId: string;
    importedAt: Date;
    lastVerifiedAt: Date | null;
    verificationCount: number;
    lastTrigger: string | null;
  }> = {},
) {
  return {
    id: "run-1",
    organizationId: "org-1",
    importedAt,
    lastVerifiedAt: null,
    verificationCount: 0,
    lastTrigger: null,
    ...overrides,
  };
}

function migrationTx(
  options: {
    runs?: ReturnType<typeof completedRun>[];
    organizations?: Array<{ id: string }>;
  } = {},
) {
  return {
    sourceImportRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue(options.runs ?? []),
    },
    organization: {
      findMany: vi
        .fn()
        .mockResolvedValue(options.organizations ?? [{ id: "org-1" }]),
    },
    sellpiaInventoryState: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("Sellpia inventory freshness data migration", () => {
  it("uses the durable 0.1.19 migration identity", () => {
    expect(sellpiaInventoryFreshnessMigration).toMatchObject({
      id: "v0.1.19:001_sellpia_inventory_freshness",
      releaseVersion: "0.1.19",
    });
  });

  it("initializes an organization without a completed run as requested generation one", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      sourceImportRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      organization: {
        findMany: vi.fn().mockResolvedValue([{ id: "org-1" }]),
      },
      sellpiaInventoryState: { createMany },
    };

    await sellpiaInventoryFreshnessMigration.run(tx as never);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: "org-1",
          requestedGeneration: 1n,
          verifiedGeneration: 0n,
          refreshReason: "initial_snapshot",
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("backfills missing verification provenance and binds the latest completed run", async () => {
    const olderImportedAt = new Date("2026-07-14T01:02:03.000Z");
    const tx = migrationTx({
      runs: [
        completedRun(),
        completedRun({
          id: "run-older",
          importedAt: olderImportedAt,
        }),
      ],
    });

    await sellpiaInventoryFreshnessMigration.run(tx as never);

    expect(tx.sourceImportRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        organizationId: "org-1",
        sourceType: "sellpia_inventory",
        status: "completed",
      },
      data: {
        lastVerifiedAt: importedAt,
        verificationCount: 1,
        lastTrigger: "legacy_manual_import",
      },
    });
    expect(tx.sellpiaInventoryState.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: "org-1",
          sourceOrigin: "https://kiditem.sellpia.com",
          sourceAccountKey: "kiditem",
          lastVerifiedAt: importedAt,
          lastCompletedImportRunId: "run-1",
          requestedGeneration: 1n,
          verifiedGeneration: 1n,
          refreshReason: "legacy_manual_import",
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("preserves verification fields that are already populated", async () => {
    const lastVerifiedAt = new Date("2026-07-15T02:03:04.000Z");
    const tx = migrationTx({
      runs: [
        completedRun({
          lastVerifiedAt,
          verificationCount: 3,
          lastTrigger: "manual_request",
        }),
      ],
    });

    await sellpiaInventoryFreshnessMigration.run(tx as never);

    expect(tx.sourceImportRun.updateMany).not.toHaveBeenCalled();
    expect(tx.sellpiaInventoryState.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ lastVerifiedAt })],
      skipDuplicates: true,
    });
  });

  it("is idempotent when all organization state rows already exist", async () => {
    const tx = migrationTx({
      organizations: [{ id: "org-1" }, { id: "org-2" }],
    });
    tx.sellpiaInventoryState.createMany.mockResolvedValue({ count: 0 });

    await expect(
      sellpiaInventoryFreshnessMigration.run(tx as never),
    ).resolves.toMatchObject({ affectedRows: 0 });
    expect(tx.sellpiaInventoryState.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ organizationId: "org-1" }),
        expect.objectContaining({ organizationId: "org-2" }),
      ]),
      skipDuplicates: true,
    });
  });
});
