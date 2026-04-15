import { z } from 'zod';

// ─── 가이드라인 준수 점수 스키마 ─────────────────────────────────────────────

export const ComplianceScoresSchema = z.object({
  violations: z.object({
    background_not_white: z.boolean(),
    has_text: z.boolean(),
    has_extra_logo: z.boolean(),
    has_discount_text: z.boolean(),
    has_freebie_display: z.boolean(),
    has_overlay_effects: z.boolean(),
    has_gradient_background: z.boolean(),
    has_background_objects: z.boolean(),
    product_fill_low: z.boolean(),
    not_center_aligned: z.boolean(),
    product_cropped: z.boolean(),
    excessive_editing: z.boolean(),
  }),
  confidence: z.record(z.string(), z.number()),
  quality: z.object({
    estimatedFillPercent: z.number(),
    centerOffsetPercent: z.number(),
    aspectRatioValid: z.boolean(),
  }),
  violationCount: z.number(),
});

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

// ─── 이미지 스펙 ────────────────────────────────────────────────

export const ImageSpecIssueSchema = z.object({
  type: z.string(),
  severity: z.enum(['fail', 'warn']),
  message: z.string(),
});

export const ImageSpecSchema = z.object({
  width: z.number(),
  height: z.number(),
  aspectRatio: z.number(),
  fileSizeKB: z.number(),
  format: z.string(),
  issues: z.array(ImageSpecIssueSchema),
});

export type ImageSpec = z.infer<typeof ImageSpecSchema>;
export type ImageSpecIssue = z.infer<typeof ImageSpecIssueSchema>;

// ─── AI 분석 스키마 ──────────────────────────────────────────────

export const ThumbnailScoresSchema = z.object({
  heroShot: z.number(),
  composition: z.number(),
  branding: z.number(),
  mobile: z.number(),
  differentiation: z.number(),
});

export const ThumbnailAnalysisResultSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  imageUrl: z.string().nullable(),
  overallScore: z.number(),
  grade: z.string(),
  scores: ThumbnailScoresSchema.nullable(),
  issues: z.array(z.object({ type: z.string(), severity: z.string(), message: z.string() })),
  suggestions: z.array(z.string()),
  method: z.string(),
  analyzed: z.boolean(),
  qualityAnalyzed: z.boolean(),
  complianceAnalyzed: z.boolean(),
  complianceGrade: z.string().nullable(),
  complianceScores: ComplianceScoresSchema.nullable(),
  imageSpec: ImageSpecSchema.nullable().optional(),
  createdAt: z.string().optional(),
  ctr: z.number().nullable().optional(),
});

export const ThumbnailAnalysisSummarySchema = z.object({
  total: z.number(),
  analyzed: z.number(),
  partialCount: z.number(),
  unclassifiedCount: z.number(),
  gradeDistribution: z.object({ S: z.number(), A: z.number(), B: z.number(), C: z.number(), F: z.number() }),
  complianceDistribution: z.object({ PASS: z.number(), WARN: z.number(), FAIL: z.number() }),
});

export const EditAnalysisResultSchema = z.object({
  complianceGrade: z.string(),
  complianceScores: z.record(z.string(), z.unknown()).nullable(),
  overallScore: z.number(),
  grade: z.string(),
});

export const ThumbnailGenerationItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  originalUrl: z.string().nullable(),
  candidates: z.array(z.object({ url: z.string(), filename: z.string() })),
  selectedUrl: z.string().nullable(),
  status: z.string(),
  grade: z.string(),
  score: z.number(),
  method: z.string().default('generate'),
  editAnalysis: EditAnalysisResultSchema.nullable().default(null),
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
export type EditAnalysisResult = z.infer<typeof EditAnalysisResultSchema>;
export type ComplianceScores = z.infer<typeof ComplianceScoresSchema>;
export type ThumbnailAnalysisResult = z.infer<typeof ThumbnailAnalysisResultSchema>;
export type ThumbnailAnalysisSummary = z.infer<typeof ThumbnailAnalysisSummarySchema>;
export type ThumbnailGenerationItem = z.infer<typeof ThumbnailGenerationItemSchema>;
