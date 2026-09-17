import {
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import {
  assertOwnerApprovals,
  type DependentRowStep,
  type OwnerApprovalRecord,
  type SqlClient,
} from '../helpers/dependent-row-removal';
import {
  approvalEntry as requiredColumnApproval,
  defineRequiredColumnCleanups,
  removeRowsBlockingRequiredColumns,
  type RequiredColumnCleanup,
} from '../helpers/required-column-row-cleanup';
import {
  approvalEntry as uniqueKeyApproval,
  defineUniqueKeyCleanups,
  removeRowsBlockingUniqueKeys,
  type UniqueKeyCleanup,
} from '../helpers/unique-key-row-cleanup';
import type { DataMigration, MigrationResult } from '../types';

/**
 * The release owner reviewed the v0.1.31 cutover impact inventory on
 * 2026-09-17 and approved deleting the human-entered rows it lists: the
 * sourcing decisions, review hand-offs, registered supplier offers, launch
 * plans, and procurement intents built on 0.1.30 evidence, and the Rocket
 * purchase confirmations a duplicate import run takes with it. KID-239 records
 * who approved it; scripts carry the role, not the name.
 */
const OWNER_APPROVAL: OwnerApprovalRecord = {
  by: 'release owner',
  at: '2026-09-17',
  scope: 'v0.1.31 cutover impact inventory (KID-239)',
};

const UNLINKED_SOURCING_SNAPSHOT =
  'PR #493 made ingestion_run_id a required foreign key to '
  + 'sourcing_evidence_ingestion_runs. A row written before that names no '
  + 'ingestion run, and the sources collect again as attempts.';

const RUNS = 'sourcing_evidence_ingestion_runs';
const OBSERVATIONS = 'sourcing_evidence_observations';
const OFFER_KEYWORD_OBSERVATIONS = 'sourcing_1688_offer_keyword_observations';
const OFFER_SNAPSHOTS = 'supplier_offer_sku_snapshots';
const LAUNCH_CANDIDATES = 'sourcing_launch_candidates';
const DECISION_ITEMS = 'sourcing_decision_batch_items';
const PRICE_TIERS = 'supplier_offer_price_tiers';

/**
 * Every foreign key into an Office 0.1.30 ingestion run, directly or through
 * the rows that must go first, as of the Office schema and this release, in
 * delete order. Office has only the observation chain; the four fact tables
 * and the six snapshot tables reference runs once `db push` has run, so their
 * steps apply only to a database that already has those keys. No kept table
 * references any of these rows, so nothing is unlinked.
 */
const PRE_CUTOVER_INGESTION_RUN_DEPENDENTS: readonly DependentRowStep[] = [
  // Procurement intents, sourcing decisions, launch plans, registered supplier
  // offers, and review hand-offs people made on 0.1.30 evidence.
  { action: 'delete', table: 'procurement_test_intents', column: 'decision_batch_item_id', references: DECISION_ITEMS, kind: 'human-entered' },
  { action: 'delete', table: 'procurement_test_intents', column: 'launch_candidate_id', references: LAUNCH_CANDIDATES, kind: 'human-entered' },
  { action: 'delete', table: 'procurement_test_intents', column: 'selected_price_tier_id', references: PRICE_TIERS, kind: 'human-entered' },
  { action: 'delete', table: 'procurement_test_intents', column: 'supplier_offer_sku_snapshot_id', references: OFFER_SNAPSHOTS, kind: 'human-entered' },
  { action: 'delete', table: 'sourcing_decision_evidence', column: 'decision_batch_item_id', references: DECISION_ITEMS, kind: 'human-entered' },
  { action: 'delete', table: 'sourcing_decision_evidence', column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'human-entered' },
  { action: 'delete', table: DECISION_ITEMS, column: 'launch_candidate_id', references: LAUNCH_CANDIDATES, kind: 'human-entered' },
  { action: 'delete', table: DECISION_ITEMS, column: 'supplier_offer_sku_snapshot_id', references: OFFER_SNAPSHOTS, kind: 'human-entered' },
  { action: 'delete', table: LAUNCH_CANDIDATES, column: 'supersedes_launch_candidate_id', references: LAUNCH_CANDIDATES, kind: 'human-entered' },
  { action: 'delete', table: LAUNCH_CANDIDATES, column: 'supplier_offer_sku_snapshot_id', references: OFFER_SNAPSHOTS, kind: 'human-entered' },
  { action: 'delete', table: PRICE_TIERS, column: 'supplier_offer_sku_snapshot_id', references: OFFER_SNAPSHOTS, kind: 'human-entered' },
  { action: 'delete', table: OFFER_SNAPSHOTS, column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'human-entered' },
  { action: 'delete', table: 'sourcing_review_batch_items', column: 'offer_keyword_observation_id', references: OFFER_KEYWORD_OBSERVATIONS, kind: 'human-entered' },
  // Recommendation and validation links computed from the evidence.
  { action: 'delete', table: 'sourcing_recommendation_item_evidence', column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'derived' },
  { action: 'delete', table: 'sourcing_validation_check_evidence', column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'derived' },
  // Collected facts.
  { action: 'delete', table: 'sourcing_wing_catalog_product_facts', column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'collected' },
  { action: 'delete', table: 'sourcing_wing_catalog_product_facts', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'sourcing_keyword_suggestion_facts', column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'collected' },
  { action: 'delete', table: 'sourcing_keyword_suggestion_facts', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'sourcing_naver_keyword_analysis_facts', column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'collected' },
  { action: 'delete', table: 'sourcing_naver_keyword_analysis_facts', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'sourcing_market_shadow_facts', column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'collected' },
  { action: 'delete', table: 'sourcing_market_shadow_facts', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: OFFER_KEYWORD_OBSERVATIONS, column: 'evidence_observation_id', references: OBSERVATIONS, kind: 'collected' },
  { action: 'delete', table: OFFER_KEYWORD_OBSERVATIONS, column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: OBSERVATIONS, column: 'supersedes_observation_id', references: OBSERVATIONS, kind: 'collected' },
  { action: 'delete', table: OBSERVATIONS, column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'naver_keyword_daily_snapshots', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'naver_popular_keyword_daily_snapshots', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'shorts_trend_daily_snapshots', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'live_commerce_broadcast_daily_snapshots', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'live_commerce_product_daily_snapshots', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
  { action: 'delete', table: 'tiktok_creative_trend_daily_snapshots', column: 'ingestion_run_id', references: RUNS, kind: 'collected' },
];

/**
 * KID-239: the tables whose Office 0.1.30 rows cannot hold, or cannot be read
 * without, a column v0.1.31 makes required. The owner decided on 2026-09-17
 * to delete these rows instead of backfilling them, signal alerts included
 * (ADR-0010). No foreign key references the first seven tables, in the Office
 * 0.1.30 schema or in v0.1.31.
 *
 * The ingestion-run entry comes last, after the six snapshot tables, three of
 * which reference runs with Restrict once v0.1.31's keys exist. Restated
 * because a migration records one moment.
 */
export const REQUIRED_COLUMN_CLEANUPS = defineRequiredColumnCleanups([
  {
    table: 'naver_keyword_daily_snapshots',
    requiredColumn: 'ingestion_run_id',
    reason: UNLINKED_SOURCING_SNAPSHOT,
  },
  {
    table: 'naver_popular_keyword_daily_snapshots',
    requiredColumn: 'ingestion_run_id',
    reason: UNLINKED_SOURCING_SNAPSHOT,
  },
  {
    table: 'shorts_trend_daily_snapshots',
    requiredColumn: 'ingestion_run_id',
    reason: UNLINKED_SOURCING_SNAPSHOT,
  },
  {
    table: 'live_commerce_broadcast_daily_snapshots',
    requiredColumn: 'ingestion_run_id',
    reason: UNLINKED_SOURCING_SNAPSHOT,
  },
  {
    table: 'live_commerce_product_daily_snapshots',
    requiredColumn: 'ingestion_run_id',
    reason: UNLINKED_SOURCING_SNAPSHOT,
  },
  {
    table: 'tiktok_creative_trend_daily_snapshots',
    requiredColumn: 'ingestion_run_id',
    reason: UNLINKED_SOURCING_SNAPSHOT,
  },
  {
    table: 'alerts',
    requiredColumn: 'dedupe_key',
    reason:
      'The alert contract made dedupe_key required, and its @default(uuid()) '
      + 'is generated by the Prisma client, so the database cannot fill existing '
      + 'rows. v0.1.31:005 keeps signal alerts, which Office 0.1.30 writes, and '
      + 'ADR-0010 does not keep alerts.',
  },
  {
    table: RUNS,
    requiredColumn: 'is_current_complete',
    reason:
      'v0.1.31 reads a sourcing attempt through its frozen attempt_plan, the '
      + 'RUNNING/COMPLETE/FAILED status words, and the is_current_complete '
      + 'pointer that arrives with it. An Office 0.1.30 run has no plan and '
      + 'other status words (collecting, cancel_requested, complete, partial, '
      + 'failed, quarantined, cancelled, superseded); read as the latest '
      + 'attempt, it is rejected with SOURCE_PLAN_MALFORMED. The sources '
      + 'collect again as attempts.',
    dependents: PRE_CUTOVER_INGESTION_RUN_DEPENDENTS,
    ownerApproval: OWNER_APPROVAL,
  },
]);

const IMPORT_RUNS = 'source_import_runs';
const CONFIRMATIONS = 'rocket_purchase_confirmations';
const SCRAPE_SNAPSHOTS = 'channel_scrape_snapshots';
const SCRAPE_RUNS = 'channel_scrape_runs';
const AD_TARGET_DAYS = 'channel_ad_target_daily_snapshots';

/** A published ABC formula state is all of these or none of them, as v0.1.31:012 clears it. */
const ABC_PUBLICATION = [
  'published_sellpia_source_import_run_id',
  'published_advertising_source_import_run_id',
  'published_mapping_generation',
  'published_at',
  'official_cutoff_date',
] as const;

/**
 * Every foreign key into `source_import_runs`, or into a table a removed run
 * takes with it, as of the Office 0.1.30 schema and this release, in
 * execution order. On Office, only the Rocket PO, Rocket confirmation, scrape
 * run, order, listing, and Sellpia inventory keys exist.
 *
 * - The owner accepted that a removed run takes its Rocket purchase
 *   confirmations, with their lines, allocations, and transmissions.
 * - Collected facts and ABC calculations go with the run, and carried-forward
 *   rows lose only their pointer, as v0.1.31:012 treats an unknown-status run.
 * - ADR-0010 kept rows are only unlinked. A kept transport receipt or
 *   consumption that cites the run itself cannot be, so it keeps the run.
 */
const IMPORT_RUN_DEPENDENTS: readonly DependentRowStep[] = [
  { action: 'unlink', table: 'coupang_direct_transport_receipts', column: 'rocket_purchase_confirmation_id', references: CONFIRMATIONS },
  { action: 'delete', table: 'rocket_purchase_confirmation_allocations', column: 'confirmation_line_id', references: 'rocket_purchase_confirmation_lines', kind: 'human-entered' },
  { action: 'delete', table: 'rocket_purchase_confirmation_lines', column: 'confirmation_id', references: CONFIRMATIONS, kind: 'human-entered' },
  { action: 'delete', table: 'rocket_purchase_confirmation_transmissions', column: 'confirmation_id', references: CONFIRMATIONS, kind: 'human-entered' },
  { action: 'delete', table: 'rocket_purchase_confirmation_transmissions', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'human-entered' },
  { action: 'delete', table: CONFIRMATIONS, column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'human-entered' },
  { action: 'keep', table: 'coupang_direct_transport_receipts', column: 'effect_source_import_run_id', references: IMPORT_RUNS },
  { action: 'keep', table: 'coupang_direct_transport_consumptions', column: 'source_import_run_id', references: IMPORT_RUNS },
  { action: 'unlink', table: 'ad_actions', column: 'ad_target_daily_id', references: AD_TARGET_DAYS },
  { action: 'unlink', table: AD_TARGET_DAYS, column: 'raw_snapshot_id', references: SCRAPE_SNAPSHOTS },
  { action: 'delete', table: AD_TARGET_DAYS, column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'unlink', table: 'channel_listing_daily_snapshots', column: 'raw_snapshot_id', references: SCRAPE_SNAPSHOTS },
  { action: 'unlink', table: 'channel_listing_option_daily_snapshots', column: 'raw_snapshot_id', references: SCRAPE_SNAPSHOTS },
  { action: 'unlink', table: 'channel_account_daily_kpi_snapshots', column: 'raw_snapshot_id', references: SCRAPE_SNAPSHOTS },
  { action: 'delete', table: SCRAPE_SNAPSHOTS, column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'unlink', table: SCRAPE_SNAPSHOTS, column: 'scrape_run_id', references: SCRAPE_RUNS },
  { action: 'delete', table: 'channel_scrape_chunks', column: 'scrape_run_id', references: SCRAPE_RUNS, kind: 'collected' },
  { action: 'delete', table: SCRAPE_RUNS, column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'rocket_po_catalog_lines', column: 'snapshot_id', references: 'rocket_po_catalog_snapshots', kind: 'collected' },
  { action: 'delete', table: 'rocket_po_catalog_snapshots', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'channel_ad_listing_product_monthly_facts', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'coupang_keyword_rank_daily_snapshots', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'coupang_keyword_serp_daily_snapshots', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'coupang_wing_sales_rank_daily_snapshots', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'coupang_shipment_date_summaries', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'sellpia_sales_daily_snapshots', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'sellpia_product_monthly_sales', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'order_collection_artifacts', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'review_collection_chunks', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'reviews', column: 'source_import_run_id', references: IMPORT_RUNS, kind: 'collected' },
  { action: 'delete', table: 'master_product_abc_evaluations', column: 'sellpia_source_import_run_id', references: IMPORT_RUNS, kind: 'derived' },
  { action: 'delete', table: 'master_product_abc_evaluations', column: 'advertising_source_import_run_id', references: IMPORT_RUNS, kind: 'derived' },
  { action: 'delete', table: 'master_product_abc_grade_histories', column: 'previous_sellpia_source_import_run_id', references: IMPORT_RUNS, kind: 'derived' },
  { action: 'delete', table: 'master_product_abc_grade_histories', column: 'next_sellpia_source_import_run_id', references: IMPORT_RUNS, kind: 'derived' },
  { action: 'delete', table: 'master_product_abc_grade_histories', column: 'previous_advertising_source_import_run_id', references: IMPORT_RUNS, kind: 'derived' },
  { action: 'delete', table: 'master_product_abc_grade_histories', column: 'next_advertising_source_import_run_id', references: IMPORT_RUNS, kind: 'derived' },
  { action: 'unlink', table: 'master_product_abc_formula_states', column: 'published_sellpia_source_import_run_id', references: IMPORT_RUNS, alsoClear: ABC_PUBLICATION },
  { action: 'unlink', table: 'master_product_abc_formula_states', column: 'published_advertising_source_import_run_id', references: IMPORT_RUNS, alsoClear: ABC_PUBLICATION },
  { action: 'unlink', table: 'orders', column: 'source_import_run_id', references: IMPORT_RUNS },
  { action: 'unlink', table: 'channel_listings', column: 'last_import_run_id', references: IMPORT_RUNS },
  { action: 'unlink', table: 'channel_listing_options', column: 'last_import_run_id', references: IMPORT_RUNS },
  { action: 'unlink', table: 'sellpia_inventory_skus', column: 'last_import_run_id', references: IMPORT_RUNS },
  { action: 'unlink', table: 'sellpia_inventory_states', column: 'last_completed_import_run_id', references: IMPORT_RUNS },
];

const STALE_RUNNING_ATTEMPT =
  'v0.1.31 allows one running attempt per source and account. A running run '
  + 'without expires_at, as every Office 0.1.30 run is, counts as expired, and '
  + 'the source owner marks it failed on its next attempt. The newest running '
  + 'run stays. An older one goes with its dependent rows, or is marked failed '
  + 'when an ADR-0010 kept row references it.';

const DUPLICATED_GENERATION =
  'v0.1.31 numbers a source\'s attempts with freshness_generation and reads '
  + 'the highest. The newest run keeps a shared number, and an older one goes '
  + 'with its dependent rows. Clearing its number instead would make it read '
  + 'as the latest attempt, so a kept row that cannot be unlinked from it stops '
  + 'the migration.';

const MARK_FAILED = { column: 'status', value: SOURCE_IMPORT_RUN_FAILED_STATUS } as const;
const RUNNING = { column: 'status', equals: SOURCE_IMPORT_RUN_RUNNING_STATUS } as const;
const WITH_ACCOUNT = { column: 'channel_account_id', isNotNull: true } as const;
const WITH_GENERATION = { column: 'freshness_generation', isNotNull: true } as const;
const sourceType = (value: string) => ({ column: 'source_type', equals: value }) as const;
const RUNNING_KEY = {
  table: IMPORT_RUNS,
  neutralize: MARK_FAILED,
  reason: STALE_RUNNING_ATTEMPT,
  dependents: IMPORT_RUN_DEPENDENTS,
  ownerApproval: OWNER_APPROVAL,
} as const;
const GENERATION_KEY = {
  table: IMPORT_RUNS,
  reason: DUPLICATED_GENERATION,
  dependents: IMPORT_RUN_DEPENDENTS,
  ownerApproval: OWNER_APPROVAL,
} as const;

/**
 * KID-239: the unique keys v0.1.31 adds to `source_import_runs` over columns
 * Office 0.1.30 already has, as `prisma/models/core.prisma` declares them.
 * Office 0.1.30 writes none of these source types, so an Office database
 * should hold no duplicate; the entries make sure `db push` cannot stop on
 * one. They run after v0.1.31:007 and :012, so every status is running,
 * completed, or failed, and `failed` satisfies source_import_runs_status_check.
 */
export const UNIQUE_KEY_CLEANUPS = defineUniqueKeyCleanups([
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_ad_keyword_running_key',
    columns: ['organization_id', 'source_type', 'channel_account_id'],
    where: [sourceType('coupang_ad_keyword'), RUNNING],
  },
  {
    ...GENERATION_KEY,
    index: 'source_import_runs_ad_keyword_generation_key',
    columns: ['organization_id', 'source_type', 'channel_account_id', 'freshness_generation'],
    where: [sourceType('coupang_ad_keyword'), WITH_GENERATION],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_ad_campaign_running_key',
    columns: ['organization_id', 'source_type', 'channel_account_id'],
    where: [sourceType('coupang_ad_campaign'), RUNNING],
  },
  {
    ...GENERATION_KEY,
    index: 'source_import_runs_ad_campaign_generation_key',
    columns: ['organization_id', 'source_type', 'channel_account_id', 'freshness_generation'],
    where: [sourceType('coupang_ad_campaign'), WITH_GENERATION],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_ads_daily_running_key',
    columns: ['organization_id', 'source_type'],
    where: [sourceType('coupang_ads_daily'), RUNNING],
  },
  {
    ...GENERATION_KEY,
    index: 'source_import_runs_ads_daily_generation_key',
    columns: ['organization_id', 'source_type', 'channel_account_id', 'freshness_generation'],
    where: [sourceType('coupang_ads_daily'), WITH_ACCOUNT, WITH_GENERATION],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_wing_itemwinner_running_key',
    columns: ['organization_id', 'source_type', 'channel_account_id'],
    where: [sourceType('coupang_wing_itemwinner'), WITH_ACCOUNT, RUNNING],
  },
  {
    ...GENERATION_KEY,
    index: 'source_import_runs_wing_itemwinner_generation_key',
    columns: ['organization_id', 'source_type', 'channel_account_id', 'freshness_generation'],
    where: [sourceType('coupang_wing_itemwinner'), WITH_ACCOUNT, WITH_GENERATION],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_sellpia_profitability_running_key',
    columns: ['organization_id', 'source_type'],
    where: [sourceType('sellpia_product_profitability'), RUNNING],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_sellpia_sales_running_key',
    columns: ['organization_id', 'source_type'],
    where: [sourceType('sellpia_sales_daily'), RUNNING],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_coupang_ad_profitability_running_key',
    columns: ['organization_id', 'source_type'],
    where: [sourceType('coupang_ad_profitability'), RUNNING],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_shipment_summary_running_key',
    columns: ['organization_id', 'source_type'],
    where: [sourceType('coupang_shipment_summary'), RUNNING],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_coupang_reviews_running_key',
    columns: ['organization_id', 'source_type'],
    where: [sourceType('coupang_reviews'), RUNNING],
  },
  {
    ...RUNNING_KEY,
    index: 'source_import_runs_rocket_po_running_key',
    columns: ['organization_id', 'source_type', 'channel_account_id'],
    where: [sourceType('coupang_rocket_po_catalog'), RUNNING],
  },
  {
    ...GENERATION_KEY,
    index: 'source_import_runs_rocket_po_generation_key',
    columns: ['organization_id', 'source_type', 'channel_account_id', 'freshness_generation'],
    where: [sourceType('coupang_rocket_po_catalog'), WITH_GENERATION],
  },
  {
    ...GENERATION_KEY,
    index: 'source_import_runs_shipment_summary_generation_key',
    columns: ['organization_id', 'source_type', 'freshness_generation'],
    where: [sourceType('coupang_shipment_summary'), WITH_GENERATION],
  },
]);

const NEW_NULLABLE_KEY_COLUMN =
  'A key column arrives without a database default, so it is NULL on every '
  + 'existing row, and a unique index never compares a row with a NULL key column.';
const OFFICE_UNIQUE_SAME_COLUMNS =
  'Office 0.1.30 already holds these columns unique in a full index, which '
  + '`db push` replaces with this partial one.';
const EMPTIED_TABLE =
  'The key includes a required column without a database default, so a '
  + 'required-column cleanup above empties the table first.';

/**
 * Every other unique index v0.1.31 adds to a table Office 0.1.30 already has,
 * and why no rows need to go for it, from `prisma migrate diff` between
 * `release/office` and this release. Kept here so the list above reads as a
 * decision rather than an omission.
 */
export const UNIQUE_KEYS_WITHOUT_CLEANUP: Readonly<Record<string, string>> = Object.freeze({
  source_import_runs_source_idempotency_key: NEW_NULLABLE_KEY_COLUMN,
  source_import_runs_keyword_serp_running_key: NEW_NULLABLE_KEY_COLUMN,
  source_import_runs_keyword_serp_generation_key: NEW_NULLABLE_KEY_COLUMN,
  channel_scrape_snapshots_serp_capture_key: NEW_NULLABLE_KEY_COLUMN,
  channel_ad_target_daily_generation_key: NEW_NULLABLE_KEY_COLUMN,
  channel_ad_target_keyword_group_generation_key: NEW_NULLABLE_KEY_COLUMN,
  sellpia_sales_daily_source_run_key: NEW_NULLABLE_KEY_COLUMN,
  sellpia_product_monthly_sales_generation_identity_key: NEW_NULLABLE_KEY_COLUMN,
  shipment_date_summary_attempt_date_key: NEW_NULLABLE_KEY_COLUMN,
  reviews_org_source_run_external_key: NEW_NULLABLE_KEY_COLUMN,
  channel_ad_target_daily_legacy_key: OFFICE_UNIQUE_SAME_COLUMNS,
  sellpia_sales_daily_legacy_key: OFFICE_UNIQUE_SAME_COLUMNS,
  sellpia_product_monthly_sales_legacy_identity_key: OFFICE_UNIQUE_SAME_COLUMNS,
  shipment_date_summary_baseline_date_key: OFFICE_UNIQUE_SAME_COLUMNS,
  reviews_org_platform_external_legacy_key: OFFICE_UNIQUE_SAME_COLUMNS,
  sourcing_1688_offer_keyword_observations_identity_key:
    'Office 0.1.30 already holds every column of this key but ingestion_run_id unique.',
  sourcing_evidence_ingestion_runs_org_source_idempotency_key:
    'Office 0.1.30 already holds (organization_id, idempotency_key) unique, and the '
    + 'ingestion-run cleanup above empties the table.',
  sourcing_evidence_ingestion_runs_active_target_key:
    'Office 0.1.30 writes only lowercase run statuses, so no existing run is RUNNING.',
  sourcing_evidence_ingestion_runs_one_current_complete_key:
    'is_current_complete arrives with DEFAULT false, so no existing run is current.',
  naver_keyword_daily_snapshots_organization_id_ingestion_run_key: EMPTIED_TABLE,
  naver_popular_keyword_daily_snapshots_organization_id_inges_key: EMPTIED_TABLE,
  shorts_trend_daily_snapshots_organization_id_ingestion_run__key: EMPTIED_TABLE,
  live_commerce_broadcast_daily_snapshots_organization_id_ing_key: EMPTIED_TABLE,
  live_commerce_product_daily_snapshots_organization_id_inges_key: EMPTIED_TABLE,
  tiktok_creative_trend_daily_snapshots_organization_id_inges_key: EMPTIED_TABLE,
  alerts_organization_id_dedupe_key_key: EMPTIED_TABLE,
});

/**
 * Removes what would stop `db push` for v0.1.31, or what v0.1.31 cannot read:
 * rows that cannot hold a new required column, then duplicates under a new
 * unique key. A pending owner approval on either list stops it before the
 * first statement.
 */
export async function removeRowsBlockingSchemaStep(
  tx: SqlClient,
  lists: {
    requiredColumns: readonly RequiredColumnCleanup[];
    uniqueKeys: readonly UniqueKeyCleanup[];
  } = { requiredColumns: REQUIRED_COLUMN_CLEANUPS, uniqueKeys: UNIQUE_KEY_CLEANUPS },
): Promise<MigrationResult> {
  assertOwnerApprovals([
    ...lists.requiredColumns.map(requiredColumnApproval),
    ...lists.uniqueKeys.map(uniqueKeyApproval),
  ]);
  const requiredColumns = await removeRowsBlockingRequiredColumns(tx, lists.requiredColumns);
  const uniqueKeys = await removeRowsBlockingUniqueKeys(tx, lists.uniqueKeys);
  return {
    affectedRows: requiredColumns.affectedRows + uniqueKeys.affectedRows,
    details: { requiredColumns: requiredColumns.details, uniqueKeys: uniqueKeys.details },
  };
}

/**
 * Pre-schema and registered right after 013, so 005 and 008 have already
 * recorded their alert work when this deletes the alerts that remain, and 007
 * and 012 have settled every import-run status. The Office deployer's cutover
 * survey runs after the pre-schema phase and stops before `db push` if a row
 * still blocks it.
 */
export const removeRowsBlockingRequiredColumnsMigration: DataMigration = {
  id: 'v0.1.31:014_remove_rows_blocking_required_columns',
  releaseVersion: '0.1.31',
  name: 'Remove rows that block required columns or new unique keys before db push',
  phase: 'pre-schema',
  run: (tx) => removeRowsBlockingSchemaStep(tx),
};
