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
const wingCatalogRepository = readFileSync(
  join(
    repoRoot,
    "apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts",
  ),
  "utf8",
);
const dashboardSalesRepository = readFileSync(
  join(
    repoRoot,
    "apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-sales.repository.adapter.ts",
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
  "apps/server/src/inventory/adapter/out/repository/sellpia-snapshot-publication.repository.adapter.ts",
  "apps/server/src/advertising/__tests__/ad-action-flow.pg.integration.spec.ts",
  "apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts",
  "apps/server/src/analytics/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts",
  "apps/server/src/analytics/sellpia-product-sales/__tests__/sellpia-product-sales-inventory.pg.integration.spec.ts",
  "apps/server/src/analytics/supplier-stats/__tests__/supplier-stats-flow.pg.integration.spec.ts",
  "apps/server/src/automation/application/service/__tests__/action-board-get-tasks.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-product-matching.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-recipe-suggestion.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts",
  "apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts",
  "apps/server/src/finance/services/__tests__/profit-loss.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/inventory-commitment.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/inventory-sku-snapshot-detail.repository.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts",
  "apps/server/src/inventory/__tests__/stock-transfers-tenant-boundary.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/channel-catalog-product-provisioning.repository.pg.integration.spec.ts",
  "apps/server/src/products/__tests__/product-operations.repository.pg.integration.spec.ts",
  "apps/server/src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts",
  "apps/server/src/test-helpers/finance-seeds.ts",
  "apps/server/src/supply/__tests__/purchase-order-submission.pg.integration.spec.ts",
  "apps/server/src/supply/__tests__/rocket-final-order-reconciliation.pg.integration.spec.ts",
  "apps/server/src/supply/__tests__/rocket-purchase-commitment-query.pg.integration.spec.ts",
  "apps/server/src/supply/__tests__/rocket-purchase-confirmation.pg.integration.spec.ts",
  "scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs",
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
  it("keeps the 0.1.8 rebuild boundary through release 0.1.21", () => {
    assert.equal(
      readFileSync(join(repoRoot, "VERSION"), "utf8").trim(),
      "0.1.21",
    );
    assert.match(
      migrationRegistry,
      /v0\.1\.19\/001_sellpia_inventory_freshness/,
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

  it("persists organization-scoped Sellpia freshness without a native enum", () => {
    const state = modelBlock(inventory, "SellpiaInventoryState");
    for (const field of [
      "organizationId",
      "sourceOrigin",
      "sourceAccountKey",
      "lastVerifiedAt",
      "lastCompletedImportRunId",
      "refreshRequestedAt",
      "refreshReason",
      "syncNotBefore",
      "activeSyncToken",
      "activeSyncOwnerUserId",
      "activeSyncStartedAt",
      "activeSyncLeaseExpiresAt",
      "requestedGeneration",
      "activeGeneration",
      "verifiedGeneration",
      "failedGeneration",
      "lastAttemptAt",
      "lastAttemptStatus",
      "lastErrorCode",
      "lastErrorMessage",
      "freshnessFence",
    ]) {
      assert.match(state, new RegExp(`^\\s*${field}\\s+`, "m"));
    }
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

  it("registers an idempotent freshness backfill that never writes current stock", () => {
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
    assert.match(master, /^\s*code\s+String\s*$/m);
    assert.match(master, /^\s*name\s+String\s*$/m);
    assert.match(master, /^\s*variants\s+ProductVariant\[\]/m);
    assert.match(master, /^\s*channelListings\s+ChannelListing\[\]/m);
    assert.match(
      master,
      /^\s*isActive\s+Boolean\s+@default\(true\)\s+@map\("is_active"\)/m,
    );
    assert.match(master, /@@unique\(\[organizationId, code\]\)/);
    assert.match(master, /@@unique\(\[id, organizationId\]/);
    assert.doesNotMatch(
      master,
      /^\s*(?:legacyCode|sellpiaProductCode|sellpiaName|sellpiaBarcode|barcode|currentStock|purchasePrice|salePrice|rawJson|lastImportRunId)\s+/m,
    );
  });

  it("publishes Sellpia stock only through SellpiaInventorySku", () => {
    const sku = modelBlock(inventory, "SellpiaInventorySku");
    assert.match(
      sku,
      /^\s*currentStock\s+Int\s+@default\(0\)\s+@map\("current_stock"\)/m,
    );
    assert.match(sku, /@@unique\(\[organizationId, code\]\)/);
    assert.match(sku, /@@map\("sellpia_inventory_skus"\)/);
    assert.doesNotMatch(channels, /model ChannelSkuComponent\b/);
  });

  it("keeps the Wing bulk upsert aligned with final ChannelListing columns", () => {
    const insert = wingCatalogRepository.match(
      /INSERT INTO channel_listings \([\s\S]*?ON CONFLICT[\s\S]*?DO UPDATE SET[\s\S]*?updated_at = NOW\(\)/,
    )?.[0];
    assert.ok(insert, "Expected the Wing ChannelListing bulk upsert");
    assert.doesNotMatch(insert, /^\s*channel,?$/m);
    assert.doesNotMatch(insert, /^\s*is_deleted,?$/m);
    assert.doesNotMatch(insert, /\bdeleted_at\b/);
  });

  it("groups dashboard revenue by listing and reads labels from the linked operating product", () => {
    assert.match(
      dashboardSalesRepository,
      /LEFT JOIN master_products mp ON mp\.id = cl\.master_product_id/,
    );
    assert.match(
      dashboardSalesRepository,
      /AND mp\.organization_id = \$\{organizationId\}::uuid/,
    );
    assert.doesNotMatch(dashboardSalesRepository, /channel_sku_components/);
    assert.doesNotMatch(dashboardSalesRepository, /LEFT JOIN LATERAL/);
    assert.match(dashboardSalesRepository, /mp\.abc_grade AS grade/);
    assert.match(dashboardSalesRepository, /GROUP BY cl\.id/);
  });
});
