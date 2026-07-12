import type { DataMigration } from '../types';

type OwnershipViolation = Record<string, unknown>;

export const backfillChannelSkuAccounts: DataMigration = {
  id: 'v0.1.8:002_backfill_channel_sku_accounts',
  releaseVersion: '0.1.8',
  name: 'Backfill ChannelListingOption accounts from tenant-safe parents',
  async run(tx) {
    const orphans = await tx.$queryRaw<OwnershipViolation[]>`
      SELECT sku.id AS "channelSkuId",
             sku.organization_id AS "channelSkuOrganizationId",
             sku.listing_id AS "parentListingId"
      FROM channel_listing_options AS sku
      LEFT JOIN channel_listings AS product
        ON product.id = sku.listing_id
      WHERE product.id IS NULL
      ORDER BY sku.id
      LIMIT 20
    `;
    if (orphans.length > 0) {
      throw new Error(`Orphan channel SKU parent references: ${JSON.stringify(orphans)}`);
    }

    const tenantMismatches = await tx.$queryRaw<OwnershipViolation[]>`
      SELECT sku.id AS "channelSkuId",
             sku.organization_id AS "channelSkuOrganizationId",
             product.id AS "parentListingId",
             product.organization_id AS "parentOrganizationId"
      FROM channel_listing_options AS sku
      JOIN channel_listings AS product
        ON product.id = sku.listing_id
      WHERE sku.organization_id IS DISTINCT FROM product.organization_id
      ORDER BY sku.id
      LIMIT 20
    `;
    if (tenantMismatches.length > 0) {
      throw new Error(`Channel SKU parent tenant mismatch: ${JSON.stringify(tenantMismatches)}`);
    }

    const affectedRows = await tx.$executeRaw`
      UPDATE channel_listing_options AS sku
      SET channel_account_id = product.channel_account_id
      FROM channel_listings AS product
      WHERE sku.listing_id = product.id
        AND sku.organization_id = product.organization_id
        AND sku.channel_account_id IS NULL
        AND product.channel_account_id IS NOT NULL
    `;

    const accountlessChildren = await tx.$queryRaw<OwnershipViolation[]>`
      SELECT sku.id AS "channelSkuId",
             sku.organization_id AS "organizationId",
             product.channel_account_id AS "parentChannelAccountId"
      FROM channel_listing_options AS sku
      JOIN channel_listings AS product
        ON product.id = sku.listing_id
       AND product.organization_id = sku.organization_id
      WHERE sku.channel_account_id IS NULL
        AND product.channel_account_id IS NOT NULL
      ORDER BY sku.id
      LIMIT 20
    `;
    if (accountlessChildren.length > 0) {
      throw new Error(
        `Channel SKU account backfill left accountless children: ${JSON.stringify(accountlessChildren)}`,
      );
    }

    const mismatches = await tx.$queryRaw<OwnershipViolation[]>`
      SELECT sku.id AS "channelSkuId",
             sku.organization_id AS "organizationId",
             sku.channel_account_id AS "channelSkuAccountId",
             product.channel_account_id AS "parentChannelAccountId"
      FROM channel_listing_options AS sku
      JOIN channel_listings AS product
        ON product.id = sku.listing_id
       AND product.organization_id = sku.organization_id
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
