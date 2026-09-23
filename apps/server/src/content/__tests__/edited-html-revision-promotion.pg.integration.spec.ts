import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestPrisma } from '../../test-helpers/real-prisma';
import { promoteEditedHtmlToDetailPageRevisionsMigration } from '../../../../../scripts/data-migrations/v0.1.31/025_promote_edited_html_to_detail_page_revisions';

const ORG = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const USER = 'f1234567-89ab-4cde-8f01-23456789abcd';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_EMPTY = '44444444-4444-4444-8444-000000000001';
const ARTIFACT_CURRENT = '44444444-4444-4444-8444-000000000002';
const ARTIFACT_SAME = '44444444-4444-4444-8444-000000000003';
const ARTIFACT_DELETED = '44444444-4444-4444-8444-000000000004';
const REVISION_CURRENT = '55555555-5555-4555-8555-000000000002';
const REVISION_SAME = '55555555-5555-4555-8555-000000000003';
const GEN_EMPTY = '66666666-6666-4666-8666-000000000001';
const GEN_CURRENT = '66666666-6666-4666-8666-000000000002';
const GEN_SAME = '66666666-6666-4666-8666-000000000003';
const GEN_NO_ARTIFACT = '66666666-6666-4666-8666-000000000004';
const GEN_DELETED = '66666666-6666-4666-8666-000000000005';
const GEN_NOT_EDITED = '66666666-6666-4666-8666-000000000006';
const SAVED_AT = new Date('2026-05-12T11:00:00.000Z');

type Revision = {
  artifact_id: string;
  content_generation_id: string | null;
  revision_type: string;
  html: string;
  created_by_user_id: string | null;
  created_at: Date;
};

/**
 * `ContentGeneration.editedHtml` 을 지우기 전에 그 값을 상세페이지 revision 으로 옮긴다(KID-304).
 * 칸은 곧 스키마에서 사라지므로 24 처럼 옛 모양의 임시 표에서 돌린다.
 */
