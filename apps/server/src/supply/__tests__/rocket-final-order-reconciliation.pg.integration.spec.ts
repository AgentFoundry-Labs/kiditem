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

  it('skips a line without an active confirmation instead of throwing 409', async () => {
    // 발주확정(commitment)이 하나도 없는 현재 상태를 재현한다. 예전에는 여기서
    // ROCKET_REQUEST_COMMITMENT_NOT_FOUND 409 로 배치 전체가 죽었다.
    const result = await prisma.$transaction((tx) => adapter.reconcile({
      ...reconciliationInput(randomUUID(), 3, '8801234567890'),
      transaction: tx,
    }));

    expect(result).toEqual({
      reconciledRows: 0,
      skippedLines: [{ poNumber: 'PO-1', productNo: 'P-1' }],
    });
    expect(await prisma.inventoryCommitment.count()).toBe(0);
  });

  it('reconciles matched lines and skips unmatched ones in the same batch', async () => {
    await seedRequest(4, '8801234567890');
    const matchedLineId = randomUUID();
    const unmatchedLineId = randomUUID();

    const result = await prisma.$transaction((tx) => adapter.reconcile({
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_USER_ID,
      channelAccountId: CHANNEL_ACCOUNT_ID,
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
      reconciledRows: 1,
      skippedLines: [{ poNumber: 'PO-2', productNo: 'P-2' }],
    });
    // 확정된 라인의 정산은 그대로 — 요청 커밋이 최종주문 커밋으로 교체된다.
    const commitments = await prisma.inventoryCommitment.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(commitments).toMatchObject([
      { kind: 'rocket_request', status: 'released' },
      {
        kind: 'rocket_final_order',
        sourceId: matchedLineId,
        status: 'active',
        unitQuantity: 3,
      },
    ]);
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
        status: 'active',
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
    lines: [{
      finalOrderLineId,
      poNumber: 'PO-1',
      productNo: 'P-1',
      barcode,
      unitQuantity,
    }],
  };
}
