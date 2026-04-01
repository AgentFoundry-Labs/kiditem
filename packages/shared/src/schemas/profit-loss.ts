import { z } from 'zod';

// GET /api/profit-loss 응답의 각 item
// 출처: profit-loss.service.ts plResults (line 25-45)
export const PLDataSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  sku: z.string().nullable(),
  company: z.string(),
  grade: z.string(),
  period: z.string(),
  revenue: z.number(),
  costOfGoods: z.number(),
  commission: z.number(),
  shippingCost: z.number(),
  adCost: z.number(),
  otherCost: z.number(),
  netProfit: z.number(),
  profitRate: z.number(),
  orderCount: z.number(),
});

// 타입 export
export type PLData = z.infer<typeof PLDataSchema>;
