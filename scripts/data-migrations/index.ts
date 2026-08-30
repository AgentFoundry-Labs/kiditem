import { recordAgentOsOperatorBackboneRelease } from "./v0.1.4/001_record_agent_os_operator_backbone_release";
import { recordRocketReadModelRelease } from "./v0.1.6/001_record_rocket_read_model_release";
import { recordSellpiaRocketInventorySyncRelease } from "./v0.1.7/001_record_sellpia_rocket_inventory_sync_release";
import { migrateRepresentativeKeywordOverrides } from "./v0.1.18/001_migrate_representative_keyword_overrides";
import { sellpiaInventoryFreshnessMigration } from "./v0.1.19/001_sellpia_inventory_freshness";
import { dedupeDetailPageArtifacts } from "./v0.1.24/001_dedupe_detail_page_artifacts";
import { repairAdCampaignDailyBusinessDates } from "./v0.1.25/001_repair_ad_campaign_daily_business_dates";
import { repairCoupangAdsDailyConversions } from "./v0.1.25/002_repair_coupang_ads_daily_conversions";
import { repairAdCampaignTargetConversions } from "./v0.1.25/003_repair_ad_campaign_target_conversions";
import { rekeyAdCampaignProductTargets } from "./v0.1.25/004_rekey_ad_campaign_product_targets";
import { removeAmbiguousAdCampaignAccountKpis } from "./v0.1.25/005_remove_ambiguous_ad_campaign_account_kpis";
import { initializeMasterProductAbcPolicy } from "./v0.1.26/001_initialize_master_product_abc_policy";
import { resetLegacyProductAbcGrades } from "./v0.1.30/001_reset_legacy_product_abc_grades";
import { backfillProfitabilitySourceFreshness } from "./v0.1.30/002_backfill_profitability_source_freshness";
import { moveVariantRecipesToChannelOptions } from "./v0.1.30/003_move_variant_recipes_to_channel_options";
import { canonicalMasterInventoryIdentity } from "./v0.1.30/004_canonical_master_inventory_identity";
import { resetSourcingDisplayState } from "./v0.1.30/005_reset_sourcing_display_state";
import type { DataMigration } from "./types";

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
  sellpiaInventoryFreshnessMigration,
  dedupeDetailPageArtifacts,
  repairAdCampaignDailyBusinessDates,
  repairCoupangAdsDailyConversions,
  repairAdCampaignTargetConversions,
  rekeyAdCampaignProductTargets,
  removeAmbiguousAdCampaignAccountKpis,
  initializeMasterProductAbcPolicy,
  resetLegacyProductAbcGrades,
  backfillProfitabilitySourceFreshness,
  moveVariantRecipesToChannelOptions,
  canonicalMasterInventoryIdentity,
  resetSourcingDisplayState,
];

export const DATA_MIGRATION_IDS = Object.freeze(
  dataMigrations.map((migration) => migration.id),
);

export const DATA_MIGRATION_RELEASES = Object.freeze([
  ...new Set(dataMigrations.map((migration) => migration.releaseVersion)),
]);
