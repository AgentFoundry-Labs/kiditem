#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const SELLPIA_CUTOVER_PREFLIGHT_SCHEMA_VERSION = 'kiditem.sellpia-cutover-preflight.v1';
export const SELLPIA_CUTOVER_TARGET_RELEASE = '0.1.8';
export const MAX_SELLPIA_CUTOVER_EXAMPLES = 20;

type ReadonlyQueryClient = Pick<PrismaClient, '$queryRaw'>;
type PreservationRowCounts = {
  inventorySkus: number;
  legacyMasterProducts: number;
  legacyProductOptions: number;
  legacyBundleComponents: number;
  channelSkuComponents: number;
  supplierRows: number;
  orderRows: number;
  orderLineItems: number;
  returnRows: number;
  returnLineItems: number;
  shipmentRows: number;
  shipmentItems: number;
  unshippedRows: number;
  contentRows: number;
  contentGenerationGroups: number;
  channelListings: number;
  channelListingOptions: number;
  channelListingOptionDailySnapshots: number;
  analyticsRows: number;
  advertisingRows: number;
};
type IssueRow = Record<string, unknown> & {
  issueCode?: string;
  issueCount?: number | bigint;
};
type BlockingIssue = {
  code: string;
  count: number;
  examples: Array<Record<string, unknown>>;
};

export type SellpiaCutoverPreflightReport = {
  schemaVersion: typeof SELLPIA_CUTOVER_PREFLIGHT_SCHEMA_VERSION;
  targetRelease: typeof SELLPIA_CUTOVER_TARGET_RELEASE;
  status: 'passed' | 'blocked';
  rowCounts: PreservationRowCounts;
  blockingIssueCodes: string[];
  issues: BlockingIssue[];
};

const ISSUE_CODES = [
  'NULL_OPERATIONAL_CHANNEL_ACCOUNT',
  'DUPLICATE_OPERATIONAL_CHANNEL_ACCOUNT',
  'DUPLICATE_LISTING_IDENTITY',
  'DUPLICATE_STAGED_UNIQUE_KEY',
  'CHANNEL_OPTION_PARENT_ACCOUNT_MISMATCH',
  'CROSS_TENANT_FOREIGN_KEY',
  'OWNERLESS_RETAINED_CONTENT',
  'AMBIGUOUS_PRODUCT_OPTION_REFERENCE',
] as const;

function toIssue(code: string, rows: IssueRow[]): BlockingIssue | null {
  if (rows.length === 0) return null;
  const count = Number(rows[0]?.issueCount ?? rows.length);
  return {
    code,
    count,
    examples: rows.slice(0, MAX_SELLPIA_CUTOVER_EXAMPLES).map((row) => {
      const { issueCode: _issueCode, issueCount: _issueCount, ...example } = row;
      return example;
    }),
  };
}

