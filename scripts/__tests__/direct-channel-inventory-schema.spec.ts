import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const coreSchema = readFileSync(resolve(root, 'prisma/models/core.prisma'), 'utf8');
const channelsSchema = readFileSync(resolve(root, 'prisma/models/channels.prisma'), 'utf8');
const inventorySchema = readFileSync(resolve(root, 'prisma/models/inventory.prisma'), 'utf8');
const supplySchema = readFileSync(resolve(root, 'prisma/models/supply.prisma'), 'utf8');

describe('direct channel inventory Prisma contract', () => {
  it('keeps one option-owned inventory component and removes operating variants', () => {
    expect(channelsSchema).toContain('model ChannelListingOptionInventoryComponent');
    expect(channelsSchema).toContain('channelListingOptionId String');
    expect(channelsSchema).toContain('masterProductId        String');
    expect(coreSchema).not.toContain('model ProductVariant {');
    expect(coreSchema).not.toContain('model ProductVariantComponent {');
    expect(coreSchema).not.toContain('productVariantId String?');
    expect(inventorySchema).not.toContain('variantComponents');
    expect(supplySchema).not.toContain('productVariantId');
  });
});
