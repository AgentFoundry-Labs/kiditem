import { z } from 'zod';

export const CoupangDirectTransportSchema = z.enum(['SHIPMENT', 'MILKRUN']);
export type CoupangDirectTransport = z.infer<
  typeof CoupangDirectTransportSchema
>;

export const CoupangDirectOrderStatusSchema = z.enum(['PA', '발주확정']);
export type CoupangDirectOrderStatus = z.infer<
  typeof CoupangDirectOrderStatusSchema
>;

export const CoupangDirectOrderItemSchema = z.object({
  skuId: z.string().trim().min(1),
  barcode: z.string().trim(),
  name: z.string().trim().min(1),
  qty: z.number().int().positive(),
  amount: z.number().nonnegative(),
}).strict();
export type CoupangDirectOrderItem = z.infer<
  typeof CoupangDirectOrderItemSchema
>;

// 워크북 표시·메타데이터용 정보 필드다. 확장 수집 원본에서 빈값·null 이 흔하고
// (센터 주소/우편번호/연락처가 비어 오거나 발주 상세에 납품예정일이 없을 수 있다)
// 발주·품목 식별자·수량·정산 같은 데이터 무결성과 무관하므로, 빈값은 수집 실패가 아니라
// 정상 입력으로 흡수해 배치 전체를 400 으로 막지 않는다.
const optionalDisplayText = z.preprocess((value) => {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalDisplayZip = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.union([z.string(), z.number().int().nonnegative()]).optional());

const optionalDisplayDate = z.preprocess(
  (value) => (value == null ? '' : value),
  z.string().trim(),
);

export const CoupangDirectPurchaseOrderSchema = z.object({
  seq: z.union([
    z.string().trim().min(1),
    z.number().int().nonnegative().transform(String),
  ]),
  status: CoupangDirectOrderStatusSchema,
  center: z.string().trim().min(1),
  transport: CoupangDirectTransportSchema,
  edd: optionalDisplayDate,
  reg: z.string().trim().min(1),
  // 발주유형이 긴급인지(쿠팡 purchaseOrderType = URGENT). 구버전 확장은 안 보내므로 선택값.
  urgent: z.boolean().optional(),
  items: z.array(CoupangDirectOrderItemSchema),
}).strict();
export type CoupangDirectPurchaseOrder = z.infer<
  typeof CoupangDirectPurchaseOrderSchema
>;

export const CoupangDirectCenterSchema = z.object({
  addr: optionalDisplayText,
  zip: optionalDisplayZip,
  contact: optionalDisplayText,
}).strict().transform((center) => {
  // A blank field is left out, not kept as `undefined`: the owner hashes and
  // stores the capture as canonical JSON, which has no undefined value.
  const clean: { addr?: string; zip?: string | number; contact?: string } = {};
  if (center.addr !== undefined) clean.addr = center.addr;
  if (center.zip !== undefined) clean.zip = center.zip;
  if (center.contact !== undefined) clean.contact = center.contact;
  return clean;
});
export type CoupangDirectCenter = z.infer<typeof CoupangDirectCenterSchema>;

export const CoupangDirectOrderCollectionRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  pos: z.array(CoupangDirectPurchaseOrderSchema).max(4_000),
  centers: z.record(z.string(), CoupangDirectCenterSchema),
  transport: CoupangDirectTransportSchema,
}).strict().superRefine((request, ctx) => {
  const seenLineKeys = new Set<string>();

  request.pos.forEach((purchaseOrder, purchaseOrderIndex) => {
    purchaseOrder.items.forEach((item, itemIndex) => {
      const lineKey = `${purchaseOrder.seq}\u0000${item.skuId}`;
      if (seenLineKeys.has(lineKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pos', purchaseOrderIndex, 'items', itemIndex, 'skuId'],
          message: 'Duplicate (seq, skuId) line',
        });
      }
      seenLineKeys.add(lineKey);
    });
  });
});
export type CoupangDirectOrderCollectionRequest = z.infer<
  typeof CoupangDirectOrderCollectionRequestSchema
>;

// ── 입고예정일 달력용 발주 스냅샷 (조회 편의 캐시) ──
// 달력이 매번 쿠팡을 다시 긁지 않도록 마지막 수집분을 서버에 저장/조회한다.

export const CoupangDirectPoSnapshotItemSchema = z.object({
  barcode: z.string(),
  name: z.string(),
  qty: z.number().int().nonnegative(),
  amount: z.number().nonnegative(),
}).strict();
export type CoupangDirectPoSnapshotItem = z.infer<
  typeof CoupangDirectPoSnapshotItemSchema
>;

export const CoupangDirectPoSnapshotEntrySchema = z.object({
  purchaseOrderSeq: z.string().trim().min(1),
  centerName: z.string(),
  transport: CoupangDirectTransportSchema,
  deliveryDate: z.string().nullable(),
  orderedDate: z.string().nullable(),
  isUrgent: z.boolean(),
  skuCount: z.number().int().nonnegative(),
  orderQuantity: z.number().int().nonnegative(),
  orderAmount: z.number().nonnegative(),
  items: z.array(CoupangDirectPoSnapshotItemSchema),
}).strict();
export type CoupangDirectPoSnapshotEntry = z.infer<
  typeof CoupangDirectPoSnapshotEntrySchema
>;

export const SaveCoupangDirectPoSnapshotRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  entries: z.array(CoupangDirectPoSnapshotEntrySchema).max(4_000),
}).strict();
export type SaveCoupangDirectPoSnapshotRequest = z.infer<
  typeof SaveCoupangDirectPoSnapshotRequestSchema
>;

export const CoupangDirectPoSnapshotResponseSchema = z.object({
  channelAccountId: z.string(),
  collectedAt: z.string().nullable(),
  entries: z.array(CoupangDirectPoSnapshotEntrySchema),
});
export type CoupangDirectPoSnapshotResponse = z.infer<
  typeof CoupangDirectPoSnapshotResponseSchema
>;
