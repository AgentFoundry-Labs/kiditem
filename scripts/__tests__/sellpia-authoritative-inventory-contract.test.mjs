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
const migrationRegistry = readFileSync(
  join(repoRoot, 'scripts/data-migrations/index.ts'),
  'utf8',
);

function modelBlock(source, modelName) {
  const block = source.match(new RegExp(`model ${modelName}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(block, `Expected model ${modelName}`);
  return block;
}

describe('Sellpia authoritative final-schema contract', () => {
  it('uses one 0.1.8 rebuild release without preservation migrations', () => {
    assert.equal(readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim(), '0.1.8');
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
});
