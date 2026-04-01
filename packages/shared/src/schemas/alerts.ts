import { z } from 'zod';

// GET /api/alerts 응답의 각 item
// 출처: alerts.service.ts findAll() — Prisma Alert 직접 반환
// ⚠️ Date fields: createdAt, updatedAt — Prisma Date → JSON string 자동 변환
// satisfies 미적용: Prisma 모델 직접 반환 (Date ≠ string 불일치)
export const AlertItemSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  productId: z.string().nullable(),
  type: z.string(),
  severity: z.string(),
  title: z.string(),
  message: z.string(),
  isRead: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AlertItem = z.infer<typeof AlertItemSchema>;
