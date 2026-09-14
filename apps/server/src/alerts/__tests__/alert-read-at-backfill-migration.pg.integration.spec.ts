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

/**
 * Readers derive read state from `readAt` alone. Before 2026-05-08 an alert was
 * marked read by `isRead` only, so a row from then would come back unread. The
 * migration makes the two columns agree, which is what keeps every alert
 * reading the way it did before the derivation.
 */
describe('v0.1.31:008 backfill alert readAt from isRead (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
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
        severity: 'error',
        title: dedupeKey,
        status: 'OPEN',
        ...state,
      },
    });
    // Pin updated_at outside Prisma's @updatedAt so the stamp is observable.
    await prisma.$executeRaw`UPDATE alerts SET updated_at = ${UPDATED_AT} WHERE id = ${row.id}::uuid`;
    return row.id;
  }

  it('makes readAt agree with isRead once, then is a no-op', async () => {
    const legacyRead = await seedAlert('legacy-read', { isRead: true, readAt: null });
    const staleStamp = await seedAlert('stale-stamp', { isRead: false, readAt: READ_AT });
    const read = await seedAlert('read', { isRead: true, readAt: READ_AT });
    const unread = await seedAlert('unread', { isRead: false, readAt: null });

    const first = await prisma.$transaction((tx) => backfillAlertReadAtFromIsReadMigration.run(tx));
    expect(first).toEqual({
      affectedRows: 2,
      details: { stampedReadRows: 1, clearedStampRows: 1 },
    });

    const rows = new Map(
      (await prisma.alert.findMany({ where: { organizationId: TEST_ORGANIZATION_ID } }))
        .map((row) => [row.id, row]),
    );
    expect(rows.get(legacyRead)).toMatchObject({ isRead: true, readAt: UPDATED_AT, updatedAt: UPDATED_AT });
    expect(rows.get(staleStamp)).toMatchObject({ isRead: false, readAt: null, updatedAt: UPDATED_AT });
    expect(rows.get(read)).toMatchObject({ isRead: true, readAt: READ_AT });
    expect(rows.get(unread)).toMatchObject({ isRead: false, readAt: null });

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
      details: { stampedReadRows: 0, clearedStampRows: 0 },
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
