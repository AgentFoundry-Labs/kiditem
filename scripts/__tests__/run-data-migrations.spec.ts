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
  buildRebuildBaselineManifest,
  assertRebuildBaselineRestore,
  dataMigrationTransactionTimeoutMs,
  DEFAULT_DATA_MIGRATION_TRANSACTION_TIMEOUT_MS,
  isDefinitelyProductionDatabaseUrl,
  normalizeReleaseVersion,
  selectDataMigrationsForPhase,
} from "../run-data-migrations";

const repoRoot = join(__dirname, "..", "..");

describe("data migration registry", () => {
  it("registers the release migration chain in order", () => {
    expect(DATA_MIGRATION_IDS).toEqual([
      "v0.1.4:001_record_agent_os_operator_backbone_release",
      "v0.1.6:001_record_rocket_read_model_release",
      "v0.1.7:001_record_sellpia_rocket_inventory_sync_release",
      "v0.1.18:001_migrate_representative_keyword_overrides",
      "v0.1.19:001_sellpia_inventory_freshness",
      "v0.1.21:001_backfill_inventory_commitments",
      "v0.1.24:001_dedupe_detail_page_artifacts",
      "v0.1.25:001_repair_ad_campaign_daily_business_dates",
      "v0.1.25:002_repair_coupang_ads_daily_conversions",
      "v0.1.25:003_repair_ad_campaign_target_conversions",
      "v0.1.25:004_rekey_ad_campaign_product_targets",
      "v0.1.25:005_remove_ambiguous_ad_campaign_account_kpis",
      "v0.1.26:001_initialize_master_product_abc_policy",
    ]);
    expect(
      DATA_MIGRATION_IDS.filter((id) =>
        /backfill|normalize|rewrite|repoint|verify/.test(id),
      ),
    ).toEqual([
      "v0.1.21:001_backfill_inventory_commitments",
    ]);
  });

  it("registers the 0.1.25 ad campaign repairs and the 0.1.21 inventory commitment backfill", () => {
    const migrationIds = dataMigrations.map((migration) => migration.id);

    expect(migrationIds).toContain(
      "v0.1.25:001_repair_ad_campaign_daily_business_dates",
    );
    expect(migrationIds).toContain(
      "v0.1.25:005_remove_ambiguous_ad_campaign_account_kpis",
    );
    expect(migrationIds).toContain("v0.1.21:001_backfill_inventory_commitments");
    expect(migrationIds).toContain(
      "v0.1.26:001_initialize_master_product_abc_policy",
    );
  });

  it("keeps historical release 0.1.22 migration-free and never registers ahead of the root VERSION", () => {
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
    expect(selectDataMigrationsForPhase(dataMigrations, "pre-schema").map(({ id }) => id)).toEqual([
      "v0.1.24:001_dedupe_detail_page_artifacts",
    ]);
    expect(selectDataMigrationsForPhase(dataMigrations, "post-schema")).toEqual(
      dataMigrations.filter((migration) => migration.phase !== "pre-schema"),
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

describe('authoritative rebuild migration baseline', () => {
  const registry = [
    { id: 'v0.1.21:001_old', releaseVersion: '0.1.21', name: 'old' },
    { id: 'v0.1.24:001_current', releaseVersion: '0.1.24', name: 'current' },
  ];
  const ledger = registry.map((migration) => ({
    migrationId: migration.id,
    releaseVersion: migration.releaseVersion,
    name: migration.name,
    status: 'succeeded',
  }));
  const binding = {
    rootReleaseVersion: '0.1.24',
    expectedGitSha: '0123456789abcdef0123456789abcdef01234567',
    prismaSchemaHash: 'a'.repeat(64),
    originRunId: '12345',
  };

  it('hashes the exact ordered registry and succeeded ledger', () => {
    const manifest = buildRebuildBaselineManifest({ registry, ledger, ...binding });
    expect(manifest.registry.map(({ id }) => id)).toEqual(registry.map(({ id }) => id));
    expect(manifest.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertRebuildBaselineRestore({
      manifest,
      registry,
      existingLedgerIds: [],
      ...binding,
    })).not.toThrow();
  });

  it.each([
    { ledger: [{ ...ledger[0], status: 'running' }, ledger[1]] },
    { ledger: [{ ...ledger[0], status: 'failed' }, ledger[1]] },
    { ledger: [ledger[0]] },
    { ledger: [...ledger, { migrationId: 'v9.0.0:999_unknown', releaseVersion: '9.0.0', name: 'x', status: 'succeeded' }] },
  ])('rejects unsafe or non-exact ledgers', ({ ledger: unsafeLedger }) => {
    expect(() => buildRebuildBaselineManifest({
      registry,
      ledger: unsafeLedger,
      ...binding,
    })).toThrow(/ledger|registry|succeeded/i);
  });

  it('rejects changed registry, binding, manifest hash, or a nonempty recreated ledger', () => {
    const manifest = buildRebuildBaselineManifest({ registry, ledger, ...binding });
    for (const override of [
      { registry: [...registry].reverse() },
      { expectedGitSha: 'f'.repeat(40) },
      { prismaSchemaHash: 'b'.repeat(64) },
      { originRunId: '54321' },
      { existingLedgerIds: [registry[0].id] },
      { manifest: { ...manifest, manifestSha256: '0'.repeat(64) } },
    ]) {
      expect(() => assertRebuildBaselineRestore({
        manifest,
        registry,
        existingLedgerIds: [],
        ...binding,
        ...override,
      })).toThrow(/baseline|manifest|registry|ledger|binding/i);
    }
  });
});
