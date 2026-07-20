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
import { InventoryCommitmentRepositoryAdapter } from '../../inventory/adapter/out/repository/inventory-commitment.repository.adapter';
import { InventoryCommitmentService } from '../../inventory/application/service/inventory-commitment.service';
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
    const inventory = new InventoryCommitmentService(
      new InventoryCommitmentRepositoryAdapter(prismaService),
    );
    const reconciliation = new RocketFinalOrderReconciliationService(
      new RocketFinalOrderReconciliationTransactionAdapter(inventory),
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

  it('persists Orders and replaces request commitments atomically on replay', async () => {
    await seedRequest('PO-1', 'P-1', '8801234567890', 4);
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

    expect(first).toMatchObject({ duplicate: false, reconciledRows: 1 });
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
    const commitments = await prisma.inventoryCommitment.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(commitments).toMatchObject([
      { kind: 'rocket_request', status: 'released' },
      {
        kind: 'rocket_final_order',
        sourceId: order.lineItems[0]!.id,
        status: 'active',
        unitQuantity: 3,
      },
    ]);
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
    expect(await prisma.inventoryCommitment.findFirstOrThrow()).toMatchObject({
      kind: 'rocket_request',
      status: 'active',
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
        status: 'active',
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
    const commitment = await prisma.inventoryCommitment.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        kind: 'rocket_request',
        sourceId: line.id,
        businessKey: `coupang-rocket:${CHANNEL_ACCOUNT_ID}:${poNumber}:${productNo}`,
        unitQuantity: quantity,
        status: 'active',
        inventoryGeneration: 1n,
        createdBy: TEST_USER_ID,
      },
    });
    await prisma.inventoryCommitmentAllocation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        commitmentId: commitment.id,
        sellpiaInventorySkuId: SKU_ID,
        unitsPerItem: 1,
        quantity,
      },
    });
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
