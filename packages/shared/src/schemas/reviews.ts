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

// GET /api/reviews aggregate summary (R3)
export const ReviewSummarySchema = z.object({
  // 회사 전체 누적 review 수
  totalReviewCount: z.number().int().nonnegative(),
  // 회사 전체 review rating 의 가중 평균. review 가 0건이면 0.
  weightedAvgRating: z.number().nonnegative(),
  // listing 단위로 (avgRating < 3.5) || (totalReviews < 5) 인 row 수.
  // 임계값은 frontend filter (`needs-response`/`new`) 와 일치.
  needsAttentionCount: z.number().int().nonnegative(),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

// GET /api/reviews 응답 envelope (R3)
export const ReviewListResponseSchema = z.object({
  items: z.array(ReviewListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  summary: ReviewSummarySchema,
});
export type ReviewListResponse = z.infer<typeof ReviewListResponseSchema>;
