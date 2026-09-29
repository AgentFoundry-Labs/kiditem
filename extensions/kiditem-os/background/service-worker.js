// KIDITEM OS — 통합 백그라운드 서비스워커
//
// 주문수집 / 쿠팡 Wing·광고센터 / 소싱 세 확장을 하나로 합친 진입점이다.
// MV3 는 확장당 서비스워커 하나만 허용하므로 이 파일이 공용 모듈과 도메인
// 워커를 순서대로 싣는다. `ping`은 새 런타임이 옛 표의 capability까지 합쳐 한 번만
// 답하고, 수집 세션 공통 액션은 세션의 `producer` 접두사로 소유 도메인을 골라 위임한다.
//
// 웹앱 메시지(`onMessageExternal`)는 새 런타임(`kiditem-runtime.js`, `extensions/src/core/dispatch.ts`)이 유일한 리스너로
// 받는다(KID-366). 옛 워커가 아직 가진 액션(카카오·수집 세션)은 `KidItemDomains`에 등록되어 있고, 새 런타임이
// 모르는 액션을 이 표로 넘긴다 — 과도기 배선은 파일 끝의 `attachLegacyActions` 한 줄이다(wave9에서 삭제).

importScripts(
  // 도메인 워커가 로드되면서 자신을 등록하므로 레지스트리가 가장 먼저다.
  "domain-registry.js",
  // 몰·마켓 채널 목록. `packages/shared/src/channel-registry.ts` 에서 생성한 사본이다.
  "../shared/channel-registry.js",
  // 공용 파운데이션 — 도메인마다 사본을 싣던 것을 정본 하나로 통일했다.
  "environment-context.js",
  "collection-session.js",
  "external-dispatch.js",
  // 세 도메인이 같은 값으로 각자 만들던 전역을 여기서 한 번만 만든다.
  "worker-globals.js",
  "sourcing/source-attempt-wire.js",
  // 쿠팡 도메인 모듈
  "coupang/environment-runtime.js",
  // 주문수집 도메인 모듈
  "orders/collection-failure.js",
  "orders/order-collection-lifecycle.js",
  "orders/order-collection-source-owner.js",
  "orders/mall-session.js",
  // 소싱 수집(KID-360)과 광고 키워드·경쟁사 수집(KID-362)은 새 런타임(kiditem-runtime.js)의 실행 kind다.
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

// 수집 세션 공통 액션을 옛 표에 올리고 외부 장기 실행 포트를 받는다. 토큰을 요구하지 않는다.
KidItemExternalDispatch.create({
  chrome,
  environmentContext: sharedEnvironmentContext,
  sessions: collectionSessions,
  domains: KidItemDomains,
}).install();

// 새 런타임 dispatch가 모르는 액션을 옛 표로 넘기고, ping이 옛 표의 capability를 합친다(과도기, KID-366).
KidItemRuntime.attachLegacyActions(KidItemDomains);
