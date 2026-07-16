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
  it('makes MasterProduct the organization-scoped operating product', () => {
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
      'abcGrade',
      'profitTag',
      'adTier',
      'adBudgetLimit',
      'healthScore',
      'healthUpdatedAt',
      'isActive',
      'variants',
      'channelListings',
      'provenanceCandidate',
      'processingCosts',
    ]);
    assert.match(master, /@@unique\(\[organizationId, code\]\)/);
    assert.match(master, /@@unique\(\[id, organizationId\]/);
    rejectFields(master, [
      'optionName',
      'barcode',
      'currentStock',
      'purchasePrice',
      'salePrice',
      'rawJson',
      'lastImportRunId',
    ]);
  });

  it('defines reusable organization-fenced product variants', () => {
    const variant = modelBlock(core, 'ProductVariant');
    expectFields(variant, [
      'organizationId',
      'masterProductId',
      'code',
      'name',
      'optionLabel',
      'isDefault',
      'isActive',
      'masterProduct',
      'components',
      'channelListingOptions',
    ]);
    assert.match(variant, /@@unique\(\[organizationId, code\]\)/);
    assert.match(variant, /@@unique\(\[id, organizationId\]/);
    assert.match(
      variant,
      /@@unique\(\[masterProductId\][^\n]+map: "product_variants_active_default_master_key"[^\n]+is_default = true AND is_active = true/,
    );
    assert.match(
      variant,
      /@relation\(fields: \[masterProductId, organizationId\], references: \[id, organizationId\]/,
    );
  });

  it('stores one central positive component recipe per variant and Sellpia SKU', () => {
    const component = modelBlock(core, 'ProductVariantComponent');
    expectFields(component, [
      'organizationId',
      'productVariantId',
      'sellpiaInventorySkuId',
      'quantity',
      'source',
      'confirmedBy',
      'confirmedAt',
      'productVariant',
      'sellpiaInventorySku',
    ]);
    assert.match(component, /^\s*quantity\s+Int[^\n]*positive/m);
    assert.match(component, /manual \| deterministic/);
    assert.match(
      component,
      /@@unique\(\[productVariantId, sellpiaInventorySkuId\]\)/,
    );
    assert.match(
      component,
      /@relation\(fields: \[productVariantId, organizationId\], references: \[id, organizationId\]/,
    );
    assert.match(
      component,
      /@relation\(fields: \[sellpiaInventorySkuId, organizationId\], references: \[id, organizationId\]/,
    );
  });

  it('makes SellpiaInventorySku the sole physical Sellpia stock owner', () => {
    const sku = modelBlock(inventory, 'SellpiaInventorySku');
    expectFields(sku, [
      'organizationId',
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
      'variantComponents',
    ]);
    assert.match(sku, /@@unique\(\[organizationId, code\]\)/);
    assert.match(sku, /@@unique\(\[id, organizationId\]/);
    assert.match(sku, /@@map\("sellpia_inventory_skus"\)/);
    assert.match(sku, /@relation\("SellpiaInventorySkuLastImport"/);
    rejectFields(sku, ['masterProductId']);
  });

  it('keeps channel product and option links nullable and organization-fenced', () => {
    const listing = modelBlock(core, 'ChannelListing');
    const option = modelBlock(core, 'ChannelListingOption');
    assert.match(listing, /^\s*masterProductId\s+String\?/m);
    assert.match(
      listing,
      /@relation\(fields: \[masterProductId, organizationId\], references: \[id, organizationId\]/,
    );
    assert.match(option, /^\s*productVariantId\s+String\?/m);
    assert.match(
      option,
      /@relation\(fields: \[productVariantId, organizationId\], references: \[id, organizationId\]/,
    );
    rejectFields(option, ['mappingStatus']);
  });

  it('removes every channel-owned component recipe', () => {
    assert.doesNotMatch(schema, /model ChannelSkuComponent\b/);
    assert.doesNotMatch(schema, /channel_sku_components/);
    assert.doesNotMatch(schema, /^\s*channelSkuComponents\s+/m);
  });

  it('points every physical supply and movement reference at SellpiaInventorySku', () => {
    const references = [
      [supply, 'SupplierProduct'],
      [supply, 'PurchaseOrderItem'],
      [inventory, 'StockTransfer'],
      [inventory, 'PickingItem'],
      [inventory, 'ReturnTransfer'],
    ];
    for (const [source, modelName] of references) {
      const block = modelBlock(source, modelName);
      assert.match(block, /^\s*sellpiaInventorySkuId\s+String\s+/m);
      assert.match(block, /^\s*sellpiaInventorySku\s+SellpiaInventorySku\s+/m);
      assert.match(
        block,
        /@relation\([^\n]*fields: \[sellpiaInventorySkuId, organizationId\], references: \[id, organizationId\]/,
      );
      rejectFields(block, ['masterProductId', 'masterProduct']);
    }
  });
});
