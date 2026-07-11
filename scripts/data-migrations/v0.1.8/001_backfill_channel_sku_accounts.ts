import type { DataMigration } from '../types';

export const backfillChannelSkuAccounts: DataMigration = {
  id: 'v0.1.8:001_backfill_channel_sku_accounts',
  releaseVersion: '0.1.8',
  name: 'Backfill ChannelListingOption accounts from same-organization parents',
  async run(tx) {
    const affectedRows = await tx.$executeRaw`
      UPDATE channel_listing_options AS sku
      SET channel_account_id = product.channel_account_id
      FROM channel_listings AS product
      WHERE sku.listing_id = product.id
        AND sku.organization_id = product.organization_id
        AND sku.channel_account_id IS NULL
        AND product.channel_account_id IS NOT NULL
    `;

    const mismatches = await tx.$queryRaw<Array<{
      channelSkuId: string;
      channelSkuAccountId: string;
      parentChannelAccountId: string | null;
    }>>`
      SELECT sku.id AS "channelSkuId",
             sku.channel_account_id AS "channelSkuAccountId",
             product.channel_account_id AS "parentChannelAccountId"
      FROM channel_listing_options AS sku
      JOIN channel_listings AS product
        ON product.id = sku.listing_id
      WHERE sku.channel_account_id IS NOT NULL
        AND sku.channel_account_id IS DISTINCT FROM product.channel_account_id
      ORDER BY sku.id
      LIMIT 20
    `;
    if (mismatches.length > 0) {
      throw new Error(
        `Channel SKU account differs from its parent for ${mismatches.length} example(s): ${JSON.stringify(mismatches)}`,
      );
    }

    return {
      affectedRows,
      details: {
        backfilledChannelSkuAccounts: affectedRows,
      },
    };
  },
};
