import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { RocketFinalOrderReconciliationTransactionAdapter } from '../adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter';

const CHANNEL_ACCOUNT_ID = '41000000-0000-4000-8000-000000000001';
const SKU_ID = '41000000-0000-4000-8000-000000000002';
let finalImportRunId: string;

describe('Rocket final-order reconciliation transaction (PG)', () => {
  let prisma: PrismaClient;
  let adapter: RocketFinalOrderReconciliationTransactionAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new RocketFinalOrderReconciliationTransactionAdapter();
  });

  afterAll(async () => prisma?.$disconnect());

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: CHANNEL_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        name: 'Rocket',
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        requestedGeneration: 1n,
        verifiedGeneration: 1n,
        lastVerifiedAt: new Date(),
      },
    });
    finalImportRunId = (await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceType: 'coupang_rocket_final_order',
        fileName: 'final-order.json',
        fileHash: randomUUID(),
        status: 'running',
        createdBy: TEST_USER_ID,
      },
    })).id;
  });

  it('links the collected order and creates one stable transmission intent key idempotently', async () => {
    const exportId = await seedRequest(4, '8801234567890');
    const finalOrderLineId = randomUUID();
    const input = reconciliationInput(finalOrderLineId, 3, '8801234567890');

    const first = await prisma.$transaction((tx) => adapter.reconcile({ ...input, transaction: tx }));
    const linked = await prisma.rocketPurchaseConfirmationLine.findFirstOrThrow();
    const replay = await prisma.$transaction((tx) => adapter.reconcile({ ...input, transaction: tx }));

    const expectedIntentKey = `rocket-final-order:${finalImportRunId}:shipment`;
    expect(first).toEqual({
      exportId,
      transmissionIntentKey: expectedIntentKey,
      reconciledRows: 1,
      unmatchedLines: [],
    });
    expect(replay).toEqual(first);
    expect(linked).toMatchObject({
      collectedOrderLineItemId: finalOrderLineId,
      collectedAt: expect.any(Date),
    });
    // The first link time is the orders-collected fact: a replay keeps it, and
    // reconciliation leaves the export's own terminal state to Supply.
    expect(await prisma.rocketPurchaseConfirmationLine.findFirstOrThrow()).toEqual(linked);
    expect(await prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
      where: { id: exportId },
      select: { completedAt: true, releasedAt: true },
    })).toEqual({ completedAt: null, releasedAt: null });
    expect(await prisma.rocketPurchaseConfirmationTransmission.findMany()).toEqual([
      expect.objectContaining({
        confirmationId: exportId,
        sourceImportRunId: finalImportRunId,
        transport: 'SHIPMENT',
        intentKey: expectedIntentKey,
      }),
    ]);
  });

  it.each([
    ['completed', { completedAt: new Date() }],
    ['released', { releasedAt: new Date() }],
  ] as const)('does not link a %s export or record a probe on it', async (_state, terminal) => {
    const exportId = await seedRequest(4, '8801234567890');
    await prisma.rocketPurchaseConfirmation.update({
      where: { id: exportId },
      data: terminal,
    });

    const result = await prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 3, '8801234567890'),
      transaction: tx,
    }));

    expect(result).toEqual({
      exportId: null,
      transmissionIntentKey: `rocket-final-order:${finalImportRunId}:shipment`,
      reconciledRows: 0,
      unmatchedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
    });
    expect(await prisma.rocketPurchaseConfirmationLine.findFirstOrThrow()).toMatchObject({
      collectedOrderLineItemId: null,
      collectedAt: null,
    });
    expect(await prisma.rocketPurchaseConfirmationTransmission.count()).toBe(0);
  });

  it('reports an unmatched line with a stable file intent instead of throwing 409', async () => {
    // 발주확정(commitment)이 하나도 없는 현재 상태를 재현한다. 예전에는 여기서
    // ROCKET_REQUEST_COMMITMENT_NOT_FOUND 409 로 배치 전체가 죽었다.
    const result = await prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 3, '8801234567890'),
      transaction: tx,
    }));

    expect(result).toEqual({
      exportId: null,
      transmissionIntentKey: `rocket-final-order:${finalImportRunId}:shipment`,
      reconciledRows: 0,
      unmatchedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
    });
  });

  it('reconciles matched lines and skips unmatched ones in the same batch', async () => {
    const exportId = await seedRequest(4, '8801234567890');
    const matchedLineId = randomUUID();
    const unmatchedLineId = randomUUID();

    const result = await prisma.$transaction((tx) => adapter.reconcile({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      sourceImportRunId: finalImportRunId,
      transport: 'SHIPMENT',
      transaction: tx,
      lines: [
        {
          finalOrderLineId: matchedLineId,
          poNumber: 'PO-1',
          productNo: 'P-1',
          barcode: '8801234567890',
          unitQuantity: 3,
        },
        {
          finalOrderLineId: unmatchedLineId,
          poNumber: 'PO-2',
          productNo: 'P-2',
          barcode: '8809999999999',
          unitQuantity: 2,
        },
      ],
    }));

    expect(result).toEqual({
      exportId,
      transmissionIntentKey: `rocket-final-order:${finalImportRunId}:shipment`,
      reconciledRows: 1,
      unmatchedLines: [{ poNumber: 'PO-2', productNo: 'P-2' }],
    });
  });

  it('rejects barcode mismatch without changing the request commitment', async () => {
    await seedRequest(4, '8801234567890');

    await expect(prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 3, 'DIFFERENT'),
      transaction: tx,
    }))).rejects.toMatchObject({ code: 'ROCKET_FINAL_ORDER_BARCODE_MISMATCH' });
    expect(await prisma.rocketPurchaseConfirmationLine.findFirstOrThrow()).toMatchObject({
      collectedOrderLineItemId: null,
    });
    expect(await prisma.rocketPurchaseConfirmationTransmission.count()).toBe(0);
  });

  it('still rejects an ambiguous match (2+ confirmations) as a data-integrity error', async () => {
    // 같은 (발주번호, SKU) 에 활성 발주확정 라인이 2건이면 진짜 무결성 오류다 — 스킵하지 않는다.
    await seedConfirmationLineOnly('8801234567890');
    await seedConfirmationLineOnly('8801234567890');

    await expect(prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 3, '8801234567890'),
      transaction: tx,
    }))).rejects.toMatchObject({ code: 'ROCKET_FINAL_ORDER_AMBIGUOUS' });
  });

  it('does not re-check stock or create a commitment while linking a collected order', async () => {
    const exportId = await seedRequest(4, null);

    await expect(prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 11, null),
      transaction: tx,
    }))).resolves.toMatchObject({
      exportId,
      reconciledRows: 1,
    });
  });

  it('records a no-match transport probe on the active export without creating an intent key', async () => {
    const exportId = await seedRequest(4, '8801234567890');

    const result = await prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 2, '8809999999999'),
      transport: 'MILKRUN',
      lines: [],
      transaction: tx,
    }));

    expect(result).toEqual({
      exportId,
      transmissionIntentKey: null,
      reconciledRows: 0,
      unmatchedLines: [],
    });
    expect(await prisma.rocketPurchaseConfirmationTransmission.findFirstOrThrow()).toMatchObject({
      confirmationId: exportId,
      transport: 'MILKRUN',
      intentKey: null,
    });
  });

  async function seedRequest(quantity: number, barcode: string | null) {
    const sourceRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceType: 'coupang_rocket_po_catalog',
        fileName: 'request.json',
        fileHash: randomUUID(),
        status: 'completed',
      },
    });
    const confirmation = await prisma.rocketPurchaseConfirmation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceImportRunId: sourceRun.id,
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        freshnessGeneration: 1n,
        confirmedBy: TEST_USER_ID,
      },
    });
    const line = await prisma.rocketPurchaseConfirmationLine.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: confirmation.id,
        poLineId: randomUUID(),
        poNumber: 'PO-1',
        productNo: 'P-1',
        barcode,
        productName: 'Rocket item',
        orderQuantity: 4,
        confirmedQuantity: quantity,
      },
    });
    await prisma.rocketPurchaseConfirmationAllocation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationLineId: line.id,
        // This fixture represents an immutable pre-cutover allocation. Keep
        // the historical source identifier; reconciliation never rewrites it.
        legacySellpiaInventorySkuId: SKU_ID,
        unitsPerSale: 1,
        quantity,
      },
    });
    return confirmation.id;
  }

  // AMBIGUOUS 는 findMany 매칭 시점(커밋 이전)에 판별되므로 확정 라인만 있으면 재현된다.
  async function seedConfirmationLineOnly(barcode: string | null) {
    const sourceRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceType: 'coupang_rocket_po_catalog',
        fileName: 'request.json',
        fileHash: randomUUID(),
        status: 'completed',
      },
    });
    const confirmation = await prisma.rocketPurchaseConfirmation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceImportRunId: sourceRun.id,
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        freshnessGeneration: 1n,
        confirmedBy: TEST_USER_ID,
      },
    });
    await prisma.rocketPurchaseConfirmationLine.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: confirmation.id,
        poLineId: randomUUID(),
        poNumber: 'PO-1',
        productNo: 'P-1',
        barcode,
        productName: 'Rocket item',
        orderQuantity: 4,
        confirmedQuantity: 4,
      },
    });
  }
});

function reconciliationInput(
  finalOrderLineId: string,
  unitQuantity: number,
  barcode: string | null,
) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    channelAccountId: CHANNEL_ACCOUNT_ID,
    sourceImportRunId: finalImportRunId,
    transport: 'SHIPMENT' as const,
    lines: [{
      finalOrderLineId,
      poNumber: 'PO-1',
      productNo: 'P-1',
      barcode,
      unitQuantity,
    }],
  };
}
