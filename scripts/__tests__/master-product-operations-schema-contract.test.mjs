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
  it('keeps only the approved source-product scalar fields', () => {
    const master = modelBlock(core, 'MasterProduct');
    const scalarNames = [...master.matchAll(/^\s*(\w+)\s+(?:String|Int|DateTime|Boolean|Json|BigInt|Decimal)(?:\?|\[\])?(?=\s|$)/gm)]
      .map((match) => match[1]).sort();
    assert.deepEqual(scalarNames, [
      'id', 'organizationId', 'code', 'sourceAccountKey', 'sourceProductCode',
      'sourceOptionCode', 'name', 'optionName', 'barcode', 'currentStock',
      'purchasePrice', 'imageUrls', 'createdAt', 'updatedAt',
    ].sort());
    assert.match(master, /^\s*code\s+String\s+.*@unique/m);
    assert.match(master, /^\s*purchasePrice\s+Int\?/m);
    for (const field of ['sourceAccountKey', 'sourceProductCode', 'sourceOptionCode']) {
      assert.match(master, new RegExp(`^\\s*${field}\\s+String\\s`, 'm'));
    }
    assert.match(master, /@@unique\(\[id, organizationId\]/);
  });

  it('removes the redundant operating-option layer beneath MasterProduct', () => {
    assert.doesNotMatch(core, /model ProductVariant\b/);
    assert.doesNotMatch(core, /model ProductVariantComponent\b/);
    assert.doesNotMatch(core, /product_variants/);
    assert.doesNotMatch(core, /product_variant_components/);
  });

  it('stores one direct positive component recipe per channel option and MasterProduct', () => {
    const component = modelBlock(core, 'ChannelListingOptionInventoryComponent');
    expectFields(component, [
      'organizationId',
      'channelListingOptionId',
      'masterProductId',
      'quantity',
      'channelListingOption',
    ]);
    assert.match(component, /^\s*quantity\s+Int\s*$/m);
    assert.match(
      component,
      /@@unique\(\[channelListingOptionId, masterProductId\]\)/,
    );
    assert.match(
      component,
      /@relation\(fields: \[channelListingOptionId, organizationId\], references: \[id, organizationId\]/,
    );
    rejectFields(component, ['sellpiaInventorySku', 'sellpiaInventorySkuId']);
    assert.match(component, /@@index\(\[(?:organizationId, )?masterProductId\]/);
  });

  it('stores live source stock on MasterProduct and removes the live Sellpia SKU model', () => {
    const master = modelBlock(core, 'MasterProduct');
    expectFields(master, [
      'sourceAccountKey',
      'sourceProductCode',
      'sourceOptionCode',
      'optionName',
      'barcode',
      'currentStock',
      'purchasePrice',
    ]);
    assert.match(master, /@@unique\(\[organizationId, sourceAccountKey, sourceProductCode, sourceOptionCode\]/);
    assert.doesNotMatch(inventory, /model SellpiaInventorySku\s*\{/);
    assert.doesNotMatch(core, /inventorySkus\s+SellpiaInventorySku\[\]/);
  });

  it('keeps sourcing references on listings while option recipes own product mapping', () => {
    const listing = modelBlock(core, 'ChannelListing');
    const option = modelBlock(core, 'ChannelListingOption');
    assert.match(listing, /^\s*sourceCandidateId\s+String\?/m);
    assert.match(listing, /@@index\(\[sourceCandidateId\]/);
    rejectFields(listing, ['masterProductId', 'masterProduct', 'originatedMasterProduct']);
    assert.match(option, /^\s*inventoryComponents\s+ChannelListingOptionInventoryComponent\[\]/m);
    rejectFields(option, ['productVariantId', 'mappingStatus']);
  });

  it('removes the duplicate legacy component model', () => {
    assert.doesNotMatch(schema, /model ChannelSkuComponent\b/);
    assert.doesNotMatch(schema, /channel_sku_components/);
    assert.doesNotMatch(schema, /^\s*channelSkuComponents\s+/m);
  });

  it('removes legacy SupplierProduct SKU aliases while preserving order and transfer links', () => {
    const supplierProduct = modelBlock(supply, 'SupplierProduct');
    expectFields(supplierProduct, ['masterProductId', 'supplyPrice', 'isPrimary']);
    rejectFields(supplierProduct, [
      'legacySellpiaInventorySkuId',
      'sellpiaInventorySkuId',
      'minOrderQty',
      'memo',
    ]);
    assert.match(supplierProduct, /@@index\(\[organizationId, masterProductId\]/);

    const references = [
      [supply, 'PurchaseOrderItem'],
      [inventory, 'StockTransfer'],
      [inventory, 'ReturnTransfer'],
    ];
    for (const [source, modelName] of references) {
      const block = modelBlock(source, modelName);
      assert.match(block, /^\s*legacySellpiaInventorySkuId\s+String\?\s+/m);
      assert.match(block, /^\s*masterProductId\s+String\?/m);
      rejectFields(block, ['sellpiaInventorySku', 'masterProduct']);
      assert.match(block, /@@index\(\[(?:organizationId, )?legacySellpiaInventorySkuId\]/);
      assert.match(block, /@@index\(\[organizationId, masterProductId\]/);
    }
  });
});
