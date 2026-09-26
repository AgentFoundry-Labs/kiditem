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
  // 몰·마켓 채널 목록. `packages/shared/src/channel-registry.ts` 에서 생성한 사본이다.
  "../shared/channel-registry.js",
  // 몰 폼 [등록] 관문(KID-322) — 몰 폼 등록 모듈보다 먼저 싣는다.
  "../shared/mall-form-submit-gate.js",
  // 공용 파운데이션 — 도메인마다 사본을 싣던 것을 정본 하나로 통일했다.
  "environment-context.js",
  "collection-session.js",
  "interactive-tabs.js",
  "external-dispatch.js",
  // 세 도메인이 같은 값으로 각자 만들던 전역을 여기서 한 번만 만든다.
  "worker-globals.js",
  "sourcing/source-attempt-wire.js",
  // 쿠팡 도메인 모듈
  "coupang/environment-runtime.js",
  "coupang/ad-collector-delay.js",
  "coupang/collection-window.js",
  "coupang/collection-start.js",
  "coupang/ad-center-collector.js",
  "coupang/wing-report-collector.js",
  "coupang/collection-runs.js",
  "coupang/wing-keyword-contract.js",
  "coupang/profitability-source-owner.js",
  "coupang/ad-keyword-source-owner.js",
  "coupang/ad-campaign-source-owner.js",
  "coupang/wing-traffic-source-owner.js",
  "coupang/wing-itemwinner-source-owner.js",
  "coupang/tracked-wing-products-source-owner.js",
  "coupang/competitor-catalog-source-owner.js",
  "coupang/keyword-rank-source-owner.js",
  "coupang/keyword-rank-batch.js",
  "coupang/wing-image-fetch.js",
  "coupang/wing-form-runtime-compat.js",
  "coupang/wing-form-readiness.js",
  "../utils/coupang-seller-detail.js",
  // 주문수집 도메인 모듈
  "orders/collection-failure.js",
  "orders/order-collection-lifecycle.js",
  "orders/order-collection-server-converter.js",
  "orders/order-collection-source-owner.js",
  "orders/sellpia-inventory.js",
  "orders/sellpia-inventory-source-owner.js",
  "orders/sellpia-sales-collector.js",
  "orders/sellpia-product-profit-collector.js",
  "orders/sellpia-product-profitability-source-owner.js",
  "orders/sellpia-sales-source-owner.js",
  "orders/mall-admin-listings.js",
  "orders/mall-admin-listings-source-owner.js",
  "orders/sellpia-post-processing.js",
  "orders/kidsnote-product-register.js",
  "orders/mall-form-register.js",
  "orders/mall-availability-send.js",
  "orders/mall-session-probe.js",
  "orders/mall-session.js",
  // 소싱 수집(KID-360)은 새 런타임(kiditem-runtime.js)의 실행 kind다. 아래 모듈은 광고·경쟁 수집이 쓴다.
  "coupang/wing-search-collector.js",
  "coupang/coupang-serp-collector.js",
  "coupang/coupang-seller-identity-collector.js",
  "coupang/coupang-seller-catalog-collector.js",
  // 도메인 워커 — 위 모듈의 전역을 최상위에서 바로 쓰므로 반드시 마지막이다.
  "coupang/worker.js",
  "orders/worker.js",
  // Lifetime wiring runs after every domain has registered its cancellation
  // and optional non-session/recovery hooks.
  "web-app-collection-lifetime.js",
  "../runtime/kiditem-runtime.js",
);

const webAppCollectionLifetime = KidItemWebAppCollectionLifetime.create({
  chrome,
  environmentContext: sharedEnvironmentContext,
  authContext: sourceOwnerEnvironmentContext,
  sessions: collectionSessions,
  domains: KidItemDomains,
  keepAlive: KidItemWorkerKeepAlive,
});
globalThis.KidItemWebAppCollectionRuntime = webAppCollectionLifetime;
webAppCollectionLifetime.install();
KidItemWorkerKeepAlive.during(webAppCollectionLifetime.initialize()).catch((error) => {
  console.error("[KIDITEM] web-app lifetime startup reconciliation failed:", error?.message || error);
});

// `worker-globals.js` 가 만든 공용 인스턴스를 그대로 쓴다. ping 과 세션 조회만
// 담당하므로 토큰을 요구하지 않는다(미로그인 환경에서도 웹앱이 확장 버전과
// capabilities 를 읽을 수 있어야 한다).
KidItemExternalDispatch.create({
  chrome,
  environmentContext: sharedEnvironmentContext,
  sessions: collectionSessions,
  domains: KidItemDomains,
}).install();
