import { z } from 'zod';
import { zIsoDate } from './common.js';

// GET /api/orders 응답의 orders[] 각 item
// 출처: orders.service.ts findAll() — Prisma Order 직접 반환
// ⚠️ Date fields: orderedAt, shippedAt, deliveredAt, createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const OrderRowSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  productId: z.string().nullable(),
  orderNumber: z.string(),
  platform: z.string(),
  coupangOrderId: z.string().nullable(),
  customerName: z.string(),
  productName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalPrice: z.number(),
  status: z.string(),
  trackingNumber: z.string().nullable(),
  shippingCompany: z.string().nullable(),
  receiverName: z.string().nullable(),
  receiverPhone: z.string().nullable(),
  receiverAddr: z.string().nullable(),
  memo: z.string().nullable(),
  orderedAt: zIsoDate,
  shippedAt: zIsoDate.nullable(),
  deliveredAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});

// GET /api/orders 전체 응답
// 실제 API 응답 형태: { items, total, deliveryCompanies? } — paginated response 관례 따름
export const OrdersResponseSchema = z.object({
  items: z.array(OrderRowSchema),
  total: z.number(),
  deliveryCompanies: z.array(z.object({
    code: z.string(),
    name: z.string(),
  })).optional(),
});

// 타입 export
export type OrderRow = z.infer<typeof OrderRowSchema>;
export type OrdersResponse = z.infer<typeof OrdersResponseSchema>;
