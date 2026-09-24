import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  foreignKeysInto,
  referencingColumn,
} from '../../../../scripts/data-migrations/helpers/dependent-row-removal';
import type { RequiredColumnCleanup } from '../../../../scripts/data-migrations/helpers/required-column-row-cleanup';
import {
  CONTENT_REQUIRED_COLUMN_CLEANUPS,
  removeContentRowsBlockingRequiredColumnsMigration,
} from '../../../../scripts/data-migrations/v0.1.31/028_remove_content_rows_blocking_required_columns';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../test-helpers/real-prisma';

const ASSETS = 'content_assets';
const REVISIONS = 'detail_page_revisions';
const RENDER_INTENTS = 'detail_page_image_render_intents';
const IMAGE_ARTIFACTS = 'detail_page_image_artifacts';
const TABLES = [ASSETS, REVISIONS, RENDER_INTENTS] as const;
const REQUIRED = Object.fromEntries(
  CONTENT_REQUIRED_COLUMN_CLEANUPS.map((cleanup) => [cleanup.table, cleanup.requiredColumn]),
) as Record<string, string>;
const ROLLBACK = 'restore the pushed schema';

type Db = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

async function rowCounts(db: Db, tables: readonly string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const [row] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM ${Prisma.raw(`"${table}"`)}
    `;
    counts[table] = Number(row!.count);
  }
  return counts;
}

/**
 * A workspace with a thumbnail asset and a detail page whose revision has a
 * rendered image and a render intent: every row this release can still point
 * at the three tables.
 */
async function seedContent(db: PrismaClient) {
  const workspace = await db.contentWorkspace.create({
    data: { organizationId: TEST_ORGANIZATION_ID, ownerType: 'sales_product' },
  });
  const asset = await db.contentAsset.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      contentWorkspaceId: workspace.id,
      source: 'upload',
      assetKey: 'kid-313-thumbnail',
      url: 'https://cdn.test.local/kid-313-thumbnail.jpg',
    },
  });
  const page = await db.detailPage.create({
    data: { organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspace.id, source: 'template' },
  });
  const revision = await db.detailPageRevision.create({
    data: { organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id, html: '<p>kid-313</p>' },
  });
  await db.detailPage.update({ where: { id: page.id }, data: { currentRevisionId: revision.id } });
  await db.contentWorkspace.update({
    where: { id: workspace.id },
    data: { currentThumbnailAssetId: asset.id, currentDetailPageRevisionId: revision.id },
  });
  const image = await db.detailPageImageArtifact.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      revisionId: revision.id,
      variant: 'main',
      outputWidth: 860,
      objectKey: 'kid-313/main-860.png',
      imageUrl: 'https://cdn.test.local/kid-313/main-860.png',
      contentType: 'image/png',
      byteLength: 1024,
      pixelWidth: 860,
      pixelHeight: 1200,
      sha256: 'a'.repeat(64),
      rendererKind: 'test',
    },
  });
  await db.detailPageImageRenderIntent.create({
    data: {
      organizationId: TEST_ORGANIZATION_ID,
      detailPageId: page.id,
      revisionId: revision.id,
      variant: 'main',
      outputWidth: 860,
      objectKey: 'kid-313/main-860.png',
      expiresAt: new Date('2026-09-24T00:00:00Z'),
      completedArtifactId: image.id,
    },
  });
  return { workspace, page };
}

describe('v0.1.31:028 remove content rows blocking required columns (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('declares every foreign key the pushed schema has into the emptied tables and the rows they take along', async () => {
    const live = (await foreignKeysInto(prisma, [...TABLES, IMAGE_ARTIFACTS]))
      .map((key) => `${key.childTable}.${referencingColumn(key)} -> ${key.parentTable}`)
      .sort();
    const declared = (CONTENT_REQUIRED_COLUMN_CLEANUPS as readonly RequiredColumnCleanup[]).flatMap((cleanup) =>
      (cleanup.dependents ?? []).map((step) => `${step.table}.${step.column} -> ${step.references}`));
    expect(live.filter((key) => !declared.includes(key))).toEqual([]);
    expect(live).toEqual([
      'content_workspaces.current_detail_page_revision_id -> detail_page_revisions',
      'content_workspaces.current_thumbnail_asset_id -> content_assets',
      'detail_page_image_artifacts.revision_id -> detail_page_revisions',
      'detail_page_image_render_intents.completed_artifact_id -> detail_page_image_artifacts',
      'detail_page_image_render_intents.revision_id -> detail_page_revisions',
      'detail_pages.current_revision_id -> detail_page_revisions',
    ]);
  });

  it('deletes nothing on the pushed schema, where the columns already exist', async () => {
    await seedContent(prisma);
    const before = await rowCounts(prisma, [...TABLES, IMAGE_ARTIFACTS]);
    expect(before).toEqual({ [ASSETS]: 1, [REVISIONS]: 1, [RENDER_INTENTS]: 1, [IMAGE_ARTIFACTS]: 1 });

    const result = await prisma.$transaction((tx) => removeContentRowsBlockingRequiredColumnsMigration.run(tx));
    expect(result.affectedRows).toBe(0);
    expect(result.details).toMatchObject(Object.fromEntries(TABLES.map((table) => [
      table,
      { requiredColumn: REQUIRED[table], tablePresent: true, requiredColumnPresent: true, deletedRows: 0 },
    ])));
    await expect(rowCounts(prisma, [...TABLES, IMAGE_ARTIFACTS])).resolves.toEqual(before);
  });

  it('on the Office shape, empties the three tables with their rendered images, clears the pointers, and keeps the workspace and page', async () => {
    const { workspace, page } = await seedContent(prisma).catch(async () => {
      // The previous test's rows are still there; reuse them.
      const [existing] = await prisma.contentWorkspace.findMany({ where: { organizationId: TEST_ORGANIZATION_ID }, take: 1 });
      const [existingPage] = await prisma.detailPage.findMany({ where: { organizationId: TEST_ORGANIZATION_ID }, take: 1 });
      return { workspace: existing!, page: existingPage! };
    });

    await expect(prisma.$transaction(async (tx) => {
      // What Office 0.1.30 lacks: the columns KID-313 W3 makes required.
      await tx.$executeRaw`ALTER TABLE content_assets DROP COLUMN content_workspace_id`;
      await tx.$executeRaw`ALTER TABLE content_assets DROP COLUMN source`;
      await tx.$executeRaw`ALTER TABLE detail_page_revisions DROP COLUMN detail_page_id`;
      await tx.$executeRaw`ALTER TABLE detail_page_image_render_intents DROP COLUMN detail_page_id`;

      const result = await removeContentRowsBlockingRequiredColumnsMigration.run(tx);
      expect(result.affectedRows).toBe(1 + 1 + 1 + 1 + 4);
      expect(result.details).toEqual({
        [ASSETS]: {
          requiredColumn: 'content_workspace_id',
          tablePresent: true,
          requiredColumnPresent: false,
          deletedRows: 1,
          dependentRows: {},
          unlinkedRows: { 'content_workspaces.current_thumbnail_asset_id': 1 },
        },
        [REVISIONS]: {
          requiredColumn: 'detail_page_id',
          tablePresent: true,
          requiredColumnPresent: false,
          deletedRows: 1,
          dependentRows: { [IMAGE_ARTIFACTS]: 1, [RENDER_INTENTS]: 1 },
          unlinkedRows: {
            'content_workspaces.current_detail_page_revision_id': 1,
            'detail_pages.current_revision_id': 1,
            'detail_page_image_render_intents.completed_artifact_id': 1,
          },
        },
        [RENDER_INTENTS]: {
          requiredColumn: 'detail_page_id',
          tablePresent: true,
          requiredColumnPresent: false,
          deletedRows: 0,
        },
      });
      await expect(rowCounts(tx, [...TABLES, IMAGE_ARTIFACTS])).resolves.toEqual({
        [ASSETS]: 0, [REVISIONS]: 0, [RENDER_INTENTS]: 0, [IMAGE_ARTIFACTS]: 0,
      });
      await expect(tx.contentWorkspace.findUniqueOrThrow({ where: { id: workspace.id } })).resolves.toMatchObject({
        currentThumbnailAssetId: null,
        currentDetailPageRevisionId: null,
      });
      await expect(tx.detailPage.findUniqueOrThrow({ where: { id: page.id } })).resolves.toMatchObject({
        currentRevisionId: null,
      });

      // Before `db push` the columns are still missing, and nothing is left to delete.
      const second = await removeContentRowsBlockingRequiredColumnsMigration.run(tx);
      expect(second.affectedRows).toBe(0);
      throw new Error(ROLLBACK);
    }, { timeout: 60_000 })).rejects.toThrow(ROLLBACK);

    // The rollback restored the columns and the rows.
    await expect(rowCounts(prisma, [...TABLES, IMAGE_ARTIFACTS])).resolves.toEqual({
      [ASSETS]: 1, [REVISIONS]: 1, [RENDER_INTENTS]: 1, [IMAGE_ARTIFACTS]: 1,
    });
  });
});
