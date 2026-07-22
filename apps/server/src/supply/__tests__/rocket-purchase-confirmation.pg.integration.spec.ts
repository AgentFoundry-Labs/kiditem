import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { RocketPurchaseConfirmationTransactionAdapter } from '../adapter/out/transaction/rocket-purchase-confirmation.transaction.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';
import { RocketWorkbookProgressService } from '../../inventory/application/service/rocket-workbook-progress.service';
import { RocketWorkbookProgressRepositoryAdapter } from '../../inventory/adapter/out/repository/rocket-workbook-progress.repository.adapter';

const CHANNEL_ACCOUNT_ID = '21000000-0000-4000-8000-000000000001';
const SOURCE_IMPORT_RUN_ID = '21000000-0000-4000-8000-000000000002';
const MASTER_PRODUCT_ID = '21000000-0000-4000-8000-000000000003';
const PRODUCT_VARIANT_ID = '21000000-0000-4000-8000-000000000004';
const LISTING_ID = '21000000-0000-4000-8000-000000000005';
const OPTION_ID = '21000000-0000-4000-8000-000000000006';
const SELLPIA_SKU_ID = '21000000-0000-4000-8000-000000000007';
const COLLECTION_RUN_ID = '21000000-0000-4000-8000-000000000008';
const PO_LINE_ID = '1001:P-1:8801234567890:1';

describe('Rocket workbook export transaction (PG integration)', () => {
  let prisma: PrismaClient;
  let adapter: RocketPurchaseConfirmationTransactionAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new RocketPurchaseConfirmationTransactionAdapter(
      prisma as unknown as PrismaService,
      new RocketWorkbookProgressService(
        new RocketWorkbookProgressRepositoryAdapter(),
      ),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: CHANNEL_ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'rocket',
        name: 'Rocket',
        vendorId: 'VENDOR-1',
      },
    });
    await prisma.sourceImportRun.create({
      data: {
        id: SOURCE_IMPORT_RUN_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        sourceType: 'coupang_rocket_po_catalog',
        fileName: 'rocket-po-catalog.json',
        fileHash: 'a'.repeat(64),
        status: 'completed',
        rowCount: 1,
        importedAt: new Date(),
      },
    });
    await prisma.masterProduct.create({
      data: {
        id: MASTER_PRODUCT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'MP-ROCKET-1',
        name: 'Rocket item',
      },
    });
    await prisma.productVariant.create({
      data: {
        id: PRODUCT_VARIANT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: MASTER_PRODUCT_ID,
        code: 'PV-ROCKET-1',
        name: 'Default',
        isDefault: true,
      },
    });
    await prisma.sellpiaInventorySku.create({
      data: {
        id: SELLPIA_SKU_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-ROCKET-1',
        name: 'Rocket component',
        currentStock: 5,
      },
    });
    await prisma.productVariantComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productVariantId: PRODUCT_VARIANT_ID,
        sellpiaInventorySkuId: SELLPIA_SKU_ID,
        quantity: 1,
        source: 'manual',
      },
    });
    await prisma.channelListing.create({
      data: {
        id: LISTING_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        masterProductId: MASTER_PRODUCT_ID,
        externalId: 'P-1',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        id: OPTION_ID,
        organizationId: TEST_ORGANIZATION_ID,
        listingId: LISTING_ID,
        productVariantId: PRODUCT_VARIANT_ID,
        externalOptionId: 'SKU-1',
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        lastVerifiedAt: new Date(),
        requestedGeneration: 12n,
        verifiedGeneration: 12n,
      },
    });
  });

  it('replays the same request as one durable export with exact artifact bytes', async () => {
    const input = confirmationInput('21000000-0000-4000-8000-000000000009', 2);

    const first = await adapter.exportWorkbook(input);
    const replay = await adapter.exportWorkbook(input);

    expect(first).toMatchObject({
      duplicate: false,
      status: 'awaiting_coupang_confirmation',
      artifact: {
        fileName: 'coupang-rocket.xlsx',
        byteLength: input.artifactBytes.byteLength,
      },
    });
    expect(replay).toMatchObject({
      exportId: first.exportId,
      duplicate: true,
      status: 'awaiting_coupang_confirmation',
    });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(1);
    expect(await prisma.rocketPurchaseConfirmationAllocation.aggregate({
      _sum: { quantity: true },
    })).toEqual({ _sum: { quantity: 2 } });
    expect(await prisma.inventoryCommitment.count()).toBe(0);
    expect(await adapter.downloadWorkbook({
      organizationId: TEST_ORGANIZATION_ID,
      exportId: first.exportId,
    })).toEqual({
      fileName: 'coupang-rocket.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: input.artifactBytes,
    });
  });

  it('rejects reusing an idempotency key for a different decision', async () => {
    const key = '21000000-0000-4000-8000-000000000010';
    await adapter.exportWorkbook(confirmationInput(key, 2));

    await expect(adapter.exportWorkbook(confirmationInput(key, 3)))
      .rejects.toThrow(/idempotency/i);
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(1);
  });

  it('rejects reusing an idempotency key after workbook evidence changes', async () => {
    const key = '21000000-0000-4000-8000-000000000016';
    await adapter.exportWorkbook(confirmationInput(key, 2));

    await expect(adapter.exportWorkbook(confirmationInput(key, 2, '고양1센터')))
      .rejects.toThrow(/idempotency/i);
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(1);
  });

  it('serializes competing workbook workflows across the organization', async () => {
    const results = await Promise.allSettled([
      adapter.exportWorkbook(confirmationInput('21000000-0000-4000-8000-000000000011', 4)),
      adapter.exportWorkbook(confirmationInput('21000000-0000-4000-8000-000000000012', 4)),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(await prisma.rocketPurchaseConfirmationAllocation.aggregate({
      _sum: { quantity: true },
    })).toEqual({ _sum: { quantity: 4 } });
    expect(await prisma.inventoryCommitment.count()).toBe(0);
  });

  it('rejects a stale inventory generation without creating a confirmation', async () => {
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { verifiedGeneration: 13n },
    });

    await expect(adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000013', 2),
    )).rejects.toThrow(/generation/i);
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(0);
  });

  it('rejects when the confirmed ProductVariant recipe changed after preview', async () => {
    await prisma.productVariantComponent.updateMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        productVariantId: PRODUCT_VARIANT_ID,
      },
      data: { quantity: 2 },
    });

    await expect(adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000014', 2),
    )).rejects.toThrow(/recipe/i);
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(0);
  });

  it('rejects zero quantity when the confirmed recipe changed after preview', async () => {
    const input = confirmationInput(
      '21000000-0000-4000-8000-000000000017',
      0,
    );
    await prisma.productVariantComponent.deleteMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        productVariantId: PRODUCT_VARIANT_ID,
      },
    });

    await expect(adapter.exportWorkbook(input)).rejects.toThrow(/recipe/i);
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(0);
    expect(await prisma.inventoryCommitment.count()).toBe(0);
  });

  it('allows a new export after the previous workflow completed', async () => {
    const created = await adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000015', 2),
    );
    await prisma.rocketPurchaseConfirmation.update({
      where: { id: created.exportId },
      data: { status: 'completed', completedAt: new Date() },
    });

    await expect(adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000018', 2),
    )).resolves.toMatchObject({ status: 'awaiting_coupang_confirmation' });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(2);
  });

  it('completes only after finalized transmission and a newer verified generation', async () => {
    const created = await adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000019', 2),
    );
    await prisma.rocketPurchaseConfirmationLine.updateMany({
      where: { confirmationId: created.exportId },
      data: {
        collectedAt: new Date(),
        collectedOrderLineItemId: '21000000-0000-4000-8000-000000000020',
      },
    });
    const intentKey = `rocket-workbook:${created.exportId}:shipment`;
    await prisma.rocketPurchaseConfirmationTransmission.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: created.exportId,
        sourceImportRunId: SOURCE_IMPORT_RUN_ID,
        transport: 'SHIPMENT',
        intentKey,
        matchedLineCount: 1,
      },
    });
    await prisma.sellpiaOrderTransmissionIntent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        intentKey,
        status: 'finalized',
        createdBy: TEST_USER_ID,
        finalizedAt: new Date(),
        finalizedGeneration: 13n,
      },
    });

    await expect(adapter.getActiveWorkflow({
      organizationId: TEST_ORGANIZATION_ID,
    })).resolves.toMatchObject({ status: 'awaiting_inventory_sync' });

    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { verifiedGeneration: 13n },
    });
    await expect(adapter.getActiveWorkflow({
      organizationId: TEST_ORGANIZATION_ID,
    })).resolves.toBeNull();
    expect(await prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
      where: { id: created.exportId },
    })).toMatchObject({ status: 'completed', completedAt: expect.any(Date) });
  });
});

