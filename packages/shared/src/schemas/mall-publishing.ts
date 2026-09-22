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
  'kc_certification',
  'images_present',
  'price_positive',
  'option_name_forbids_danpum',
  'charset_korean_english_only',
  'option_count_within_limit',
  'profile_selected',
  'out_of_stock',
]);
export type MallPreflightRule = z.infer<typeof MallPreflightRuleSchema>;

/**
 * 품절을 보내는 길. 매니페스트가 소유하고 화면은 읽기만 한다.
 *
 * `mall_admin` 하나뿐인 것이 방침이다 — 사방넷 기능을 흡수하고 사방넷을 그만 쓴다(KID-251).
 */
export const MallSoldOutRouteSchema = z.enum(['mall_admin']).nullable();
export type MallSoldOutRoute = z.infer<typeof MallSoldOutRouteSchema>;

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
  soldOutRoute: MallSoldOutRouteSchema,
  /**
   * 판매 재개(품절 해제)를 보내는 길. 품절 길이 있고 몰이 해제를 받으면 같은 길이다 — 쇼핑몰 현황이
   * 품절관리 · 판매재개를 칸 둘로 가른다(사장님 2026-09-19).
   */
  resumeRoute: MallSoldOutRouteSchema,
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

/**
 * 한 몰의 등록 준비 상태.
 *
 * ready          보낼 수 있다
 * needs_profile  계정은 있지만 등록 기본값(`config.listingProfile`)이 없다
 * needs_account  계정 행이 없거나 로그인이 저장돼 있지 않다 — 쇼핑몰 계정 화면에서 연결한다
 * unsupported    스펙 미확인 또는 판매 채널 아님
 */
export const MallPublishReadinessSchema = z.enum([
  'ready',
  'needs_profile',
  'needs_account',
  'unsupported',
]);
export type MallPublishReadiness = z.infer<typeof MallPublishReadinessSchema>;

/** 한 몰의 등록 준비 상태. 화면의 몰 카드 한 장이 이 모양이다. */
export const MallPublishTargetSchema = z.object({
  manifest: MallAdapterManifestSchema,
  /** 몰 계정에 로그인이 저장돼 있거나 마켓 연결이 활성인가. */
  hasCredentials: z.boolean(),
  /** 이 몰의 ChannelAccount 행. 없으면 null. */
  channelAccountId: z.string().nullable(),
  /** 계정 행에 등록 기본값 문서가 있는가. */
  hasListingProfile: z.boolean(),
  readiness: MallPublishReadinessSchema,
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
  /** 수집상품 초안의 KC 입력이 송신할 수 있는 상태인가(번호 또는 해당 없음). */
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
    /**
     * 품절을 어느 길로 보내는가.
     *
     * `mall_admin` 은 우리가 그 몰 관리자에 직접 쓰는 구현이 있다는 뜻이고, `null` 은
     * 아직 그 몰을 뚫지 않았다는 뜻이다. 화면은 이 값으로 **왜** 버튼이 없는지 말한다.
     */
    soldOutRoute: MallSoldOutRouteSchema,
  }),
});
export type MallListingMatrixColumn = z.infer<typeof MallListingMatrixColumnSchema>;

