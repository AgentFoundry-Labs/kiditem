import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaService } from '../../prisma/prisma.service';
import { ContentWorkspaceLifecycleRepositoryAdapter } from '../adapter/out/repository/content-workspace-lifecycle.repository.adapter';

/**
 * KID-310: the content workspace is owned by a sales-product draft, not by a
 * sourcing candidate. These are database-level guarantees — the partial unique
 * key is the only thing that stops two operators opening two workspaces on the
 * same draft — so they are verified against real PostgreSQL.
 */
describe('ContentWorkspace sales-product ownership (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  function lifecycle() {
    return new ContentWorkspaceLifecycleRepositoryAdapter(
      prisma as unknown as PrismaService,
      { findForListings: async () => [] } as never,
      { readOwners: async () => [] } as never,
    );
  }

  /** 판매 상품 작업공간은 이름을 갖지 않는다(KID-313 W3). */
  function workspaceData(salesProductId: string, organizationId = TEST_ORGANIZATION_ID) {
    return {
      organizationId,
      ownerType: 'sales_product',
      salesProductId,
      createdByUserId: null,
    };
  }

  /**
   * 024 는 지운 후보의 보관 작업공간을 옮기지 않는다 — 옮길 초안이 없다. 그 줄만 legacy
   * `owner_type='sourcing_candidate'` 로 남으므로, 초안이 아닌 작업공간 목록이 그것을 다시
   * 꺼내 오면 안 된다.
   */
  it('keeps a legacy candidate-owned workspace out of the direct workspace list', async () => {
    await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'sourcing_candidate',
        normalizedTitle: '지운 후보의 작업공간',
        status: 'archived',
      },
    });

    const listed = await lifecycle().listActive({
      organizationId: TEST_ORGANIZATION_ID,
      status: 'archived',
      normalizedTitle: null,
      page: 1,
      limit: 20,
    });

    expect({ total: listed.total, rows: listed.rows.length }).toEqual({ total: 0, rows: 0 });
  });

  it('keeps one active workspace per sales product', async () => {
    const salesProductId = randomUUID();
    await prisma.contentWorkspace.create({ data: workspaceData(salesProductId) });

    await expect(
      prisma.contentWorkspace.create({ data: workspaceData(salesProductId) }),
    ).rejects.toThrow();
  });

  it('lets a second workspace open once the first is archived or deleted', async () => {
    const salesProductId = randomUUID();
    const first = await prisma.contentWorkspace.create({
      data: workspaceData(salesProductId),
    });
    await prisma.contentWorkspace.update({
      where: { id: first.id },
      data: { status: 'archived' },
    });

    const second = await prisma.contentWorkspace.create({
      data: workspaceData(salesProductId),
    });
    expect(second.salesProductId).toBe(salesProductId);
    expect(second.ownerType).toBe('sales_product');
  });

  it('scopes the active-workspace key to one organization', async () => {
    const salesProductId = randomUUID();
    await prisma.contentWorkspace.create({ data: workspaceData(salesProductId) });

    const other = await prisma.contentWorkspace.create({
      data: workspaceData(salesProductId, OTHER_ORGANIZATION_ID),
    });
    expect(other.organizationId).toBe(OTHER_ORGANIZATION_ID);

    const mine = await prisma.contentWorkspace.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId },
      select: { id: true },
    });
    expect(mine).toHaveLength(1);
  });

  it('no longer carries a sourcing-candidate column on the workspace or its generation ledgers', async () => {
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>(Prisma.sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND column_name = 'source_candidate_id'
        AND table_name IN (
          'content_workspaces',
          'thumbnail_generations',
          'detail_pages',
          'detail_page_image_render_intents'
        )
    `);
    expect(columns).toEqual([]);
  });

  it('keeps no foreign key from AI content tables to sourcing tables', async () => {
    const crossOwnerForeignKeys = await prisma.$queryRaw<Array<{ constraint_name: string }>>(Prisma.sql`
      SELECT c.conname AS constraint_name
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
      WHERE c.contype = 'f'
        AND child.relname IN (
          'content_workspaces',
          'thumbnail_generations',
          'detail_pages',
          'content_assets',
          'detail_page_image_render_intents'
        )
        AND parent.relname IN ('source_records', 'source_record_images')
    `);
    expect(crossOwnerForeignKeys).toEqual([]);
  });

  async function seedWorkspaceRevision(revisionType: string) {
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        normalizedTitle: `상세 ${revisionType}`,
      },
    });
    const page = await prisma.detailPage.create({
      data: { organizationId: TEST_ORGANIZATION_ID, contentWorkspaceId: workspace.id, source: 'manual', title: '상세' },
    });
    const revision = await prisma.detailPageRevision.create({
      data: { organizationId: TEST_ORGANIZATION_ID, detailPageId: page.id, revisionType, html: '<main>상세</main>' },
    });
    await prisma.contentWorkspace.update({
      where: { id: workspace.id },
      data: { currentDetailPageRevisionId: revision.id },
    });
    return { workspaceId: workspace.id, revisionId: revision.id };
  }

  it('reads the current revision type as one of the validated revision types', async () => {
    const { workspaceId, revisionId } = await seedWorkspaceRevision('duplicate');

    const workspace = await lifecycle().getById({ organizationId: TEST_ORGANIZATION_ID, workspaceId });

    expect(workspace?.currentDetailPageRevision).toMatchObject({ id: revisionId, revisionType: 'duplicate' });
  });

  it('refuses a current revision whose type no writer produces', async () => {
    const { workspaceId } = await seedWorkspaceRevision('legacy_edited_html_backfill');

    await expect(lifecycle().getById({ organizationId: TEST_ORGANIZATION_ID, workspaceId })).rejects.toThrow();
  });
});
