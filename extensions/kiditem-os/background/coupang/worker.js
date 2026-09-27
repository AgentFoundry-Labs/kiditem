// KIDITEM OS — 쿠팡 Wing/광고센터 도메인 워커
//
// 통합 서비스워커(`background/service-worker.js`)가 의존 모듈을 먼저 싣고
// 이 파일을 importScripts 로 불러온다. 세 도메인 워커가 `adsEnvironmentContext`,
// `collectionSessions` 같은 최상위 const 이름을 공유하므로 전체를 IIFE 로 감싸
// 각 도메인의 최상위 선언을 그 도메인 안에 가둔다. 본문 들여쓰기는 병합 diff 를
// 읽을 수 있게 유지하기 위해 원본 그대로 둔다.

chrome.runtime.onMessage.addListener(KidItemAdCollectorDelay.handleMessage);

// KidItem 웹앱이 열리는 커밋된 origin. externally_connectable / 대시보드 탭 조회 /
// 세션·auth 핸드셰이크가 모두 이 목록을 공유한다. (product-scraper 패턴)
const AD_ACTION_URL =
  "https://advertising.coupang.com/dashboard?kiditemExecuteActions=1#kiditemExecuteActions=1";
const COUPANG_SEARCH_URL = "https://www.coupang.com/np/search";
const WING_CATALOG_MAX_PAGES = 5;
const BATCH_SCRAPE_STATUS_KEY = "kiditem_batch_scrape";
const BATCH_SCRAPE_CANCEL_KEY = "kiditem_batch_scrape_cancel";
const COLLECTION_WINDOW_STORAGE_KEY = "kiditem_coupang_collection_window";
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
const collectionWindows = Object.fromEntries(
  adsEnvironmentContext.environmentIds.map((environmentId) => [
    environmentId,
    KidItemCollectionWindow.create({
      chrome,
      storageKey: coupangEnvironment.stateKey(COLLECTION_WINDOW_STORAGE_KEY, environmentId),
      sessions: collectionSessions,
      bindTab: (tabId) => coupangEnvironment.bindTab(tabId, environmentId),
      attemptEnded: (session) => coupangCollectionAttemptEnded(environmentId, session),
      collectionName: (session) => KidItemCoupangCollectionStart.collectionName(session?.producer),
    }),
  ]),
);
function collectionWindowFor(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return collectionWindows[environmentId];
}

// Every start of a collection that takes turns in the Coupang collection
// window, and of the Wing catalog import, goes through this admission (KID-147).
// It answers the web app once the start is decided and runs the source owner
// afterwards.
const coupangCollectionStart = KidItemCoupangCollectionStart.create({
  windowFor: collectionWindowFor,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  keepAlive: KidItemWorkerKeepAlive,
  manualReportUrl: KidItemAdCenterCollector.manualReportUrl,
  runs: {
    "advertising.ad_sync": ({ environmentId, attemptId }) =>
      adCampaignSourceOwner.run({ environmentId, attemptId }),
    "advertising.ad_keyword": ({ environmentId, attemptId }) =>
      adKeywordSourceOwner.run({ environmentId, attemptId }),
    // The profitability owner opens its import from the idempotency key, so
    // its run replays the begin the admission already made.
    "advertising.profitability_import": ({ environmentId, idempotencyKey }) =>
      profitabilitySourceOwner.run({ environmentId, idempotencyKey }),
  },
});

const adCenterCollectors = Object.fromEntries(
  adsEnvironmentContext.environmentIds.map((environmentId) => [
    environmentId,
    KidItemAdCenterCollector.create({
      window: collectionWindows[environmentId], chrome, sessions: collectionSessions,
      statusKey: coupangEnvironment.stateKey(BATCH_SCRAPE_STATUS_KEY, environmentId),
      cancelKey: coupangEnvironment.stateKey(BATCH_SCRAPE_CANCEL_KEY, environmentId),
      bindTab: (tabId) => coupangEnvironment.bindTab(tabId, environmentId),
      notify: () => notifyDashboard(environmentId),
    }),
  ]),
);
function adCenterCollectorFor(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return adCenterCollectors[environmentId];
}

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

