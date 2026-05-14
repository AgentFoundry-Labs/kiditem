import { backfillSourcingCandidatesFromMasterProducts } from './v0.1.0/001_backfill_sourcing_candidates_from_master_products';
import { rewriteLegacyDetailEditorAlertHrefs } from './v0.1.0/002_rewrite_legacy_detail_editor_alert_hrefs';
import { relabelImageEditAgentInstancesToGeminiImage } from './v0.1.0/003_relabel_image_edit_agent_instances_to_gemini_image';
import { backfillContentArchiveClassification } from './v0.1.0/004_backfill_content_archive_classification';
import { backfillContentGenerationWorkspaceAssets } from './v0.1.1/001_backfill_content_generation_workspace_assets';
import { backfillDetailPageArtifacts } from './v0.1.1/002_backfill_detail_page_artifacts';
import type { DataMigration } from './types';

export {
  isLegacyDetailEditorHref,
  rewriteLegacyDetailEditorHref,
} from './v0.1.0/002_rewrite_legacy_detail_editor_alert_hrefs';

export const dataMigrations: readonly DataMigration[] = [
  backfillSourcingCandidatesFromMasterProducts,
  rewriteLegacyDetailEditorAlertHrefs,
  relabelImageEditAgentInstancesToGeminiImage,
  backfillContentArchiveClassification,
  backfillContentGenerationWorkspaceAssets,
  backfillDetailPageArtifacts,
];

export const DATA_MIGRATION_IDS = Object.freeze(
  dataMigrations.map((migration) => migration.id),
);

export const DATA_MIGRATION_RELEASES = Object.freeze(
  [...new Set(dataMigrations.map((migration) => migration.releaseVersion))],
);
