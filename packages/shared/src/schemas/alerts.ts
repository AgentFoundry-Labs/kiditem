import { z } from 'zod';

// GET /api/alerts 응답의 각 item
// 출처: alerts.service.ts findAll() — Prisma Alert 모델 기반
export const AlertItemSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  productId: z.string().nullable(),
  type: z.string(),
  severity: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.string(),
});

export type AlertItem = z.infer<typeof AlertItemSchema>;
