import { AppException } from '@kiditem/shared/server-errors';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseOrderSubmissionTransactionAdapter } from './purchase-order-submission.transaction.adapter';

const ORDER_ID = '0187e942-9098-7382-9a22-c5b821f2f5d1';
const SELLPIA_SKU_ID = '00000000-0000-4000-8000-000000000001';
const FENCE = '00000000-0000-4000-8000-000000000099';

function makePrisma(input: {
  orderOrganizationId?: string;
  orderStatus?: string;
  active?: boolean;
  fence?: string;
  latestAttempt?: Record<string, unknown> | null;
} = {}) {
  const state = [{
    freshnessFence: input.fence ?? FENCE,
    freshnessGeneration: 7n,
    lastVerifiedAt: new Date('2026-07-16T00:00:00.000Z'),
    databaseNow: new Date('2026-07-16T00:05:00.000Z'),
  }];
  const order = input.orderOrganizationId === 'other'
    ? []
    : [{ id: ORDER_ID, status: input.orderStatus ?? 'pending' }];
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce(order),
    organizationMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }),
    },
    purchaseOrderItem: {
      findMany: vi.fn().mockResolvedValue([{ sellpiaInventorySkuId: SELLPIA_SKU_ID }]),
    },
    sellpiaInventorySku: {
      findMany: vi.fn().mockResolvedValue(input.active === false
        ? [{ id: SELLPIA_SKU_ID, isActive: false }]
        : [{ id: SELLPIA_SKU_ID, isActive: true }]),
    },
    purchaseOrderSubmissionAttempt: {
      findFirst: vi.fn().mockResolvedValue(input.latestAttempt ?? null),
      create: vi.fn().mockResolvedValue({
        id: 'attempt-1',
        status: 'prepared',
        idempotencyKey: 'submit-1',
        createdAt: new Date('2026-07-16T00:05:00.000Z'),
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    purchaseOrder: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({
        id: ORDER_ID,
        status: 'ordered',
        externalOrderPlatform: null,
        externalOrderId: null,
        externalOrderUrl: null,
      }),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx)),
    },
  };
}

function makeLockedOrderPrisma(input: {
  orderStatus?: string;
  membership?: { id: string } | null;
  unresolvedAttemptCount?: number;
  attempt?: Record<string, unknown> | null;
} = {}) {
  const order = [{ id: ORDER_ID, status: input.orderStatus ?? 'draft' }];
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(input.attempt ? [input.attempt] : []),
    organizationMembership: {
      findFirst: vi.fn().mockResolvedValue(
        input.membership === undefined ? { id: 'membership-1' } : input.membership,
      ),
    },
    purchaseOrderSubmissionAttempt: {
      count: vi.fn().mockResolvedValue(input.unresolvedAttemptCount ?? 0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    purchaseOrder: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({
        id: ORDER_ID,
        status: 'ordered',
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-1',
        externalOrderUrl: null,
      }),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx)),
    },
  };
}

function prepareInput(requiresProvider = true) {
  return {
    organizationId: 'org-1',
    purchaseOrderId: ORDER_ID,
    sellpiaInventorySkuIds: [SELLPIA_SKU_ID],
    idempotencyKey: 'submit-1',
    userId: 'user-1',
    freshnessFence: FENCE,
    freshnessLastVerifiedAt: '2026-07-16T00:00:00.000Z',
    freshnessExpiresAt: '2026-07-16T00:10:00.000Z',
    requiresProvider,
    externalOrder: {
      externalOrderPlatform: null,
      externalOrderId: null,
      externalOrderUrl: null,
    },
  };
}