function confirmationInput(
  idempotencyKey: string,
  quantity: number,
  center = '덕평1센터',
) {
  const request = {
    idempotencyKey,
    channelAccountId: CHANNEL_ACCOUNT_ID,
    collection: {
      collectionRunId: COLLECTION_RUN_ID,
      vendorId: 'VENDOR-1',
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: 1,
      failedPoNumbers: [],
    },
    rows: [{
      poLineId: PO_LINE_ID,
      poNumber: '1001',
      vendorId: 'VENDOR-1',
      productNo: 'P-1',
      barcode: '8801234567890',
      productName: 'Rocket item',
      orderQty: 4,
      plannedDeliveryDate: '2026-07-20',
      confirmation: {
        center,
        inboundType: '택배',
        poStatus: '거래처확인요청',
        returnManager: '',
        returnContact: '',
        returnAddress: '',
        purchasePrice: 1_000,
        supplyPrice: 900,
        vat: 90,
        totalPurchase: 3_960,
        poRegisteredAt: '2026-07-17 09:00:00',
        xdock: 'N',
      },
    }],
    editedQuantities: { [PO_LINE_ID]: quantity },
    shortageReasons: quantity < 4
      ? { [PO_LINE_ID]: '협력사 재고부족 - 수요예측 오류' as const }
      : {},
    artifactFileName: 'coupang-rocket.xlsx',
    artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
  };
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    sourceImportRunId: SOURCE_IMPORT_RUN_ID,
    request,
    preview: {
      collectionRunId: COLLECTION_RUN_ID,
      catalog: {
        run: { id: SOURCE_IMPORT_RUN_ID },
        duplicate: false,
        changes: {},
      },
      inventoryGeneration: '12',
      rows: [{
        poLineId: PO_LINE_ID,
        poNumber: '1001',
        productNo: 'P-1',
        productName: 'Rocket item',
        plannedDeliveryDate: '2026-07-20',
        orderQuantity: 4,
        recommendedQuantity: quantity,
        maxQuantity: 4,
        editedQuantity: quantity,
        reason: null,
        channelSkuId: OPTION_ID,
        masterProductId: MASTER_PRODUCT_ID,
        productVariantId: PRODUCT_VARIANT_ID,
        components: [{
          sellpiaInventorySkuId: SELLPIA_SKU_ID,
          quantity: 1,
          currentStock: 5,
          isActive: true,
        }],
      }],
    },
    artifactBytes: Buffer.from('exact-coupang-workbook'),
  } as const;
}
