import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { purchaseOrdersApi } from './purchase-orders-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('purchaseOrdersApi', () => {
  it('posts submit and reconciliation actions to the existing route', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'ordered' });

    await purchaseOrdersApi.submit({
      purchaseOrderId: 'po-1',
      inventoryOperationId: 'inventory-attempt-1',
      idempotencyKey: 'stable-key',
    });
    await purchaseOrdersApi.reconcile({
      purchaseOrderId: 'po-1',
      outcome: 'provider_succeeded',
      providerReference: '1688-1',
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/purchase-orders', {
      action: 'submit',
      id: 'po-1',
      inventoryOperationId: 'inventory-attempt-1',
      idempotencyKey: 'stable-key',
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/purchase-orders', {
      action: 'reconcileSubmission',
      id: 'po-1',
      outcome: 'provider_succeeded',
      providerReference: '1688-1',
    });
  });
});
