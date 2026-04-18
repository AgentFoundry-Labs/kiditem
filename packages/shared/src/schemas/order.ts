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
