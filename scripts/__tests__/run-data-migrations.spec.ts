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
} from "../data-migrations/index";
import {
  APPLY_DATA_MIGRATIONS_CONFIRMATION,
  assertApplyDataMigrationsConfirmation,
  assertMutatingTarget,
  dataMigrationTransactionTimeoutMs,
  DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
  isDefinitelyProductionDatabaseUrl,
  normalizeReleaseVersion,
  selectDataMigrationsForPhase,
} from "../run-data-migrations";

const repoRoot = join(__dirname, "..", "..");

describe("data migration registry", () => {
  it("registers baseline metadata, freshness, and inventory commitment backfills", () => {
    expect(DATA_MIGRATION_IDS).toEqual([
      "v0.1.4:001_record_agent_os_operator_backbone_release",
      "v0.1.6:001_record_rocket_read_model_release",
      "v0.1.7:001_record_sellpia_rocket_inventory_sync_release",
      "v0.1.18:001_migrate_representative_keyword_overrides",
      "v0.1.19:001_sellpia_inventory_freshness",
      "v0.1.21:001_backfill_inventory_commitments",
      "v0.1.21:001_repair_ad_campaign_daily_business_dates",
      "v0.1.21:002_repair_coupang_ads_daily_conversions",
      "v0.1.21:003_repair_ad_campaign_target_conversions",
      "v0.1.21:004_rekey_ad_campaign_product_targets",
      "v0.1.21:005_remove_ambiguous_ad_campaign_account_kpis",
    ]);
    expect(
      DATA_MIGRATION_IDS.filter((id) =>
        /backfill|normalize|rewrite|repoint|verify/.test(id),
      ),
    ).toEqual(["v0.1.21:001_backfill_inventory_commitments"]);
  });

  it("registers the 0.1.21 ad campaign repairs and inventory commitment backfill", () => {
    const migrationIds = dataMigrations.map((migration) => migration.id);

    expect(migrationIds).toContain(
      "v0.1.21:001_repair_ad_campaign_daily_business_dates",
    );
    expect(migrationIds).toContain(
      "v0.1.21:005_remove_ambiguous_ad_campaign_account_kpis",
    );
    expect(migrationIds).toContain("v0.1.21:001_backfill_inventory_commitments");
  });

  it("keeps historical release 0.1.22 migration-free and stops registering at 0.1.21", () => {
    const releaseVersions = dataMigrations.map(
      (migration) => migration.releaseVersion,
    );
    const toParts = (version: string) => version.split(".").map(Number);
    const compare = (a: string, b: string) => {
      const left = toParts(a);
      const right = toParts(b);
      for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const diff = (left[index] ?? 0) - (right[index] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    };

    expect(releaseVersions).toContain("0.1.19");
    expect(releaseVersions).toContain("0.1.21");
    expect(releaseVersions).not.toContain("0.1.22");

    const latestMigrationRelease = [...releaseVersions].sort(compare).at(-1);
    expect(latestMigrationRelease).toBe("0.1.21");

    const rootVersion = normalizeReleaseVersion(
      readFileSync(join(repoRoot, "VERSION"), "utf8"),
    );
    expect(compare(rootVersion, "0.1.21")).toBeGreaterThanOrEqual(0);
    if (rootVersion !== "0.1.21") {
      expect(releaseVersions).not.toContain(rootVersion);
    }

    for (const migration of dataMigrations) {
      expect(migration.id.startsWith(`v${migration.releaseVersion}:`)).toBe(
        true,
      );
    }
  });

  it("has no preservation migration in an automatic schema phase", () => {
    expect(selectDataMigrationsForPhase(dataMigrations, "pre-schema")).toEqual(
      [],
    );
    expect(selectDataMigrationsForPhase(dataMigrations, "post-schema")).toEqual(
      dataMigrations,
    );
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

  it("keeps local and staging targets away from production-looking URLs", () => {
    const productionUrl = "postgresql://u:p@prod-db.example.com/app";
    expect(isDefinitelyProductionDatabaseUrl(productionUrl)).toBe(true);
    expect(
      isDefinitelyProductionDatabaseUrl(
        "postgresql://u:p@staging-db.example.com/app",
      ),
    ).toBe(false);
    expect(() => assertMutatingTarget("local", productionUrl, {})).toThrow(
      /production/i,
    );
    expect(() => assertMutatingTarget("staging", productionUrl, {})).toThrow(
      /production/i,
    );
  });

  it("allows production only in GitHub Actions with independent confirmation", () => {
    const productionUrl = "postgresql://u:p@prod-db.example.com/app";
    expect(() => assertMutatingTarget("production", productionUrl, {})).toThrow(
      /GitHub Actions/i,
    );
    expect(() =>
      assertMutatingTarget("production", productionUrl, {
        GITHUB_ACTIONS: "true",
      }),
    ).toThrow(/DATA_MIGRATION_PRODUCTION_CONFIRM/i);
    expect(() =>
      assertMutatingTarget("production", productionUrl, {
        GITHUB_ACTIONS: "true",
        DATA_MIGRATION_PRODUCTION_CONFIRM: "DEPLOY_PRODUCTION",
      }),
    ).not.toThrow();
  });

  it("rejects unknown targets and invalid transaction timeouts", () => {
    expect(() =>
      assertMutatingTarget("development", "postgresql://localhost/app", {}),
    ).toThrow(/local, staging, or production/i);
    expect(dataMigrationTransactionTimeoutMs(undefined)).toBe(
      DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
    );
    expect(dataMigrationTransactionTimeoutMs("45000")).toBe(45000);
    expect(() => dataMigrationTransactionTimeoutMs("0")).toThrow(
      /positive integer/,
    );
  });
});
