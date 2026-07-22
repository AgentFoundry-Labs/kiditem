import { z } from 'zod';
import { ScopedChannelRecipeAutomationResultSchema } from './channel-recipe-automation.js';
import { CompletedSourceArtifactRunSchema } from './source-import.js';

export const ROCKET_PO_LIST_PAGE_LIMIT = 20;
export const ROCKET_PO_DETAIL_LIMIT = 40;
export const ROCKET_PO_ROW_LIMIT = 4_000;

const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RocketPoCollectionEvidenceSchema = z.object({
  collectionRunId: z.string().uuid(),
  vendorId: boundedText(120),
  listPagesRead: z.number().int().min(0).max(ROCKET_PO_LIST_PAGE_LIMIT),
  totalListPages: z.number().int().min(0).max(100_000),
  truncated: z.boolean(),
  detailPoCount: z.number().int().min(0).max(ROCKET_PO_DETAIL_LIMIT),
  failedPoNumbers: z.array(requiredText(80)).max(ROCKET_PO_DETAIL_LIMIT),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.failedPoNumbers).size !== value.failedPoNumbers.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['failedPoNumbers'],
      message: 'Failed PO numbers must be unique',
    });
  }
});
export type RocketPoCollectionEvidence = z.infer<
  typeof RocketPoCollectionEvidenceSchema
>;

export const RocketPoCatalogRowSchema = z.object({
  poLineId: requiredText(300),
  poNumber: requiredText(80),
  vendorId: boundedText(120),
  productNo: requiredText(60),
  barcode: boundedText(80),
  productName: requiredText(240),
  orderQty: z.number().int().nonnegative().max(10_000_000),
  plannedDeliveryDate: isoDay,
  poStatusCode: boundedText(20).optional(),
  businessDateBasis: z.enum(['ordered_at', 'expected_inbound']).optional(),
  confirmation: z.object({
    center: boundedText(120),
    inboundType: boundedText(80),
    poStatus: boundedText(80),
    returnManager: boundedText(120),
    returnContact: boundedText(80),
    returnAddress: boundedText(300),
    purchasePrice: z.number().int().nonnegative().max(1_000_000_000),
    supplyPrice: z.number().int().nonnegative().max(1_000_000_000),
    vat: z.number().int().nonnegative().max(1_000_000_000),
    totalPurchase: z.number().int().nonnegative().max(1_000_000_000),
    poRegisteredAt: boundedText(40),
    xdock: boundedText(20),
  }).strict().optional(),
}).strict();
export type RocketPoCatalogRow = z.infer<typeof RocketPoCatalogRowSchema>;

export const RocketSavedPoListRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  from: isoDay,
  to: isoDay,
  status: boundedText(80).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.to < value.from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: 'to must be on or after from',
    });
  }
});
export type RocketSavedPoListRequest = z.infer<
  typeof RocketSavedPoListRequestSchema
>;

export const RocketSavedPoSummarySchema = z.object({
  sourceImportRunId: z.string().uuid(),
  poNumber: requiredText(80),
  orderedAt: boundedText(40),
  plannedDeliveryDate: isoDay,
  status: boundedText(80),
  vendorId: boundedText(120),
  centerName: boundedText(120),
  inboundType: boundedText(80),
  firstProductName: requiredText(240),
  skuCount: z.number().int().nonnegative(),
  orderQuantity: z.number().int().nonnegative(),
  orderAmount: z.number().int().nonnegative(),
  collectedAt: z.string().datetime(),
}).strict();
export type RocketSavedPoSummary = z.infer<typeof RocketSavedPoSummarySchema>;

export const RocketSavedPoCollectionSchema = z.object({
  sourceImportRunId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  collection: RocketPoCollectionEvidenceSchema,
  rows: z.array(RocketPoCatalogRowSchema).max(ROCKET_PO_ROW_LIMIT),
}).strict();
export type RocketSavedPoCollection = z.infer<
  typeof RocketSavedPoCollectionSchema
>;

const RocketPurchaseRequestBaseSchema = z.object({
  channelAccountId: z.string().uuid(),
  collection: RocketPoCollectionEvidenceSchema,
  rows: z.array(RocketPoCatalogRowSchema).max(ROCKET_PO_ROW_LIMIT),
  editedQuantities: z.record(
    z.string().min(1).max(300),
    z.number().int().nonnegative().max(10_000_000),
  ).default({}),
  clampEditedQuantities: z.boolean().optional(),
}).strict();

function validateRocketPurchaseLines(
  value: Pick<z.infer<typeof RocketPurchaseRequestBaseSchema>, 'rows' | 'editedQuantities'>,
  ctx: z.RefinementCtx,
): void {
  const lineIds = value.rows.map(({ poLineId }) => poLineId);
  if (new Set(lineIds).size !== lineIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rows'],
      message: 'PO line IDs must be unique',
    });
  }
  const known = new Set(lineIds);
  for (const lineId of Object.keys(value.editedQuantities)) {
    if (!known.has(lineId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['editedQuantities', lineId],
        message: 'Edited quantity references an unknown PO line',
      });
    }
  }
}