describe('PurchaseOrderSubmissionTransactionAdapter', () => {
  it('validates the active actor before mutating draft to pending', async () => {
    const { prisma, tx } = makeLockedOrderPrisma();
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    await adapter.prepareDraft({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      userId: 'user-1',
      idempotencyKey: 'submit-1',
    });

    expect(tx.organizationMembership.findFirst).toHaveBeenCalledBefore(
      tx.purchaseOrder.updateMany,
    );
    expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, organizationId: 'org-1', status: 'draft' },
      data: { status: 'pending' },
    });
  });

  it('rejects an inactive actor without mutating draft status', async () => {
    const { prisma, tx } = makeLockedOrderPrisma({ membership: null });
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    await expect(adapter.prepareDraft({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      userId: 'inactive-user',
      idempotencyKey: 'submit-1',
    })).rejects.toBeInstanceOf(AppException);
    expect(tx.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a non-normalized idempotency key without mutating draft status', async () => {
    const { prisma, tx } = makeLockedOrderPrisma();
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    await expect(adapter.prepareDraft({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      userId: 'user-1',
      idempotencyKey: '   ',
    })).rejects.toThrow('idempotency');
    expect(tx.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('returns the reference-safe error before mutating a cross-tenant order', async () => {
    const { prisma, tx } = makeLockedOrderPrisma();
    tx.$queryRaw.mockReset().mockResolvedValueOnce([]);
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    await expect(adapter.prepareDraft({
      organizationId: 'other-org',
      purchaseOrderId: ORDER_ID,
      userId: 'user-1',
      idempotencyKey: 'submit-1',
    })).rejects.toMatchObject({ code: 'PURCHASE_REFERENCE_INVALID' });
    expect(tx.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('atomically blocks deletion while an unresolved provider intent exists', async () => {
    const { prisma, tx } = makeLockedOrderPrisma({
      orderStatus: 'pending',
      unresolvedAttemptCount: 1,
    });
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    const result = await adapter.deletePurchaseOrder({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
    });

    expect(result).toEqual({ kind: 'unresolved_attempt' });
    expect(tx.purchaseOrder.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects reconciliation while a prepared provider owner is still fresh', async () => {
    const { prisma, tx } = makeLockedOrderPrisma({
      orderStatus: 'pending',
      attempt: {
        id: 'attempt-1',
        idempotencyKey: 'submit-1',
        status: 'prepared',
        providerReference: null,
        reconciliationOutcome: null,
        createdAt: new Date('2026-07-16T00:04:00.000Z'),
        databaseNow: new Date('2026-07-16T00:05:00.000Z'),
      },
    });
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    await expect(adapter.reconcile({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      userId: 'user-1',
      outcome: 'provider_failed',
    })).rejects.toMatchObject({
      code: 'PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED',
    });
    expect(tx.purchaseOrderSubmissionAttempt.updateMany).not.toHaveBeenCalled();
  });

  it('locks freshness and purchase-order rows before atomically ordering a providerless order', async () => {
    const { prisma, tx } = makePrisma();
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    const result = await adapter.prepare(prepareInput(false));

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.purchaseOrder.updateMany.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.purchaseOrder.updateMany.mock.invocationCallOrder[0],
    );
    expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_ID, organizationId: 'org-1', status: 'pending' },
      data: {
        status: 'ordered',
        externalOrderPlatform: null,
        externalOrderId: null,
        externalOrderUrl: null,
      },
    });
    expect(result).toMatchObject({ kind: 'providerless', order: { status: 'ordered' } });
  });

  it('creates one prepared intent only after the fence and active identities pass', async () => {
    const { prisma, tx } = makePrisma();
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    const result = await adapter.prepare(prepareInput());

    expect(tx.purchaseOrderSubmissionAttempt.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        purchaseOrderId: ORDER_ID,
        idempotencyKey: 'submit-1',
        freshnessGeneration: 7n,
        status: 'prepared',
      },
    });
    expect(result).toMatchObject({ kind: 'created', attempt: { status: 'prepared' } });
  });

  it('rejects an opaque fence mismatch as freshness-required', async () => {
    const { prisma, tx } = makePrisma({ fence: '00000000-0000-4000-8000-000000000100' });
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    await expect(adapter.prepare(prepareInput())).rejects.toMatchObject({
      code: 'SELLPIA_SYNC_REQUIRED',
    });
    expect(tx.purchaseOrderSubmissionAttempt.create).not.toHaveBeenCalled();
  });

  it('rechecks the Inventory-owned expiry against database time', async () => {
    const { prisma, tx } = makePrisma();
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    await expect(adapter.prepare({
      ...prepareInput(),
      freshnessExpiresAt: '2026-07-16T00:05:00.000Z',
    })).rejects.toMatchObject({ code: 'SELLPIA_SYNC_REQUIRED' });
    expect(tx.purchaseOrderSubmissionAttempt.create).not.toHaveBeenCalled();
  });

  it('distinguishes inactive products from cross-tenant/reference failures', async () => {
    const inactiveHarness = makePrisma({ active: false });
    const inactive = new PurchaseOrderSubmissionTransactionAdapter(
      inactiveHarness.prisma as never,
    );
    await expect(inactive.prepare(prepareInput())).rejects.toMatchObject({
      code: 'PURCHASE_ITEM_INACTIVE',
    });

    const crossTenantHarness = makePrisma({ orderOrganizationId: 'other' });
    const crossTenant = new PurchaseOrderSubmissionTransactionAdapter(
      crossTenantHarness.prisma as never,
    );
    await expect(crossTenant.prepare(prepareInput())).rejects.toMatchObject({
      code: 'PURCHASE_REFERENCE_INVALID',
    });
    expect(crossTenantHarness.tx.purchaseOrderSubmissionAttempt.create)
      .not.toHaveBeenCalled();
  });

  it('returns an existing prepared intent without creating another', async () => {
    const { prisma, tx } = makePrisma({ latestAttempt: {
      id: 'attempt-existing',
      status: 'prepared',
      idempotencyKey: 'submit-1',
      createdAt: new Date('2026-07-16T00:04:00.000Z'),
    } });
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    const result = await adapter.prepare(prepareInput());

    expect(result).toMatchObject({
      kind: 'existing',
      attempt: { id: 'attempt-existing', status: 'prepared' },
    });
    expect(tx.purchaseOrderSubmissionAttempt.create).not.toHaveBeenCalled();
  });

  it('atomically promotes a prepared intent older than fifteen DB minutes to unknown', async () => {
    const { prisma, tx } = makePrisma({ latestAttempt: {
      id: 'attempt-existing',
      status: 'prepared',
      idempotencyKey: 'submit-1',
      createdAt: new Date('2026-07-15T23:49:59.000Z'),
    } });
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    const result = await adapter.prepare(prepareInput());

    expect(tx.purchaseOrderSubmissionAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'attempt-existing',
        organizationId: 'org-1',
        purchaseOrderId: ORDER_ID,
        status: 'prepared',
      },
      data: {
        status: 'provider_unknown',
        errorCode: 'prepared_intent_expired',
        errorMessage: 'Prepared provider intent exceeded the reconciliation window.',
      },
    });
    expect(result).toMatchObject({
      kind: 'existing',
      attempt: { status: 'provider_unknown' },
    });
  });

  it('rejects an actor that is not active in the organization', async () => {
    const { prisma, tx } = makePrisma();
    tx.organizationMembership.findFirst.mockResolvedValue(null);
    const adapter = new PurchaseOrderSubmissionTransactionAdapter(prisma as never);

    await expect(adapter.prepare(prepareInput())).rejects.toBeInstanceOf(AppException);
    expect(tx.purchaseOrderSubmissionAttempt.create).not.toHaveBeenCalled();
  });
});
