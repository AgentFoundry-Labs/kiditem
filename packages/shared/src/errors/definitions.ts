/**
 * KidItem 오류 코드 레지스트리 (ADR-0023, KID-117).
 *
 * 운영자 화면이 볼 수 있는 모든 오류는 여기 등록된 코드 하나다. 항목마다 owner·kind·HTTP status·
 * 한국어 운영자 문장이 함께 있어, 서버 봉투·웹·확장이 이 표에서 status와 문장을 파생한다. 문장 없는
 * 코드는 등록할 수 없다. 코드는 `UPPER_SNAKE`; 공통 lifecycle 코드는 접두 없음, owner 코드는 owner
 * 접두. 확장이 아직 보내는 소문자 코드는 `EXTENSION_CODE_ALIASES`로 받는다(재설계 세션 KID-338이 옮길 때까지).
 */

export const ERROR_KINDS = [
  'validation',
  'auth',
  'forbidden',
  'not_found',
  'conflict',
  'precondition',
  'in_progress',
  'expired',
  'cancelled',
  'external',
  'internal',
] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

/** kind가 기본으로 뜻하는 HTTP status. 항목이 다른 status를 적으면 항목이 이긴다. */
export const KIND_HTTP_STATUS: Record<ErrorKind, number> = {
  validation: 400,
  auth: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  precondition: 422,
  in_progress: 409,
  expired: 409,
  cancelled: 409,
  external: 502,
  internal: 500,
};

export const ERROR_OWNERS = [
  'common',
  'auth',
  'channels',
  'orders',
  'products',
  'inventory',
  'supply',
  'sourcing',
  'content',
  'advertising',
  'analytics',
  'finance',
  'agent_os',
  'extension',
] as const;
export type ErrorOwner = (typeof ERROR_OWNERS)[number];

export interface ErrorDefinition {
  readonly owner: ErrorOwner;
  readonly kind: ErrorKind;
  readonly httpStatus: number;
  /** 운영자에게 그대로 보이는 한국어 문장. 필수. */
  readonly text: string;
  /** 같은 요청을 다시 보내면 성공할 수 있는가(화면의 "다시 시도" 안내). */
  readonly retryable: boolean;
}

const def = (
  owner: ErrorOwner,
  kind: ErrorKind,
  text: string,
  options: { httpStatus?: number; retryable?: boolean } = {},
): ErrorDefinition => ({
  owner,
  kind,
  httpStatus: options.httpStatus ?? KIND_HTTP_STATUS[kind],
  text,
  retryable: options.retryable ?? false,
});

/**
 * 정본. 새 코드는 여기 한국어 문장과 함께 추가해야 쓸 수 있다(`npm run check:error-codes`).
 * 순서: 공통 lifecycle → 수집 시도 → 확장 원천 → owner별.
 */