describe('v0.1.31:025 promote edited HTML to detail-page revisions (disposable PostgreSQL schema)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('adds a manual-edit revision at the save time and points an empty artifact at it', async () => {
    const result = await withLegacySchema(async (tx) => {
      await seed(tx);
      const report = await promoteEditedHtmlToDetailPageRevisionsMigration.run(tx, { target: 'office' });
      return { report, ...(await readState(tx)) };
    });

    expect(result.report).toEqual({
      affectedRows: 3,
      details: {
        outcome: 'promoted',
        editedGenerations: 5,
        promotedRevisions: 2,
        alreadyPresent: 1,
        currentRevisionsSet: 1,
        withoutArtifact: 2,
      },
    });
    // 옮긴 revision 은 생성을 시작한 사람을 남긴다(심어 둔 revision 은 비어 있다).
    const promoted = result.revisions.filter((revision) => revision.created_by_user_id === USER);
    expect(promoted).toEqual([
      { artifact_id: ARTIFACT_EMPTY, content_generation_id: GEN_EMPTY, revision_type: 'manual_edit',
        html: '<main>empty artifact edit</main>', created_by_user_id: USER, created_at: SAVED_AT },
      { artifact_id: ARTIFACT_CURRENT, content_generation_id: GEN_CURRENT, revision_type: 'manual_edit',
        html: '<main>older edit</main>', created_by_user_id: USER, created_at: SAVED_AT },
    ]);
    const empty = result.artifacts.find((artifact) => artifact.id === ARTIFACT_EMPTY)!;
    expect(result.revisionIds.get(empty.current_revision_id!)).toBe(GEN_EMPTY);
    // 이미 현재 revision 이 있는 상세는 운영자가 고른 것을 바꾸지 않는다.
    expect(result.artifacts.find((artifact) => artifact.id === ARTIFACT_CURRENT)!.current_revision_id)
      .toBe(REVISION_CURRENT);
    // 같은 HTML 이 이미 있으면 새로 만들지 않는다.
    expect(result.revisions.filter((revision) => revision.artifact_id === ARTIFACT_SAME)).toHaveLength(1);
    // 붙일 상세가 없거나 지워진 줄은 아무것도 만들지 않는다.
    expect(result.revisions.filter((revision) => revision.artifact_id === ARTIFACT_DELETED)).toEqual([]);
    expect(result.artifacts.find((artifact) => artifact.id === ARTIFACT_DELETED)!.current_revision_id).toBeNull();
    expect(result.artifacts).toHaveLength(4);
  }, 60_000);

  it('points an empty artifact at the identical revision it already has', async () => {
    const result = await withLegacySchema(async (tx) => {
      await seed(tx);
      await tx.$executeRaw`UPDATE detail_page_artifacts SET current_revision_id = NULL WHERE id = ${ARTIFACT_SAME}::uuid`;
      const report = await promoteEditedHtmlToDetailPageRevisionsMigration.run(tx, { target: 'office' });
      return { report, ...(await readState(tx)) };
    });

    expect(result.report.details).toMatchObject({ alreadyPresent: 1, currentRevisionsSet: 2 });
    expect(result.artifacts.find((artifact) => artifact.id === ARTIFACT_SAME)!.current_revision_id).toBe(REVISION_SAME);
  }, 60_000);

  it('writes nothing on a second run', async () => {
    const result = await withLegacySchema(async (tx) => {
      await seed(tx);
      await promoteEditedHtmlToDetailPageRevisionsMigration.run(tx, { target: 'office' });
      const before = await readState(tx);
      const second = await promoteEditedHtmlToDetailPageRevisionsMigration.run(tx, { target: 'office' });
      return { before, second, after: await readState(tx) };
    });

    expect(result.second).toEqual({
      affectedRows: 0,
      details: {
        outcome: 'promoted',
        editedGenerations: 5,
        promotedRevisions: 0,
        alreadyPresent: 3,
        currentRevisionsSet: 0,
        withoutArtifact: 2,
      },
    });
    expect(result.after.revisions).toEqual(result.before.revisions);
    expect(result.after.artifacts).toEqual(result.before.artifacts);
  }, 60_000);

  it('rolls back every revision it added when a later step fails', async () => {
    const result = await withLegacySchema(async (tx) => {
      await seed(tx);
      await tx.$executeRaw`
        CREATE FUNCTION pg_temp.refuse_pointer() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'artifact pointer refused'; END $$
      `;
      await tx.$executeRaw`
        CREATE TRIGGER refuse_pointer BEFORE UPDATE ON detail_page_artifacts
        FOR EACH ROW EXECUTE FUNCTION pg_temp.refuse_pointer()
      `;
      await tx.$executeRaw`SAVEPOINT before_migration`;
      const error = await promoteEditedHtmlToDetailPageRevisionsMigration.run(tx, { target: 'office' })
        .then(() => null, (caught: unknown) => caught);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT before_migration`;
      return { error, ...(await readState(tx)) };
    });

    expect(String(result.error)).toContain('artifact pointer refused');
    expect(result.revisions.map((revision) => revision.content_generation_id).sort()).toEqual([GEN_CURRENT, GEN_SAME].sort());
    expect(result.artifacts.find((artifact) => artifact.id === ARTIFACT_EMPTY)!.current_revision_id).toBeNull();
  }, 60_000);

  it('is a no-op once the edited HTML column is gone', async () => {
    const result = await withTempSchema(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE content_generations (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL
      ) ON COMMIT DROP`;
      return promoteEditedHtmlToDetailPageRevisionsMigration.run(tx, { target: 'office' });
    });

    expect(result).toEqual({ affectedRows: 0, details: { outcome: 'already_contracted' } });
  }, 60_000);

  async function seed(tx: Prisma.TransactionClient): Promise<void> {
    for (const [id, deleted] of [
      [ARTIFACT_EMPTY, false], [ARTIFACT_CURRENT, false], [ARTIFACT_SAME, false], [ARTIFACT_DELETED, true],
    ] as const) {
      await tx.$executeRaw`
        INSERT INTO detail_page_artifacts (id, organization_id, content_workspace_id, is_deleted)
        VALUES (${id}::uuid, ${ORG}::uuid, ${WORKSPACE}::uuid, ${deleted})
      `;
    }
    await tx.$executeRaw`
      INSERT INTO detail_page_revisions (id, organization_id, artifact_id, content_generation_id, html, created_at)
      VALUES
        (${REVISION_CURRENT}::uuid, ${ORG}::uuid, ${ARTIFACT_CURRENT}::uuid, ${GEN_CURRENT}::uuid,
          '<main>newer revision</main>', '2026-05-13T00:00:00Z'),
        (${REVISION_SAME}::uuid, ${ORG}::uuid, ${ARTIFACT_SAME}::uuid, ${GEN_SAME}::uuid,
          '<main>same edit</main>', '2026-05-13T00:00:00Z')
    `;
    await tx.$executeRaw`UPDATE detail_page_artifacts SET current_revision_id = ${REVISION_CURRENT}::uuid WHERE id = ${ARTIFACT_CURRENT}::uuid`;
    await tx.$executeRaw`UPDATE detail_page_artifacts SET current_revision_id = ${REVISION_SAME}::uuid WHERE id = ${ARTIFACT_SAME}::uuid`;
    const generations: [string, string | null, string | null][] = [
      [GEN_EMPTY, ARTIFACT_EMPTY, '<main>empty artifact edit</main>'],
      [GEN_CURRENT, ARTIFACT_CURRENT, '<main>older edit</main>'],
      [GEN_SAME, ARTIFACT_SAME, '<main>same edit</main>'],
      [GEN_NO_ARTIFACT, null, '<main>orphan edit</main>'],
      [GEN_DELETED, ARTIFACT_DELETED, '<main>deleted artifact edit</main>'],
      [GEN_NOT_EDITED, ARTIFACT_EMPTY, null],
    ];
    for (const [id, artifactId, html] of generations) {
      await tx.$executeRaw`
        INSERT INTO content_generations
          (id, organization_id, content_workspace_id, detail_page_artifact_id, edited_html, edited_html_saved_at,
           triggered_by_user_id)
        VALUES (${id}::uuid, ${ORG}::uuid, ${WORKSPACE}::uuid, ${artifactId}::uuid, ${html},
          ${html ? SAVED_AT : null}, ${USER}::uuid)
      `;
    }
  }

  async function readState(tx: Prisma.TransactionClient) {
    const revisions = await tx.$queryRaw<Array<Revision & { id: string }>>`
      SELECT id::text AS id, artifact_id::text AS artifact_id, content_generation_id::text AS content_generation_id,
        revision_type, html, created_by_user_id::text AS created_by_user_id, created_at
      FROM detail_page_revisions ORDER BY artifact_id, created_at, html
    `;
    const artifacts = await tx.$queryRaw<Array<{ id: string; current_revision_id: string | null }>>`
      SELECT id::text AS id, current_revision_id::text AS current_revision_id
      FROM detail_page_artifacts ORDER BY id
    `;
    return {
      revisions: revisions.map(({ id: _id, ...revision }) => revision),
      revisionIds: new Map(revisions.map((revision) => [revision.id, revision.content_generation_id])),
      artifacts,
    };
  }

  async function withLegacySchema<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return withTempSchema(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE content_generations (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, content_workspace_id uuid NOT NULL,
        detail_page_artifact_id uuid, edited_html text, edited_html_saved_at timestamptz,
        triggered_by_user_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE detail_page_artifacts (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, content_workspace_id uuid NOT NULL,
        current_revision_id uuid, is_deleted boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      ) ON COMMIT DROP`;
      await tx.$executeRaw`CREATE TEMP TABLE detail_page_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, artifact_id uuid NOT NULL,
        content_generation_id uuid, revision_type text NOT NULL DEFAULT 'manual_edit', html text NOT NULL,
        asset_url_map jsonb NOT NULL DEFAULT '{}', image_urls jsonb NOT NULL DEFAULT '[]',
        created_by_user_id uuid, created_at timestamptz NOT NULL DEFAULT now()
      ) ON COMMIT DROP`;
      return work(tx);
    });
  }

  async function withTempSchema<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL search_path TO pg_temp`;
      const result = await work(tx);
      await tx.$executeRaw`DROP TABLE IF EXISTS content_generations, detail_page_artifacts, detail_page_revisions CASCADE`;
      return result;
    }, { timeout: 60_000 });
  }
});
