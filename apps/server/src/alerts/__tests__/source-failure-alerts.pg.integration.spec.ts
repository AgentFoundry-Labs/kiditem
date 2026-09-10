import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsRepository } from '../alerts.repository';
import { SourceFailureAlerts } from '../alerts.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { Prisma, PrismaClient } from '@prisma/client';

const ATTEMPT_ID_1 = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID_2 = '22222222-2222-4222-8222-222222222222';
const DEDUPE_KEY = 'sellpia:profitability:2026-08';

function failure(attemptId: string) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    dedupeKey: DEDUPE_KEY,
    sourceType: 'sellpia_product_profitability',
    attemptId,
    severity: 'error' as const,
    title: 'Sellpia 수익성 수집 실패',
    message: '공급가를 확인할 수 없습니다.',
    href: '/analytics/sellpia-product-sales',
  };
}

describe('SourceFailureAlerts (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let alerts: SourceFailureAlerts;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    alerts = new SourceFailureAlerts(new AlertsRepository(prisma));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.sourceImportRun.create({
      data: {
        id: ATTEMPT_ID_1,
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_product_profitability',
        status: 'running',
      },
    });
  });

  async function inTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => operation(tx));
  }

  it('keeps one row, ignores the same attempt replay, and reopens unread for a newer failure', async () => {
    await inTransaction(async (tx) => {
      await tx.sourceImportRun.update({
        where: { id: ATTEMPT_ID_1 },
        data: { status: 'failed' },
      });
      await alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_1));
    });
    const created = await prisma.alert.findUniqueOrThrow({
      where: {
        organizationId_dedupeKey: {
          organizationId: TEST_ORGANIZATION_ID,
          dedupeKey: DEDUPE_KEY,
        },
      },
    });
    await alerts.dismiss(created.id, TEST_ORGANIZATION_ID);

    const dismissed = await prisma.alert.findUniqueOrThrow({ where: { id: created.id } });
    const timestamps = {
      createdAt: dismissed.createdAt,
      updatedAt: dismissed.updatedAt,
      readAt: dismissed.readAt,
    };

    await inTransaction((tx) => alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_1)));
    const replayed = await prisma.alert.findUniqueOrThrow({ where: { id: created.id } });
    expect(replayed).toMatchObject({
      status: 'OPEN',
      isRead: true,
      attemptId: ATTEMPT_ID_1,
    });
    expect(replayed.createdAt).toEqual(timestamps.createdAt);
    expect(replayed.updatedAt).toEqual(timestamps.updatedAt);
    expect(replayed.readAt).toEqual(timestamps.readAt);

    await prisma.sourceImportRun.create({
      data: {
        id: ATTEMPT_ID_2,
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_product_profitability',
        status: 'running',
      },
    });
    await inTransaction((tx) => alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_2)));

    await expect(prisma.alert.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({
      status: 'OPEN',
      isRead: false,
      attemptId: ATTEMPT_ID_2,
    });
    await expect(prisma.alert.count({ where: { organizationId: TEST_ORGANIZATION_ID, dedupeKey: DEDUPE_KEY } })).resolves.toBe(1);
  });

  it('resolves the current dedupe row for a newer completing attempt without creating a success notification', async () => {
    await inTransaction(async (tx) => {
      await tx.sourceImportRun.update({
        where: { id: ATTEMPT_ID_1 },
        data: { status: 'failed' },
      });
      await alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_1));
    });
    await prisma.sourceImportRun.create({
      data: {
        id: ATTEMPT_ID_2,
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_product_profitability',
        status: 'running',
      },
    });
    await inTransaction((tx) => alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_2)));
    const created = await prisma.alert.findUniqueOrThrow({
      where: {
        organizationId_dedupeKey: {
          organizationId: TEST_ORGANIZATION_ID,
          dedupeKey: DEDUPE_KEY,
        },
      },
    });
    await inTransaction((tx) => alerts.resolveSourceFailure(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      dedupeKey: DEDUPE_KEY,
      attemptId: ATTEMPT_ID_2,
    }));

    await expect(prisma.alert.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({
      status: 'RESOLVED',
      attemptId: ATTEMPT_ID_2,
    });
    await expect(prisma.alert.count({ where: { organizationId: TEST_ORGANIZATION_ID } })).resolves.toBe(1);
  });

  it('rolls the source terminal state back when the alert mutation fails', async () => {
    const upsert = vi.spyOn(alerts, 'upsertSourceFailure').mockRejectedValueOnce(
      new Error('alert mutation failed'),
    );

    await expect(
      inTransaction(async (tx) => {
        await tx.sourceImportRun.update({
          where: { id: ATTEMPT_ID_1 },
          data: { status: 'failed' },
        });
        await alerts.upsertSourceFailure(tx, failure(ATTEMPT_ID_1));
      }),
    ).rejects.toThrow('alert mutation failed');

    expect(upsert).toHaveBeenCalledWith(expect.anything(), failure(ATTEMPT_ID_1));
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: ATTEMPT_ID_1 } })).resolves.toMatchObject({
      status: 'running',
    });
    upsert.mockRestore();
  });
});
