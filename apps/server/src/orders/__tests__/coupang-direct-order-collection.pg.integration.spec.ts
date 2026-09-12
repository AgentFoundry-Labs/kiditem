import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
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
import { canonicalCoupangDirectOrderHash } from '../mapper/coupang-direct-order.mapper';

const CHANNEL_ACCOUNT_ID = '51000000-0000-4000-8000-000000000001';
const SKU_ID = '51000000-0000-4000-8000-000000000002';

describe('Coupang direct final-order collection (PG integration)', () => {
  let prisma: PrismaClient;
  let service: CoupangDirectOrderCollectionService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    const alerts = new SourceFailureAlerts(prismaService);
    const reconciliation = new RocketFinalOrderReconciliationService(
      new RocketFinalOrderReconciliationTransactionAdapter(),
    );
    service = new CoupangDirectOrderCollectionService(
      new CoupangDirectOrderCollectionTransactionAdapter(
        prismaService,
        reconciliation,
        alerts,
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

  it('persists one complete capture owner and replays both transport projections', async () => {
    const idempotencyKey = randomUUID();
    const attempt = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey,
    });
    await expect(service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey,
    })).resolves.toEqual(attempt);
    await expect(service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    })).rejects.toBeInstanceOf(ConflictException);
    const first = await service.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: collectionRequest('PO-OWNER', 'P-OWNER', '8801234567890', 2) as never,
    });
    const replay = await service.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: collectionRequest('PO-OWNER', 'P-OWNER', '8801234567890', 2) as never,
    });
    const captured = await service.readCaptured({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    });
    expect(await prisma.order.count()).toBe(0);
    const receipt = await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: collectionRequest('PO-OWNER', 'P-OWNER', '8801234567890', 2) as never,
      transport: 'SHIPMENT',
    });
    const receiptReplay = await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: collectionRequest('PO-OWNER', 'P-OWNER', '8801234567890', 2) as never,
      transport: 'SHIPMENT',
    });
    const projection = await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      transport: 'SHIPMENT',
    });

    expect(first).toMatchObject({
      attemptId: attempt.attemptId,
      sourceImportRunId: attempt.attemptId,
      state: 'COMPLETE',
      artifactId: expect.any(String),
      contentChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(replay).toEqual(first);
    expect(captured.capture.pos).toHaveLength(1);
    expect(receiptReplay).toMatchObject({ ...receipt, duplicate: true });
    expect(projection).toMatchObject({
      importRunId: attempt.attemptId,
      request: { transport: 'SHIPMENT', pos: [{ seq: 'PO-OWNER' }] },
      receipt: {
        sourceImportRunId: attempt.attemptId,
        duplicate: false,
        collectedLines: [{ poNumber: 'PO-OWNER', productNo: 'P-OWNER' }],
      },
    });
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderCollectionArtifact.count()).toBe(1);
    expect(await prisma.sourceImportRun.count({
      where: { sourceType: 'coupang_direct_order_capture', status: 'completed' },
    })).toBe(1);
  });

  it('reuses the completed legacy transport run and its transmission key on a fresh owner attempt', async () => {
    const exportId = await seedRequest('PO-1', 'P-1', '8801234567890', 4);
    const input = collectionRequest('PO-1', 'P-1', '8801234567890', 3);
    const legacy = await seedLegacyReceipt(input, exportId);
    const attempt = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });
    await service.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: input as never,
    });
    await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: input as never,
      transport: 'SHIPMENT',
    });
    const projection = await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      transport: 'SHIPMENT',
    });

    expect(projection.receipt).toMatchObject({
      sourceImportRunId: legacy.importRunId,
      transmissionIntentKey: `rocket-final-order:${legacy.importRunId}:shipment`,
      exportId: legacy.exportId,
      duplicate: true,
    });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.sourceImportRun.count({
      where: { sourceType: 'coupang_rocket_final_order', status: 'completed' },
    })).toBe(1);
    expect(await prisma.rocketPurchaseConfirmationTransmission.count({
      where: { transport: 'SHIPMENT' },
    })).toBe(1);
  });

  it('reuses a prior COMPLETE owner receipt instead of deriving a new key from a fresh attempt id', async () => {
    const capture = collectionRequest('PO-OWNER', 'P-OWNER', '8801234567890', 2);
    const firstAttempt = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });
    await service.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: firstAttempt.attemptId,
      attemptToken: firstAttempt.attemptToken,
      capture: capture as never,
    });
    await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: firstAttempt.attemptId,
      attemptToken: firstAttempt.attemptToken,
      capture: capture as never,
      transport: 'SHIPMENT',
    });
    const firstProjection = await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: firstAttempt.attemptId,
      transport: 'SHIPMENT',
    });

    const secondAttempt = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });
    await service.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: secondAttempt.attemptId,
      attemptToken: secondAttempt.attemptToken,
      capture: capture as never,
    });
    await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: secondAttempt.attemptId,
      attemptToken: secondAttempt.attemptToken,
      capture: capture as never,
      transport: 'SHIPMENT',
    });
    const secondProjection = await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: secondAttempt.attemptId,
      transport: 'SHIPMENT',
    });

    expect(secondProjection.receipt).toMatchObject({
      sourceImportRunId: firstAttempt.attemptId,
      transmissionIntentKey: firstProjection.receipt.transmissionIntentKey,
      duplicate: true,
    });
    expect(secondProjection.receipt.transmissionIntentKey).not.toContain(secondAttempt.attemptId);
    expect(await prisma.order.count()).toBe(1);
  });

  it('commits the raw capture before a downstream conversion failure', async () => {
    await seedRequest('PO-1', 'P-1', '8801234567890', 4);
    const attempt = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });
    const badCapture = collectionRequest('PO-1', 'P-1', 'DIFFERENT', 3);

    await service.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: badCapture as never,
    });

    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderCollectionArtifact.count()).toBe(1);
    await expect(service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: badCapture as never,
      transport: 'SHIPMENT',
    })).rejects.toMatchObject({ code: 'ROCKET_FINAL_ORDER_BARCODE_MISMATCH' });

    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } })).toMatchObject({
      sourceType: 'coupang_direct_order_capture',
      status: 'completed',
      errorCode: null,
    });
    expect(await prisma.alert.findFirst({
      where: { sourceType: 'coupang_direct_order_capture', attemptId: attempt.attemptId },
    })).toBeNull();
  });

  it('fences an expired owner attempt and records the terminal Alert', async () => {
    const attempt = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId },
      data: { expiresAt: new Date(0) },
    });

    const read = await service.readAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    });
    const control = await service.readAttemptControl({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    });
    expect(read).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    expect(control).toMatchObject({
      state: 'FAILED',
      errorCode: 'ATTEMPT_EXPIRED',
      attemptToken: attempt.attemptToken,
    });
    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } })).toMatchObject({
      status: 'running',
    });
    await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });
    expect(await prisma.sourceImportRun.findUniqueOrThrow({ where: { id: attempt.attemptId } })).toMatchObject({
      status: 'failed',
      errorCode: 'ATTEMPT_EXPIRED',
    });
    expect(await prisma.alert.findFirstOrThrow({
      where: { sourceType: 'coupang_direct_order_capture', attemptId: attempt.attemptId },
    })).toMatchObject({ status: 'OPEN' });
  });

  async function seedLegacyReceipt(
    request: ReturnType<typeof collectionRequest>,
    exportId: string,
  ) {
    const fileHash = canonicalCoupangDirectOrderHash(request);
    const sourceRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceType: 'coupang_rocket_final_order',
        fileName: 'legacy-direct-order.json',
        fileHash,
        status: 'completed',
        rowCount: 1,
        createdBy: TEST_USER_ID,
      },
    });
    await prisma.rocketPurchaseConfirmationTransmission.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: exportId,
        sourceImportRunId: sourceRun.id,
        transport: 'SHIPMENT',
        intentKey: `rocket-final-order:${sourceRun.id}:shipment`,
        matchedLineCount: 1,
      },
    });
    return { importRunId: sourceRun.id, exportId };
  }

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
        unitsPerSale: 1,
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
