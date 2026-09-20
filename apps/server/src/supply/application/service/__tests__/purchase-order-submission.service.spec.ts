import { AppException } from '@kiditem/shared/server-errors';
import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import {
  PurchaseOrderCheckoutProviderFailedError,
} from '../../port/out/runtime/purchase-order-checkout-runtime.port';
import { PurchaseOrderSubmissionService } from '../purchase-order-submission.service';

const ORDER_ID = '0187e942-9098-7382-9a22-c5b821f2f5d1';
const SELLPIA_SKU_ID = '00000000-0000-4000-8000-000000000001';
const INVENTORY_ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';

function snapshot() {
  return {
    id: ORDER_ID,
    supplierName: '1688 Supplier',
    supplierId: 'supplier-1',
    totalAmountCny: '45.60',
    items: [{
      productName: 'Silicone plate',
      sellpiaInventorySkuId: SELLPIA_SKU_ID,
      quantity: 2,
      unitPriceCny: '22.80',
    }],
  };
}

function submissionInput(input: {
  organizationId?: string;
  purchaseOrderId?: string;
  idempotencyKey?: string;
  userId?: string;
  inventoryAttemptId?: string;
  requestHash?: string;
  externalOrderPlatform?: string | null;
  externalOrderId?: string | null;
  externalOrderUrl?: string | null;
} = {}) {
  const value = {
    organizationId: 'org-1',
    purchaseOrderId: ORDER_ID,
    inventoryAttemptId: INVENTORY_ATTEMPT_ID,
    idempotencyKey: 'submit-1',
    userId: 'user-1',
    ...input,
  };
  const businessInput = {
    purchaseOrderId: value.purchaseOrderId,
    inventoryAttemptId: value.inventoryAttemptId,
    ...(value.externalOrderPlatform !== undefined && {
      externalOrderPlatform: value.externalOrderPlatform,
    }),
    ...(value.externalOrderId !== undefined && {
      externalOrderId: value.externalOrderId,
    }),
    ...(value.externalOrderUrl !== undefined && {
      externalOrderUrl: value.externalOrderUrl,
    }),
  };
  return {
    ...value,
    requestHash: value.requestHash ?? canonicalOwnerInputHash(businessInput),
  };
}

function harness(options: { runtime?: boolean } = {}) {
  const procurement = {
    getPurchaseOrderCheckoutSnapshot: vi.fn().mockResolvedValue(snapshot()),
  };
  const freshness = {
    requireCollectedStock: vi.fn().mockResolvedValue({
      attemptId: INVENTORY_ATTEMPT_ID,
      fence: '00000000-0000-4000-8000-000000000099',
      generation: '7',
      completedAt: '2026-07-16T00:00:00.000Z',
      inventorySkus: [{ sellpiaInventorySkuId: SELLPIA_SKU_ID, currentStock: 1 }],
    }),
  };
  const transaction = {
    prepareDraft: vi.fn().mockResolvedValue({ id: ORDER_ID, status: 'pending' }),
    prepare: vi.fn().mockResolvedValue({
      kind: options.runtime ? 'created' : 'providerless',
      attempt: options.runtime
        ? {
            id: 'attempt-1',
            status: 'prepared',
            idempotencyKey: 'submit-1',
          }
        : undefined,
      order: {
        id: ORDER_ID,
        status: options.runtime ? 'pending' : 'ordered',
        externalOrderPlatform: options.runtime ? null : 'MANUAL',
        externalOrderId: options.runtime ? null : 'manual-1',
        externalOrderUrl: null,
      },
    }),
    completeProviderSuccess: vi.fn().mockResolvedValue({
      id: ORDER_ID,
      status: 'ordered',
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-1.html',
    }),
    completeProviderFailure: vi.fn().mockResolvedValue(undefined),
    markProviderUnknown: vi.fn().mockResolvedValue(undefined),
    reconcile: vi.fn().mockResolvedValue({
      id: ORDER_ID,
      status: 'ordered',
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-reconciled',
      externalOrderUrl: null,
    }),
  };
  const runtime = {
    submit: vi.fn().mockResolvedValue({
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-1.html',
    }),
  };
  const Service = PurchaseOrderSubmissionService as unknown as new (
    procurement: typeof procurement,
    freshness: typeof freshness,
    transaction: typeof transaction,
    runtime?: typeof runtime,
  ) => PurchaseOrderSubmissionService;
  const service = new Service(
    procurement,
    freshness,
    transaction,
    options.runtime ? runtime : undefined,
  );
  return { service, procurement, freshness, transaction, runtime };
}

