import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RocketWorkbookExportService } from '../rocket-purchase-confirmation.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';
const collectionRunId = '44444444-4444-4444-8444-444444444444';
const sourceImportRunId = '55555555-5555-4555-8555-555555555555';
const idempotencyKey = '66666666-6666-4666-8666-666666666666';
const poLineId = '1001:P-1:8801234567890:1';
const artifactBytes = Buffer.from('workbook-bytes');

function request() {
  return {
    idempotencyKey,
    channelAccountId,
    collection: {
      collectionRunId,
      vendorId: 'VENDOR-1',
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: 1,
      failedPoNumbers: [],
    },
    rows: [{
      poLineId,
      poNumber: '1001',
      vendorId: 'VENDOR-1',
      productNo: 'P-1',
      barcode: '8801234567890',
      productName: 'Rocket item',
      orderQty: 4,
      plannedDeliveryDate: '2026-07-20',
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
        totalPurchase: 3_960,
        poRegisteredAt: '2026-07-17 09:00:00',
        xdock: 'N',
      },
    }],
    editedQuantities: { [poLineId]: 2 },
    shortageReasons: { [poLineId]: '협력사 재고부족 - 수요예측 오류' as const },
    artifactFileName: '쿠팡_로켓.xlsx',
    artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
  };
}

function previewResult() {
  return {
    collectionRunId,
    catalog: {
      run: { id: sourceImportRunId },
      duplicate: false,
      changes: {},
    },
    inventoryGeneration: '12',
    rows: [{
      poLineId,
      poNumber: '1001',
      productNo: 'P-1',
      productName: 'Rocket item',
      plannedDeliveryDate: '2026-07-20',
      orderQuantity: 4,
      recommendedQuantity: 2,
      maxQuantity: 4,
      editedQuantity: 2,
      reason: 'insufficient_capacity' as const,
      channelSkuId: '77777777-7777-4777-8777-777777777777',
      masterProductId: '88888888-8888-4888-8888-888888888888',
      productVariantId: '99999999-9999-4999-8999-999999999999',
      components: [{
        sellpiaInventorySkuId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        quantity: 1,
        currentStock: 5,
        isActive: true,
      }],
    }],
  };
}

function dependencies() {
  const preview = { preview: vi.fn().mockResolvedValue(previewResult()) };
  const transactions = {
    exportWorkbook: vi.fn().mockResolvedValue({
      exportId: idempotencyKey,
      status: 'awaiting_coupang_confirmation',
      duplicate: false,
      canAbandon: false,
      inventoryGeneration: '12',
      generatedAt: '2026-07-17T00:00:00.000Z',
      artifact: {
        fileName: '쿠팡_로켓.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sha256: 'a'.repeat(64),
        byteLength: artifactBytes.byteLength,
      },
      totals: {
        lineCount: 1,
        orderQuantity: 4,
        workbookQuantity: 2,
        componentQuantity: 2,
      },
      rows: [{
        poLineId,
        workbookQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    }),
    getActiveWorkflow: vi.fn().mockResolvedValue(null),
    downloadWorkbook: vi.fn().mockResolvedValue({
      fileName: '쿠팡_로켓.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: artifactBytes,
    }),
    abandonWorkbook: vi.fn(),
  };
  return { preview, transactions };
}

describe('RocketWorkbookExportService', () => {
  it('recomputes the canonical preview and delegates the normalized decision', async () => {
    const deps = dependencies();
    const service = new RocketWorkbookExportService(
      deps.preview as never,
      deps.transactions as never,
    );

    const result = await service.exportWorkbook({
      organizationId,
      userId,
      request: request(),
      artifactBytes,
    });

    const {
      idempotencyKey: _key,
      shortageReasons: _reasons,
      artifactFileName: _fileName,
      artifactContentType: _contentType,
      ...previewRequest
    } = request();
    expect(deps.preview.preview).toHaveBeenCalledWith({
      organizationId,
      userId,
      request: previewRequest,
    });
    expect(deps.transactions.exportWorkbook).toHaveBeenCalledWith({
      organizationId,
      userId,
      sourceImportRunId,
      request: request(),
      preview: previewResult(),
      artifactBytes,
    });
    expect(result).toMatchObject({
      status: 'awaiting_coupang_confirmation',
      duplicate: false,
    });
  });

  it('rejects an incomplete or vendor-mismatched collection before persistence', async () => {
    const deps = dependencies();
    deps.preview.preview.mockResolvedValue({
      ...previewResult(),
      catalog: null,
      inventoryGeneration: null,
      rows: [{
        ...previewResult().rows[0],
        editedQuantity: 0,
        recommendedQuantity: 0,
        maxQuantity: 0,
        reason: 'collection_incomplete',
        channelSkuId: null,
        masterProductId: null,
        productVariantId: null,
        components: [],
      }],
    });
    const service = new RocketWorkbookExportService(
      deps.preview as never,
      deps.transactions as never,
    );

    await expect(service.exportWorkbook({
      organizationId,
      userId,
      request: {
        ...request(),
        editedQuantities: { [poLineId]: 0 },
      },
      artifactBytes,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.transactions.exportWorkbook).not.toHaveBeenCalled();
  });

  it.each([
    'mapping_required',
    'configuration_required',
    'review_required',
  ] as const)('rejects %s before persistence', async (reason) => {
    const deps = dependencies();
    deps.preview.preview.mockResolvedValue({
      ...previewResult(),
      rows: [{
        ...previewResult().rows[0],
        editedQuantity: 0,
        recommendedQuantity: 0,
        maxQuantity: 0,
        reason,
        channelSkuId: reason === 'mapping_required' ? null : previewResult().rows[0]!.channelSkuId,
        masterProductId: reason === 'mapping_required' ? null : previewResult().rows[0]!.masterProductId,
        productVariantId: reason === 'mapping_required' ? null : previewResult().rows[0]!.productVariantId,
        components: [],
      }],
    });
    const service = new RocketWorkbookExportService(
      deps.preview as never,
      deps.transactions as never,
    );

    await expect(service.exportWorkbook({
      organizationId,
      userId,
      request: {
        ...request(),
        editedQuantities: { [poLineId]: 0 },
      },
      artifactBytes,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.transactions.exportWorkbook).not.toHaveBeenCalled();
  });

  it('reads the exact stored artifact through the organization boundary', async () => {
    const deps = dependencies();
    const service = new RocketWorkbookExportService(
      deps.preview as never,
      deps.transactions as never,
    );

    const result = await service.downloadWorkbook({
      organizationId,
      exportId: idempotencyKey,
    });

    expect(deps.transactions.downloadWorkbook).toHaveBeenCalledWith({
      organizationId,
      exportId: idempotencyKey,
    });
    expect(result.bytes).toEqual(artifactBytes);
  });
});