export const RocketPurchasePreviewRequestSchema = RocketPurchaseRequestBaseSchema
  .superRefine(validateRocketPurchaseLines);
export type RocketPurchasePreviewRequest = z.infer<
  typeof RocketPurchasePreviewRequestSchema
>;

export const ROCKET_SHORTAGE_REASONS = [
  '협력사 재고부족 - 수요예측 오류',
  '협력사 재고부족 - 생산캐파 부족 (설비라인/원자재/인력/휴무… 등등)',
  '협력사 재고부족 - 품질적 이슈 (유해물질 발견 / 유통기한 미달)',
  '협력사 재고부족 - 재고 할당정책',
  '협력사 재고부족 - 수입상품 입고지연 (선적/통관지연)',
  '제조사 생산중단 혹은 공급사 취급중단 - 제품 리뉴얼/모델 변경',
  '제조사 생산중단 혹은 공급사 취급중단 - 시장 단종',
  '제조사 생산중단 혹은 공급사 취급중단 - 사업자변경',
  'FC 입고기준 미달로 회송',
  '가격 이슈 (Price) - 매입가 인하 협상 중',
  '가격 이슈 (Price) - 매입가 인상 협상 중',
  '가격 이슈 (Price) - 쿠팡 최저가 매칭',
  '최소발주량 변경 필요 (MOQ)',
  '쿠팡 요청 미납',
  '시즌상품으로 다음 시즌전까지 생산 혹은 취급중단',
  '천재지변/재난과 같은 불가항력적인 사유로 미납',
  '업체 휴무',
  '재무 관련 사유',
  'FC 입고 이슈 - FC 슬롯 예약 불가',
  'FC 입고 이슈 - 밀크런 예약불가',
] as const;

export const RocketShortageReasonSchema = z.enum(ROCKET_SHORTAGE_REASONS);
export type RocketShortageReason = z.infer<typeof RocketShortageReasonSchema>;

export const RocketWorkbookExportRequestSchema = RocketPurchaseRequestBaseSchema
  .omit({ clampEditedQuantities: true })
  .extend({
    idempotencyKey: z.string().uuid(),
    shortageReasons: z.record(
      z.string().min(1).max(300),
      RocketShortageReasonSchema,
    ),
    artifactFileName: requiredText(240),
    artifactContentType: z.literal(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateRocketPurchaseLines(value, ctx);
    const rowsByLineId = new Map(value.rows.map((row) => [row.poLineId, row]));
    for (const row of value.rows) {
      if (!row.confirmation || row.barcode.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows', row.poLineId, 'confirmation'],
        message: 'Every workbook line requires complete workbook evidence',
        });
      }
      if (!Object.hasOwn(value.editedQuantities, row.poLineId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['editedQuantities', row.poLineId],
        message: 'Every workbook line requires an explicit reviewed quantity',
        });
        continue;
      }
      const quantity = value.editedQuantities[row.poLineId]!;
      if (quantity > row.orderQty) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['editedQuantities', row.poLineId],
        message: 'Workbook quantity must not exceed the PO order quantity',
        });
      }
      const hasShortageReason = Object.hasOwn(value.shortageReasons, row.poLineId);
      if (quantity < row.orderQty && !hasShortageReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shortageReasons', row.poLineId],
        message: 'Every short workbook line requires a shortage reason',
        });
      }
      if (quantity >= row.orderQty && hasShortageReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shortageReasons', row.poLineId],
        message: 'A full workbook line must not include a shortage reason',
        });
      }
    }
    for (const lineId of Object.keys(value.shortageReasons)) {
      if (!rowsByLineId.has(lineId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shortageReasons', lineId],
          message: 'Shortage reason references an unknown PO line',
        });
      }
    }
  });
export type RocketWorkbookExportRequest = z.infer<
  typeof RocketWorkbookExportRequestSchema
>;

export const RocketPurchasePreviewReasonSchema = z.enum([
  'mapping_required',
  'configuration_required',
  'review_required',
  'insufficient_capacity',
  'collection_incomplete',
  'vendor_mismatch',
]);
export type RocketPurchasePreviewReason = z.infer<
  typeof RocketPurchasePreviewReasonSchema
>;

export const ROCKET_WORKBOOK_BLOCKING_REASONS = [
  'mapping_required',
  'configuration_required',
  'review_required',
] as const satisfies readonly RocketPurchasePreviewReason[];

export function isRocketWorkbookBlockingReason(
  reason: RocketPurchasePreviewReason | null,
): reason is (typeof ROCKET_WORKBOOK_BLOCKING_REASONS)[number] {
  return reason !== null
    && (ROCKET_WORKBOOK_BLOCKING_REASONS as readonly string[]).includes(reason);
}

