import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_MIGRATION_IDS,
  dataMigrations,
  isLegacyDetailEditorHref,
  isProductContentRouteHrefRewriteNeeded,
  rewriteLegacyDetailEditorHref,
  rewriteProductContentRouteHref,
  retiredDataMigrations,
} from "../data-migrations/index";
import {
  APPLY_DATA_MIGRATIONS_CONFIRMATION,
  assertApplyDataMigrationsConfirmation,
  assertMutatingTarget,
  dataMigrationTransactionTimeoutMs,
  dataMigrationRegistryStatus,
  DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
  isDefinitelyProductionDatabaseUrl,
  normalizeReleaseVersion,
  selectDataMigrationsForPhase,
  selectDataMigrationsForRelease,
} from "../run-data-migrations";

const repoRoot = join(__dirname, "..", "..");

const SCHEMA_DROP_CLEANUP = {
  id: "v0.1.31:013_remove_retired_account_kpi_and_ad_tier_rows",
  path: "scripts/data-migrations/v0.1.31/013_remove_retired_account_kpi_and_ad_tier_rows.ts",
};

describe("data migration registry", () => {
  it("registers the release migration chain in order", () => {
    expect(DATA_MIGRATION_IDS).toEqual([
      "v0.1.4:001_record_agent_os_operator_backbone_release",
      "v0.1.6:001_record_rocket_read_model_release",
      "v0.1.7:001_record_sellpia_rocket_inventory_sync_release",
      "v0.1.18:001_migrate_representative_keyword_overrides",
      "v0.1.24:001_dedupe_detail_page_artifacts",
      "v0.1.25:003_repair_ad_campaign_target_conversions",
      "v0.1.25:004_rekey_ad_campaign_product_targets",
      "v0.1.30:003_move_variant_recipes_to_channel_options",
      "v0.1.30:005_reset_sourcing_display_state",
      "v0.1.31:001_reset_absolute_product_abc",
      "v0.1.31:003_prepare_operation_automation_cutover",
      "v0.1.31:004_remove_retired_capability_operation_refs",
      "v0.1.31:005_remove_retired_operation_alerts",
      "v0.1.31:007_normalize_source_import_run_completed_status",
      "v0.1.31:008_backfill_alert_read_at_from_is_read",
      "v0.1.31:009_backfill_capability_approval_decision",
      "v0.1.31:010_backfill_thumbnail_tracking_inconclusive_mark",
      "v0.1.31:011_backfill_ad_action_execution_tasks",
      "v0.1.31:012_constrain_source_import_run_status",
      "v0.1.31:013_remove_retired_account_kpi_and_ad_tier_rows",
      "v0.1.31:014_backfill_channel_listing_image_from_discovery",
      "v0.1.31:002_initialize_absolute_product_abc_formula",
      "v0.1.31:006_backfill_coupang_direct_transport_receipts",
      "v0.1.31:016_activate_ad_free_product_abc_formula",
    ]);
    expect(
      DATA_MIGRATION_IDS.filter((id) =>
        /backfill|normalize|rewrite|repoint|verify/.test(id),
      ),
    ).toEqual([
      "v0.1.31:007_normalize_source_import_run_completed_status",
      "v0.1.31:008_backfill_alert_read_at_from_is_read",
      "v0.1.31:009_backfill_capability_approval_decision",
      "v0.1.31:010_backfill_thumbnail_tracking_inconclusive_mark",
      "v0.1.31:011_backfill_ad_action_execution_tasks",
      "v0.1.31:014_backfill_channel_listing_image_from_discovery",
      "v0.1.31:006_backfill_coupang_direct_transport_receipts",
    ]);
  });

  it("registers the current absolute ABC and schema-drop migrations without retired backfills", () => {
    const migrationIds = dataMigrations.map((migration) => migration.id);

    expect(migrationIds).toContain("v0.1.31:001_reset_absolute_product_abc");
    expect(migrationIds).toContain(
      "v0.1.31:002_initialize_absolute_product_abc_formula",
    );
    expect(migrationIds).toContain(
      "v0.1.31:003_prepare_operation_automation_cutover",
    );
    expect(migrationIds).toContain(SCHEMA_DROP_CLEANUP.id);
    expect(migrationIds).not.toContain(
      "v0.1.26:001_initialize_master_product_abc_policy",
    );
    // The KID-90 schema drop removes the Prisma fields these read or write.
    for (const retiredId of [
      "v0.1.19:001_sellpia_inventory_freshness",
      "v0.1.25:001_repair_ad_campaign_daily_business_dates",
      "v0.1.25:002_repair_coupang_ads_daily_conversions",
      "v0.1.25:005_remove_ambiguous_ad_campaign_account_kpis",
    ]) {
      expect(migrationIds).not.toContain(retiredId);
    }
    // Release 0.1.30 has not reached main, so its migrations that cannot run
    // against the dropped schema leave the registry without inactive lineage,
    // as 001 and 002 did before them.
    for (const unregisteredId of [
      "v0.1.30:001_reset_legacy_product_abc_grades",
      "v0.1.30:002_backfill_profitability_source_freshness",
      "v0.1.30:004_canonical_master_inventory_identity",
      "v0.1.30:006_delete_legacy_channel_derived_master_products",
    ]) {
      expect(migrationIds).not.toContain(unregisteredId);
    }
    expect(migrationIds).toContain("v0.1.30:005_reset_sourcing_display_state");
  });

  it("reports immutable lineage for the inactive legacy ABC migration without executing it", () => {
    const sourcePath =
      "scripts/data-migrations/v0.1.26/001_initialize_master_product_abc_policy.ts";
    const retired = retiredDataMigrations.find(
      ({ id }) => id === "v0.1.26:001_initialize_master_product_abc_policy",
    );

    expect(retired).toEqual({
      id: "v0.1.26:001_initialize_master_product_abc_policy",
      releaseVersion: "0.1.26",
      name: "Initialize automatic MasterProduct ABC policies",
      sourcePath,
      sourceSha256:
        "72683894592b789de0b996b67e3e8de9ac197865dc8739c75e435de24db2b921",
      baselineCommit: "9415a6e01f02db28531fc00b32f933ac16776211",
      replacementMigrations: [
        {
          id: "v0.1.31:001_reset_absolute_product_abc",
          path: "scripts/data-migrations/v0.1.31/001_reset_absolute_product_abc.ts",
        },
        {
          id: "v0.1.31:002_initialize_absolute_product_abc_formula",
          path: "scripts/data-migrations/v0.1.31/002_initialize_absolute_product_abc_formula.ts",
        },
      ],
    });
    expect(
      createHash("sha256")
        .update(readFileSync(join(repoRoot, sourcePath)))
        .digest("hex"),
    ).toBe(retired?.sourceSha256);
    expect(dataMigrations.map(({ id }) => id)).not.toContain(retired?.id);
    expect(dataMigrationRegistryStatus().retiredMigrations).toContainEqual({
      ...retired,
      execution: "inactive",
    });
  });

  it("reports immutable lineage for the promoted migrations the KID-90 schema drop retires", () => {
    const expected = [
      {
        id: "v0.1.19:001_sellpia_inventory_freshness",
        releaseVersion: "0.1.19",
        name: "Backfill Sellpia inventory freshness and verification provenance",
        sourcePath:
          "scripts/data-migrations/v0.1.19/001_sellpia_inventory_freshness.ts",
        sourceSha256:
          "4a49fb74d9d9f169eea35b22bad57cb6e406c1f5adfcda0517a0dc4a2f246a8b",
        baselineCommit: "adc84d84bb43da707901f2957a0fb9aefaa69fa1",
        replacementMigrations: [SCHEMA_DROP_CLEANUP],
      },
      {
        id: "v0.1.25:001_repair_ad_campaign_daily_business_dates",
        releaseVersion: "0.1.25",
        name: "Repair Coupang ad campaign daily business dates from raw evidence",
        sourcePath:
          "scripts/data-migrations/v0.1.25/001_repair_ad_campaign_daily_business_dates.ts",
        sourceSha256:
          "35b91d290d247da27d90e5963d32ceca37df3f6a27ab14cdee9ce46a755aa046",
        baselineCommit: "9d213b49f06d64a0fa1af20feae73575ad0cad3a",
        replacementMigrations: [SCHEMA_DROP_CLEANUP],
      },
      {
        id: "v0.1.25:002_repair_coupang_ads_daily_conversions",
        releaseVersion: "0.1.25",
        name: "Repair Coupang ads daily conversions from exact sales evidence",
        sourcePath:
          "scripts/data-migrations/v0.1.25/002_repair_coupang_ads_daily_conversions.ts",
        sourceSha256:
          "175bd565f5ac59137ae1ceae99b2fec5f49c6851a7d83c766d7dba51786d5217",
        baselineCommit: "9d213b49f06d64a0fa1af20feae73575ad0cad3a",
        replacementMigrations: [SCHEMA_DROP_CLEANUP],
      },
      {
        id: "v0.1.25:005_remove_ambiguous_ad_campaign_account_kpis",
        releaseVersion: "0.1.25",
        name: "Remove ambiguous per-campaign account and listing projections",
        sourcePath:
          "scripts/data-migrations/v0.1.25/005_remove_ambiguous_ad_campaign_account_kpis.ts",
        sourceSha256:
          "eedcc2914a3d6602f1b13c2dd001b7dcd1504eee59abe8e00dd5e202147689b2",
        baselineCommit: "9d213b49f06d64a0fa1af20feae73575ad0cad3a",
        replacementMigrations: [SCHEMA_DROP_CLEANUP],
      },
    ];

    for (const entry of expected) {
      const retired = retiredDataMigrations.find(({ id }) => id === entry.id);
      expect(retired).toEqual(entry);
      expect(
        createHash("sha256")
          .update(readFileSync(join(repoRoot, entry.sourcePath)))
          .digest("hex"),
      ).toBe(entry.sourceSha256);
      expect(DATA_MIGRATION_IDS).not.toContain(entry.id);
      expect(dataMigrationRegistryStatus().retiredMigrations).toContainEqual({
        ...entry,
        execution: "inactive",
      });
    }
    expect(DATA_MIGRATION_IDS).toContain(SCHEMA_DROP_CLEANUP.id);
  });

  it("keeps historical release 0.1.22 migration-free and never registers ahead of the root VERSION", () => {
    const releaseVersions = dataMigrations.map(
      (migration) => migration.releaseVersion,
    );
    const toParts = (version: string) => version.split(".").map(Number);
    const compare = (a: string, b: string) => {
      const left = toParts(a);
      const right = toParts(b);
      for (
        let index = 0;
        index < Math.max(left.length, right.length);
        index++
      ) {
        const diff = (left[index] ?? 0) - (right[index] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    };

    expect(releaseVersions).toContain("0.1.18");
    // 0.1.19's only migration is retired, so its lineage stays inactive.
    expect(releaseVersions).not.toContain("0.1.19");
    expect(retiredDataMigrations.map(({ releaseVersion }) => releaseVersion))
      .toContain("0.1.19");
    expect(releaseVersions).not.toContain("0.1.21");
    expect(releaseVersions).not.toContain("0.1.22");

    // Migrations for the open release train carry the root VERSION in their
    // path, id, and releaseVersion, so the newest registered release may equal
    // the root version but must never run ahead of it.
    const rootVersion = normalizeReleaseVersion(
      readFileSync(join(repoRoot, "VERSION"), "utf8"),
    );
    const latestMigrationRelease = [...releaseVersions].sort(compare).at(-1);
    expect(latestMigrationRelease).toBeDefined();
    expect(
      compare(latestMigrationRelease as string, rootVersion),
    ).toBeLessThanOrEqual(0);

    for (const migration of dataMigrations) {
      expect(migration.id.startsWith(`v${migration.releaseVersion}:`)).toBe(
        true,
      );
    }
  });

  it("runs artifact deduplication before schema constraints and other migrations after", () => {
    expect(
      selectDataMigrationsForPhase(dataMigrations, "pre-schema").map(
        ({ id }) => id,
      ),
    ).toEqual([
      "v0.1.24:001_dedupe_detail_page_artifacts",
      "v0.1.30:003_move_variant_recipes_to_channel_options",
      "v0.1.31:001_reset_absolute_product_abc",
      "v0.1.31:003_prepare_operation_automation_cutover",
      "v0.1.31:004_remove_retired_capability_operation_refs",
      "v0.1.31:005_remove_retired_operation_alerts",
      "v0.1.31:007_normalize_source_import_run_completed_status",
      "v0.1.31:008_backfill_alert_read_at_from_is_read",
      "v0.1.31:009_backfill_capability_approval_decision",
      "v0.1.31:010_backfill_thumbnail_tracking_inconclusive_mark",
      "v0.1.31:011_backfill_ad_action_execution_tasks",
      "v0.1.31:012_constrain_source_import_run_status",
      "v0.1.31:013_remove_retired_account_kpi_and_ad_tier_rows",
    ]);
    expect(selectDataMigrationsForPhase(dataMigrations, "post-schema")).toEqual(
      dataMigrations.filter((migration) => migration.phase !== "pre-schema"),
    );
  });

  it("filters phased office migrations by exact release version", () => {
    const preSchema = selectDataMigrationsForRelease(
      selectDataMigrationsForPhase(dataMigrations, "pre-schema"),
      "0.1.30",
    ).map(({ id }) => id);
    expect(preSchema).toEqual([
      "v0.1.30:003_move_variant_recipes_to_channel_options",
    ]);

    const postSchema = selectDataMigrationsForRelease(
      selectDataMigrationsForPhase(dataMigrations, "post-schema"),
      "0.1.30",
    ).map(({ id }) => id);
    expect(postSchema).toEqual([
      "v0.1.30:005_reset_sourcing_display_state",
    ]);

    const absolutePreSchema = selectDataMigrationsForRelease(
      selectDataMigrationsForPhase(dataMigrations, "pre-schema"),
      "0.1.31",
    ).map(({ id }) => id);
    expect(absolutePreSchema).toEqual([
      "v0.1.31:001_reset_absolute_product_abc",
      "v0.1.31:003_prepare_operation_automation_cutover",
      "v0.1.31:004_remove_retired_capability_operation_refs",
      "v0.1.31:005_remove_retired_operation_alerts",
      "v0.1.31:007_normalize_source_import_run_completed_status",
      "v0.1.31:008_backfill_alert_read_at_from_is_read",
      "v0.1.31:009_backfill_capability_approval_decision",
      "v0.1.31:010_backfill_thumbnail_tracking_inconclusive_mark",
      "v0.1.31:011_backfill_ad_action_execution_tasks",
      "v0.1.31:012_constrain_source_import_run_status",
      "v0.1.31:013_remove_retired_account_kpi_and_ad_tier_rows",
    ]);

    const absolutePostSchema = selectDataMigrationsForRelease(
      selectDataMigrationsForPhase(dataMigrations, "post-schema"),
      "0.1.31",
    ).map(({ id }) => id);
    expect(absolutePostSchema).toEqual([
      "v0.1.31:014_backfill_channel_listing_image_from_discovery",
      "v0.1.31:002_initialize_absolute_product_abc_formula",
      "v0.1.31:006_backfill_coupang_direct_transport_receipts",
      "v0.1.31:016_activate_ad_free_product_abc_formula",
    ]);
  });

  it("rejects malformed root versions", () => {
    expect(normalizeReleaseVersion("0.1.8\n")).toBe("0.1.8");
    expect(() => normalizeReleaseVersion("latest")).toThrow(
      /Invalid root VERSION/,
    );
  });
});

describe("persisted route rewrite helpers", () => {
  it("rewrites retired detail-editor hrefs", () => {
    expect(
      rewriteLegacyDetailEditorHref(
        "/sourcing/product-123/editor?agentId=generation-456",
      ),
    ).toBe("/product-content/product-123/editor?generationId=generation-456");
    expect(isLegacyDetailEditorHref("/sourcing/product-123/editor")).toBe(true);
    expect(isLegacyDetailEditorHref("/products/abc")).toBe(false);
  });

  it("rewrites retired product-content routes and leaves canonical routes unchanged", () => {
    expect(
      rewriteProductContentRouteHref(
        "/product-content/candidate-123/editor?generationId=generation-456",
      ),
    ).toBe(
      "/product-pipeline/collected-products/candidate-123/editor?generationId=generation-456",
    );
    expect(
      isProductContentRouteHrefRewriteNeeded(
        "/product-content/candidate-123/editor",
      ),
    ).toBe(true);
    expect(rewriteProductContentRouteHref("/products/abc")).toBe(
      "/products/abc",
    );
  });
});

describe("data migration CLI guardrails", () => {
  it("requires explicit apply confirmation", () => {
    expect(() => assertApplyDataMigrationsConfirmation(undefined)).toThrow(
      APPLY_DATA_MIGRATIONS_CONFIRMATION,
    );
    expect(() =>
      assertApplyDataMigrationsConfirmation(APPLY_DATA_MIGRATIONS_CONFIRMATION),
    ).not.toThrow();
  });

  it("keeps local and Office targets away from production-looking URLs", () => {
    const productionUrl = "postgresql://u:p@prod-db.example.com/app";
    expect(isDefinitelyProductionDatabaseUrl(productionUrl)).toBe(true);
    expect(
      isDefinitelyProductionDatabaseUrl(
        "postgresql://u:p@staging-db.example.com/app",
      ),
    ).toBe(false);
    expect(() => assertMutatingTarget("local", productionUrl)).toThrow(
      /production/i,
    );
    expect(() => assertMutatingTarget("office", productionUrl)).toThrow(
      /production/i,
    );
  });

  it("rejects unknown targets and invalid transaction timeouts", () => {
    expect(() =>
      assertMutatingTarget("development", "postgresql://localhost/app"),
    ).toThrow(/local or office/i);
    expect(dataMigrationTransactionTimeoutMs(undefined)).toBe(
      DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
    );
    expect(dataMigrationTransactionTimeoutMs("45000")).toBe(45000);
    expect(() => dataMigrationTransactionTimeoutMs("0")).toThrow(
      /positive integer/,
    );
  });
});
