import type { DataMigration } from '../types';

export const moveVariantRecipesToChannelOptions: DataMigration = {
  id: 'v0.1.30:003_move_variant_recipes_to_channel_options',
  releaseVersion: '0.1.30',
  name: 'Move variant inventory recipes to channel listing options',
  phase: 'pre-schema',
  async run(tx) {
    await tx.$executeRaw`
      CREATE TABLE IF NOT EXISTS channel_listing_option_inventory_components (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        channel_listing_option_id uuid NOT NULL,
        sellpia_inventory_sku_id uuid NOT NULL,
        quantity integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT channel_option_inventory_components_org_fk
          FOREIGN KEY (organization_id)
          REFERENCES organizations(id)
          ON DELETE CASCADE,
        CONSTRAINT channel_option_inventory_components_option_fk
          FOREIGN KEY (channel_listing_option_id, organization_id)
          REFERENCES channel_listing_options(id, organization_id)
          ON DELETE CASCADE,
        CONSTRAINT channel_option_inventory_components_sku_fk
          FOREIGN KEY (sellpia_inventory_sku_id, organization_id)
          REFERENCES sellpia_inventory_skus(id, organization_id)
          ON DELETE RESTRICT,
        CONSTRAINT channel_option_inventory_components_quantity_positive
          CHECK (quantity > 0),
        CONSTRAINT channel_option_inventory_components_option_sku_key
          UNIQUE (channel_listing_option_id, sellpia_inventory_sku_id)
      )
    `;
    await tx.$executeRaw`
      CREATE INDEX IF NOT EXISTS channel_option_inventory_components_org_option_idx
      ON channel_listing_option_inventory_components (
        organization_id,
        channel_listing_option_id
      )
    `;
    await tx.$executeRaw`
      CREATE INDEX IF NOT EXISTS channel_option_inventory_components_org_sku_idx
      ON channel_listing_option_inventory_components (
        organization_id,
        sellpia_inventory_sku_id
      )
    `;

    const affectedRows = await tx.$executeRaw`
      INSERT INTO channel_listing_option_inventory_components (
        id,
        organization_id,
        channel_listing_option_id,
        sellpia_inventory_sku_id,
        quantity,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        option.organization_id,
        option.id,
        component.sellpia_inventory_sku_id,
        component.quantity,
        component.created_at,
        NOW()
      FROM channel_listing_options option
      JOIN product_variant_components component
        ON component.organization_id = option.organization_id
       AND component.product_variant_id = option.product_variant_id
      WHERE option.product_variant_id IS NOT NULL
      ON CONFLICT (channel_listing_option_id, sellpia_inventory_sku_id)
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        updated_at = NOW()
    `;

    const [{ count: legacyRecipeCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM channel_listing_options option
      JOIN product_variant_components component
        ON component.organization_id = option.organization_id
       AND component.product_variant_id = option.product_variant_id
      WHERE option.product_variant_id IS NOT NULL
    `;
    const [{ count: directRecipeCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM channel_listing_options option
      JOIN product_variant_components legacy
        ON legacy.organization_id = option.organization_id
       AND legacy.product_variant_id = option.product_variant_id
      JOIN channel_listing_option_inventory_components direct
        ON direct.organization_id = option.organization_id
       AND direct.channel_listing_option_id = option.id
       AND direct.sellpia_inventory_sku_id = legacy.sellpia_inventory_sku_id
       AND direct.quantity = legacy.quantity
      WHERE option.product_variant_id IS NOT NULL
    `;
    if (legacyRecipeCount !== directRecipeCount) {
      throw new Error(
        `Direct channel-option recipe backfill mismatch: legacy=${legacyRecipeCount} direct=${directRecipeCount}`,
      );
    }

    return {
      affectedRows,
      details: {
        legacyRecipeCount: legacyRecipeCount.toString(),
        directRecipeCount: directRecipeCount.toString(),
      },
    };
  },
};
