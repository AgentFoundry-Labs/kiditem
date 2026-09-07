import { z } from 'zod';

/**
 * 몰별 상품등록·품절 송신의 전송 규격.
 *
 * 매니페스트의 권위는 서버 도메인 코드(`channels/domain/mall/mall-adapter-manifest.ts`)에
 * 있다. 여기 스키마는 그 값을 화면으로 나르기 위한 것이고, 서버가 자기 타입이 이
 * 규격에 맞는지 컴파일 타임에 확인한다.
 */

export const MallAdapterKindSchema = z.enum([
  'api',
  'extension_form',
  'extension_excel',
  'unknown',
]);
export type MallAdapterKind = z.infer<typeof MallAdapterKindSchema>;

export const MallDifficultySchema = z.enum(['low', 'medium', 'high', 'unknown']);
export type MallDifficulty = z.infer<typeof MallDifficultySchema>;

export const MallWriteAxisSchema = z.enum(['option', 'listing']).nullable();

export const MallProfileFieldSchema = z.enum([
  'shipping',
  'returnPolicy',
  'releaseAddress',
  'returnAddress',
  'asPhone',
]);
export type MallProfileField = z.infer<typeof MallProfileFieldSchema>;

export const MallPreflightRuleSchema = z.enum([
  'mall_category_mapped',
  'notice_attributes',
  'kc_certification',
  'kc_not_expired',
  'images_present',
  'price_positive',
  'option_name_forbids_danpum',
  'charset_korean_english_only',
  'option_count_within_limit',
  'profile_selected',
]);
export type MallPreflightRule = z.infer<typeof MallPreflightRuleSchema>;

export const MallAdapterManifestSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: MallAdapterKindSchema,
  difficulty: MallDifficultySchema,
  unverified: z.boolean(),
  applicable: z.boolean(),
  supports: z.object({
    createListing: z.boolean(),
    updateListing: z.boolean(),
    setStock: MallWriteAxisSchema,
    setSaleStatus: MallWriteAxisSchema,
    soldOut: z.boolean(),
    resume: z.boolean(),
  }),
  hazards: z.object({
    soldOutDeletesListing: z.boolean(),
    suspendAutoDeletesAfterDays: z.number().nullable(),
    irreversibleStates: z.array(z.string()),
    updateResetsApproval: z.boolean(),
    stockWriteOverwritesPrice: z.boolean(),
    requiresOperatorApproval: z.boolean(),
    fullPayloadOnUpdate: z.boolean(),
    resumeRequiresAlternatePath: z.boolean(),
  }),
  limits: z.object({
    maxPerRequest: z.number().nullable(),
    ratePerSecond: z.number().nullable(),
    maxOptionsPerListing: z.number().nullable(),
    minStockValue: z.number().nullable(),
  }),
  preflightRules: z.array(MallPreflightRuleSchema),
  requiredProfileFields: z.array(MallProfileFieldSchema),
  note: z.string(),
});
export type MallAdapterManifestView = z.infer<typeof MallAdapterManifestSchema>;

export const MallListingProfileSchema = z.object({
  id: z.string(),
  channelAccountId: z.string(),
  mallKey: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  asPhone: z.string().nullable(),
  categoryCode: z.string().nullable(),
  namePrefix: z.string().nullable(),
  nameSuffix: z.string().nullable(),
  shippingJson: z.unknown().nullable(),
  returnJson: z.unknown().nullable(),
  addressJson: z.unknown().nullable(),
  /** 실제로 값이 채워진 필드. 검증기가 읽는 것과 같은 판정이다. */
  filledFields: z.array(MallProfileFieldSchema),
  updatedAt: z.string(),
});
export type MallListingProfile = z.infer<typeof MallListingProfileSchema>;

export const UpsertMallListingProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  asPhone: z.string().trim().max(40).nullable().optional(),
  categoryCode: z.string().trim().max(120).nullable().optional(),
  namePrefix: z.string().trim().max(60).nullable().optional(),
  nameSuffix: z.string().trim().max(60).nullable().optional(),
  shippingJson: z.record(z.string(), z.unknown()).nullable().optional(),
  returnJson: z.record(z.string(), z.unknown()).nullable().optional(),
  addressJson: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpsertMallListingProfile = z.infer<typeof UpsertMallListingProfileSchema>;

