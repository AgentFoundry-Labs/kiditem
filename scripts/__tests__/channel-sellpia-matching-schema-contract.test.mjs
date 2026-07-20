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
  it('retains channel account provider identity and collection configuration', () => {
    const account = modelBlock(core, 'ChannelAccount');
    for (const field of ['externalAccountId', 'sellerId', 'vendorId', 'config']) {
      assert.match(account, new RegExp(`^\\s*${field}\\s+`, 'm'));
    }
  });

  it('requires account-owned parent listings with a nullable operating-product link', () => {
    const listing = modelBlock(core, 'ChannelListing');
    assert.match(listing, /^\s*channelAccountId\s+String\s+/m);
    assert.match(listing, /^\s*masterProductId\s+String\?/m);
    assert.match(listing, /^\s*rawJson\s+Json\?/m);
    assert.match(listing, /^\s*lastImportRunId\s+String\?/m);
    assert.doesNotMatch(listing, /^\s*(?:masterId|channel|channelPrice|currentStock|barcode|purchasePrice|salePrice)\s+/m);
    assert.match(listing, /@@unique\(\[organizationId, channelAccountId, externalId\]\)/);
  });

  it('keeps marketplace SKU metadata independent from physical stock with a nullable variant link', () => {
    const option = modelBlock(core, 'ChannelListingOption');
    for (const field of [
      'externalOptionId',
      'itemName',
      'salePrice',
      'sellerSku',
      'barcode',
      'productVariantId',
      'attributesJson',
      'rawJson',
    ]) {
      assert.match(option, new RegExp(`^\\s*${field}\\s+`, 'm'));
    }
    assert.doesNotMatch(option, /^\s*(?:optionId|channelAccountId|isUnmatched|mappingStatus|currentStock)\s+/m);
  });

  it('removes channel-owned recipes in favor of the linked variant recipe', () => {
    assert.doesNotMatch(channels, /model ChannelSkuComponent\b/);
    assert.doesNotMatch(channels, /channel_sku_components/);
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
