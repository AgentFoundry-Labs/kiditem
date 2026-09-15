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
  OTHER_ORGANIZATION_ID,
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
const OTHER_CHANNEL_ACCOUNT_ID = '51000000-0000-4000-8000-000000000003';

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

  it('counts the matched lines of a legacy receipt from the workbook lines linked to the legacy run', async () => {
    const exportId = await seedRequest('PO-1', 'P-1', '8801234567890', 4);
    const input = collectionRequest('PO-1', 'P-1', '8801234567890', 3);
    const legacy = await seedLegacyReceipt(input, exportId);
    await linkLegacyOrderLine(legacy.importRunId, exportId, 'PO-1', 'P-1');
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

    const { receipt } = await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      transport: 'SHIPMENT',
    });

    expect(receipt).toMatchObject({
      sourceImportRunId: legacy.importRunId,
      exportId,
      matchedLineCount: 1,
      reconciledRows: 1,
      matchedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
      unmatchedLines: [],
      duplicate: true,
    });
  });

  it('deduplicates a transport receipt across unrelated centers while hashing its used center', async () => {
    const firstCapture = mixedCollectionRequest();
    const first = await consumeShipment(firstCapture);
    const changedMilkrunCenter = structuredClone(firstCapture);
    changedMilkrunCenter.centers['Busan FC']!.addr = 'Changed Busan address';
    const second = await consumeShipment(changedMilkrunCenter);
    const changedShipmentCenter = structuredClone(changedMilkrunCenter);
    changedShipmentCenter.centers['Seoul FC']!.addr = 'Changed Seoul address';
    const third = await consumeShipment(changedShipmentCenter);

    expect(second.receipt).toEqual({ ...first.receipt, duplicate: true });
    expect(second.receipt.transmissionIntentKey).not.toContain(second.attemptId);
    expect(third.receipt).toMatchObject({
      sourceImportRunId: third.attemptId,
      duplicate: false,
    });
    expect(third.receipt.payloadChecksum).not.toBe(first.receipt.payloadChecksum);
    expect(third.receipt.transmissionIntentKey).not.toBe(first.receipt.transmissionIntentKey);
    expect(await prisma.order.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'PO-OWNER' },
      select: { receiverAddr: true },
    })).toEqual({ receiverAddr: 'Changed Seoul address' });
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(2);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(3);

    async function consumeShipment(capture: ReturnType<typeof mixedCollectionRequest>) {
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
      const receipt = await service.consumeAttempt({
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        attemptId: attempt.attemptId,
        attemptToken: attempt.attemptToken,
        capture: capture as never,
        transport: 'SHIPMENT',
      });
      return { attemptId: attempt.attemptId, receipt };
    }
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
    const capture = migrationSubsetCollectionRequest();
    const selectedCapture = {
      ...capture,
      pos: capture.pos.filter(({ seq }) =>
        ['PO-OWNER', 'PO-MILKRUN', 'PO-ITEMLESS'].includes(seq)),
    };
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
    const exportId = await seedRequest(
      'PO-OWNER',
      'P-OWNER',
      '8801234567890',
      2,
    );
    const legacyPayloadChecksum = 'f'.repeat(64);
    const effectSource = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceType: 'coupang_rocket_final_order',
        fileName: 'legacy-direct-order.json',
        fileHash: legacyPayloadChecksum,
        status: 'completed',
        rowCount: 1,
        createdBy: TEST_USER_ID,
      },
    });
    const transmissionIntentKey = `rocket-final-order:${effectSource.id}:shipment`;
    await prisma.rocketPurchaseConfirmationTransmission.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: exportId,
        sourceImportRunId: effectSource.id,
        transport: 'SHIPMENT',
        intentKey: transmissionIntentKey,
      },
    });
    const receipt = {
      transport: 'SHIPMENT' as const,
      payloadChecksum: legacyPayloadChecksum,
      sourceImportRunId: effectSource.id,
      exportId,
      transmissionIntentKey,
      matchedLineCount: 0,
      reconciledRows: 0,
      collectedLines: [{ poNumber: 'PO-OWNER', productNo: 'P-OWNER' }],
      matchedLines: [],
      unmatchedLines: [{ poNumber: 'PO-OWNER', productNo: 'P-OWNER' }],
      duplicate: false,
    };
    const qualityReport = {
      source: 'coupang_direct_order_capture',
      transportRefs: { SHIPMENT: receipt },
      transportSelections: {
        SHIPMENT: selectedCapture.pos.map((purchaseOrder) =>
          canonicalOwnerInputHash(purchaseOrder)),
      },
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
    const completedSources = await prisma.sourceImportRun.findMany({
      where: { id: { in: [attempt.attemptId, secondAttempt.attemptId] } },
      select: { id: true, qualityReport: true, updatedAt: true },
      orderBy: { id: 'asc' },
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

    const canonical = await prisma.coupangDirectTransportReceipt.findFirstOrThrow({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: {
        payloadChecksum: true,
        effectSourceImportRunId: true,
        rocketPurchaseConfirmationId: true,
        transmissionIntentKey: true,
      },
    });
    expect(canonical).toMatchObject({
      effectSourceImportRunId: effectSource.id,
      rocketPurchaseConfirmationId: exportId,
      transmissionIntentKey,
    });
    expect(canonical.payloadChecksum).not.toBe(legacyPayloadChecksum);

    await expect(service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: attempt.attemptId,
      attemptToken: attempt.attemptToken,
      capture: selectedCapture as never,
      transport: 'SHIPMENT',
    })).resolves.toMatchObject({
      payloadChecksum: canonical.payloadChecksum,
      sourceImportRunId: effectSource.id,
      transmissionIntentKey,
      duplicate: true,
    });

    expect(await prisma.sourceImportRun.findMany({
      where: { id: { in: [attempt.attemptId, secondAttempt.attemptId] } },
      select: { id: true, qualityReport: true, updatedAt: true },
      orderBy: { id: 'asc' },
    })).toEqual(completedSources);
    expect(completedSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        qualityReport: expect.objectContaining({
          transportRefs: expect.objectContaining({
            SHIPMENT: expect.objectContaining({
              payloadChecksum: legacyPayloadChecksum,
            }),
          }),
        }),
      }),
    ]));
    expect(await prisma.coupangDirectTransportConsumption.findMany({
      select: { selectedPurchaseOrderKeys: true },
      orderBy: { createdAt: 'asc' },
    })).toEqual([
      { selectedPurchaseOrderKeys: [canonicalOwnerInputHash(capture.pos[0])] },
      { selectedPurchaseOrderKeys: [canonicalOwnerInputHash(capture.pos[0])] },
    ]);

    expect(await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
      transport: 'SHIPMENT',
    })).toMatchObject({
      request: { pos: [{ seq: 'PO-OWNER' }] },
      receipt: {
        sourceImportRunId: effectSource.id,
        payloadChecksum: canonical.payloadChecksum,
        duplicate: true,
      },
    });
    expect(await service.readProjection({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: secondAttempt.attemptId,
      transport: 'SHIPMENT',
    })).toMatchObject({
      receipt: {
        sourceImportRunId: effectSource.id,
        payloadChecksum: canonical.payloadChecksum,
        duplicate: true,
      },
    });

    const laterCapture = structuredClone(capture);
    laterCapture.centers['Busan FC']!.addr = 'Later Busan address';
    const laterSelectedCapture = {
      ...laterCapture,
      pos: laterCapture.pos.filter(({ seq }) =>
        ['PO-OWNER', 'PO-MILKRUN', 'PO-ITEMLESS'].includes(seq)),
    };
    const laterAttempt = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });
    await service.completeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: laterAttempt.attemptId,
      attemptToken: laterAttempt.attemptToken,
      capture: laterCapture as never,
    });
    await expect(service.consumeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      attemptId: laterAttempt.attemptId,
      attemptToken: laterAttempt.attemptToken,
      capture: laterSelectedCapture as never,
      transport: 'SHIPMENT',
    })).resolves.toMatchObject({
      payloadChecksum: canonical.payloadChecksum,
      sourceImportRunId: effectSource.id,
      transmissionIntentKey,
      duplicate: true,
    });
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(1);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(3);
    expect(await prisma.order.count()).toBe(0);
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
          transportSelections: {
            SHIPMENT: [canonicalOwnerInputHash(capture.pos[0])],
          },
        },
      },
    });

    await expect(prisma.$transaction((tx) =>
      backfillCoupangDirectTransportReceipts(tx))).rejects.toThrow(
      `Coupang direct receipt backfill blocked for source run ${attempt.attemptId}: SHIPMENT effect source is not a completed direct source for the same organization and channel account.`,
    );
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(0);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(0);
  });

  it.each([
    {
      name: 'same-organization effect source has an unrelated source type',
      options: { effectSourceType: 'sellpia_sales_daily' },
      message: 'SHIPMENT effect source is not a completed direct source for the same organization and channel account',
    },
    {
      name: 'same-organization effect source belongs to another channel account',
      options: { effectChannelAccountId: OTHER_CHANNEL_ACCOUNT_ID },
      message: 'SHIPMENT effect source is not a completed direct source for the same organization and channel account',
    },
    {
      name: 'same-organization confirmation belongs to another channel account',
      options: { confirmationChannelAccountId: OTHER_CHANNEL_ACCOUNT_ID },
      message: 'SHIPMENT Rocket confirmation is missing, cross-organization, or belongs to a different channel account',
    },
    {
      name: 'confirmation transmission is missing',
      options: { transmission: 'missing' as const },
      message: 'SHIPMENT Rocket confirmation transmission does not match receipt lineage',
    },
    {
      name: 'confirmation transmission has a different intent',
      options: { transmission: 'wrong_intent' as const },
      message: 'SHIPMENT Rocket confirmation transmission does not match receipt lineage',
    },
    {
      name: 'capture artifact is missing',
      options: { artifact: 'missing' as const },
      message: 'capture artifact is missing',
    },
    {
      name: 'capture artifact is malformed',
      options: { artifact: 'malformed' as const },
      message: 'capture artifact is invalid',
    },
  ])('blocks legacy canonicalization when $name', async ({ options, message }) => {
    const candidate = await seedBackfillCandidate(options);

    await expect(prisma.$transaction((tx) =>
      backfillCoupangDirectTransportReceipts(tx))).rejects.toThrow(
      `Coupang direct receipt backfill blocked for source run ${candidate.sourceRunId}: ${message}.`,
    );
    expect(await prisma.coupangDirectTransportReceipt.count()).toBe(0);
    expect(await prisma.coupangDirectTransportConsumption.count()).toBe(0);
  });

  it('stops a running attempt for an operator without its token or an Alert, and admits the next begin at once', async () => {
    const attempt = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });

    await expect(service.cancelAttempt({
      organizationId: OTHER_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    })).rejects.toMatchObject({ status: 404 });

    const stopped = await service.cancelAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    });
    expect(stopped).toMatchObject({
      attemptId: attempt.attemptId,
      state: 'FAILED',
      errorCode: 'USER_CANCELLED',
      errorMessage: '운영자가 수집을 중단했습니다.',
    });
    expect(await prisma.alert.findFirst({
      where: { sourceType: 'coupang_direct_order_capture', attemptId: attempt.attemptId },
    })).toBeNull();
    // 같은 중단을 다시 눌러도 끝난 시도를 그대로 돌려준다.
    expect(await service.cancelAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    })).toMatchObject({ state: 'FAILED', errorCode: 'USER_CANCELLED' });

    const next = await service.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
      idempotencyKey: randomUUID(),
    });
    expect(next.attemptId).not.toBe(attempt.attemptId);
    expect(next.state).toBe('RUNNING');
  });

  it('settles an operator stop after the lease passed as expiry with its Alert', async () => {
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

    expect(await service.cancelAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: attempt.attemptId,
    })).toMatchObject({ state: 'FAILED', errorCode: 'ATTEMPT_EXPIRED' });
    expect(await prisma.alert.findFirstOrThrow({
      where: { sourceType: 'coupang_direct_order_capture', attemptId: attempt.attemptId },
    })).toMatchObject({ status: 'OPEN' });
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
      },
    });
    return { importRunId: sourceRun.id, exportId };
  }

  async function linkLegacyOrderLine(
    importRunId: string,
    exportId: string,
    poNumber: string,
    productNo: string,
  ) {
    const order = await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceImportRunId: importRunId,
        externalOrderId: poNumber,
      },
    });
    const line = await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        sku: productNo,
        externalLineId: `${poNumber}-1`,
      },
    });
    await prisma.rocketPurchaseConfirmationLine.updateMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: exportId,
        poNumber,
        productNo,
      },
      data: { collectedOrderLineItemId: line.id, collectedAt: new Date() },
    });
  }

  async function seedBackfillCandidate(options: {
    effectSourceType?: string;
    effectChannelAccountId?: string;
    confirmationChannelAccountId?: string;
    transmission?: 'matching' | 'missing' | 'wrong_intent';
    artifact?: 'valid' | 'missing' | 'malformed';
  }) {
    const effectChannelAccountId = options.effectChannelAccountId ?? CHANNEL_ACCOUNT_ID;
    const confirmationChannelAccountId = options.confirmationChannelAccountId ?? CHANNEL_ACCOUNT_ID;
    for (const channelAccountId of new Set([
      effectChannelAccountId,
      confirmationChannelAccountId,
    ])) {
      if (channelAccountId === CHANNEL_ACCOUNT_ID) continue;
      await prisma.channelAccount.create({
        data: {
          id: channelAccountId,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'rocket',
          name: 'Other Rocket',
        },
      });
    }
    const effectSource = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: effectChannelAccountId,
        sourceType: options.effectSourceType ?? 'coupang_direct_order_capture',
        fileHash: randomUUID(),
        status: 'completed',
      },
    });
    const confirmationSource = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: confirmationChannelAccountId,
        sourceType: 'coupang_rocket_po_catalog',
        fileHash: randomUUID(),
        status: 'completed',
      },
    });
    const confirmation = await prisma.rocketPurchaseConfirmation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: confirmationChannelAccountId,
        sourceImportRunId: confirmationSource.id,
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        confirmedBy: TEST_USER_ID,
      },
    });
    const intentKey = `rocket-final-order:${effectSource.id}:shipment`;
    if (options.transmission !== 'missing') {
      await prisma.rocketPurchaseConfirmationTransmission.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          confirmationId: confirmation.id,
          sourceImportRunId: effectSource.id,
          transport: 'SHIPMENT',
          intentKey: options.transmission === 'wrong_intent'
            ? `${intentKey}:wrong`
            : intentKey,
        },
      });
    }
    const capture = collectionRequest(
      'PO-BACKFILL',
      'P-BACKFILL',
      '8801234567890',
      1,
    );
    const sourceRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceType: 'coupang_direct_order_capture',
        fileHash: randomUUID(),
        status: 'completed',
        qualityReport: {
          transportRefs: {
            SHIPMENT: {
              transport: 'SHIPMENT',
              payloadChecksum: 'e'.repeat(64),
              sourceImportRunId: effectSource.id,
              exportId: confirmation.id,
              transmissionIntentKey: intentKey,
              matchedLineCount: 0,
              reconciledRows: 0,
              collectedLines: [{
                poNumber: 'PO-BACKFILL',
                productNo: 'P-BACKFILL',
              }],
              matchedLines: [],
              unmatchedLines: [{
                poNumber: 'PO-BACKFILL',
                productNo: 'P-BACKFILL',
              }],
              duplicate: false,
            },
          },
          transportSelections: {
            SHIPMENT: [canonicalOwnerInputHash(capture.pos[0])],
          },
        },
      },
    });
    if (options.artifact !== 'missing') {
      await prisma.orderCollectionArtifact.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceImportRunId: sourceRun.id,
          sourceContentType: 'application/json',
          sourceBytes: options.artifact === 'malformed'
            ? Buffer.from('{"pos":')
            : Buffer.from(JSON.stringify(capture)),
        },
      });
    }
    return { sourceRunId: sourceRun.id };
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
    centers: {
      ...shipment.centers,
      'Busan FC': { addr: 'Busan', zip: '48900', contact: '051-1234' },
    },
    pos: [
      ...shipment.pos,
      {
        ...shipment.pos[0],
        seq: 'PO-MILKRUN',
        center: 'Busan FC',
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

function migrationSubsetCollectionRequest() {
  const capture = mixedCollectionRequest();
  return {
    ...capture,
    pos: [
      ...capture.pos,
      {
        ...capture.pos[0],
        seq: 'PO-OUTSIDE-EDD',
        edd: '2026-08-20',
        items: [{
          ...capture.pos[0].items[0],
          skuId: 'P-OUTSIDE-EDD',
          barcode: '8801234567892',
        }],
      },
      {
        ...capture.pos[0],
        seq: 'PO-ITEMLESS',
        items: [],
      },
    ],
  };
}