export const ERROR_DEFINITIONS = {
  // 공통 lifecycle (접두 없음)
  VALIDATION_FAILED: def('common', 'validation', '입력값이 올바르지 않습니다. 표시된 항목을 확인해 주세요.'),
  AUTH_REQUIRED: def('auth', 'auth', '로그인이 필요합니다. 다시 로그인해 주세요.'),
  FORBIDDEN: def('auth', 'forbidden', '이 작업을 할 권한이 없습니다.'),
  NO_ORGANIZATION_CONTEXT: def('auth', 'auth', '소속 조직을 찾을 수 없습니다. 다시 로그인해 주세요.'),
  NOT_FOUND: def('common', 'not_found', '요청한 항목을 찾을 수 없습니다.'),
  METHOD_NOT_ALLOWED: def('common', 'validation', '지원하지 않는 요청입니다.', { httpStatus: 405 }),
  DB_CONFLICT: def('common', 'conflict', '같은 항목이 이미 있어 저장하지 못했습니다.'),
  STATE_CONFLICT: def('common', 'conflict', '지금 상태와 맞지 않아 처리하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.'),
  RATE_LIMITED: def('common', 'external', '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.', { httpStatus: 429, retryable: true }),
  DB_NOT_FOUND: def('common', 'not_found', '저장된 항목을 찾을 수 없습니다.'),
  DB_ERROR: def('common', 'internal', '데이터를 저장하거나 읽는 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.', { retryable: true }),
  INTERNAL_ERROR: def('common', 'internal', '처리 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.', { retryable: true }),
  SERVICE_UNAVAILABLE: def('common', 'external', '연결된 서비스가 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.', { httpStatus: 503, retryable: true }),
  REQUEST_TIMEOUT: def('common', 'external', '응답이 너무 늦어 요청을 중단했습니다. 다시 시도해 주세요.', { httpStatus: 504, retryable: true }),
  NETWORK_FAILED: def('common', 'external', '네트워크 연결에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.', { retryable: true }),

  // 수집 시도 lifecycle
  ATTEMPT_IN_PROGRESS: def('common', 'in_progress', '같은 수집이 이미 진행 중입니다. 끝나거나 중단한 뒤 다시 시작해 주세요.'),
  ATTEMPT_EXPIRED: def('common', 'expired', '수집 시도가 만료됐습니다. 다시 시작해 주세요.', { retryable: true }),
  ATTEMPT_FENCE_LOST: def('common', 'conflict', '이 수집 시도는 더 이상 유효하지 않습니다. 다시 시작해 주세요.', { retryable: true }),
  ATTEMPT_TERMINAL: def('common', 'conflict', '이미 끝난 수집 시도입니다.'),
  ATTEMPT_PAUSED: def('common', 'in_progress', '몰 요청 제한으로 수집을 잠시 멈췄습니다. 잠시 뒤 이어서 수집해 주세요.', { retryable: true }),
  USER_CANCELLED: def('common', 'cancelled', '운영자가 중단했습니다.'),
  // 실행(operation) 계약 (ADR-0025, KID-353): begin 겹침 하나, fenced 쓰기 거절 하나(details.reason), 404 하나
  OPERATION_IN_PROGRESS: def('common', 'in_progress', '같은 실행이 이미 진행 중입니다. 끝나거나 중단한 뒤 다시 시작해 주세요.'),
  OPERATION_FENCE_LOST: def('common', 'conflict', '이 실행은 더 이상 유효하지 않습니다. 다시 시작해 주세요.', { retryable: true }),
  OPERATION_NOT_FOUND: def('common', 'not_found', '실행을 찾을 수 없습니다.'),
  COLLECTION_CANCELLED: def('common', 'cancelled', '수집이 중단됐습니다.'),
  COLLECTION_WINDOW_OWNER_CONFLICT: def('extension', 'in_progress', '다른 수집이 브라우저 수집 창을 쓰고 있습니다. 끝난 뒤 다시 시작해 주세요.'),
  SOURCE_OWNER_UNAVAILABLE: def('extension', 'external', '확장 프로그램이 수집을 시작하지 못했습니다. 확장 프로그램이 켜져 있는지 확인해 주세요.', { retryable: true }),
  OPERATOR_ACTION_REQUIRED: def('extension', 'precondition', '운영자가 직접 처리해야 하는 단계가 있습니다. 열린 탭을 확인해 주세요.'),
  MALL_LOGIN_REQUIRED: def('extension', 'precondition', '몰에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도해 주세요.'),
  MALL_LOGIN_PAGE_UNREACHABLE: def('extension', 'external', '몰 로그인 페이지를 열지 못했습니다. 잠시 뒤 다시 시도해 주세요.', { retryable: true }),
  MALL_CONTRACT_CHANGED: def('extension', 'external', '몰 화면이 바뀌어 읽지 못했습니다. 개발자에게 알려 주세요.'),
  SELLPIA_MANUAL_MATCH_LOGIN_REQUIRED: def('extension', 'precondition', '셀피아 로그인이 필요합니다. 열린 수동상품매칭 화면에서 로그인한 뒤 다시 시도해 주세요.'),
  SELLPIA_MANUAL_MATCH_TIMEOUT: def('extension', 'external', '셀피아 수동상품매칭 근거 수집 시간이 초과되었습니다.', { retryable: true }),
  SOURCE_SNAPSHOT_INVALID: def('extension', 'validation', '수집 결과가 올바르지 않아 저장하지 않았습니다. 다시 수집해 주세요.'),
  EXTENSION_UNKNOWN_FAILURE: def('extension', 'internal', '확장 프로그램 작업이 실패했습니다. 다시 시도해 주세요.', { retryable: true }),

  // Agent OS · Gateway
  AGENT_OS_GATEWAY_UNAVAILABLE: def('agent_os', 'external', 'AI 게이트웨이에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.', { retryable: true }),
  AGENT_OS_MODEL_REQUIRED: def('agent_os', 'validation', '사용할 AI 모델을 선택해 주세요.'),
  // owner capability 계약(요청 확인값·요청 번호)이 빠진 Agent 호출 — products·channels·sourcing·supply 공통.
  AGENT_OS_OWNER_INPUT_HASH_REQUIRED: def('agent_os', 'validation', '요청 내용 확인값이 없습니다. 요청을 처음부터 다시 보내 주세요.'),
  AGENT_OS_OWNER_IDEMPOTENCY_KEY_REQUIRED: def('agent_os', 'validation', '요청 번호가 없습니다. 요청을 처음부터 다시 보내 주세요.'),

  // channels
  CHANNELS_ACCOUNT_NOT_FOUND: def('channels', 'not_found', '몰 계정이 없습니다. 쇼핑몰 계정 화면에서 먼저 연결해 주세요.'),
  CHANNELS_ACCOUNT_INVALID: def('channels', 'validation', '몰 계정 입력값이 올바르지 않습니다.'),
  CHANNELS_LISTING_EXECUTION_ACTIVE: def('channels', 'in_progress', '이 상품은 이미 몰 등록이 진행 중입니다.'),
  CHANNELS_REGISTRATION_TARGET_CONFLICT: def('channels', 'conflict', '같은 몰 계정에 이미 등록 대상이 있습니다.'),
  CHANNELS_LISTING_NOT_FOUND: def('channels', 'not_found', '몰 상품을 찾을 수 없습니다.'),
  CHANNELS_MALL_UNSUPPORTED: def('channels', 'precondition', '이 몰은 아직 지원하지 않는 작업입니다.', { httpStatus: 501 }),
  // 던지는 곳은 details.reason을 반드시 싣는다. 옛 안내가 구체적이던 사유는 아래 전용 코드로 던진다.
  CHANNELS_PREFLIGHT_FAILED: def('channels', 'precondition', '송신 전 점검을 통과하지 못했습니다. 점검 사유를 확인한 뒤 다시 시도해 주세요.'),
  CHANNELS_SELLPIA_MATCH_REQUIRED: def('channels', 'precondition', '등록 전에 셀피아 상품을 연결하고 차감수량을 확인해 주세요.'),
  CHANNELS_SELLPIA_DEDUCTION_REQUIRED: def('channels', 'validation', '셀피아 상품의 판매 1개당 차감수량을 1 이상의 정수로 입력해 주세요.'),
  CHANNELS_SELLPIA_SKU_UNAVAILABLE: def('channels', 'precondition', '선택한 셀피아 상품을 현재 조직의 활성 재고에서 찾을 수 없습니다. 셀피아 재고를 다시 수집하거나 다른 상품을 골라 주세요.'),
  CHANNELS_SELLPIA_SKU_AMBIGUOUS: def('channels', 'conflict', '같은 셀피아 상품이 이 몰 계정의 여러 상품에 연결돼 있습니다. 몰 상품 연결을 확인해 주세요.'),
  CHANNELS_ACCOUNT_INACTIVE: def('channels', 'precondition', '몰 계정이 비활성 상태입니다. 쇼핑몰 계정 화면에서 활성화한 뒤 다시 시도해 주세요.'),
  CHANNELS_KID_REQUIRED: def('channels', 'precondition', '판매상품에 KID가 아직 없습니다. 등록 설정을 먼저 만든 뒤 다시 시도해 주세요.'),
  CHANNELS_SALES_PRODUCT_NOT_SELLING: def('channels', 'precondition', '판매 중인 판매상품이 아닙니다. 판매상품 상태를 확인한 뒤 다시 시도해 주세요.'),
  CHANNELS_REGISTRATION_TARGET_NOT_FOUND: def('channels', 'not_found', '등록 설정을 찾을 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.'),
  CHANNELS_REGISTRATION_TARGET_STALE: def('channels', 'conflict', '등록 설정이 그사이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.', { retryable: true }),
  CHANNELS_EXECUTION_NOT_FOUND: def('channels', 'not_found', '몰 작업 기록을 찾을 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.'),
  CHANNELS_EXECUTION_FENCE_LOST: def('channels', 'conflict', '이 몰 작업은 더 이상 이 요청이 진행할 수 없습니다. 새로고침한 뒤 다시 시작해 주세요.'),
  CHANNELS_EXECUTION_TERMINAL: def('channels', 'conflict', '이미 끝난 몰 작업입니다. 새로고침해 결과를 확인해 주세요.'),
  CHANNELS_EXECUTION_IDEMPOTENCY_CONFLICT: def('channels', 'conflict', '같은 요청 번호로 다른 내용의 몰 작업이 이미 있습니다. 새로고침한 뒤 다시 시도해 주세요.'),
  CHANNELS_EXECUTION_STALE: def('channels', 'conflict', '준비한 뒤 상품·계정이 바뀌어 이 몰 작업을 진행할 수 없습니다. 다시 준비해 주세요.'),
  CHANNELS_EXECUTION_EVIDENCE_REJECTED: def('channels', 'conflict', '몰에서 확인한 결과가 이 몰 작업과 맞지 않아 반영하지 않았습니다. 몰 화면을 확인해 주세요.'),
  CHANNELS_OPTION_RECIPE_STALE: def('channels', 'conflict', '옵션 구성이 그사이 바뀌었습니다. 새로고침한 뒤 다시 저장해 주세요.', { retryable: true }),
  CHANNELS_THUMBNAIL_EXECUTION_ACTIVE: def('channels', 'in_progress', '이 상품의 대표이미지를 이미 몰에 반영하는 중입니다. 끝나거나 반영 안 됨으로 표시한 뒤 다시 시도해 주세요.'),
  // 개발 서버 전용 자동 반영 — 스테이징·운영은 확장 프로그램으로만 반영한다.
  CHANNELS_SERVER_AUTOMATION_BLOCKED: def('channels', 'precondition', '이 환경에서는 대표이미지를 크롬 확장 프로그램으로만 반영할 수 있습니다. 확장 프로그램에서 반영해 주세요.'),
  CHANNELS_SALES_PRODUCT_NOT_FOUND: def('channels', 'not_found', '판매상품을 찾을 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.'),
  CHANNELS_SALES_PRODUCT_STALE: def('channels', 'conflict', '다른 곳에서 먼저 고쳤습니다. 새로 불러온 뒤 다시 저장해 주세요.', { retryable: true }),
  CHANNELS_SALES_PRODUCT_DRAFT_DELETE_REFUSED: def('channels', 'conflict', '이 판매상품은 초안으로 지울 수 없습니다. 판매 중이거나 몰 상품·등록 실행과 이어진 상품은 보관해 주세요.'),
  CHANNELS_SALES_PRODUCT_DRAFT_NOT_ARCHIVABLE: def('channels', 'conflict', '초안은 보관할 수 없습니다. 쓰지 않을 초안은 삭제해 주세요.'),
  CHANNELS_OPTION_RECIPE_INVALID: def('channels', 'validation', '옵션 구성이 올바르지 않습니다. 구성 상품과 수량을 확인해 주세요.'),
  // 웹 use-mall-publish-run·collected-products 화면이 철자로 비교한다(shared registration-state) — 접두 없음.
  REGISTRATION_ALREADY_REGISTERED: def('channels', 'conflict', '이미 이 몰 계정에 등록된 상품입니다. 몰 상품 목록을 확인해 주세요.'),

  // orders
  // 확장 order-collection-server-converter.js가 body.code를 그대로 저장한다 — 철자 고정(접두 없음).
  NO_NEW_ORDERS: def('orders', 'validation', '새로 들어온 주문이 없습니다.'),
  ORDERS_NO_SELECTION: def('orders', 'validation', '처리할 주문을 선택해 주세요.'),
  ORDERS_UNKNOWN_ACTION: def('orders', 'validation', '지원하지 않는 주문 작업입니다.'),
  ORDERS_CONTINUATION_REJECTED: def('orders', 'conflict', '주문 수집을 이어갈 수 없습니다. 다시 시작해 주세요.', { retryable: true }),
  ORDERS_DIRECTSHIP_DETAIL_MISSING: def('orders', 'precondition', '쿠팡 발주 상세(품목)를 수집하지 못했습니다. 발주를 다시 수집한 뒤 시도해 주세요.'),

  // products
  PRODUCTS_NOT_FOUND: def('products', 'not_found', '상품을 찾을 수 없습니다.'),
  PRODUCTS_STATE_CONFLICT: def('products', 'conflict', '상품 상태가 바뀌어 이 작업을 할 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.'),
  PRODUCTS_SOURCE_REFERENCE_INVALID: def('products', 'precondition', '상품 원천 정보가 이 조직의 상품과 맞지 않습니다.'),
  PRODUCTS_MAPPING_CONFLICT: def('products', 'conflict', '상품 매핑이 동시에 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.', { retryable: true }),

  // inventory · supply
  INVENTORY_NOT_FOUND: def('inventory', 'not_found', '재고 항목을 찾을 수 없습니다.'),
  SELLPIA_SYNC_REQUIRED: def('inventory', 'precondition', '셀피아 재고가 바뀌었습니다. 재고를 다시 수집한 뒤 발주해 주세요.', { httpStatus: 409 }),
  SUPPLY_PURCHASE_ITEM_INACTIVE: def('supply', 'precondition', '발주 항목 중 판매 중이 아닌 상품이 있습니다.'),
  SUPPLY_PURCHASE_REFERENCE_INVALID: def('supply', 'validation', '발주 참조 정보가 올바르지 않습니다.'),
  SUPPLY_SUBMISSION_RECONCILIATION_REQUIRED: def('supply', 'precondition', '이전 발주 제출 결과를 먼저 확인해야 합니다.', { httpStatus: 409 }),
  SUPPLY_ROCKET_FINAL_ORDER_AMBIGUOUS: def('supply', 'conflict', '수집한 로켓 주문이 발주 엑셀의 여러 줄과 맞습니다. 발주 확정 엑셀을 확인해 주세요.'),
  SUPPLY_ROCKET_FINAL_ORDER_BARCODE_MISMATCH: def('supply', 'conflict', '수집한 로켓 주문의 바코드가 발주 엑셀과 다릅니다. 발주 확정 엑셀을 확인해 주세요.'),
  SUPPLY_ROCKET_FINAL_ORDER_ALREADY_COLLECTED: def('supply', 'conflict', '이 발주 엑셀 줄은 이미 다른 주문과 연결돼 있습니다.'),
  SUPPLY_ROCKET_WORKBOOK_LINE_CHANGED: def('supply', 'conflict', '맞추는 동안 발주 엑셀 줄이 바뀌었습니다. 다시 시도해 주세요.', { retryable: true }),
  SUPPLY_ROCKET_COLLECTION_INCOMPLETE: def('supply', 'precondition', '로켓 발주 수집이 끝나지 않았습니다. 수집을 마친 뒤 다시 시도해 주세요.', { httpStatus: 409 }),
  SUPPLY_PROCUREMENT_REFERENCE_INVALID: def('supply', 'validation', '공급 제안·결정 참조가 이 조직의 기록과 맞지 않습니다. 선택한 공급 제안과 결정을 확인해 주세요.'),
  SUPPLY_DECISION_EXPIRED: def('supply', 'expired', '결정 배치가 만료됐거나 더 이상 진행할 수 없습니다. 새 결정을 만든 뒤 다시 시도해 주세요.'),
  SUPPLY_OFFER_SNAPSHOT_EXPIRED: def('supply', 'expired', '공급 제안 스냅숏이 만료됐습니다. 공급 제안을 다시 수집한 뒤 시도해 주세요.'),
  SUPPLY_PURCHASE_STATUS_INVALID: def('supply', 'conflict', '지금 발주 상태에서는 이 작업을 할 수 없습니다. 새로고침한 뒤 발주 상태를 확인해 주세요.'),
  SUPPLY_PURCHASE_LEGACY_ORDER: def('supply', 'precondition', '예전 방식으로 만든 발주라 제출할 수 없습니다. 발주를 새로 만든 뒤 제출해 주세요.'),
  SUPPLY_PURCHASE_PROVIDER_FAILED: def('supply', 'external', '발주처가 주문을 받지 않았습니다. 발주처 화면에서 원인을 확인한 뒤 다시 제출해 주세요.'),
  SUPPLY_ROCKET_RECIPE_REQUIRED: def('supply', 'precondition', '옵션 구성이 확정되지 않은 로켓 발주 줄이 있습니다. 옵션 구성을 확정한 뒤 다시 시도해 주세요.'),
  SUPPLY_ROCKET_PREVIEW_CHANGED: def('supply', 'conflict', '로켓 발주 미리보기가 그사이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.', { retryable: true }),
  SUPPLY_ROCKET_WORKFLOW_ACTIVE: def('supply', 'in_progress', '진행 중인 로켓 발주 확정 작업이 있습니다. 끝내거나 중단한 뒤 다시 시도해 주세요.'),
  SUPPLY_ROCKET_PROBE_REQUIRED: def('supply', 'precondition', '쿠팡 주문이 없다는 것을 확인해야 중단할 수 있습니다. 택배·밀크런 주문을 새로 수집한 뒤 다시 시도해 주세요.'),
  SUPPLY_ROCKET_WORKBOOK_FILE_INVALID: def('supply', 'validation', '로켓 발주 엑셀 파일이 올바르지 않습니다. 파일을 확인한 뒤 다시 올려 주세요.'),
  SUPPLY_ROCKET_TEMPLATE_MISMATCH: def('supply', 'precondition', '로켓 발주 확정 양식이 수집한 발주와 맞지 않습니다. 확장 프로그램을 새로고침하고 발주를 다시 수집해 주세요.'),
  SUPPLY_ROCKET_QUANTITY_EXCEEDED: def('supply', 'validation', '확정 수량이 발주 수량이나 가능한 재고보다 많습니다. 수량을 줄여 주세요.'),

  // sourcing
  SOURCING_NOT_FOUND: def('sourcing', 'not_found', '소싱 후보를 찾을 수 없습니다.'),
  SOURCING_SEARCH_EXTRACTION_FAILED: def('sourcing', 'external', '검색 결과를 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.', { retryable: true }),
  SOURCING_PROVIDER_CONTRACT_CHANGED: def('sourcing', 'external', '소싱 사이트 화면이 바뀌어 읽지 못했습니다. 개발자에게 알려 주세요.'),
  SOURCING_DUPLICATE_RECORD: def('sourcing', 'conflict', '이미 수집된 항목입니다.'),
  SOURCING_COLLECTION_INCOMPLETE: def('sourcing', 'conflict', '수집이 요청한 범위를 다 채우지 못했습니다. 다시 수집해 주세요.', { retryable: true }),
  SOURCING_COLLECTION_INVALID: def('sourcing', 'validation', '확장 프로그램이 보낸 수집 결과를 읽지 못했습니다. 확장 프로그램을 새로고침한 뒤 다시 수집해 주세요.'),
  SOURCING_SOURCE_DISABLED: def('sourcing', 'precondition', '이 수집 원천이 꺼져 있습니다. 수집 설정에서 켠 뒤 다시 시도해 주세요.'),
  SOURCING_ACCOUNT_NOT_FOUND: def('sourcing', 'not_found', '윙 검색에 쓸 쿠팡 계정을 찾을 수 없습니다. 쇼핑몰 계정 설정을 확인해 주세요.'),

  // content (AI)
  CONTENT_GENERATION_FAILED: def('content', 'external', 'AI 생성에 실패했습니다. 잠시 뒤 다시 시도해 주세요.', { retryable: true }),
  CONTENT_MODEL_UNAVAILABLE: def('content', 'external', '선택한 AI 모델을 지금 쓸 수 없습니다.', { retryable: true }),
  // 서버 환경에 AI 모델이 비어 있다 — 운영자가 고르는 AGENT_OS_MODEL_REQUIRED와 다르다. 서버 설정 문제라 503.
  CONTENT_MODEL_NOT_CONFIGURED: def('content', 'external', 'AI 모델이 설정되지 않았습니다. 관리자에게 알려 주세요.', { httpStatus: 503 }),
  CONTENT_GENERATION_INPUT_MISSING: def('content', 'precondition', 'AI 생성에 필요한 이미지나 상품 정보가 없습니다. 먼저 채운 뒤 다시 시도해 주세요.'),
  CONTENT_IMAGE_TOO_LARGE: def('content', 'validation', '이미지 파일이 너무 큽니다. 더 작은 이미지로 다시 올려 주세요.'),
  CONTENT_NOT_FOUND: def('content', 'not_found', '콘텐츠를 찾을 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.'),
  CONTENT_SELECTION_INVALID: def('content', 'validation', '선택한 이미지나 상세페이지를 이 작업에 쓸 수 없습니다. 다시 선택해 주세요.'),
  CONTENT_ASSET_IN_USE: def('content', 'conflict', '쓰고 있는 이미지라 지울 수 없습니다. 대표이미지나 진행 중인 생성에서 먼저 빼 주세요.'),
  CONTENT_REVISION_REQUIRED: def('content', 'precondition', '저장된 상세페이지가 없습니다. 상세페이지를 먼저 저장해 주세요.'),

  // advertising · analytics · finance
  // 확장 content/coupang/ads-report.js가 실행 보고 거절의 body.code를 그대로 읽는다 — 철자 고정(접두 없음).
  EXECUTION_REPORT_MANUAL_ACTION: def('advertising', 'conflict', '자동 실행하지 않는 액션이라 실행 보고를 받지 않았습니다. 광고센터에서 직접 처리해 주세요.'),
  EXECUTION_TASK_NOT_LATEST: def('advertising', 'conflict', '실행 보고를 반영할 수 없습니다. 보고한 실행 시도가 이 액션의 최신 시도가 아닙니다.'),
  EXECUTION_TASK_EXPIRED: def('advertising', 'conflict', '실행 보고를 반영할 수 없습니다. 실행 기한이 지나 이 실행 시도를 실패로 닫았습니다.'),
  EXECUTION_REPORT_INVALID_TRANSITION: def('advertising', 'conflict', '실행 보고를 반영할 수 없습니다. 최근 실행 작업 상태와 맞지 않습니다.'),
  ADVERTISING_RESULT_UNREADABLE: def('advertising', 'external', '광고센터 결과를 읽지 못했습니다. 잠시 뒤 다시 수집해 주세요.', { retryable: true }),
  // 키워드·경쟁사 수집 kind(KID-362 K-a).
  ADVERTISING_ACCOUNT_NOT_FOUND: def('advertising', 'not_found', '윙 검색에 쓸 쿠팡 계정을 찾을 수 없습니다. 쇼핑몰 계정 설정을 확인해 주세요.'),
  ADVERTISING_COLLECTION_INCOMPLETE: def('advertising', 'conflict', '수집이 요청한 범위를 다 채우지 못했습니다. 다시 수집해 주세요.', { retryable: true }),
  ADVERTISING_TRACKED_TARGETS_CHANGED: def('advertising', 'conflict', '수집하는 동안 추적 상품이 바뀌었습니다. 다시 수집해 주세요.', { retryable: true }),
  ADVERTISING_TRACKED_PRODUCT_LIMIT: def('advertising', 'precondition', '추적 상품이 300개를 넘어 한 번에 수집할 수 없습니다. 추적을 줄인 뒤 다시 시도해 주세요.'),
  ADVERTISING_TRACKED_KEYWORDS_INCOMPLETE: def('advertising', 'validation', '추적 상품의 수집 키워드가 요청에 모두 들어 있지 않습니다. 추적 키워드를 확인해 주세요.'),
  ADVERTISING_TRACKED_PRODUCT_NOT_FOUND: def('advertising', 'conflict', '윙 검색에서 찾지 못한 추적 상품이 있습니다. 추적 키워드를 확인한 뒤 다시 수집해 주세요.'),
  ANALYTICS_QUERY_FAILED: def('analytics', 'internal', '통계를 계산하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', { retryable: true }),
  FINANCE_QUERY_FAILED: def('finance', 'internal', '재무 데이터를 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.', { retryable: true }),
} as const satisfies Record<string, ErrorDefinition>;

