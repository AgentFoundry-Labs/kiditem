import { recordAgentOsOperatorBackboneRelease } from "./v0.1.4/001_record_agent_os_operator_backbone_release";
import { recordRocketReadModelRelease } from "./v0.1.6/001_record_rocket_read_model_release";
import { recordSellpiaRocketInventorySyncRelease } from "./v0.1.7/001_record_sellpia_rocket_inventory_sync_release";
import { migrateRepresentativeKeywordOverrides } from "./v0.1.18/001_migrate_representative_keyword_overrides";
import { sellpiaInventoryFreshnessMigration } from "./v0.1.19/001_sellpia_inventory_freshness";
import { backfillInventoryCommitments } from "./v0.1.21/001_backfill_inventory_commitments";
import { repairAdCampaignDailyBusinessDates } from "./v0.1.21/001_repair_ad_campaign_daily_business_dates";
import { repairCoupangAdsDailyConversions } from "./v0.1.21/002_repair_coupang_ads_daily_conversions";
import { repairAdCampaignTargetConversions } from "./v0.1.21/003_repair_ad_campaign_target_conversions";
import { rekeyAdCampaignProductTargets } from "./v0.1.21/004_rekey_ad_campaign_product_targets";
import { removeAmbiguousAdCampaignAccountKpis } from "./v0.1.21/005_remove_ambiguous_ad_campaign_account_kpis";
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
  backfillInventoryCommitments,
  repairAdCampaignDailyBusinessDates,
  repairCoupangAdsDailyConversions,
  repairAdCampaignTargetConversions,
  rekeyAdCampaignProductTargets,
  removeAmbiguousAdCampaignAccountKpis,
];

export const DATA_MIGRATION_IDS = Object.freeze(
  dataMigrations.map((migration) => migration.id),
);

export const DATA_MIGRATION_RELEASES = Object.freeze([
  ...new Set(dataMigrations.map((migration) => migration.releaseVersion)),
]);
