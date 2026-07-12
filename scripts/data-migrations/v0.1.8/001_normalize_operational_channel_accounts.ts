import type { DataMigration } from '../types';

const EVIDENCE_ORDER = [
  'source_seller_vendor',
  'linked_listing_option',
  'legacy_parent_listing',
  'sole_active_platform',
] as const;

type AccountNormalizationBlocker = {
  issueCode: string;
  rowId: string;
  details?: unknown;
};

export const normalizeOperationalChannelAccounts: DataMigration = {
  id: 'v0.1.8:001_normalize_operational_channel_accounts',
  releaseVersion: '0.1.8',
  name: 'Normalize operational channel accounts before additive account constraints',
  phase: 'pre-schema',
  async run(tx) {
    const blockers = await tx.$queryRaw<AccountNormalizationBlocker[]>`
      WITH account_identity_base AS (
        SELECT account.id,
               account.organization_id,
               account.channel,
               COALESCE(
                 NULLIF(BTRIM(account.external_account_id), ''),
                 NULLIF(BTRIM(account.seller_id), ''),
                 NULLIF(BTRIM(account.vendor_id), '')
               ) AS canonical_identity,
               NULLIF(BTRIM(account.external_account_id), '') AS external_account_id,
               NULLIF(BTRIM(account.seller_id), '') AS seller_id,
               NULLIF(BTRIM(account.vendor_id), '') AS vendor_id,
               account.name,
               account.status,
               account.config,
               account.is_primary,
               account.created_at
        FROM channel_accounts AS account
      ),
      account_identity AS (
        SELECT account.*,
               FIRST_VALUE(account.id) OVER (
                 PARTITION BY account.organization_id, account.channel, account.canonical_identity
                 ORDER BY account.is_primary DESC, account.created_at, account.id
               ) AS canonical_account_id
        FROM account_identity_base AS account
      ),
      conflicting_duplicate_accounts AS (
        SELECT organization_id,
               channel,
               canonical_identity,
               MIN(id::text) AS row_id,
               COUNT(DISTINCT jsonb_build_object(
                 'externalAccountId', external_account_id,
                 'sellerId', seller_id,
                 'vendorId', vendor_id,
                 'name', name,
                 'status', status,
                 'config', config
               )) AS operational_payload_count
        FROM account_identity
        WHERE canonical_identity IS NOT NULL
        GROUP BY organization_id, channel, canonical_identity
        HAVING COUNT(*) > 1
           AND COUNT(DISTINCT jsonb_build_object(
             'externalAccountId', external_account_id,
             'sellerId', seller_id,
             'vendorId', vendor_id,
             'name', name,
             'status', status,
             'config', config
           )) > 1
      ),
      accountless_listing_candidates AS (
        SELECT listing.id AS listing_id,
               account.canonical_account_id AS account_id,
               1 AS priority,
               'source_seller_vendor'::text AS evidence
        FROM channel_listings AS listing
        JOIN account_identity AS account
          ON account.organization_id = listing.organization_id
         AND account.channel = listing.channel
         AND (
           NULLIF(BTRIM(to_jsonb(listing) -> 'raw_json' ->> 'sellerId'), '') = account.seller_id
           OR NULLIF(BTRIM(to_jsonb(listing) -> 'raw_json' ->> 'vendorId'), '') = account.vendor_id
           OR NULLIF(BTRIM(to_jsonb(listing) -> 'delivery_info' ->> 'sellerId'), '') = account.seller_id
           OR NULLIF(BTRIM(to_jsonb(listing) -> 'delivery_info' ->> 'vendorId'), '') = account.vendor_id
         )
        WHERE listing.channel_account_id IS NULL
          AND listing.is_deleted = false

        UNION ALL

        SELECT listing.id,
               linked_account.canonical_account_id,
               2,
               'linked_listing_option'
        FROM channel_listings AS listing
        JOIN channel_listing_options AS target_option
          ON target_option.listing_id = listing.id
         AND target_option.organization_id = listing.organization_id
        JOIN channel_listing_options AS linked_option
          ON linked_option.organization_id = target_option.organization_id
         AND linked_option.id <> target_option.id
         AND target_option.option_id IS NOT NULL
         AND linked_option.option_id = target_option.option_id
        JOIN channel_listings AS linked_listing
          ON linked_listing.id = linked_option.listing_id
         AND linked_listing.organization_id = listing.organization_id
         AND linked_listing.channel = listing.channel
        JOIN account_identity AS linked_account
          ON linked_account.id = linked_listing.channel_account_id
         AND linked_account.organization_id = linked_listing.organization_id
        WHERE listing.channel_account_id IS NULL
          AND listing.is_deleted = false

        UNION ALL

        SELECT listing.id,
               parent_account.canonical_account_id,
               3,
               'legacy_parent_listing'
        FROM channel_listings AS listing
        JOIN channel_listings AS legacy_parent
          ON legacy_parent.organization_id = listing.organization_id
         AND legacy_parent.channel = listing.channel
         AND legacy_parent.master_id = listing.master_id
         AND legacy_parent.id <> listing.id
        JOIN account_identity AS parent_account
          ON parent_account.id = legacy_parent.channel_account_id
         AND parent_account.organization_id = legacy_parent.organization_id
        WHERE listing.channel_account_id IS NULL
          AND listing.master_id IS NOT NULL
          AND listing.is_deleted = false

        UNION ALL

        SELECT listing.id,
               account.canonical_account_id,
               4,
               'sole_active_platform'
        FROM channel_listings AS listing
        JOIN account_identity AS account
          ON account.organization_id = listing.organization_id
         AND account.channel = listing.channel
         AND account.status = 'active'
        WHERE listing.channel_account_id IS NULL
          AND listing.is_deleted = false
          AND 1 = (
            SELECT COUNT(DISTINCT sole.canonical_account_id)
            FROM account_identity AS sole
            WHERE sole.organization_id = listing.organization_id
              AND sole.channel = listing.channel
              AND sole.status = 'active'
              AND sole.canonical_identity IS NOT NULL
          )
      ),
      best_listing_priority AS (
        SELECT listing_id, MIN(priority) AS priority
        FROM accountless_listing_candidates
        GROUP BY listing_id
      ),
      unresolved_listings AS (
        SELECT listing.id::text AS row_id,
               COUNT(DISTINCT candidate.account_id) AS candidate_count
        FROM channel_listings AS listing
        LEFT JOIN best_listing_priority AS best ON best.listing_id = listing.id
        LEFT JOIN accountless_listing_candidates AS candidate
          ON candidate.listing_id = best.listing_id
         AND candidate.priority = best.priority
        WHERE listing.channel_account_id IS NULL
          AND listing.is_deleted = false
        GROUP BY listing.id
        HAVING COUNT(DISTINCT candidate.account_id) <> 1
      ),
      account_identity_missing AS (
        SELECT account.id::text AS row_id
        FROM account_identity AS account
        WHERE account.canonical_identity IS NULL
          AND EXISTS (
            SELECT 1
            FROM channel_listings AS listing
            WHERE listing.channel_account_id = account.id
          )
      )
      SELECT 'conflicting_duplicate_account'::text AS "issueCode",
             duplicate.row_id AS "rowId",
             jsonb_build_object(
               'organizationId', duplicate.organization_id,
               'channel', duplicate.channel,
               'canonicalIdentity', duplicate.canonical_identity,
               'operationalPayloadCount', duplicate.operational_payload_count
             ) AS details
      FROM conflicting_duplicate_accounts AS duplicate
      UNION ALL
      SELECT 'ambiguous_or_missing_listing_account', unresolved.row_id, jsonb_build_object('candidateCount', unresolved.candidate_count)
      FROM unresolved_listings AS unresolved
      UNION ALL
      SELECT 'missing_operational_account_identity', missing.row_id, NULL::jsonb
      FROM account_identity_missing AS missing
      ORDER BY 1, 2
      LIMIT 20
    `;
    if (blockers.length > 0) {
      throw new Error(
        `Ambiguous or missing operational channel account identity: ${JSON.stringify(blockers)}`,
      );
    }

    await tx.$executeRaw`
      CREATE TEMP TABLE sellpia_account_merge_map ON COMMIT DROP AS
      WITH ranked AS (
        SELECT account.id AS duplicate_account_id,
               account.organization_id,
               account.channel,
               COALESCE(
                 NULLIF(BTRIM(account.external_account_id), ''),
                 NULLIF(BTRIM(account.seller_id), ''),
                 NULLIF(BTRIM(account.vendor_id), '')
               ) AS canonical_identity,
               FIRST_VALUE(account.id) OVER (
                 PARTITION BY account.organization_id,
                              account.channel,
                              COALESCE(
                                NULLIF(BTRIM(account.external_account_id), ''),
                                NULLIF(BTRIM(account.seller_id), ''),
                                NULLIF(BTRIM(account.vendor_id), '')
                              )
                 ORDER BY account.is_primary DESC, account.created_at, account.id
               ) AS canonical_account_id,
               ROW_NUMBER() OVER (
                 PARTITION BY account.organization_id,
                              account.channel,
                              COALESCE(
                                NULLIF(BTRIM(account.external_account_id), ''),
                                NULLIF(BTRIM(account.seller_id), ''),
                                NULLIF(BTRIM(account.vendor_id), '')
                              )
                 ORDER BY account.is_primary DESC, account.created_at, account.id
               ) AS identity_rank
        FROM channel_accounts AS account
      )
      SELECT duplicate_account_id,
             organization_id,
             canonical_account_id
      FROM ranked
      WHERE canonical_identity IS NOT NULL
        AND identity_rank > 1
    `;

    const backfilledOperationalAccounts = await tx.$executeRaw`
      WITH normalized_accounts AS (
        SELECT account.*,
               NULLIF(BTRIM(account.seller_id), '') AS normalized_seller_id,
               NULLIF(BTRIM(account.vendor_id), '') AS normalized_vendor_id,
               COALESCE(
                 NULLIF(BTRIM(account.external_account_id), ''),
                 NULLIF(BTRIM(account.seller_id), ''),
                 NULLIF(BTRIM(account.vendor_id), '')
               ) AS canonical_identity
        FROM channel_accounts AS account
      ),
      source_seller_vendor AS (
        SELECT listing.id AS listing_id,
               COALESCE(merge.canonical_account_id, account.id) AS account_id,
               1 AS priority
        FROM channel_listings AS listing
        JOIN normalized_accounts AS account
          ON account.organization_id = listing.organization_id
         AND account.channel = listing.channel
         AND (
           NULLIF(BTRIM(to_jsonb(listing) -> 'raw_json' ->> 'sellerId'), '') = account.normalized_seller_id
           OR NULLIF(BTRIM(to_jsonb(listing) -> 'raw_json' ->> 'vendorId'), '') = account.normalized_vendor_id
           OR NULLIF(BTRIM(to_jsonb(listing) -> 'delivery_info' ->> 'sellerId'), '') = account.normalized_seller_id
           OR NULLIF(BTRIM(to_jsonb(listing) -> 'delivery_info' ->> 'vendorId'), '') = account.normalized_vendor_id
         )
        LEFT JOIN sellpia_account_merge_map AS merge
          ON merge.duplicate_account_id = account.id
        WHERE listing.channel_account_id IS NULL
          AND listing.is_deleted = false
      ),
      linked_listing_option AS (
        SELECT listing.id AS listing_id,
               COALESCE(merge.canonical_account_id, linked_listing.channel_account_id) AS account_id,
               2 AS priority
        FROM channel_listings AS listing
        JOIN channel_listing_options AS target_option
          ON target_option.listing_id = listing.id
         AND target_option.organization_id = listing.organization_id
        JOIN channel_listing_options AS linked_option
          ON linked_option.organization_id = target_option.organization_id
         AND linked_option.id <> target_option.id
         AND target_option.option_id IS NOT NULL
         AND linked_option.option_id = target_option.option_id
        JOIN channel_listings AS linked_listing
          ON linked_listing.id = linked_option.listing_id
         AND linked_listing.organization_id = listing.organization_id
         AND linked_listing.channel = listing.channel
        LEFT JOIN sellpia_account_merge_map AS merge
          ON merge.duplicate_account_id = linked_listing.channel_account_id
        WHERE listing.channel_account_id IS NULL
          AND listing.is_deleted = false
          AND linked_listing.channel_account_id IS NOT NULL
      ),
      legacy_parent_listing AS (
        SELECT listing.id AS listing_id,
               COALESCE(merge.canonical_account_id, legacy_parent.channel_account_id) AS account_id,
               3 AS priority
        FROM channel_listings AS listing
        JOIN channel_listings AS legacy_parent
          ON legacy_parent.organization_id = listing.organization_id
         AND legacy_parent.channel = listing.channel
         AND legacy_parent.master_id = listing.master_id
         AND legacy_parent.id <> listing.id
        LEFT JOIN sellpia_account_merge_map AS merge
          ON merge.duplicate_account_id = legacy_parent.channel_account_id
        WHERE listing.channel_account_id IS NULL
          AND listing.master_id IS NOT NULL
          AND listing.is_deleted = false
          AND legacy_parent.channel_account_id IS NOT NULL
      ),
      sole_active_platform AS (
        SELECT listing.id AS listing_id,
               COALESCE(merge.canonical_account_id, account.id) AS account_id,
               4 AS priority
        FROM channel_listings AS listing
        JOIN normalized_accounts AS account
          ON account.organization_id = listing.organization_id
         AND account.channel = listing.channel
         AND account.status = 'active'
         AND account.canonical_identity IS NOT NULL
        LEFT JOIN sellpia_account_merge_map AS merge
          ON merge.duplicate_account_id = account.id
        WHERE listing.channel_account_id IS NULL
          AND listing.is_deleted = false
          AND 1 = (
            SELECT COUNT(DISTINCT COALESCE(sole_merge.canonical_account_id, sole.id))
            FROM normalized_accounts AS sole
            LEFT JOIN sellpia_account_merge_map AS sole_merge
              ON sole_merge.duplicate_account_id = sole.id
            WHERE sole.organization_id = listing.organization_id
              AND sole.channel = listing.channel
              AND sole.status = 'active'
              AND sole.canonical_identity IS NOT NULL
          )
      ),
      candidates AS (
        SELECT * FROM source_seller_vendor
        UNION ALL SELECT * FROM linked_listing_option
        UNION ALL SELECT * FROM legacy_parent_listing
        UNION ALL SELECT * FROM sole_active_platform
      ),
      selected AS (
        SELECT DISTINCT ON (listing_id) listing_id, account_id
        FROM candidates
        WHERE account_id IS NOT NULL
        ORDER BY listing_id, priority, account_id
      )
      UPDATE channel_listings AS listing
      SET channel_account_id = selected.account_id
      FROM selected
      WHERE listing.id = selected.listing_id
        AND listing.channel_account_id IS NULL
        AND listing.is_deleted = false
    `;

    const repointedAccountReferences = await tx.$executeRaw`
      DO $$
      DECLARE
        target_table text;
      BEGIN
        FOREACH target_table IN ARRAY ARRAY[
          'channel_listings',
          'channel_listing_options',
          'source_import_runs',
          'orders',
          'order_returns',
          'product_preparations',
          'channel_scrape_runs',
          'channel_account_daily_kpi_snapshots'
        ]
        LOOP
          IF to_regclass('public.' || target_table) IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = target_table
                 AND column_name = 'channel_account_id'
             ) THEN
            EXECUTE format(
              'UPDATE %I AS incoming
               SET channel_account_id = merge.canonical_account_id
               FROM sellpia_account_merge_map AS merge
               WHERE incoming.channel_account_id = merge.duplicate_account_id
                 AND incoming.organization_id = merge.organization_id',
              target_table
            );
          END IF;
        END LOOP;
      END $$
    `;

    const mergedDuplicateAccounts = await tx.$executeRaw`
      DELETE FROM channel_accounts AS account
      USING sellpia_account_merge_map AS merge
      WHERE account.id = merge.duplicate_account_id
        AND account.organization_id = merge.organization_id
    `;

    const normalizedExternalAccountIds = await tx.$executeRaw`
      UPDATE channel_accounts AS account
      SET external_account_id = COALESCE(
        NULLIF(BTRIM(account.seller_id), ''),
        NULLIF(BTRIM(account.vendor_id), '')
      )
      WHERE NULLIF(BTRIM(account.external_account_id), '') IS NULL
        AND COALESCE(
          NULLIF(BTRIM(account.seller_id), ''),
          NULLIF(BTRIM(account.vendor_id), '')
        ) IS NOT NULL
    `;

    const residualOperationalRows = await tx.$queryRaw<AccountNormalizationBlocker[]>`
      SELECT 'accountless_listing_after_normalization'::text AS "issueCode",
             listing.id::text AS "rowId",
             jsonb_build_object(
               'organizationId', listing.organization_id,
               'channel', listing.channel,
               'channelAccountId', listing.channel_account_id
             ) AS details
      FROM channel_listings AS listing
      LEFT JOIN channel_accounts AS account
        ON account.id = listing.channel_account_id
       AND account.organization_id = listing.organization_id
      WHERE listing.is_deleted = false
        AND (
          listing.channel_account_id IS NULL
          OR account.id IS NULL
          OR NULLIF(BTRIM(account.external_account_id), '') IS NULL
        )
      ORDER BY listing.organization_id, listing.id
      LIMIT 20
    `;
    if (residualOperationalRows.length > 0) {
      throw new Error(
        `Account normalization left unresolved operational channel accounts: ${JSON.stringify(residualOperationalRows)}`,
      );
    }

    return {
      affectedRows:
        backfilledOperationalAccounts
        + repointedAccountReferences
        + mergedDuplicateAccounts
        + normalizedExternalAccountIds,
      details: {
        evidenceOrder: [...EVIDENCE_ORDER],
        backfilledOperationalAccounts,
        repointedAccountReferences,
        mergedDuplicateAccounts,
        normalizedExternalAccountIds,
      },
    };
  },
};
