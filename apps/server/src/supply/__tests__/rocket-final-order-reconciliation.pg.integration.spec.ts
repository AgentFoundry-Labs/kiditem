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
import { RocketFinalOrderReconciliationTransactionAdapter } from '../adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter';

const CHANNEL_ACCOUNT_ID = '41000000-0000-4000-8000-000000000001';
const SKU_ID = '41000000-0000-4000-8000-000000000002';

describe('Rocket final-order reconciliation transaction (PG)', () => {
  let prisma: PrismaClient;
  let adapter: RocketFinalOrderReconciliationTransactionAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    adapter = new RocketFinalOrderReconciliationTransactionAdapter(
      new InventoryCommitmentService(
        new InventoryCommitmentRepositoryAdapter(prismaService),
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
  });

  it('replaces the request commitment with one final-order commitment idempotently', async () => {
    await seedRequest(4, '8801234567890');
    const finalOrderLineId = randomUUID();
    const input = reconciliationInput(finalOrderLineId, 3, '8801234567890');

    await prisma.$transaction((tx) => adapter.reconcile({ ...input, transaction: tx }));
    await prisma.$transaction((tx) => adapter.reconcile({ ...input, transaction: tx }));

    const commitments = await prisma.inventoryCommitment.findMany({
      orderBy: { createdAt: 'asc' },
      include: { allocations: true },
    });
    expect(commitments).toHaveLength(2);
    expect(commitments[0]).toMatchObject({
      kind: 'rocket_request',
      status: 'released',
      releaseReason: '쿠팡 발주확정 주문 전환',
    });
    expect(commitments[1]).toMatchObject({
      kind: 'rocket_final_order',
      sourceId: finalOrderLineId,
      status: 'active',
      unitQuantity: 3,
      predecessorCommitmentId: commitments[0]!.id,
      allocations: [{ quantity: 3 }],
    });
  });

  it('rejects barcode mismatch without changing the request commitment', async () => {
    await seedRequest(4, '8801234567890');

    await expect(prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 3, 'DIFFERENT'),
      transaction: tx,
    }))).rejects.toMatchObject({ code: 'ROCKET_FINAL_ORDER_BARCODE_MISMATCH' });
    expect(await prisma.inventoryCommitment.findFirstOrThrow()).toMatchObject({
      kind: 'rocket_request',
      status: 'active',
    });
  });

  it('rolls back replacement when the final quantity exceeds available stock', async () => {
    await seedRequest(4, null);

    await expect(prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 11, null),
      transaction: tx,
    }))).rejects.toThrow(/exceeds available/i);
    expect(await prisma.inventoryCommitment.findFirstOrThrow()).toMatchObject({
      kind: 'rocket_request',
      status: 'active',
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
    const commitment = await prisma.inventoryCommitment.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        kind: 'rocket_request',
        sourceId: line.id,
        businessKey: `coupang-rocket:${CHANNEL_ACCOUNT_ID}:PO-1:P-1`,
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

function reconciliationInput(
  finalOrderLineId: string,
  unitQuantity: number,
  barcode: string | null,
) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_USER_ID,
    channelAccountId: CHANNEL_ACCOUNT_ID,
    lines: [{
      finalOrderLineId,
      poNumber: 'PO-1',
      productNo: 'P-1',
      barcode,
      unitQuantity,
    }],
  };
}
