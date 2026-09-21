import { describe, expect, it } from 'vitest';
import {
  isRocketWorkbookBlockingReason,
  ROCKET_CONFIRMATION_REQUEST_STATUSES,
  ROCKET_WORKBOOK_BLOCKING_REASONS,
  RocketPurchasePreviewComponentSchema,
  RocketWorkbookAbandonRequestSchema,
  RocketWorkbookDecisionRequestSchema,
  RocketWorkbookExportResponseSchema,
  RocketPoCatalogPublicationSchema,
  RocketPurchasePreviewDecisionSchema,
  RocketPurchasePreviewReasonSchema,
  RocketPurchasePreviewResponseSchema,
  RocketSavedPoCollectionSchema,
  RocketSavedPoListRequestSchema,
  RocketSavedPoSummarySchema,
} from './rocket-purchase-preview';
import { ROCKET_PURCHASE_PREVIEW_REASON_LABELS } from '../rocket-purchase-preview';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const MASTER_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_LISTING_OPTION_ID = '44444444-4444-4444-8444-444444444444';
const COMPONENT_MASTER_PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
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

function publication() {
  return RocketPoCatalogPublicationSchema.parse({
    sourceImportRunId: RUN_ID, channelAccountId: ACCOUNT_ID, generation: '1',
    actualCutoffAt: '2026-07-19T00:00:00.000Z', rowCount: 1,
  });
}