// The source owners that close through collectionWindowFor share one window
// per environment. A run holds the window's turn until its outcome is reported
// and its window and session are released. The turn never waits: a run finds
// the window free, enters the turn the admission that started it holds, or is
// refused because another collection holds the window.
function coupangWindowTurn(producer) {
  return (environmentId, operation) =>
    coupangCollectionStart.takeTurn(environmentId, producer, operation);
}

// A leftover session can hold the window after its attempt ended. Only the
// producer's own source owner can tell, through its attempt control read.
async function coupangCollectionAttemptEnded(environmentId, session) {
  if (session?.environmentId !== environmentId) return false;
  const { attemptId } = session;
  switch (session.producer) {
    case "advertising.ad_sync":
      return adCampaignSourceOwner.attemptEnded(environmentId, attemptId);
    case "advertising.ad_keyword":
      return adKeywordSourceOwner.attemptEnded(environmentId, attemptId);
    case "advertising.profitability_import":
      return profitabilitySourceOwner.attemptEnded(environmentId, attemptId);
    default:
      return false;
  }
}

const profitabilitySourceOwner = KidItemProfitabilitySourceOwner.create({
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  collectSlice: collectAdvertisingProfitabilitySlice,
  closeAttempt: (environmentId, attemptId) =>
    collectionWindowFor(environmentId).close(attemptId),
  takeWindowTurn: coupangWindowTurn("advertising.profitability_import"),
});
const adKeywordSourceOwner = KidItemAdKeywordSourceOwner.create({
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  environmentForTab: (tabId) => coupangEnvironment.environmentForTab(tabId),
  ownedTab: async (environmentId, attemptId) => (await collectionWindowFor(environmentId).reattach(attemptId))?.tabId,
  collect: ({ environmentId, attemptId, control }) =>
    adCenterCollectorFor(environmentId).collectKeywords({ environmentId, attemptId, control }),
  closeAttempt: (environmentId, attemptId) => collectionWindowFor(environmentId).close(attemptId),
  takeWindowTurn: coupangWindowTurn("advertising.ad_keyword"),
});
chrome.runtime.onMessage.addListener(adKeywordSourceOwner.handleMessage);
const adCampaignSourceOwner = KidItemAdCampaignSourceOwner.create({
  chrome, sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  environmentForTab: tabId => coupangEnvironment.environmentForTab(tabId),
  ownedTab: async (environmentId, attemptId) => (await collectionWindowFor(environmentId).reattach(attemptId))?.tabId,
  collect: ({ environmentId, attemptId, control }) =>
    adCenterCollectorFor(environmentId).collectCampaigns({ environmentId, attemptId, control }),
  closeAttempt: (environmentId, attemptId) => collectionWindowFor(environmentId).close(attemptId),
  takeWindowTurn: coupangWindowTurn("advertising.ad_sync"),
});
chrome.runtime.onMessage.addListener(adCampaignSourceOwner.handleMessage);
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

  if (msg.action === "reportCollectionTargetProgress") {
    const runId = typeof msg.runId === "string" ? msg.runId : null;
    const progress = msg.progress;
    let senderUrl;
    try { senderUrl = new URL(sender?.url || sender?.tab?.url || ""); } catch {}
    if (!runId || !progress || typeof progress !== "object" || Array.isArray(progress)
      || Object.keys(msg).some((key) => !["action", "runId", "progress"].includes(key))
      || !Number.isInteger(sender?.tab?.id)
      || senderUrl?.origin !== "https://advertising.coupang.com"
      || senderUrl.username || senderUrl.password) {
      sendResponse({ success: false, error: "invalid collection progress" });
      return;
    }
    coupangEnvironment.environmentForTab(sender.tab.id)
      .then((environmentId) => adCenterCollectorFor(environmentId).reportProgress({
        environmentId, attemptId: runId, tabId: sender.tab.id, progress,
      }))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) =>
        sendResponse({ success: false, error: error?.message || "progress update failed" }),
      );
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

  if (msg.action === "openAndExecuteAdActions") {
    openAndExecuteAdActions(AD_ACTION_URL, environmentId)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "광고 액션 실행 탭 생성 실패",
        }),
      );
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

