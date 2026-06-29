import { describe, expect, it } from 'vitest';
import {
  RocketInventoryEventInputSchema,
  SellpiaCandidateResolutionInputSchema,
  SellpiaReceiptUploadBatchSchema,
  SellpiaReceiptUploadBatchStatusSchema,
  SellpiaSnapshotImportResponseSchema,
  SellpiaStockSnapshotItemSchema,
} from './inventory';

describe('Sellpia and Rocket inventory contracts', () => {
  it('accepts row-scoped Sellpia snapshot responses with candidate rows', () => {
    const parsed = SellpiaSnapshotImportResponseSchema.parse({
      snapshot: {
        id: '00000000-0000-4000-8000-000000000001',
        fileName: 'exported-list.xlsx',
        rowCount: 2,
        effectiveExportedAt: '2026-06-29T00:00:00.000Z',
        status: 'previewed',
      },
      summary: {
        matchedCount: 1,
        recommendedCount: 1,
        reviewCount: 0,
        rejectedCount: 0,
        newProductCandidateCount: 1,
      },
      items: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          rowNumber: 2,
          sellpiaProductCode: 'SP-001',
          sellpiaProductName: '테스트 상품',
          sellpiaStock: 12,
          safetyStock: 3,
          barcode: '8801234567890',
          productOptionId: '00000000-0000-4000-8000-000000000003',
          inventoryId: '00000000-0000-4000-8000-000000000004',
          rocketLedgerNet: -2,
          targetCurrentStock: 10,
          kiditemStockBefore: 8,
          diff: 2,
          diffRate: 0.2,
          status: 'recommended',
          blockingReasons: [],
          warningReasons: [],
          operatorTargetStock: null,
          reviewNote: null,
        },
      ],
      newProductCandidates: [
        {
          id: '00000000-0000-4000-8000-000000000005',
          snapshotItemId: '00000000-0000-4000-8000-000000000006',
          sellpiaProductCode: 'SP-NEW',
          sellpiaProductName: '신규 상품',
          sellpiaStock: 4,
          safetyStock: 0,
          barcode: null,
          status: 'pending',
          operatorInitialStock: 4,
        },
      ],
    });

    expect(parsed.summary.newProductCandidateCount).toBe(1);
    expect(parsed.items[0]?.targetCurrentStock).toBe(10);
  });

  it('requires a reason for Rocket issue over the open reservation', () => {
    expect(() =>
      RocketInventoryEventInputSchema.parse({
        inventoryId: '00000000-0000-4000-8000-000000000001',
        optionId: '00000000-0000-4000-8000-000000000002',
        eventType: 'issue',
        quantity: 5,
        sourceActionId: 'rocket-po-1-line-1-issue',
        sourceType: 'rocket_shipment',
        sourceRef: 'PO-1/line-1',
        openReservationQty: 3,
        allowOverReservation: true,
      }),
    ).toThrow();

    expect(
      RocketInventoryEventInputSchema.parse({
        inventoryId: '00000000-0000-4000-8000-000000000001',
        optionId: '00000000-0000-4000-8000-000000000002',
        eventType: 'issue',
        quantity: 5,
        sourceActionId: 'rocket-po-1-line-1-issue',
        sourceType: 'rocket_shipment',
        sourceRef: 'PO-1/line-1',
        openReservationQty: 3,
        allowOverReservation: true,
        overrideReason: 'shipment quantity corrected after manual count',
      }).overrideReason,
    ).toBe('shipment quantity corrected after manual count');
  });

  it('models new product candidate resolution with editable initial stock', () => {
    const parsed = SellpiaCandidateResolutionInputSchema.parse({
      action: 'create_product',
      masterName: '신규 상품',
      optionName: '단품',
      sku: 'SP-NEW',
      barcode: '8801234567890',
      operatorInitialStock: 7,
      note: 'Sellpia row confirmed',
    });

    expect(parsed.operatorInitialStock).toBe(7);
  });

  it('does not allow negative target stock on snapshot items', () => {
    expect(() =>
      SellpiaStockSnapshotItemSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
        rowNumber: 2,
        sellpiaProductCode: 'SP-001',
        sellpiaProductName: '테스트 상품',
        sellpiaStock: 1,
        safetyStock: 0,
        barcode: null,
        productOptionId: null,
        inventoryId: null,
        rocketLedgerNet: -3,
        targetCurrentStock: -2,
        kiditemStockBefore: 0,
        diff: -2,
        diffRate: 1,
        status: 'rejected',
        blockingReasons: ['negative_target_stock'],
        warningReasons: [],
        operatorTargetStock: null,
        reviewNote: null,
      }),
    ).toThrow();
  });

  it('tracks receipt upload batches while the official Sellpia template is pending', () => {
    const parsed = SellpiaReceiptUploadBatchSchema.parse({
      id: '00000000-0000-4000-8000-000000000007',
      status: 'template_pending',
      sourceType: 'purchase_receipt',
      sourceRef: 'receipt-20260629-1',
      templateVersion: null,
      uploadedAt: null,
      note: null,
      createdAt: '2026-06-29T00:00:00.000Z',
    });

    expect(SellpiaReceiptUploadBatchStatusSchema.options).toContain('pending_upload');
    expect(parsed.status).toBe('template_pending');
  });
});
