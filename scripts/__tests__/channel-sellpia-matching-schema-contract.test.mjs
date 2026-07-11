import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const coreSchema = readFileSync(join(repoRoot, 'prisma/models/core.prisma'), 'utf8');
const inventorySchema = readFileSync(join(repoRoot, 'prisma/models/inventory.prisma'), 'utf8');
const channelsSchema = readFileSync(join(repoRoot, 'prisma/models/channels.prisma'), 'utf8');

function extractModel(schema, modelName) {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Expected model ${modelName} to exist`);
  return match[0];
}

function assertModelAbsent(schema, modelName) {
  assert.doesNotMatch(
    schema,
    new RegExp(`^model ${modelName} \\{`, 'm'),
    `Expected legacy model ${modelName} to be absent`,
  );
}

function assertFields(model, fieldNames) {
  for (const fieldName of fieldNames) {
    assert.match(model, new RegExp(`^\\s*${fieldName}\\s+`, 'm'), `Expected field ${fieldName}`);
  }
}

function assertNoFields(model, fieldNames) {
  for (const fieldName of fieldNames) {
    assert.doesNotMatch(
      model,
      new RegExp(`^\\s*${fieldName}\\s+`, 'm'),
      `Expected field ${fieldName} to be absent`,
    );
  }
}

function compact(schema) {
  return schema
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

describe('channel Sellpia matching schema contract', () => {
  it('removes the legacy mutable stock schema after the development reset cutover', () => {
    extractModel(coreSchema, 'ProductOption');
    extractModel(coreSchema, 'BundleComponent');
    extractModel(channelsSchema, 'ChannelReconciliationRun');
    extractModel(channelsSchema, 'ChannelReconciliationItem');
    assertModelAbsent(inventorySchema, 'Inventory');
    assertModelAbsent(inventorySchema, 'StockTransaction');
    assertModelAbsent(inventorySchema, 'RocketInventoryLedger');
    assertModelAbsent(inventorySchema, 'SellpiaStockSnapshot');
    assertModelAbsent(inventorySchema, 'SellpiaStockSnapshotItem');
    assertModelAbsent(inventorySchema, 'SellpiaNewProductCandidate');

    const option = extractModel(coreSchema, 'ProductOption');
    assertNoFields(option, ['availableStock']);
  });

  it('defines InventorySku as Sellpia-owned physical inventory without legacy stock mutation or channel identity', () => {
    const model = extractModel(inventorySchema, 'InventorySku');

    assertFields(model, [
      'sellpiaProductCode',
      'currentStock',
      'purchasePrice',
      'salePrice',
      'rawJson',
      'lastImportRunId',
    ]);
    assertNoFields(model, [
      'reportedStock',
      'masterId',
      'reservedStock',
      'safetyStock',
      'isBundle',
      'availableStock',
      'channel',
      'channelAccountId',
      'marketplace',
      'marketplaceId',
      'externalId',
      'externalProductId',
      'externalSkuId',
      'sellerSku',
      'channelProductId',
      'channelSkuId',
    ]);
    assert.match(
      model,
      /^\s*currentStock\s+Int\s+@default\(0\)\s+@map\("current_stock"\)/m,
    );
    assert.doesNotMatch(model, /reported_stock/);
  });

  it('defines fenced, account-aware source import idempotency', () => {
    const model = extractModel(coreSchema, 'SourceImportRun');
    const normalized = compact(model);

    assert.match(
      model,
      /^\s*attemptToken\s+String\s+@default\(uuid\(\)\)\s+@map\("attempt_token"\)\s+@db\.Uuid/m,
    );
    assert.ok(
      normalized.includes(
        '@@unique([organizationId, sourceType, channelAccountId, fileHash], map: "source_import_runs_org_source_account_hash_key", where: raw("channel_account_id IS NOT NULL"))',
      ),
      'Expected the non-null-account partial unique index',
    );
    assert.ok(
      normalized.includes(
        '@@unique([organizationId, sourceType, fileHash], map: "source_import_runs_org_source_hash_null_account_key", where: raw("channel_account_id IS NULL"))',
      ),
      'Expected the null-account partial unique index',
    );
  });

  it('promotes ChannelListing while retaining its compatibility relation', () => {
    const model = extractModel(coreSchema, 'ChannelListing');
    const normalized = compact(model);

    assert.match(model, /^\s*masterId\s+String\?\s+@map\("master_id"\)\s+@db\.Uuid/m);
    assert.match(
      model,
      /^\s*master\s+MasterProduct\?\s+@relation\(fields:\s*\[masterId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/m,
    );
    assertFields(model, [
      'displayName',
      'category',
      'brand',
      'manufacturer',
      'rawJson',
      'lastImportRunId',
    ]);
    assert.ok(
      normalized.includes(
        '@@unique([id, organizationId, channelAccountId], map: "channel_listings_id_org_account_key")',
      ),
      'Expected the ChannelListing organization/account composite key',
    );
  });

  it('promotes ChannelListingOption with account-scoped parent enforcement', () => {
    const model = extractModel(coreSchema, 'ChannelListingOption');
    const normalized = compact(model);

    assertFields(model, [
      'channelAccountId',
      'sellerSku',
      'barcode',
      'modelNumber',
      'status',
      'mappingStatus',
      'rawJson',
      'lastImportRunId',
    ]);
    assert.match(
      model,
      /^\s*mappingStatus\s+String\s+@default\("unmatched"\)\s+@map\("mapping_status"\)/m,
    );
    assert.ok(
      normalized.includes(
        'scopedProduct ChannelListing? @relation("ChannelSkuScopedProduct", fields: [listingId, organizationId, channelAccountId], references: [id, organizationId, channelAccountId], onDelete: Cascade)',
      ),
      'Expected the optional account-scoped ChannelListing relation',
    );
  });

  it('defines ChannelSkuComponent as the organization-scoped InventorySku mapping source of truth', () => {
    const model = extractModel(channelsSchema, 'ChannelSkuComponent');
    const normalized = compact(model);

    assertNoFields(model, ['productOptionId']);
    assert.ok(
      normalized.includes('@@unique([channelSkuId, inventorySkuId])'),
      'Expected one component row per channel SKU and inventory SKU',
    );
    assert.ok(
      normalized.includes(
        'channelSku ChannelListingOption @relation(fields: [channelSkuId, organizationId], references: [id, organizationId], onDelete: Cascade)',
      ),
      'Expected the channel SKU relation to enforce organization scope',
    );
    assert.ok(
      normalized.includes(
        'inventorySku InventorySku @relation(fields: [inventorySkuId, organizationId], references: [id, organizationId], onDelete: Restrict)',
      ),
      'Expected the inventory SKU relation to enforce organization scope',
    );
  });
});