export const RocketPoCatalogPublicationSchema = z.object({
  run: CompletedSourceArtifactRunSchema.superRefine((run, ctx) => {
    if (run.sourceType !== 'coupang_rocket_po_catalog') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceType'],
        message: 'Rocket catalog uses coupang_rocket_po_catalog',
      });
    }
    if (run.channelAccountId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channelAccountId'],
        message: 'Rocket catalog requires a channel account',
      });
    }
  }),
  duplicate: z.boolean(),
  changes: z.object({
    createdProductCount: z.number().int().nonnegative(),
    updatedProductCount: z.number().int().nonnegative(),
    createdSkuCount: z.number().int().nonnegative(),
    updatedSkuCount: z.number().int().nonnegative(),
  }).strict(),
  recipeAutomation: ScopedChannelRecipeAutomationResultSchema,
}).strict();
export type RocketPoCatalogPublication = z.infer<
  typeof RocketPoCatalogPublicationSchema
>;

export const RocketPurchasePreviewComponentSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  quantity: z.number().int().positive(),
  currentStock: z.number().int().nonnegative(),
  isActive: z.boolean(),
}).strict();
export type RocketPurchasePreviewComponent = z.infer<
  typeof RocketPurchasePreviewComponentSchema
>;

export const RocketPurchasePreviewRowSchema = z.object({
  poLineId: requiredText(300),
  poNumber: requiredText(80),
  productNo: requiredText(60),
  productName: requiredText(240),
  plannedDeliveryDate: isoDay,
  orderQuantity: z.number().int().nonnegative(),
  recommendedQuantity: z.number().int().nonnegative(),
  maxQuantity: z.number().int().nonnegative(),
  editedQuantity: z.number().int().nonnegative().nullable(),
  reason: RocketPurchasePreviewReasonSchema.nullable(),
  channelSkuId: z.string().uuid().nullable(),
  masterProductId: z.string().uuid().nullable(),
  productVariantId: z.string().uuid().nullable(),
  components: z.array(RocketPurchasePreviewComponentSchema).max(50),
}).strict().superRefine((row, ctx) => {
  const linkedIds = [row.masterProductId, row.productVariantId];
  const linkedCount = linkedIds.filter((value) => value !== null).length;
  if (linkedCount !== 0 && linkedCount !== linkedIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['productVariantId'],
      message: 'Product and variant identities must be present or null together',
    });
  }
});
export type RocketPurchasePreviewRow = z.infer<
  typeof RocketPurchasePreviewRowSchema
>;

export const RocketPurchasePreviewResponseSchema = z.object({
  collectionRunId: z.string().uuid(),
  catalog: RocketPoCatalogPublicationSchema.nullable(),
  inventoryGeneration: z.string().regex(/^\d+$/).nullable(),
  rows: z.array(RocketPurchasePreviewRowSchema).max(ROCKET_PO_ROW_LIMIT),
}).strict();
export type RocketPurchasePreviewResponse = z.infer<
  typeof RocketPurchasePreviewResponseSchema
>;

export const RocketWorkbookWorkflowStatusSchema = z.enum([
  'awaiting_coupang_confirmation',
  'orders_collected',
  'sellpia_transmitting',
  'awaiting_inventory_sync',
  'completed',
  'failed',
]);
export type RocketWorkbookWorkflowStatus = z.infer<
  typeof RocketWorkbookWorkflowStatusSchema
>;

export const RocketWorkbookExportResponseSchema = z.object({
  exportId: z.string().uuid(),
  status: RocketWorkbookWorkflowStatusSchema,
  duplicate: z.boolean(),
  canAbandon: z.boolean(),
  inventoryGeneration: z.string().regex(/^\d+$/).nullable(),
  generatedAt: z.string().datetime(),
  artifact: z.object({
    fileName: requiredText(240),
    contentType: z.literal(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().positive().max(10 * 1024 * 1024),
  }).strict(),
  totals: z.object({
    lineCount: z.number().int().nonnegative().max(ROCKET_PO_ROW_LIMIT),
    orderQuantity: z.number().int().nonnegative(),
    workbookQuantity: z.number().int().nonnegative(),
    componentQuantity: z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(z.object({
    poLineId: requiredText(300),
    workbookQuantity: z.number().int().nonnegative(),
    shortageReason: RocketShortageReasonSchema.nullable(),
  }).strict()).max(ROCKET_PO_ROW_LIMIT),
}).strict();
export type RocketWorkbookExportResponse = z.infer<
  typeof RocketWorkbookExportResponseSchema
>;

export const RocketWorkbookAbandonRequestSchema = z.object({
  exportId: z.string().uuid(),
  reason: requiredText(500),
}).strict();
export type RocketWorkbookAbandonRequest = z.infer<
  typeof RocketWorkbookAbandonRequestSchema
>;