describe('PurchaseOrderSubmissionService', () => {
  it('requires the exact completed inventory collection before ordering the purchase', async () => {
    const { service, procurement, freshness, transaction } = harness();
    const input = submissionInput({
      externalOrderPlatform: 'MANUAL',
      externalOrderId: 'manual-1',
    });

    await service.submit(input);

    expect(transaction.prepareDraft).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      userId: 'user-1',
      idempotencyKey: 'submit-1',
    });
    expect(transaction.prepareDraft).toHaveBeenCalledBefore(
      procurement.getPurchaseOrderCheckoutSnapshot,
    );
    expect(freshness.requireCollectedStock).toHaveBeenCalledWith({
      organizationId: 'org-1',
      attemptId: INVENTORY_ATTEMPT_ID,
      sellpiaInventorySkuIds: [SELLPIA_SKU_ID],
    });
    expect(freshness.requireCollectedStock).toHaveBeenCalledBefore(
      transaction.prepare,
    );
    expect(transaction.prepareDraft).toHaveBeenCalledBefore(
      transaction.prepare,
    );
    expect(transaction.prepare).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      sellpiaInventorySkuIds: [SELLPIA_SKU_ID],
      inventoryAttemptId: INVENTORY_ATTEMPT_ID,
      inventoryFence: '00000000-0000-4000-8000-000000000099',
      inventoryGeneration: '7',
      inventoryCompletedAt: '2026-07-16T00:00:00.000Z',
      idempotencyKey: 'submit-1',
      requestHash: input.requestHash,
      userId: 'user-1',
      requiresProvider: false,
      externalOrder: {
        externalOrderPlatform: 'MANUAL',
        externalOrderId: 'manual-1',
        externalOrderUrl: null,
      },
    });
  });

  it('rejects a whitespace-only key before any draft mutation or lookup', async () => {
    const { service, procurement, freshness, transaction } = harness();

    await expect(service.submit(submissionInput({
      idempotencyKey: '   ',
    }))).rejects.toThrow('idempotency');

    expect(transaction.prepareDraft).not.toHaveBeenCalled();
    expect(procurement.getPurchaseOrderCheckoutSnapshot).not.toHaveBeenCalled();
    expect(freshness.requireCollectedStock).not.toHaveBeenCalled();
  });

  it('rejects an owner request hash that does not bind the canonical business input', async () => {
    const { service, procurement, freshness, transaction } = harness();

    await expect(service.submit(submissionInput({
      requestHash: canonicalOwnerInputHash({ purchaseOrderId: 'different-order' }),
    }))).rejects.toThrow('canonical input');

    expect(transaction.prepareDraft).not.toHaveBeenCalled();
    expect(procurement.getPurchaseOrderCheckoutSnapshot).not.toHaveBeenCalled();
    expect(freshness.requireCollectedStock).not.toHaveBeenCalled();
  });

  it('rejects an inactive actor before draft mutation reaches checkout lookup', async () => {
    const { service, procurement, transaction } = harness();
    transaction.prepareDraft.mockRejectedValue(
      new AppException(403, 'UNAUTHORIZED', 'inactive actor'),
    );

    await expect(service.submit(submissionInput({
      userId: 'inactive-user',
    }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(procurement.getPurchaseOrderCheckoutSnapshot).not.toHaveBeenCalled();
    expect(transaction.prepare).not.toHaveBeenCalled();
  });

  it('preserves reference-safe cross-tenant errors on the common HTTP and Agent port', async () => {
    const { service, procurement, transaction } = harness();
    transaction.prepareDraft.mockRejectedValue(
      new AppException(422, 'PURCHASE_REFERENCE_INVALID', 'invalid reference'),
    );

    await expect(service.submit(submissionInput({
      organizationId: 'other-org',
    }))).rejects.toMatchObject({ code: 'PURCHASE_REFERENCE_INVALID' });

    expect(procurement.getPurchaseOrderCheckoutSnapshot).not.toHaveBeenCalled();
    expect(transaction.prepare).not.toHaveBeenCalled();
  });

  it('commits a prepared intent before calling the provider and forwards the same key', async () => {
    const { service, transaction, runtime } = harness({ runtime: true });

    const result = await service.submit(submissionInput());

    expect(transaction.prepare).toHaveBeenCalledBefore(runtime.submit);
    expect(runtime.submit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      idempotencyKey: 'submit-1',
      purchaseOrder: snapshot(),
    });
    expect(runtime.submit).toHaveBeenCalledBefore(
      transaction.completeProviderSuccess,
    );
    expect(transaction.completeProviderSuccess).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      attemptId: 'attempt-1',
      idempotencyKey: 'submit-1',
      provider: {
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-1',
        externalOrderUrl: 'https://trade.1688.com/order/1688-1.html',
      },
    });
    expect(result).toMatchObject({ status: 'ordered', externalOrderId: '1688-1' });
  });

  it('does not call the provider again after an ambiguous or existing attempt', async () => {
    const { service, transaction, runtime } = harness({ runtime: true });
    transaction.prepare.mockResolvedValue({
      kind: 'existing',
      attempt: {
        id: 'attempt-1',
        status: 'provider_unknown',
        idempotencyKey: 'submit-1',
      },
      order: {
        id: ORDER_ID,
        status: 'pending',
        externalOrderPlatform: null,
        externalOrderId: null,
        externalOrderUrl: null,
      },
    });

    await expect(service.submit(submissionInput())).rejects.toMatchObject({
      code: 'PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED',
    });
    expect(runtime.submit).not.toHaveBeenCalled();
  });

  it('classifies a timeout or ambiguous provider response as unknown and never retries it', async () => {
    const { service, transaction, runtime } = harness({ runtime: true });
    runtime.submit.mockRejectedValue(new Error('socket timed out after send'));

    await expect(service.submit(submissionInput())).rejects.toMatchObject({
      code: 'PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED',
    });
    expect(transaction.markProviderUnknown).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      attemptId: 'attempt-1',
      idempotencyKey: 'submit-1',
      errorCode: 'provider_response_unknown',
      errorMessage: 'socket timed out after send',
    });
    expect(runtime.submit).toHaveBeenCalledTimes(1);
  });

  it('persists a clear provider failure without changing the order to ordered', async () => {
    const { service, transaction, runtime } = harness({ runtime: true });
    runtime.submit.mockRejectedValue(
      new PurchaseOrderCheckoutProviderFailedError(
        'provider_rejected',
        '1688 checkout provider failed with status 422.',
      ),
    );

    await expect(service.submit(submissionInput()))
      .rejects.toThrow('1688 checkout provider failed with status 422.');
    expect(transaction.completeProviderFailure).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      attemptId: 'attempt-1',
      idempotencyKey: 'submit-1',
      errorCode: 'provider_rejected',
      errorMessage: '1688 checkout provider failed with status 422.',
    });
    expect(transaction.completeProviderSuccess).not.toHaveBeenCalled();
  });

  it('records reconciliation with the authenticated actor', async () => {
    const { service, transaction } = harness();

    await service.reconcile({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      userId: 'authenticated-user',
      outcome: 'provider_succeeded',
      providerReference: '1688-reconciled',
    });

    expect(transaction.reconcile).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: ORDER_ID,
      userId: 'authenticated-user',
      outcome: 'provider_succeeded',
      providerReference: '1688-reconciled',
    });
  });

  it('preserves the freshness error without creating an attempt or calling a provider', async () => {
    const { service, freshness, transaction, runtime } = harness({ runtime: true });
    freshness.requireCollectedStock.mockRejectedValue(
      new AppException(409, 'SELLPIA_SYNC_REQUIRED', 'fresh snapshot required'),
    );

    await expect(service.submit(submissionInput()))
      .rejects.toMatchObject({ code: 'SELLPIA_SYNC_REQUIRED' });
    expect(transaction.prepare).not.toHaveBeenCalled();
    expect(runtime.submit).not.toHaveBeenCalled();
  });
});
