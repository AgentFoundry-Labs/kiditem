import { z } from 'zod';

// GET /api/thumbnails 응답의 각 item
export const ThumbnailListItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  company: z.string(),
  imageUrl: z.string(),
  ctr: z.number(),
  prevCtr: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  status: z.string(),
  strategy: z.string(),
  grade: z.string(),
  issues: z.array(z.object({
    type: z.string(),
    severity: z.string(),
    message: z.string(),
  })),
  suggestions: z.array(z.string()),
});

// GET /api/thumbnails/summary 응답
export const ThumbnailSummarySchema = z.object({
  total: z.number(),
  gradeDistribution: z.object({
    S: z.number(),
    A: z.number(),
    B: z.number(),
    C: z.number(),
    F: z.number(),
  }),
});

export type ThumbnailListItem = z.infer<typeof ThumbnailListItemSchema>;
export type ThumbnailSummary = z.infer<typeof ThumbnailSummarySchema>;
