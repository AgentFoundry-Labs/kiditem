import type { DependentRowStep, OwnerApprovalRecord } from '../helpers/dependent-row-removal';
import {
  defineRequiredColumnCleanups,
  removeRowsBlockingRequiredColumns,
} from '../helpers/required-column-row-cleanup';
import type { DataMigration } from '../types';

const ASSETS = 'content_assets';
const REVISIONS = 'detail_page_revisions';
const RENDER_INTENTS = 'detail_page_image_render_intents';
const IMAGE_ARTIFACTS = 'detail_page_image_artifacts';
const THUMBNAIL_SELECTIONS = 'content_workspace_thumbnail_selections';

/**
 * KID-313 W3 (2026-09-23): Office 0.1.30's candidate, draft, workspace and
 * thumbnail rows are discarded under ADR-0010 and collected again, so the
 * unpromoted 022–026 cutovers that moved them were removed. The release owner
 * recorded that decision in KID-313; scripts carry the role, not the name.
 */
const OWNER_APPROVAL: OwnerApprovalRecord = {
  by: 'release owner',
  at: '2026-09-23',
  scope: 'KID-313 W3: Office 0.1.30 content workspace, asset and detail page rows are discarded (ADR-0010)',
};

const DISCARDED_CONTENT =
  'KID-313 W3 folded the content tables (21 -> 9). The asset, revision and '
  + 'render-intent rows Office 0.1.30 holds belong to generation groups, '
  + 'detail page artifacts and candidate workspaces that the new schema '
  + 'drops, and the column that now names their workspace or detail page '
  + 'has no value for them. ADR-0010 discards them; content is made again '
  + 'on the sales product drafts.';

/**
 * Every foreign key into `content_assets`, or into a table the removal takes
 * with it, as of the Office 0.1.30 schema and this release, in delete order.
 * A step whose key a database lacks is inactive there: Office has no
 * `current_thumbnail_asset_id`, and this release drops the thumbnail
 * selections and generation bookkeeping.
 */
const ASSET_DEPENDENTS: readonly DependentRowStep[] = [
  // The workspace's pointer at its thumbnail (this release) or at an
  // operator's thumbnail pick (Office), then the pick.
  { action: 'unlink', table: 'content_workspaces', column: 'current_thumbnail_asset_id', references: ASSETS },
  { action: 'unlink', table: 'content_workspaces', column: 'current_thumbnail_selection_id', references: THUMBNAIL_SELECTIONS },
  { action: 'delete', table: THUMBNAIL_SELECTIONS, column: 'content_asset_id', references: ASSETS, kind: 'human-entered' },
  // Generation bookkeeping computed from the assets.
  { action: 'unlink', table: 'content_generation_sources', column: 'content_asset_id', references: ASSETS },
  { action: 'delete', table: 'content_generation_asset_usages', column: 'content_asset_id', references: ASSETS, kind: 'derived' },
];

/**
 * Every foreign key into `detail_page_revisions`, or into a table the removal
 * takes with it, as of the Office 0.1.30 schema and this release, in delete
 * order. Rendered images and render intents are derived from a revision; the
 * pointers at a current or selected revision are cleared and their rows stay.
 * Office has no `detail_pages`; this release has no preparations or artifacts.
 */
const REVISION_DEPENDENTS: readonly DependentRowStep[] = [
  { action: 'unlink', table: 'content_workspaces', column: 'current_detail_page_revision_id', references: REVISIONS },
  { action: 'unlink', table: 'detail_pages', column: 'current_revision_id', references: REVISIONS },
  { action: 'unlink', table: 'product_preparations', column: 'selected_detail_page_revision_id', references: REVISIONS },
  { action: 'unlink', table: 'detail_page_artifacts', column: 'current_revision_id', references: REVISIONS },
  { action: 'unlink', table: RENDER_INTENTS, column: 'completed_artifact_id', references: IMAGE_ARTIFACTS },
  { action: 'delete', table: IMAGE_ARTIFACTS, column: 'revision_id', references: REVISIONS, kind: 'derived' },
  { action: 'delete', table: RENDER_INTENTS, column: 'revision_id', references: REVISIONS, kind: 'derived' },
];

/**
 * The content tables whose Office 0.1.30 rows cannot hold the column KID-313
 * W3 makes required: `content_assets.content_workspace_id` (and `source`),
 * `detail_page_revisions.detail_page_id` and
 * `detail_page_image_render_intents.detail_page_id`. Each entry empties its
 * table, so it also covers the new foreign keys `db push` adds to it.
 */
export const CONTENT_REQUIRED_COLUMN_CLEANUPS = defineRequiredColumnCleanups([
  {
    table: ASSETS,
    requiredColumn: 'content_workspace_id',
    reason: DISCARDED_CONTENT,
    dependents: ASSET_DEPENDENTS,
    ownerApproval: OWNER_APPROVAL,
  },
  {
    table: REVISIONS,
    requiredColumn: 'detail_page_id',
    reason: DISCARDED_CONTENT,
    dependents: REVISION_DEPENDENTS,
  },
  {
    table: RENDER_INTENTS,
    requiredColumn: 'detail_page_id',
    reason: DISCARDED_CONTENT,
  },
]);

export const removeContentRowsBlockingRequiredColumnsMigration: DataMigration = {
  id: 'v0.1.31:028_remove_content_rows_blocking_required_columns',
  releaseVersion: '0.1.31',
  name: 'Remove Office content asset, detail page revision and render intent rows before db push adds their required columns',
  phase: 'pre-schema',
  run: (tx) => removeRowsBlockingRequiredColumns(tx, CONTENT_REQUIRED_COLUMN_CLEANUPS),
};
