// KIDITEM OS — 통합 백그라운드 서비스워커
//
// 주문수집 / 쿠팡 Wing·광고센터 / 소싱 세 확장을 하나로 합친 진입점이다.
// MV3 는 확장당 서비스워커 하나만 허용하므로 이 파일이 공용 모듈과 도메인
// 워커를 순서대로 싣고, 도메인 사이에서 충돌하던 두 가지를 직접 소유한다.
//
//  1. `ping` — 세 워커가 각자 응답하면 먼저 응답한 쪽의 capabilities 만 웹앱에
//     전달돼 나머지 도메인이 "확장 미설치"로 보인다.
//  2. 수집 세션 공통 액션 — 세 도메인이 `kiditem_collection_sessions` 저장소를
//     공유하므로, 세션의 `producer` 접두사로 소유 도메인을 골라 위임한다.
//
// 두 처리는 `external-dispatch.js` 가 갖고 있고 여기서는 배선만 한다.
// 도메인 고유 액션은 각 워커의 `onMessageExternal` 리스너가 그대로 처리한다.
// 세 리스너 모두 모르는 액션에는 응답하지 않으므로 서로 간섭하지 않는다.

importScripts(
  // 도메인 워커가 로드되면서 자신을 등록하므로 레지스트리가 가장 먼저다.
  "domain-registry.js",
  // 공용 파운데이션 — 도메인마다 사본을 싣던 것을 정본 하나로 통일했다.
  "environment-context.js",
  "collection-session.js",
  "interactive-tabs.js",
  "external-dispatch.js",
  "operation-runtime-client.js",
  // 세 도메인이 같은 값으로 각자 만들던 전역을 여기서 한 번만 만든다.
  "worker-globals.js",
  // 쿠팡 도메인 모듈
  "coupang/environment-runtime.js",
  "coupang/ad-collector-delay.js",
  "coupang/collection-window.js",
  "coupang/collection-runs.js",
  "coupang/wing-image-fetch.js",
  "coupang/wing-form-runtime-compat.js",
  "coupang/wing-form-readiness.js",
  "../utils/coupang-seller-detail.js",
  "../shared/coupang-catalog-collector.js?revision=2",
  "coupang/coupang-catalog-import.js",
  "coupang/coupang-review-collector.js",
  // 주문수집 도메인 모듈
  "orders/collection-failure.js",
  "orders/order-collection-lifecycle.js",
  "orders/sellpia-inventory.js",
  "orders/sellpia-manual-match.js",
  "orders/sellpia-post-processing.js",
  "orders/coupang-po-session.js",
  "orders/rocket-po-collection.js",
  // 소싱 도메인 모듈
  "sourcing/1688-trend-collector.js",
  "sourcing/live-commerce-collector.js",
  "sourcing/tiktok-cc-collector.js",
  // 도메인 워커 — 위 모듈의 전역을 최상위에서 바로 쓰므로 반드시 마지막이다.
  "coupang/worker.js",
  "orders/worker.js",
  "sourcing/worker.js",
);

// `worker-globals.js` 가 만든 공용 인스턴스를 그대로 쓴다. ping 과 세션 조회만
// 담당하므로 토큰을 요구하지 않는다(미로그인 환경에서도 웹앱이 확장 버전과
// capabilities 를 읽을 수 있어야 한다).
KidItemExternalDispatch.create({
  chrome,
  environmentContext: sharedEnvironmentContext,
  sessions: collectionSessions,
  domains: KidItemDomains,
}).install();

// 서버가 발행한 browser Operation만 claim한다. 도메인 worker의 독자 cron은
// 여기로 옮기지 않으며, 이 alarm은 실행 payload를 보관하지 않는 wake-up 용도다.
KidItemOperationRuntimeClient.create({
  chrome,
  environmentContext: browserOperationRuntimeEnvironmentContext,
  domains: KidItemDomains,
}).install();
