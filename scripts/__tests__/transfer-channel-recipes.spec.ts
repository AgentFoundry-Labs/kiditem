import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHANNEL_RECIPE_TRANSFER_SCHEMA,
  ChannelRecipeTransferArtifactSchema,
  canonicalComponents,
  cookieHeaderFromContent,
  resolveArtifactRecipes,
} from '../transfer-channel-recipes';

const variantId = '11111111-1111-4111-8111-111111111111';
const masterProductId = '22222222-2222-4222-8222-222222222222';

function artifact(components = [{ sellpiaSkuCode: 'SKU-1', quantity: 1 }]) {
  return ChannelRecipeTransferArtifactSchema.parse({
    schemaVersion: CHANNEL_RECIPE_TRANSFER_SCHEMA,
    channel: 'coupang',
    exportedAt: '2026-07-23T00:00:00.000Z',
    recipes: [{
      listingExternalId: 'LISTING-1',
      optionExternalId: 'OPTION-1',
      components,
    }],
  });
}

function queue() {
  return {
    products: [],
    options: [{
      listing: { externalId: 'LISTING-1', masterProductId },
      option: { externalOptionId: 'OPTION-1', productVariantId: variantId },
    }],
    counts: {},
  } as never;
}

describe('channel recipe transfer helpers', () => {
  it('canonicalizes component order without changing quantities', () => {
    expect(canonicalComponents([
      { sellpiaSkuCode: ' SKU-B ', quantity: 2 },
      { sellpiaSkuCode: 'SKU-A', quantity: 1 },
    ])).toEqual([
      { sellpiaSkuCode: 'SKU-A', quantity: 1 },
      { sellpiaSkuCode: 'SKU-B', quantity: 2 },
    ]);
  });

  it('resolves stable channel identities without carrying local UUIDs', () => {
    expect(resolveArtifactRecipes({
      artifact: artifact(),
      queue: queue(),
    })).toEqual([{
      productVariantId: variantId,
      components: [{ sellpiaSkuCode: 'SKU-1', quantity: 1 }],
    }]);
  });

  it('rejects duplicate external identities and duplicate component codes', () => {
    const base = {
      schemaVersion: CHANNEL_RECIPE_TRANSFER_SCHEMA,
      channel: 'coupang',
      exportedAt: '2026-07-23T00:00:00.000Z',
    };
    expect(() => ChannelRecipeTransferArtifactSchema.parse({
      ...base,
      recipes: [artifact().recipes[0], artifact().recipes[0]],
    })).toThrow(/external identity pairs/);
    expect(() => ChannelRecipeTransferArtifactSchema.parse({
      ...base,
      recipes: [{
        listingExternalId: 'LISTING-1',
        optionExternalId: 'OPTION-1',
        components: [
          { sellpiaSkuCode: 'SKU-1', quantity: 1 },
          { sellpiaSkuCode: 'SKU-1', quantity: 2 },
        ],
      }],
    })).toThrow(/distinct Sellpia SKU codes/);
  });

  it('accepts ordinary and HttpOnly Netscape cookie jar rows', () => {
    expect(cookieHeaderFromContent([
      '# Netscape HTTP Cookie File',
      '#HttpOnly_.example.com\tTRUE\t/\tTRUE\t0\tsession\tprivate-value',
      '.example.com\tTRUE\t/\tTRUE\t0\tcsrf\tpublic-value',
    ].join('\n'))).toBe('session=private-value; csrf=public-value');
  });

  it('keeps the shared reviewed Rocket mapping artifact schema-valid', () => {
    const reviewed = ChannelRecipeTransferArtifactSchema.parse(JSON.parse(
      readFileSync(path.resolve(
        process.cwd(),
        'scripts/channel-recipe-mappings/rocket-sellpia-reviewed-2026-07-24.json',
      ), 'utf8'),
    ));

    expect(reviewed.channel).toBe('rocket');
    expect(reviewed.recipes).toHaveLength(26);
    expect(reviewed.recipes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        listingExternalId: '14736823',
        components: [{ sellpiaSkuCode: '7599-1', quantity: 36 }],
      }),
      expect.objectContaining({
        listingExternalId: '59261814',
        components: [{ sellpiaSkuCode: '10061-1', quantity: 6 }],
      }),
      expect.objectContaining({
        listingExternalId: '60348929',
        components: [{ sellpiaSkuCode: '10432-1', quantity: 2 }],
      }),
    ]));
  });
});
