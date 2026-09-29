import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
  TEST_USER_ID as USER,
} from '../../test-helpers/real-prisma';
import {
  dropLegacySellpiaTransmissionIntentTables,
  insertLegacySellpiaTransmissionIntent,
  restoreLegacySellpiaTransmissionIntentTables,
} from '../../test-helpers/legacy-sellpia-transmission-intents-tables';
import { stampRocketWorkbookCompletedFromTransmissionIntentsMigration as migration } from '../../../../../scripts/data-migrations/v0.1.31/035_stamp_rocket_workbook_completed_from_transmission_intents';

/**
 * KID-388: 워크북 진행이 전송 실행으로 옮겨 가면 옛 intent 표(곧 drop)로만 완료가 증명되는 워크북이 다시 열린다.
 * pre-schema 035는 옛 판정(양수 라인 모두 수집 + 비어 있지 않은 관측의 intent가 모두 finalized)을 만족한 열린
 * 워크북에 가장 늦은 finalizedAt을 `completedAt`으로 옮긴다. 다시 돌면 바꿀 것이 없고, 표가 없으면 건너뛴다.
 */
describe('v0.1.31:035 stamp Rocket workbook completion from transmission intents (PostgreSQL)', () => {
  let prisma: PrismaClient;
  const t = (minute: number) => new Date(Date.UTC(2026, 8, 20, 3, minute));

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  beforeEach(async () => {
    await dropLegacySellpiaTransmissionIntentTables(prisma);
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    // 옛 intent 표는 스키마에서 사라졌다(KID-365) — 035가 읽는 Office 모양을 raw DDL로 되살린다.
    await restoreLegacySellpiaTransmissionIntentTables(prisma);
  });
  afterAll(async () => {
    await dropLegacySellpiaTransmissionIntentTables(prisma);
    await prisma?.$disconnect();
  });

  async function workbook(input: {
    organizationId?: string;
    lines: Array<{ confirmed: number; collected: boolean }>;
    transmissions: Array<{ transport: 'SHIPMENT' | 'MILKRUN'; intent: null | { status: 'prepared' | 'finalized' | 'aborted' | 'never_prepared'; finalizedAt?: Date } }>;
    completedAt?: Date;
    releasedAt?: Date;
  }): Promise<string> {
    const organizationId = input.organizationId ?? ORG;
    const created = await prisma.rocketPurchaseConfirmation.create({
      data: {
        organizationId,
        channelAccountId: '35000000-0000-4000-8000-000000000900',
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        confirmedBy: USER,
        completedAt: input.completedAt ?? null,
        releasedAt: input.releasedAt ?? null,
      },
      select: { id: true },
    });
    for (const [index, line] of input.lines.entries()) {
      await prisma.rocketPurchaseConfirmationLine.create({
        data: {
          organizationId,
          confirmationId: created.id,
          poLineId: `PO-${index}`,
          poNumber: 'PO',
          productNo: `P-${index}`,
          productName: 'item',
          orderQuantity: line.confirmed,
          confirmedQuantity: line.confirmed,
          collectedAt: line.collected ? t(0) : null,
        },
      });
    }
    for (const transmission of input.transmissions) {
      const directshipOperationId = randomUUID();
      const intentKey = transmission.intent
        ? `rocket-final-order:${directshipOperationId}:${transmission.transport.toLowerCase()}`
        : null;
      await prisma.rocketPurchaseConfirmationTransmission.create({
        data: { organizationId, confirmationId: created.id, directshipOperationId, transport: transmission.transport, intentKey },
      });
      if (transmission.intent && transmission.intent.status !== 'never_prepared' && intentKey) {
        await insertLegacySellpiaTransmissionIntent(prisma, {
          organizationId,
          intentKey,
          status: transmission.intent.status,
          createdBy: USER,
          finalizedAt: transmission.intent.finalizedAt ?? null,
        });
      }
    }
    return created.id;
  }

  const completedAt = async (id: string) =>
    (await prisma.rocketPurchaseConfirmation.findUniqueOrThrow({ where: { id }, select: { completedAt: true } })).completedAt;

  it('stamps the latest finalizedAt on open workbooks whose every non-empty transmission intent is finalized', async () => {
    const done = await workbook({
      lines: [{ confirmed: 2, collected: true }, { confirmed: 0, collected: false }],
      transmissions: [
        { transport: 'SHIPMENT', intent: { status: 'finalized', finalizedAt: t(10) } },
        { transport: 'MILKRUN', intent: { status: 'finalized', finalizedAt: t(20) } },
      ],
    });
    const emptyProbeToo = await workbook({
      organizationId: OTHER_ORGANIZATION_ID,
      lines: [{ confirmed: 1, collected: true }],
      transmissions: [
        { transport: 'SHIPMENT', intent: { status: 'finalized', finalizedAt: t(30) } },
        { transport: 'MILKRUN', intent: null },
      ],
    });
    const stillSending = await workbook({
      lines: [{ confirmed: 1, collected: true }],
      transmissions: [
        { transport: 'SHIPMENT', intent: { status: 'finalized', finalizedAt: t(10) } },
        { transport: 'MILKRUN', intent: { status: 'prepared' } },
      ],
    });
    const aborted = await workbook({
      lines: [{ confirmed: 1, collected: true }],
      transmissions: [
        { transport: 'SHIPMENT', intent: { status: 'finalized', finalizedAt: t(10) } },
        { transport: 'MILKRUN', intent: { status: 'aborted' } },
      ],
    });
    const released = await workbook({
      lines: [{ confirmed: 1, collected: true }],
      transmissions: [{ transport: 'SHIPMENT', intent: { status: 'finalized', finalizedAt: t(10) } }],
      releasedAt: t(8),
    });
    const intentNeverPrepared = await workbook({
      lines: [{ confirmed: 1, collected: true }],
      transmissions: [
        { transport: 'SHIPMENT', intent: { status: 'finalized', finalizedAt: t(10) } },
        { transport: 'MILKRUN', intent: { status: 'never_prepared' } },
      ],
    });
    const lineUncollected = await workbook({
      lines: [{ confirmed: 1, collected: true }, { confirmed: 1, collected: false }],
      transmissions: [{ transport: 'SHIPMENT', intent: { status: 'finalized', finalizedAt: t(10) } }],
    });
    const noIntent = await workbook({
      lines: [{ confirmed: 1, collected: true }],
      transmissions: [{ transport: 'SHIPMENT', intent: null }],
    });
    const alreadyDone = await workbook({
      lines: [{ confirmed: 1, collected: true }],
      transmissions: [{ transport: 'SHIPMENT', intent: { status: 'finalized', finalizedAt: t(10) } }],
      completedAt: t(5),
    });

    await expect(prisma.$transaction((tx) => migration.run(tx))).resolves.toEqual({
      affectedRows: 2,
      details: { outcome: 'stamped', stampedWorkbooks: 2 },
    });
    expect(await completedAt(done)).toEqual(t(20));
    expect(await completedAt(emptyProbeToo)).toEqual(t(30));
    expect(await completedAt(stillSending)).toBeNull();
    expect(await completedAt(aborted)).toBeNull();
    expect(await completedAt(released)).toBeNull();
    expect(await completedAt(intentNeverPrepared)).toBeNull();
    expect(await completedAt(lineUncollected)).toBeNull();
    expect(await completedAt(noIntent)).toBeNull();
    expect(await completedAt(alreadyDone)).toEqual(t(5));

    await expect(prisma.$transaction((tx) => migration.run(tx))).resolves.toEqual({
      affectedRows: 0,
      details: { outcome: 'stamped', stampedWorkbooks: 0 },
    });
  });

  it('skips once the intent table is gone', async () => {
    const rollback = new Error('rollback');
    let result: unknown;
    await expect(prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRawUnsafe('DROP TABLE sellpia_order_transmission_intent_reconciliations, sellpia_order_transmission_intents');
      result = await migration.run(tx);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(result).toEqual({ affectedRows: 0, details: { outcome: 'intent_table_absent' } });
  });
});