async function openAndExecuteAdActions(url = AD_ACTION_URL, environmentId) {
  const tab = await interactiveTabs.createTab({
    url,
    reason: INTERACTIVE_TAB_REASONS.AD_MUTATION,
  });
  await coupangEnvironment.bindTab(tab.id, environmentId);
  return new Promise((resolve) => {
      const tabId = tab.id;
      let sent = false;
      const cleanup = () => chrome.tabs.onUpdated.removeListener(onUpdated);
      const timeout = setTimeout(() => {
        cleanup();
        if (!sent)
          resolve({ success: true, opened: true, tabId, pendingLogin: true });
      }, 180000);

      const sendRunMessage = () => {
        if (sent) return;
        sent = true;
        clearTimeout(timeout);
        cleanup();
        setTimeout(() => {
          chrome.tabs.sendMessage(
            tabId,
            { action: "runApprovedQueuedAdActions" },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({
                  success: true,
                  opened: true,
                  tabId,
                  warning: chrome.runtime.lastError.message,
                });
                return;
              }
              resolve({ success: true, opened: true, tabId, response });
            },
          );
        }, 3000);
      };

      function onUpdated(updatedTabId, changeInfo, updatedTab) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        const currentUrl = updatedTab?.url || "";
        if (!currentUrl.startsWith("https://advertising.coupang.com/")) return;
        sendRunMessage();
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
  });
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

async function collectAdvertisingProfitabilitySlice({
  environmentId,
  attemptId,
  account,
  slice,
}) {
  return adCenterCollectorFor(environmentId).collectProfitabilitySlice({
    environmentId, attemptId, account, slice,
  });
}

async function cancelCollectionSession(runId, environmentId) {
  const session = await collectionSessions.getOwned(runId, environmentId);
  if (session?.producer === "advertising.ad_sync") {
    await adCenterCollectorFor(environmentId).cancelRun({ attemptId: runId });
    return adCampaignSourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === "advertising.ad_keyword") {
    await adCenterCollectorFor(environmentId).cancelRun({ attemptId: runId });
    return adKeywordSourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === "advertising.profitability_import") {
    await adCenterCollectorFor(environmentId).cancelRun({ attemptId: runId });
    return profitabilitySourceOwner.cancel({ environmentId, attemptId: runId });
  }
  throw new Error("Collection producer source owner does not support cancellation");
}

// A restarted worker continues a collection only through the web-app lifetime,
// which recovers an environment after it confirms a connected KidItem tab there
// and settles its stop requests. The ad campaign and keyword owners only
// settle attempts that already ended. Profitability continues its same live
// import inside the window turn a new start would take. The Wing catalog import
// continues its same unexpired attempt after taking the import turn a
// new start would take. The runs keep the worker alive on their own, so the
// lifetime is not held until they end.
function recoverCoupangCollections(environmentId) {
  for (const [label, recover] of [
    ["광고 캠페인 owner", () => adCampaignSourceOwner.recover(environmentId)],
    ["광고 키워드 owner", () => adKeywordSourceOwner.recover(environmentId)],
    ["수익성 광고비 source owner", () => profitabilitySourceOwner.recover(environmentId)],
  ]) {
    KidItemWorkerKeepAlive.during(Promise.resolve().then(recover)).catch((error) =>
      console.error(`[KIDITEM] ${label} 복구 실패:`, error?.message || error));
  }
}

// ── 통합 서비스워커 등록 ──
// producer 접두사로 이 도메인이 만든 수집 세션을 식별한다.
KidItemDomains.register({
  producerPrefixes: ["advertising", "channels", "dashboard"],
  externalActions: {
    startCollection: {
      validate: KidItemCoupangCollectionStart.parseRequest,
      handle: (request, environmentId) =>
        KidItemWorkerKeepAlive.during(coupangCollectionStart.start(request, environmentId)),
    },
  },
  capabilities: {
    profitabilityAdvertisingSourceOwnerV1: true,
    coupangCatalogSnapshot: true,
    coupangCatalogSourceAttempts: true,
    coupangCatalogSnapshotSource: "wing-inventory-v1",
    browserCollectionSessions: true,
    collectionStartV1: true,
    advertisingKeywordSourceOwnerV1: true,
    advertisingCampaignSourceOwnerV1: true,
    kiditemEnvironmentProfilesV1: true,
  },
  cancelCollectionSession,
  recoverCollections: (environmentId) => recoverCoupangCollections(environmentId),
});
