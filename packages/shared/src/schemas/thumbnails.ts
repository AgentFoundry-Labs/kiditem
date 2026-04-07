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

// ─── AI 분석 스키마 ──────────────────────────────────────────────

export const ThumbnailScoresSchema = z.object({
  guideline: z.number(),
  heroShot: z.number(),
  composition: z.number(),
  branding: z.number(),
  mobile: z.number(),
});

export const ThumbnailAnalysisResultSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  imageUrl: z.string(),
  overallScore: z.number(),
  grade: z.string(),
  scores: ThumbnailScoresSchema.nullable(),
  issues: z.array(z.object({ type: z.string(), severity: z.string(), message: z.string() })),
  suggestions: z.array(z.string()),
  method: z.string(),
  analyzed: z.boolean(),
});

export const ThumbnailAnalysisSummarySchema = z.object({
  total: z.number(),
  analyzed: z.number(),
  unclassifiedCount: z.number(),
  gradeDistribution: z.object({ S: z.number(), A: z.number(), B: z.number(), C: z.number(), F: z.number() }),
});

export const ThumbnailGenerationItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  originalUrl: z.string().nullable(),
  candidates: z.array(z.string()),
  selectedUrl: z.string().nullable(),
  status: z.string(),
  grade: z.string(),
  score: z.number(),
  createdAt: z.string(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
    coupangProductId: z.string().nullable(),
    category: z.string().nullable(),
  }),
});

export type ThumbnailScores = z.infer<typeof ThumbnailScoresSchema>;
export type ThumbnailAnalysisResult = z.infer<typeof ThumbnailAnalysisResultSchema>;
export type ThumbnailAnalysisSummary = z.infer<typeof ThumbnailAnalysisSummarySchema>;
export type ThumbnailGenerationItem = z.infer<typeof ThumbnailGenerationItemSchema>;
