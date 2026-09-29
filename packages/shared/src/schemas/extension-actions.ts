import { z } from 'zod';

/**
 * 웹앱·팝업이 확장 새 런타임에 보내는 **한 번에 끝나는 액션**(entry 액션)의 이름과 메시지 모양(KID-366 wave8a).
 * 옛 워커(`orders/worker.js`·`coupang/worker.js`)가 답하던 액션을 같은 이름으로 새 런타임이 답한다 — 메시지 봉투는
 * `{ action, ...fields }` → `{ success: true, ... } | { success: false, errorCode, error, details? }` 그대로다.
 * 실행(operation)이 아니다: 서버 사실을 쓰지 않고, 파일·확인 결과를 부른 쪽에 바로 돌려준다.
 * 여러 단계·사이트를 도는 일(셀피아 전송·후처리·송장, 송장 업로드, 배송 목록)은 kind다(wave8b).
 *
 * capability: 새 런타임이 있으면 `operationRuntime`, 아래 묶음마다 하나씩 더 낸다. 웹 감지 기본값은 `operationRuntime`.
 */
export const EXTENSION_RUNTIME_CAPABILITY = 'operationRuntime' as const;
/** 몰 로그인 테스트·확인(`testMallLogin`·`checkMallLogin`). 옛 `mallLoginTestV1`·`mallLoginCheckV2`를 대신한다. */
export const MALL_LOGIN_ACTIONS_CAPABILITY = 'mallLoginActionsV1' as const;
/** 쿠팡 공급사 배송 화면 열기·PDF 묶음·쿠키 정리. 옛 `coupangShipmentDownloads`·`collectCoupangShipmentFiles`·`clearCoupangCookies`. */
export const COUPANG_SHIPMENT_ACTIONS_CAPABILITY = 'coupangShipmentActionsV1' as const;
/** 몰 사진 호스팅(`hostPublicImages`). 옛 `publicImageHostV1`. */
export const MALL_IMAGE_HOST_CAPABILITY = 'mallImageHostV1' as const;
/** 몰 카테고리 읽기(`listMallCategories`). 옛 `mallCategoryLookup`. */
export const MALL_CATEGORY_READ_CAPABILITY = 'mallCategoryReadV1' as const;
/** Wing 재고 내보내기(`exportWingInventoryWorkbook`, 팝업·콘텐츠 스크립트가 부른다). */
export const WING_INVENTORY_EXPORT_CAPABILITY = 'wingInventoryExportV1' as const;

