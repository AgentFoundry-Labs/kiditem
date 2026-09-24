import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();
const schemaFiles = [
  "prisma/models/core.prisma",
  "prisma/models/inventory.prisma",
  "prisma/models/channels.prisma",
  "prisma/models/sourcing.prisma",
  "prisma/models/ai.prisma",
  "prisma/models/orders.prisma",
  "prisma/models/supply.prisma",
  "prisma/models/advertising.prisma",
  "prisma/models/finance.prisma",
];
const schema = schemaFiles
  .map((file) => readFileSync(join(repoRoot, file), "utf8"))
  .join("\n");
const core = readFileSync(join(repoRoot, "prisma/models/core.prisma"), "utf8");
const channels = readFileSync(
  join(repoRoot, "prisma/models/channels.prisma"),
  "utf8",
);
const catalogIdentityUpsert = readFileSync(
  join(
    repoRoot,
    "apps/server/src/channels/adapter/out/repository/channel-catalog-identity-upsert.ts",
  ),
  "utf8",
);
const dashboardSalesRepository = readFileSync(
  join(
    repoRoot,
    "apps/server/src/analytics/adapter/out/repository/dashboard/dashboard-sales.repository.adapter.ts",
  ),
  "utf8",
);
const migrationRegistry = readFileSync(
  join(repoRoot, "scripts/data-migrations/index.ts"),
  "utf8",
);
const runtimeApiSkill = readFileSync(
  join(repoRoot, "apps/server/agent-config/skills/kiditem-api/SKILL.md"),
  "utf8",
);
const inventory = readFileSync(
  join(repoRoot, "prisma/models/inventory.prisma"),
  "utf8",
);
const supply = readFileSync(
  join(repoRoot, "prisma/models/supply.prisma"),
  "utf8",
);

const CURRENT_STOCK_WRITE_ALLOWLIST = new Set([
  "apps/server/src/inventory/adapter/out/persistence/sellpia-snapshot-publication.repository.adapter.ts",
  "apps/server/src/advertising/__tests__/ad-action-flow.pg.integration.spec.ts",
  "apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts",
  "apps/server/src/advertising/__tests__/profitability-ad-import.repository.pg.integration.spec.ts",
  "apps/server/src/analytics/__tests__/dashboard/dashboard-inventory.pg.integration.spec.ts",
  "apps/server/src/analytics/__tests__/dashboard/inventory-abc-read.pg.integration.spec.ts",
  "apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts",
  "apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-profitability-source.pg.integration.spec.ts",
  "apps/server/src/analytics/supplier-stats/__tests__/supplier-stats-flow.pg.integration.spec.ts",
  "apps/server/src/automation/application/service/__tests__/action-board-get-tasks.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-product-matching.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-recipe-suggestion.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/marketplace-registration.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/product-sync.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/rocket-po-source.pg.integration.spec.ts",
  "apps/server/src/finance/application/service/profit-loss/__tests__/profit-loss.pg.integration.spec.ts",
  "apps/server/src/finance/__tests__/profitability-evidence.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/inventory-commitment.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/inventory-sale-age.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/inventory-sku-snapshot-detail.repository.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/inventory-sku-export.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/sellpia-inventory-source.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/sellpia-inventory-sku-history.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/stock-transfers-reader.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/stock-transfers-tenant-boundary.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/master-product-abc-publication.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/master-product-abc-recipe-flow.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/master-product-abc.repository.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/product-abc-display-status.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/product-channel-option-recipe-mutation.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/product-operations.repository.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/selling-master-product-inventory-fence.pg.integration.spec.ts",
  "apps/server/src/__tests__/master-product-inventory-cutover-migration.pg.integration.spec.ts",
  "apps/server/src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/sellpia-manual-match-source-owner.pg.integration.spec.ts",
  "apps/server/src/test-helpers/finance-seeds.ts",
  "apps/server/src/test-helpers/inventory-seeds.ts",
  "apps/server/src/supply/__tests__/purchase-order-submission.pg.integration.spec.ts",
  "apps/server/src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts",
  "apps/server/src/supply/__tests__/rocket-purchase-commitment-query.pg.integration.spec.ts",
  "apps/server/src/supply/__tests__/rocket-purchase-confirmation.pg.integration.spec.ts",
  "scripts/data-migrations/v0.1.30/004_canonical_master_inventory_identity.ts",
  "scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs",
  "scripts/seed-agent-os-browser-qa.ts",
]);

