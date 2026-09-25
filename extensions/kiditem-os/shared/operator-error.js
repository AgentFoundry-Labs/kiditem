// 생성 파일입니다. 고치지 마세요.
// 원본: packages/shared/src/errors/definitions.ts, packages/shared/src/errors/operator-error.ts (ADR-0023)
// 생성: node scripts/generate-operator-error.mjs
//
// 확장은 빌드가 없어 공유 패키지를 그대로 쓸 수 없다. 이 파일을 싣는 쪽은 `self.KidItemOperatorError`로
// 코드를 풀고 운영자 문장을 얻는다. 원본과 다르면 `npm run check:operator-error-sync`가 막는다.
(function initializeOperatorError(root) {
  "use strict";

  function deepFreeze(value) {
    Object.values(value).forEach(function (child) {
      if (child && typeof child === "object") deepFreeze(child);
    });
    return Object.freeze(value);
  }

  var ERROR_DEFINITIONS = deepFreeze({
    "VALIDATION_FAILED": {
      "owner": "common",
      "kind": "validation",
      "httpStatus": 400,
      "text": "입력값이 올바르지 않습니다. 표시된 항목을 확인해 주세요.",
      "retryable": false
    },
    "AUTH_REQUIRED": {
      "owner": "auth",
      "kind": "auth",
      "httpStatus": 401,
      "text": "로그인이 필요합니다. 다시 로그인해 주세요.",
      "retryable": false
    },
    "FORBIDDEN": {
      "owner": "auth",
      "kind": "forbidden",
      "httpStatus": 403,
      "text": "이 작업을 할 권한이 없습니다.",
      "retryable": false
    },
    "NO_ORGANIZATION_CONTEXT": {
      "owner": "auth",
      "kind": "auth",
      "httpStatus": 401,
      "text": "소속 조직을 찾을 수 없습니다. 다시 로그인해 주세요.",
      "retryable": false
    },
    "NOT_FOUND": {
      "owner": "common",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "요청한 항목을 찾을 수 없습니다.",
      "retryable": false
    },
    "METHOD_NOT_ALLOWED": {
      "owner": "common",
      "kind": "validation",
      "httpStatus": 405,
      "text": "지원하지 않는 요청입니다.",
      "retryable": false
    },
    "DB_CONFLICT": {
      "owner": "common",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "같은 항목이 이미 있어 저장하지 못했습니다.",
      "retryable": false
    },
    "STATE_CONFLICT": {
      "owner": "common",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "지금 상태와 맞지 않아 처리하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "RATE_LIMITED": {
      "owner": "common",
      "kind": "external",
      "httpStatus": 429,
      "text": "요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "DB_NOT_FOUND": {
      "owner": "common",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "저장된 항목을 찾을 수 없습니다.",
      "retryable": false
    },
    "DB_ERROR": {
      "owner": "common",
      "kind": "internal",
      "httpStatus": 500,
      "text": "데이터를 저장하거나 읽는 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "INTERNAL_ERROR": {
      "owner": "common",
      "kind": "internal",
      "httpStatus": 500,
      "text": "처리 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "SERVICE_UNAVAILABLE": {
      "owner": "common",
      "kind": "external",
      "httpStatus": 503,
      "text": "연결된 서비스가 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "REQUEST_TIMEOUT": {
      "owner": "common",
      "kind": "external",
      "httpStatus": 504,
      "text": "응답이 너무 늦어 요청을 중단했습니다. 다시 시도해 주세요.",
      "retryable": true
    },
    "NETWORK_FAILED": {
      "owner": "common",
      "kind": "external",
      "httpStatus": 502,
      "text": "네트워크 연결에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.",
      "retryable": true
    },
    "ATTEMPT_IN_PROGRESS": {
      "owner": "common",
      "kind": "in_progress",
      "httpStatus": 409,
      "text": "같은 수집이 이미 진행 중입니다. 끝나거나 중단한 뒤 다시 시작해 주세요.",
      "retryable": false
    },
    "ATTEMPT_EXPIRED": {
      "owner": "common",
      "kind": "expired",
      "httpStatus": 409,
      "text": "수집 시도가 만료됐습니다. 다시 시작해 주세요.",
      "retryable": true
    },
    "ATTEMPT_FENCE_LOST": {
      "owner": "common",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이 수집 시도는 더 이상 유효하지 않습니다. 다시 시작해 주세요.",
      "retryable": true
    },
    "ATTEMPT_TERMINAL": {
      "owner": "common",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이미 끝난 수집 시도입니다.",
      "retryable": false
    },
    "ATTEMPT_PAUSED": {
      "owner": "common",
      "kind": "in_progress",
      "httpStatus": 409,
      "text": "몰 요청 제한으로 수집을 잠시 멈췄습니다. 잠시 뒤 이어서 수집해 주세요.",
      "retryable": true
    },
    "USER_CANCELLED": {
      "owner": "common",
      "kind": "cancelled",
      "httpStatus": 409,
      "text": "운영자가 중단했습니다.",
      "retryable": false
    },
    "OPERATION_IN_PROGRESS": {
      "owner": "common",
      "kind": "in_progress",
      "httpStatus": 409,
      "text": "같은 실행이 이미 진행 중입니다. 끝나거나 중단한 뒤 다시 시작해 주세요.",
      "retryable": false
    },
    "OPERATION_FENCE_LOST": {
      "owner": "common",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이 실행은 더 이상 유효하지 않습니다. 다시 시작해 주세요.",
      "retryable": true
    },
    "OPERATION_NOT_FOUND": {
      "owner": "common",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "실행을 찾을 수 없습니다.",
      "retryable": false
    },
    "COLLECTION_CANCELLED": {
      "owner": "common",
      "kind": "cancelled",
      "httpStatus": 409,
      "text": "수집이 중단됐습니다.",
      "retryable": false
    },
    "COLLECTION_WINDOW_OWNER_CONFLICT": {
      "owner": "extension",
      "kind": "in_progress",
      "httpStatus": 409,
      "text": "다른 수집이 브라우저 수집 창을 쓰고 있습니다. 끝난 뒤 다시 시작해 주세요.",
      "retryable": false
    },
    "SOURCE_OWNER_UNAVAILABLE": {
      "owner": "extension",
      "kind": "external",
      "httpStatus": 502,
      "text": "확장 프로그램이 수집을 시작하지 못했습니다. 확장 프로그램이 켜져 있는지 확인해 주세요.",
      "retryable": true
    },
    "OPERATOR_ACTION_REQUIRED": {
      "owner": "extension",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "운영자가 직접 처리해야 하는 단계가 있습니다. 열린 탭을 확인해 주세요.",
      "retryable": false
    },
    "MALL_LOGIN_REQUIRED": {
      "owner": "extension",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "몰에 로그인되어 있지 않습니다. 로그인한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "MALL_LOGIN_PAGE_UNREACHABLE": {
      "owner": "extension",
      "kind": "external",
      "httpStatus": 502,
      "text": "몰 로그인 페이지를 열지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "MALL_CONTRACT_CHANGED": {
      "owner": "extension",
      "kind": "external",
      "httpStatus": 502,
      "text": "몰 화면이 바뀌어 읽지 못했습니다. 개발자에게 알려 주세요.",
      "retryable": false
    },
    "SELLPIA_MANUAL_MATCH_LOGIN_REQUIRED": {
      "owner": "extension",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "셀피아 로그인이 필요합니다. 열린 수동상품매칭 화면에서 로그인한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "SELLPIA_MANUAL_MATCH_TIMEOUT": {
      "owner": "extension",
      "kind": "external",
      "httpStatus": 502,
      "text": "셀피아 수동상품매칭 근거 수집 시간이 초과되었습니다.",
      "retryable": true
    },
    "SOURCE_SNAPSHOT_INVALID": {
      "owner": "extension",
      "kind": "validation",
      "httpStatus": 400,
      "text": "수집 결과가 올바르지 않아 저장하지 않았습니다. 다시 수집해 주세요.",
      "retryable": false
    },
    "EXTENSION_UNKNOWN_FAILURE": {
      "owner": "extension",
      "kind": "internal",
      "httpStatus": 500,
      "text": "확장 프로그램 작업이 실패했습니다. 다시 시도해 주세요.",
      "retryable": true
    },
    "AGENT_OS_GATEWAY_UNAVAILABLE": {
      "owner": "agent_os",
      "kind": "external",
      "httpStatus": 502,
      "text": "AI 게이트웨이에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "AGENT_OS_MODEL_REQUIRED": {
      "owner": "agent_os",
      "kind": "validation",
      "httpStatus": 400,
      "text": "사용할 AI 모델을 선택해 주세요.",
      "retryable": false
    },
    "AGENT_OS_OWNER_INPUT_HASH_REQUIRED": {
      "owner": "agent_os",
      "kind": "validation",
      "httpStatus": 400,
      "text": "요청 내용 확인값이 없습니다. 요청을 처음부터 다시 보내 주세요.",
      "retryable": false
    },
    "AGENT_OS_OWNER_IDEMPOTENCY_KEY_REQUIRED": {
      "owner": "agent_os",
      "kind": "validation",
      "httpStatus": 400,
      "text": "요청 번호가 없습니다. 요청을 처음부터 다시 보내 주세요.",
      "retryable": false
    },
    "CHANNELS_ACCOUNT_NOT_FOUND": {
      "owner": "channels",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "몰 계정이 없습니다. 쇼핑몰 계정 화면에서 먼저 연결해 주세요.",
      "retryable": false
    },
    "CHANNELS_ACCOUNT_INVALID": {
      "owner": "channels",
      "kind": "validation",
      "httpStatus": 400,
      "text": "몰 계정 입력값이 올바르지 않습니다.",
      "retryable": false
    },
    "CHANNELS_LISTING_EXECUTION_ACTIVE": {
      "owner": "channels",
      "kind": "in_progress",
      "httpStatus": 409,
      "text": "이 상품은 이미 몰 등록이 진행 중입니다.",
      "retryable": false
    },
    "CHANNELS_REGISTRATION_TARGET_CONFLICT": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "같은 몰 계정에 이미 등록 대상이 있습니다.",
      "retryable": false
    },
    "CHANNELS_LISTING_NOT_FOUND": {
      "owner": "channels",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "몰 상품을 찾을 수 없습니다.",
      "retryable": false
    },
    "CHANNELS_MALL_UNSUPPORTED": {
      "owner": "channels",
      "kind": "precondition",
      "httpStatus": 501,
      "text": "이 몰은 아직 지원하지 않는 작업입니다.",
      "retryable": false
    },
    "CHANNELS_PREFLIGHT_FAILED": {
      "owner": "channels",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "송신 전 점검을 통과하지 못했습니다. 점검 사유를 확인한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_SELLPIA_MATCH_REQUIRED": {
      "owner": "channels",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "등록 전에 셀피아 상품을 연결하고 차감수량을 확인해 주세요.",
      "retryable": false
    },
    "CHANNELS_SELLPIA_DEDUCTION_REQUIRED": {
      "owner": "channels",
      "kind": "validation",
      "httpStatus": 400,
      "text": "셀피아 상품의 판매 1개당 차감수량을 1 이상의 정수로 입력해 주세요.",
      "retryable": false
    },
    "CHANNELS_SELLPIA_SKU_UNAVAILABLE": {
      "owner": "channels",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "선택한 셀피아 상품을 현재 조직의 활성 재고에서 찾을 수 없습니다. 셀피아 재고를 다시 수집하거나 다른 상품을 골라 주세요.",
      "retryable": false
    },
    "CHANNELS_SELLPIA_SKU_AMBIGUOUS": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "같은 셀피아 상품이 이 몰 계정의 여러 상품에 연결돼 있습니다. 몰 상품 연결을 확인해 주세요.",
      "retryable": false
    },
    "CHANNELS_ACCOUNT_INACTIVE": {
      "owner": "channels",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "몰 계정이 비활성 상태입니다. 쇼핑몰 계정 화면에서 활성화한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_KID_REQUIRED": {
      "owner": "channels",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "판매상품에 KID가 아직 없습니다. 등록 설정을 먼저 만든 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_SALES_PRODUCT_NOT_SELLING": {
      "owner": "channels",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "판매 중인 판매상품이 아닙니다. 판매상품 상태를 확인한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_REGISTRATION_TARGET_NOT_FOUND": {
      "owner": "channels",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "등록 설정을 찾을 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_REGISTRATION_TARGET_STALE": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "등록 설정이 그사이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "CHANNELS_EXECUTION_NOT_FOUND": {
      "owner": "channels",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "몰 작업 기록을 찾을 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_EXECUTION_FENCE_LOST": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이 몰 작업은 더 이상 이 요청이 진행할 수 없습니다. 새로고침한 뒤 다시 시작해 주세요.",
      "retryable": false
    },
    "CHANNELS_EXECUTION_TERMINAL": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이미 끝난 몰 작업입니다. 새로고침해 결과를 확인해 주세요.",
      "retryable": false
    },
    "CHANNELS_EXECUTION_IDEMPOTENCY_CONFLICT": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "같은 요청 번호로 다른 내용의 몰 작업이 이미 있습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_EXECUTION_STALE": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "준비한 뒤 상품·계정이 바뀌어 이 몰 작업을 진행할 수 없습니다. 다시 준비해 주세요.",
      "retryable": false
    },
    "CHANNELS_EXECUTION_EVIDENCE_REJECTED": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "몰에서 확인한 결과가 이 몰 작업과 맞지 않아 반영하지 않았습니다. 몰 화면을 확인해 주세요.",
      "retryable": false
    },
    "CHANNELS_OPTION_RECIPE_STALE": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "옵션 구성이 그사이 바뀌었습니다. 새로고침한 뒤 다시 저장해 주세요.",
      "retryable": true
    },
    "CHANNELS_THUMBNAIL_EXECUTION_ACTIVE": {
      "owner": "channels",
      "kind": "in_progress",
      "httpStatus": 409,
      "text": "이 상품의 대표이미지를 이미 몰에 반영하는 중입니다. 끝나거나 반영 안 됨으로 표시한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_SERVER_AUTOMATION_BLOCKED": {
      "owner": "channels",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "이 환경에서는 대표이미지를 크롬 확장 프로그램으로만 반영할 수 있습니다. 확장 프로그램에서 반영해 주세요.",
      "retryable": false
    },
    "CHANNELS_SALES_PRODUCT_NOT_FOUND": {
      "owner": "channels",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "판매상품을 찾을 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CHANNELS_SALES_PRODUCT_STALE": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "다른 곳에서 먼저 고쳤습니다. 새로 불러온 뒤 다시 저장해 주세요.",
      "retryable": true
    },
    "CHANNELS_SALES_PRODUCT_DRAFT_DELETE_REFUSED": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이 판매상품은 초안으로 지울 수 없습니다. 판매 중이거나 몰 상품·등록 실행과 이어진 상품은 보관해 주세요.",
      "retryable": false
    },
    "CHANNELS_SALES_PRODUCT_DRAFT_NOT_ARCHIVABLE": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "초안은 보관할 수 없습니다. 쓰지 않을 초안은 삭제해 주세요.",
      "retryable": false
    },
    "CHANNELS_OPTION_RECIPE_INVALID": {
      "owner": "channels",
      "kind": "validation",
      "httpStatus": 400,
      "text": "옵션 구성이 올바르지 않습니다. 구성 상품과 수량을 확인해 주세요.",
      "retryable": false
    },
    "REGISTRATION_ALREADY_REGISTERED": {
      "owner": "channels",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이미 이 몰 계정에 등록된 상품입니다. 몰 상품 목록을 확인해 주세요.",
      "retryable": false
    },
    "NO_NEW_ORDERS": {
      "owner": "orders",
      "kind": "validation",
      "httpStatus": 400,
      "text": "새로 들어온 주문이 없습니다.",
      "retryable": false
    },
    "ORDERS_NO_SELECTION": {
      "owner": "orders",
      "kind": "validation",
      "httpStatus": 400,
      "text": "처리할 주문을 선택해 주세요.",
      "retryable": false
    },
    "ORDERS_UNKNOWN_ACTION": {
      "owner": "orders",
      "kind": "validation",
      "httpStatus": 400,
      "text": "지원하지 않는 주문 작업입니다.",
      "retryable": false
    },
    "ORDERS_CONTINUATION_REJECTED": {
      "owner": "orders",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "주문 수집을 이어갈 수 없습니다. 다시 시작해 주세요.",
      "retryable": true
    },
    "PRODUCTS_NOT_FOUND": {
      "owner": "products",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "상품을 찾을 수 없습니다.",
      "retryable": false
    },
    "PRODUCTS_STATE_CONFLICT": {
      "owner": "products",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "상품 상태가 바뀌어 이 작업을 할 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "PRODUCTS_SOURCE_REFERENCE_INVALID": {
      "owner": "products",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "상품 원천 정보가 이 조직의 상품과 맞지 않습니다.",
      "retryable": false
    },
    "PRODUCTS_MAPPING_CONFLICT": {
      "owner": "products",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "상품 매핑이 동시에 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "INVENTORY_NOT_FOUND": {
      "owner": "inventory",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "재고 항목을 찾을 수 없습니다.",
      "retryable": false
    },
    "SELLPIA_SYNC_REQUIRED": {
      "owner": "inventory",
      "kind": "precondition",
      "httpStatus": 409,
      "text": "셀피아 재고가 바뀌었습니다. 재고를 다시 수집한 뒤 발주해 주세요.",
      "retryable": false
    },
    "SUPPLY_PURCHASE_ITEM_INACTIVE": {
      "owner": "supply",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "발주 항목 중 판매 중이 아닌 상품이 있습니다.",
      "retryable": false
    },
    "SUPPLY_PURCHASE_REFERENCE_INVALID": {
      "owner": "supply",
      "kind": "validation",
      "httpStatus": 400,
      "text": "발주 참조 정보가 올바르지 않습니다.",
      "retryable": false
    },
    "SUPPLY_SUBMISSION_RECONCILIATION_REQUIRED": {
      "owner": "supply",
      "kind": "precondition",
      "httpStatus": 409,
      "text": "이전 발주 제출 결과를 먼저 확인해야 합니다.",
      "retryable": false
    },
    "SUPPLY_ROCKET_FINAL_ORDER_AMBIGUOUS": {
      "owner": "supply",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "수집한 로켓 주문이 발주 엑셀의 여러 줄과 맞습니다. 발주 확정 엑셀을 확인해 주세요.",
      "retryable": false
    },
    "SUPPLY_ROCKET_FINAL_ORDER_BARCODE_MISMATCH": {
      "owner": "supply",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "수집한 로켓 주문의 바코드가 발주 엑셀과 다릅니다. 발주 확정 엑셀을 확인해 주세요.",
      "retryable": false
    },
    "SUPPLY_ROCKET_FINAL_ORDER_ALREADY_COLLECTED": {
      "owner": "supply",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이 발주 엑셀 줄은 이미 다른 주문과 연결돼 있습니다.",
      "retryable": false
    },
    "SUPPLY_ROCKET_WORKBOOK_LINE_CHANGED": {
      "owner": "supply",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "맞추는 동안 발주 엑셀 줄이 바뀌었습니다. 다시 시도해 주세요.",
      "retryable": true
    },
    "SUPPLY_ROCKET_COLLECTION_INCOMPLETE": {
      "owner": "supply",
      "kind": "precondition",
      "httpStatus": 409,
      "text": "로켓 발주 수집이 끝나지 않았습니다. 수집을 마친 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "SUPPLY_PROCUREMENT_REFERENCE_INVALID": {
      "owner": "supply",
      "kind": "validation",
      "httpStatus": 400,
      "text": "공급 제안·결정 참조가 이 조직의 기록과 맞지 않습니다. 선택한 공급 제안과 결정을 확인해 주세요.",
      "retryable": false
    },
    "SUPPLY_DECISION_EXPIRED": {
      "owner": "supply",
      "kind": "expired",
      "httpStatus": 409,
      "text": "결정 배치가 만료됐거나 더 이상 진행할 수 없습니다. 새 결정을 만든 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "SUPPLY_OFFER_SNAPSHOT_EXPIRED": {
      "owner": "supply",
      "kind": "expired",
      "httpStatus": 409,
      "text": "공급 제안 스냅숏이 만료됐습니다. 공급 제안을 다시 수집한 뒤 시도해 주세요.",
      "retryable": false
    },
    "SUPPLY_PURCHASE_STATUS_INVALID": {
      "owner": "supply",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "지금 발주 상태에서는 이 작업을 할 수 없습니다. 새로고침한 뒤 발주 상태를 확인해 주세요.",
      "retryable": false
    },
    "SUPPLY_PURCHASE_LEGACY_ORDER": {
      "owner": "supply",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "예전 방식으로 만든 발주라 제출할 수 없습니다. 발주를 새로 만든 뒤 제출해 주세요.",
      "retryable": false
    },
    "SUPPLY_PURCHASE_PROVIDER_FAILED": {
      "owner": "supply",
      "kind": "external",
      "httpStatus": 502,
      "text": "발주처가 주문을 받지 않았습니다. 발주처 화면에서 원인을 확인한 뒤 다시 제출해 주세요.",
      "retryable": false
    },
    "SUPPLY_ROCKET_RECIPE_REQUIRED": {
      "owner": "supply",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "옵션 구성이 확정되지 않은 로켓 발주 줄이 있습니다. 옵션 구성을 확정한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "SUPPLY_ROCKET_PREVIEW_CHANGED": {
      "owner": "supply",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "로켓 발주 미리보기가 그사이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "SUPPLY_ROCKET_WORKFLOW_ACTIVE": {
      "owner": "supply",
      "kind": "in_progress",
      "httpStatus": 409,
      "text": "진행 중인 로켓 발주 확정 작업이 있습니다. 끝내거나 중단한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "SUPPLY_ROCKET_PROBE_REQUIRED": {
      "owner": "supply",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "쿠팡 주문이 없다는 것을 확인해야 중단할 수 있습니다. 택배·밀크런 주문을 새로 수집한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "SUPPLY_ROCKET_WORKBOOK_FILE_INVALID": {
      "owner": "supply",
      "kind": "validation",
      "httpStatus": 400,
      "text": "로켓 발주 엑셀 파일이 올바르지 않습니다. 파일을 확인한 뒤 다시 올려 주세요.",
      "retryable": false
    },
    "SUPPLY_ROCKET_TEMPLATE_MISMATCH": {
      "owner": "supply",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "로켓 발주 확정 양식이 수집한 발주와 맞지 않습니다. 확장 프로그램을 새로고침하고 발주를 다시 수집해 주세요.",
      "retryable": false
    },
    "SUPPLY_ROCKET_QUANTITY_EXCEEDED": {
      "owner": "supply",
      "kind": "validation",
      "httpStatus": 400,
      "text": "확정 수량이 발주 수량이나 가능한 재고보다 많습니다. 수량을 줄여 주세요.",
      "retryable": false
    },
    "SOURCING_NOT_FOUND": {
      "owner": "sourcing",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "소싱 후보를 찾을 수 없습니다.",
      "retryable": false
    },
    "SOURCING_SEARCH_EXTRACTION_FAILED": {
      "owner": "sourcing",
      "kind": "external",
      "httpStatus": 502,
      "text": "검색 결과를 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "SOURCING_PROVIDER_CONTRACT_CHANGED": {
      "owner": "sourcing",
      "kind": "external",
      "httpStatus": 502,
      "text": "소싱 사이트 화면이 바뀌어 읽지 못했습니다. 개발자에게 알려 주세요.",
      "retryable": false
    },
    "SOURCING_DUPLICATE_RECORD": {
      "owner": "sourcing",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "이미 수집된 항목입니다.",
      "retryable": false
    },
    "CONTENT_GENERATION_FAILED": {
      "owner": "content",
      "kind": "external",
      "httpStatus": 502,
      "text": "AI 생성에 실패했습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "CONTENT_MODEL_UNAVAILABLE": {
      "owner": "content",
      "kind": "external",
      "httpStatus": 502,
      "text": "선택한 AI 모델을 지금 쓸 수 없습니다.",
      "retryable": true
    },
    "CONTENT_MODEL_NOT_CONFIGURED": {
      "owner": "content",
      "kind": "external",
      "httpStatus": 503,
      "text": "AI 모델이 설정되지 않았습니다. 관리자에게 알려 주세요.",
      "retryable": false
    },
    "CONTENT_GENERATION_INPUT_MISSING": {
      "owner": "content",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "AI 생성에 필요한 이미지나 상품 정보가 없습니다. 먼저 채운 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CONTENT_IMAGE_TOO_LARGE": {
      "owner": "content",
      "kind": "validation",
      "httpStatus": 400,
      "text": "이미지 파일이 너무 큽니다. 더 작은 이미지로 다시 올려 주세요.",
      "retryable": false
    },
    "CONTENT_NOT_FOUND": {
      "owner": "content",
      "kind": "not_found",
      "httpStatus": 404,
      "text": "콘텐츠를 찾을 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.",
      "retryable": false
    },
    "CONTENT_SELECTION_INVALID": {
      "owner": "content",
      "kind": "validation",
      "httpStatus": 400,
      "text": "선택한 이미지나 상세페이지를 이 작업에 쓸 수 없습니다. 다시 선택해 주세요.",
      "retryable": false
    },
    "CONTENT_ASSET_IN_USE": {
      "owner": "content",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "쓰고 있는 이미지라 지울 수 없습니다. 대표이미지나 진행 중인 생성에서 먼저 빼 주세요.",
      "retryable": false
    },
    "CONTENT_REVISION_REQUIRED": {
      "owner": "content",
      "kind": "precondition",
      "httpStatus": 422,
      "text": "저장된 상세페이지가 없습니다. 상세페이지를 먼저 저장해 주세요.",
      "retryable": false
    },
    "EXECUTION_REPORT_MANUAL_ACTION": {
      "owner": "advertising",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "자동 실행하지 않는 액션이라 실행 보고를 받지 않았습니다. 광고센터에서 직접 처리해 주세요.",
      "retryable": false
    },
    "EXECUTION_TASK_NOT_LATEST": {
      "owner": "advertising",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "실행 보고를 반영할 수 없습니다. 보고한 실행 시도가 이 액션의 최신 시도가 아닙니다.",
      "retryable": false
    },
    "EXECUTION_TASK_EXPIRED": {
      "owner": "advertising",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "실행 보고를 반영할 수 없습니다. 실행 기한이 지나 이 실행 시도를 실패로 닫았습니다.",
      "retryable": false
    },
    "EXECUTION_REPORT_INVALID_TRANSITION": {
      "owner": "advertising",
      "kind": "conflict",
      "httpStatus": 409,
      "text": "실행 보고를 반영할 수 없습니다. 최근 실행 작업 상태와 맞지 않습니다.",
      "retryable": false
    },
    "ADVERTISING_RESULT_UNREADABLE": {
      "owner": "advertising",
      "kind": "external",
      "httpStatus": 502,
      "text": "광고센터 결과를 읽지 못했습니다. 잠시 뒤 다시 수집해 주세요.",
      "retryable": true
    },
    "ANALYTICS_QUERY_FAILED": {
      "owner": "analytics",
      "kind": "internal",
      "httpStatus": 500,
      "text": "통계를 계산하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    },
    "FINANCE_QUERY_FAILED": {
      "owner": "finance",
      "kind": "internal",
      "httpStatus": 500,
      "text": "재무 데이터를 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      "retryable": true
    }
  });

  var EXTENSION_CODE_ALIASES = deepFreeze({
    "auth_required": "AUTH_REQUIRED",
    "insufficient_role": "FORBIDDEN",
    "no_organization_context": "NO_ORGANIZATION_CONTEXT",
    "request_timeout": "REQUEST_TIMEOUT",
    "network_error": "NETWORK_FAILED",
    "network_failed": "NETWORK_FAILED",
    "invalid_request": "VALIDATION_FAILED",
    "unknown_failure": "EXTENSION_UNKNOWN_FAILURE",
    "login_required": "MALL_LOGIN_REQUIRED",
    "marketplace_login": "MALL_LOGIN_REQUIRED",
    "login_page_not_reachable": "MALL_LOGIN_PAGE_UNREACHABLE",
    "operator_action_required": "OPERATOR_ACTION_REQUIRED",
    "provider_contract_changed": "SOURCING_PROVIDER_CONTRACT_CHANGED",
    "collection_window_owner_conflict": "COLLECTION_WINDOW_OWNER_CONFLICT",
    "search_extraction_failed": "SOURCING_SEARCH_EXTRACTION_FAILED",
    "gateway_provider_unavailable": "AGENT_OS_GATEWAY_UNAVAILABLE",
    "SOURCE_ATTEMPT_TERMINAL": "ATTEMPT_TERMINAL",
    "sellpia_manual_match_login_required": "SELLPIA_MANUAL_MATCH_LOGIN_REQUIRED",
    "sellpia_manual_match_contract_drift": "MALL_CONTRACT_CHANGED",
    "sellpia_manual_match_invalid_snapshot": "SOURCE_SNAPSHOT_INVALID",
    "sellpia_manual_match_timeout": "SELLPIA_MANUAL_MATCH_TIMEOUT",
    "sellpia_manual_match_network_failed": "NETWORK_FAILED",
    "SOURCE_ATTEMPT_IN_PROGRESS": "ATTEMPT_IN_PROGRESS",
    "ROCKET_PO_COLLECTION_INCOMPLETE": "SUPPLY_ROCKET_COLLECTION_INCOMPLETE",
    "COMMON_NOT_FOUND": "NOT_FOUND",
    "COMMON_BAD_REQUEST": "VALIDATION_FAILED",
    "COMMON_INTERNAL_ERROR": "INTERNAL_ERROR",
    "COMMON_DB_ERROR": "DB_ERROR",
    "COMMON_UNAUTHORIZED": "AUTH_REQUIRED",
    "COMMON_SERVICE_UNAVAILABLE": "SERVICE_UNAVAILABLE",
    "PRODUCT_NOT_FOUND": "PRODUCTS_NOT_FOUND",
    "PRODUCT_SOURCE_REFERENCE_INVALID": "PRODUCTS_SOURCE_REFERENCE_INVALID",
    "ORDER_NO_SELECTION": "ORDERS_NO_SELECTION",
    "ORDER_UNKNOWN_ACTION": "ORDERS_UNKNOWN_ACTION",
    "PURCHASE_ITEM_INACTIVE": "SUPPLY_PURCHASE_ITEM_INACTIVE",
    "PURCHASE_REFERENCE_INVALID": "SUPPLY_PURCHASE_REFERENCE_INVALID",
    "PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED": "SUPPLY_SUBMISSION_RECONCILIATION_REQUIRED",
    "ROCKET_COLLECTION_INCOMPLETE": "SUPPLY_ROCKET_COLLECTION_INCOMPLETE",
    "AI_MODEL_UNAVAILABLE": "CONTENT_MODEL_UNAVAILABLE",
    "AI_GENERATION_FAILED": "CONTENT_GENERATION_FAILED",
    "SOURCING_SCRAPE_FAILED": "SOURCING_SEARCH_EXTRACTION_FAILED"
  });

  var SOURCE_LABELS = deepFreeze({
    "coupang_wing_catalog": "Wing 상품 목록 수집",
    "coupang_wing_traffic": "Wing 트래픽 수집",
    "coupang_ad_campaign": "광고 캠페인 수집",
    "coupang_ad_keyword": "광고 키워드 수집",
    "coupang_itemwinner": "아이템위너 수집",
    "coupang_review": "쿠팡 리뷰 수집",
    "coupang_direct_order": "쿠팡 직배송 주문 수집",
    "rocket_po": "로켓 발주 수집",
    "order_collection": "주문 수집",
    "sellpia_inventory": "셀피아 재고 수집",
    "sellpia_sales": "셀피아 매출 수집",
    "sellpia_profitability": "셀피아 수익성 수집",
    "sellpia_shipment_tracking": "셀피아 배송 추적",
    "sellpia_manual_match": "셀피아 수동 매칭",
    "competitor_catalog": "경쟁사 상품 수집",
    "wing_tracked_product": "Wing 추적 상품 수집",
    "wing_rank": "Wing 순위 수집",
    "keyword_serp": "키워드 검색 결과 수집",
    "sourcing_browser": "소싱 수집",
    "coupang_wing_tracked_products": "Wing 추적 상품 수집",
    "coupang_competitor_catalog": "경쟁 판매자 수집",
    "coupang_competitor_seller_identity": "경쟁 판매자 확인",
    "coupang_ad_profitability": "광고 수익성 수집",
    "coupang_wing_itemwinner": "아이템위너 수집",
    "coupang_keyword_serp": "키워드 검색 결과 수집",
    "coupang_wing_rank": "Wing 순위 수집",
    "coupang_reviews": "쿠팡 리뷰 수집",
    "coupang_rocket_po_catalog": "로켓 발주 수집",
    "coupang_shipment_summary": "쿠팡 쉽먼트 조회",
    "coupang_direct_order_capture": "쿠팡 직배송 주문 수집",
    "order_collection_mall": "주문 수집",
    "sellpia_sales_daily": "셀피아 판매 현황 수집",
    "sellpia_product_profitability": "셀피아 수익성 수집",
    "mall_admin_listings": "몰 등록 상품 가져오기",
    "sabangnet_mall_listings": "사방넷 등록 상품 가져오기"
  });

  function isErrorCode(value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, value);
  }

  /** 등록 코드 그대로 → alias → 대문자·`-`→`_` 정규화. 어느 것도 아니면 null. */
  function resolveErrorCode(raw) {
    if (typeof raw !== "string") return null;
    var trimmed = raw.trim();
    if (!trimmed) return null;
    if (isErrorCode(trimmed)) return trimmed;
    if (Object.prototype.hasOwnProperty.call(EXTENSION_CODE_ALIASES, trimmed)) return EXTENSION_CODE_ALIASES[trimmed];
    var normalized = trimmed.toUpperCase().replace(/[-\s]+/g, "_");
    return isErrorCode(normalized) ? normalized : null;
  }

  function sourceLabel(source) {
    if (!source) return "수집";
    return SOURCE_LABELS[source] || SOURCE_LABELS[String(source).toLowerCase().replace(/[-\s]+/g, "_")] || "수집";
  }

  /** 운영자 문장 하나. 알려진 코드는 레지스트리 문장, 모르는 코드는 원천별 일반 문장. 원문은 돌려주지 않는다. */
  function operatorErrorText(input) {
    var code = resolveErrorCode(input && input.code);
    if (code) return ERROR_DEFINITIONS[code].text;
    return sourceLabel(input && input.source) + " 작업이 실패했습니다. 다시 시도해 주세요.";
  }

  root.KidItemOperatorError = Object.freeze({
    ERROR_DEFINITIONS: ERROR_DEFINITIONS,
    EXTENSION_CODE_ALIASES: EXTENSION_CODE_ALIASES,
    SOURCE_LABELS: SOURCE_LABELS,
    resolveErrorCode: resolveErrorCode,
    sourceLabel: sourceLabel,
    operatorErrorText: operatorErrorText,
  });
})(typeof self !== "undefined" ? self : globalThis);
