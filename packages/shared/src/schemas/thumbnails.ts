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
// AI 분석 시점에 추정되는 시나리오 + variant 옵션. DB 에는
// ThumbnailAnalysis.recompose Json 으로 저장하되, 앱 레벨 schema 로 shape 를 고정한다.

export const RECOMPOSE_VARIANT_KEYS = ['auto', 'with-box', 'no-box'] as const;
export type RecomposeVariantKey = (typeof RECOMPOSE_VARIANT_KEYS)[number];

export const RECOMPOSE_KINDS = [
  'single-product',
  'single-with-accessories',
  'multi-pack-loose',
  'multi-variant-loose',
  /**
   * 한 SKU 가 다양한 종류의 아이템을 SET 으로 묶어서 판매 (buyer 가 세트 통째 받음).
   * 예: 크리스마스 지우개 8종 set, 동물 마그넷 6종 set, 캐릭터 스티커 묶음.
   * multi-variant-loose 와 차이: variant 는 buyer 가 1개 선택 (옵션) — 같은 모양/다른 색.
   *                              mixed-item-set 은 모두 함께 받음 (set) — 다양한 모양/테마.
   * 박스 유무 무관 (박스 있으면 set 의 일부로 함께 표시).
   */
  'mixed-item-set',
  /**
   * 빛나는 상품 (LED, 전구, 무드등, 조명 데코, 크리스마스 LED 등) 의
   * 사실적 인테리어 무드 컷. 거실/침실/책상/창문/트리 옆 등 실내 컨텍스트 +
   * 조명 켜진 상태 + 자연스러운 보케. CGI/fantasy 룩 금지.
   * lifestyle-context 와 차이: lifestyle-context 는 source 가 이미 라이프스타일
   * 컷 → 흰 스튜디오로 변환 (정반대). lighting-lifestyle 은 source (스튜디오/검정)
   * → 사실적 인테리어 무드 컷 변환 (lighting product 한정).
   */
  'lighting-lifestyle',
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
  contentWorkspaceId: z.string().nullable(),
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
  complianceDistribution: z.object({
    PASS: z.number(),
    WARN: z.number(),
    FAIL: z.number(),
  }),
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

// ─── Canonical status + phase ─────────────────────────
export const THUMBNAIL_PHASES = ['ready', 'applied'] as const;
export type ThumbnailPhase = (typeof THUMBNAIL_PHASES)[number];

export const THUMBNAIL_REGISTRATION_STATUSES = ['uploaded', 'registered', 'failed'] as const;
export type ThumbnailRegistrationStatus = (typeof THUMBNAIL_REGISTRATION_STATUSES)[number];

export const ThumbnailGenerationItemSchema = z.object({
  id: z.string(),
  contentWorkspaceId: z.string(),
  sourceCandidateId: z.string().nullable().optional(),
  originalUrl: z.string().nullable(),
  candidates: z.array(
    z.object({
      id: z.string().uuid().optional(),
      url: z.string(),
      storageKey: z.string().nullable().optional(),
      filename: z.string(),
      sortOrder: z.number().int().nonnegative().optional(),
    }),
  ),
  selectedUrl: z.string().nullable(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  phase: z.enum(THUMBNAIL_PHASES).nullable().optional(),
  grade: z.string(),
  score: z.number(),
  method: z.string().default('generate'),
  editAnalysis: EditAnalysisResultSchema.nullable().default(null),
  inputMeta: z.record(z.string(), z.unknown()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  triggeredByUserId: z.string().uuid().nullable().optional(),
  registrationStatus: z.enum(THUMBNAIL_REGISTRATION_STATUSES).nullable().optional(),
  registrationCheckedAt: z.string().nullable().optional(),
  registrationError: z.string().nullable().optional(),
  createdAt: z.string(),
  contentWorkspace: z.object({
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

export const THUMBNAIL_TRACKING_STATUSES = ['tracking', 'measured', 'inconclusive'] as const;
export type ThumbnailTrackingStatus = (typeof THUMBNAIL_TRACKING_STATUSES)[number];

export const ThumbnailTrackingRecordSchema = z.object({
  id: z.string(),
  channelListingId: z.string(),
  productName: z.string(),
  generationId: z.string(),
  originalGrade: z.string(),
  originalScore: z.number(),
  appliedAt: z.string(),
  daysElapsed: z.number(),
  status: z.enum(THUMBNAIL_TRACKING_STATUSES),
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
    status: z.enum(THUMBNAIL_TRACKING_STATUSES).optional(),
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
export type UpdateThumbnailTrackingMetrics = z.infer<typeof UpdateThumbnailTrackingMetricsSchema>;