function currentStockWriteViolations(source) {
  const violations = [];
  const prismaWrite =
    /\b[\w$.]+\.sellpiaInventorySku\.(createMany|create|updateMany|update|upsert)\s*\(/g;
  for (const match of source.matchAll(prismaWrite)) {
    violations.push(`Prisma sellpiaInventorySku.${match[1]} write`);
  }
  if (
    /\bINSERT\s+INTO\s+sellpia_inventory_skus\s*\([\s\S]*?\bcurrent_stock\b/i.test(
      source,
    )
  ) {
    violations.push("raw INSERT assignment to sellpia_inventory_skus.current_stock");
  }
  if (
    /\bUPDATE\s+sellpia_inventory_skus\b[\s\S]*?\bSET\b[\s\S]*?\bcurrent_stock\s*=/i.test(
      source,
    )
  ) {
    violations.push("raw UPDATE assignment to sellpia_inventory_skus.current_stock");
  }
  return violations;
}

function modelBlock(source, modelName) {
  const block = source.match(
    new RegExp(`model ${modelName}\\s*\\{[\\s\\S]*?\\n\\}`),
  )?.[0];
  assert.ok(block, `Expected model ${modelName}`);
  return block;
}

describe("Sellpia authoritative final-schema contract", () => {
  it("keeps the 0.1.8 rebuild boundary through release 0.1.22", () => {
    // The 0.1.19 freshness backfill ran; the KID-90 schema drop removed a field
    // it writes, so its registration moved to the inactive lineage catalog.
    assert.doesNotMatch(
      migrationRegistry,
      /v0\.1\.19\/001_sellpia_inventory_freshness/,
    );
    const retiredCatalog = JSON.parse(
      readFileSync(join(repoRoot, "scripts/data-migrations/retired.json"), "utf8"),
    );
    assert.ok(
      retiredCatalog.some(
        (entry) =>
          entry.sourcePath ===
          "scripts/data-migrations/v0.1.19/001_sellpia_inventory_freshness.ts",
      ),
      "Expected inactive lineage for the 0.1.19 freshness backfill",
    );
    assert.doesNotMatch(migrationRegistry, /v0\.1\.9/);
    assert.doesNotMatch(migrationRegistry, /buildSellpiaMasterIdentityMap/);
    assert.doesNotMatch(migrationRegistry, /repointChannelSkuComponents/);
    assert.doesNotMatch(migrationRegistry, /backfillFinalOwnerRelations/);
    assert.doesNotMatch(migrationRegistry, /verifyFreshSellpiaSnapshot/);
    assert.doesNotMatch(migrationRegistry, /verifyChannelCatalogCutover/);

    assert.equal(
      existsSync(join(repoRoot, "scripts/data-migrations/v0.1.9")),
      false,
      "The final rebuild must not retain a preservation-only v0.1.9 directory",
    );
  });

  it("persists organization-scoped Sellpia collection control without a native enum", () => {
    const state = modelBlock(inventory, "SellpiaInventoryState");
    for (const field of [
      "organizationId",
      "sourceOrigin",
      "sourceAccountKey",
      "lastVerifiedAt",
      "lastCompletedImportRunId",
      "activeSyncToken",
      "activeSyncOwnerUserId",
      "activeSyncStartedAt",
      "activeSyncLeaseExpiresAt",
      "requestedGeneration",
      "activeGeneration",
      "verifiedGeneration",
      "failedGeneration",
      "lastAttemptAt",
      "lastErrorCode",
      "lastErrorMessage",
      "freshnessFence",
    ]) {
      assert.match(state, new RegExp(`^\\s*${field}\\s+`, "m"));
    }
    // The last attempt outcome is derived, not stored (KID-90).
    assert.doesNotMatch(state, /^\s*lastAttemptStatus\s+/m);
    assert.match(state, /^\s*organizationId\s+String\s+@id[^\n]*@db\.Uuid/m);
    assert.match(
      state,
      /^\s*freshnessFence\s+String[^\n]*@default\(uuid\(\)\)[^\n]*@db\.Uuid/m,
    );
    assert.match(state, /@@index\(\[lastCompletedImportRunId\]\)/);
    assert.match(state, /@@index\(\[activeSyncOwnerUserId\]\)/);
    assert.doesNotMatch(schema, /^enum\s+/m);
  });

  it("persists nullable source provenance with partial hash and failed-generation uniqueness", () => {
    const run = modelBlock(core, "SourceImportRun");
    assert.match(run, /^\s*fileName\s+String\?\s+@map\("file_name"\)/m);
    assert.match(run, /^\s*fileHash\s+String\?\s+@map\("file_hash"\)/m);
    for (const field of [
      "lastVerifiedAt",
      "verificationCount",
      "lastTrigger",
      "freshnessGeneration",
      "manualFreshExportConfirmedAt",
      "manualFreshExportConfirmedBy",
      "qualityReport",
      "errorCode",
      "errorMessage",
    ]) {
      assert.match(run, new RegExp(`^\\s*${field}\\s+`, "m"));
    }
    assert.match(run, /^\s*verificationCount\s+Int\s+@default\(0\)/m);

    const hashConstraints = [
      ...run.matchAll(/@@unique\(\[[^\]]*fileHash[^\n]+\)/g),
    ];
    assert.equal(hashConstraints.length, 2);
    for (const constraint of hashConstraints) {
      assert.match(constraint[0], /file_hash IS NOT NULL/);
    }
    assert.match(
      run,
      /@@unique\(\[organizationId, sourceType, freshnessGeneration\][^\n]+file_hash IS NULL[^\n]+status = 'failed'[^\n]+freshness_generation IS NOT NULL/,
    );
  });

  it("persists tenant-safe purchase submission attempts", () => {
    const attempt = modelBlock(supply, "PurchaseOrderSubmissionAttempt");
    for (const field of [
      "organizationId",
      "purchaseOrderId",
      "idempotencyKey",
      "freshnessGeneration",
      "status",
      "providerReference",
      "errorCode",
      "errorMessage",
      "reconciliationOutcome",
      "reconciledAt",
      "reconciledBy",
      "createdAt",
      "updatedAt",
    ]) {
      assert.match(attempt, new RegExp(`^\\s*${field}\\s+`, "m"));
    }
    assert.match(
      attempt,
      /@@unique\(\[organizationId, purchaseOrderId, idempotencyKey\]\)/,
    );
    assert.match(
      attempt,
      /@relation\(fields: \[purchaseOrderId, organizationId\], references: \[id, organizationId\]/,
    );
  });

  it("keeps the applied idempotent freshness backfill that never writes current stock", () => {
    const migrationPath = join(
      repoRoot,
      "scripts/data-migrations/v0.1.19/001_sellpia_inventory_freshness.ts",
    );
    assert.equal(
      existsSync(migrationPath),
      true,
      "Expected the 0.1.19 migration",
    );
    const migration = readFileSync(migrationPath, "utf8");
    assert.match(migration, /sourceType:\s*["']sellpia_inventory["']/);
    assert.match(migration, /status:\s*["']completed["']/);
    assert.match(migration, /lastVerifiedAt/);
    assert.match(migration, /verificationCount/);
    assert.match(migration, /legacy_manual_import/);
    assert.match(migration, /https:\/\/kiditem\.sellpia\.com/);
    assert.match(
      migration,
      /(?:sourceAccountKey:\s*["']kiditem["']|SELLPIA_SOURCE_ACCOUNT_KEY\s*=\s*["']kiditem["'])/,
    );
    assert.match(migration, /requestedGeneration:\s*1n/);
    assert.match(migration, /verifiedGeneration:\s*1n/);
    assert.match(migration, /verifiedGeneration:\s*0n/);
    assert.match(migration, /skipDuplicates:\s*true/);
    assert.doesNotMatch(migration, /masterProduct|currentStock|current_stock/);
  });

  it("detects every supported direct current-stock write shape", () => {
    for (const method of [
      "create",
      "createMany",
      "update",
      "updateMany",
      "upsert",
    ]) {
      assert.deepEqual(
        currentStockWriteViolations(
          `await prisma.sellpiaInventorySku.${method}({ data: { currentStock: 1 } });`,
        ),
        [`Prisma sellpiaInventorySku.${method} write`],
      );
    }
    assert.deepEqual(
      currentStockWriteViolations(
        "INSERT INTO sellpia_inventory_skus (id, current_stock) VALUES (1, 2)",
      ),
      ["raw INSERT assignment to sellpia_inventory_skus.current_stock"],
    );
    assert.deepEqual(
      currentStockWriteViolations(
        "UPDATE sellpia_inventory_skus SET current_stock = 2 WHERE id = 1",
      ),
      ["raw UPDATE assignment to sellpia_inventory_skus.current_stock"],
    );
  });

  it("keeps current-stock writes inside the publication adapter or explicit fixtures", () => {
    const files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd: repoRoot, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file))
      .filter((file) => existsSync(join(repoRoot, file)));
    const violations = files.flatMap((file) => {
      if (CURRENT_STOCK_WRITE_ALLOWLIST.has(file)) return [];
      return currentStockWriteViolations(
        readFileSync(join(repoRoot, file), "utf8"),
      ).map((message) => `${file}: ${message}`);
    });
    assert.deepEqual(violations, []);
  });

  it("removes every duplicate legacy product and inventory owner", () => {
    for (const model of [
      "InventorySku",
      "InventorySkuMasterProductMap",
      "ProductOption",
      "BundleComponent",
      "MasterCodeCounter",
      "MasterProductImage",
      "MasterSupplierProduct",
      "ChannelReconciliationRun",
      "ChannelReconciliationItem",
    ]) {
      assert.doesNotMatch(schema, new RegExp(`model ${model}\\b`));
    }

    for (const field of [
      "inventorySkuId",
      "productOptionId",
      "optionId",
      "legacyInventorySkuId",
      "finalMasterProductId",
    ]) {
      assert.doesNotMatch(schema, new RegExp(`^\\s*${field}\\s+`, "m"));
    }
  });

  it("keeps the runtime API skill on final channel and Sellpia inventory routes", () => {
    assert.match(runtimeApiSkill, /GET\s+\/api\/channels\/listings\b/);
    assert.match(runtimeApiSkill, /GET\s+\/api\/inventory\/sellpia-skus\b/);
    assert.match(
      runtimeApiSkill,
      /GET\s+\/api\/inventory\/sellpia-skus\/\{masterProductId\}\s/,
    );
    assert.doesNotMatch(runtimeApiSkill, /GET\s+\/api\/products(?:[/?{]|\s)/);
    assert.doesNotMatch(runtimeApiSkill, /GET\s+\/api\/inventory\s/);
    assert.doesNotMatch(runtimeApiSkill, /\/api\/inventory\/by-product\b/);
    assert.doesNotMatch(runtimeApiSkill, /GET\s+\/api\/dashboard\s/);
  });

  it("defines MasterProduct as the organization-scoped operating product", () => {
    const master = modelBlock(core, "MasterProduct");
    assert.match(master, /^\s*code\s+String\b/m);
    assert.match(master, /^\s*name\s+String\s*$/m);
    assert.doesNotMatch(core, /model ProductVariant\b/);
    for (const field of [
      "sourceAccountKey",
      "sourceProductCode",
      "sourceOptionCode",
      "optionName",
      "barcode",
      "currentStock",
      "purchasePrice",
    ]) {
      assert.match(master, new RegExp(`^\\s*${field}\\s+`, "m"));
    }
    assert.match(master, /code\s+String\b[^\n]*@unique\(map: "master_products_code_key"\)/);
    assert.match(master, /@@unique\(\[id, organizationId\]/);
    assert.match(
      master,
      /@@unique\(\[organizationId, sourceAccountKey, sourceProductCode, sourceOptionCode\]/,
    );
  });

  it("publishes Sellpia stock on the canonical MasterProduct", () => {
    const master = modelBlock(core, "MasterProduct");
    assert.match(
      master,
      /^\s*currentStock\s+Int\s+@default\(0\)\s+@map\("current_stock"\)/m,
    );
    assert.doesNotMatch(inventory, /model SellpiaInventorySku\s*\{/);
    assert.doesNotMatch(channels, /model ChannelSkuComponent\b/);
  });

  it("keeps the catalog ChannelListing bulk upserts aligned with final ChannelListing columns", () => {
    const inserts = [...catalogIdentityUpsert.matchAll(
      /INSERT INTO channel_listings \([\s\S]*?ON CONFLICT[\s\S]*?DO UPDATE SET[\s\S]*?updated_at = NOW\(\)/g,
    )].map((match) => match[0]);
    // `upsertChannelCatalogBasics` 와 `upsertChannelCatalogIdentities` 두 곳이다. 하나가 늘거나 줄면 이 계약을 다시 본다.
    assert.equal(inserts.length, 2, "Expected exactly the two catalog ChannelListing bulk upserts");
    for (const insert of inserts) {
      assert.doesNotMatch(insert, /^\s*channel,?$/m);
      assert.doesNotMatch(insert, /^\s*is_deleted,?$/m);
      assert.doesNotMatch(insert, /\bdeleted_at\b/);
    }
  });

  it("reads canonical Orders facts and the public Products ABC view for dashboard ranking", () => {
    assert.match(
      dashboardSalesRepository,
      /readOrderLineWindowFacts\(tx/,
    );
    assert.match(
      dashboardSalesRepository,
      /this\.productAbc\.readAbc\(/,
    );
    assert.match(dashboardSalesRepository, /@Inject\(PRODUCT_ABC_READ_PORT\)/);
    assert.doesNotMatch(dashboardSalesRepository, /products\/adapter\/out/);
    assert.doesNotMatch(dashboardSalesRepository, /\$queryRaw/);
    assert.doesNotMatch(dashboardSalesRepository, /\bFROM\s+order_line_items\b/i);
    assert.doesNotMatch(dashboardSalesRepository, /channel_sku_components/);
    assert.doesNotMatch(dashboardSalesRepository, /LEFT JOIN LATERAL/);
    assert.doesNotMatch(dashboardSalesRepository, /master_product_abc_evaluations/);
    assert.match(dashboardSalesRepository, /grade: abc\?\.abcGrade \?\? null/);
    assert.doesNotMatch(dashboardSalesRepository, /mp\.abc_grade AS grade/);
    // One group per listing: a bundle line counts once however many Sellpia
    // components its option consumes. A line that settles against no listing —
    // a Coupang Rocket purchase order, which carries no listing option at all —
    // groups on its own SKU so its revenue is ranked rather than dropped
    // (ADR-0004). The listing still closes the group.
    assert.match(dashboardSalesRepository, /const id = listing\?\.id \?\? `line-sku:/);
    assert.match(dashboardSalesRepository, /grouped\.set\(id, current\)/);
  });
});
