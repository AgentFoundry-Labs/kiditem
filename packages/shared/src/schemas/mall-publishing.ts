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

/**
 * 상품 × 몰 등록 현황 매트릭스.
 *
 * 행이 우리 상품, 열이 몰, 칸이 그 몰에서의 상태다. 판정 규칙은 서버 도메인
 * (`channels/domain/mall/mall-listing-state.ts`)이 소유하고 여기는 나르기만 한다.
 */
export const MallListingStateSchema = z.enum([
  'published',
  'reviewing',
  'preparing',
  'error',
  'paused',
  'discontinued',
  'unknown',
  'unregistered',
]);
export type MallListingState = z.infer<typeof MallListingStateSchema>;

export const MallListingMatrixColumnSchema = z.object({
  mallKey: z.string(),
  mallName: z.string(),
  channelAccountId: z.string().nullable(),
  /** 이 몰로 새로 보낼 수 있는가. 어댑터가 있는 몰만 참이다. */
  hasAdapter: z.boolean(),
  /** 이 몰의 리스팅을 우리가 한 번이라도 가져왔는가. */
  imported: z.boolean(),
  /** 이 몰이 들고 있는 활성 리스팅 수. */
  listingCount: z.number(),
  /**
   * 이 몰에서 우리가 할 수 있는 일.
   *
   * 매니페스트가 유일한 권위다. 화면은 이 값으로 메뉴를 켜고 끄며 상수로 다시
   * 적지 않는다. `soldOutDeletesListing` 이 참이면 완전품절이 삭제라 되돌릴 수
   * 없고, 그건 버튼을 누르기 전에 보여야 하는 사실이다.
   */
  actions: z.object({
    createListing: z.boolean(),
    updateListing: z.boolean(),
    soldOut: z.boolean(),
    resume: z.boolean(),
    setStock: z.boolean(),
    soldOutDeletesListing: z.boolean(),
    requiresOperatorApproval: z.boolean(),
  }),
});
export type MallListingMatrixColumn = z.infer<typeof MallListingMatrixColumnSchema>;

export const MallListingMatrixCellSchema = z.object({
  mallKey: z.string(),
  state: MallListingStateSchema,
  /** 몰이 준 원문 상태. 우리 어휘로 접기 전 값이라 툴팁에 그대로 쓴다. */
  rawStatus: z.string().nullable(),
  externalId: z.string().nullable(),
  warning: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type MallListingMatrixCell = z.infer<typeof MallListingMatrixCellSchema>;

export const MallListingMatrixRowSchema = z.object({
  masterProductId: z.string(),
  name: z.string(),
  code: z.string(),
  /**
   * 상품 사진.
   *
   * 마스터에는 저장돼 있지 않다. 몰 리스팅에 붙은 콘텐츠 워크스페이스가 가진
   * 대표 이미지를 회수한다. 없으면 null 이고 화면이 머리글자 타일로 대신한다.
   */
  imageUrl: z.string().nullable(),
  /** 리스팅에서 회수한 카테고리. 마스터에는 저장돼 있지 않다. */
  category: z.string().nullable(),
  /** 셀피아 재고 합. 연결이 없으면 null 이고 0 과 구별한다. */
  stock: z.number().nullable(),
  publishedCount: z.number(),
  cells: z.array(MallListingMatrixCellSchema),
  updatedAt: z.string(),
});
export type MallListingMatrixRow = z.infer<typeof MallListingMatrixRowSchema>;

/** 표를 무엇으로 좁힐 것인가. 기본은 등록된 것 — 전체는 대부분 빈 행이다. */
export const MallMatrixFilterSchema = z.enum(['all', 'listed', 'unlisted']);
export type MallMatrixFilter = z.infer<typeof MallMatrixFilterSchema>;

export const MallListingMatrixResponseSchema = z.object({
  filter: MallMatrixFilterSchema,
  columns: z.array(MallListingMatrixColumnSchema),
  rows: z.array(MallListingMatrixRowSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});
export type MallListingMatrixResponse = z.infer<typeof MallListingMatrixResponseSchema>;

/**
 * 연결된 몰 한 곳의 요약. 쇼핑몰 관리 허브 화면의 카드 한 장이 이 모양이다.
 *
 * 숫자는 전부 우리 DB 에서 센 것이다. 몰에 물어본 값이 아니다 — 우리가 가져온
 * 만큼만 알고, 그 차이는 `imported` 가 말한다.
 */
export const MallChannelSummarySchema = z.object({
  mallKey: z.string(),
  mallName: z.string(),
  channelAccountId: z.string().nullable(),
  /** 등록 어댑터가 있는가. 상품을 보낼 수 있는 몰. */
  canPublish: z.boolean(),
  /** 주문수집 자격증명이 저장돼 있는가. */
  hasCredentials: z.boolean(),
  /** 리스팅을 가져온 적이 있는가. */
  imported: z.boolean(),
  /** 이 몰에서 주문을 수집할 수 있는가(서버에 변환 경로가 있는가). */
  collectsOrders: z.boolean(),
  /** 이 몰에 송장(발송처리)을 올릴 수 있는가(확장에 액션이 있는가). */
  uploadsTracking: z.boolean(),
  listingCount: z.number(),
  orderCount: z.number(),
  /** 이 몰에 올라간 서로 다른 상품 수. */
  productCount: z.number(),
  readiness: z.enum(['ready', 'needs_profile', 'needs_promotion', 'needs_account', 'unsupported']),
});
export type MallChannelSummary = z.infer<typeof MallChannelSummarySchema>;

export const MallChannelOverviewSchema = z.object({
  /** 허브 중앙에 놓이는 우리 쪽 숫자. */
  shop: z.object({
    productCount: z.number(),
    connectedChannelCount: z.number(),
    publishableChannelCount: z.number(),
  }),
  channels: z.array(MallChannelSummarySchema),
});
export type MallChannelOverview = z.infer<typeof MallChannelOverviewSchema>;

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