export type KiditemErrorCode = keyof typeof ERROR_DEFINITIONS;

export const ERROR_CODES = Object.keys(ERROR_DEFINITIONS) as KiditemErrorCode[];

export function isKiditemErrorCode(value: unknown): value is KiditemErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, value);
}

export function errorDefinition(code: KiditemErrorCode): ErrorDefinition {
  return ERROR_DEFINITIONS[code];
}

/**
 * 확장·옛 서버가 아직 보내는 코드를 등록 코드로 잇는 표. 왼쪽 철자는 바꾸지 않는다(확장 재설계 KID-338이
 * 보내는 쪽을 바꾸면 그때 지운다). 저장된 attempt `errorCode`도 이 표로 다시 읽는다.
 */
export const EXTENSION_CODE_ALIASES: Readonly<Record<string, KiditemErrorCode>> = {
  auth_required: 'AUTH_REQUIRED',
  insufficient_role: 'FORBIDDEN',
  no_organization_context: 'NO_ORGANIZATION_CONTEXT',
  request_timeout: 'REQUEST_TIMEOUT',
  network_error: 'NETWORK_FAILED',
  network_failed: 'NETWORK_FAILED',
  invalid_request: 'VALIDATION_FAILED',
  unknown_failure: 'EXTENSION_UNKNOWN_FAILURE',
  login_required: 'MALL_LOGIN_REQUIRED',
  marketplace_login: 'MALL_LOGIN_REQUIRED',
  login_page_not_reachable: 'MALL_LOGIN_PAGE_UNREACHABLE',
  operator_action_required: 'OPERATOR_ACTION_REQUIRED',
  provider_contract_changed: 'SOURCING_PROVIDER_CONTRACT_CHANGED',
  collection_window_owner_conflict: 'COLLECTION_WINDOW_OWNER_CONFLICT',
  search_extraction_failed: 'SOURCING_SEARCH_EXTRACTION_FAILED',
  gateway_provider_unavailable: 'AGENT_OS_GATEWAY_UNAVAILABLE',
  SOURCE_ATTEMPT_TERMINAL: 'ATTEMPT_TERMINAL',
  sellpia_manual_match_login_required: 'SELLPIA_MANUAL_MATCH_LOGIN_REQUIRED',
  sellpia_manual_match_contract_drift: 'MALL_CONTRACT_CHANGED',
  sellpia_manual_match_invalid_snapshot: 'SOURCE_SNAPSHOT_INVALID',
  sellpia_manual_match_timeout: 'SELLPIA_MANUAL_MATCH_TIMEOUT',
  sellpia_manual_match_network_failed: 'NETWORK_FAILED',
  SOURCE_ATTEMPT_IN_PROGRESS: 'ATTEMPT_IN_PROGRESS',
  ROCKET_PO_COLLECTION_INCOMPLETE: 'SUPPLY_ROCKET_COLLECTION_INCOMPLETE',
  COMMON_NOT_FOUND: 'NOT_FOUND',
  COMMON_BAD_REQUEST: 'VALIDATION_FAILED',
  COMMON_INTERNAL_ERROR: 'INTERNAL_ERROR',
  COMMON_DB_ERROR: 'DB_ERROR',
  COMMON_UNAUTHORIZED: 'AUTH_REQUIRED',
  COMMON_SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  PRODUCT_NOT_FOUND: 'PRODUCTS_NOT_FOUND',
  PRODUCT_SOURCE_REFERENCE_INVALID: 'PRODUCTS_SOURCE_REFERENCE_INVALID',
  ORDER_NO_SELECTION: 'ORDERS_NO_SELECTION',
  ORDER_UNKNOWN_ACTION: 'ORDERS_UNKNOWN_ACTION',
  PURCHASE_ITEM_INACTIVE: 'SUPPLY_PURCHASE_ITEM_INACTIVE',
  PURCHASE_REFERENCE_INVALID: 'SUPPLY_PURCHASE_REFERENCE_INVALID',
  PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED: 'SUPPLY_SUBMISSION_RECONCILIATION_REQUIRED',
  ROCKET_COLLECTION_INCOMPLETE: 'SUPPLY_ROCKET_COLLECTION_INCOMPLETE',
  AI_MODEL_UNAVAILABLE: 'CONTENT_MODEL_UNAVAILABLE',
  AI_GENERATION_FAILED: 'CONTENT_GENERATION_FAILED',
  SOURCING_SCRAPE_FAILED: 'SOURCING_SEARCH_EXTRACTION_FAILED',
};

/**
 * 임의 문자열을 등록 코드로 푼다: 등록 코드 그대로 → alias → 대문자·`-`→`_` 정규화가 등록 코드면 그것.
 * 어느 것도 아니면 `null`(모르는 코드는 화면이 원천별 일반 문장을 쓴다).
 */
export function resolveErrorCode(raw: unknown): KiditemErrorCode | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (isKiditemErrorCode(trimmed)) return trimmed;
  const alias = EXTENSION_CODE_ALIASES[trimmed];
  if (alias) return alias;
  const normalized = trimmed.toUpperCase().replace(/[-\s]+/g, '_');
  return isKiditemErrorCode(normalized) ? normalized : null;
}
