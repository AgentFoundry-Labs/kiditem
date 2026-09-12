import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';
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
import { backfillCoupangDirectTransportReceipts } from '../../../../../scripts/data-migrations/v0.1.31/006_backfill_coupang_direct_transport_receipts';

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
    const capture = mixedCollectionRequest();
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
      capture: capture as never,
    });
    const replay = await service.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: capture as never,
    });
    const captured = await service.readCaptured({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    });
    expect(await prisma.order.count()).toBe(0);
    const completedSource = await prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: attempt.attemptId },
      select: { qualityReport: true, updatedAt: true },
    });
    expect(completedSource.qualityReport).not.toHaveProperty('transportRefs');
    expect(completedSource.qualityReport).not.toHaveProperty('transportSelections');
    const receipt = await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: capture as never,
      transport: 'SHIPMENT',
    });
    const receiptReplay = await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: capture as never,
      transport: 'SHIPMENT',
    });
    const projection = await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      transport: 'SHIPMENT',
    });
    const milkrunReceipt = await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: capture as never,
      transport: 'MILKRUN',
    });
    const milkrunProjection = await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      transport: 'MILKRUN',
    });

    expect(first).toMatchObject({
      attemptId: attempt.attemptId,
      sourceImportRunId: attempt.attemptId,
      state: 'COMPLETE',
      artifactId: expect.any(String),
      contentChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(replay).toEqual(first);
    expect(captured.capture.pos).toHaveLength(2);
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
    expect(milkrunReceipt).toMatchObject({
      transport: 'MILKRUN',
      collectedLines: [{ poNumber: 'PO-MILKRUN', productNo: 'P-MILKRUN' }],
    });
    expect(milkrunProjection).toMatchObject({
      importRunId: attempt.attemptId,
      request: { transport: 'MILKRUN', pos: [{ seq: 'PO-MILKRUN' }] },
    });
    expect(await prisma.order.count()).toBe(2);
    expect(await prisma.orderCollectionArtifact.count()).toBe(1);
    expect(await prisma.sourceImportRun.count({
      where: { sourceType: 'coupang_direct_order_capture', status: 'completed' },
    })).toBe(1);
    expect(await prisma.sourceImportRun.findUniqueOrThrow({
      where: { id: attempt.attemptId },
      select: { qualityReport: true, updatedAt: true },
    })).toEqual(completedSource);
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(2);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(2);
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
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(1);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(1);
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
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(1);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(2);
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
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(0);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(0);
  });

  it('persists and replays an empty transport probe without creating orders', async () => {
    const capture = collectionRequest('PO-SHIPMENT-ONLY', 'P-SHIPMENT-ONLY', '8801234567890', 2);
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
      capture: capture as never,
    });

    const first = await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: capture as never,
      transport: 'MILKRUN',
    });
    const replay = await service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: capture as never,
      transport: 'MILKRUN',
    });

    expect(first).toMatchObject({
      transport: 'MILKRUN',
      collectedLines: [],
      transmissionIntentKey: null,
      duplicate: false,
    });
    expect(replay).toEqual({ ...first, duplicate: true });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(1);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(1);
  });

  it('keeps consume attempts organization-scoped', async () => {
    const capture = collectionRequest('PO-OWNER', 'P-OWNER', '8801234567890', 2);
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
      capture: capture as never,
    });

    await expect(service.consumeAttempt({
      organizationId: '52000000-0000-4000-8000-000000000001',
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: capture as never,
      transport: 'SHIPMENT',
    })).rejects.toMatchObject({ message: 'COUPANG_DIRECT_ATTEMPT_NOT_FOUND' });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(0);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(0);
  });

  it('backfills legacy JSON receipts with their original effect lineage and is idempotent', async () => {
    const capture = collectionRequest('PO-LEGACY-JSON', 'P-LEGACY-JSON', '8801234567890', 2);
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
      capture: capture as never,
    });
    const receipt = {
      transport: 'SHIPMENT' as const,
      payloadChecksum: canonicalCoupangDirectOrderHash(capture),
      sourceImportRunId: attempt.attemptId,
      exportId: null,
      transmissionIntentKey: `rocket-final-order:${attempt.attemptId}:shipment`,
      matchedLineCount: 0,
      reconciledRows: 0,
      collectedLines: [{ poNumber: 'PO-LEGACY-JSON', productNo: 'P-LEGACY-JSON' }],
      matchedLines: [],
      unmatchedLines: [{ poNumber: 'PO-LEGACY-JSON', productNo: 'P-LEGACY-JSON' }],
      duplicate: false,
    };
    const qualityReport = {
      source: 'coupang_direct_order_capture',
      transportRefs: { SHIPMENT: receipt },
      transportSelections: { SHIPMENT: [canonicalOwnerInputHash(capture.pos[0])] },
    };
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
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId },
      data: { qualityReport },
    });
    await prisma.sourceImportRun.update({
      where: { id: secondAttempt.attemptId },
      data: {
        qualityReport: {
          ...qualityReport,
          transportRefs: { SHIPMENT: { ...receipt, duplicate: true } },
        },
      },
    });

    await expect(prisma.$transaction((tx) =>
      backfillCoupangDirectTransportReceipts(tx))).resolves.toMatchObject({
      affectedRows: 3,
      details: {
        legacySourceRows: 2,
        legacyReceiptRows: 2,
        createdReceiptRows: 1,
        createdConsumptionRows: 2,
      },
    });
    await expect(prisma.$transaction((tx) =>
      backfillCoupangDirectTransportReceipts(tx))).resolves.toMatchObject({ affectedRows: 0 });

    expect(await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      transport: 'SHIPMENT',
    })).toMatchObject({
      request: { pos: [{ seq: 'PO-LEGACY-JSON' }] },
      receipt: {
        sourceImportRunId: attempt.attemptId,
        payloadChecksum: receipt.payloadChecksum,
        duplicate: false,
      },
    });
    expect(await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: secondAttempt.attemptId,
      transport: 'SHIPMENT',
    })).toMatchObject({
      receipt: {
        sourceImportRunId: attempt.attemptId,
        payloadChecksum: receipt.payloadChecksum,
        duplicate: true,
      },
    });
  });

  it('blocks the legacy receipt backfill when lineage cannot be verified', async () => {
    const capture = collectionRequest('PO-BROKEN-JSON', 'P-BROKEN-JSON', '8801234567890', 2);
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
      capture: capture as never,
    });
    await prisma.sourceImportRun.update({
      where: { id: attempt.attemptId },
      data: {
        qualityReport: {
          transportRefs: {
            SHIPMENT: {
              transport: 'SHIPMENT',
              payloadChecksum: canonicalCoupangDirectOrderHash(capture),
              sourceImportRunId: randomUUID(),
              exportId: null,
              transmissionIntentKey: null,
              matchedLineCount: 0,
              reconciledRows: 0,
              collectedLines: [],
              matchedLines: [],
              unmatchedLines: [],
              duplicate: false,
            },
          },
          transportSelections: { SHIPMENT: [] },
        },
      },
    });

    await expect(prisma.$transaction((tx) =>
      backfillCoupangDirectTransportReceipts(tx))).rejects.toThrow(
      `Coupang direct receipt backfill blocked for source run ${attempt.attemptId}: SHIPMENT effect source is missing, cross-organization, or incomplete.`,
    );
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(0);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(0);
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

function mixedCollectionRequest() {
  const shipment = collectionRequest('PO-OWNER', 'P-OWNER', '8801234567890', 2);
  return {
    ...shipment,
    pos: [
      ...shipment.pos,
      {
        ...shipment.pos[0],
        seq: 'PO-MILKRUN',
        transport: 'MILKRUN' as const,
        items: [{
          ...shipment.pos[0].items[0],
          skuId: 'P-MILKRUN',
          barcode: '8801234567891',
        }],
      },
    ],
  };
}
