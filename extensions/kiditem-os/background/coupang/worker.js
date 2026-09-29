// KIDITEM OS — 쿠팡 Wing/광고센터 도메인 워커
//
// 통합 서비스워커(`background/service-worker.js`)가 의존 모듈을 먼저 싣고
// 이 파일을 importScripts 로 불러온다. 세 도메인 워커가 `adsEnvironmentContext`,
// `collectionSessions` 같은 최상위 const 이름을 공유하므로 전체를 IIFE 로 감싸
// 각 도메인의 최상위 선언을 그 도메인 안에 가둔다. 본문 들여쓰기는 병합 diff 를
// 읽을 수 있게 유지하기 위해 원본 그대로 둔다.

// KidItem 웹앱이 열리는 커밋된 origin. externally_connectable / 대시보드 탭 조회 /
// 세션·auth 핸드셰이크가 모두 이 목록을 공유한다. (product-scraper 패턴)
const COUPANG_SEARCH_URL = "https://www.coupang.com/np/search";
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

function buildCoupangSearchUrl(keyword) {
  return `${COUPANG_SEARCH_URL}?component=&q=${encodeURIComponent(keyword)}&channel=user`;
}

function isCoupangSearchUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.coupang.com" &&
      parsed.pathname.includes("/np/search")
    );
  } catch {
    return false;
  }
}

function isWingInventoryUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "wing.coupang.com" &&
      parsed.pathname.includes("vendor-inventory/list")
    );
  } catch {
    return false;
  }
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        reject(new Error(chrome.runtime.lastError?.message || "탭 조회 실패"));
        return;
      }
      resolve(tab);
    });
  });
}

function createTab(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        reject(new Error(chrome.runtime.lastError?.message || "탭 생성 실패"));
        return;
      }
      resolve(tab);
    });
  });
}

const COUPANG_TAB_DIAGNOSTIC_MAX_URL_LENGTH = 2048;

function coupangSafeTabDiagnosticPageIdentity(url) {
  if (typeof url !== "string" || !url) return "unknown";
  if (url.length > COUPANG_TAB_DIAGNOSTIC_MAX_URL_LENGTH) return "oversized";

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid";
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  let type = "other";
  if (hostname === "wing.coupang.com") {
    if (
      pathname === "/vendor-inventory/list" ||
      pathname === "/tenants/seller-web/vendor-inventory/list"
    ) {
      type = "wing-inventory-list";
    } else if (
      pathname === "/vendor-inventory/modify" ||
      pathname === "/tenants/seller-web/vendor-inventory/modify"
    ) {
      type = "wing-inventory-modify";
    } else {
      type = "wing";
    }
  } else if (hostname === "login.coupang.com") {
    type = "coupang-login";
  }

  const identity = [`type=${type}`];
  if (type === "wing-inventory-list" || type === "wing-inventory-modify") {
    const vendorInventoryId = parsed.searchParams.get("vendorInventoryId");
    const page = parsed.searchParams.get("page");
    if (/^[0-9]{1,18}$/.test(vendorInventoryId || "")) {
      identity.push(`vendorInventoryId=${vendorInventoryId}`);
    }
    if (/^[0-9]{1,18}$/.test(page || "")) {
      identity.push(`page=${page}`);
    }
  }
  return identity.join(",");
}

function waitForTabComplete(tabId, options = {}) {
  const timeoutMs = options.timeoutMs || 45000;
  return new Promise((resolve, reject) => {
    let done = false;
    let sawNavigation = false;
    let lastObservedStatus = "unobserved";
    let lastObservedPage = "unobserved";
    const observeTab = (url, status) => {
      lastObservedStatus =
        status === "loading" || status === "complete" ? status : "unknown";
      lastObservedPage = coupangSafeTabDiagnosticPageIdentity(url);
    };
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timeout);
    };
    const finish = (tab) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(tab || {});
    };
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(
        new Error(
          [
            "Wing 탭 로딩 타임아웃",
            `expectedPage=${options.expectedUrl ? coupangSafeTabDiagnosticPageIdentity(options.expectedUrl) : "not-specified"}`,
            `lastObservedStatus=${lastObservedStatus}`,
            `lastObservedPage=${lastObservedPage}`,
            `navigationObserved=${sawNavigation}`,
          ].join("; "),
        ),
      );
    }, timeoutMs);
    const onRemoved = (removedTabId) => {
      if (removedTabId !== tabId || done) return;
      done = true;
      cleanup();
      reject(new Error("Wing 탭이 닫혔습니다"));
    };
    const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
      if (updatedTabId !== tabId) return;
      const observedUrl = updatedTab?.url ?? changeInfo?.url;
      observeTab(observedUrl, changeInfo?.status ?? updatedTab?.status);
      if (changeInfo?.status === "loading") {
        sawNavigation = true;
        return;
      }
      if (
        changeInfo?.status === "complete" &&
        isExpectedTab(updatedTab, { ...options, sawNavigation })
      ) {
        finish(updatedTab);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      observeTab(tab?.url, tab?.status);
      if (isExpectedTab(tab, options)) finish(tab);
    });
  });
}

function isExpectedTab(tab, options = {}) {
  if (tab?.status !== "complete") return false;
  if (!options.expectedUrl) return true;
  const currentUrl = tab.url || "";
  if (matchesExpectedWingPage(currentUrl, options.expectedUrl)) return true;
  if (options.sawNavigation && currentUrl === options.expectedUrl) return true;
  if (options.sawNavigation && isWingInventoryUrl(currentUrl)) return true;
  if (options.previousUrl && currentUrl === options.previousUrl) return false;
  return Boolean(currentUrl && !isWingInventoryUrl(currentUrl));
}

function matchesExpectedWingPage(currentUrl, expectedUrl) {
  try {
    const current = new URL(currentUrl);
    const expected = new URL(expectedUrl);
    if (current.hostname !== expected.hostname) return false;
    if (!current.pathname.includes("vendor-inventory/list")) return false;
    const currentPage = current.searchParams.get("page") || "1";
    const expectedPage = expected.searchParams.get("page") || "1";
    return currentPage === expectedPage;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
