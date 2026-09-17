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
  initializeAbsoluteProductAbcFormula,
  backfillCoupangDirectTransportReceiptsMigration,
];

export const DATA_MIGRATION_IDS = Object.freeze(
  dataMigrations.map((migration) => migration.id),
);

export const DATA_MIGRATION_RELEASES = Object.freeze([
  ...new Set(dataMigrations.map((migration) => migration.releaseVersion)),
]);

export const retiredDataMigrations: readonly RetiredDataMigration[] =
  Object.freeze(retiredDataMigrationCatalog);
