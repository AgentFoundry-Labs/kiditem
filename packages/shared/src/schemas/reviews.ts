import { z } from 'zod';

// GET /api/reviews 응답의 각 item
export const ReviewListItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  sku: z.string().nullable(),
  company: z.string(),
  grade: z.string(),
  totalReviews: z.number(),
  avgRating: z.number(),
  recentReviews: z.number(),
  orderCount: z.number(),
  lastReviewAt: z.string().nullable(),
});

export type ReviewListItem = z.infer<typeof ReviewListItemSchema>;
