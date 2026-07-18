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
import { RocketPurchaseConfirmationQueryRepositoryAdapter } from '../adapter/out/repository/rocket-purchase-confirmation-query.repository.adapter';
import { RocketPurchaseCommitmentQueryService } from '../application/service/rocket-purchase-commitment-query.service';

const CHANNEL_ACCOUNT_ID = '42000000-0000-4000-8000-000000000001';
const SKU_ID = '42000000-0000-4000-8000-000000000002';

describe('Rocket purchase commitment query (PG)', () => {
  let prisma: PrismaClient;
  let inventory: InventoryCommitmentService;
  let service: RocketPurchaseCommitmentQueryService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    inventory = new InventoryCommitmentService(
      new InventoryCommitmentRepositoryAdapter(prismaService),
    );
    service = new RocketPurchaseCommitmentQueryService(
      new RocketPurchaseConfirmationQueryRepositoryAdapter(prismaService),
      inventory,
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
        code: 'SP-LIST-1',
        name: 'Commitment inventory',
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

  it('reloads request-to-final lineage and settles only after a newer snapshot', async () => {
    const { lineId, requestCommitmentId } = await seedRequest();
    const beforeFinal = await service.list({
      organizationId: TEST_ORGANIZATION_ID,
      request: { limit: 50 },
    });
    expect(beforeFinal.items[0]).toMatchObject({
      confirmationLineId: lineId,
      requestCommitment: {
        id: requestCommitmentId,
        status: 'active',
        allocations: [{
          currentStock: 10,
          activeCommitmentQuantity: 4,
          availableStock: 6,
        }],
      },
      finalOrderCommitment: null,
      canRelease: true,
      canSettle: false,
    });

    const finalOrderLineId = randomUUID();
    await prisma.$transaction((transaction) =>
      inventory.replaceRocketRequestWithFinalOrder({
        transaction,
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        finalOrderLineId,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        poNumber: 'PO-1',
        productNo: 'P-1',
        unitQuantity: 3,
        barcode: '8801234567890',
      }));

    const afterFinal = await service.list({
      organizationId: TEST_ORGANIZATION_ID,
      request: { limit: 50 },
    });
    const finalCommitment = afterFinal.items[0]!.finalOrderCommitment!;
    expect(afterFinal.items[0]).toMatchObject({
      orderLineItemId: finalOrderLineId,
      requestCommitment: { status: 'released' },
      finalOrderCommitment: {
        status: 'active',
        unitQuantity: 3,
        allocations: [{
          currentStock: 10,
          activeCommitmentQuantity: 3,
          availableStock: 7,
        }],
      },
      canSettle: false,
    });

    await prisma.sellpiaInventoryState.update({
      where: { organizationId: TEST_ORGANIZATION_ID },
      data: { verifiedGeneration: 2n, requestedGeneration: 2n, lastVerifiedAt: new Date() },
    });
    const afterRefresh = await service.list({
      organizationId: TEST_ORGANIZATION_ID,
      request: { limit: 50 },
    });
    expect(afterRefresh.items[0]!.canSettle).toBe(true);

    await service.settleFinalOrders({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: {
        commitmentIds: [finalCommitment.id],
        reason: 'Sellpia 출고 반영 확인',
      },
    });
    const settled = await service.list({
      organizationId: TEST_ORGANIZATION_ID,
      request: { limit: 50 },
    });
    expect(settled.items[0]).toMatchObject({
      finalOrderCommitment: {
        status: 'settled',
        settlementReason: 'Sellpia 출고 반영 확인',
        allocations: [{
          activeCommitmentQuantity: 0,
          availableStock: 10,
        }],
      },
      canRelease: false,
      canSettle: false,
    });
  });

  it('releases an active final-order commitment after a page reload', async () => {
    await seedRequest();
    const finalOrderLineId = randomUUID();
    await prisma.$transaction((transaction) =>
      inventory.replaceRocketRequestWithFinalOrder({
        transaction,
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_USER_ID,
        finalOrderLineId,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        poNumber: 'PO-1',
        productNo: 'P-1',
        unitQuantity: 3,
        barcode: '8801234567890',
      }));
    const reloaded = await service.list({
      organizationId: TEST_ORGANIZATION_ID,
      request: { limit: 50 },
    });
    const commitmentId = reloaded.items[0]!.finalOrderCommitment!.id;

    await service.releaseFinalOrders({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      request: { commitmentIds: [commitmentId], reason: '쿠팡 주문 취소' },
    });

    const released = await service.list({
      organizationId: TEST_ORGANIZATION_ID,
      request: { limit: 50 },
    });
    expect(released.items[0]).toMatchObject({
      finalOrderCommitment: {
        status: 'released',
        releaseReason: '쿠팡 주문 취소',
        allocations: [{ activeCommitmentQuantity: 0, availableStock: 10 }],
      },
      canRelease: false,
    });
  });

  async function seedRequest() {
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
        poNumber: 'PO-1',
        productNo: 'P-1',
        barcode: '8801234567890',
        productName: 'Rocket item',
        orderQuantity: 5,
        confirmedQuantity: 4,
      },
    });
    const requestCommitment = await prisma.inventoryCommitment.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        kind: 'rocket_request',
        sourceId: line.id,
        businessKey: `coupang-rocket:${CHANNEL_ACCOUNT_ID}:PO-1:P-1`,
        unitQuantity: 4,
        status: 'active',
        inventoryGeneration: 1n,
        createdBy: TEST_USER_ID,
      },
    });
    await prisma.inventoryCommitmentAllocation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        commitmentId: requestCommitment.id,
        sellpiaInventorySkuId: SKU_ID,
        unitsPerItem: 1,
        quantity: 4,
      },
    });
    return { lineId: line.id, requestCommitmentId: requestCommitment.id };
  }
});
