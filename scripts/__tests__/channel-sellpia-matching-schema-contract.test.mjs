import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const channels = readFileSync(join(repoRoot, 'prisma/models/channels.prisma'), 'utf8');

function modelBlock(source, modelName) {
  const block = source.match(new RegExp(`model ${modelName}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(block, `Expected model ${modelName}`);
  return block;
}

describe('channel Sellpia final schema contract', () => {
  it('retains channel account provider identity and collection configuration', () => {
    const account = modelBlock(channels, 'ChannelAccount');
    for (const field of ['externalAccountId', 'sellerId', 'vendorId', 'config']) {
      assert.match(account, new RegExp(`^\\s*${field}\\s+`, 'm'));
    }
  });

  it('requires account-owned parent listings with source-candidate identity', () => {
    const listing = modelBlock(channels, 'ChannelListing');
    assert.match(listing, /^\s*channelAccountId\s+String\s+/m);
    assert.match(listing, /^\s*sourceCandidateId\s+String\?/m);
    assert.match(listing, /^\s*rawJson\s+Json\?/m);
    assert.match(listing, /^\s*lastImportRunId\s+String\?/m);
    assert.match(listing, /@@index\(\[sourceCandidateId\]\)/);
    assert.doesNotMatch(listing, /^\s*(?:masterProductId|masterId|channel|channelPrice|currentStock|barcode|purchasePrice|salePrice)\s+/m);
    assert.match(listing, /@@unique\(\[organizationId, channelAccountId, externalId\]\)/);
  });

  it('keeps marketplace option metadata independent from physical stock and variants', () => {
    const option = modelBlock(channels, 'ChannelListingOption');
    for (const field of [
      'externalOptionId',
      'itemName',
      'salePrice',
      'sellerSku',
      'barcode',
      'attributesJson',
      'rawJson',
      'inventoryComponents',
    ]) {
      assert.match(option, new RegExp(`^\\s*${field}\\s+`, 'm'));
    }
    assert.doesNotMatch(option, /^\s*(?:optionId|channelAccountId|isUnmatched|mappingStatus|currentStock)\s+/m);
    assert.doesNotMatch(option, /^\s*productVariantId\s+/m);
  });

  it('stores the inventory consumption recipe only on the channel listing option', () => {
    const component = modelBlock(channels, 'ChannelListingOptionInventoryComponent');
    for (const field of ['channelListingOptionId', 'masterProductId', 'quantity']) {
      assert.match(component, new RegExp(`^\\s*${field}\\s+`, 'm'));
    }
    assert.match(component, /@@unique\(\[channelListingOptionId, masterProductId\]\)/);
    assert.doesNotMatch(channels, /model ChannelSkuComponent\b/);
    assert.doesNotMatch(channels, /channel_sku_components/);
    assert.doesNotMatch(channels, /model ProductVariant\b/);
    assert.doesNotMatch(channels, /model ProductVariantComponent\b/);
  });

  it('retains raw channel scrape evidence for selective reset replay', () => {
    const scrapeRun = modelBlock(channels, 'ChannelScrapeRun');
    const scrapeSnapshot = modelBlock(channels, 'ChannelScrapeSnapshot');

    assert.match(scrapeRun, /^\s*channelAccountId\s+String\s+/m);
    assert.match(scrapeRun, /^\s*metaJson\s+Json\?/m);
    assert.match(scrapeRun, /^\s*errorJson\s+Json\?/m);
    assert.match(scrapeSnapshot, /^\s*scrapeRunId\s+String\?/m);
    assert.match(scrapeSnapshot, /^\s*rawJson\s+Json\s+/m);
    assert.match(scrapeSnapshot, /^\s*normalizedJson\s+Json\?/m);
  });
});
