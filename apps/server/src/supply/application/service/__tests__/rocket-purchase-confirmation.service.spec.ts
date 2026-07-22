import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RocketPurchaseConfirmationService } from '../rocket-purchase-confirmation.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const channelAccountId = '33333333-3333-4333-8333-333333333333';
const collectionRunId = '44444444-4444-4444-8444-444444444444';
const sourceImportRunId = '55555555-5555-4555-8555-555555555555';
const idempotencyKey = '66666666-6666-4666-8666-666666666666';
const poLineId = '1001:P-1:8801234567890:1';

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
        activeCommitmentQuantity: 0,
        availableStock: 5,
        isActive: true,
      }],
    }],
  };
}

function dependencies() {
  const preview = { preview: vi.fn().mockResolvedValue(previewResult()) };
  const transactions = {
    confirm: vi.fn().mockResolvedValue({
      confirmationId: idempotencyKey,
      status: 'active',
      duplicate: false,
      inventoryGeneration: '12',
      confirmedAt: '2026-07-17T00:00:00.000Z',
      totals: {
        lineCount: 1,
        orderQuantity: 4,
        confirmedQuantity: 2,
        allocatedQuantity: 2,
      },
      rows: [{
        poLineId,
        confirmedQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    }),
    release: vi.fn().mockResolvedValue({
      confirmationId: idempotencyKey,
      status: 'released',
      duplicate: false,
      inventoryGeneration: '12',
      confirmedAt: '2026-07-17T00:00:00.000Z',
      totals: {
        lineCount: 1,
        orderQuantity: 4,
        confirmedQuantity: 2,
        allocatedQuantity: 2,
      },
      rows: [{
        poLineId,
        confirmedQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    }),
  };
  return { preview, transactions };
}

describe('RocketPurchaseConfirmationService', () => {
  it('recomputes the canonical preview and delegates the normalized decision', async () => {
    const deps = dependencies();
    const service = new RocketPurchaseConfirmationService(
      deps.preview as never,
      deps.transactions as never,
    );

    const result = await service.confirm({
      organizationId,
      userId,
      request: request(),
    });

    const { idempotencyKey: _key, shortageReasons: _reasons, ...previewRequest } = request();
    expect(deps.preview.preview).toHaveBeenCalledWith({
      organizationId,
      userId,
      request: previewRequest,
    });
    expect(deps.transactions.confirm).toHaveBeenCalledWith({
      organizationId,
      userId,
      sourceImportRunId,
      request: request(),
      preview: previewResult(),
    });
    expect(result).toMatchObject({ status: 'active', duplicate: false });
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
    const service = new RocketPurchaseConfirmationService(
      deps.preview as never,
      deps.transactions as never,
    );

    await expect(service.confirm({
      organizationId,
      userId,
      request: {
        ...request(),
        editedQuantities: { [poLineId]: 0 },
      },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.transactions.confirm).not.toHaveBeenCalled();
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
    const service = new RocketPurchaseConfirmationService(
      deps.preview as never,
      deps.transactions as never,
    );

    await expect(service.confirm({
      organizationId,
      userId,
      request: {
        ...request(),
        editedQuantities: { [poLineId]: 0 },
      },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.transactions.confirm).not.toHaveBeenCalled();
  });

  it('releases capacity through the authenticated Supply transaction', async () => {
    const deps = dependencies();
    const service = new RocketPurchaseConfirmationService(
      deps.preview as never,
      deps.transactions as never,
    );

    const result = await service.release({
      organizationId,
      userId,
      request: {
        confirmationId: idempotencyKey,
        reason: '쿠팡 확정 수량 정정',
      },
    });

    expect(deps.transactions.release).toHaveBeenCalledWith({
      organizationId,
      userId,
      confirmationId: idempotencyKey,
      reason: '쿠팡 확정 수량 정정',
    });
    expect(result.status).toBe('released');
  });
});
