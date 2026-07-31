import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROCKET_SAVED_PO_RESPONSE_PROFILE } from '@kiditem/shared/rocket-purchase-preview';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import {
  listSavedRocketPos,
  loadSavedRocketCollection,
  previewRocketPurchases,
  rocketPreviewErrorMessage,
} from './rocket-purchase-preview-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn(), fetchRaw: vi.fn() },
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
      status: 'ready',
      collectionRunId: RUN_ID,
      catalog: null,
      inventoryGeneration: null,
      rows: [{
        poLineId: '1001:P-1::1',
        poNumber: '1001',
        productNo: 'P-1',
        productName: 'Rocket item',
        plannedDeliveryDate: '2026-07-20',
        orderQuantity: 2,
        recommendedQuantity: 0,
        maxQuantity: 0,
        editedQuantity: null,
        reason: 'mapping_required',
        channelSkuId: null,
        masterProductId: null,
        productVariantId: null,
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

  it('requests fresh inventory only when the caller explicitly requires it', async () => {
    await previewRocketPurchases(input(), { inventoryRequirement: 'fresh' });

    expect(apiClient.post).toHaveBeenCalledWith('/api/purchase-orders', {
      action: 'previewRocket',
      inventoryRequirement: 'fresh',
      ...input(),
    });
  });

  it('parses a freshness-pending checkpoint with advisory rows', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      status: 'freshness_pending',
      collectionRunId: RUN_ID,
      catalog: publication(),
      requestedGeneration: '8',
      rows: [],
    });

    await expect(previewRocketPurchases(input())).resolves.toMatchObject({
      status: 'freshness_pending',
      requestedGeneration: '8',
      rows: [],
    });
  });

  it('translates the stale inventory gate and preserves ordinary API messages', () => {
    expect(rocketPreviewErrorMessage(
      new ApiError(409, 'SELLPIA_SYNC_REQUIRED', 'stale'),
      'fallback',
    )).toContain('셀피아 재고 스냅샷이 최신이 아니어서');
    expect(rocketPreviewErrorMessage(
      new ApiError(409, 'SELLPIA_SYNC_REQUIRED', 'stale'),
      'fallback',
    )).not.toContain('자동으로 다시 계산');
    expect(rocketPreviewErrorMessage(
      new ApiError(409, 'OTHER', '서버 메시지'),
      'fallback',
    )).toBe('서버 메시지');
    expect(rocketPreviewErrorMessage({}, 'fallback')).toBe('조회 실패');
  });

  it('lists and loads server-saved Rocket evidence through account-scoped actions', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce([{
      sourceImportRunId: RUN_ID,
      poNumber: '1001',
      orderedAt: '2026-07-17 09:00:00',
      plannedDeliveryDate: '2026-07-20',
      status: '거래처확인요청',
      vendorId: 'VENDOR-1',
      centerName: '덕평1센터',
      inboundType: '택배',
      firstProductName: 'Rocket item',
      skuCount: 1,
      orderQuantity: 2,
      orderAmount: 1_980,
      collectedAt: '2026-07-18T01:00:00.000Z',
    }]);
    await listSavedRocketPos({
      channelAccountId: ACCOUNT_ID,
      from: '2026-07-01',
      to: '2026-07-31',
      status: '거래처확인요청',
    });
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/purchase-orders', {
      action: 'listSavedRocketPos',
      channelAccountId: ACCOUNT_ID,
      from: '2026-07-01',
      to: '2026-07-31',
      rocketStatus: '거래처확인요청',
    }, {
      headers: { 'X-KidItem-Response-Profile': ROCKET_SAVED_PO_RESPONSE_PROFILE },
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      sourceImportRunId: RUN_ID,
      channelAccountId: ACCOUNT_ID,
      collection: input().collection,
      rows: input().rows,
      exportedPoLineIds: [],
    });
    await loadSavedRocketCollection({
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: RUN_ID,
    });
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/purchase-orders', {
      action: 'loadSavedRocketCollection',
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: RUN_ID,
    }, {
      headers: { 'X-KidItem-Response-Profile': ROCKET_SAVED_PO_RESPONSE_PROFILE },
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      sourceImportRunId: RUN_ID,
      channelAccountId: ACCOUNT_ID,
      collection: input().collection,
      rows: input().rows,
    });
    await expect(loadSavedRocketCollection({
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: RUN_ID,
    })).resolves.toMatchObject({ exportedPoLineIds: [] });
  });
});

function publication() {
  return {
    run: {
      id: '33333333-3333-4333-8333-333333333333',
      sourceType: 'coupang_rocket_po_catalog',
      channelAccountId: ACCOUNT_ID,
      fileName: 'rocket-po-catalog.json',
      fileHash: 'a'.repeat(64),
      status: 'completed',
      rowCount: 1,
      importedAt: '2026-07-27T00:00:00.000Z',
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: null,
      freshnessGeneration: null,
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
    },
    duplicate: false,
    changes: {
      createdProductCount: 0,
      updatedProductCount: 0,
      createdSkuCount: 0,
      updatedSkuCount: 0,
    },
    recipeAutomation: {
      evaluatedProducts: 0,
      appliedProducts: 0,
      appliedVariants: 0,
      affectedOptions: 0,
      quantityReviewProducts: 0,
      operatorReviewProducts: 0,
      blockedProducts: 0,
      alreadyConfiguredProducts: 0,
      skippedExistingVariants: 0,
    },
  };
}
