import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelOptionRecipeService } from '../../channels/application/service/listing/channel-option-recipe.service';
import { ChannelOptionRecipeRepositoryAdapter } from '../../channels/adapter/out/persistence/channel-option-recipe.repository.adapter';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { RocketPurchaseConfirmationTransactionAdapter } from '../adapter/out/transaction/rocket-purchase-confirmation.transaction.adapter';
import { RocketWorkbookProgressService } from '../../inventory/application/usecase/rocket-workbook-progress.service';
import { RocketWorkbookProgressRepositoryAdapter } from '../../inventory/adapter/out/persistence/rocket-workbook-progress.repository.adapter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaClient } from '@prisma/client';
import type { RocketWorkbookDecisionRequest } from '@kiditem/shared/rocket-purchase-preview';
import type { RocketWorkbookExportTransactionPort } from '../application/port/out/transaction/rocket-purchase-confirmation.transaction.port';
import { ChannelsProductMappingGenerationAdapter } from "../../channels/adapter/out/products/product-mapping-generation.adapter";
import { ProductMappingGenerationRepositoryAdapter } from "../../products/adapter/out/persistence/product-mapping-generation.repository.adapter";

const CHANNEL_ACCOUNT_ID = '21000000-0000-4000-8000-000000000001';
const SOURCE_IMPORT_RUN_ID = '21000000-0000-4000-8000-000000000002';
const MASTER_PRODUCT_ID = '21000000-0000-4000-8000-000000000003';
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
    const products = new ProductTransactionalReadRepositoryAdapter();
    adapter = new RocketPurchaseConfirmationTransactionAdapter(
      prisma as unknown as PrismaService,
      new RocketWorkbookProgressService(
        new RocketWorkbookProgressRepositoryAdapter(),
      ),
      products,
      new ChannelOptionRecipeService(
        new ChannelOptionRecipeRepositoryAdapter(prisma as never, products, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
      ),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const inventoryVerifiedAt = new Date();
    const inventoryRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_inventory',
        channelAccountId: null,
        fileName: 'rocket-confirmation-inventory.json',
        fileHash: 'b'.repeat(64),
        status: 'completed',
        rowCount: 1,
        importedAt: inventoryVerifiedAt,
        lastVerifiedAt: inventoryVerifiedAt,
        verificationCount: 1,
        freshnessGeneration: 12n,
      },
    });
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
        parserVersion: 'rocket-po-v1',
        rowCount: 1,
        importedAt: new Date(),
      },
    });
    await seedSourceProduct(prisma, {
      id: MASTER_PRODUCT_ID,
      organizationId: TEST_ORGANIZATION_ID,
      code: 'MP-ROCKET-1',
      name: 'Rocket item',
    });
    await seedSourceProduct(prisma, {
      id: SELLPIA_SKU_ID,
      organizationId: TEST_ORGANIZATION_ID,
      code: 'SP-ROCKET-1',
      name: 'Rocket component',
      currentStock: 5,
    });
    await prisma.channelListing.create({
      data: {
        id: LISTING_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalId: 'P-1',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        id: OPTION_ID,
        organizationId: TEST_ORGANIZATION_ID,
        listingId: LISTING_ID,
        externalOptionId: 'SKU-1',
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: OPTION_ID,
        masterProductId: SELLPIA_SKU_ID,
        quantity: 1,
      },
    });
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        lastVerifiedAt: inventoryVerifiedAt,
        requestedGeneration: 12n,
        verifiedGeneration: 12n,
        lastCompletedImportRunId: inventoryRun.id,
      },
    });
  });

  it('replays the same request as one durable export with exact artifact bytes', async () => {
    const input = confirmationInput('21000000-0000-4000-8000-000000000009', 2);

    const first = await adapter.exportWorkbook(input);
    const replay = await adapter.exportWorkbook(input);

    expect(first).toMatchObject({
      duplicate: false,
      artifact: {
        fileName: 'coupang-rocket.xlsx',
        byteLength: input.artifactBytes.byteLength,
      },
    });
    expect(replay).toMatchObject({
      exportId: first.exportId,
      duplicate: true,
    });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(1);
    // A positive workbook leaves its workflow open until Coupang confirms it.
    await expect(prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
      where: { id: first.exportId },
      select: { completedAt: true },
    })).resolves.toEqual({ completedAt: null });
    expect(
      await prisma.rocketPurchaseConfirmationAllocation.aggregate({
        _sum: { quantity: true },
      }),
    ).toEqual({ _sum: { quantity: 2 } });
    expect(
      await adapter.downloadWorkbook({
        organizationId: TEST_ORGANIZATION_ID,
        exportId: first.exportId,
      }),
    ).toEqual({
      fileName: 'coupang-rocket.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: input.artifactBytes,
    });
  });

  it('rejects reusing an idempotency key for a different decision', async () => {
    const key = '21000000-0000-4000-8000-000000000010';
    await adapter.exportWorkbook(confirmationInput(key, 2));

    await expect(
      adapter.exportWorkbook(confirmationInput(key, 3)),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(1);
  });

  it('rejects reusing an idempotency key after workbook evidence changes', async () => {
    const key = '21000000-0000-4000-8000-000000000016';
    await adapter.exportWorkbook(confirmationInput(key, 2));

    await expect(
      adapter.exportWorkbook(confirmationInput(key, 2, '고양1센터')),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { reason: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(1);
  });

  it('serializes competing workbook workflows across the organization', async () => {
    const results = await Promise.allSettled([
      adapter.exportWorkbook(
        confirmationInput('21000000-0000-4000-8000-000000000011', 4),
      ),
      adapter.exportWorkbook(
        confirmationInput('21000000-0000-4000-8000-000000000012', 4),
      ),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(
      await prisma.rocketPurchaseConfirmationAllocation.aggregate({
        _sum: { quantity: true },
      }),
    ).toEqual({ _sum: { quantity: 4 } });
  });

  it('rejects a stale inventory generation without creating a confirmation', async () => {
    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { verifiedGeneration: 13n },
    });

    await expect(
      adapter.exportWorkbook(
        confirmationInput('21000000-0000-4000-8000-000000000013', 2),
      ),
    ).rejects.toMatchObject({ code: 'SELLPIA_SYNC_REQUIRED', details: { reason: 'INVENTORY_GENERATION_CHANGED' } });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(0);
  });

  it('uses retained current MasterProduct stock from the completed collection fence', async () => {
    await expect(adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000021', 2),
    )).resolves.toMatchObject({ inventoryGeneration: '12' });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(1);
  });

  it('rejects when the confirmed channel-option recipe changed after preview', async () => {
    await prisma.channelListingOptionInventoryComponent.updateMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: OPTION_ID,
      },
      data: { quantity: 2 },
    });

    await expect(
      adapter.exportWorkbook(
        confirmationInput('21000000-0000-4000-8000-000000000014', 2),
      ),
    ).rejects.toMatchObject({ code: 'SUPPLY_ROCKET_PREVIEW_CHANGED', details: { reason: 'RECIPE_CHANGED' } });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(0);
  });

  it('rejects zero quantity when the confirmed recipe changed after preview', async () => {
    const input = confirmationInput('21000000-0000-4000-8000-000000000017', 0);
    await prisma.channelListingOptionInventoryComponent.deleteMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: OPTION_ID,
      },
    });

    await expect(adapter.exportWorkbook(input)).rejects.toMatchObject({ code: 'SUPPLY_ROCKET_PREVIEW_CHANGED', details: { reason: 'RECIPE_CHANGED' } });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(0);
  });

  it('allows a new export after the previous workflow completed', async () => {
    const created = await adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000015', 2),
    );
    await prisma.rocketPurchaseConfirmation.update({
      where: { id: created.exportId },
      data: { completedAt: new Date() },
    });

    const next = await adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000018', 2),
    );
    expect(next).toMatchObject({ duplicate: false });
    expect(await prisma.rocketPurchaseConfirmation.count()).toBe(2);
    await expect(prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
      where: { id: next.exportId },
      select: { completedAt: true },
    })).resolves.toEqual({ completedAt: null });
  });

  // 수집은 매번 전량 스냅샷이라 제출한 라인이 이후 수집본에도 계속 나온다.
  // "이번에 새로 들어온 것만" 을 가려내는 유일한 서버 근거다.
  it('reports which PO lines this account already sent in a workbook', async () => {
    expect(
      await adapter.listExportedPoLineIds({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        poLineIds: [PO_LINE_ID, 'never-exported'],
      }),
    ).toEqual([]);

    const created = await adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000031', 2),
    );

    expect(
      await adapter.listExportedPoLineIds({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        poLineIds: [PO_LINE_ID, 'never-exported'],
      }),
    ).toEqual([PO_LINE_ID]);
    // 조직·계정 경계를 넘어 새지 않는다.
    expect(
      await adapter.listExportedPoLineIds({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: '20000000-0000-4000-8000-0000000000ff',
        poLineIds: [PO_LINE_ID],
      }),
    ).toEqual([]);
    expect(
      await adapter.listExportedPoLineIds({
        organizationId: OTHER_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        poLineIds: [PO_LINE_ID],
      }),
    ).toEqual([]);

    // 실제 사용 안 함 전이는 releasedAt 근거를 기록한다. 그 워크북은
    // 제출로 보지 않으므로 같은 라인을 다시 내보낼 수 있어야 한다.
    const confirmation =
      await prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
        where: { id: created.exportId },
        select: { confirmedAt: true },
      });
    await prisma.rocketPurchaseConfirmationTransmission.createMany({
      data: ['SHIPMENT', 'MILKRUN'].map((transport) => ({
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: created.exportId,
        sourceImportRunId: SOURCE_IMPORT_RUN_ID,
        transport,
        observedAt: confirmation.confirmedAt,
      })),
    });
    await adapter.abandonWorkbook({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      exportId: created.exportId,
    });
    expect(
      await adapter.listExportedPoLineIds({
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        poLineIds: [PO_LINE_ID],
      }),
    ).toEqual([]);
  });

  it('completes only after every positive line is collected and its transmission is finalized', async () => {
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
    const intentKey = `rocket-final-order:${SOURCE_IMPORT_RUN_ID}:shipment`;
    await prisma.rocketPurchaseConfirmationTransmission.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: created.exportId,
        sourceImportRunId: SOURCE_IMPORT_RUN_ID,
        transport: 'SHIPMENT',
        intentKey,
      },
    });
    await prisma.sellpiaOrderTransmissionIntent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        intentKey,
        status: 'finalized',
        createdBy: TEST_USER_ID,
        finalizedAt: new Date(),
      },
    });

    await expect(
      adapter.getActiveWorkflow({
        organizationId: TEST_ORGANIZATION_ID,
      }),
    ).resolves.toBeNull();
    expect(
      await prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
        where: { id: created.exportId },
      }),
    ).toMatchObject({ completedAt: expect.any(Date) });
  });

  it('derives a failed Sellpia transmission on every read, keeps the workflow open, and completes after reconciliation', async () => {
    const created = await adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000051', 2),
    );
    await prisma.rocketPurchaseConfirmationLine.updateMany({
      where: { confirmationId: created.exportId },
      data: {
        collectedAt: new Date(),
        collectedOrderLineItemId: '21000000-0000-4000-8000-000000000052',
      },
    });
    const intentKey = `rocket-final-order:${SOURCE_IMPORT_RUN_ID}:shipment`;
    await prisma.rocketPurchaseConfirmationTransmission.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: created.exportId,
        sourceImportRunId: SOURCE_IMPORT_RUN_ID,
        transport: 'SHIPMENT',
        intentKey,
      },
    });
    await prisma.sellpiaOrderTransmissionIntent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        intentKey,
        status: 'aborted',
        createdBy: TEST_USER_ID,
        abortedAt: new Date(),
      },
    });
    const workflowRow = () =>
      prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
        where: { id: created.exportId },
        select: { completedAt: true, updatedAt: true },
      });

    await expect(
      adapter.getActiveWorkflow({ organizationId: TEST_ORGANIZATION_ID }),
    ).resolves.toMatchObject({ exportId: created.exportId });
    const failedRow = await workflowRow();
    expect(failedRow.completedAt).toBeNull();

    // The aborted intent keeps the workflow failed without a stored failure
    // word: a new export is fenced and repeated reads do not rewrite the row.
    await expect(
      adapter.exportWorkbook(
        confirmationInput('21000000-0000-4000-8000-000000000053', 2),
      ),
    ).rejects.toMatchObject({ code: 'SUPPLY_ROCKET_WORKFLOW_ACTIVE' });
    await expect(
      adapter.getActiveWorkflow({ organizationId: TEST_ORGANIZATION_ID }),
    ).resolves.toMatchObject({ exportId: created.exportId });
    await expect(workflowRow()).resolves.toEqual(failedRow);

    await prisma.sellpiaOrderTransmissionIntent.updateMany({
      where: { organizationId: TEST_ORGANIZATION_ID, intentKey },
      data: { status: 'finalized', finalizedAt: new Date(), abortedAt: null },
    });
    await expect(
      adapter.getActiveWorkflow({ organizationId: TEST_ORGANIZATION_ID }),
    ).resolves.toBeNull();
    await expect(workflowRow()).resolves.toMatchObject({
      completedAt: expect.any(Date),
    });
  });

  it('refuses abandonment while a workbook line is linked to a collected order, even after fresh probes', async () => {
    const created = await adapter.exportWorkbook(
      confirmationInput('21000000-0000-4000-8000-000000000041', 2),
    );
    const confirmation =
      await prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
        where: { id: created.exportId },
        select: { confirmedAt: true },
      });
    // A second positive line that no order collected keeps the workbook
    // awaiting Coupang confirmation, the only state abandonment considers.
    await prisma.rocketPurchaseConfirmationLine.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: created.exportId,
        poLineId: '1001:P-2:8801234567891:1',
        poNumber: '1001',
        productNo: 'P-2',
        barcode: '8801234567891',
        productName: 'Rocket item 2',
        orderQuantity: 1,
        confirmedQuantity: 1,
      },
    });
    await prisma.rocketPurchaseConfirmationLine.updateMany({
      where: { confirmationId: created.exportId, poLineId: PO_LINE_ID },
      data: {
        collectedAt: new Date(),
        collectedOrderLineItemId: '21000000-0000-4000-8000-000000000042',
      },
    });
    await prisma.rocketPurchaseConfirmationTransmission.createMany({
      data: ['SHIPMENT', 'MILKRUN'].map((transport) => ({
        organizationId: TEST_ORGANIZATION_ID,
        confirmationId: created.exportId,
        sourceImportRunId: SOURCE_IMPORT_RUN_ID,
        transport,
        observedAt: confirmation.confirmedAt,
      })),
    });

    await expect(adapter.abandonWorkbook({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      exportId: created.exportId,
    })).rejects.toMatchObject({ code: 'SUPPLY_ROCKET_PROBE_REQUIRED' });
    await expect(prisma.rocketPurchaseConfirmation.findUniqueOrThrow({
      where: { id: created.exportId },
      select: { releasedAt: true },
    })).resolves.toEqual({ releasedAt: null });
  });
});