export async function checkSellpiaCutoverPreflight(
  prisma: ReadonlyQueryClient,
): Promise<SellpiaCutoverPreflightReport> {
  // query_to_xml keeps the release preflight compatible with 0.1.7 databases
  // where additive 0.1.8 tables do not exist yet, while still returning exact counts.
  const countRows = await prisma.$queryRaw<PreservationRowCounts[]>`
    SELECT
      CASE WHEN to_regclass('public.inventory_skus') IS NULL THEN 0 ELSE
        COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.inventory_skus', false, true, '')))[1]::text)::int, 0)
      END AS "inventorySkus",
      CASE WHEN to_regclass('public.master_products') IS NULL THEN 0 ELSE
        COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.master_products', false, true, '')))[1]::text)::int, 0)
      END AS "legacyMasterProducts",
      CASE WHEN to_regclass('public.product_options') IS NULL THEN 0 ELSE
        COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.product_options', false, true, '')))[1]::text)::int, 0)
      END AS "legacyProductOptions",
      CASE WHEN to_regclass('public.bundle_components') IS NULL THEN 0 ELSE
        COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.bundle_components', false, true, '')))[1]::text)::int, 0)
      END AS "legacyBundleComponents",
      CASE WHEN to_regclass('public.channel_sku_components') IS NULL THEN 0 ELSE
        COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.channel_sku_components', false, true, '')))[1]::text)::int, 0)
      END AS "channelSkuComponents",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT (SELECT COUNT(*) FROM public.supplier_products) + (SELECT COUNT(*) FROM public.master_supplier_products) AS count', false, true, '')))[1]::text)::int, 0) AS "supplierRows",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.orders', false, true, '')))[1]::text)::int, 0) AS "orderRows",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.order_line_items', false, true, '')))[1]::text)::int, 0) AS "orderLineItems",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.order_returns', false, true, '')))[1]::text)::int, 0) AS "returnRows",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.order_return_line_items', false, true, '')))[1]::text)::int, 0) AS "returnLineItems",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.shipments', false, true, '')))[1]::text)::int, 0) AS "shipmentRows",
      CASE WHEN to_regclass('public.shipment_items') IS NULL THEN 0 ELSE
        COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.shipment_items', false, true, '')))[1]::text)::int, 0)
      END AS "shipmentItems",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.unshipped_items', false, true, '')))[1]::text)::int, 0) AS "unshippedRows",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT (SELECT COUNT(*) FROM public.content_workspaces) + (SELECT COUNT(*) FROM public.content_generations) + (SELECT COUNT(*) FROM public.content_generation_groups) + (SELECT COUNT(*) FROM public.content_assets) + (SELECT COUNT(*) FROM public.detail_page_artifacts) AS count', false, true, '')))[1]::text)::int, 0) AS "contentRows",
      CASE WHEN to_regclass('public.content_generation_groups') IS NULL THEN 0 ELSE
        COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.content_generation_groups', false, true, '')))[1]::text)::int, 0)
      END AS "contentGenerationGroups",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.channel_listings', false, true, '')))[1]::text)::int, 0) AS "channelListings",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.channel_listing_options', false, true, '')))[1]::text)::int, 0) AS "channelListingOptions",
      CASE WHEN to_regclass('public.channel_listing_option_daily_snapshots') IS NULL THEN 0 ELSE
        COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT COUNT(*) AS count FROM public.channel_listing_option_daily_snapshots', false, true, '')))[1]::text)::int, 0)
      END AS "channelListingOptionDailySnapshots",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT (SELECT COUNT(*) FROM public.profit_loss) + (SELECT COUNT(*) FROM public.grade_histories) + (SELECT COUNT(*) FROM public.channel_listing_daily_snapshots) + (SELECT COUNT(*) FROM public.channel_listing_option_daily_snapshots) AS count', false, true, '')))[1]::text)::int, 0) AS "analyticsRows",
      COALESCE(((xpath('/row/count/text()', query_to_xml('SELECT (SELECT COUNT(*) FROM public.ad_actions) + (SELECT COUNT(*) FROM public.channel_ad_target_daily_snapshots) AS count', false, true, '')))[1]::text)::int, 0) AS "advertisingRows"
  `;
  const rowCounts = countRows[0];
  if (!rowCounts) throw new Error('Sellpia cutover preflight could not read preservation counts.');

  const nullOperationalAccounts = await prisma.$queryRaw<IssueRow[]>`
    WITH violations AS (
      SELECT listing.id,
             listing.organization_id,
             listing.channel,
             listing.external_id,
             'listing_account_missing'::text AS reason
      FROM channel_listings AS listing
      WHERE listing.channel_account_id IS NULL
        AND listing.is_deleted = false
      UNION ALL
      SELECT account.id,
             account.organization_id,
             account.channel,
             NULL::text,
             'canonical_account_identity_missing'
      FROM channel_accounts AS account
      WHERE COALESCE(
        NULLIF(BTRIM(account.external_account_id), ''),
        NULLIF(BTRIM(account.seller_id), ''),
        NULLIF(BTRIM(account.vendor_id), '')
      ) IS NULL
        AND EXISTS (
          SELECT 1 FROM channel_listings AS listing
          WHERE listing.channel_account_id = account.id
        )
    )
    SELECT 'NULL_OPERATIONAL_CHANNEL_ACCOUNT'::text AS "issueCode",
           COUNT(*) OVER()::int AS "issueCount",
           id,
           organization_id AS "organizationId",
           channel,
           external_id AS "externalId",
           reason
    FROM violations
    ORDER BY organization_id, id
    LIMIT 20
  `;

  const duplicateOperationalAccounts = await prisma.$queryRaw<IssueRow[]>`
    WITH identities AS (
      SELECT account.id,
             account.organization_id,
             account.channel,
             COALESCE(
               NULLIF(BTRIM(account.external_account_id), ''),
               NULLIF(BTRIM(account.seller_id), ''),
               NULLIF(BTRIM(account.vendor_id), '')
             ) AS canonical_identity
      FROM channel_accounts AS account
    ), duplicate_groups AS (
      SELECT organization_id,
             channel,
             canonical_identity,
             COUNT(*)::int AS duplicate_count,
             ARRAY_AGG(id ORDER BY id) AS account_ids
      FROM identities
      WHERE canonical_identity IS NOT NULL
      GROUP BY organization_id, channel, canonical_identity
      HAVING COUNT(*) > 1
    )
    SELECT 'DUPLICATE_OPERATIONAL_CHANNEL_ACCOUNT'::text AS "issueCode",
           COUNT(*) OVER()::int AS "issueCount",
           organization_id AS "organizationId",
           channel,
           canonical_identity AS "canonicalIdentity",
           duplicate_count AS "duplicateCount",
           account_ids AS "accountIds"
    FROM duplicate_groups
    ORDER BY organization_id, channel, canonical_identity
    LIMIT 20
  `;

  const duplicateListingIdentities = await prisma.$queryRaw<IssueRow[]>`
    WITH duplicate_groups AS (
      SELECT organization_id,
             channel_account_id,
             external_id,
             COUNT(*)::int AS duplicate_count,
             ARRAY_AGG(id ORDER BY is_deleted, id) AS listing_ids
      FROM channel_listings
      WHERE channel_account_id IS NOT NULL
      GROUP BY organization_id, channel_account_id, external_id
      HAVING COUNT(*) > 1
    )
    SELECT 'DUPLICATE_LISTING_IDENTITY'::text AS "issueCode",
           COUNT(*) OVER()::int AS "issueCount",
           organization_id AS "organizationId",
           channel_account_id AS "channelAccountId",
           external_id AS "externalId",
           duplicate_count AS "duplicateCount",
           listing_ids AS "listingIds"
    FROM duplicate_groups
    ORDER BY organization_id, channel_account_id, external_id
    LIMIT 20
  `;

  const duplicateStagedUniqueKeys = await prisma.$queryRaw<IssueRow[]>`
    WITH duplicate_groups AS (
      SELECT 'channel_options_org_account_external_option_key'::text AS issue_key,
             option_row.organization_id,
             CONCAT(
               COALESCE(
                 NULLIF(to_jsonb(option_row) ->> 'channel_account_id', '')::uuid,
                 listing.channel_account_id
               ),
               '/',
               option_row.external_option_id
             ) AS projected_key,
             COUNT(*)::int AS duplicate_count,
             ARRAY_AGG(option_row.id ORDER BY option_row.id) AS row_ids
      FROM channel_listing_options AS option_row
      JOIN channel_listings AS listing
        ON listing.id = option_row.listing_id
       AND listing.organization_id = option_row.organization_id
      WHERE COALESCE(
              NULLIF(to_jsonb(option_row) ->> 'channel_account_id', '')::uuid,
              listing.channel_account_id
            ) IS NOT NULL
      GROUP BY option_row.organization_id,
               COALESCE(
                 NULLIF(to_jsonb(option_row) ->> 'channel_account_id', '')::uuid,
                 listing.channel_account_id
               ),
               option_row.external_option_id
      HAVING COUNT(*) > 1

      UNION ALL

      SELECT 'content_workspaces_candidate_active_key',
             workspace.organization_id,
             workspace.source_candidate_id::text,
             COUNT(*)::int,
             ARRAY_AGG(workspace.id ORDER BY workspace.id)
      FROM content_workspaces AS workspace
      WHERE workspace.source_candidate_id IS NOT NULL
        AND workspace.status = 'active'
        AND workspace.is_deleted = false
      GROUP BY workspace.organization_id, workspace.source_candidate_id
      HAVING COUNT(*) > 1
    )
    SELECT 'DUPLICATE_STAGED_UNIQUE_KEY'::text AS "issueCode",
           COUNT(*) OVER()::int AS "issueCount",
           issue_key AS "constraintKey",
           organization_id AS "organizationId",
           projected_key AS "projectedKey",
           duplicate_count AS "duplicateCount",
           row_ids AS "rowIds"
    FROM duplicate_groups
    ORDER BY issue_key, organization_id, projected_key
    LIMIT 20
  `;

  const optionParentAccountMismatches = await prisma.$queryRaw<IssueRow[]>`
    WITH violations AS (
      SELECT option_row.id,
             option_row.organization_id,
             option_row.listing_id,
             NULLIF(to_jsonb(option_row) ->> 'channel_account_id', '')::uuid AS child_account_id,
             listing.channel_account_id AS parent_account_id
      FROM channel_listing_options AS option_row
      JOIN channel_listings AS listing ON listing.id = option_row.listing_id
      WHERE NULLIF(to_jsonb(option_row) ->> 'channel_account_id', '') IS NOT NULL
        AND NULLIF(to_jsonb(option_row) ->> 'channel_account_id', '')::uuid
            IS DISTINCT FROM listing.channel_account_id
    )
    SELECT 'CHANNEL_OPTION_PARENT_ACCOUNT_MISMATCH'::text AS "issueCode",
           COUNT(*) OVER()::int AS "issueCount",
           id AS "channelOptionId",
           organization_id AS "organizationId",
           listing_id AS "listingId",
           child_account_id AS "childAccountId",
           parent_account_id AS "parentAccountId"
    FROM violations
    ORDER BY organization_id, id
    LIMIT 20
  `;

  const crossTenantForeignKeys = await prisma.$queryRaw<IssueRow[]>`
    WITH relation_specs(relation_name, child_table, child_fk, parent_table) AS (
      VALUES
        ('source_import_account', 'source_import_runs', 'channel_account_id', 'channel_accounts'),
        ('inventory_sku_last_import', 'inventory_skus', 'last_import_run_id', 'source_import_runs'),
        ('master_product_last_import', 'master_products', 'last_import_run_id', 'source_import_runs'),
        ('inventory_map_inventory_sku', 'inventory_sku_master_product_maps', 'inventory_sku_id', 'inventory_skus'),
        ('inventory_map_master', 'inventory_sku_master_product_maps', 'master_product_id', 'master_products'),
        ('channel_listing_account', 'channel_listings', 'channel_account_id', 'channel_accounts'),
        ('channel_listing_source_candidate', 'channel_listings', 'source_candidate_id', 'sourcing_candidates'),
        ('channel_listing_last_import', 'channel_listings', 'last_import_run_id', 'source_import_runs'),
        ('channel_option_parent', 'channel_listing_options', 'listing_id', 'channel_listings'),
        ('channel_option_account', 'channel_listing_options', 'channel_account_id', 'channel_accounts'),
        ('channel_option_last_import', 'channel_listing_options', 'last_import_run_id', 'source_import_runs'),
        ('channel_option_product_option', 'channel_listing_options', 'option_id', 'product_options'),
        ('channel_sku_option', 'channel_sku_components', 'channel_sku_id', 'channel_listing_options'),
        ('channel_sku_inventory', 'channel_sku_components', 'inventory_sku_id', 'inventory_skus'),
        ('channel_sku_master', 'channel_sku_components', 'master_product_id', 'master_products'),
        ('sourcing_candidate_promoted_master', 'sourcing_candidates', 'promoted_master_id', 'master_products'),
        ('sourcing_candidate_provenance_master', 'sourcing_candidates', 'provenance_master_product_id', 'master_products'),
        ('order_account', 'orders', 'channel_account_id', 'channel_accounts'),
        ('order_listing', 'orders', 'listing_id', 'channel_listings'),
        ('order_line_order', 'order_line_items', 'order_id', 'orders'),
        ('order_line_listing_option', 'order_line_items', 'listing_option_id', 'channel_listing_options'),
        ('order_line_product_option', 'order_line_items', 'option_id', 'product_options'),
        ('return_account', 'order_returns', 'channel_account_id', 'channel_accounts'),
        ('return_order', 'order_returns', 'order_id', 'orders'),
        ('return_line_return', 'order_return_line_items', 'return_id', 'order_returns'),
        ('return_line_order_line', 'order_return_line_items', 'order_line_item_id', 'order_line_items'),
        ('return_line_listing_option', 'order_return_line_items', 'listing_option_id', 'channel_listing_options'),
        ('return_line_product_option', 'order_return_line_items', 'option_id', 'product_options'),
        ('shipment_order', 'shipments', 'order_id', 'orders'),
        ('shipment_listing', 'shipments', 'listing_id', 'channel_listings'),
        ('shipment_product_option', 'shipments', 'option_id', 'product_options'),
        ('shipment_warehouse', 'shipments', 'warehouse_id', 'warehouses'),
        ('shipment_item_shipment', 'shipment_items', 'shipment_id', 'shipments'),
        ('shipment_item_order_line', 'shipment_items', 'order_line_item_id', 'order_line_items'),
        ('unshipped_order', 'unshipped_items', 'order_id', 'orders'),
        ('unshipped_listing', 'unshipped_items', 'listing_id', 'channel_listings'),
        ('unshipped_order_line', 'unshipped_items', 'order_line_item_id', 'order_line_items'),
        ('unshipped_product_option', 'unshipped_items', 'option_id', 'product_options'),
        ('content_workspace_candidate', 'content_workspaces', 'source_candidate_id', 'sourcing_candidates'),
        ('content_workspace_target_master', 'content_workspaces', 'target_master_id', 'master_products'),
        ('content_workspace_listing', 'content_workspaces', 'channel_listing_id', 'channel_listings'),
        ('content_workspace_origin', 'content_workspaces', 'origin_workspace_id', 'content_workspaces'),
        ('content_workspace_current_thumbnail', 'content_workspaces', 'current_thumbnail_selection_id', 'content_workspace_thumbnail_selections'),
        ('thumbnail_selection_workspace', 'content_workspace_thumbnail_selections', 'content_workspace_id', 'content_workspaces'),
        ('thumbnail_selection_asset', 'content_workspace_thumbnail_selections', 'content_asset_id', 'content_assets'),
        ('thumbnail_selection_generation', 'content_workspace_thumbnail_selections', 'source_thumbnail_generation_id', 'thumbnail_generations'),
        ('thumbnail_selection_candidate', 'content_workspace_thumbnail_selections', 'source_thumbnail_candidate_id', 'thumbnail_generation_candidates'),
        ('product_preparation_candidate', 'product_preparations', 'source_candidate_id', 'sourcing_candidates'),
        ('product_preparation_master', 'product_preparations', 'master_id', 'master_products'),
        ('product_preparation_workspace', 'product_preparations', 'content_workspace_id', 'content_workspaces'),
        ('product_preparation_account', 'product_preparations', 'channel_account_id', 'channel_accounts'),
        ('product_preparation_source_workspace', 'product_preparations', 'source_content_workspace_id', 'content_workspaces'),
        ('product_preparation_listing', 'product_preparations', 'channel_listing_id', 'channel_listings'),
        ('content_generation_group_master', 'content_generation_groups', 'target_master_id', 'master_products'),
        ('content_generation_group_workspace', 'content_generation_groups', 'content_workspace_id', 'content_workspaces'),
        ('content_generation_group_base', 'content_generation_groups', 'base_content_generation_id', 'content_generations'),
        ('content_asset_generation_group', 'content_assets', 'generation_group_id', 'content_generation_groups'),
        ('content_asset_origin_generation_group', 'content_assets', 'origin_generation_group_id', 'content_generation_groups'),
        ('supplier_product_supplier', 'supplier_products', 'supplier_id', 'suppliers'),
        ('supplier_product_product_option', 'supplier_products', 'option_id', 'product_options'),
        ('supplier_product_master', 'supplier_products', 'master_product_id', 'master_products'),
        ('purchase_order_supplier', 'purchase_orders', 'supplier_id', 'suppliers'),
        ('purchase_order_item_order', 'purchase_order_items', 'order_id', 'purchase_orders'),
        ('purchase_order_item_product_option', 'purchase_order_items', 'option_id', 'product_options'),
        ('purchase_order_item_master', 'purchase_order_items', 'master_product_id', 'master_products'),
        ('stock_transfer_product_option', 'stock_transfers', 'option_id', 'product_options'),
        ('stock_transfer_inventory', 'stock_transfers', 'inventory_sku_id', 'inventory_skus'),
        ('stock_transfer_master', 'stock_transfers', 'master_product_id', 'master_products'),
        ('stock_transfer_from_warehouse', 'stock_transfers', 'from_warehouse_id', 'warehouses'),
        ('stock_transfer_to_warehouse', 'stock_transfers', 'to_warehouse_id', 'warehouses'),
        ('picking_item_list', 'picking_items', 'picking_list_id', 'picking_lists'),
        ('picking_item_product_option', 'picking_items', 'option_id', 'product_options'),
        ('picking_item_inventory', 'picking_items', 'inventory_sku_id', 'inventory_skus'),
        ('picking_item_master', 'picking_items', 'master_product_id', 'master_products'),
        ('return_transfer_product_option', 'return_transfers', 'option_id', 'product_options'),
        ('return_transfer_inventory', 'return_transfers', 'inventory_sku_id', 'inventory_skus'),
        ('return_transfer_master', 'return_transfers', 'master_product_id', 'master_products'),
        ('sellpia_snapshot_item_snapshot', 'sellpia_stock_snapshot_items', 'snapshot_id', 'sellpia_stock_snapshots'),
        ('sellpia_snapshot_item_product_option', 'sellpia_stock_snapshot_items', 'product_option_id', 'product_options'),
        ('sellpia_snapshot_item_master', 'sellpia_stock_snapshot_items', 'master_product_id', 'master_products'),
        ('rocket_ledger_product_option', 'rocket_inventory_ledger', 'option_id', 'product_options'),
        ('rocket_ledger_master', 'rocket_inventory_ledger', 'master_product_id', 'master_products'),
        ('channel_scrape_run_account', 'channel_scrape_runs', 'channel_account_id', 'channel_accounts'),
        ('channel_scrape_snapshot_run', 'channel_scrape_snapshots', 'scrape_run_id', 'channel_scrape_runs'),
        ('channel_scrape_snapshot_listing', 'channel_scrape_snapshots', 'listing_id', 'channel_listings'),
        ('channel_scrape_snapshot_option', 'channel_scrape_snapshots', 'listing_option_id', 'channel_listing_options'),
        ('listing_daily_listing', 'channel_listing_daily_snapshots', 'listing_id', 'channel_listings'),
        ('listing_daily_raw_snapshot', 'channel_listing_daily_snapshots', 'raw_snapshot_id', 'channel_scrape_snapshots'),
        ('listing_option_daily_listing', 'channel_listing_option_daily_snapshots', 'listing_id', 'channel_listings'),
        ('listing_option_daily_option', 'channel_listing_option_daily_snapshots', 'listing_option_id', 'channel_listing_options'),
        ('listing_option_daily_raw_snapshot', 'channel_listing_option_daily_snapshots', 'raw_snapshot_id', 'channel_scrape_snapshots'),
        ('ad_target_daily_listing', 'channel_ad_target_daily_snapshots', 'listing_id', 'channel_listings'),
        ('ad_target_daily_option', 'channel_ad_target_daily_snapshots', 'listing_option_id', 'channel_listing_options'),
        ('ad_target_daily_raw_snapshot', 'channel_ad_target_daily_snapshots', 'raw_snapshot_id', 'channel_scrape_snapshots'),
        ('account_kpi_account', 'channel_account_daily_kpi_snapshots', 'channel_account_id', 'channel_accounts'),
        ('account_kpi_raw_snapshot', 'channel_account_daily_kpi_snapshots', 'raw_snapshot_id', 'channel_scrape_snapshots'),
        ('ad_action_listing', 'ad_actions', 'listing_id', 'channel_listings'),
        ('ad_action_listing_option', 'ad_actions', 'listing_option_id', 'channel_listing_options'),
        ('ad_action_target', 'ad_actions', 'ad_target_daily_id', 'channel_ad_target_daily_snapshots'),
        ('profit_loss_listing', 'profit_loss', 'listing_id', 'channel_listings'),
        ('grade_history_master', 'grade_histories', 'master_id', 'master_products'),
        ('grade_history_listing', 'grade_histories', 'listing_id', 'channel_listings')
    ),
    available_relations AS (
      SELECT spec.*
      FROM relation_specs AS spec
      WHERE to_regclass('public.' || spec.child_table) IS NOT NULL
        AND to_regclass('public.' || spec.parent_table) IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = spec.child_table
            AND column_name = 'id'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = spec.child_table
            AND column_name = 'organization_id'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = spec.child_table
            AND column_name = spec.child_fk
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = spec.parent_table
            AND column_name = 'id'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = spec.parent_table
            AND column_name = 'organization_id'
        )
    ),
    relation_results AS (
      SELECT relation.relation_name,
             query_to_xml(
               format(
                 'SELECT concat_ws(''|'', %L, child.id::text, child.organization_id::text, parent.organization_id::text) AS payload FROM %I.%I AS child JOIN %I.%I AS parent ON parent.id = child.%I WHERE child.%I IS NOT NULL AND child.organization_id IS NOT NULL AND child.organization_id IS DISTINCT FROM parent.organization_id',
                 relation.relation_name,
                 'public',
                 relation.child_table,
                 'public',
                 relation.parent_table,
                 relation.child_fk,
                 relation.child_fk
               ),
               false,
               false,
               ''
             ) AS result_xml
      FROM available_relations AS relation
    ),
    violations AS (
      SELECT node::text AS payload
      FROM relation_results AS result
      CROSS JOIN LATERAL unnest(
        xpath('/table/row/payload/text()', result.result_xml)
      ) AS violation(node)
    )
    SELECT 'CROSS_TENANT_FOREIGN_KEY'::text AS "issueCode",
           COUNT(*) OVER()::int AS "issueCount",
           split_part(payload, '|', 1) AS "relationName",
           split_part(payload, '|', 2) AS "rowId",
           NULLIF(split_part(payload, '|', 3), '<null>') AS "childOrganizationId",
           split_part(payload, '|', 4) AS "parentOrganizationId"
    FROM violations
    ORDER BY split_part(payload, '|', 1), split_part(payload, '|', 2)
    LIMIT 20
  `;

  const ownerlessContent = await prisma.$queryRaw<IssueRow[]>`
    WITH violations AS (
      SELECT 'content_workspace'::text AS content_type,
             workspace.id,
             workspace.organization_id
      FROM content_workspaces AS workspace
      WHERE workspace.is_deleted = false
        AND workspace.owner_type <> 'direct_detail_page'
        AND workspace.source_candidate_id IS NULL
        AND workspace.target_master_id IS NULL
        AND NULLIF(to_jsonb(workspace) ->> 'channel_listing_id', '') IS NULL
      UNION ALL
      SELECT 'detail_page_artifact', artifact.id, artifact.organization_id
      FROM detail_page_artifacts AS artifact
      WHERE artifact.is_deleted = false
        AND artifact.content_workspace_id IS NULL
        AND artifact.source_candidate_id IS NULL
        AND artifact.target_master_id IS NULL
    )
    SELECT 'OWNERLESS_RETAINED_CONTENT'::text AS "issueCode",
           COUNT(*) OVER()::int AS "issueCount",
           content_type AS "contentType",
           id,
           organization_id AS "organizationId"
    FROM violations
    ORDER BY content_type, id
    LIMIT 20
  `;

  const ambiguousProductOptionReferences = await prisma.$queryRaw<IssueRow[]>`
    WITH option_references AS (
      SELECT option_id,
             organization_id,
             COUNT(DISTINCT id)::int AS listing_option_count,
             ARRAY_AGG(id ORDER BY id) AS listing_option_ids
      FROM channel_listing_options
      WHERE option_id IS NOT NULL
      GROUP BY option_id, organization_id
      HAVING COUNT(DISTINCT id) > 1
    )
    SELECT 'AMBIGUOUS_PRODUCT_OPTION_REFERENCE'::text AS "issueCode",
           COUNT(*) OVER()::int AS "issueCount",
           option_id AS "productOptionId",
           organization_id AS "organizationId",
           listing_option_count AS "listingOptionCount",
           listing_option_ids AS "listingOptionIds"
    FROM option_references
    ORDER BY organization_id, option_id
    LIMIT 20
  `;

  const issueRows = [
    nullOperationalAccounts,
    duplicateOperationalAccounts,
    duplicateListingIdentities,
    duplicateStagedUniqueKeys,
    optionParentAccountMismatches,
    crossTenantForeignKeys,
    ownerlessContent,
    ambiguousProductOptionReferences,
  ];
  const issues = issueRows
    .map((rows, index) => toIssue(ISSUE_CODES[index], rows))
    .filter((issue): issue is BlockingIssue => issue !== null);
  const blockingIssueCodes = issues.map((issue) => issue.code);

  return {
    schemaVersion: SELLPIA_CUTOVER_PREFLIGHT_SCHEMA_VERSION,
    targetRelease: SELLPIA_CUTOVER_TARGET_RELEASE,
    status: issues.length === 0 ? 'passed' : 'blocked',
    rowCounts,
    blockingIssueCodes,
    issues,
  };
}

export async function runSellpiaCutoverPreflight(
  prisma: ReadonlyQueryClient,
  output: (text: string) => void = console.log,
): Promise<0 | 1> {
  const report = await checkSellpiaCutoverPreflight(prisma);
  output(JSON.stringify(report, null, 2));
  return report.status === 'passed' ? 0 : 1;
}

function createPrisma(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the Sellpia cutover preflight.');
  const prisma = createPrisma(databaseUrl);
  try {
    await prisma.$connect();
    process.exitCode = await runSellpiaCutoverPreflight(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
