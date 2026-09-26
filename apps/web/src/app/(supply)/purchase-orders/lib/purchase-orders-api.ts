import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

export type PurchaseOrderItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPriceCny: string;
};

export type PurchaseOrderSupplier = { id: string; name: string };

export type PurchaseOrderSubmissionAttemptSummary = {
  id: string;
  idempotencyKey: string;
  status: string;
  providerReference: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  reconciliationOutcome: string | null;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrder = {
  id: string;
  supplierName: string;
  totalAmountCny: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  trackingNumber: string | null;
  items: PurchaseOrderItem[];
  supplier: PurchaseOrderSupplier | null;
  latestSubmissionAttempt: PurchaseOrderSubmissionAttemptSummary | null;
};

export type PurchaseOrderCounts = {
  all: number;
  draft: number;
  pending: number;
  ordered: number;
  shipped: number;
  received: number;
  cancelled: number;
};

export type SubmitPurchaseOrderRequest = {
  purchaseOrderId: string;
  inventoryOperationId: string;
  idempotencyKey: string;
};

export type SubmitPurchaseOrderResponse = {
  orderId: string;
  status: string;
  externalOrderPlatform: string | null;
  externalOrderId: string | null;
  externalOrderUrl: string | null;
  href: string;
};

const EMPTY_COUNTS: PurchaseOrderCounts = {
  all: 0,
  draft: 0,
  pending: 0,
  ordered: 0,
  shipped: 0,
  received: 0,
  cancelled: 0,
};

export const purchaseOrdersApi = {
  async list(input: {
    page: number;
    limit: number;
    filter: string;
    orderId?: string;
    supplierId?: string;
  }) {
    const params = new URLSearchParams({
      page: String(input.page),
      limit: String(input.limit),
    });
    if (input.filter !== 'all' && input.filter !== 'waiting') {
      params.set('status', input.filter);
    }
    if (input.orderId) params.set('orderId', input.orderId);
    if (input.supplierId) params.set('supplierId', input.supplierId);
    const data = await apiClient.get<{
      items?: PurchaseOrder[];
      counts?: PurchaseOrderCounts;
      total?: number;
    }>(`/api/purchase-orders?${params}`);
    const counts = data.counts ?? EMPTY_COUNTS;
    const items = input.filter === 'waiting'
      ? (data.items ?? []).filter((order) =>
          order.status === 'draft' || order.status === 'pending')
      : data.items ?? [];
    return {
      items,
      counts,
      total: input.filter === 'waiting'
        ? counts.draft + counts.pending
        : data.total ?? 0,
    };
  },

  updateStatus(input: { purchaseOrderId: string; status: string }) {
    return apiClient.post('/api/purchase-orders', {
      action: 'updateStatus',
      id: input.purchaseOrderId,
      status: input.status,
    });
  },

  delete(purchaseOrderId: string) {
    return apiClient.post('/api/purchase-orders', {
      action: 'delete',
      id: purchaseOrderId,
    });
  },

  submit(input: SubmitPurchaseOrderRequest): Promise<SubmitPurchaseOrderResponse> {
    return apiClient.post('/api/purchase-orders', {
      action: 'submit',
      id: input.purchaseOrderId,
      inventoryOperationId: input.inventoryOperationId,
      idempotencyKey: input.idempotencyKey,
    });
  },

  reconcile(input: {
    purchaseOrderId: string;
    outcome: 'provider_succeeded' | 'provider_failed';
    providerReference?: string | null;
  }) {
    return apiClient.post('/api/purchase-orders', {
      action: 'reconcileSubmission',
      id: input.purchaseOrderId,
      outcome: input.outcome,
      ...(input.providerReference !== undefined && {
        providerReference: input.providerReference,
      }),
    });
  },
};

export function createPurchaseOrderSubmissionIdempotencyKey(): string {
  return createSecureRandomUuid();
}

/**
 * Submission refuses a Sellpia generation that is not fresh. The operator
 * collects inventory and submits again; nothing retries by itself.
 */
export function isSellpiaInventoryCollectionRequired(error: unknown): boolean {
  return isApiError(error) && error.code === 'SELLPIA_SYNC_REQUIRED';
}
