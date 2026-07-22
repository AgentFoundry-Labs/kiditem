import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { RocketFinalOrderReconciliationTransactionAdapter } from '../../supply/adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter';
import { RocketFinalOrderReconciliationService } from '../../supply/application/service/rocket-final-order-reconciliation.service';
import { CoupangDirectOrderCollectionTransactionAdapter } from '../adapter/out/transaction/coupang-direct-order-collection.transaction.adapter';
import { CoupangDirectOrderCollectionService } from '../application/service/coupang-direct-order-collection.service';

const CHANNEL_ACCOUNT_ID = '51000000-0000-4000-8000-000000000001';
const SKU_ID = '51000000-0000-4000-8000-000000000002';

describe('Coupang direct final-order collection (PG integration)', () => {
  let prisma: PrismaClient;
  let service: CoupangDirectOrderCollectionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const reconciliation = new RocketFinalOrderReconciliationService(
      new RocketFinalOrderReconciliationTransactionAdapter(),
    );
    service = new CoupangDirectOrderCollectionService(
      new CoupangDirectOrderCollectionTransactionAdapter(
        prismaService,
        reconciliation,
      ),
    );
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
        code: 'SP-ORDER-1',
        name: 'Order inventory',
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
  });

  it('persists Orders and links one stable Sellpia transmission intent atomically on replay', async () => {
    const exportId = await seedRequest('PO-1', 'P-1', '8801234567890', 4);
    const input = collectionRequest('PO-1', 'P-1', '8801234567890', 3);

    const first = await service.collect({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: input,
    });
    const replay = await service.collect({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: input,
    });

    expect(first).toMatchObject({
      exportId,
      transmissionIntentKey: `rocket-workbook:${exportId}:shipment`,
      matchedLineCount: 1,
      duplicate: false,
      reconciledRows: 1,
    });
    expect(replay).toEqual({ ...first, duplicate: true });
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderLineItem.count()).toBe(1);
    expect(await prisma.sourceImportRun.count({
      where: { sourceType: 'coupang_rocket_final_order' },
    })).toBe(1);
    const order = await prisma.order.findFirstOrThrow({
      include: { lineItems: true },
    });
    expect(order).toMatchObject({
      sourceImportRunId: first.importRunId,
      externalOrderId: 'PO-1',
      status: 'confirmed',
      totalPrice: 3000,
      lineItems: [{
        sku: 'P-1',
        externalBarcode: '8801234567890',
        quantity: 3,
      }],
    });
    expect(await prisma.rocketPurchaseConfirmationLine.findFirstOrThrow()).toMatchObject({
      collectedOrderLineItemId: order.lineItems[0]!.id,
      collectedAt: expect.any(Date),
    });
    expect(await prisma.rocketPurchaseConfirmationTransmission.findMany()).toEqual([
      expect.objectContaining({
        confirmationId: exportId,
        sourceImportRunId: first.importRunId,
        transport: 'SHIPMENT',
        intentKey: `rocket-workbook:${exportId}:shipment`,
        matchedLineCount: 1,
      }),
    ]);
    expect(await prisma.inventoryCommitment.count()).toBe(0);
  });

  it('collects without throwing when no active confirmation exists, reporting the skip', async () => {
    // 현재 운영 상태(rocket_purchase_confirmation_lines = 0)를 재현한다.
    // 예전에는 ROCKET_REQUEST_COMMITMENT_NOT_FOUND 409 로 수집 전체가 터졌다.
    const input = collectionRequest('PO-9', 'P-9', '8801234567890', 3);

    const result = await service.collect({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: input,
    });

    expect(result).toMatchObject({
      exportId: null,
      transmissionIntentKey: null,
      matchedLineCount: 0,
      reconciledRows: 0,
      confirmedLines: [],
      skippedLines: [{ poNumber: 'PO-9', productNo: 'P-9' }],
      duplicate: false,
    });
    // 최종주문 자체는 실제 주문이라 적재되지만, 발주확정이 없어 재고 커밋은 생기지 않는다.
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderLineItem.count()).toBe(1);
    expect(await prisma.sourceImportRun.count({
      where: { sourceType: 'coupang_rocket_final_order', status: 'completed' },
    })).toBe(1);
    expect(await prisma.inventoryCommitment.count()).toBe(0);
  });

  it('rolls back import run and Orders when reconciliation fails', async () => {
    await seedRequest('PO-1', 'P-1', '8801234567890', 4);

    await expect(service.collect({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: collectionRequest('PO-1', 'P-1', 'DIFFERENT', 3),
    })).rejects.toMatchObject({ code: 'ROCKET_FINAL_ORDER_BARCODE_MISMATCH' });

    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.sourceImportRun.count({
      where: { sourceType: 'coupang_rocket_final_order' },
    })).toBe(0);
    expect(await prisma.rocketPurchaseConfirmationLine.findFirstOrThrow()).toMatchObject({
      collectedOrderLineItemId: null,
    });
    expect(await prisma.rocketPurchaseConfirmationTransmission.count()).toBe(0);
    expect(await prisma.inventoryCommitment.count()).toBe(0);
  });

  it('persists an empty transport probe so a fresh no-match check is durable', async () => {
    const exportId = await seedRequest('PO-1', 'P-1', '8801234567890', 4);
    const request = {
      ...collectionRequest('PO-1', 'P-1', '8801234567890', 3),
      transport: 'MILKRUN' as const,
      pos: [],
    };

    const result = await service.collect({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request,
    });

    expect(result).toMatchObject({
      exportId,
      transmissionIntentKey: null,
      matchedLineCount: 0,
      confirmedLines: [],
      skippedLines: [],
    });
    expect(await prisma.rocketPurchaseConfirmationTransmission.findFirstOrThrow()).toMatchObject({
      confirmationId: exportId,
      sourceImportRunId: result.importRunId,
      transport: 'MILKRUN',
      intentKey: null,
      matchedLineCount: 0,
    });
  });

  async function seedRequest(
    poNumber: string,
    productNo: string,
    barcode: string,
    quantity: number,
  ) {
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
        poNumber,
        productNo,
        barcode,
        productName: 'Rocket item',
        orderQuantity: quantity,
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
});

function collectionRequest(
  poNumber: string,
  productNo: string,
  barcode: string,
  qty: number,
) {
  return {
    channelAccountId: CHANNEL_ACCOUNT_ID,
    transport: 'SHIPMENT' as const,
    centers: { 'Seoul FC': { addr: 'Seoul', zip: '01234', contact: '02-1234' } },
    pos: [{
      seq: poNumber,
      status: 'PA' as const,
      center: 'Seoul FC',
      transport: 'SHIPMENT' as const,
      edd: '2026-07-20',
      reg: '2026-07-18 09:00:00',
      items: [{
        skuId: productNo,
        barcode,
        name: 'Rocket item',
        qty,
        amount: qty * 1000,
      }],
    }],
  };
}
