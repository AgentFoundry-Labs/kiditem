import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const core = readFileSync(join(repoRoot, 'prisma/models/core.prisma'), 'utf8');
const channels = readFileSync(join(repoRoot, 'prisma/models/channels.prisma'), 'utf8');

function modelBlock(source, modelName) {
  const block = source.match(new RegExp(`model ${modelName}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(block, `Expected model ${modelName}`);
  return block;
}

describe('channel Sellpia final schema contract', () => {
  it('requires account-owned parent listings without duplicated channel or master identity', () => {
    const listing = modelBlock(core, 'ChannelListing');
    assert.match(listing, /^\s*channelAccountId\s+String\s+/m);
    assert.match(listing, /^\s*rawJson\s+Json\?/m);
    assert.match(listing, /^\s*lastImportRunId\s+String\?/m);
    assert.doesNotMatch(listing, /^\s*(?:masterId|channel|channelPrice)\s+/m);
    assert.match(listing, /@@unique\(\[organizationId, channelAccountId, externalId\]\)/);
  });

  it('keeps marketplace SKU metadata independent from physical stock', () => {
    const option = modelBlock(core, 'ChannelListingOption');
    for (const field of [
      'externalOptionId',
      'itemName',
      'salePrice',
      'sellerSku',
      'barcode',
      'mappingStatus',
      'attributesJson',
      'rawJson',
    ]) {
      assert.match(option, new RegExp(`^\\s*${field}\\s+`, 'm'));
    }
    assert.doesNotMatch(option, /^\s*(?:optionId|channelAccountId|isUnmatched)\s+/m);
  });

  it('stores bundle recipes only as direct MasterProduct component quantities', () => {
    const component = modelBlock(channels, 'ChannelSkuComponent');
    assert.match(component, /^\s*masterProductId\s+String\s+/m);
    assert.match(component, /^\s*quantity\s+Int\s*$/m);
    assert.match(component, /^\s*mappingSource\s+String\s+/m);
    assert.doesNotMatch(component, /InventorySku|ProductOption|legacy_migrated/);
    assert.match(component, /@@unique\(\[channelSkuId, masterProductId\]\)/);
  });
});