function confirmationInput(
  idempotencyKey: string,
  quantity: number,
  center = '덕평1센터',
): Parameters<RocketWorkbookExportTransactionPort['exportWorkbook']>[0] {
  const request: RocketWorkbookDecisionRequest = {
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
    rows: [
      {
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
      },
    ],
    editedQuantities: { [PO_LINE_ID]: quantity },
    shortageReasons:
      quantity < 4
        ? { [PO_LINE_ID]: '협력사 재고부족 - 수요예측 오류' as const }
        : {},
    artifactFileName: 'coupang-rocket.xlsx',
    artifactContentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
  };
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    sourceImportRunId: SOURCE_IMPORT_RUN_ID,
    request,
    preview: {
      status: 'ready',
      collectionRunId: COLLECTION_RUN_ID,
      catalog: {
        sourceImportRunId: SOURCE_IMPORT_RUN_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        generation: '1',
        actualCutoffAt: '2026-07-17T00:00:00.000Z',
        rowCount: 1,
      },
      inventoryGeneration: '12',
      rows: [
        {
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
          channelListingOptionId: OPTION_ID,
          masterProductId: MASTER_PRODUCT_ID,
          components: [
            {
              masterProductId: SELLPIA_SKU_ID,
              code: 'SP-ROCKET-1',
              name: 'Rocket component',
              optionName: null,
              quantity: 1,
              currentStock: 5,
            },
          ],
        },
      ],
    },
    artifactBytes: Buffer.from('exact-coupang-workbook'),
  };
}
