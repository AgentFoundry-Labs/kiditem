import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dataMigrations } from "../data-migrations";

const MIGRATION_ID = "v0.1.30:005_reset_sourcing_display_state";

describe("sourcing display-state reset migration", () => {
  it("resets only derived projections while preserving canonical history and provenance", () => {
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
    expect(source).toContain("sourcingRecommendationRun.deleteMany");
    expect(source).toContain("sourcingValidationEpisode.deleteMany");
    expect(source).toContain("sourcingReviewBatch.deleteMany");
    expect(source).toContain("retainedCanonicalInputs");
    expect(source).toContain('"sourcing_workspace_snapshots"');
    expect(source).not.toContain("sourcingWorkspaceSnapshot.deleteMany");
    expect(source).not.toContain("trendSeedKeyword.deleteMany");
    expect(source).not.toContain("naverKeywordDailySnapshot.deleteMany");
    expect(source).not.toContain("naverPopularKeywordDailySnapshot.deleteMany");
    expect(source).not.toContain("sourcing1688HotProductDailySnapshot.deleteMany");
    expect(source).not.toContain("shortsTrendDailySnapshot.deleteMany");
    expect(source).not.toContain("liveCommerceBroadcastDailySnapshot.deleteMany");
    expect(source).not.toContain("liveCommerceProductDailySnapshot.deleteMany");
    expect(source).not.toContain("tiktokCreativeTrendDailySnapshot.deleteMany");
    expect(source).not.toContain("sourcing1688OfferKeywordObservation.deleteMany");
    expect(source).not.toContain("sourcingEvidenceIngestionRun.deleteMany");
    expect(source).not.toContain("sourcingEvidenceObservation.deleteMany");
    expect(source).toContain("sourcing_evidence_observations");
    expect(source).toContain("retainedProvenance");
    expect(source).not.toContain("sourcingCandidate.deleteMany");
    expect(source).not.toContain("supplierOfferSkuSnapshot.deleteMany");
    expect(source).toContain("removedLegacyStorage");
    expect(source).toContain('"sourcing_1688_hot_product_daily_snapshots"');
    expect(source).toMatch(/reviewed Prisma\s+\* schema application/);

    const retainedCanonicalInputs = source.match(
      /retainedCanonicalInputs:\s*\[([\s\S]*?)\]/,
    )?.[1];
    expect(retainedCanonicalInputs).toBeDefined();
    expect(retainedCanonicalInputs).not.toContain(
      "sourcing_1688_hot_product_daily_snapshots",
    );
  });

  it("keeps the active evidence-run index in PostgreSQL canonical form", () => {
    const schema = readFileSync(
      resolve(import.meta.dirname, "../../prisma/models/sourcing.prisma"),
      "utf8",
    );

    expect(schema).toContain(
      `where: raw("((status)::text = 'RUNNING'::text)")`,
    );
  });
});
