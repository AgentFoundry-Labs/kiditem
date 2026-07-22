import { describe, expect, it } from 'vitest';
import {
  isRocketConfirmationBlockingReason,
  ROCKET_CONFIRMATION_BLOCKING_REASONS,
  RocketPurchaseConfirmationRequestSchema,
  RocketPurchaseConfirmationReleaseRequestSchema,
  RocketPurchaseConfirmationResponseSchema,
  RocketPoCatalogPublicationSchema,
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
  RocketSavedPoCollectionSchema,
  RocketSavedPoListRequestSchema,
  RocketSavedPoSummarySchema,
} from './rocket-purchase-preview';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const MASTER_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_VARIANT_ID = '44444444-4444-4444-8444-444444444444';
const SELLPIA_INVENTORY_SKU_ID = '55555555-5555-4555-8555-555555555555';
const CONFIRMATION_ID = '66666666-6666-4666-8666-666666666666';

function request() {
  return {
    channelAccountId: ACCOUNT_ID,
    collection: {
      collectionRunId: RUN_ID,
      vendorId: 'A00123',
      listPagesRead: 1,
      totalListPages: 1,
      truncated: false,
      detailPoCount: 1,
      failedPoNumbers: [],
    },
    rows: [{
      poLineId: '1001:P-1:8801234567890:1',
      poNumber: '1001',
      vendorId: 'A00123',
      productNo: 'P-1',
      barcode: '8801234567890',
      productName: '로켓 상품',
      orderQty: 4,
      plannedDeliveryDate: '2026-07-20',
      confirmation: {
        center: '덕평1센터',
        inboundType: '택배',
        poStatus: '거래처확인요청',
        returnManager: '담당자',
        returnContact: '010-0000-0000',
        returnAddress: '서울시',
        purchasePrice: 1_000,
        supplyPrice: 900,
        vat: 90,
        totalPurchase: 3_960,
        poRegisteredAt: '2026-07-17 09:00:00',
        xdock: 'N',
      },
    }],
    editedQuantities: {},
  };
}

