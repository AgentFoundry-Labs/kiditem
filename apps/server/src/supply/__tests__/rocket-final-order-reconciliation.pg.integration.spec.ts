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
    await prisma.sellpiaInventorySku.create({
      data: {
        id: SKU_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-PA-1',
        name: 'PA inventory',
        currentStock: 10,
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
    const replay = await prisma.$transaction((tx) => adapter.reconcile({ ...input, transaction: tx }));

    const expectedIntentKey = `rocket-workbook:${exportId}:shipment`;
    expect(first).toEqual({
      exportId,
      transmissionIntentKey: expectedIntentKey,
      matchedLineCount: 1,
      reconciledRows: 1,
      skippedLines: [],
    });
    expect(replay).toEqual(first);
    expect(await prisma.rocketPurchaseConfirmationLine.findFirstOrThrow()).toMatchObject({
      collectedOrderLineItemId: finalOrderLineId,
      collectedAt: expect.any(Date),
    });
    expect(await prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
      where: { id: exportId },
    })).toMatchObject({
      status: 'orders_collected',
      ordersCollectedAt: expect.any(Date),
    });
    expect(await prisma.rocketPurchaseConfirmationTransmission.findMany()).toEqual([
      expect.objectContaining({
        confirmationId: exportId,
        sourceImportRunId: finalImportRunId,
        transport: 'SHIPMENT',
        intentKey: expectedIntentKey,
        matchedLineCount: 1,
      }),
    ]);
    expect(await prisma.inventoryCommitment.count()).toBe(0);
  });

  it('skips a line without an active confirmation instead of throwing 409', async () => {
    // 발주확정(commitment)이 하나도 없는 현재 상태를 재현한다. 예전에는 여기서
    // ROCKET_REQUEST_COMMITMENT_NOT_FOUND 409 로 배치 전체가 죽었다.
    const result = await prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 3, '8801234567890'),
      transaction: tx,
    }));

    expect(result).toEqual({
      exportId: null,
      transmissionIntentKey: null,
      matchedLineCount: 0,
      reconciledRows: 0,
      skippedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
    });
    expect(await prisma.inventoryCommitment.count()).toBe(0);
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
      transmissionIntentKey: `rocket-workbook:${exportId}:shipment`,
      matchedLineCount: 1,
      reconciledRows: 1,
      skippedLines: [{ poNumber: 'PO-2', productNo: 'P-2' }],
    });
    expect(await prisma.inventoryCommitment.count()).toBe(0);
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
    expect(await prisma.inventoryCommitment.count()).toBe(0);
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
    expect(await prisma.inventoryCommitment.count()).toBe(0);
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
      matchedLineCount: 0,
      reconciledRows: 0,
      skippedLines: [],
    });
    expect(await prisma.rocketPurchaseConfirmationTransmission.findFirstOrThrow()).toMatchObject({
      confirmationId: exportId,
      transport: 'MILKRUN',
      intentKey: null,
      matchedLineCount: 0,
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
        status: 'awaiting_coupang_confirmation',
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
        sellpiaInventorySkuId: SKU_ID,
        unitsPerVariant: 1,
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
        status: 'awaiting_coupang_confirmation',
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
