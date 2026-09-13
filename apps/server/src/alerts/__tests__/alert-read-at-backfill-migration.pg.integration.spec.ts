import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SourceFailureAlerts } from '../alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { backfillAlertReadAtFromIsReadMigration } from '../../../../../scripts/data-migrations/v0.1.31/008_backfill_alert_read_at_from_is_read';

const UPDATED_AT = new Date('2026-04-20T03:00:00.000Z');
const READ_AT = new Date('2026-09-10T05:00:00.000Z');

type AlertReadRow = { id: string; is_read: boolean; read_at: Date | null; updated_at: Date };

/**
 * Readers derive read state from `readAt` alone. Before 2026-05-08 an alert was
 * marked read by `isRead` only, so a row from then would come back unread. The
 * migration makes the two columns agree, which is what keeps every alert
 * reading the way it did before the derivation.
 */
describe('v0.1.31:008 backfill alert readAt from isRead (PostgreSQL)', () => {
  let prisma: PrismaClient;
  // The KID-90 schema step drops `is_read`. Where the pushed schema no longer
  // has it, the pre-cutover column is recreated for this suite and removed after.
  let recreatedIsRead = false;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    recreatedIsRead = !(await alertsHaveIsRead(prisma));
    if (recreatedIsRead) {
      await prisma.$executeRaw`ALTER TABLE alerts ADD COLUMN is_read boolean NOT NULL DEFAULT false`;
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    if (recreatedIsRead) await prisma.$executeRaw`ALTER TABLE alerts DROP COLUMN IF EXISTS is_read`;
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedAlert(dedupeKey: string, state: { isRead: boolean; readAt: Date | null }) {
    const row = await prisma.alert.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        dedupeKey,
        type: 'source_failure',
        title: dedupeKey,
        status: 'OPEN',
        readAt: state.readAt,
      },
    });
    // The retiring column is written in SQL, which also pins updated_at outside
    // Prisma's @updatedAt so the stamp is observable.
    await prisma.$executeRaw`
      UPDATE alerts SET is_read = ${state.isRead}, updated_at = ${UPDATED_AT}
      WHERE id = ${row.id}::uuid AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
    `;
    return row.id;
  }

  async function readRows(): Promise<Map<string, AlertReadRow>> {
    const rows = await prisma.$queryRaw<AlertReadRow[]>`
      SELECT id::text AS id, is_read, read_at, updated_at
      FROM alerts
      WHERE organization_id = ${TEST_ORGANIZATION_ID}::uuid
    `;
    return new Map(rows.map((row) => [row.id, row]));
  }

  it('makes readAt agree with isRead once, then is a no-op', async () => {
    const legacyRead = await seedAlert('legacy-read', { isRead: true, readAt: null });
    const staleStamp = await seedAlert('stale-stamp', { isRead: false, readAt: READ_AT });
    const read = await seedAlert('read', { isRead: true, readAt: READ_AT });
    const unread = await seedAlert('unread', { isRead: false, readAt: null });

    const first = await prisma.$transaction((tx) => backfillAlertReadAtFromIsReadMigration.run(tx));
    expect(first).toEqual({
      affectedRows: 2,
      details: { stampedReadRows: 1, clearedStampRows: 1, isReadColumnPresent: true },
    });

    const rows = await readRows();
    expect(rows.get(legacyRead)).toMatchObject({ is_read: true, read_at: UPDATED_AT, updated_at: UPDATED_AT });
    expect(rows.get(staleStamp)).toMatchObject({ is_read: false, read_at: null, updated_at: UPDATED_AT });
    expect(rows.get(read)).toMatchObject({ is_read: true, read_at: READ_AT });
    expect(rows.get(unread)).toMatchObject({ is_read: false, read_at: null });

    const listed = await new SourceFailureAlerts(prisma as never).list(TEST_ORGANIZATION_ID);
    expect(Object.fromEntries(listed.map((alert) => [alert.title, alert.isRead]))).toEqual({
      'legacy-read': true,
      'stale-stamp': false,
      read: true,
      unread: false,
    });

    const second = await prisma.$transaction((tx) => backfillAlertReadAtFromIsReadMigration.run(tx));
    expect(second).toEqual({
      affectedRows: 0,
      details: { stampedReadRows: 0, clearedStampRows: 0, isReadColumnPresent: true },
    });
  });

  it('changes nothing on a database whose alerts no longer carry is_read', async () => {
    const stamped = await seedAlert('stamped', { isRead: false, readAt: READ_AT });
    const restore = 'restore alerts.is_read';
    let result: unknown;

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE alerts DROP COLUMN is_read`;
      result = await backfillAlertReadAtFromIsReadMigration.run(tx);
      // The old shape would clear this stamp; without `is_read` it stays.
      const [row] = await tx.$queryRaw<Array<{ read_at: Date | null }>>`
        SELECT read_at FROM alerts
        WHERE id = ${stamped}::uuid AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
      `;
      expect(row?.read_at).toEqual(READ_AT);
      throw new Error(restore);
    }, { timeout: 20_000 })).rejects.toThrow(restore);

    expect(result).toEqual({
      affectedRows: 0,
      details: { stampedReadRows: 0, clearedStampRows: 0, isReadColumnPresent: false },
    });
  });

  it('registers as a pre-schema v0.1.31 migration', () => {
    expect(backfillAlertReadAtFromIsReadMigration).toMatchObject({
      id: 'v0.1.31:008_backfill_alert_read_at_from_is_read',
      releaseVersion: '0.1.31',
      phase: 'pre-schema',
    });
  });
});

async function alertsHaveIsRead(prisma: PrismaClient): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'alerts' AND column_name = 'is_read'
    ) AS present
  `;
  return row?.present === true;
}
