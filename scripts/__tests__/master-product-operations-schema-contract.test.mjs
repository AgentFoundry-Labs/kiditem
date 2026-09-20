import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const core = readFileSync(join(repoRoot, 'prisma/models/core.prisma'), 'utf8');
const inventory = readFileSync(join(repoRoot, 'prisma/models/inventory.prisma'), 'utf8');
const channels = readFileSync(join(repoRoot, 'prisma/models/channels.prisma'), 'utf8');
const supply = readFileSync(join(repoRoot, 'prisma/models/supply.prisma'), 'utf8');
const schema = [core, inventory, channels, supply].join('\n');

function modelBlock(source, modelName) {
  const block = source.match(new RegExp(`model ${modelName}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(block, `Expected model ${modelName}`);
  return block;
}

function expectFields(block, fields) {
  for (const field of fields) {
    assert.match(block, new RegExp(`^\\s*${field}\\s+`, 'm'), `Expected field ${field}`);
  }
}

function rejectFields(block, fields) {
  assert.doesNotMatch(block, new RegExp(`^\\s*(?:${fields.join('|')})\\s+`, 'm'));
}

describe('master-product operations final schema contract', () => {
  it('makes MasterProduct the organization-scoped canonical inventory product', () => {
    const master = modelBlock(core, 'MasterProduct');
    expectFields(master, [
      'organizationId',
      'code',
      'name',
      'description',
      'category',
      'brand',
      'tags',
      'imageUrls',
      'adBudgetLimit',
      'isActive',
      'originChannelListingId',
      'channelListings',
      'originChannelListing',
      'provenanceCandidate',
      'inventorySkus',
    ]);
    assert.match(master, /@@unique\(\[organizationId, code\]\)/);
    assert.match(master, /@@unique\(\[id, organizationId\]/);
    assert.match(master, /@@unique\(\[originChannelListingId, organizationId\]\)/);
    assert.match(
      master,
      /@relation\("ChannelListingOriginProduct", fields: \[originChannelListingId, organizationId\], references: \[id, organizationId\]/,
    );
    rejectFields(master, [
      'abcGrade',
      'profitTag',
      'adTier',
      'healthScore',
      'healthUpdatedAt',
      'optionName',
      'barcode',
      'currentStock',
      'purchasePrice',
      'salePrice',
      'rawJson',
      'lastImportRunId',
    ]);
  });

  it('removes the redundant operating-option layer beneath MasterProduct', () => {
    assert.doesNotMatch(core, /model ProductVariant\b/);
    assert.doesNotMatch(core, /model ProductVariantComponent\b/);
    assert.doesNotMatch(core, /product_variants/);
    assert.doesNotMatch(core, /product_variant_components/);
  });

  it('stores one direct positive component recipe per channel option and Sellpia SKU', () => {
    const component = modelBlock(core, 'ChannelListingOptionInventoryComponent');
    expectFields(component, [
      'organizationId',
      'channelListingOptionId',
      'sellpiaInventorySkuId',
      'quantity',
      'channelListingOption',
    ]);
    assert.match(component, /^\s*quantity\s+Int\s*$/m);
    assert.match(
      component,
      /@@unique\(\[channelListingOptionId, sellpiaInventorySkuId\]\)/,
    );
    assert.match(
      component,
      /@relation\(fields: \[channelListingOptionId, organizationId\], references: \[id, organizationId\]/,
    );
    rejectFields(component, ['sellpiaInventorySku']);
    assert.match(component, /@@index\(\[(?:organizationId, )?sellpiaInventorySkuId\]/);
  });

  it('makes SellpiaInventorySku a physical source SKU owned by at most one canonical MasterProduct', () => {
    const sku = modelBlock(inventory, 'SellpiaInventorySku');
    expectFields(sku, [
      'organizationId',
      'masterProductId',
      'code',
      'name',
      'optionName',
      'barcode',
      'currentStock',
      'purchasePrice',
      'salePrice',
      'isActive',
      'rawJson',
      'lastImportRunId',
      'lastImportRun',
      'masterProduct',
    ]);
    assert.match(sku, /@@unique\(\[organizationId, code\]\)/);
    assert.match(sku, /@@unique\(\[id, organizationId\]/);
    assert.match(sku, /@@map\("sellpia_inventory_skus"\)/);
    assert.match(sku, /@relation\("SellpiaInventorySkuLastImport"/);
    assert.match(
      sku,
      /@relation\("MasterProductInventorySkus", fields: \[masterProductId, organizationId\], references: \[id, organizationId\]/,
    );
    assert.match(sku, /@@index\(\[organizationId, masterProductId\]/);
    assert.match(sku, /@@unique\(\[organizationId, masterProductId\]/);
  });

  it('keeps only the channel product link nullable and organization-fenced', () => {
    const listing = modelBlock(core, 'ChannelListing');
    const option = modelBlock(core, 'ChannelListingOption');
    assert.match(listing, /^\s*masterProductId\s+String\?/m);
    assert.match(
      listing,
      /@relation\("ChannelListingOperationalProduct", fields: \[masterProductId, organizationId\], references: \[id, organizationId\]/,
    );
    assert.match(listing, /^\s*originatedMasterProduct\s+MasterProduct\?/m);
    assert.match(option, /^\s*inventoryComponents\s+ChannelListingOptionInventoryComponent\[\]/m);
    rejectFields(option, ['productVariantId', 'mappingStatus']);
  });

  it('removes every channel-owned component recipe', () => {
    assert.doesNotMatch(schema, /model ChannelSkuComponent\b/);
    assert.doesNotMatch(schema, /channel_sku_components/);
    assert.doesNotMatch(schema, /^\s*channelSkuComponents\s+/m);
  });

  it('preserves indexed physical SKU ids without deletion-blocking relations', () => {
    const references = [
      [supply, 'SupplierProduct'],
      [supply, 'PurchaseOrderItem'],
      [inventory, 'StockTransfer'],
      [inventory, 'ReturnTransfer'],
    ];
    for (const [source, modelName] of references) {
      const block = modelBlock(source, modelName);
      assert.match(block, /^\s*sellpiaInventorySkuId\s+String\s+/m);
      rejectFields(block, ['sellpiaInventorySku']);
      assert.match(block, /@@index\(\[(?:organizationId, )?sellpiaInventorySkuId\]/);
      rejectFields(block, ['masterProductId', 'masterProduct']);
    }
  });
});