/** 한 몰의 등록 준비 상태. 화면의 몰 카드 한 장이 이 모양이다. */
export const MallPublishTargetSchema = z.object({
  manifest: MallAdapterManifestSchema,
  /** 주문수집 설정에 계정이 저장돼 있는가. */
  hasCredentials: z.boolean(),
  /** 등록/품절용 ChannelAccount row 로 승격됐는가. */
  channelAccountId: z.string().nullable(),
  profileCount: z.number(),
  defaultProfileId: z.string().nullable(),
  /**
   * ready        보낼 수 있다
   * needs_profile 승격은 됐지만 프로필이 없다
   * needs_promotion 자격증명은 있는데 아직 승격 안 됨
   * needs_account 주문수집 설정에 계정이 없다
   * unsupported  스펙 미확인 또는 판매 채널 아님
   */
  readiness: z.enum([
    'ready',
    'needs_profile',
    'needs_promotion',
    'needs_account',
    'unsupported',
  ]),
});
export type MallPublishTarget = z.infer<typeof MallPublishTargetSchema>;

export const MallPreflightViolationSchema = z.object({
  rule: MallPreflightRuleSchema,
  message: z.string(),
});

export const MallPreflightResultSchema = z.object({
  mallKey: z.string(),
  mallName: z.string(),
  masterProductId: z.string(),
  ok: z.boolean(),
  violations: z.array(MallPreflightViolationSchema),
});
export type MallPreflightResult = z.infer<typeof MallPreflightResultSchema>;

export const MallPreflightProductSchema = z.object({
  masterProductId: z.string(),
  name: z.string(),
  code: z.string(),
  salePrice: z.number().nullable(),
  imageCount: z.number(),
  optionNames: z.array(z.string()),
  hasNotice: z.boolean(),
  hasCertification: z.boolean(),
  results: z.array(MallPreflightResultSchema),
  /** 지금 이 상품을 받을 수 있는 몰 수. */
  eligibleMallCount: z.number(),
});
export type MallPreflightProduct = z.infer<typeof MallPreflightProductSchema>;

export const MallPreflightResponseSchema = z.object({
  asOf: z.string(),
  mallKeys: z.array(z.string()),
  products: z.array(MallPreflightProductSchema),
  total: z.number(),
});
export type MallPreflightResponse = z.infer<typeof MallPreflightResponseSchema>;

/** 품절 송신 후보 한 줄. Phase 0 에서는 dry-run 표시만 하고 보내지 않는다. */
export const MallAvailabilityCandidateSchema = z.object({
  channelListingOptionId: z.string(),
  mallKey: z.string(),
  mallName: z.string(),
  channelAccountName: z.string(),
  productName: z.string(),
  optionName: z.string(),
  sellerSku: z.string().nullable(),
  sellableStock: z.number().nullable(),
  bottleneckCodes: z.array(z.string()),
  desiredState: z.enum(['sold_out', 'on_sale', 'suspended']),
  /** 매니페스트가 이 명령을 그대로 허용하는가. */
  sendable: z.boolean(),
  /** sold_out 이 영구삭제인 몰에서 강등된 경우 실제로 보낼 상태. */
  effectiveState: z.enum(['sold_out', 'on_sale', 'suspended']).nullable(),
  blockedReason: z.string().nullable(),
});
export type MallAvailabilityCandidate = z.infer<typeof MallAvailabilityCandidateSchema>;

export const MallAvailabilityPreviewSchema = z.object({
  candidates: z.array(MallAvailabilityCandidateSchema),
  /** 품절 후보 전체 건수. */
  total: z.number(),
  /** 이번 응답에 실제로 담긴 건수. sendable/blocked 는 이 창 기준이다. */
  loaded: z.number(),
  sendableCount: z.number(),
  blockedCount: z.number(),
});
export type MallAvailabilityPreview = z.infer<typeof MallAvailabilityPreviewSchema>;

/**
 * 쿠팡 리스팅 → 상품정보고시 역추출 결과.
 *
 * `certificationsCreated` 는 항상 0 이다 — Wing 상품목록에는 KC 인증번호가 없다.
 * 이 값이 0 이 아니게 되는 날은 다른 원천을 붙인 날이다.
 */
export const MallNoticeBackfillResultSchema = z.object({
  dryRun: z.boolean(),
  sourceListings: z.number(),
  candidateProducts: z.number(),
  skippedManual: z.number(),
  created: z.number(),
  updated: z.number(),
  categoryUnconfident: z.number(),
  /** 고시 항목별로 값이 채워진 상품 수. */
  fieldFillCounts: z.record(z.string(), z.number()),
  /** 고시 항목별로 여전히 비어 있는 상품 수. */
  stillMissingCounts: z.record(z.string(), z.number()),
  certificationsCreated: z.number(),
  note: z.string(),
});
export type MallNoticeBackfillResult = z.infer<typeof MallNoticeBackfillResultSchema>;
