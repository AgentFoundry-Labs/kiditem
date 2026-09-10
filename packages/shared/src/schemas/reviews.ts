import { z } from 'zod';

export const ReviewFilterSchema = z.enum(['all', 'new', 'needs-response']);
export type ReviewFilter = z.infer<typeof ReviewFilterSchema>;

// GET /api/reviews 응답의 각 item
export const ReviewListItemSchema = z.object({
  listingId: z.string(),
  productId: z.string(),
  productName: z.string(),
  sku: z.string().nullable(),
  organization: z.string(),
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
  // 리뷰가 있는 active listing 수
  listingCount: z.number().int().nonnegative(),
  // 회사 전체 누적 review 수
  totalReviewCount: z.number().int().nonnegative(),
  // 회사 전체 review rating 의 가중 평균. review 가 0건이면 0.
  weightedAvgRating: z.number().nonnegative(),
  // totalReviews < 5 인 listing 수.
  newListingCount: z.number().int().nonnegative(),
  // avgRating < 3.5 이고 리뷰 5건 이상인 listing 수.
  needsResponseCount: z.number().int().nonnegative(),
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

// ── 개별 리뷰 열람 (GET /api/reviews/items) ─────────────────────────────────
// 집계 테이블(`/api/reviews`)이 아니라 수집된 상품평 원문 1건씩. 운영자가 실제
// 리뷰 내용을 읽고 상품/별점으로 좁혀 보는 화면이 소비한다.
export const ReviewItemSchema = z.object({
  id: z.string(),
  listingId: z.string().nullable(),
  /** listing 매칭 실패 시 크롤링 당시 채널 상품명으로 폴백한다. */
  productName: z.string(),
  optionName: z.string().nullable(),
  rating: z.number().int(),
  title: z.string().nullable(),
  content: z.string().nullable(),
  reviewerName: z.string().nullable(),
  reviewedAt: z.string(),
  imageCount: z.number().int().nonnegative(),
  videoCount: z.number().int().nonnegative(),
  /** 채널 상품 상세 링크용 노출상품ID. */
  externalProductId: z.string().nullable(),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const ReviewItemListResponseSchema = z.object({
  items: z.array(ReviewItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  /** 별점 1~5 별 건수. 현재 필터(별점 제외) 기준 분포. */
  ratingCounts: z.record(z.string(), z.number().int().nonnegative()),
  /** 본문이 있는 리뷰 수. 쿠팡은 별점만 남기는 리뷰가 대부분이다. */
  withContentCount: z.number().int().nonnegative(),
});
export type ReviewItemListResponse = z.infer<typeof ReviewItemListResponseSchema>;

// ── 확장 크롤링 chunk 적재 (POST /api/reviews/attempts/:id/chunks) ─────────
// 쿠팡 Wing 상품평 화면(`/tenants/cs/product/review`)을 확장이 크롤링해
// 서버가 발급한 fenced attempt 로 넘기는 정규화된 원본 1건이다. Open API 가
// 아닌 판매자 콘솔 세션 크롤링이므로 채널이 주는 식별자(reviewId /
// vendorItemId / productId)를 그대로 보존한다.
export const ReviewIngestItemSchema = z.object({
  /** 쿠팡 reviewId. 재수집 멱등 키. */
  externalReviewId: z.string().min(1),
  /** 쿠팡 vendorItemId(옵션ID). ChannelListingOption 매칭 키. */
  externalOptionId: z.string().min(1).nullable().default(null),
  /** 쿠팡 productId(노출상품ID). */
  externalProductId: z.string().min(1).nullable().default(null),
  itemName: z.string().nullable().default(null),
  rating: z.number().int().min(1).max(5),
  title: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
  reviewerName: z.string().nullable().default(null),
  /** 리뷰 작성 시각(epoch ms). */
  reviewedAt: z.number().int().positive(),
  imageCount: z.number().int().nonnegative().default(0),
  videoCount: z.number().int().nonnegative().default(0),
  isDeleted: z.boolean().default(false),
  isBlinded: z.boolean().default(false),
});
export type ReviewIngestItem = z.infer<typeof ReviewIngestItemSchema>;

export const ReviewIngestRequestSchema = z.object({
  platform: z.literal('coupang').default('coupang'),
  items: z.array(ReviewIngestItemSchema).min(1).max(200),
});
export type ReviewIngestRequest = z.infer<typeof ReviewIngestRequestSchema>;

export const ReviewIngestResponseSchema = z.object({
  received: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  /** listing 매칭에 성공한 건수. */
  linked: z.number().int().nonnegative(),
  /** vendorItemId 로 ChannelListingOption 을 못 찾은 건수. */
  unlinked: z.number().int().nonnegative(),
});
export type ReviewIngestResponse = z.infer<typeof ReviewIngestResponseSchema>;
