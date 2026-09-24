import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADR_0010_KEPT_TABLES } from '../data-migrations/helpers/dependent-row-removal';
import type { RequiredColumnCleanup } from '../data-migrations/helpers/required-column-row-cleanup';
import {
  CONTENT_REQUIRED_COLUMN_CLEANUPS,
  removeContentRowsBlockingRequiredColumnsMigration,
} from '../data-migrations/v0.1.31/028_remove_content_rows_blocking_required_columns';
import {
  type FakeForeignKey,
  type FakeTableState,
  requiredColumnCleanupTransaction,
} from './fixtures/required-column-cleanup-transaction';

const ASSETS = 'content_assets';
const REVISIONS = 'detail_page_revisions';
const RENDER_INTENTS = 'detail_page_image_render_intents';
const TABLES = [ASSETS, REVISIONS, RENDER_INTENTS] as const;
const REQUIRED = Object.fromEntries(
  CONTENT_REQUIRED_COLUMN_CLEANUPS.map((cleanup) => [cleanup.table, cleanup.requiredColumn]),
) as Record<string, string>;
const KEPT = Object.values(ADR_0010_KEPT_TABLES).flat();
const CLEANUPS: readonly RequiredColumnCleanup[] = CONTENT_REQUIRED_COLUMN_CLEANUPS;
const DECLARED = CLEANUPS.flatMap((cleanup) =>
  (cleanup.dependents ?? []).map(({ table, column, references }) => ({ table, column, references })));
const link = (key: FakeForeignKey) => `${key.table}.${key.column} -> ${key.references}`;

/** The keys Office 0.1.30 has into the emptied tables: every declared step except this release's two new pointers. */
const OFFICE_FOREIGN_KEYS: FakeForeignKey[] = DECLARED.filter((key) =>
  !(key.table === 'content_workspaces' && key.column === 'current_thumbnail_asset_id')
  && key.table !== 'detail_pages');

/** The Office 0.1.30 shape: the three tables without their new column, and every row that points at them. */
function office(): Record<string, FakeTableState> {
  return {
    [ASSETS]: { columns: ['id', 'organization_id', 'asset_key'], records: [{ id: 'asset-1' }, { id: 'asset-2' }] },
    [REVISIONS]: { columns: ['id', 'organization_id', 'html'], records: [{ id: 'rev-1' }, { id: 'rev-2' }] },
    [RENDER_INTENTS]: {
      columns: ['id', 'organization_id', 'revision_id', 'completed_artifact_id'],
      records: [{ id: 'intent-1', revision_id: 'rev-1', completed_artifact_id: 'image-1' }],
    },
    content_workspaces: {
      columns: ['id', 'organization_id', 'current_thumbnail_selection_id', 'current_detail_page_revision_id'],
      records: [
        { id: 'workspace-1', current_thumbnail_selection_id: 'pick-1', current_detail_page_revision_id: 'rev-1' },
        { id: 'workspace-2', current_thumbnail_selection_id: null, current_detail_page_revision_id: null },
      ],
    },
    content_workspace_thumbnail_selections: {
      columns: ['id', 'organization_id', 'content_asset_id'],
      records: [{ id: 'pick-1', content_asset_id: 'asset-1' }],
    },
    content_generation_sources: {
      columns: ['id', 'organization_id', 'content_asset_id'],
      records: [{ id: 'source-1', content_asset_id: 'asset-2' }, { id: 'source-2', content_asset_id: null }],
    },
    content_generation_asset_usages: {
      columns: ['id', 'organization_id', 'content_asset_id'],
      records: [{ id: 'usage-1', content_asset_id: 'asset-1' }],
    },
    product_preparations: {
      columns: ['id', 'organization_id', 'selected_detail_page_revision_id'],
      records: [{ id: 'preparation-1', selected_detail_page_revision_id: 'rev-2' }],
    },
    detail_page_artifacts: {
      columns: ['id', 'organization_id', 'current_revision_id'],
      records: [{ id: 'artifact-1', current_revision_id: 'rev-2' }],
    },
    detail_page_image_artifacts: {
      columns: ['id', 'organization_id', 'revision_id'],
      records: [{ id: 'image-1', revision_id: 'rev-1' }],
    },
  };
}

