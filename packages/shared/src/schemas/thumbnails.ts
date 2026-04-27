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
  reasons: z.record(z.string(), z.string()).optional(),
  editSuggestions: z.record(z.string(), z.string()).optional(),
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
  issues: z.array(
    z.object({
      type: z.string(),
      severity: z.string(),
      message: z.string(),
    }),
  ),
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

// ─── Recompose Scenarios ──────────────────────────────────────────────
// AI 분석 시점에 추정되는 시나리오 + variant 옵션. 현재 main DB 에는 컬럼이 없어
// `ThumbnailAnalysisResult.recompose` 는 항상 null 로 직렬화된다.

export const RECOMPOSE_VARIANT_KEYS = ['auto', 'with-box', 'no-box'] as const;
export type RecomposeVariantKey = (typeof RECOMPOSE_VARIANT_KEYS)[number];

export const RECOMPOSE_KINDS = [
  'single-product',
  'single-with-accessories',
  'multi-pack-loose',
  'multi-variant-loose',
  'box-with-loose-same',
  'box-with-loose-diff',
  'box-only-window',
  'box-only-opaque',
  'lifestyle-context',
  'text-heavy',
] as const;
export type RecomposeKind = (typeof RECOMPOSE_KINDS)[number];

export const RecomposeVariantOptionSchema = z.object({
  key: z.enum(RECOMPOSE_VARIANT_KEYS),
  label: z.string(),
  description: z.string(),
  recommended: z.boolean().optional(),
});

export const RecomposeVariantClassificationSchema = z.object({
  kind: z.enum(RECOMPOSE_KINDS),
  requiresChoice: z.boolean(),
  options: z.array(RecomposeVariantOptionSchema),
  recommended: z.enum(RECOMPOSE_VARIANT_KEYS).nullable(),
  reasoning: z.string().nullable(),
});

export type RecomposeVariantOption = z.infer<typeof RecomposeVariantOptionSchema>;
export type RecomposeVariantClassification = z.infer<typeof RecomposeVariantClassificationSchema>;

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
  // 현재 main DB 미지원 — 항상 null. 브랜치 UI 호환을 위해 optional/nullable 로 노출.
  recompose: RecomposeVariantClassificationSchema.nullable().optional(),
  createdAt: z.string().optional(),
  ctr: z.number().nullable().optional(),
});

export const ThumbnailAnalysisSummarySchema = z.object({
  total: z.number(),
  analyzed: z.number(),
  partialCount: z.number(),
  unclassifiedCount: z.number(),
  gradeDistribution: z.object({
    S: z.number(),
    A: z.number(),
    B: z.number(),
    C: z.number(),
    F: z.number(),
  }),
  complianceDistribution: z.object({ PASS: z.number(), WARN: z.number(), FAIL: z.number() }),
});

export const ThumbnailAnalysisListResponseSchema = ThumbnailAnalysisSummarySchema.extend({
  allResults: z.array(ThumbnailAnalysisResultSchema),
  unclassified: z.array(ThumbnailAnalysisResultSchema),
});

export const EditAnalysisResultSchema = z.object({
  complianceGrade: z.string(),
  complianceScores: z.record(z.string(), z.unknown()).nullable(),
  overallScore: z.number(),
  grade: z.string(),
});

// ─── ADR-0011 Phase 3: Canonical status + phase ─────────────────────────
export const THUMBNAIL_PHASES = ['ready', 'applied'] as const;
export type ThumbnailPhase = (typeof THUMBNAIL_PHASES)[number];

export const THUMBNAIL_REGISTRATION_STATUSES = ['uploaded', 'registered', 'failed'] as const;
export type ThumbnailRegistrationStatus = (typeof THUMBNAIL_REGISTRATION_STATUSES)[number];

export const ThumbnailGenerationItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  originalUrl: z.string().nullable(),
  candidates: z.array(z.object({ url: z.string(), filename: z.string() })),
  selectedUrl: z.string().nullable(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  phase: z.enum(THUMBNAIL_PHASES).nullable().optional(),
  grade: z.string(),
  score: z.number(),
  method: z.string().default('generate'),
  editAnalysis: EditAnalysisResultSchema.nullable().default(null),
  triggeredByUserId: z.string().uuid().nullable().optional(),
  // 현재 main DB 미지원. 항상 null 직렬화.
  registrationStatus: z.enum(THUMBNAIL_REGISTRATION_STATUSES).nullable().optional(),
  registrationCheckedAt: z.string().nullable().optional(),
  registrationError: z.string().nullable().optional(),
  createdAt: z.string(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
    coupangProductId: z.string().nullable(),
    category: z.string().nullable(),
    hasBoxImage: z.boolean().optional(),
    hasColorVariantImages: z.boolean().optional(),
  }),
});

export const ThumbnailGenerationListResponseSchema = z.object({
  items: z.array(ThumbnailGenerationItemSchema),
  total: z.number(),
});

// ─── 트래킹 ──────────────────────────────────────────────

export const ThumbnailTrackingRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  generationId: z.string(),
  originalGrade: z.string(),
  originalScore: z.number(),
  appliedAt: z.string(),
  daysElapsed: z.number(),
  status: z.string(),
  ctrBefore: z.number().nullable(),
  ctrAfter: z.number().nullable(),
  ctrChange: z.number().nullable(),
  reviewsBefore: z.number().nullable(),
  reviewsAfter: z.number().nullable(),
  salesBefore: z.number().nullable(),
  salesAfter: z.number().nullable(),
});

export const ThumbnailTrackingListResponseSchema = z.object({
  items: z.array(ThumbnailTrackingRecordSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const UpdateThumbnailTrackingMetricsSchema = z
  .object({
    ctrBefore: z.number().optional(),
    ctrAfter: z.number().optional(),
    reviewsBefore: z.number().optional(),
    reviewsAfter: z.number().optional(),
    salesBefore: z.number().optional(),
    salesAfter: z.number().optional(),
    status: z.string().optional(),
  })
  .strict();

export type ThumbnailScores = z.infer<typeof ThumbnailScoresSchema>;
export type EditAnalysisResult = z.infer<typeof EditAnalysisResultSchema>;
export type ComplianceScores = z.infer<typeof ComplianceScoresSchema>;
export type ThumbnailAnalysisResult = z.infer<typeof ThumbnailAnalysisResultSchema>;
export type ThumbnailAnalysisSummary = z.infer<typeof ThumbnailAnalysisSummarySchema>;
export type ThumbnailAnalysisListResponse = z.infer<typeof ThumbnailAnalysisListResponseSchema>;
export type ThumbnailGenerationItem = z.infer<typeof ThumbnailGenerationItemSchema>;
export type ThumbnailGenerationListResponse = z.infer<typeof ThumbnailGenerationListResponseSchema>;
export type ThumbnailTrackingRecord = z.infer<typeof ThumbnailTrackingRecordSchema>;
export type ThumbnailTrackingListResponse = z.infer<typeof ThumbnailTrackingListResponseSchema>;
export type UpdateThumbnailTrackingMetricsInput = z.infer<typeof UpdateThumbnailTrackingMetricsSchema>;
