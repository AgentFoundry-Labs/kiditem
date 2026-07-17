import { describe, expect, it } from 'vitest';
import {
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
} from './rocket-purchase-preview';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const MASTER_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_VARIANT_ID = '44444444-4444-4444-8444-444444444444';
const SELLPIA_INVENTORY_SKU_ID = '55555555-5555-4555-8555-555555555555';

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
    }],
    editedQuantities: {},
  };
}

describe('Rocket purchase preview contract', () => {
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
    });

    expect(response.rows[0]?.reason).toBe('collection_incomplete');
    expect(response).not.toHaveProperty('confirmationFile');
    expect(response).not.toHaveProperty('submissionAttempt');
  });

  it('keeps product, variant, and physical Sellpia identities distinct', () => {
    const response = RocketPurchasePreviewResponseSchema.parse({
      collectionRunId: RUN_ID,
      catalog: null,
      rows: [{
        poLineId: request().rows[0]!.poLineId,
        poNumber: '1001',
        productNo: 'P-1',
        productName: '로켓 상품',
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
        rows: [{
          poLineId: request().rows[0]!.poLineId,
          poNumber: '1001',
          productNo: 'P-1',
          productName: '로켓 상품',
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
});
