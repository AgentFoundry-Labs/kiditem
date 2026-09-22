import { recordAgentOsOperatorBackboneRelease } from "./v0.1.4/001_record_agent_os_operator_backbone_release";
import { recordRocketReadModelRelease } from "./v0.1.6/001_record_rocket_read_model_release";
import { recordSellpiaRocketInventorySyncRelease } from "./v0.1.7/001_record_sellpia_rocket_inventory_sync_release";
import { migrateRepresentativeKeywordOverrides } from "./v0.1.18/001_migrate_representative_keyword_overrides";
import { dedupeDetailPageArtifacts } from "./v0.1.24/001_dedupe_detail_page_artifacts";
import { repairAdCampaignTargetConversions } from "./v0.1.25/003_repair_ad_campaign_target_conversions";
import { rekeyAdCampaignProductTargets } from "./v0.1.25/004_rekey_ad_campaign_product_targets";
import { moveVariantRecipesToChannelOptions } from "./v0.1.30/003_move_variant_recipes_to_channel_options";
import { resetSourcingDisplayState } from "./v0.1.30/005_reset_sourcing_display_state";
import { resetAbsoluteProductAbc } from "./v0.1.31/001_reset_absolute_product_abc";
import { initializeAbsoluteProductAbcFormula } from "./v0.1.31/002_initialize_absolute_product_abc_formula";
import { prepareOperationAutomationCutoverMigration } from "./v0.1.31/003_prepare_operation_automation_cutover";
import { removeRetiredCapabilityOperationRefs } from "./v0.1.31/004_remove_retired_capability_operation_refs";
import { removeRetiredOperationAlerts } from "./v0.1.31/005_remove_retired_operation_alerts";
import { backfillCoupangDirectTransportReceiptsMigration } from "./v0.1.31/006_backfill_coupang_direct_transport_receipts";
import { normalizeSourceImportRunCompletedStatusMigration } from "./v0.1.31/007_normalize_source_import_run_completed_status";
import { backfillAlertReadAtFromIsReadMigration } from "./v0.1.31/008_backfill_alert_read_at_from_is_read";
import { backfillCapabilityApprovalDecisionMigration } from "./v0.1.31/009_backfill_capability_approval_decision";
import { backfillThumbnailTrackingInconclusiveMarkMigration } from "./v0.1.31/010_backfill_thumbnail_tracking_inconclusive_mark";
import { backfillAdActionExecutionTasksMigration } from "./v0.1.31/011_backfill_ad_action_execution_tasks";
import { constrainSourceImportRunStatusMigration } from "./v0.1.31/012_constrain_source_import_run_status";
import { removeRetiredAccountKpiAndAdTierRowsMigration } from "./v0.1.31/013_remove_retired_account_kpi_and_ad_tier_rows";
import { backfillChannelListingImageFromDiscoveryMigration } from "./v0.1.31/014_backfill_channel_listing_image_from_discovery";
import { activateAdFreeProductAbcFormula } from "./v0.1.31/016_activate_ad_free_product_abc_formula";
import { removeRowsBlockingRequiredColumnsMigration } from "./v0.1.31/014_remove_rows_blocking_required_columns";
import { closeStaleAdApprovalsAtCutoverMigration } from "./v0.1.31/015_close_stale_ad_approvals_at_cutover";
import { migrateMasterProductInventoryCutoverMigration } from "./v0.1.31/016_master_product_inventory_cutover";
import { simplifyProductReferencesMigration } from "./v0.1.31/017_simplify_product_references";
import { prepareSellingCatalogSourcesMigration } from './v0.1.31/019_prepare_selling_catalog_sources';
import { registrationTargetCutoverMigration } from './v0.1.31/022_registration_target_cutover';
import { salesProductDraftCutoverMigration } from './v0.1.31/023_sales_product_draft_cutover';
import { contentWorkspaceOwnerCutoverMigration } from './v0.1.31/024_content_workspace_owner_cutover';
import { sellingCatalogCutoverMigration } from './v0.1.31/020_selling_catalog_cutover';
import retiredDataMigrationCatalog from "./retired.json";
import type { DataMigration, RetiredDataMigration } from "./types";

export {
  isLegacyDetailEditorHref,
  rewriteLegacyDetailEditorHref,
} from "./v0.1.0/002_rewrite_legacy_detail_editor_alert_hrefs";
export {
  isProductContentRouteHrefRewriteNeeded,
  rewriteProductContentRouteHref,
} from "./v0.1.1/005_rewrite_product_content_route_hrefs";

export const dataMigrations: readonly DataMigration[] = [
  recordAgentOsOperatorBackboneRelease,
  recordRocketReadModelRelease,
  recordSellpiaRocketInventorySyncRelease,
  migrateRepresentativeKeywordOverrides,
  dedupeDetailPageArtifacts,
  repairAdCampaignTargetConversions,
  rekeyAdCampaignProductTargets,
  moveVariantRecipesToChannelOptions,
  resetSourcingDisplayState,
  resetAbsoluteProductAbc,
  prepareOperationAutomationCutoverMigration,
  removeRetiredCapabilityOperationRefs,
  removeRetiredOperationAlerts,
  normalizeSourceImportRunCompletedStatusMigration,
  backfillAlertReadAtFromIsReadMigration,
  backfillCapabilityApprovalDecisionMigration,
  backfillThumbnailTrackingInconclusiveMarkMigration,
  backfillAdActionExecutionTasksMigration,
  constrainSourceImportRunStatusMigration,
  removeRetiredAccountKpiAndAdTierRowsMigration,
  backfillChannelListingImageFromDiscoveryMigration,
  removeRowsBlockingRequiredColumnsMigration,
  closeStaleAdApprovalsAtCutoverMigration,
  // 019 captures template references before 016 removes the legacy source table.
  prepareSellingCatalogSourcesMigration,
  migrateMasterProductInventoryCutoverMigration,
  simplifyProductReferencesMigration,
  sellingCatalogCutoverMigration,
  registrationTargetCutoverMigration,
  // 023 runs after 022 has created the registration targets it tidies.
  salesProductDraftCutoverMigration,
  // 024 moves the content workspace onto the draft 023 creates, and refuses to
  // run before it.
  contentWorkspaceOwnerCutoverMigration,
  initializeAbsoluteProductAbcFormula,
  backfillCoupangDirectTransportReceiptsMigration,
  activateAdFreeProductAbcFormula,
];

export const DATA_MIGRATION_IDS = Object.freeze(
  dataMigrations.map((migration) => migration.id),
);

export const DATA_MIGRATION_RELEASES = Object.freeze([
  ...new Set(dataMigrations.map((migration) => migration.releaseVersion)),
]);

export const retiredDataMigrations: readonly RetiredDataMigration[] =
  Object.freeze(retiredDataMigrationCatalog);
