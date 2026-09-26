import { z } from 'zod';

export const ROCKET_PO_ROW_LIMIT = 4_000;
const ROCKET_PO_LIST_PAGE_EVIDENCE_LIMIT = 100_000;

export const ROCKET_CONFIRMATION_REQUEST_STATUSES = [
  '거래명세서확인요청',
  '거래처확인요청',
] as const;

const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RocketPoSourceBeginSchema = z.object({
  channelAccountId: z.string().uuid(),
  from: isoDay, to: isoDay,
  status: z.enum(['RP', 'PA', 'RI', 'CI', '']),
  dateType: z.enum(['WAREHOUSING_PLAN_DATE', 'PURCHASE_ORDER_DATE']),
  requireConfirmation: z.boolean(),
}).strict().refine((value) => value.from <= value.to, 'Invalid date range');
export type RocketPoSourceBegin = z.infer<typeof RocketPoSourceBeginSchema>;

export const RocketPoCollectionEvidenceSchema = z.object({
  collectionRunId: z.string().uuid(),
  vendorId: boundedText(120),
  listPagesRead: z.number().int().min(0).max(ROCKET_PO_LIST_PAGE_EVIDENCE_LIMIT),
  totalListPages: z.number().int().min(0).max(ROCKET_PO_LIST_PAGE_EVIDENCE_LIMIT),
  truncated: z.boolean(),
  detailPoCount: z.number().int().min(0).max(ROCKET_PO_ROW_LIMIT),
  failedPoNumbers: z.array(requiredText(80)).max(ROCKET_PO_ROW_LIMIT),
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
  /** 이 발주를 발행한 로켓 PO 수집 실행(Orders `orders.coupang_rocket_po`, KID-359). */
  rocketPoOperationId: z.string().uuid(),
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
  /** Null when any listed line has no provider-confirmed total. */
  orderAmount: z.number().int().nonnegative().nullable(),
  collectedAt: z.string().datetime(),
}).strict();
export type RocketSavedPoSummary = z.infer<typeof RocketSavedPoSummarySchema>;

export const RocketSavedPoSnapshotSchema = z.object({
  rocketPoOperationId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  collection: RocketPoCollectionEvidenceSchema,
  rows: z.array(RocketPoCatalogRowSchema).max(ROCKET_PO_ROW_LIMIT),
}).strict();
export type RocketSavedPoSnapshot = z.infer<
  typeof RocketSavedPoSnapshotSchema
>;

export const ROCKET_SAVED_PO_RESPONSE_PROFILE = 'rocket-saved-po-v2';

export const RocketSavedPoCollectionSchema = RocketSavedPoSnapshotSchema.extend({
  // 이 계정에서 이미 확정 엑셀로 나간 PO 라인. 수집은 매번 전량 스냅샷이라 같은 라인이
  // 여러 수집본에 반복 등장한다(`poLineId` 는 수집본 간에 안정적). 운영자가 "이번에
  // 새로 들어온 것만" 보려면 이 집합을 빼야 한다. 행 스키마는 요청 본문으로도 쓰이므로
  // 행에 필드를 더하지 않고 별도 목록으로 내려준다.
  exportedPoLineIds: z.array(requiredText(300)).max(ROCKET_PO_ROW_LIMIT),
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

export const RocketPurchasePreviewScopeSchema = z.enum([
  'all_rows',
  'confirmation_requested',
]);
export type RocketPurchasePreviewScope = z.infer<
  typeof RocketPurchasePreviewScopeSchema
>;

export const RocketPurchasePreviewRequestSchema = z.object({
    channelAccountId: z.string().uuid(),
    rocketPoOperationId: z.string().uuid(),
    inventoryAttemptId: z.string().uuid(),
    editedQuantities: RocketPurchaseRequestBaseSchema.shape.editedQuantities,
    clampEditedQuantities: z.boolean().optional(),
    previewScope: RocketPurchasePreviewScopeSchema.optional(),
  })
  .strict();
export type RocketPurchasePreviewRequest = z.infer<
  typeof RocketPurchasePreviewRequestSchema
>;

// Internal decision input: canonical rows are loaded by Channels, never accepted
// by the public preview endpoint.
export const RocketPurchasePreviewDecisionSchema = RocketPurchaseRequestBaseSchema
  .extend({ previewScope: RocketPurchasePreviewScopeSchema.optional() })
  .strict().superRefine(validateRocketPurchaseLines);

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

export const RocketWorkbookDecisionRequestSchema = RocketPurchaseRequestBaseSchema
  .omit({ clampEditedQuantities: true })
  .extend({
    idempotencyKey: z.string().uuid(),
    selectedPoLineIds: z.array(requiredText(300)).min(1).max(4_000).optional(),
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
    const selectedPoLineIds = value.selectedPoLineIds
      ?? value.rows.map(({ poLineId }) => poLineId);
    if (new Set(selectedPoLineIds).size !== selectedPoLineIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedPoLineIds'],
        message: 'Selected workbook PO line IDs must be unique',
      });
    }
    for (const lineId of selectedPoLineIds) {
      if (!rowsByLineId.has(lineId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['selectedPoLineIds', lineId],
          message: 'Selected workbook PO line references an unknown source line',
        });
      }
    }
    const selectedLineIds = new Set(selectedPoLineIds);
    for (const row of value.rows.filter(({ poLineId }) => selectedLineIds.has(poLineId))) {
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
      if (!selectedLineIds.has(lineId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shortageReasons', lineId],
          message: 'Shortage reason references an unselected PO line',
        });
      }
    }
  });
