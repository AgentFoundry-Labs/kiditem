import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { previewRocketPurchases } from './rocket-purchase-preview-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn() },
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';

function input() {
  return {
    channelAccountId: ACCOUNT_ID,
    collection: {
      collectionRunId: RUN_ID,
      vendorId: 'VENDOR-1',
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: 1,
      failedPoNumbers: [],
    },
    rows: [{
      poLineId: '1001:P-1::1',
      poNumber: '1001',
      vendorId: 'VENDOR-1',
      productNo: 'P-1',
      barcode: '',
      productName: 'Rocket item',
      orderQty: 2,
      plannedDeliveryDate: '2026-07-20',
    }],
    editedQuantities: {},
  };
}

describe('previewRocketPurchases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({
      collectionRunId: RUN_ID,
      catalog: null,
      rows: [{
        poLineId: '1001:P-1::1',
        poNumber: '1001',
        productNo: 'P-1',
        productName: 'Rocket item',
        orderQuantity: 2,
        recommendedQuantity: 0,
        maxQuantity: 0,
        editedQuantity: null,
        reason: 'mapping_required',
        channelSkuId: null,
        components: [],
      }],
    });
  });

  it('uses the existing action-body endpoint with no tenant or actor input', async () => {
    await previewRocketPurchases(input());

    expect(apiClient.post).toHaveBeenCalledWith('/api/purchase-orders', {
      action: 'previewRocket',
      ...input(),
    });
    const body = vi.mocked(apiClient.post).mock.calls[0]?.[1];
    expect(body).not.toHaveProperty('organizationId');
    expect(body).not.toHaveProperty('userId');
  });

  it('does not expose a submit, workbook, provider, or reservation API', () => {
    expect(previewRocketPurchases.name).toBe('previewRocketPurchases');
  });
});
