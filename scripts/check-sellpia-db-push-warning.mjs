#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SELLPIA_CUTOVER_PREFLIGHT_MARKER = 'passed';

const ALLOWED_COMPOSITE_KEYS = new Map([
  ['master_products:id,organization_id', 'master_products_id_org_key'],
  ['master_products:organization_id,sellpia_product_code', 'master_products_org_sellpia_product_code_key'],
  ['channel_accounts:id,organization_id', 'channel_accounts_id_org_key'],
  ['channel_listings:id,organization_id', 'channel_listings_id_org_key'],
  ['channel_listings:organization_id,channel_account_id,external_id', 'channel_listings_org_account_external_all_key'],
  ['channel_listings:organization_id,source_candidate_id,channel_account_id', 'channel_listings_org_source_account_active_key'],
  ['channel_listing_options:id,organization_id', 'channel_listing_options_id_org_key'],
  ['channel_listing_options:organization_id,channel_account_id,external_option_id', 'channel_listing_options_org_account_external_option_key'],
  ['channel_sku_components:channel_sku_id,master_product_id', 'channel_sku_components_sku_master_key'],
  ['sourcing_candidates:id,organization_id', 'sourcing_candidates_id_org_key'],
  ['sourcing_candidates:provenance_master_product_id,organization_id', 'sourcing_candidates_org_provenance_master_key'],
  ['thumbnail_generations:id,organization_id', 'thumbnail_generations_id_org_key'],
  ['thumbnail_generation_candidates:id,organization_id', 'thumbnail_generation_candidates_id_org_key'],
  ['content_generations:id,organization_id', 'content_generations_id_org_key'],
  ['detail_page_artifacts:id,organization_id', 'detail_page_artifacts_id_org_key'],
  ['detail_page_revisions:id,organization_id', 'detail_page_revisions_id_org_key'],
  ['content_workspaces:id,organization_id', 'content_workspaces_id_org_key'],
  ['content_workspaces:organization_id,channel_listing_id', 'content_workspaces_listing_active_key'],
  ['content_workspaces:organization_id,source_candidate_id', 'content_workspaces_candidate_active_key'],
  ['content_workspaces:current_thumbnail_selection_id,organization_id', 'content_workspaces_current_thumbnail_key'],
  ['product_preparations:organization_id,source_candidate_id,channel_account_id', 'product_preparations_org_source_account_active_key'],
  ['product_preparations:organization_id,submission_key', 'product_preparations_org_submission_key'],
  ['content_generation_groups:id,organization_id', 'content_generation_groups_id_org_key'],
  ['content_assets:id,organization_id', 'content_assets_id_org_key'],
  ['warehouses:id,organization_id', 'warehouses_id_org_key'],
  ['picking_lists:id,organization_id', 'picking_lists_id_org_key'],
  ['shipments:id,organization_id', 'shipments_id_org_key'],
  ['source_import_runs:organization_id,source_type,publication_sequence', 'source_import_runs_org_source_publication_key'],
  ['orders:organization_id,channel_account_id,external_order_id', 'orders_org_account_external_order_key'],
  ['order_returns:organization_id,channel_account_id,external_return_id', 'order_returns_org_account_external_return_key'],
  ['suppliers:id,organization_id', 'suppliers_id_org_key'],
  ['supplier_products:supplier_id,master_product_id', 'supplier_products_supplier_master_key'],
  ['supplier_products:master_product_id', 'supplier_products_primary_master_key'],
  ['purchase_orders:id,organization_id', 'purchase_orders_id_org_key'],
  ['channel_scrape_runs:id,organization_id', 'channel_scrape_runs_id_org_key'],
  ['channel_scrape_snapshots:id,organization_id', 'channel_scrape_snapshots_id_org_key'],
  ['channel_ad_target_daily_snapshots:id,organization_id', 'channel_ad_target_daily_snapshots_id_org_key'],
  ['channel_account_daily_kpi_snapshots:organization_id,channel_account_id,source,business_date,kpi_type', 'channel_account_daily_kpi_org_account_source_date_type_key'],
]);

function parseUniqueWarning(warning) {
  const match = warning.match(
    /^A unique constraint covering the columns `\[([^\]]+)\]` on the table `([^`]+)` will be added\. If there are existing duplicate values, this will fail\.$/,
  );
  if (!match) return null;
  const columns = match[1].split(',').map((column) => column.trim()).join(',');
  return `${match[2]}:${columns}`;
}

export function assertSafeSellpiaDbPushWarnings(log, preflightMarker) {
  if (preflightMarker !== SELLPIA_CUTOVER_PREFLIGHT_MARKER) {
    throw new Error('Sellpia cutover preflight marker is missing or invalid.');
  }
  if (!/There might be data loss when applying the changes:/i.test(log) || !log.includes('--accept-data-loss')) {
    throw new Error('Prisma output is not a warning-only db push refusal.');
  }
  if (/\b(?:drop|rename|recreated?|re-created)\b/i.test(log)) {
    throw new Error('Destructive drop, rename, or recreate warning is never approved for release 0.1.8.');
  }

  const lines = log.split(/\r?\n/);
  const extraWarningMarker = lines
    .map((line) => line.trim())
    .find((line) => (
      /^(?:warn(?:ing)?s?)\b/i.test(line)
      || (/^⚠️/u.test(line) && !/^⚠️\s*There might be data loss when applying the changes:$/iu.test(line))
    ));
  if (extraWarningMarker) {
    throw new Error(`Unapproved or extra Prisma warning marker: ${extraWarningMarker}`);
  }
  const unexpectedError = lines
    .map((line) => line.trim())
    .find((line) => /^Error:/i.test(line) && !line.includes('--accept-data-loss'));
  if (unexpectedError) throw new Error(`Prisma output contains an extra error: ${unexpectedError}`);

  const warnings = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('•'))
    .map((line) => line.slice(1).replace(/\s+/g, ' ').trim());
  if (warnings.length === 0) throw new Error('A non-empty Prisma warning set is required.');

  const accepted = [];
  const seen = new Set();
  for (const warning of warnings) {
    const key = parseUniqueWarning(warning);
    const signature = key ? ALLOWED_COMPOSITE_KEYS.get(key) : undefined;
    if (!key || !signature) {
      throw new Error(`Unapproved or extra Prisma db push warning: ${warning}`);
    }
    if (seen.has(key)) throw new Error(`Duplicate Prisma db push warning signature: ${signature}`);
    seen.add(key);
    accepted.push(signature);
  }

  return accepted;
}

function main() {
  const logPath = process.argv[2];
  if (!logPath) {
    throw new Error('Usage: node scripts/check-sellpia-db-push-warning.mjs <db-push-log>');
  }
  const acceptedWarnings = assertSafeSellpiaDbPushWarnings(
    readFileSync(logPath, 'utf8'),
    process.env.SELLPIA_CUTOVER_PREFLIGHT,
  );
  console.log(JSON.stringify({ targetRelease: '0.1.8', acceptedWarnings }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