export type RocketWorkbookDecisionRequest = z.infer<typeof RocketWorkbookDecisionRequestSchema>;

export const RocketWorkbookExportRequestSchema = RocketWorkbookDecisionRequestSchema.innerType()
  .omit({ collection: true, rows: true })
  .extend({ rocketPoOperationId: z.string().uuid(), inventoryAttemptId: z.string().uuid() }).strict();
export type RocketWorkbookExportRequest = z.infer<typeof RocketWorkbookExportRequestSchema>;

export const RocketPurchasePreviewReasonSchema = z.enum([
  'mapping_required',
  'configuration_required',
  'review_required',
  'inventory_unavailable',
  'insufficient_capacity',
]);
export type RocketPurchasePreviewReason = z.infer<
  typeof RocketPurchasePreviewReasonSchema
>;

export const ROCKET_WORKBOOK_BLOCKING_REASONS = [
  'mapping_required',
  'configuration_required',
  'review_required',
  'inventory_unavailable',
] as const satisfies readonly RocketPurchasePreviewReason[];

export function isRocketWorkbookBlockingReason(
  reason: RocketPurchasePreviewReason | null,
): reason is (typeof ROCKET_WORKBOOK_BLOCKING_REASONS)[number] {
  return reason !== null
    && (ROCKET_WORKBOOK_BLOCKING_REASONS as readonly string[]).includes(reason);
}

/** 발행된 로켓 PO 수집(실행 하나). `actualCutoffAt`은 그 실행이 스냅샷을 쓴 시각이다. */
export const RocketPoCatalogPublicationSchema = z.object({
  rocketPoOperationId: z.string().uuid(), channelAccountId: z.string().uuid(),
  actualCutoffAt: z.string().datetime(),
  rowCount: z.number().int().nonnegative().max(ROCKET_PO_ROW_LIMIT),
}).strict();
export type RocketPoCatalogPublication = z.infer<
  typeof RocketPoCatalogPublicationSchema
>;

export const RocketPurchasePreviewComponentSchema = z.object({
  masterProductId: z.string().uuid(),
  code: requiredText(120).nullable(),
  name: requiredText(240).nullable(),
  optionName: z.string().trim().min(1).max(240).nullable(),
  quantity: z.number().int().positive(),
  currentStock: z.number().int().nonnegative().nullable(),
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
  recommendedQuantity: z.number().int().nonnegative().nullable(),
  maxQuantity: z.number().int().nonnegative().nullable(),
  editedQuantity: z.number().int().nonnegative().nullable(),
  reason: RocketPurchasePreviewReasonSchema.nullable(),
  channelListingOptionId: z.string().uuid().nullable(),
  masterProductId: z.string().uuid().nullable(),
  components: z.array(RocketPurchasePreviewComponentSchema).max(50),
}).strict().superRefine((row, ctx) => {
  if (row.masterProductId !== null && row.channelListingOptionId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['channelListingOptionId'],
      message: 'A confirmed product requires a channel listing option identity',
    });
  }
});
export type RocketPurchasePreviewRow = z.infer<
  typeof RocketPurchasePreviewRowSchema
>;

export const RocketPurchasePreviewReadyResponseSchema = z.object({
  status: z.literal('ready'),
  collectionRunId: z.string().uuid(),
  catalog: RocketPoCatalogPublicationSchema.nullable(),
  inventoryGeneration: z.string().regex(/^\d+$/).nullable(),
  rows: z.array(RocketPurchasePreviewRowSchema).max(ROCKET_PO_ROW_LIMIT),
}).strict();
export type RocketPurchasePreviewReadyResponse = z.infer<
  typeof RocketPurchasePreviewReadyResponseSchema
>;

export const RocketPurchasePreviewResponseSchema = RocketPurchasePreviewReadyResponseSchema;
export type RocketPurchasePreviewResponse = z.infer<
  typeof RocketPurchasePreviewResponseSchema
>;

export const RocketWorkbookExportResponseSchema = z.object({
  exportId: z.string().uuid(),
  duplicate: z.boolean(),
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

// Abandonment is gated on fresh empty collection probes. It takes no reason:
// nothing stores one since the confirmation's release columns were dropped.
export const RocketWorkbookAbandonRequestSchema = z.object({
  exportId: z.string().uuid(),
}).strict();
export type RocketWorkbookAbandonRequest = z.infer<
  typeof RocketWorkbookAbandonRequestSchema
>;