/** The pushed schema: the columns exist, so the rows stay whatever points at them. */
function pushed(): Record<string, FakeTableState> {
  return Object.fromEntries(TABLES.map((table) => [
    table,
    { columns: ['id', 'organization_id', REQUIRED[table]!], rows: 3 },
  ]));
}

function transaction(tables: Record<string, FakeTableState>, foreignKeys: readonly FakeForeignKey[] = []) {
  return requiredColumnCleanupTransaction({ tables, requiredColumns: REQUIRED, foreignKeys });
}

async function run(db: ReturnType<typeof transaction>) {
  return removeContentRowsBlockingRequiredColumnsMigration.run(db.tx as never);
}

type PrismaModel = { name: string; table: string; body: string };

function prismaModels(): PrismaModel[] {
  const modelsDir = join(__dirname, '..', '..', 'prisma', 'models');
  const schema = readdirSync(modelsDir)
    .filter((file) => file.endsWith('.prisma'))
    .map((file) => readFileSync(join(modelsDir, file), 'utf8'))
    .join('\n');
  return [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)].map(([, name, body]) => ({
    name: name!,
    table: body!.match(/@@map\("([^"]+)"\)/)?.[1] ?? name!,
    body: body!,
  }));
}

/** `table.column -> parent` for every relation this release declares into `targets`. */
function relationsInto(models: PrismaModel[], targets: readonly string[]): string[] {
  const tableOf = new Map(models.map((model) => [model.name, model.table]));
  return models.flatMap((model) => {
    const columns = new Map<string, string>();
    for (const line of model.body.split('\n')) {
      const field = line.match(/^\s*(\w+)\s+\w/);
      if (field && !field[1]!.startsWith('@@')) columns.set(field[1]!, line.match(/@map\("([^"]+)"\)/)?.[1] ?? field[1]!);
    }
    return [...model.body.matchAll(/^\s*\w+\s+(\w+)\??\s+@relation\([^\n]*fields: \[(\w+)/gm)]
      .filter(([, target]) => targets.includes(tableOf.get(target!) ?? ''))
      .map(([, target, field]) => `${model.table}.${columns.get(field!) ?? field} -> ${tableOf.get(target!)}`);
  });
}

describe('v0.1.31:028 remove content rows blocking required columns', () => {
  it('runs pre-schema and lists no ADR-0010 kept table, as a root or as a deleted dependent', () => {
    expect(removeContentRowsBlockingRequiredColumnsMigration.phase).toBe('pre-schema');
    const deleted = CLEANUPS.flatMap((cleanup) => [
      cleanup.table,
      ...(cleanup.dependents ?? []).filter((step) => step.action === 'delete').map((step) => step.table),
    ]);
    expect(deleted.filter((table) => KEPT.includes(table))).toEqual([]);
  });

  it('declares every key this release has into the emptied tables and the rows they take along', () => {
    const models = prismaModels();
    const deletedTables = [
      ...TABLES,
      ...DECLARED.filter((key) => CLEANUPS.some((cleanup) =>
        cleanup.dependents?.some((step) => step.action === 'delete' && step.table === key.table))).map((key) => key.table),
    ];
    const live = relationsInto(models, deletedTables).sort();
    const declared = DECLARED.map(link);
    expect(live.filter((key) => !declared.includes(key))).toEqual([]);
    // The pointers and derived rows this release still has.
    expect(live).toEqual([
      'content_workspaces.current_detail_page_revision_id -> detail_page_revisions',
      'content_workspaces.current_thumbnail_asset_id -> content_assets',
      'detail_page_image_artifacts.revision_id -> detail_page_revisions',
      'detail_page_image_render_intents.completed_artifact_id -> detail_page_image_artifacts',
      'detail_page_image_render_intents.revision_id -> detail_page_revisions',
      'detail_pages.current_revision_id -> detail_page_revisions',
    ]);
  });

  it('on the Office 0.1.30 shape, empties the three tables after their dependents, clears the pointers, and deletes nothing on a second run', async () => {
    const db = transaction(office(), OFFICE_FOREIGN_KEYS);

    await expect(run(db)).resolves.toEqual({
      affectedRows: 14,
      details: {
        [ASSETS]: {
          requiredColumn: 'content_workspace_id',
          tablePresent: true,
          requiredColumnPresent: false,
          deletedRows: 2,
          dependentRows: { content_workspace_thumbnail_selections: 1, content_generation_asset_usages: 1 },
          unlinkedRows: {
            'content_workspaces.current_thumbnail_selection_id': 1,
            'content_generation_sources.content_asset_id': 1,
          },
        },
        [REVISIONS]: {
          requiredColumn: 'detail_page_id',
          tablePresent: true,
          requiredColumnPresent: false,
          deletedRows: 2,
          dependentRows: { detail_page_image_artifacts: 1, [RENDER_INTENTS]: 1 },
          unlinkedRows: {
            'content_workspaces.current_detail_page_revision_id': 1,
            'product_preparations.selected_detail_page_revision_id': 1,
            'detail_page_artifacts.current_revision_id': 1,
            [`${RENDER_INTENTS}.completed_artifact_id`]: 1,
          },
        },
        [RENDER_INTENTS]: {
          requiredColumn: 'detail_page_id',
          tablePresent: true,
          requiredColumnPresent: false,
          deletedRows: 0,
        },
      },
    });
    expect(db.deletes()).toEqual([
      'DELETE FROM "content_workspace_thumbnail_selections" WHERE id = ANY($1::uuid[])',
      'DELETE FROM "content_generation_asset_usages" WHERE id = ANY($1::uuid[])',
      `DELETE FROM "${ASSETS}"`,
      'DELETE FROM "detail_page_image_artifacts" WHERE id = ANY($1::uuid[])',
      `DELETE FROM "${RENDER_INTENTS}" WHERE id = ANY($1::uuid[])`,
      `DELETE FROM "${REVISIONS}"`,
      `DELETE FROM "${RENDER_INTENTS}"`,
    ]);
    for (const table of TABLES) expect(db.rowsOf(table)).toBe(0);
    // Rows that only pointed at removed rows stay, without their pointers.
    expect(db.recordsOf('content_workspaces')).toEqual([
      { id: 'workspace-1', current_thumbnail_selection_id: null, current_detail_page_revision_id: null },
      { id: 'workspace-2', current_thumbnail_selection_id: null, current_detail_page_revision_id: null },
    ]);
    expect(db.recordsOf('content_generation_sources')).toEqual([
      { id: 'source-1', content_asset_id: null },
      { id: 'source-2', content_asset_id: null },
    ]);
    expect(db.recordsOf('product_preparations')).toEqual([{ id: 'preparation-1', selected_detail_page_revision_id: null }]);
    expect(db.recordsOf('detail_page_artifacts')).toEqual([{ id: 'artifact-1', current_revision_id: null }]);

    const second = await run(db);
    expect(second.affectedRows).toBe(0);
  });

  it('deletes nothing once db push has added the columns', async () => {
    const db = transaction(pushed());
    await expect(run(db)).resolves.toEqual({
      affectedRows: 0,
      details: {
        [ASSETS]: {
          requiredColumn: 'content_workspace_id',
          tablePresent: true,
          requiredColumnPresent: true,
          deletedRows: 0,
          dependentRows: {},
          unlinkedRows: {},
        },
        [REVISIONS]: {
          requiredColumn: 'detail_page_id',
          tablePresent: true,
          requiredColumnPresent: true,
          deletedRows: 0,
          dependentRows: {},
          unlinkedRows: {},
        },
        [RENDER_INTENTS]: {
          requiredColumn: 'detail_page_id',
          tablePresent: true,
          requiredColumnPresent: true,
          deletedRows: 0,
        },
      },
    });
    expect(db.deletes()).toEqual([]);
    for (const table of TABLES) expect(db.rowsOf(table)).toBe(3);
  });
});