const failure = z.object({
  success: z.literal(false),
  errorCode: z.string().min(1).max(100),
  error: z.string().min(1),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();
export const ExtensionActionFailureSchema = failure;
export type ExtensionActionFailure = z.infer<typeof failure>;

// ── 인증·ping ──────────────────────────────────────────────────────────────────

export const PING_ACTION = 'ping' as const;
export const PingResponseSchema = z.object({
  success: z.literal(true),
  version: z.string().min(1),
  capabilities: z.record(z.string(), z.boolean()),
}).strict();
export type PingResponse = z.infer<typeof PingResponseSchema>;

export const SET_AUTH_TOKEN_ACTION = 'setAuthToken' as const;
export const CLEAR_AUTH_TOKEN_ACTION = 'clearAuthToken' as const;
/** 토큰은 확장의 프로필 저장소(보내는 창의 origin이 정하는 환경)에만 남고 응답·로그에 되돌아오지 않는다. */
export const SetAuthTokenMessageSchema = z.object({
  action: z.literal(SET_AUTH_TOKEN_ACTION),
  token: z.string().min(1),
}).strict();
export const ClearAuthTokenMessageSchema = z.object({ action: z.literal(CLEAR_AUTH_TOKEN_ACTION) }).strict();
export const AuthTokenResponseSchema = z.object({
  success: z.literal(true),
  /** 보내는 창의 origin으로 정한 환경(`local`·`office`). */
  environmentId: z.string().min(1),
}).strict();

// ── 몰 로그인 테스트·확인 ─────────────────────────────────────────────────────────

export const TEST_MALL_LOGIN_ACTION = 'testMallLogin' as const;
export const CHECK_MALL_LOGIN_ACTION = 'checkMallLogin' as const;

/** 로그인 테스트에 실을 자격 — 실행의 `credentials`와 같은 규칙: 메모리에만, 응답·로그에 없음. */
export const MallLoginTestCredentialsSchema = z.object({
  loginId: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  supplierLoginId: z.string().min(1).max(200).nullable().optional(),
}).strict();

export const TestMallLoginMessageSchema = z.object({
  action: z.literal(TEST_MALL_LOGIN_ACTION),
  mallKey: z.string().min(1).max(64),
  credentials: MallLoginTestCredentialsSchema,
  /** 몰 관리자 주소가 계정마다 다른 몰(예: 카페24 몰)의 사이트 주소. */
  siteUrl: z.string().url().optional(),
}).strict();
export const TestMallLoginResponseSchema = z.object({
  success: z.literal(true),
  /** 로그인 폼을 보내긴 했는가. */
  submitted: z.boolean(),
  /** 보낸 뒤 로그인된 화면을 확인했는가. */
  verified: z.boolean(),
  /** 몰이 보여 준 문장(있으면). 자격은 싣지 않는다. */
  mallMessage: z.string().max(500).nullable(),
  /**
   * 로그인 안 됐으면 registry 코드, 됐으면 null. 판정→코드: 본인확인 화면 `SITE_VERIFICATION_REQUIRED`,
   * 폼 없음 `MALL_CONTRACT_CHANGED`, 지원 안 하는 몰 `MALL_LOGIN_UNSUPPORTED`, 거절·폼 잔존 `MALL_LOGIN_REJECTED`,
   * 결과 미확인 `MALL_LOGIN_UNCONFIRMED`, 로그인 페이지 못 엶 `MALL_LOGIN_PAGE_UNREACHABLE`.
   * 이미 로그인돼 있으면 `submitted:false, verified:true, errorCode:null`.
   */
  errorCode: z.string().max(100).nullable(),
}).strict();

export const MALL_LOGIN_STATES = ['signed_in', 'verification_required', 'signed_out'] as const;
export const MallLoginStateSchema = z.enum(MALL_LOGIN_STATES);
export const CheckMallLoginMessageSchema = z.object({
  action: z.literal(CHECK_MALL_LOGIN_ACTION),
  mallKey: z.string().min(1).max(64),
  siteUrl: z.string().url().optional(),
}).strict();
export const CheckMallLoginResponseSchema = z.object({
  success: z.literal(true),
  mallKey: z.string().min(1),
  state: MallLoginStateSchema,
  /** 판정 이유 코드(`login_page`·`login_required_response`·`redirected_away`·`network_error`·…). 웹 툴팁이 문장으로 바꾼다. */
  reason: z.string().max(64).nullable(),
}).strict();

// ── 쿠팡 공급사 배송 화면 ─────────────────────────────────────────────────────────

export const OPEN_COUPANG_SHIPMENT_PAGE_ACTION = 'openCoupangShipmentPage' as const;
export const OpenCoupangShipmentPageMessageSchema = z.object({
  action: z.literal(OPEN_COUPANG_SHIPMENT_PAGE_ACTION),
  url: z.string().url(),
}).strict();
export const OpenCoupangShipmentPageResponseSchema = z.object({
  success: z.literal(true),
  tabId: z.number().int(),
  url: z.string().url(),
}).strict();

export const FETCH_COUPANG_SHIPMENT_PDF_BATCH_ACTION = 'fetchCoupangShipmentPdfBatch' as const;
export const COUPANG_SHIPMENT_PDF_KINDS = ['label', 'manifest'] as const;
export const FetchCoupangShipmentPdfBatchMessageSchema = z.object({
  action: z.literal(FETCH_COUPANG_SHIPMENT_PDF_BATCH_ACTION),
  items: z.array(z.object({ seq: z.string().min(1), kind: z.enum(COUPANG_SHIPMENT_PDF_KINDS) }).strict()).min(1).max(200),
}).strict();
export const CoupangShipmentPdfFileSchema = z.object({
  seq: z.string().min(1),
  kind: z.enum(COUPANG_SHIPMENT_PDF_KINDS),
  ok: z.boolean(),
  /** base64 PDF(성공했을 때). 파일은 부른 쪽(웹)이 합친다 — 서버 사실이 아니다. */
  b64: z.string().nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  /** 한 장의 실패 이유. 쿠키 과다(400·413·431)는 장별 실패가 아니라 액션 전체가 `SITE_COOKIE_BLOAT`로 실패한다. */
  error: z.string().max(200).nullable(),
}).strict();
export const FetchCoupangShipmentPdfBatchResponseSchema = z.object({
  success: z.literal(true),
  files: z.array(CoupangShipmentPdfFileSchema),
}).strict();

export const CLEAR_COUPANG_COOKIES_ACTION = 'clearCoupangCookies' as const;
export const ClearCoupangCookiesMessageSchema = z.object({ action: z.literal(CLEAR_COUPANG_COOKIES_ACTION) }).strict();
export const ClearCoupangCookiesResponseSchema = z.object({
  success: z.literal(true),
  cleared: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
}).strict();

// ── 몰 사진 호스팅 · 카테고리 ─────────────────────────────────────────────────────

export const HOST_PUBLIC_IMAGES_ACTION = 'hostPublicImages' as const;
export const HostPublicImagesMessageSchema = z.object({
  action: z.literal(HOST_PUBLIC_IMAGES_ACTION),
  urls: z.array(z.string().url()).min(1).max(20),
}).strict();
export const HostPublicImagesResponseSchema = z.object({
  success: z.literal(true),
  images: z.array(z.object({
    sourceUrl: z.string().url(),
    /** 올린 뒤의 공개 주소. 못 올렸으면 null(`error`에 이유). */
    publicUrl: z.string().url().nullable(),
    error: z.string().max(200).nullable().optional(),
  }).strict()),
}).strict();

export const LIST_MALL_CATEGORIES_ACTION = 'listMallCategories' as const;
export const ListMallCategoriesMessageSchema = z.object({
  action: z.literal(LIST_MALL_CATEGORIES_ACTION),
  mall: z.string().min(1).max(64),
  /** 상위 카테고리 id 경로(비면 최상위). 온채널은 id가 곧 이름이라 `categories[].id`와 `name`이 같다. */
  path: z.array(z.string().min(1)).max(8).default([]),
}).strict();
export const ListMallCategoriesResponseSchema = z.object({
  success: z.literal(true),
  categories: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    hasChildren: z.boolean(),
  }).strict()),
}).strict();

