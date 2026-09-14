import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { deriveThumbnailTrackingStatus } from '../domain/thumbnail-tracking-status';
import { backfillThumbnailTrackingInconclusiveMarkMigration } from '../../../../../scripts/data-migrations/v0.1.31/010_backfill_thumbnail_tracking_inconclusive_mark';

interface ColumnShape {
  data_type: string;
  is_nullable: string;
  datetime_precision: number | null;
  column_default: string | null;
}

interface LegacyRow {
  key: string;
  status: string;
  ctrBefore: number | null;
  ctrAfter: number | null;
  updatedAt: Date;
}

const EARLIER_UPDATE = new Date('2026-08-01T03:00:00.000Z');
const LATER_UPDATE = new Date('2026-08-20T09:30:00.000Z');

/**
 * The pre-schema migration runs while thumbnail_trackings still has the stored
 * `status` word and no `marked_inconclusive_at`. It moves only the operator's
 * inconclusive judgments onto the mark, and every later run is a zero-row
 * no-op, including after `db push` drops `status`.
 */
describe('v0.1.31:010 backfill thumbnail tracking inconclusive mark (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let pushedMarkColumn: ColumnShape[] = [];

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    pushedMarkColumn = await markColumnShape();
  });

  afterAll(async () => {
    if (!prisma) return;
    // Later suites share this database, so restore the pushed schema shape.
    await prisma.$executeRaw`ALTER TABLE thumbnail_trackings DROP COLUMN IF EXISTS status`;
    await prisma.$executeRaw`ALTER TABLE thumbnail_trackings ADD COLUMN IF NOT EXISTS marked_inconclusive_at timestamptz`;
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('moves only inconclusive rows onto the mark and is a no-op on every re-run', async () => {
    expect(pushedMarkColumn).toHaveLength(1);
    const target = await seedTarget();
    // The shape before the cutover: the stored word and no mark column.
    await prisma.$executeRaw`ALTER TABLE thumbnail_trackings ADD COLUMN status text NOT NULL DEFAULT 'tracking'`;
    await prisma.$executeRaw`ALTER TABLE thumbnail_trackings DROP COLUMN marked_inconclusive_at`;

    const keyById = new Map<string, string>();
    for (const row of [
      { key: 'tracking', status: 'tracking', ctrBefore: 1.1, ctrAfter: null, updatedAt: EARLIER_UPDATE },
      { key: 'measured', status: 'measured', ctrBefore: 1.1, ctrAfter: 2.2, updatedAt: EARLIER_UPDATE },
      { key: 'inconclusive-one-ctr', status: 'inconclusive', ctrBefore: 1.1, ctrAfter: null, updatedAt: EARLIER_UPDATE },
      { key: 'inconclusive-no-ctr', status: 'inconclusive', ctrBefore: null, ctrAfter: null, updatedAt: LATER_UPDATE },
    ] satisfies LegacyRow[]) {
      keyById.set(await insertLegacy(target, row), row.key);
    }

    await expect(runMigration()).resolves.toEqual({
      affectedRows: 2,
      details: {
        thumbnailTrackingTablePresent: true,
        statusColumnPresent: true,
        markedInconclusiveRows: 2,
      },
    });
    // `db push` then finds the column it would create and leaves it alone.
    await expect(markColumnShape()).resolves.toEqual(pushedMarkColumn);

    const rows = await prisma.thumbnailTracking.findMany({ where: { organizationId: TEST_ORGANIZATION_ID } });
    expect(Object.fromEntries(rows.map((row) => [keyById.get(row.id), {
      markedInconclusiveAt: row.markedInconclusiveAt,
      status: deriveThumbnailTrackingStatus(row),
    }]))).toEqual({
      tracking: { markedInconclusiveAt: null, status: 'tracking' },
      measured: { markedInconclusiveAt: null, status: 'measured' },
      'inconclusive-one-ctr': { markedInconclusiveAt: EARLIER_UPDATE, status: 'inconclusive' },
      'inconclusive-no-ctr': { markedInconclusiveAt: LATER_UPDATE, status: 'inconclusive' },
    });

    await expect(runMigration()).resolves.toEqual(noOp({ statusColumnPresent: true }));

    // `db push --accept-data-loss` drops the stored word after the pre-schema phase.
    await prisma.$executeRaw`ALTER TABLE thumbnail_trackings DROP COLUMN status`;
    await expect(runMigration()).resolves.toEqual(noOp({ statusColumnPresent: false }));
    await expect(prisma.thumbnailTracking.count({
      where: { organizationId: TEST_ORGANIZATION_ID, markedInconclusiveAt: { not: null } },
    })).resolves.toBe(2);
  });

  it('is a zero-row no-op when the tracking table is absent', async () => {
    const rollback = new Error('roll back the table-absent probe');
    let result: unknown;

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE thumbnail_trackings RENAME TO thumbnail_trackings_absent_probe`;
      result = await backfillThumbnailTrackingInconclusiveMarkMigration.run(tx);
      throw rollback;
    })).rejects.toBe(rollback);

    expect(result).toEqual({
      affectedRows: 0,
      details: {
        thumbnailTrackingTablePresent: false,
        statusColumnPresent: false,
        markedInconclusiveRows: 0,
      },
    });
    await expect(prisma.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass('public.thumbnail_trackings') IS NOT NULL AS present
    `).resolves.toEqual([{ present: true }]);
  });

  function runMigration() {
    return prisma.$transaction((tx) => backfillThumbnailTrackingInconclusiveMarkMigration.run(tx));
  }

  function noOp(shape: { statusColumnPresent: boolean }) {
    return {
      affectedRows: 0,
      details: {
        thumbnailTrackingTablePresent: true,
        statusColumnPresent: shape.statusColumnPresent,
        markedInconclusiveRows: 0,
      },
    };
  }

  function markColumnShape() {
    return prisma.$queryRaw<ColumnShape[]>`
      SELECT data_type, is_nullable, datetime_precision, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'thumbnail_trackings'
        AND column_name = 'marked_inconclusive_at'
    `;
  }

  async function seedTarget() {
    const account = await prisma.channelAccount.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang', name: 'Legacy tracking Wing' },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'legacy-tracking-listing',
        channelName: '레거시 추적 상품',
      },
    });
    const workspace = await prisma.contentWorkspace.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        ownerType: 'direct_detail_page',
        displayName: 'Legacy tracking workspace',
        normalizedTitle: 'legacytrackingworkspace',
      },
    });
    return { listingId: listing.id, workspaceId: workspace.id };
  }

  async function insertLegacy(
    target: { listingId: string; workspaceId: string },
    row: LegacyRow,
  ): Promise<string> {
    const generation = await prisma.thumbnailGeneration.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        contentWorkspaceId: target.workspaceId,
        status: 'succeeded',
      },
    });
    const [inserted] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO thumbnail_trackings (
        id,
        organization_id,
        listing_id,
        generation_id,
        original_grade,
        ctr_before,
        ctr_after,
        status,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${TEST_ORGANIZATION_ID}::uuid,
        ${target.listingId}::uuid,
        ${generation.id}::uuid,
        'B',
        ${row.ctrBefore}::double precision,
        ${row.ctrAfter}::double precision,
        ${row.status},
        ${row.updatedAt}
      )
      RETURNING id
    `;
    return inserted.id;
  }
});