describe('Rocket purchase preview contract', () => {
  it('defines the exact reasons that block official confirmation', () => {
    expect(ROCKET_CONFIRMATION_BLOCKING_REASONS).toEqual([
      'mapping_required',
      'configuration_required',
      'review_required',
    ]);
    expect(isRocketConfirmationBlockingReason('mapping_required')).toBe(true);
    expect(isRocketConfirmationBlockingReason('configuration_required')).toBe(true);
    expect(isRocketConfirmationBlockingReason('review_required')).toBe(true);
    expect(isRocketConfirmationBlockingReason('insufficient_capacity')).toBe(false);
    expect(isRocketConfirmationBlockingReason(null)).toBe(false);
  });

  it('publishes the scoped deterministic recipe automation result with the Rocket catalog', () => {
    const publication = RocketPoCatalogPublicationSchema.parse({
      run: {
        id: RUN_ID,
        sourceType: 'coupang_rocket_po_catalog',
        channelAccountId: ACCOUNT_ID,
        fileName: 'rocket-po-catalog.json',
        fileHash: 'a'.repeat(64),
        status: 'completed',
        rowCount: 1,
        importedAt: '2026-07-19T00:00:00.000Z',
        lastVerifiedAt: null,
        verificationCount: 0,
        lastTrigger: null,
        freshnessGeneration: null,
        manualFreshExportConfirmedAt: null,
        manualFreshExportConfirmedBy: null,
        qualityReport: null,
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-07-19T00:00:00.000Z',
        updatedAt: '2026-07-19T00:00:00.000Z',
      },
      duplicate: false,
      changes: {
        createdProductCount: 1,
        updatedProductCount: 0,
        createdSkuCount: 1,
        updatedSkuCount: 0,
      },
      recipeAutomation: {
        evaluatedProducts: 1,
        appliedProducts: 1,
        appliedVariants: 1,
        affectedOptions: 1,
        operatorReviewProducts: 0,
        blockedProducts: 0,
        alreadyConfiguredProducts: 0,
        skippedExistingVariants: 0,
      },
    });

    expect(publication.recipeAutomation).toMatchObject({
      appliedProducts: 1,
      appliedVariants: 1,
    });
  });

  it('parses account-scoped saved PO summaries and exact saved collection evidence', () => {
    const summary = RocketSavedPoSummarySchema.parse({
      sourceImportRunId: RUN_ID,
      poNumber: '10000001',
      orderedAt: '2026-07-18 09:00:00',
      plannedDeliveryDate: '2026-07-20',
      status: '거래처확인요청',
      vendorId: 'A00123',
      centerName: '덕평1센터',
      inboundType: '택배',
      firstProductName: '키즈 식판',
      skuCount: 2,
      orderQuantity: 8,
      orderAmount: 79_200,
      collectedAt: '2026-07-18T01:00:00.000Z',
    });
    const collection = RocketSavedPoCollectionSchema.parse({
      sourceImportRunId: RUN_ID,
      channelAccountId: ACCOUNT_ID,
      collection: request().collection,
      rows: request().rows,
    });

    expect(summary.poNumber).toBe('10000001');
    expect(collection.rows).toEqual(request().rows);
  });

  it('rejects malformed or reversed saved PO list ranges', () => {
    expect(() => RocketSavedPoListRequestSchema.parse({
      channelAccountId: ACCOUNT_ID,
      from: '2026/07/01',
      to: '2026-07-31',
    })).toThrow();
    expect(() => RocketSavedPoListRequestSchema.parse({
      channelAccountId: ACCOUNT_ID,
      from: '2026-07-31',
      to: '2026-07-01',
    })).toThrow(/on or after/i);
  });

  it('accepts bounded completeness evidence and a strict client request', () => {
    expect(RocketPurchasePreviewRequestSchema.parse(request())).toEqual(request());
    expect(() => RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      organizationId: ACCOUNT_ID,
    })).toThrow();
    expect(() => RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      userId: ACCOUNT_ID,
    })).toThrow();
  });

  it('accepts only the bounded source fields required to render the Coupang confirmation workbook', () => {
    const row = RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      rows: [{
        ...request().rows[0],
        confirmation: {
          center: '덕평1센터',
          inboundType: '택배',
          poStatus: '거래처확인요청',
          returnManager: '담당자',
          returnContact: '010-0000-0000',
          returnAddress: '서울시',
          purchasePrice: 1_000,
          supplyPrice: 900,
          vat: 90,
          totalPurchase: 3_960,
          poRegisteredAt: '2026-07-17 09:00:00',
          xdock: 'N',
        },
      }],
    }).rows[0];

    expect(row?.confirmation).toMatchObject({ center: '덕평1센터', purchasePrice: 1_000 });
    expect(() => RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      rows: [{
        ...request().rows[0],
        confirmation: { sessionToken: 'secret' },
      }],
    })).toThrow();
  });

  it('enforces the 20 list-page and 40 detail-page collection bounds', () => {
    expect(() => RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      collection: { ...request().collection, listPagesRead: 21 },
    })).toThrow();
    expect(() => RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      collection: { ...request().collection, detailPoCount: 41 },
    })).toThrow();
    expect(() => RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      collection: {
        ...request().collection,
        failedPoNumbers: Array.from({ length: 41 }, (_, index) => String(index)),
      },
    })).toThrow();
  });

  it('requires stable unique PO line IDs and edited quantities for known lines only', () => {
    const duplicate = request();
    duplicate.rows.push({ ...duplicate.rows[0]! });
    expect(() => RocketPurchasePreviewRequestSchema.parse(duplicate)).toThrow();

    expect(() => RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      editedQuantities: { missing: 1 },
    })).toThrow();
  });

  it('accepts an explicit joint clamp request while keeping strict mode as the default', () => {
    expect(RocketPurchasePreviewRequestSchema.parse(request()))
      .not.toHaveProperty('clampEditedQuantities');
    expect(RocketPurchasePreviewRequestSchema.parse({
      ...request(),
      clampEditedQuantities: true,
    })).toMatchObject({ clampEditedQuantities: true });
  });

  it('parses preview-only row reasons without a submission or artifact payload', () => {
    const response = RocketPurchasePreviewResponseSchema.parse({
      collectionRunId: RUN_ID,
      catalog: null,
      inventoryGeneration: null,
      rows: [{
        poLineId: request().rows[0]!.poLineId,
        poNumber: '1001',
        productNo: 'P-1',
        productName: '로켓 상품',
        plannedDeliveryDate: '2026-07-20',
        orderQuantity: 4,
        recommendedQuantity: 0,
        maxQuantity: 0,
        editedQuantity: null,
        reason: 'collection_incomplete',
        channelSkuId: null,
        masterProductId: null,
        productVariantId: null,
        components: [],
      }],
    });

    expect(response.rows[0]?.reason).toBe('collection_incomplete');
    expect(response).not.toHaveProperty('confirmationFile');
    expect(response).not.toHaveProperty('submissionAttempt');
  });

  it('keeps product, variant, and physical Sellpia identities distinct', () => {
    const response = RocketPurchasePreviewResponseSchema.parse({
      collectionRunId: RUN_ID,
      catalog: null,
      inventoryGeneration: '12',
      rows: [{
        poLineId: request().rows[0]!.poLineId,
        poNumber: '1001',
        productNo: 'P-1',
        productName: '로켓 상품',
        plannedDeliveryDate: '2026-07-20',
        orderQuantity: 4,
        recommendedQuantity: 4,
        maxQuantity: 5,
        editedQuantity: null,
        reason: null,
        channelSkuId: ACCOUNT_ID,
        masterProductId: MASTER_PRODUCT_ID,
        productVariantId: PRODUCT_VARIANT_ID,
        components: [{
          sellpiaInventorySkuId: SELLPIA_INVENTORY_SKU_ID,
          quantity: 1,
          currentStock: 5,
          activeCommitmentQuantity: 1,
          availableStock: 4,
          isActive: true,
        }],
      }],
    });

    expect(response.rows[0]).toMatchObject({
      masterProductId: MASTER_PRODUCT_ID,
      productVariantId: PRODUCT_VARIANT_ID,
      components: [{ sellpiaInventorySkuId: SELLPIA_INVENTORY_SKU_ID }],
    });
    expect(response.rows[0]?.components[0]).not.toHaveProperty('masterProductId');
  });

  it.each(['configuration_required', 'review_required'] as const)(
    'accepts the central recipe warning reason %s',
    (reason) => {
      const parsed = RocketPurchasePreviewResponseSchema.parse({
        collectionRunId: RUN_ID,
        catalog: null,
        inventoryGeneration: null,
        rows: [{
          poLineId: request().rows[0]!.poLineId,
          poNumber: '1001',
          productNo: 'P-1',
          productName: '로켓 상품',
          plannedDeliveryDate: '2026-07-20',
          orderQuantity: 4,
          recommendedQuantity: 0,
          maxQuantity: 0,
          editedQuantity: null,
          reason,
          channelSkuId: ACCOUNT_ID,
          masterProductId: MASTER_PRODUCT_ID,
          productVariantId: PRODUCT_VARIANT_ID,
          components: [],
        }],
      });

      expect(parsed.rows[0]?.reason).toBe(reason);
    },
  );

  it('requires the planned delivery date in preview responses', () => {
    expect(() => RocketPurchasePreviewResponseSchema.parse({
      collectionRunId: RUN_ID,
      catalog: null,
      inventoryGeneration: null,
      rows: [{
        poLineId: request().rows[0]!.poLineId,
        poNumber: '1001',
        productNo: 'P-1',
        productName: '로켓 상품',
        orderQuantity: 4,
        recommendedQuantity: 0,
        maxQuantity: 0,
        editedQuantity: null,
        reason: 'collection_incomplete',
        channelSkuId: null,
        masterProductId: null,
        productVariantId: null,
        components: [],
      }],
    })).toThrow(/plannedDeliveryDate/i);
  });

  it('rejects component availability that is inconsistent with active commitments', () => {
    expect(() => RocketPurchasePreviewResponseSchema.parse({
      collectionRunId: RUN_ID,
      catalog: null,
      inventoryGeneration: '12',
      rows: [{
        poLineId: request().rows[0]!.poLineId,
        poNumber: '1001',
        productNo: 'P-1',
        productName: '로켓 상품',
        plannedDeliveryDate: '2026-07-20',
        orderQuantity: 4,
        recommendedQuantity: 4,
        maxQuantity: 5,
        editedQuantity: null,
        reason: null,
        channelSkuId: ACCOUNT_ID,
        masterProductId: MASTER_PRODUCT_ID,
        productVariantId: PRODUCT_VARIANT_ID,
        components: [{
          sellpiaInventorySkuId: SELLPIA_INVENTORY_SKU_ID,
          quantity: 1,
          currentStock: 5,
          activeCommitmentQuantity: 1,
          availableStock: 5,
          isActive: true,
        }],
      }],
    })).toThrow(/availableStock/i);
  });

  it('requires an explicit reviewed quantity and shortage reason for every confirmation line', () => {
    const poLineId = request().rows[0]!.poLineId;
    expect(RocketPurchaseConfirmationRequestSchema.parse({
      ...request(),
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 2 },
      shortageReasons: { [poLineId]: '협력사 재고부족 - 수요예측 오류' },
    })).toMatchObject({
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 2 },
    });

    expect(() => RocketPurchaseConfirmationRequestSchema.parse({
      ...request(),
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: {},
      shortageReasons: {},
    })).toThrow(/reviewed quantity/i);

    expect(() => RocketPurchaseConfirmationRequestSchema.parse({
      ...request(),
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 2 },
      shortageReasons: {},
    })).toThrow(/shortage reason/i);

    expect(() => RocketPurchaseConfirmationRequestSchema.parse({
      ...request(),
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 5 },
      shortageReasons: {},
    })).toThrow(/order quantity/i);

    expect(() => RocketPurchaseConfirmationRequestSchema.parse({
      ...request(),
      rows: [{ ...request().rows[0], confirmation: undefined }],
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 2 },
      shortageReasons: { [poLineId]: '협력사 재고부족 - 수요예측 오류' },
    })).toThrow(/workbook evidence/i);
  });

  it('publishes a normalized confirmation result without raw workbook rows', () => {
    const response = RocketPurchaseConfirmationResponseSchema.parse({
      confirmationId: CONFIRMATION_ID,
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
        poLineId: request().rows[0]!.poLineId,
        confirmedQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    });

    expect(response.status).toBe('active');
    expect(response).not.toHaveProperty('rawRows');
    expect(response).not.toHaveProperty('workbook');
  });

  it('requires an explicit audit reason to release reserved capacity', () => {
    expect(RocketPurchaseConfirmationReleaseRequestSchema.parse({
      confirmationId: CONFIRMATION_ID,
      reason: '쿠팡 확정 수량 정정',
    })).toEqual({
      confirmationId: CONFIRMATION_ID,
      reason: '쿠팡 확정 수량 정정',
    });
    expect(() => RocketPurchaseConfirmationReleaseRequestSchema.parse({
      confirmationId: CONFIRMATION_ID,
      reason: ' ',
    })).toThrow();
  });
});
