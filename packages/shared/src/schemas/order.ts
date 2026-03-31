import { z } from 'zod';

// GET /api/orders 응답의 orders[] 각 item
// 출처: Prisma Order 모델 직접 반환 (orders.service.ts:24-36)
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
  orderedAt: z.string(),
  shippedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// GET /api/orders 전체 응답
export const OrdersResponseSchema = z.object({
  success: z.boolean(),
  orders: z.array(OrderRowSchema),
  count: z.number(),
  deliveryCompanies: z.array(z.object({
    code: z.string(),
    name: z.string(),
  })).optional(),
});

// 타입 export
export type OrderRow = z.infer<typeof OrderRowSchema>;
export type OrdersResponse = z.infer<typeof OrdersResponseSchema>;