describe('Rocket purchase preview contract', () => {
  it('defines the exact reasons that block workbook export', () => {
    expect(ROCKET_WORKBOOK_BLOCKING_REASONS).toEqual([
      'mapping_required',
      'configuration_required',
      'review_required',
      'inventory_unavailable',
    ]);
    expect(isRocketWorkbookBlockingReason('mapping_required')).toBe(true);
    expect(isRocketWorkbookBlockingReason('configuration_required')).toBe(true);
    expect(isRocketWorkbookBlockingReason('review_required')).toBe(true);
    expect(isRocketWorkbookBlockingReason('inventory_unavailable')).toBe(true);
    expect(isRocketWorkbookBlockingReason('insufficient_capacity')).toBe(false);
    expect(isRocketWorkbookBlockingReason(null)).toBe(false);
  });

  it('returns a compact COMPLETE source reference without a recipe automation payload', () => {
    const published = publication();

    expect(published).toMatchObject({ sourceImportRunId: RUN_ID, rowCount: 1 });
    expect(published).not.toHaveProperty('recipeAutomation');
  });

  it('keeps a saved PO amount unknown when a listed line has no confirmed total', () => {
    const summary = RocketSavedPoSummarySchema.parse({
      sourceImportRunId: RUN_ID,
      poNumber: '10000002',
      orderedAt: '',
      plannedDeliveryDate: '2026-07-20',
      status: '',
      vendorId: 'A00123',
      centerName: '',
      inboundType: '',
      firstProductName: '키즈 식판',
      skuCount: 2,
      orderQuantity: 8,
      orderAmount: null,
      collectedAt: '2026-07-18T01:00:00.000Z',
    });

    expect(summary.orderAmount).toBeNull();
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
      exportedPoLineIds: [request().rows[0]!.poLineId],
    });

    expect(summary.poNumber).toBe('10000001');
    expect(collection.rows).toEqual(request().rows);
    // 제출 이력은 필수다. 없으면 클라이언트가 "이번에 새로 들어온 것"을 구분할 수 없다.
    expect(collection.exportedPoLineIds).toEqual([request().rows[0]!.poLineId]);
    expect(() => RocketSavedPoCollectionSchema.parse({
      sourceImportRunId: RUN_ID,
      channelAccountId: ACCOUNT_ID,
      collection: request().collection,
      rows: request().rows,
    })).toThrow();
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
    expect(RocketPurchasePreviewDecisionSchema.parse(request())).toEqual(request());
    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      organizationId: ACCOUNT_ID,
    })).toThrow();
    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      userId: ACCOUNT_ID,
    })).toThrow();
  });

  it('accepts only the bounded source fields required to render the Coupang confirmation workbook', () => {
    const row = RocketPurchasePreviewDecisionSchema.parse({
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
    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      rows: [{
        ...request().rows[0],
        confirmation: { sessionToken: 'secret' },
      }],
    })).toThrow();
  });

  it('enforces only the defensive evidence and payload bounds', () => {
    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      collection: { ...request().collection, listPagesRead: 100_001 },
    })).toThrow();
    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      collection: { ...request().collection, detailPoCount: 4_001 },
    })).toThrow();
    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      collection: {
        ...request().collection,
        failedPoNumbers: Array.from({ length: 4_001 }, (_, index) => String(index)),
      },
    })).toThrow();
  });

  it('accepts complete collection evidence beyond the former page and detail bounds', () => {
    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      collection: {
        ...request().collection,
        listPagesRead: 21,
        totalListPages: 21,
        detailPoCount: 63,
      },
    })).not.toThrow();
  });

  it('requires stable unique PO line IDs and edited quantities for known lines only', () => {
    const duplicate = request();
    duplicate.rows.push({ ...duplicate.rows[0]! });
    expect(() => RocketPurchasePreviewDecisionSchema.parse(duplicate)).toThrow();

    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      editedQuantities: { missing: 1 },
    })).toThrow();
  });

  it('accepts an explicit joint clamp request while keeping strict mode as the default', () => {
    expect(RocketPurchasePreviewDecisionSchema.parse(request()))
      .not.toHaveProperty('clampEditedQuantities');
    expect(RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      clampEditedQuantities: true,
    })).toMatchObject({ clampEditedQuantities: true });
  });

  it('accepts only the explicit confirmation-requested preview scope', () => {
    expect(RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      previewScope: 'confirmation_requested',
    })).toMatchObject({ previewScope: 'confirmation_requested' });
    expect(() => RocketPurchasePreviewDecisionSchema.parse({
      ...request(),
      previewScope: 'historical_only',
    })).toThrow();
  });

  it('parses preview-only row reasons without a submission or artifact payload', () => {
    const response = RocketPurchasePreviewResponseSchema.parse({
      status: 'ready',
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
        reason: 'inventory_unavailable',
        channelListingOptionId: null,
        masterProductId: null,
        components: [],
      }],
    });

    expect(response.status).toBe('ready');
    if (response.status !== 'ready') throw new Error('Expected ready preview');
    expect(response.rows[0]?.reason).toBe('inventory_unavailable');
    expect(response).not.toHaveProperty('confirmationFile');
    expect(response).not.toHaveProperty('submissionAttempt');
  });

  it('keeps product and recipe MasterProduct identities distinct', () => {
    const response = RocketPurchasePreviewResponseSchema.parse({
      status: 'ready',
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
        channelListingOptionId: CHANNEL_LISTING_OPTION_ID,
        masterProductId: MASTER_PRODUCT_ID,
        components: [{
          masterProductId: COMPONENT_MASTER_PRODUCT_ID,
          code: 'SP-100',
          name: 'Sellpia 연결 상품',
          optionName: null,
          quantity: 1,
          currentStock: 5,
        }],
      }],
    });

    if (response.status !== 'ready') throw new Error('Expected ready preview');
    expect(response.rows[0]).toMatchObject({
      masterProductId: MASTER_PRODUCT_ID,
      channelListingOptionId: CHANNEL_LISTING_OPTION_ID,
      components: [{ masterProductId: COMPONENT_MASTER_PRODUCT_ID }],
    });
    expect(response.rows[0]?.components[0]?.masterProductId)
      .toBe(COMPONENT_MASTER_PRODUCT_ID);
    expect(response.rows[0]?.masterProductId)
      .not.toBe(response.rows[0]?.components[0]?.masterProductId);
  });

  it.each(['configuration_required', 'review_required'] as const)(
    'accepts the option-component warning reason %s',
    (reason) => {
      const parsed = RocketPurchasePreviewResponseSchema.parse({
        status: 'ready',
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
          channelListingOptionId: CHANNEL_LISTING_OPTION_ID,
          masterProductId: MASTER_PRODUCT_ID,
          components: [],
        }],
      });

      if (parsed.status !== 'ready') throw new Error('Expected ready preview');
      expect(parsed.rows[0]?.reason).toBe(reason);
    },
  );

  it('requires the planned delivery date in preview responses', () => {
    expect(() => RocketPurchasePreviewResponseSchema.parse({
      status: 'ready',
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
        reason: 'inventory_unavailable',
        channelListingOptionId: null,
        masterProductId: null,
        components: [],
      }],
    })).toThrow(/plannedDeliveryDate/i);
  });

  it('rejects advisory calculations made before inventory collection completes', () => {
    expect(RocketPurchasePreviewResponseSchema.safeParse({
      status: 'freshness_pending', collectionRunId: RUN_ID,
      catalog: publication(), requestedGeneration: '8', rows: [],
    }).success).toBe(false);
  });

  it('accepts current stock as the only Rocket stock quantity', () => {
    expect(RocketPurchasePreviewComponentSchema.parse({
      masterProductId: COMPONENT_MASTER_PRODUCT_ID,
      code: 'SP-100',
      name: 'Sellpia 연결 상품',
      optionName: null,
      quantity: 1,
      currentStock: 5,
    })).toEqual({
      masterProductId: COMPONENT_MASTER_PRODUCT_ID,
      code: 'SP-100',
      name: 'Sellpia 연결 상품',
      optionName: null,
      quantity: 1,
      currentStock: 5,
    });
    expect(() => RocketPurchasePreviewComponentSchema.parse({
      masterProductId: COMPONENT_MASTER_PRODUCT_ID,
      code: 'SP-100',
      name: 'Sellpia 연결 상품',
      optionName: null,
      quantity: 1,
      currentStock: 5,
      availableStock: 4,
    })).toThrow();
  });

  it('carries the Sellpia product identity needed to review a recipe', () => {
    expect(RocketPurchasePreviewComponentSchema.parse({
      masterProductId: COMPONENT_MASTER_PRODUCT_ID,
      code: 'SP-100',
      name: 'Sellpia 연결 상품',
      optionName: '랜덤',
      quantity: 1,
      currentStock: 5,
    })).toMatchObject({
      code: 'SP-100',
      name: 'Sellpia 연결 상품',
      optionName: '랜덤',
    });
  });

  it('requires an explicit reviewed quantity, shortage reason, and artifact metadata for every workbook line', () => {
    const poLineId = request().rows[0]!.poLineId;
    expect(RocketWorkbookDecisionRequestSchema.parse({
      ...request(),
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 2 },
      shortageReasons: { [poLineId]: '협력사 재고부족 - 수요예측 오류' },
      artifactFileName: '쿠팡_로켓.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toMatchObject({
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 2 },
    });

    expect(() => RocketWorkbookDecisionRequestSchema.parse({
      ...request(),
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: {},
      shortageReasons: {},
      artifactFileName: '쿠팡_로켓.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(/reviewed quantity/i);

    expect(() => RocketWorkbookDecisionRequestSchema.parse({
      ...request(),
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 2 },
      shortageReasons: {},
      artifactFileName: '쿠팡_로켓.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(/shortage reason/i);

    expect(() => RocketWorkbookDecisionRequestSchema.parse({
      ...request(),
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 5 },
      shortageReasons: {},
      artifactFileName: '쿠팡_로켓.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(/order quantity/i);

    expect(() => RocketWorkbookDecisionRequestSchema.parse({
      ...request(),
      rows: [{ ...request().rows[0], confirmation: undefined }],
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [poLineId]: 2 },
      shortageReasons: { [poLineId]: '협력사 재고부족 - 수요예측 오류' },
      artifactFileName: '쿠팡_로켓.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(/workbook evidence/i);
  });

  it('accepts a date-scoped workbook decision while retaining the complete source snapshot', () => {
    const selectedRow = request().rows[0]!;
    const unselectedRow = {
      ...selectedRow,
      poLineId: '1002:P-2:8801234567891:1',
      poNumber: '1002',
      productNo: 'P-2',
      barcode: '8801234567891',
      plannedDeliveryDate: '2026-07-21',
    };

    expect(RocketWorkbookDecisionRequestSchema.parse({
      ...request(),
      collection: { ...request().collection, detailPoCount: 2 },
      rows: [selectedRow, unselectedRow],
      selectedPoLineIds: [selectedRow.poLineId],
      idempotencyKey: CONFIRMATION_ID,
      editedQuantities: { [selectedRow.poLineId]: 2 },
      shortageReasons: {
        [selectedRow.poLineId]: '협력사 재고부족 - 수요예측 오류',
      },
      artifactFileName: '쿠팡_로켓.xlsx',
      artifactContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toMatchObject({
      selectedPoLineIds: [selectedRow.poLineId],
      rows: [selectedRow, unselectedRow],
    });
  });

  it('publishes immutable artifact metadata without workflow words or raw workbook bytes', () => {
    const published = {
      exportId: CONFIRMATION_ID,
      duplicate: false,
      inventoryGeneration: '12',
      generatedAt: '2026-07-17T00:00:00.000Z',
      artifact: {
        fileName: '쿠팡_로켓.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sha256: 'a'.repeat(64),
        byteLength: 128,
      },
      totals: {
        lineCount: 1,
        orderQuantity: 4,
        workbookQuantity: 2,
        componentQuantity: 2,
      },
      rows: [{
        poLineId: request().rows[0]!.poLineId,
        workbookQuantity: 2,
        shortageReason: '협력사 재고부족 - 수요예측 오류',
      }],
    };
    const response = RocketWorkbookExportResponseSchema.parse(published);

    expect(response).not.toHaveProperty('rawRows');
    expect(response.artifact).not.toHaveProperty('bytes');
    // No client reads the workflow word or abandon eligibility; the Supply
    // workflow keeps both on the server.
    expect(RocketWorkbookExportResponseSchema.safeParse({
      ...published,
      status: 'awaiting_coupang_confirmation',
    }).success).toBe(false);
    expect(RocketWorkbookExportResponseSchema.safeParse({
      ...published,
      canAbandon: false,
    }).success).toBe(false);
  });

  it('recognizes the confirmation request statuses and abandons a workbook by export id alone', () => {
    expect(ROCKET_CONFIRMATION_REQUEST_STATUSES).toEqual([
      '거래명세서확인요청',
      '거래처확인요청',
    ]);
    expect(RocketWorkbookAbandonRequestSchema.parse({
      exportId: CONFIRMATION_ID,
    })).toEqual({
      exportId: CONFIRMATION_ID,
    });
    // A reason has nowhere to be stored, so the request no longer carries one.
    expect(() => RocketWorkbookAbandonRequestSchema.parse({
      exportId: CONFIRMATION_ID,
      reason: '쿠팡에 업로드하지 않음',
    })).toThrow();
    expect(() => RocketWorkbookAbandonRequestSchema.parse({
      exportId: 'not-a-uuid',
    })).toThrow();
  });
});

describe('ROCKET_PURCHASE_PREVIEW_REASON_LABELS', () => {
  it('labels every preview reason once with the Rocket review wording', () => {
    expect(Object.keys(ROCKET_PURCHASE_PREVIEW_REASON_LABELS).sort())
      .toEqual([...RocketPurchasePreviewReasonSchema.options].sort());
    expect(ROCKET_PURCHASE_PREVIEW_REASON_LABELS).toEqual({
      mapping_required: '상품 연결 필요',
      configuration_required: '재고 구성 필요',
      review_required: '레시피 검토 필요',
      inventory_unavailable: 'Sellpia 재고 미수집',
      insufficient_capacity: 'Sellpia 재고 부족',
    });
  });
});
