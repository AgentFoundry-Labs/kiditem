import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
    code: 'SELLPIA_PROFITABILITY_UNAVAILABLE',
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
    alerts = new SourceFailureAlerts(prisma as never);
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
      await alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_1));
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
    expect(timestamps.readAt).toBeInstanceOf(Date);

    await inTransaction((tx) => alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_1)));
    const replayed = await prisma.alert.findUniqueOrThrow({ where: { id: created.id } });
    expect(replayed).toMatchObject({
      status: 'OPEN',
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
    await inTransaction((tx) => alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_2)));

    await expect(prisma.alert.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({
      status: 'OPEN',
      readAt: null,
      attemptId: ATTEMPT_ID_2,
    });
    await expect(prisma.alert.count({ where: { organizationId: TEST_ORGANIZATION_ID, dedupeKey: DEDUPE_KEY } })).resolves.toBe(1);
  });

  it('keeps a Korean producer sentence, which carries the source context', async () => {
    await inTransaction((tx) => alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_1)));
    const [stored] = await alerts.list(TEST_ORGANIZATION_ID);
    expect(stored).toMatchObject({ title: 'Sellpia 수익성 수집 실패', message: '공급가를 확인할 수 없습니다.' });
  });

  it('stores a Korean title and the registry sentence even when the producer passes English text', async () => {
    await inTransaction((tx) => alerts.recordTerminalOutcome(tx, {
      ...failure(ATTEMPT_ID_1),
      code: 'ATTEMPT_EXPIRED',
      title: 'Wing catalog collection failed',
      message: 'Order collection expired. token=abcd1234',
    }));
    const [stored] = await alerts.list(TEST_ORGANIZATION_ID);
    expect(stored).toMatchObject({
      title: '셀피아 수익성 수집 실패',
      message: '수집 시도가 만료됐습니다. 다시 시작해 주세요.',
    });
    expect(JSON.stringify(stored)).not.toMatch(/[A-Za-z]{4,} (collection|expired)|abcd1234/);
  });

  it('resolves the current dedupe row for a newer completing attempt without creating a success notification', async () => {
    await inTransaction(async (tx) => {
      await tx.sourceImportRun.update({
        where: { id: ATTEMPT_ID_1 },
        data: { status: 'failed' },
      });
      await alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_1));
    });
    await prisma.sourceImportRun.create({
      data: {
        id: ATTEMPT_ID_2,
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_product_profitability',
        status: 'running',
      },
    });
    await inTransaction((tx) => alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_2)));
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

  it('lists only source failures, so a retired rule-violation row never reaches a reader', async () => {
    await inTransaction(async (tx) => {
      await tx.sourceImportRun.update({
        where: { id: ATTEMPT_ID_1 },
        data: { status: 'failed' },
      });
      await alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_1));
    });
    // The shape the retired Rules evaluation left behind: open, unread, and a
    // machine key where the popover shows a sentence. Rows stay until the schema
    // cutover; readers stop seeing them. The read admits source failures only,
    // so the exact type another writer used does not matter.
    await prisma.alert.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        dedupeKey: 'rules.violation:product:rule',
        type: 'retired_rules_signal',
        title: '광고비율 위험',
        message: 'stop_ads',
        status: 'OPEN',
      },
    });

    const listed = await alerts.list(TEST_ORGANIZATION_ID);
    const unreadOpen = await alerts.list(TEST_ORGANIZATION_ID, {
      isRead: false,
      status: 'OPEN',
      limit: 10,
    });

    expect(listed.map((alert) => alert.type)).toEqual(['source_failure']);
    expect(unreadOpen.map((alert) => alert.type)).toEqual(['source_failure']);
    expect(listed.map((alert) => alert.message)).not.toContain('stop_ads');
  });

  it('reads an alert as read exactly when readAt is set', async () => {
    await inTransaction(async (tx) => {
      await tx.sourceImportRun.update({
        where: { id: ATTEMPT_ID_1 },
        data: { status: 'failed' },
      });
      await alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_1));
    });
    const [opened] = await alerts.list(TEST_ORGANIZATION_ID);
    expect(opened).toMatchObject({ isRead: false });

    await alerts.dismiss(opened!.id, TEST_ORGANIZATION_ID);
    await expect(alerts.list(TEST_ORGANIZATION_ID)).resolves.toMatchObject([
      { id: opened!.id, isRead: true },
    ]);
    await expect(alerts.list(TEST_ORGANIZATION_ID, { isRead: false })).resolves.toEqual([]);

    // Clearing the timestamp is what makes it unread again.
    await prisma.alert.update({
      where: { id: opened!.id },
      data: { readAt: null },
    });
    await expect(alerts.list(TEST_ORGANIZATION_ID)).resolves.toMatchObject([
      { id: opened!.id, isRead: false },
    ]);
    await expect(alerts.list(TEST_ORGANIZATION_ID, { isRead: false })).resolves.toMatchObject([
      { id: opened!.id },
    ]);
    await expect(alerts.list(TEST_ORGANIZATION_ID, { isRead: true })).resolves.toEqual([]);
  });

  it('rolls the source terminal state back when the alert mutation fails', async () => {
    const upsert = vi.spyOn(alerts, 'recordTerminalOutcome').mockRejectedValueOnce(
      new Error('alert mutation failed'),
    );

    await expect(
      inTransaction(async (tx) => {
        await tx.sourceImportRun.update({
          where: { id: ATTEMPT_ID_1 },
          data: { status: 'failed' },
        });
        await alerts.recordTerminalOutcome(tx, failure(ATTEMPT_ID_1));
      }),
    ).rejects.toThrow('alert mutation failed');

    expect(upsert).toHaveBeenCalledWith(expect.anything(), failure(ATTEMPT_ID_1));
    await expect(prisma.sourceImportRun.findUniqueOrThrow({ where: { id: ATTEMPT_ID_1 } })).resolves.toMatchObject({
      status: 'running',
    });
    upsert.mockRestore();
  });
});
