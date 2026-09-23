import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestPrisma, resetDb, seedBaseFixture } from '../../test-helpers/real-prisma';
import { backfillThumbnailTrackingInconclusiveMarkMigration } from '../../../../../scripts/data-migrations/v0.1.31/010_backfill_thumbnail_tracking_inconclusive_mark';

/**
 * KID-313 W3a dropped `thumbnail_trackings`. The KID-90 pre-schema backfill stays in the train for databases
 * that still carry the table and must be a zero-row no-op on a database that no longer has it.
 */
describe('thumbnail tracking inconclusive mark migration after the table was dropped (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });
  afterAll(async () => prisma?.$disconnect());

  it('is a zero-row no-op when the tracking table is absent', async () => {
    await expect(prisma.$queryRaw<Array<{ present: boolean }>>`
      SELECT to_regclass('public.thumbnail_trackings') IS NOT NULL AS present
    `).resolves.toEqual([{ present: false }]);

    await expect(prisma.$transaction((tx) => backfillThumbnailTrackingInconclusiveMarkMigration.run(tx))).resolves.toEqual({
      affectedRows: 0,
      details: {
        thumbnailTrackingTablePresent: false,
        statusColumnPresent: false,
        markedInconclusiveRows: 0,
      },
    });
  });
});
