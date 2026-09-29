// KIDITEM OS — 쿠팡 Wing/광고센터 도메인 워커
//
// 통합 서비스워커(`background/service-worker.js`)가 의존 모듈을 먼저 싣고
// 이 파일을 importScripts 로 불러온다. 세 도메인 워커가 `adsEnvironmentContext`,
// `collectionSessions` 같은 최상위 const 이름을 공유하므로 전체를 IIFE 로 감싸
// 각 도메인의 최상위 선언을 그 도메인 안에 가둔다. 본문 들여쓰기는 병합 diff 를
// 읽을 수 있게 유지하기 위해 원본 그대로 둔다.

// KidItem 환경(로컬·Office) 문맥. 탭을 환경에 묶고 연결된 환경을 알려 주는 두 메시지가 쓴다.
const adsEnvironmentContext = KidItemEnvironmentContext.create({
  chrome,
  fetchFn: fetch,
  legacyStorageKeys: ["kiditem_auth_token", "apiBase"],
});
const coupangEnvironment = KidItemCoupangEnvironmentRuntime.create({
  chrome,
  environmentContext: adsEnvironmentContext,
});

// Write-only Wing/Ads sync stamps no build reads any more. Remove them once from
// installed profiles.
const COUPANG_RETIRED_LOCAL_COPY_KEYS = [
  "kiditem_last_sync_traffic",
  "kiditem_last_sync_itemwinner",
  "kiditem_last_sync_ads",
];

chrome.runtime.onInstalled.addListener(() => {
  console.log("[KIDITEM] Extension installed");
  adsEnvironmentContext.migrateLegacyStorage().catch(() => undefined);
  Promise.resolve(chrome.storage.local.remove(COUPANG_RETIRED_LOCAL_COPY_KEYS)).catch(() => undefined);
});

// 아이콘 클릭 시 사이드 패널 열기
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ═══ content script에서 메시지 수신 ═══
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "bindKidItemEnvironment") {
    const tabId = sender?.tab?.id || msg.tabId;
    Promise.resolve()
      .then(async () => {
        adsEnvironmentContext.requireEnvironment(msg.environmentId);
        const connected = await adsEnvironmentContext.connectedEnvironmentIds();
        if (!connected.includes(msg.environmentId)) {
          throw new Error("선택한 환경에 로그인된 KidItem 탭이 없습니다.");
        }
        await coupangEnvironment.bindTab(tabId, msg.environmentId);
        return { success: true, environmentId: msg.environmentId };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 병합 전에는 쿠팡 워커가 `environmentIds`(문자열 배열)를, 소싱 워커가
  // `environments`(객체 배열)를 같은 액션 이름으로 돌려줬다. 하나의 확장에서는
  // 두 리스너가 같은 메시지에 경쟁 응답해 사이드패널이 비결정적으로 깨지므로,
  // 여기서만 응답하되 두 소비자가 모두 읽을 수 있게 양쪽 필드를 함께 담는다.
  if (msg.action === "getConnectedKidItemEnvironments") {
    adsEnvironmentContext.connectedEnvironmentIds()
      .then((environmentIds) =>
        sendResponse({
          success: true,
          environmentIds,
          environments: environmentIds.map((environmentId) =>
            adsEnvironmentContext.requireEnvironment(environmentId),
          ),
        }),
      )
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  // 팝업 API 요청(`kiditemApiRequest`)과 Wing 재고 내보내기(`exportWingInventoryWorkbook`)·웹앱 토큰(`setAuthToken`·
  // `clearAuthToken`)은 새 런타임이 받는다(KID-366, `extensions/src/entry/actions`).
});

// ── 통합 서비스워커 등록 ──
// 이 도메인에는 수집 세션 producer가 없다 — 윙 카탈로그·상품은 실행 kind다(KID-365).
KidItemDomains.register({
  capabilities: {
    coupangCatalogSnapshot: true,
    coupangCatalogSourceAttempts: true,
    browserCollectionSessions: true,
  },
  // 광고 수집(캠페인·키워드·수익성)은 새 런타임의 실행 kind라, 이 도메인에는
  // 취소하거나 복구할 브라우저 수집 세션이 남지 않는다(KID-373).
  cancelCollectionSession: async () => {
    throw new Error("Collection producer source owner does not support cancellation");
  },
});
