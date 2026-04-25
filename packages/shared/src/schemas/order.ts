import { z } from 'zod';
import { zIsoDate } from './common.js';

// Platform / type enums (Zod-level — DB 는 String per ADR-0001)
export const OrderPlatformSchema = z.enum(['coupang', 'naver', '11st', 'manual']);
export type OrderPlatform = z.infer<typeof OrderPlatformSchema>;

export const OrderReturnTypeSchema = z.enum(['RETURN', 'EXCHANGE']);
export type OrderReturnType = z.infer<typeof OrderReturnTypeSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  platform: z.string().max(20),
  externalOrderId: z.string().max(60),
  externalNumber: z.string().max(60).nullable(),
  customerName: z.string(),
  receiverName: z.string().nullable(),
  receiverPhone: z.string().nullable(),
  receiverAddr: z.string().nullable(),
  memo: z.string().nullable(),
  status: z.string(),
  orderedAt: zIsoDate,
  paidAt: zIsoDate.nullable(),
  shippedAt: zIsoDate.nullable(),
  deliveredAt: zIsoDate.nullable(),
  trackingNumber: z.string().nullable(),
  shippingCompany: z.string().nullable(),
  shippingPrice: z.number().int(),
  totalPrice: z.number().int(),
  listingId: z.string().uuid().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderLineItemSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  orderId: z.string().uuid(),
  listingOptionId: z.string().uuid().nullable(),
  optionId: z.string().uuid().nullable(),
  productName: z.string(),
  optionName: z.string().nullable(),
  sku: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  totalPrice: z.number().int(),
  status: z.string(),
  externalLineId: z.string().max(60).nullable(),
  metadata: z.unknown().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;

export const OrderReturnSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  platform: z.string().max(20),
  externalReturnId: z.string().max(60),
  type: OrderReturnTypeSchema,
  status: z.string(),
  reason: z.string(),
  reasonCategory1: z.string().nullable(),
  reasonCategory2: z.string().nullable(),
  faultBy: z.string().max(20),
  requesterName: z.string(),
  enclosePrice: z.number().int().nullable(),
  requestedAt: zIsoDate,
  completedAt: zIsoDate.nullable(),
  metadata: z.unknown().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type OrderReturn = z.infer<typeof OrderReturnSchema>;

export const OrderReturnLineItemSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  returnId: z.string().uuid(),
  orderLineItemId: z.string().uuid().nullable(),
  optionId: z.string().uuid().nullable(),
  productName: z.string(),
  quantity: z.number().int(),
  metadata: z.unknown().nullable(),
  createdAt: zIsoDate,
});
export type OrderReturnLineItem = z.infer<typeof OrderReturnLineItemSchema>;

// =============================================================================
// W3 — UI-ready response schemas (typed boundary for /orders page)
// =============================================================================

export const OrderStatusSchema = z.enum([
  'ACCEPT',
  'INSTRUCT',
  'DEPARTURE',
  'DELIVERING',
  'FINAL_DELIVERY',
  'CANCELED',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderPipelineStatusSchema = z.enum([
  'ACCEPT',
  'INSTRUCT',
  'DEPARTURE',
  'DELIVERING',
  'FINAL_DELIVERY',
]);
export type OrderPipelineStatus = z.infer<typeof OrderPipelineStatusSchema>;

export const OrderListLineItemSchema = z.object({
  id: z.string().uuid(),
  productName: z.string(),
  optionName: z.string().nullable(),
  sku: z.string().nullable(),
  quantity: z.number().int().nonnegative(),
  unitPrice: z.number().int(),
  totalPrice: z.number().int(),
  status: z.string(),
  externalLineId: z.string().nullable(),
});
export type OrderListLineItem = z.infer<typeof OrderListLineItemSchema>;

export const DeliveryCompanySchema = z.object({
  code: z.string(),
  name: z.string(),
});
export type DeliveryCompany = z.infer<typeof DeliveryCompanySchema>;

export const OrderListItemSchema = z.object({
  id: z.string().uuid(),
  platform: z.string(),
  externalOrderId: z.string(),
  externalNumber: z.string().nullable(),
  displayOrderNumber: z.string(),
  // safe-integer 제약 — Coupang shipmentBoxId 가 Number.MAX_SAFE_INTEGER 를 넘는 경우
  // 캐스팅 반올림으로 다른 ID 로 외부 API 가 나갈 수 있어 unsafe 값은 거부한다.
  shipmentBoxId: z
    .number()
    .int()
    .positive()
    .refine((n) => Number.isSafeInteger(n), {
      message: 'shipmentBoxId must be a safe integer',
    })
    .nullable(),
  status: OrderStatusSchema,
  customerName: z.string(),
  receiverName: z.string().nullable(),
  receiverAddr: z.string().nullable(),
  memo: z.string().nullable(),
  orderedAt: zIsoDate,
  shippedAt: zIsoDate.nullable(),
  deliveredAt: zIsoDate.nullable(),
  trackingNumber: z.string().nullable(),
  shippingCompany: z.string().nullable(),
  totalPrice: z.number().int(),
  totalQuantity: z.number().int().nonnegative(),
  lineItemCount: z.number().int().nonnegative(),
  primaryProductName: z.string().nullable(),
  primaryOptionName: z.string().nullable(),
  lineItems: z.array(OrderListLineItemSchema),
});
export type OrderListItem = z.infer<typeof OrderListItemSchema>;

export const OrderListResponseSchema = z.object({
  items: z.array(OrderListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  deliveryCompanies: z.array(DeliveryCompanySchema),
});
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;

export const OrderStatsResponseSchema = z.object({
  stats: z.object({
    total: z.number().int().nonnegative(),
    accept: z.number().int().nonnegative(),
    instruct: z.number().int().nonnegative(),
    departure: z.number().int().nonnegative(),
    delivering: z.number().int().nonnegative(),
    finalDelivery: z.number().int().nonnegative(),
  }),
  today: z.object({
    orders: z.number().int().nonnegative(),
    revenue: z.number().int(),
  }),
  week: z.object({
    orders: z.number().int().nonnegative(),
    revenue: z.number().int(),
  }),
});
export type OrderStatsResponse = z.infer<typeof OrderStatsResponseSchema>;

export const OrderActionResponseSchema = z.object({
  message: z.string(),
  data: z.unknown().optional(),
});
export type OrderActionResponse = z.infer<typeof OrderActionResponseSchema>;

export const OrderPipelineResponseSchema = z.object({
  pipeline: z.record(OrderPipelineStatusSchema, z.array(OrderListItemSchema)),
  counts: z.record(OrderPipelineStatusSchema, z.number().int().nonnegative()),
});
export type OrderPipelineResponse = z.infer<typeof OrderPipelineResponseSchema>;
