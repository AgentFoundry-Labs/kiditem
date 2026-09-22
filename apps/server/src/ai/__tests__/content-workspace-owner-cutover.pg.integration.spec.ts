import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestPrisma } from '../../test-helpers/real-prisma';
import { contentWorkspaceOwnerCutoverMigration } from '../../../../../scripts/data-migrations/v0.1.31/024_content_workspace_owner_cutover';

const ORGANIZATION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const OTHER_ORGANIZATION_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CANDIDATE_ID = '11111111-1111-4111-8111-222222222222';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_ID = '44444444-4444-4444-8444-444444444444';
const REVISION_ID = '55555555-5555-4555-8555-555555555555';

describe('v0.1.31:024 content workspace owner cutover (disposable PostgreSQL schema)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('moves a candidate workspace onto the draft that 023 created and is a no-op on replay', async () => {
    const result = await withLegacySchema(async (tx) => {
      await seedDraft(tx);
      await seedWorkspace(tx);
      const first = await contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
      const [workspace] = await tx.$queryRaw<Array<{
        owner_type: string;
        sales_product_id: string | null;
      }>>`
        SELECT owner_type, sales_product_id::text AS sales_product_id
        FROM content_workspaces WHERE id = ${WORKSPACE_ID}::uuid
      `;
      const second = await contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
      return { first, workspace, second };
    });

    expect(result.first).toEqual({
      affectedRows: 1,
      details: { movedWorkspaces: 1, outcome: 'moved' },
    });
    expect(result.workspace).toEqual({ owner_type: 'sales_product', sales_product_id: DRAFT_ID });
    expect(result.second).toEqual({
      affectedRows: 0,
      details: { movedWorkspaces: 0, outcome: 'moved' },
    });
  }, 60_000);

  it('rolls back when the candidate has no sales-product draft yet', async () => {
    await expect(withLegacySchema(async (tx) => {
      await seedWorkspace(tx);
      return contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow('v0.1.31:023');
  }, 60_000);

  it('refuses a draft that belongs to another organization', async () => {
    await expect(withLegacySchema(async (tx) => {
      await seedDraft(tx, { organizationId: OTHER_ORGANIZATION_ID });
      await seedWorkspace(tx);
      return contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow('v0.1.31:023');
  }, 60_000);

  it('rolls back a thumbnail generation whose candidate disagrees with its workspace', async () => {
    await expect(withLegacySchema(async (tx) => {
      await seedDraft(tx);
      await seedWorkspace(tx);
      await tx.$executeRaw`
        INSERT INTO thumbnail_generations (id, organization_id, source_candidate_id, content_workspace_id, is_deleted)
        VALUES (gen_random_uuid(), ${ORGANIZATION_ID}::uuid, ${OTHER_CANDIDATE_ID}::uuid, ${WORKSPACE_ID}::uuid, false)
      `;
      return contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow('thumbnail_generations');
  }, 60_000);

  it('rolls back a content generation whose candidate disagrees with its workspace', async () => {
    await expect(withLegacySchema(async (tx) => {
      await seedDraft(tx);
      await seedWorkspace(tx);
      await tx.$executeRaw`
        INSERT INTO content_generations (id, organization_id, source_candidate_id, content_workspace_id, is_deleted)
        VALUES (gen_random_uuid(), ${ORGANIZATION_ID}::uuid, ${OTHER_CANDIDATE_ID}::uuid, ${WORKSPACE_ID}::uuid, false)
      `;
      return contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow('content_generations');
  }, 60_000);

  it('rolls back a render intent whose candidate disagrees with its artifact workspace', async () => {
    await expect(withLegacySchema(async (tx) => {
      await seedDraft(tx);
      await seedWorkspace(tx);
      await tx.$executeRaw`
        INSERT INTO detail_page_artifacts (id, organization_id, content_workspace_id, is_deleted)
        VALUES (${ARTIFACT_ID}::uuid, ${ORGANIZATION_ID}::uuid, ${WORKSPACE_ID}::uuid, false)
      `;
      await tx.$executeRaw`
        INSERT INTO detail_page_image_render_intents
          (id, organization_id, source_candidate_id, detail_page_artifact_id, revision_id)
        VALUES (gen_random_uuid(), ${ORGANIZATION_ID}::uuid, ${OTHER_CANDIDATE_ID}::uuid,
          ${ARTIFACT_ID}::uuid, ${REVISION_ID}::uuid)
      `;
      return contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow('detail_page_image_render_intents');
  }, 60_000);

  it('refuses to leave two active workspaces competing for one draft', async () => {
    await expect(withLegacySchema(async (tx) => {
      await seedDraft(tx);
      await seedWorkspace(tx);
      await seedWorkspace(tx, { id: '33333333-3333-4333-8333-444444444444', normalizedTitle: 'second' });
      return contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
    })).rejects.toThrow('content_workspaces_sales_product_active_key');
  }, 60_000);

  it('is a no-op once the column has already been contracted', async () => {
    const result = await withTempSchema(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE content_workspaces (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, owner_type text NOT NULL,
        sales_product_id uuid, channel_listing_id uuid, status text NOT NULL DEFAULT 'active',
        is_deleted boolean NOT NULL DEFAULT false
      ) ON COMMIT DROP`;
      return contentWorkspaceOwnerCutoverMigration.run(tx, { target: 'office' });
    });

    expect(result).toEqual({ affectedRows: 0, details: { outcome: 'already_contracted' } });
  }, 60_000);

  async function seedDraft(
    tx: Prisma.TransactionClient,
    overrides: { organizationId?: string } = {},
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO sales_products (id, organization_id, source_candidate_id)
      VALUES (${DRAFT_ID}::uuid, ${overrides.organizationId ?? ORGANIZATION_ID}::uuid, ${CANDIDATE_ID}::uuid)
    `;
  }

  async function seedWorkspace(
    tx: Prisma.TransactionClient,
    overrides: { id?: string; normalizedTitle?: string } = {},
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO content_workspaces
        (id, organization_id, owner_type, source_candidate_id, status, is_deleted, display_name, normalized_title)
      VALUES (${overrides.id ?? WORKSPACE_ID}::uuid, ${ORGANIZATION_ID}::uuid, 'sourcing_candidate',
        ${CANDIDATE_ID}::uuid, 'active', false, 'Kids rain boots', ${overrides.normalizedTitle ?? 'kidsrainboots'})
    `;
  }

  async function withLegacySchema<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return withTempSchema(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE sales_products (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, source_candidate_id uuid
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE content_workspaces (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, owner_type text NOT NULL,
        source_candidate_id uuid, channel_listing_id uuid, status text NOT NULL DEFAULT 'active',
        is_deleted boolean NOT NULL DEFAULT false, display_name text NOT NULL,
        normalized_title text NOT NULL
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE thumbnail_generations (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, source_candidate_id uuid,
        content_workspace_id uuid NOT NULL, is_deleted boolean NOT NULL DEFAULT false
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE content_generations (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, source_candidate_id uuid,
        content_workspace_id uuid NOT NULL, is_deleted boolean NOT NULL DEFAULT false
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE detail_page_artifacts (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, content_workspace_id uuid NOT NULL,
        is_deleted boolean NOT NULL DEFAULT false
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE detail_page_image_render_intents (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, source_candidate_id uuid NOT NULL,
        detail_page_artifact_id uuid NOT NULL, revision_id uuid NOT NULL
      ) ON COMMIT DROP`;
      return work(tx);
    });
  }

  async function withTempSchema<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL search_path TO pg_temp`;
      const result = await work(tx);
      await tx.$executeRaw`DROP TABLE IF EXISTS content_workspaces, sales_products,
        thumbnail_generations, content_generations, detail_page_artifacts,
        detail_page_image_render_intents CASCADE`;
      return result;
    }, { timeout: 60_000 });
  }
});
