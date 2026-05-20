import type { Prisma } from '@prisma/client';
import type { DataMigration } from '../types';

export const backfillChannelListingAccounts: DataMigration = {
  id: 'v0.1.2:001_backfill_channel_listing_accounts',
  releaseVersion: '0.1.2',
  name: 'Backfill ChannelListing.channelAccountId from active channel accounts',
  async run(tx) {
    const hasListings = await hasTable(tx, 'channel_listings');
    const hasAccounts = await hasTable(tx, 'channel_accounts');
    const hasListingAccountId = await hasColumn(tx, 'channel_listings', 'channel_account_id');

    if (!hasListings || !hasAccounts || !hasListingAccountId) {
      return {
        affectedRows: 0,
        details: {
          skipped: 'channel listing account schema is not available',
        },
      };
    }

    const affectedRows = await tx.$executeRaw`
      WITH account_candidates AS (
        SELECT
          ca.id,
          ca.organization_id,
          ca.channel,
          ca.is_primary,
          COUNT(*) OVER (
            PARTITION BY ca.organization_id, ca.channel
          ) AS account_count,
          ROW_NUMBER() OVER (
            PARTITION BY ca.organization_id, ca.channel
            ORDER BY ca.is_primary DESC, ca.updated_at DESC, ca.id DESC
          ) AS row_num
        FROM channel_accounts ca
        WHERE ca.status = 'active'
      ),
      selected_accounts AS (
        SELECT *
        FROM account_candidates
        WHERE row_num = 1
          AND (is_primary = true OR account_count = 1)
      )
      UPDATE channel_listings cl
      SET channel_account_id = selected_accounts.id
      FROM selected_accounts
      WHERE cl.organization_id = selected_accounts.organization_id
        AND cl.channel = selected_accounts.channel
        AND cl.channel_account_id IS NULL
        AND cl.is_deleted = false
    `;

    return {
      affectedRows,
      details: {
        backfilled: affectedRows,
      },
    };
  },
};

async function hasTable(tx: Prisma.TransactionClient, tableName: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function hasColumn(
  tx: Prisma.TransactionClient,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}
