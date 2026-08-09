import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dataMigrations } from "../data-migrations";

const MIGRATION_ID = "v0.1.30:005_reset_sourcing_display_state";

describe("sourcing display-state reset migration", () => {
  it("resets only screen projections after the normalized schema is present", () => {
    const migration = dataMigrations.find((item) => item.id === MIGRATION_ID);
    expect(migration).toMatchObject({
      id: MIGRATION_ID,
      releaseVersion: "0.1.30",
      phase: "post-schema",
    });

    const source = readFileSync(
      resolve(
        import.meta.dirname,
        "../data-migrations/v0.1.30/005_reset_sourcing_display_state.ts",
      ),
      "utf8",
    );
    expect(source).toContain("sourcingWorkspaceSnapshot.deleteMany");
    expect(source).toContain("sourcingRecommendationRun.deleteMany");
    expect(source).toContain("sourcing_evidence_observations");
    expect(source).toContain("retainedProvenance");
    expect(source).not.toContain("sourcingCandidate.deleteMany");
    expect(source).not.toContain("supplierOfferSkuSnapshot.deleteMany");
  });
});
