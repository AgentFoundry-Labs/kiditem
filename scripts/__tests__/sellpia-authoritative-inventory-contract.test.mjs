import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const schemaFiles = [
  'prisma/models/core.prisma',
  'prisma/models/inventory.prisma',
  'prisma/models/channels.prisma',
  'prisma/models/sourcing.prisma',
  'prisma/models/ai.prisma',
  'prisma/models/orders.prisma',
  'prisma/models/supply.prisma',
  'prisma/models/advertising.prisma',
  'prisma/models/finance.prisma',
];
const schema = schemaFiles
  .map((file) => readFileSync(join(repoRoot, file), 'utf8'))
  .join('\n');
const core = readFileSync(join(repoRoot, 'prisma/models/core.prisma'), 'utf8');
const channels = readFileSync(join(repoRoot, 'prisma/models/channels.prisma'), 'utf8');
const wingCatalogRepository = readFileSync(
  join(
    repoRoot,
    'apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts',
  ),
  'utf8',
);
const dashboardSalesRepository = readFileSync(
  join(
    repoRoot,
    'apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-sales.repository.adapter.ts',
  ),
  'utf8',
);
const migrationRegistry = readFileSync(
  join(repoRoot, 'scripts/data-migrations/index.ts'),
  'utf8',
);
const runtimeApiSkill = readFileSync(
  join(repoRoot, 'apps/server/agent-config/skills/kiditem-api/SKILL.md'),
  'utf8',
);

function modelBlock(source, modelName) {
  const block = source.match(new RegExp(`model ${modelName}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(block, `Expected model ${modelName}`);
  return block;
}

describe('Sellpia authoritative final-schema contract', () => {
  it('keeps the 0.1.8 rebuild boundary through the current release without preservation migrations', () => {
    assert.equal(readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim(), '0.1.18');
    assert.doesNotMatch(migrationRegistry, /v0\.1\.9/);
    assert.doesNotMatch(migrationRegistry, /buildSellpiaMasterIdentityMap/);
    assert.doesNotMatch(migrationRegistry, /repointChannelSkuComponents/);
    assert.doesNotMatch(migrationRegistry, /backfillFinalOwnerRelations/);
    assert.doesNotMatch(migrationRegistry, /verifyFreshSellpiaSnapshot/);
    assert.doesNotMatch(migrationRegistry, /verifyChannelCatalogCutover/);

    assert.equal(
      existsSync(join(repoRoot, 'scripts/data-migrations/v0.1.9')),
      false,
      'The final rebuild must not retain a preservation-only v0.1.9 directory',
    );
  });

  it('removes every duplicate legacy product and inventory owner', () => {
    for (const model of [
      'InventorySku',
      'InventorySkuMasterProductMap',
      'ProductOption',
      'BundleComponent',
      'MasterCodeCounter',
      'MasterProductImage',
      'MasterSupplierProduct',
      'ChannelReconciliationRun',
      'ChannelReconciliationItem',
    ]) {
      assert.doesNotMatch(schema, new RegExp(`model ${model}\\b`));
    }

    for (const field of [
      'inventorySkuId',
      'productOptionId',
      'optionId',
      'legacyInventorySkuId',
      'finalMasterProductId',
    ]) {
      assert.doesNotMatch(schema, new RegExp(`^\\s*${field}\\s+`, 'm'));
    }
  });

  it('keeps the runtime API skill on final channel and Sellpia inventory routes', () => {
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

  it('defines MasterProduct as the organization-scoped Sellpia stock owner', () => {
    const master = modelBlock(core, 'MasterProduct');
    assert.match(master, /^\s*code\s+String\s*$/m);
    assert.match(master, /^\s*name\s+String\s*$/m);
    assert.match(master, /^\s*currentStock\s+Int\s+@default\(0\)\s+@map\("current_stock"\)/m);
    assert.match(master, /^\s*isActive\s+Boolean\s+@default\(true\)\s+@map\("is_active"\)/m);
    assert.match(master, /@@unique\(\[organizationId, code\]\)/);
    assert.match(master, /@@unique\(\[id, organizationId\]/);
    assert.doesNotMatch(master, /^\s*(?:legacyCode|sellpiaProductCode|sellpiaName|sellpiaBarcode)\s+/m);
  });

  it('maps each channel SKU directly to MasterProduct with final mapping sources only', () => {
    const component = modelBlock(channels, 'ChannelSkuComponent');
    assert.match(component, /^\s*masterProductId\s+String\s+@map\("master_product_id"\)\s+@db\.Uuid/m);
    assert.match(component, /@@unique\(\[channelSkuId, masterProductId\]\)/);
    assert.match(
      component,
      /mappingSource\s+String[^\n]*product_code \| barcode \| manual/,
    );
    assert.doesNotMatch(component, /legacy_migrated/);
  });

  it('keeps the Wing bulk upsert aligned with final ChannelListing columns', () => {
    const insert = wingCatalogRepository.match(
      /INSERT INTO channel_listings \([\s\S]*?ON CONFLICT[\s\S]*?DO UPDATE SET[\s\S]*?updated_at = NOW\(\)/,
    )?.[0];
    assert.ok(insert, 'Expected the Wing ChannelListing bulk upsert');
    assert.doesNotMatch(insert, /^\s*channel,?$/m);
    assert.doesNotMatch(insert, /^\s*is_deleted,?$/m);
    assert.doesNotMatch(insert, /\bdeleted_at\b/);
  });

  it('groups dashboard revenue by listing and resolves a component label without bundle duplication', () => {
    assert.match(
      dashboardSalesRepository,
      /LEFT JOIN LATERAL/,
    );
    assert.match(
      dashboardSalesRepository,
      /JOIN channel_sku_components csc ON csc\.channel_sku_id = label_clo\.id/,
    );
    assert.match(
      dashboardSalesRepository,
      /JOIN master_products mp ON mp\.id = csc\.master_product_id/,
    );
    assert.match(
      dashboardSalesRepository,
      /AND csc\.organization_id = \$\{organizationId\}::uuid/,
    );
    assert.doesNotMatch(dashboardSalesRepository, /cl\.master_id/);
    assert.doesNotMatch(
      dashboardSalesRepository,
      /JOIN channel_sku_components csc ON csc\.channel_sku_id = clo\.id/,
    );
    assert.doesNotMatch(dashboardSalesRepository, /mp\.abc_grade/);
    assert.match(dashboardSalesRepository, /cl\.abc_grade AS grade/);
    assert.match(dashboardSalesRepository, /GROUP BY cl\.id/);
  });
});
