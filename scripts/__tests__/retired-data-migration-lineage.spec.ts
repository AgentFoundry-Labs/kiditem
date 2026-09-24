import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_MIGRATION_IDS,
  retiredDataMigrations,
} from "../data-migrations/index";
import type { RetiredDataMigration } from "../data-migrations/types";
import { dataMigrationRegistryStatus } from "../run-data-migrations";

// retired.json is inactive lineage: each entry pins a migration that no longer
// runs to the bytes it ran with and names the migrations that replace it. The
// release contract guard proves the baseline commit (it needs git history);
// this spec proves the catalog against the files and registry in the checkout.

const repoRoot = join(__dirname, "..", "..");

const SCHEMA_DROP_CLEANUP = {
  id: "v0.1.31:013_remove_retired_account_kpi_and_ad_tier_rows",
  path: "scripts/data-migrations/v0.1.31/013_remove_retired_account_kpi_and_ad_tier_rows.ts",
};

const ABSOLUTE_ABC_REPLACEMENTS = [
  {
    id: "v0.1.31:001_reset_absolute_product_abc",
    path: "scripts/data-migrations/v0.1.31/001_reset_absolute_product_abc.ts",
  },
  {
    id: "v0.1.31:002_initialize_absolute_product_abc_formula",
    path: "scripts/data-migrations/v0.1.31/002_initialize_absolute_product_abc_formula.ts",
  },
];

// The develop/release-office merge-base: VERSION 0.1.30 registers 001, 002,
// and 004 with these bytes, and both branches contain it.
const MERGE_BASE = "a3e4794d2e1b1087789c0f7cbadbddfc00045da3";
// The release/office hotfix merge that registered 006 on VERSION 0.1.30. Only
// release/office contains it, so the guard needs origin/release/office.
const OFFICE_HOTFIX_MERGE = "2f0625cbcad277db4340f37ed71a5e7e5bdbb4c1";

// Office ran these from release/office before the 0.1.31 cutover removed their
// registrations.
const PROMOTED_0_1_30_LINEAGE: RetiredDataMigration[] = [
  {
    id: "v0.1.30:001_reset_legacy_product_abc_grades",
    releaseVersion: "0.1.30",
    name: "Reset legacy product ABC grades for automatic profitability evaluation",
    sourcePath:
      "scripts/data-migrations/v0.1.30/001_reset_legacy_product_abc_grades.ts",
    sourceSha256:
      "c86a19b0079d9764b11432299eb86b4c97657906c07437b80eac71427e69888a",
    baselineCommit: MERGE_BASE,
    replacementMigrations: ABSOLUTE_ABC_REPLACEMENTS,
  },
  {
    id: "v0.1.30:002_backfill_profitability_source_freshness",
    releaseVersion: "0.1.30",
    name: "Backfill independent profitability source freshness",
    sourcePath:
      "scripts/data-migrations/v0.1.30/002_backfill_profitability_source_freshness.ts",
    sourceSha256:
      "31c4780f320f70774d4ebb40d8ae5d1e72bd96b9b4c1bbe6668f17aad6940c58",
    baselineCommit: MERGE_BASE,
    replacementMigrations: ABSOLUTE_ABC_REPLACEMENTS,
  },
  {
    id: "v0.1.30:004_canonical_master_inventory_identity",
    releaseVersion: "0.1.30",
    name: "Replace channel-derived product matching with canonical inventory MasterProducts",
    sourcePath:
      "scripts/data-migrations/v0.1.30/004_canonical_master_inventory_identity.ts",
    sourceSha256:
      "353892864ec71f31132789db8e506ba2ef45ca3a7b65e6c1888839c53f1d09d5",
    baselineCommit: MERGE_BASE,
    replacementMigrations: [SCHEMA_DROP_CLEANUP],
  },
  {
    id: "v0.1.30:006_delete_legacy_channel_derived_master_products",
    releaseVersion: "0.1.30",
    name: "Delete unreferenced legacy channel-derived MasterProducts",
    sourcePath:
      "scripts/data-migrations/v0.1.30/006_delete_legacy_channel_derived_master_products.ts",
    sourceSha256:
      "2cf0ce1dec0684b83ebcb2fe0547b6ccd3fb2ddaadd1273b2373901b491e8724",
    baselineCommit: OFFICE_HOTFIX_MERGE,
    replacementMigrations: [SCHEMA_DROP_CLEANUP],
  },
];

function migrationIdentity(file: string) {
  const match = file.match(
    /^scripts\/data-migrations\/v(\d+\.\d+\.\d+)\/(\d{3}_[a-z0-9_]+)\.ts$/,
  );
  return match
    ? { id: `v${match[1]}:${match[2]}`, releaseVersion: match[1] }
    : null;
}

function sha256(file: string): string {
  return createHash("sha256")
    .update(readFileSync(join(repoRoot, file)))
    .digest("hex");
}

function declaresId(file: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bid\\s*:\\s*["']${escaped}["']`).test(
    readFileSync(join(repoRoot, file), "utf8"),
  );
}

async function exportedMigration(file: string, id: string) {
  const exports: Record<string, unknown> = await import(join(repoRoot, file));
  return Object.values(exports).find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      (value as { id?: unknown }).id === id,
  );
}

describe("retired data migration lineage", () => {
  it("names each inactive migration once", () => {
    const ids = retiredDataMigrations.map(({ id }) => id);
    const paths = retiredDataMigrations.map(({ sourcePath }) => sourcePath);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  describe.each(retiredDataMigrations.map((entry) => [entry.id, entry] as const))(
    "%s",
    (_id, entry) => {
      it("pins the unchanged source bytes and its identity", async () => {
        expect(migrationIdentity(entry.sourcePath)).toEqual({
          id: entry.id,
          releaseVersion: entry.releaseVersion,
        });
        expect(entry.baselineCommit).toMatch(/^[0-9a-f]{40}$/);
        expect(entry.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(sha256(entry.sourcePath)).toBe(entry.sourceSha256);
        expect(await exportedMigration(entry.sourcePath, entry.id)).toMatchObject({
          id: entry.id,
          releaseVersion: entry.releaseVersion,
          name: entry.name,
        });
      });

      it("stays out of the executable registry", () => {
        expect(DATA_MIGRATION_IDS).not.toContain(entry.id);
      });

      it("names registered replacements that declare their ids", () => {
        // A promoted migration with nothing left to replace states why instead
        // (KID-262); the release contract guard checks it is promoted.
        if (entry.replacementMigrations.length === 0) {
          expect(entry.noReplacementReason?.trim()).toBeTruthy();
        }
        for (const replacement of entry.replacementMigrations) {
          expect(migrationIdentity(replacement.path)?.id).toBe(replacement.id);
          expect(DATA_MIGRATION_IDS).toContain(replacement.id);
          expect(declaresId(replacement.path, replacement.id)).toBe(true);
        }
      });
    },
  );

  it("records lineage for the promoted 0.1.30 migrations the 0.1.31 cutover retired", () => {
    const status = dataMigrationRegistryStatus();

    for (const expected of PROMOTED_0_1_30_LINEAGE) {
      expect(retiredDataMigrations.find(({ id }) => id === expected.id)).toEqual(
        expected,
      );
      expect(status.retiredMigrations).toContainEqual({
        ...expected,
        execution: "inactive",
      });
    }
  });
});
