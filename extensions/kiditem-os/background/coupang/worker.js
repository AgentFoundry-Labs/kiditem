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
const WING_CATALOG_MAX_PAGES = 5;
const adsEnvironmentContext = KidItemEnvironmentContext.create({
  chrome,
  fetchFn: fetch,
  legacyStorageKeys: ["kiditem_auth_token", "apiBase"],
});
const coupangEnvironment = KidItemCoupangEnvironmentRuntime.create({
  chrome,
  environmentContext: adsEnvironmentContext,
});
const authedFetch = (environmentId, path, init) =>
  adsEnvironmentContext.authedFetch(environmentId, path, init);
const getAuthToken = (environmentId) =>
  adsEnvironmentContext.getAccessToken(environmentId);

async function exportWingInventoryWorkbook(products, sender) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Wing 상품 행이 없습니다.");
  }
  const environmentId = await coupangEnvironment.environmentForTab(sender?.tab?.id);
  if (!environmentId) {
    throw new Error("현재 Wing 탭이 KidItem 환경에 연결되지 않았습니다.");
  }
  const response = await authedFetch(environmentId, "/api/channels/coupang-wing/inventory-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products, fileName: legacyWingInventoryFileName() }),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    let message = `Wing 상품목록 엑셀 변환 실패 (HTTP ${response.status})`;
    try {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      message = body?.message || body?.error || message;
    } catch {
      // Preserve the HTTP failure when the server did not return JSON.
    }
    throw new Error(message);
  }
  return {
    success: true,
    fileBase64: bytesToBase64(bytes),
    fileName: parseContentDispositionFilename(response.headers.get("content-disposition")) || "wing-inventory.xls",
    contentType: response.headers.get("content-type") || "application/vnd.ms-excel;charset=utf-8",
    total: products.length,
  };
}

function legacyWingInventoryFileName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `wing-inventory_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}.${pad(now.getMinutes())}.xls`;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function parseContentDispositionFilename(header) {
  if (typeof header !== "string") return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] || null;
}

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

// 동기화 완료 후 대시보드 탭 자동 새로고침
function notifyDashboard(environmentId) {
  return adsEnvironmentContext.publish(environmentId, "kiditem-sync");
}

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

  if (msg.action === "kiditemApiRequest") {
    const path = typeof msg.path === "string" ? msg.path : "";
    if (!path.startsWith("/api/") || /^https?:/i.test(path)) {
      sendResponse({ success: false, error: "허용되지 않은 API 경로입니다." });
      return;
    }
    Promise.resolve()
      .then(async () => {
        const environmentId = msg.environmentId ||
          (await coupangEnvironment.environmentForTab(sender?.tab?.id));
        adsEnvironmentContext.requireEnvironment(environmentId);
        const headers = new Headers(msg.init?.headers || {});
        headers.delete("authorization");
        const response = await authedFetch(environmentId, path, {
          ...(msg.init || {}),
          headers,
        });
        const body = await response.json().catch(() => null);
        return { success: true, ok: response.ok, status: response.status, body };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "exportWingInventoryWorkbook") {
    KidItemWorkerKeepAlive.during(
      exportWingInventoryWorkbook(msg.products, sender),
    )
      .then(sendResponse)
      .catch((error) => sendResponse({
        success: false,
        error: error?.message || "Wing 상품목록 엑셀 변환 실패",
      }));
    return true;
  }


});

// ═══ 대시보드(외부 웹페이지)에서 메시지 수신 ═══
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const senderEnvironment = adsEnvironmentContext.resolveSender(sender);
  if (!senderEnvironment) {
    sendResponse({ success: false, error: "Untrusted KidItem web origin" });
    return false;
  }
  const environmentId = senderEnvironment.environmentId;
  msg = { ...msg, environmentId };

  // 수집 세션 공통 액션(list/get/cancel/openAttentionTab)은 통합
  // 서비스워커가 producer 로 도메인을 골라 처리한다. 도메인 워커가 각자
  // 응답하면 세 리스너가 같은 메시지에 경쟁 응답하게 된다.

  // ping 은 통합 서비스워커가 세 도메인의 capabilities 를 합쳐 한 번만 응답한다.
  // 이 도메인의 capabilities 는 파일 끝의 KidItemDomains.register 로 넘긴다.

  if (msg.action === "setAuthToken") {
    const token = typeof msg.token === "string" ? msg.token : null;
    if (!token) {
      sendResponse({ success: false, error: "token required" });
      return;
    }
    adsEnvironmentContext.setAccessToken(environmentId, token)
      .then(() => sendResponse({ success: true, environmentId }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "clearAuthToken") {
    adsEnvironmentContext.clearAccessToken(environmentId)
      .then(() => sendResponse({ success: true, environmentId }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

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

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (data) => resolve(data || {}));
  });
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

function removeTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.remove(tabId, () =>
        resolve({ success: !chrome.runtime.lastError }),
      );
    } catch {
      resolve({ success: false });
    }
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
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

async function updateTabAndWait(tabId, url, options = {}) {
  const before = await getTab(tabId).catch(() => null);
  if (before?.active && options.allowActive !== true) {
    throw new Error("active user tab is collection-protected");
  }
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url, active: !!options.active }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      waitForTabComplete(tabId, {
        expectedUrl: url,
        previousUrl: before?.url || null,
      })
        .then(resolve)
        .catch(reject);
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
// producer 접두사로 이 도메인이 만든 수집 세션을 식별한다.
KidItemDomains.register({
  producerPrefixes: ["channels", "dashboard"],
  capabilities: {
    coupangCatalogSnapshot: true,
    coupangCatalogSourceAttempts: true,
    coupangCatalogSnapshotSource: "wing-inventory-v1",
    browserCollectionSessions: true,
    kiditemEnvironmentProfilesV1: true,
  },
  // 광고 수집(캠페인·키워드·수익성)은 새 런타임의 실행 kind라, 이 도메인에는
  // 취소하거나 복구할 브라우저 수집 세션이 남지 않는다(KID-373).
  cancelCollectionSession: async () => {
    throw new Error("Collection producer source owner does not support cancellation");
  },
});
