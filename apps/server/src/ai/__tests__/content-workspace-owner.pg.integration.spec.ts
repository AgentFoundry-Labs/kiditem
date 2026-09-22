import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';

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

  function workspaceData(salesProductId: string, title: string, organizationId = TEST_ORGANIZATION_ID) {
    return {
      organizationId,
      ownerType: 'sales_product',
      salesProductId,
      displayName: title,
      normalizedTitle: title.trim().toLowerCase(),
      createdByUserId: null,
    };
  }

  it('keeps one active workspace per sales product', async () => {
    const salesProductId = randomUUID();
    await prisma.contentWorkspace.create({ data: workspaceData(salesProductId, 'Kids rain boots') });

    await expect(
      prisma.contentWorkspace.create({ data: workspaceData(salesProductId, 'Kids rain boots retry') }),
    ).rejects.toThrow();
  });

  it('lets a second workspace open once the first is archived or deleted', async () => {
    const salesProductId = randomUUID();
    const first = await prisma.contentWorkspace.create({
      data: workspaceData(salesProductId, 'Kids rain boots'),
    });
    await prisma.contentWorkspace.update({
      where: { id: first.id },
      data: { status: 'archived' },
    });

    const second = await prisma.contentWorkspace.create({
      data: workspaceData(salesProductId, 'Kids rain boots v2'),
    });
    expect(second.salesProductId).toBe(salesProductId);
    expect(second.ownerType).toBe('sales_product');
  });

  it('scopes the active-workspace key to one organization', async () => {
    const salesProductId = randomUUID();
    await prisma.contentWorkspace.create({ data: workspaceData(salesProductId, 'Shared draft') });

    const other = await prisma.contentWorkspace.create({
      data: workspaceData(salesProductId, 'Shared draft', OTHER_ORGANIZATION_ID),
    });
    expect(other.organizationId).toBe(OTHER_ORGANIZATION_ID);

    const mine = await prisma.contentWorkspace.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, salesProductId },
      select: { id: true },
    });
    expect(mine).toHaveLength(1);
  });

  it('branches a listing workspace off the same draft without competing for the draft key', async () => {
    const salesProductId = randomUUID();
    const draftWorkspace = await prisma.contentWorkspace.create({
      data: workspaceData(salesProductId, 'Kids rain boots'),
    });

    const listingWorkspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'channel_listing',
        salesProductId: null,
        channelListingId: randomUUID(),
        originWorkspaceId: draftWorkspace.id,
        displayName: 'Kids rain boots',
        normalizedTitle: 'kids rain boots',
        createdByUserId: TEST_USER_ID,
      },
    });

    expect(listingWorkspace.originWorkspaceId).toBe(draftWorkspace.id);
    expect(listingWorkspace.salesProductId).toBeNull();
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
          'content_generations',
          'detail_page_image_render_intents'
        )
    `);
    expect(columns).toEqual([]);
  });

  it('keeps provenance ids that record where the content came from', async () => {
    const provenance = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>(Prisma.sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          (table_name = 'content_generation_sources' AND column_name = 'source_candidate_id')
          OR (table_name = 'thumbnail_generation_input_images' AND column_name = 'candidate_image_id')
        )
      ORDER BY table_name
    `);
    expect(provenance.map((row) => row.table_name)).toEqual([
      'content_generation_sources',
      'thumbnail_generation_input_images',
    ]);
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
          'content_generations',
          'content_generation_sources',
          'detail_page_image_render_intents',
          'thumbnail_generation_input_images'
        )
        AND parent.relname IN ('sourcing_candidates', 'sourcing_candidate_images')
    `);
    expect(crossOwnerForeignKeys).toEqual([]);
  });
});
