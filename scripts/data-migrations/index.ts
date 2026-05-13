import { backfillSourcingCandidatesFromMasterProducts } from './v0.1.0/001_backfill_sourcing_candidates_from_master_products';
import { rewriteLegacyDetailEditorAlertHrefs } from './v0.1.0/002_rewrite_legacy_detail_editor_alert_hrefs';
import type { DataMigration } from './types';

export {
  isLegacyDetailEditorHref,
  rewriteLegacyDetailEditorHref,
} from './v0.1.0/002_rewrite_legacy_detail_editor_alert_hrefs';

export const dataMigrations: readonly DataMigration[] = [
  backfillSourcingCandidatesFromMasterProducts,
  rewriteLegacyDetailEditorAlertHrefs,
];

export const DATA_MIGRATION_IDS = Object.freeze(
  dataMigrations.map((migration) => migration.id),
);

export const DATA_MIGRATION_RELEASES = Object.freeze(
  [...new Set(dataMigrations.map((migration) => migration.releaseVersion))],
);
