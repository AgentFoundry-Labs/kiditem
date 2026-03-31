import { z } from 'zod';

// GET /api/alerts 응답의 각 item
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
