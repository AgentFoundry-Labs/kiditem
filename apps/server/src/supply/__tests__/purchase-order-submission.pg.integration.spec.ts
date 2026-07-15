import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  TEST_USER_ID,
} from '../../test-helpers/real-prisma';
import { PurchaseOrderSubmissionTransactionAdapter } from '../adapter/out/transaction/purchase-order-submission.transaction.adapter';

const ORDER_ID = '20000000-0000-4000-8000-000000000001';
const MASTER_ID = '20000000-0000-4000-8000-000000000002';
const FENCE = '20000000-0000-4000-8000-000000000003';
let verifiedAt: Date;

describe('purchase-order submission transaction (PG integration)', () => {
  let prisma: PrismaClient;
  let adapter: PurchaseOrderSubmissionTransactionAdapter;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    adapter = new PurchaseOrderSubmissionTransactionAdapter(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.masterProduct.create({
      data: {
        id: MASTER_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-SUBMIT-1',
        name: 'Submission master',
        currentStock: 10,
        isActive: true,
      },
    });
    await prisma.purchaseOrder.create({
      data: {
        id: ORDER_ID,
        organizationId: TEST_ORGANIZATION_ID,
        supplierName: 'Supplier',
        totalAmountCny: 10,
        status: 'pending',
      },
    });
    await prisma.purchaseOrderItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: ORDER_ID,
        masterProductId: MASTER_ID,
        productName: 'Submission master',
        quantity: 1,
        unitPriceCny: 10,
      },
    });
    verifiedAt = new Date();
    await prisma.sellpiaInventoryState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceAccountKey: 'kiditem',
        lastVerifiedAt: verifiedAt,
        requestedGeneration: 4n,
        verifiedGeneration: 4n,
        freshnessFence: FENCE,
      },
    });
  });

  it('serializes concurrent callers so exactly one owns the provider call', async () => {
    const input = submissionInput('concurrent-key');

    const results = await Promise.all([
      adapter.prepare(input),
      adapter.prepare(input),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual([
      'created',
      'existing',
    ]);
    expect(await prisma.purchaseOrderSubmissionAttempt.count({
      where: { organizationId: TEST_ORGANIZATION_ID, purchaseOrderId: ORDER_ID },
    })).toBe(1);
  });

  it('leaves a crash-safe prepared row and promotes it after fifteen database minutes', async () => {
    const first = await adapter.prepare(submissionInput('crash-key'));
    expect(first.kind).toBe('created');
    await prisma.purchaseOrderSubmissionAttempt.updateMany({
      where: { purchaseOrderId: ORDER_ID },
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });

    const resumed = await adapter.prepare(submissionInput('crash-key'));

    expect(resumed).toMatchObject({
      kind: 'existing',
      attempt: { status: 'provider_unknown' },
    });
  });

  it('reconciles an unknown provider result with the authenticated actor atomically', async () => {
    const prepared = await adapter.prepare(submissionInput('reconcile-key'));
    if (prepared.kind !== 'created') throw new Error('expected prepared owner');
    await adapter.markProviderUnknown({
      organizationId: TEST_ORGANIZATION_ID,
      purchaseOrderId: ORDER_ID,
      attemptId: prepared.attempt.id,
      idempotencyKey: 'reconcile-key',
      errorCode: 'provider_response_unknown',
      errorMessage: 'timeout',
    });

    const order = await adapter.reconcile({
      organizationId: TEST_ORGANIZATION_ID,
      purchaseOrderId: ORDER_ID,
      userId: TEST_USER_ID,
      outcome: 'provider_succeeded',
      providerReference: '1688-reconciled',
    });

    expect(order).toMatchObject({ status: 'ordered', externalOrderId: '1688-reconciled' });
    expect(await prisma.purchaseOrderSubmissionAttempt.findFirstOrThrow({
      where: { purchaseOrderId: ORDER_ID },
    })).toMatchObject({
      status: 'reconciled',
      reconciliationOutcome: 'provider_succeeded',
      reconciledBy: TEST_USER_ID,
      providerReference: '1688-reconciled',
      reconciledAt: expect.any(Date),
    });
  });

  it('never sees or mutates another organization purchase order', async () => {
    await expect(adapter.prepare({
      ...submissionInput('cross-tenant-key'),
      organizationId: OTHER_ORGANIZATION_ID,
    })).rejects.toMatchObject({ code: 'PURCHASE_REFERENCE_INVALID' });
    expect(await prisma.purchaseOrderSubmissionAttempt.count()).toBe(0);
    expect(await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: ORDER_ID } }))
      .toMatchObject({ status: 'pending' });
  });
});

function submissionInput(idempotencyKey: string) {
  return {
    organizationId: TEST_ORGANIZATION_ID,
    purchaseOrderId: ORDER_ID,
    masterProductIds: [MASTER_ID],
    idempotencyKey,
    userId: TEST_USER_ID,
    freshnessFence: FENCE,
    freshnessLastVerifiedAt: verifiedAt.toISOString(),
    freshnessExpiresAt: new Date(verifiedAt.getTime() + 10 * 60_000).toISOString(),
    requiresProvider: true,
    externalOrder: {
      externalOrderPlatform: null,
      externalOrderId: null,
      externalOrderUrl: null,
    },
  };
}