export const MallListingMatrixCellSchema = z.object({
  mallKey: z.string(),
  state: MallListingStateSchema,
  /** 몰이 준 원문 상태. 우리 어휘로 접기 전 값이라 툴팁에 그대로 쓴다. */
  rawStatus: z.string().nullable(),
  externalId: z.string().nullable(),
  /** 몰 매장의 상품 페이지 주소. 확인한 규칙이 있는 몰만 — 모르면 null(옛 API 는 이 칸이 없다). */
  productUrl: z.string().nullable().default(null),
  warning: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type MallListingMatrixCell = z.infer<typeof MallListingMatrixCellSchema>;

export const MallListingMatrixRowSchema = z.object({
  masterProductId: z.string(),
  name: z.string(),
  code: z.string(),
  /**
   * 셀피아 상품코드(`10487-1`). 표가 이 번호가 큰 것부터 서므로 화면에 보여야 순서가
   * 읽힌다 — 마스터 코드(`INV-SELLPIA-<uuid>`)는 아무것도 알려주지 않는다.
   * 셀피아 재고에 이어지지 않은 마스터는 null.
   */
  sellpiaCode: z.string().nullable().default(null),
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
  /** 이 몰의 주문이 들어오는가 — 우리 수집기로든, 셀피아 주문수집으로든. */
  collectsOrders: z.boolean(),
  /**
   * 주문이 어느 길로 들어오는가. `kiditem` 은 우리 확장 수집기(로켓은 발주 수집),
   * `sellpia` 는 셀피아가 그 몰에서 직접 가져오는 주문수집이다. 들어오지 않으면 null.
   * 옛 API 가 이 칸을 안 보내도 화면이 서도록 기본값을 둔다.
   */
  orderCollectionVia: z.enum(['kiditem', 'sellpia']).nullable().default(null),
  /** 이 몰에 송장(발송처리)을 올릴 수 있는가(확장에 액션이 있는가). */
  uploadsTracking: z.boolean(),
  listingCount: z.number(),
  orderCount: z.number(),
  /** 이 몰에 올라간 서로 다른 상품 수. */
  productCount: z.number(),
  /**
   * 그 가운데 판매중 리스팅이 있는 상품 수 — 등록 상품 칸은 '판매중/전체'다(사장님 2026-09-19).
   * 옛 API 가 이 칸을 안 보내도 화면이 서도록 기본값을 둔다.
   */
  onSaleProductCount: z.number().default(0),
  /** 활성 리스팅 가운데 판매중인 리스팅 수 — 등록 상품 칸은 '판매중/전체' 리스팅이다. */
  onSaleListingCount: z.number().default(0),
  /** 판매중 리스팅 가운데 활성 옵션이 모두 셀피아 재고에 이어진 리스팅 수 — 매칭률의 분자. */
  onSaleLinkedListingCount: z.number().default(0),
  /**
   * 매칭률 — 이 몰의 활성 옵션 가운데 셀피아 재고 레시피가 붙은 비율의 재료다.
   * 옛 API 가 이 칸을 안 보내도 화면이 서도록 기본값을 둔다(그때는 0/0 이라 '—').
   */
  optionCount: z.number().default(0),
  matchedOptionCount: z.number().default(0),
  /** 판매중 리스팅의 옵션 수와 그 가운데 이어진 수. 화면이 보여 주는 매칭률이다. */
  onSaleOptionCount: z.number().default(0),
  onSaleMatchedOptionCount: z.number().default(0),
  readiness: MallPublishReadinessSchema,
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
  channelAccountId: z.string().uuid(),
  mallKey: z.string(),
  mallName: z.string(),
  channelAccountName: z.string(),
  productName: z.string(),
  optionName: z.string(),
  sellerSku: z.string().nullable(),
  /**
   * 몰이 이 상품에 매긴 코드(`ChannelListing.externalId`).
   *
   * 품절을 보낼 때 몰 화면에서 줄을 짚는 유일한 열쇠다. 몰 관리자에서 직접 가져온
   * 몰(키드키즈·아이스크림몰·꼬망세·온채널)은 `sellerSku` 가 비어 있어서 이 값이
   * 없으면 어느 줄을 골라야 하는지 알 수 없다.
   */
  mallProductCode: z.string(),
  /**
   * 몰이 이 옵션에 매긴 코드(`ChannelListingOption.externalOptionId`, 쿠팡은 옵션ID = vendorItemId).
   * 옵션 단위로 품절을 보내는 몰(쿠팡 윙 = 옵션 재고 0)이 이 줄을 짚는다.
   */
  mallOptionCode: z.string(),
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
  /** 재고 레시피가 없어 품절 · 재판매를 판정할 수 없는 옵션 수. 후보에는 들어가지 않는다. */
  noRecipeCount: z.number(),
});
export type MallAvailabilityPreview = z.infer<typeof MallAvailabilityPreviewSchema>;
