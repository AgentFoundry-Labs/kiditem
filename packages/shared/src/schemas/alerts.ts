import { z } from 'zod';

// schemas/alerts.ts: AlertItemSchema — server-internal full alert row (+companyId).
// Projection: Prisma Alert 모델의 전체 행 매핑 (companyId 포함).
// (Plan B2c.dashboard T9, BREAKING — was `productId`; DB schema has `targetType + targetId`)

// GET /api/alerts 응답의 각 item
// 출처: alerts.service.ts findAll() — Prisma Alert 모델 기반
export const AlertItemSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  type: z.string(),
  severity: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  isRead: z.boolean(),
  createdAt: z.string(),
});

export type AlertItem = z.infer<typeof AlertItemSchema>;
