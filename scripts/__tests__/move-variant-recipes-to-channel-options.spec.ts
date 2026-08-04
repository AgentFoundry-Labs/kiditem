import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataMigrations } from '../data-migrations';

const MIGRATION_ID = 'v0.1.30:003_move_variant_recipes_to_channel_options';

describe('variant recipe contract migration', () => {
  it('runs before schema contraction and preserves option-specific quantities', () => {
    const migration = dataMigrations.find((item) => item.id === MIGRATION_ID);
    expect(migration).toMatchObject({
      id: MIGRATION_ID,
      releaseVersion: '0.1.30',
      phase: 'pre-schema',
    });

    const source = readFileSync(resolve(
      import.meta.dirname,
      '../data-migrations/v0.1.30/003_move_variant_recipes_to_channel_options.ts',
    ), 'utf8');
    expect(source).toContain('CREATE TABLE IF NOT EXISTS channel_listing_option_inventory_components');
    expect(source).toContain('JOIN product_variant_components');
    expect(source).toContain('component.quantity');
    expect(source).toContain('ON CONFLICT (channel_listing_option_id, sellpia_inventory_sku_id)');
    expect(source).toContain('legacyRecipeCount');
    expect(source).toContain('directRecipeCount');
  });
});
