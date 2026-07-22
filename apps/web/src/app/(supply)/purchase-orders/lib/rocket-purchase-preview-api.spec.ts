import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  abandonRocketWorkbook,
  downloadRocketWorkbook,
  exportRocketWorkbook,
  getActiveRocketWorkbook,
  listSavedRocketPos,
  loadSavedRocketCollection,
  previewRocketPurchases,
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

  it('uses explicit Supply actions for exact workbook export, lookup, download, and abandon', async () => {
    const workbookRequest = {
      ...input(),
      rows: [{
        ...input().rows[0]!,
        poLineId: '1001:P-1:8800000000001:1',
        barcode: '8800000000001',
        confirmation: {
          center: '덕평1센터',
          inboundType: '택배',
          poStatus: '거래처확인요청',
          returnManager: '',
          returnContact: '',
          returnAddress: '',
          purchasePrice: 1_000,
          supplyPrice: 900,
          vat: 90,
          totalPurchase: 1_980,
          poRegisteredAt: '2026-07-17 09:00:00',
          xdock: 'N',
        },
      }],
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      editedQuantities: { '1001:P-1:8800000000001:1': 1 },
      shortageReasons: {
        '1001:P-1:8800000000001:1': '협력사 재고부족 - 수요예측 오류' as const,
      },
      artifactFileName: '쿠팡_로켓.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
    };
    const exportResponse = {
      exportId: '44444444-4444-4444-8444-444444444444',
      status: 'awaiting_coupang_confirmation',
      duplicate: false,
      canAbandon: false,
      inventoryGeneration: '12',
      generatedAt: '2026-07-17T00:00:00.000Z',
      artifact: {
        fileName: '쿠팡_로켓.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sha256: 'a'.repeat(64),
        byteLength: 8,
      },
      totals: {
        lineCount: 1,
        orderQuantity: 2,
        workbookQuantity: 1,
        componentQuantity: 1,
      },
      rows: [{
        poLineId: workbookRequest.rows[0]!.poLineId,
        workbookQuantity: 1,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    };
    vi.mocked(apiClient.fetchRaw).mockResolvedValueOnce(new Response(
      JSON.stringify(exportResponse),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await exportRocketWorkbook(workbookRequest, new Blob(['workbook']));
    const exportCall = vi.mocked(apiClient.fetchRaw).mock.calls[0]!;
    expect(exportCall[0]).toBe('/api/purchase-orders');
    expect(exportCall[1]).toMatchObject({ method: 'POST', body: expect.any(FormData) });
    const formData = exportCall[1]!.body as FormData;
    expect(formData.get('action')).toBe('exportRocketWorkbook');
    expect(JSON.parse(String(formData.get('requestJson')))).toEqual(workbookRequest);

    vi.mocked(apiClient.post).mockResolvedValueOnce(exportResponse);
    await getActiveRocketWorkbook();
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/purchase-orders', {
      action: 'getActiveRocketWorkbook',
    });

    vi.mocked(apiClient.fetchRaw).mockResolvedValueOnce(new Response('workbook', {
      status: 200,
      headers: { 'Content-Disposition': "attachment; filename*=UTF-8''rocket.xlsx" },
    }));
    await expect(downloadRocketWorkbook(exportResponse.exportId)).resolves.toMatchObject({
      fileName: 'rocket.xlsx',
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce({ ...exportResponse, status: 'completed' });
    await abandonRocketWorkbook({
      exportId: exportResponse.exportId,
      reason: '쿠팡에서 발주확정되지 않음',
    });
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/purchase-orders', {
      action: 'abandonRocketWorkbook',
      exportId: exportResponse.exportId,
      abandonReason: '쿠팡에서 발주확정되지 않음',
    });
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
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      sourceImportRunId: RUN_ID,
      channelAccountId: ACCOUNT_ID,
      collection: input().collection,
      rows: input().rows,
    });
    await loadSavedRocketCollection({
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: RUN_ID,
    });
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/purchase-orders', {
      action: 'loadSavedRocketCollection',
      channelAccountId: ACCOUNT_ID,
      sourceImportRunId: RUN_ID,
    });
  });
});