// ── Wing 재고 내보내기(팝업·콘텐츠 스크립트) ───────────────────────────────────────

export const EXPORT_WING_INVENTORY_WORKBOOK_ACTION = 'exportWingInventoryWorkbook' as const;
export const ExportWingInventoryWorkbookMessageSchema = z.object({
  action: z.literal(EXPORT_WING_INVENTORY_WORKBOOK_ACTION),
  rows: z.array(z.record(z.string(), z.unknown())).max(20_000),
}).strict();
export const ExportWingInventoryWorkbookResponseSchema = z.object({
  success: z.literal(true),
  fileName: z.string().min(1),
  /** base64 xls. 팝업이 내려받는다. */
  b64: z.string().min(1),
}).strict();

/** 이 wave가 새 런타임으로 옮기는 entry 액션 이름 전부(옛 워커 삭제 뒤 웹이 부를 수 있는 목록). */
export const EXTENSION_ENTRY_ACTIONS = [
  PING_ACTION,
  SET_AUTH_TOKEN_ACTION,
  CLEAR_AUTH_TOKEN_ACTION,
  TEST_MALL_LOGIN_ACTION,
  CHECK_MALL_LOGIN_ACTION,
  OPEN_COUPANG_SHIPMENT_PAGE_ACTION,
  FETCH_COUPANG_SHIPMENT_PDF_BATCH_ACTION,
  CLEAR_COUPANG_COOKIES_ACTION,
  HOST_PUBLIC_IMAGES_ACTION,
  LIST_MALL_CATEGORIES_ACTION,
  EXPORT_WING_INVENTORY_WORKBOOK_ACTION,
] as const;
export type ExtensionEntryAction = (typeof EXTENSION_ENTRY_ACTIONS)[number];
