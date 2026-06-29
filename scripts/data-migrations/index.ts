import { backfillSourcingCandidatesFromMasterProducts } from './v0.1.0/001_backfill_sourcing_candidates_from_master_products';
import { rewriteLegacyDetailEditorAlertHrefs } from './v0.1.0/002_rewrite_legacy_detail_editor_alert_hrefs';
import { relabelImageEditAgentInstancesToGeminiImage } from './v0.1.0/003_relabel_image_edit_agent_instances_to_gemini_image';
import { backfillContentArchiveClassification } from './v0.1.0/004_backfill_content_archive_classification';
import { backfillContentGenerationWorkspaceAssets } from './v0.1.1/001_backfill_content_generation_workspace_assets';
import { backfillDetailPageArtifacts } from './v0.1.1/002_backfill_detail_page_artifacts';
import { backfillSourcingCandidateImages } from './v0.1.1/003_backfill_sourcing_candidate_images';
import { backfillGeneratedContentCandidates } from './v0.1.1/004_backfill_generated_content_candidates';
import { rewriteProductContentRouteHrefs } from './v0.1.1/005_rewrite_product_content_route_hrefs';
import { backfillRegistrationWorkspaces } from './v0.1.1/006_backfill_registration_workspaces';
import { backfillChannelListingAccounts } from './v0.1.2/001_backfill_channel_listing_accounts';
import { renameRegistrationWorkspacesToContentWorkspaces } from './v0.1.2/002_rename_registration_workspaces_to_content_workspaces';
import { retireFixedAiAgentOsRequests } from './v0.1.2/003_retire_fixed_ai_agent_os_requests';
import { removeLegacySourcingWorkspaceSnapshotPayloads } from './v0.1.3/001_remove_legacy_sourcing_workspace_snapshot_payloads';
import { recordAgentOsOperatorBackboneRelease } from './v0.1.4/001_record_agent_os_operator_backbone_release';
import { recordRocketReadModelRelease } from './v0.1.6/001_record_rocket_read_model_release';
import { recordSellpiaRocketInventorySyncRelease } from './v0.1.7/001_record_sellpia_rocket_inventory_sync_release';
import type { DataMigration } from './types';

export {
  isLegacyDetailEditorHref,
  rewriteLegacyDetailEditorHref,
} from './v0.1.0/002_rewrite_legacy_detail_editor_alert_hrefs';
export {
  isProductContentRouteHrefRewriteNeeded,
  rewriteProductContentRouteHref,
} from './v0.1.1/005_rewrite_product_content_route_hrefs';

export const dataMigrations: readonly DataMigration[] = [
  backfillSourcingCandidatesFromMasterProducts,
  rewriteLegacyDetailEditorAlertHrefs,
  relabelImageEditAgentInstancesToGeminiImage,
  backfillContentArchiveClassification,
  backfillContentGenerationWorkspaceAssets,
  backfillDetailPageArtifacts,
  backfillSourcingCandidateImages,
  backfillGeneratedContentCandidates,
  rewriteProductContentRouteHrefs,
  backfillRegistrationWorkspaces,
  backfillChannelListingAccounts,
  renameRegistrationWorkspacesToContentWorkspaces,
  retireFixedAiAgentOsRequests,
  removeLegacySourcingWorkspaceSnapshotPayloads,
  recordAgentOsOperatorBackboneRelease,
  recordRocketReadModelRelease,
  recordSellpiaRocketInventorySyncRelease,
];

export const DATA_MIGRATION_IDS = Object.freeze(
  dataMigrations.map((migration) => migration.id),
);

export const DATA_MIGRATION_RELEASES = Object.freeze(
  [...new Set(dataMigrations.map((migration) => migration.releaseVersion))],
);
