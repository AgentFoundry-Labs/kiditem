// KIDITEM OS — Background Service Worker

importScripts(
  "kiditem-auth.js",
  "../utils/coupang-seller-detail.js",
  "../shared/coupang-catalog-collector.js",
  "coupang-catalog-import.js",
);

const API_URL = "http://localhost:4000";
const AUTH_TOKEN_KEY = "kiditem_auth_token";
const AD_ACTION_URL =
  "https://advertising.coupang.com/dashboard?kiditemExecuteActions=1#kiditemExecuteActions=1";
const WING_CATALOG_FORM_URL =
  "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";
const WING_CATALOG_SEARCH_ENDPOINT = "/tenants/seller-web/pre-matching/search";
const COUPANG_SEARCH_URL = "https://www.coupang.com/np/search";
const COUPANG_AUTOCOMPLETE_ENDPOINT = "/np/search/autoComplete";
const WING_CATALOG_MAX_PAGES = 5;
const WING_CATALOG_PAGE_DELAY_MS = 1200;
const WING_RANK_STALE_AFTER_MS = 5 * 60 * 1000;
const WING_RANK_RESUME_ALARM = "wing-sales-rank-resume";
const COUPANG_KEYWORD_SEARCH_DELAY_MS = 900;
const COUPANG_RANK_MAX_PAGES = 3;
const COUPANG_RANK_PAGE_RENDER_DELAY_MS = 1200;
const COUPANG_OVERLAP_PRODUCT_DETAIL_LIMIT = 200;
const COUPANG_PRODUCT_DETAIL_RENDER_DELAY_MS = 1200;
const COUPANG_SELLER_CATALOG_BATCH_LIMIT = 20;
const COUPANG_SELLER_CATALOG_MAX_ITEMS = 500;
const COUPANG_SELLER_CATALOG_RENDER_DELAY_MS = 1200;
const BATCH_SCRAPE_STATUS_KEY = "kiditem_batch_scrape";
const BATCH_SCRAPE_CANCEL_KEY = "kiditem_batch_scrape_cancel";
const RANK_CHECK_STATUS_KEY = "kiditem_rank_check"; // Wing 판매순위 배치 전용
const KEYWORD_RANK_STATUS_KEY = "kiditem_keyword_rank_check"; // 쿠팡 검색(SERP) 키워드 순위 배치 전용
const COMPETITOR_SELLER_CATALOG_STATUS_KEY =
  "kiditem_competitor_seller_catalog_check";

const kidItemAuth = KidItemAuth.create({
  chrome,
  fetchFn: fetch,
  apiUrl: API_URL,
  tokenKey: AUTH_TOKEN_KEY,
  webUrlPatterns: ["http://localhost:3000/*"],
});
const { authedFetch, getAuthToken } = kidItemAuth;

chrome.runtime.onInstalled.addListener(() => {
  console.log("[KIDITEM] Extension installed");
  cleanupStorage();
  // 알람은 onInstalled에서만 등록 (서비스워커 재시작 시 유지됨)
  chrome.alarms.create("storage-cleanup", { periodInMinutes: 1440 });
  chrome.alarms.create("auto-scrape", { periodInMinutes: 180 });
  chrome.alarms.create("keyword-rank-check", { periodInMinutes: 720 });
  chrome.alarms.create(WING_RANK_RESUME_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create("coupang-keyword-serp-rank", { periodInMinutes: 720 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "storage-cleanup") cleanupStorage();
  if (alarm.name === "auto-scrape") autoScrape();
  if (alarm.name === "keyword-rank-check") runScheduledWingSalesRankCheck();
  if (alarm.name === WING_RANK_RESUME_ALARM)
    resumeInterruptedWingSalesRankCheck();
  if (alarm.name === "coupang-keyword-serp-rank")
    runScheduledKeywordRankCheck();
  KidItemCoupangCatalogImport.handleAlarm(alarm, coupangCatalogImportDependencies());
});

function cleanupStorage() {
  chrome.storage.local.get(null, (all) => {
    const keysToRemove = [];
    const now = Date.now();
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7일

    for (const [key, val] of Object.entries(all)) {
      // 싱크 기록 중 7일 지난 것 삭제
      if (
        key.startsWith("kiditem_last_sync_") &&
        val?.time &&
        now - val.time > MAX_AGE
      ) {
        keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove);
      console.log(`[KIDITEM] Storage 정리: ${keysToRemove.length}개 삭제`);
    }
  });
}

// 동기화 완료 후 대시보드 탭 자동 새로고침
function notifyDashboard() {
  chrome.tabs.query({ url: "http://localhost:3000/*" }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: () => window.dispatchEvent(new CustomEvent("kiditem-sync")),
        })
        .catch(() => {});
    }
  });
}

// 아이콘 클릭 시 사이드 패널 열기
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ═══ content script에서 메시지 수신 ═══
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "setAuthToken") {
    const token = typeof msg.token === "string" ? msg.token : null;
    if (!token) {
      sendResponse({ success: false, error: "token required" });
      return;
    }
    chrome.storage.local.set({ [AUTH_TOKEN_KEY]: token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.action === "triggerAutoScrape") {
    autoScrape()
      .then(() => {
        chrome.storage.local.get(["kiditem_auto_scrape"], (data) => {
          const result = data.kiditem_auto_scrape || {};
          sendResponse({
            success: true,
            completed: result.completed || 0,
            total: result.total || 0,
          });
        });
      })
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === "monthlyScrape") {
    const { year, month } = msg;
    if (!year || !month) {
      sendResponse({ success: false, error: "year/month 필수" });
      return;
    }
    chrome.storage.local.set({
      kiditem_monthly_sync: {
        year,
        month,
        completed: 0,
        total: 0,
        status: "starting",
      },
    });
    doMonthlyScrape(year, month).catch((e) => {
      chrome.storage.local.set({
        kiditem_monthly_sync: {
          year,
          month,
          completed: 0,
          total: 0,
          status: "error",
          error: e.message,
        },
      });
    });
    sendResponse({
      success: true,
      message: `${year}-${String(month).padStart(2, "0")} 일별 수집 시작`,
    });
    return; // sync response, no need for return true
  }

  // 배치 스크랩 진행률은 handleScrapeTargets 의 sequential 루프가 소유.
  // content script 의 auto-trigger 경로는 이 메시지를 보내지만, 카운트/상태는 오너(서비스워커)가 담당.
  // 여기서는 탭 자가 종료만 처리.
  if (msg.action === "reportBatchScrapeDone") {
    const tabId = sender?.tab?.id;
    if (tabId) {
      setTimeout(() => {
        try {
          chrome.tabs.remove(tabId);
        } catch {}
      }, 2000);
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === "syncToServer") {
    const payload = msg.payload || {};
    authedFetch(`/api/ads/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const key = `kiditem_last_sync_${payload.type || "unknown"}`;
          const count = Array.isArray(payload.data) ? payload.data.length : 0;
          chrome.storage.local.set({ [key]: { time: Date.now(), count } });
          // 대시보드 탭에 리로드 신호 전송
          notifyDashboard();
        }
        sendResponse(json);
      })
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true; // async response
  }
});

// ═══ 대시보드(외부 웹페이지)에서 메시지 수신 ═══
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action === "scrapeTargets") {
    // MV3 service worker가 긴 async chain 중 idle 종료되면 port가 닫혀 loop 중단됨.
    // 즉시 응답 + fire-and-forget. 진행률은 chrome.storage.local.kiditem_batch_scrape 에 기록.
    const urls = msg.urls || [];
    const runId =
      typeof msg.runId === "string"
        ? msg.runId
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();
    chrome.storage.local.remove(BATCH_SCRAPE_CANCEL_KEY);
    chrome.storage.local.set({
      [BATCH_SCRAPE_STATUS_KEY]: {
        runId,
        total: urls.length,
        completed: 0,
        failed: 0,
        current: 0,
        status: "starting",
        startedAt,
      },
    });
    handleScrapeTargets(urls, runId, startedAt).catch((e) => {
      chrome.storage.local.set({
        [BATCH_SCRAPE_STATUS_KEY]: {
          runId,
          status: "error",
          error: e.message,
          startedAt,
          endedAt: Date.now(),
        },
      });
    });
    sendResponse({
      success: true,
      started: true,
      total: urls.length,
      runId,
      startedAt,
    });
    return false;
  }

  if (msg.action === "getBatchScrapeStatus") {
    chrome.storage.local.get(BATCH_SCRAPE_STATUS_KEY, (data) => {
      const status = data[BATCH_SCRAPE_STATUS_KEY] || { status: "idle" };
      const runId = typeof msg.runId === "string" ? msg.runId : null;
      if (runId && status.runId && status.runId !== runId) {
        sendResponse({ status: "idle", runId, staleRunId: status.runId });
        return;
      }
      sendResponse(status);
    });
    return true;
  }

  if (msg.action === "cancelBatchScrape") {
    cancelBatchScrape(typeof msg.runId === "string" ? msg.runId : null)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({ success: false, error: e?.message || "수집 중단 실패" }),
      );
    return true;
  }

  if (msg.action === "ping") {
    sendResponse({
      success: true,
      version: chrome.runtime.getManifest().version,
      capabilities: {
        wingCatalogSearch: true,
        wingCatalogSearchSource: "wing-pre-matching",
        coupangKeywordSuggestions: true,
        coupangKeywordSuggestionSource: "coupang-search-page",
        coupangProductNameTokens: true,
        coupangKeywordRank: true,
        coupangKeywordRankSource: "coupang-search-page",
        coupangCompetitorSeller: true,
        coupangCompetitorSellerSource: "coupang-product-detail",
        coupangCompetitorSellerCatalog: true,
        coupangCompetitorSellerCatalogSource:
          "coupang-seller-shop-newest-first",
        coupangCompetitorSellerCatalogOnDemand: true,
        wingCatalogSalesRank: true,
        wingCatalogSalesRankSource: "wing-pre-matching-sales-28d",
        coupangCatalogSnapshot: true,
        coupangCatalogSnapshotSource: "wing-inventory-v1",
      },
    });
    return;
  }

  if (msg.action === "startCoupangCatalogImport") {
    KidItemCoupangCatalogImport.start(msg, coupangCatalogImportDependencies())
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 상품 수집 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getCoupangCatalogImportStatus") {
    KidItemCoupangCatalogImport.getStatus(
      typeof msg.runId === "string" ? msg.runId : null,
      coupangCatalogImportDependencies(),
    )
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ status: "error", runId: msg.runId, error: e?.message || "쿠팡 상품 수집 상태 조회 실패" }));
    return true;
  }

  if (msg.action === "cancelCoupangCatalogImport") {
    KidItemCoupangCatalogImport.cancel(
      typeof msg.runId === "string" ? msg.runId : null,
    )
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ success: false, error: e?.message || "쿠팡 상품 수집 중단 실패" }));
    return true;
  }

  if (msg.action === "searchWingCatalogProducts") {
    searchWingCatalogProducts(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "Wing 카탈로그 검색 실패",
        }),
      );
    return true;
  }

  if (msg.action === "searchCoupangKeywordSuggestions") {
    searchCoupangKeywordSuggestions(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 인기 키워드 수집 실패",
        }),
      );
    return true;
  }

  if (msg.action === "checkCoupangKeywordRank") {
    checkCoupangKeywordRank(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 키워드 순위 수집 실패",
        }),
      );
    return true;
  }

  if (msg.action === "runCoupangKeywordRankCheck") {
    startCoupangKeywordRankCheck()
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          started: false,
          error: e?.message || "키워드 순위 일괄 확인 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "runCoupangCompetitorSellerCatalog") {
    startCoupangCompetitorSellerCatalogCollection(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          started: false,
          error: e?.message || "판매자 상품 수집 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getCoupangCompetitorSellerCatalogStatus") {
    chrome.storage.local.get(COMPETITOR_SELLER_CATALOG_STATUS_KEY, (data) => {
      const status = data[COMPETITOR_SELLER_CATALOG_STATUS_KEY] || {
        status: "idle",
      };
      const runId = typeof msg.runId === "string" ? msg.runId : null;
      if (runId && status.runId && status.runId !== runId) {
        sendResponse({ status: "idle", runId, staleRunId: status.runId });
        return;
      }
      sendResponse(status);
    });
    return true;
  }

  if (msg.action === "runWingSalesRankCheck") {
    startWingSalesRankCheck()
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          started: false,
          error: e?.message || "Wing 판매순위 일괄 확인 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getWingSalesRankCheckStatus") {
    chrome.storage.local.get(RANK_CHECK_STATUS_KEY, (data) => {
      const status = data[RANK_CHECK_STATUS_KEY] || { status: "idle" };
      const runId = typeof msg.runId === "string" ? msg.runId : null;
      if (runId && status.runId && status.runId !== runId) {
        sendResponse({ status: "idle", runId, staleRunId: status.runId });
        return;
      }
      sendResponse(status);
    });
    return true;
  }

  if (msg.action === "getCoupangRankCheckStatus") {
    chrome.storage.local.get(KEYWORD_RANK_STATUS_KEY, (data) => {
      const status = data[KEYWORD_RANK_STATUS_KEY] || { status: "idle" };
      const runId = typeof msg.runId === "string" ? msg.runId : null;
      if (runId && status.runId && status.runId !== runId) {
        sendResponse({ status: "idle", runId, staleRunId: status.runId });
        return;
      }
      sendResponse(status);
    });
    return true;
  }

  if (msg.action === "registerWingThumbnail") {
    registerWingThumbnail(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 Wing 대표이미지 등록 실패",
        }),
      );
    return true;
  }

  if (msg.action === "setAuthToken") {
    const token = typeof msg.token === "string" ? msg.token : null;
    if (!token) {
      sendResponse({ success: false, error: "token required" });
      return;
    }
    chrome.storage.local.set({ [AUTH_TOKEN_KEY]: token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.action === "clearAuthToken") {
    chrome.storage.local.remove(AUTH_TOKEN_KEY, () =>
      sendResponse({ success: true }),
    );
    return true;
  }

  if (msg.action === "openAndExecuteAdActions") {
    openAndExecuteAdActions(msg.url || AD_ACTION_URL)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "광고 액션 실행 탭 생성 실패",
        }),
      );
    return true;
  }

  // ── 상품 수정 자동화: Wing 탭 열고 content script에 작업 위임 ──
  if (msg.action === "openAndEditProduct") {
    const { productName } = msg;
    const wingUrl = `https://wing.coupang.com/vendor-inventory/list?searchKeywordType=PRODUCT_NAME&searchKeywords=${encodeURIComponent(productName)}&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1`;

    // pending 작업 저장 (content script가 페이지 로드 시 읽어서 실행)
    chrome.storage.local.set(
      { kiditem_pending_edit: { productName, ts: Date.now() } },
      () => {
        chrome.tabs.create({ url: wingUrl, active: true }, (tab) => {
          if (!tab?.id) {
            sendResponse({ success: false, error: "탭 생성 실패" });
            return;
          }

          const tabId = tab.id;
          let resolved = false;

          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              sendResponse({ success: false, error: "타임아웃 (30초)" });
            }
          }, 30000);

          // 탭 로딩 완료 → content script에 메시지 전송
          const onUpdated = (updatedTabId, changeInfo) => {
            if (updatedTabId !== tabId || changeInfo.status !== "complete")
              return;
            chrome.tabs.onUpdated.removeListener(onUpdated);

            // 페이지 초기화 대기 후 메시지 전송 (pending 방식으로 이미 처리되지만 직접 전송도 시도)
            setTimeout(() => {
              chrome.tabs.sendMessage(
                tabId,
                { action: "searchAndEdit", productName },
                (response) => {
                  if (resolved) return;
                  resolved = true;
                  clearTimeout(timeout);
                  sendResponse(
                    response || {
                      success: false,
                      error: "content script 미응답",
                    },
                  );
                },
              );
            }, 3000);
          };

          chrome.tabs.onUpdated.addListener(onUpdated);
        });
      },
    );
    return true; // async
  }
});

function coupangCatalogImportDependencies() {
  return {
    activateTab,
    authedFetch,
    notifyDashboard,
    sendTabMessage,
    updateTabAndWait,
  };
}

async function searchWingCatalogProducts(message) {
  const keyword =
    typeof message.keyword === "string" ? message.keyword.trim() : "";
  if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };

  const maxPages = clampNumber(message.maxPages, 1, WING_CATALOG_MAX_PAGES, 2);
  const tab = await getOrCreateWingCatalogTab();
  const tabId = tab?.id;
  if (!tabId)
    return { success: false, error: "Wing 카탈로그 검색 탭을 열 수 없습니다" };

  const loaded = await waitForTabComplete(tabId, {
    expectedUrl: WING_CATALOG_FORM_URL,
    timeoutMs: 60000,
  }).catch((error) => ({
    error: error?.message || "Wing 상품등록 화면 로딩 실패",
  }));
  if (loaded?.error) return { success: false, error: loaded.error, tabId };
  if (!isWingCatalogFormUrl(loaded?.url || "")) {
    activateTab(tabId);
    return {
      success: false,
      pendingLogin: true,
      opened: true,
      tabId,
      error:
        "쿠팡 Wing 로그인 필요 — 열린 Wing 상품등록 탭에서 로그인 후 다시 실행하세요.",
    };
  }

  const startedAt = Date.now();
  const pages = [];
  const rows = [];
  const seen = new Set();
  const warnings = [];
  let searchPage = 0;
  let stopReason = "max_pages_reached";
  let upstreamTotal = null;

  for (let index = 0; index < maxPages; index++) {
    const payload = {
      keyword,
      excludedProductIds: [],
      searchPage,
      searchOrder: "DEFAULT",
      sortType: "DEFAULT",
    };
    const response = await executeWingCatalogSearch(tabId, payload);

    if (
      !response?.ok ||
      response.contentType?.includes("application/json") !== true
    ) {
      const messageText =
        response?.status === 429
          ? "Wing 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요."
          : "Wing이 JSON 대신 다른 응답을 반환했습니다.";
      if (rows.length === 0) {
        activateTab(tabId);
        return {
          success: false,
          opened: true,
          tabId,
          pendingLogin: response?.status === 401 || response?.status === 403,
          error: messageText,
          status: response?.status,
          contentType: response?.contentType,
        };
      }
      warnings.push(`${searchPage}페이지: ${messageText}`);
      stopReason = "non_json_response";
      break;
    }

    const body = response.body || {};
    const result = Array.isArray(body.result) ? body.result : [];
    upstreamTotal = upstreamTotal ?? resolveWingCatalogTotal(body);
    pages.push({
      searchPage,
      itemCount: result.length,
      nextSearchPage: body.nextSearchPage ?? null,
      total: resolveWingCatalogTotal(body),
    });

    for (const product of result) {
      const normalized = normalizeWingCatalogProduct(product);
      if (!normalized) continue;
      const key = `${normalized.productId || ""}:${normalized.itemId || ""}:${normalized.vendorItemId || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(normalized);
    }

    if (result.length === 0) {
      stopReason = "empty_page";
      break;
    }
    if (body.nextSearchPage == null) {
      stopReason = "no_next_search_page";
      break;
    }
    if (body.nextSearchPage === searchPage) {
      stopReason = "next_page_not_advancing";
      break;
    }
    searchPage = body.nextSearchPage;
    if (index < maxPages - 1) await sleep(WING_CATALOG_PAGE_DELAY_MS);
  }

  const reliableUpstreamTotal =
    upstreamTotal != null && upstreamTotal >= rows.length
      ? upstreamTotal
      : null;
  return {
    success: true,
    opened: true,
    tabId,
    keyword,
    maxPages,
    stopReason,
    pages,
    rows,
    total: reliableUpstreamTotal ?? rows.length,
    collectedCount: rows.length,
    upstreamTotal: reliableUpstreamTotal,
    warnings,
    endpoint: WING_CATALOG_SEARCH_ENDPOINT,
    dateWindow: "last28d",
    startedAt,
    endedAt: Date.now(),
  };
}

async function searchCoupangKeywordSuggestions(message) {
  const keyword =
    typeof message.keyword === "string" ? message.keyword.trim() : "";
  if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };

  const maxResults = clampNumber(message.maxResults, 1, 50, 20);
  const tab = await getOrCreateCoupangSearchTab(keyword);
  const tabId = tab?.id;
  if (!tabId) return { success: false, error: "쿠팡 검색 탭을 열 수 없습니다" };

  const loaded = await waitForTabComplete(tabId, {
    expectedUrl: buildCoupangSearchUrl(keyword),
    timeoutMs: 60000,
  }).catch((error) => ({
    error: error?.message || "쿠팡 검색 화면 로딩 실패",
  }));
  if (loaded?.error) return { success: false, error: loaded.error, tabId };
  if (!isCoupangSearchUrl(loaded?.url || "")) {
    activateTab(tabId);
    return {
      success: false,
      opened: true,
      tabId,
      error: "쿠팡 검색 페이지를 열 수 없습니다.",
    };
  }

  await sleep(COUPANG_KEYWORD_SEARCH_DELAY_MS);
  const response = await executeCoupangKeywordSuggestionSearch(
    tabId,
    keyword,
    maxResults,
  );
  if (!response?.success) {
    activateTab(tabId);
    return {
      success: false,
      opened: true,
      tabId,
      error: response?.error || "쿠팡 인기 키워드 수집 실패",
      status: response?.status,
      contentType: response?.contentType,
    };
  }

  return {
    success: true,
    opened: true,
    tabId,
    keyword,
    source: response.source || "coupang-search-page",
    items: Array.isArray(response.items) ? response.items : [],
    productNameTokens: Array.isArray(response.productNameTokens)
      ? response.productNameTokens
      : [],
    total: Array.isArray(response.items) ? response.items.length : 0,
    warnings: response.warnings || [],
    startedAt: Date.now(),
    endedAt: Date.now(),
  };
}

async function getOrCreateCoupangSearchTab(keyword) {
  const url = buildCoupangSearchUrl(keyword);
  const existing = await queryTabs({ url: `${COUPANG_SEARCH_URL}*` });
  const activeTab =
    existing.find((tab) => tab?.id && tab.status === "complete") ||
    existing.find((tab) => tab?.id);
  if (activeTab?.id) {
    return updateTabAndWait(activeTab.id, url, {
      active: false,
      timeoutMs: 60000,
    }).catch(() => activeTab);
  }

  const tab = await createTab({ url, active: false });
  if (!tab?.id) return tab;
  return waitForTabComplete(tab.id, {
    expectedUrl: url,
    timeoutMs: 60000,
  }).catch(() => tab);
}

async function executeCoupangKeywordSuggestionSearch(
  tabId,
  keyword,
  maxResults,
) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (requestKeyword, requestMaxResults, autocompleteEndpoint) => {
      const warnings = [];
      const candidates = [];
      const productNames = [];

      function addKeyword(value, source) {
        if (typeof value !== "string") return;
        const keyword = value.replace(/\s+/g, " ").trim();
        if (!isUsableKeyword(keyword, requestKeyword)) return;
        candidates.push({ keyword, source });
      }

      function isUsableKeyword(value, seed) {
        if (value.length < 2 || value.length > 40) return false;
        if (/https?:\/\//i.test(value)) return false;
        if (/^[\d\s,.-]+$/.test(value)) return false;
        if (/[₩원%]/.test(value)) return false;
        if (
          ["검색", "바로가기", "쿠팡", "로켓배송", "무료배송"].includes(value)
        )
          return false;
        const compact = value.replace(/\s+/g, "").toLowerCase();
        const compactSeed = String(seed || "")
          .replace(/\s+/g, "")
          .toLowerCase();
        return compact.length > 1 && compact !== compactSeed;
      }

      function collectFromJson(value, source) {
        if (typeof value === "string") {
          addKeyword(value, source);
          return;
        }
        if (Array.isArray(value)) {
          for (const item of value) collectFromJson(item, source);
          return;
        }
        if (!value || typeof value !== "object") return;
        for (const [key, nested] of Object.entries(value)) {
          if (
            /keyword|query|term|suggest|name|label|word/i.test(key) &&
            typeof nested === "string"
          ) {
            addKeyword(nested, source);
            continue;
          }
          collectFromJson(nested, source);
        }
      }

      function collectFromDom() {
        const selectors = [
          'a[href*="/np/search"]',
          'a[href*="q="]',
          '[class*="related"] a',
          '[class*="suggest"] a',
          '[class*="keyword"] a',
        ];
        for (const element of document.querySelectorAll(selectors.join(","))) {
          addKeyword(element.textContent || "", "coupang-search-dom");
          try {
            const href = element.getAttribute("href") || "";
            const parsed = new URL(href, location.origin);
            addKeyword(
              parsed.searchParams.get("q") ||
                parsed.searchParams.get("keyword") ||
                "",
              "coupang-search-dom",
            );
          } catch {}
        }
      }

      function collectProductNamesFromDom() {
        const selectors = [
          ".search-product-wrap .name",
          ".search-product .name",
          ".descriptions .name",
          "a.search-product-link",
          "li.search-product",
          '[class*="search-product"] [class*="name"]',
        ];
        for (const element of document.querySelectorAll(selectors.join(","))) {
          const text = (element.textContent || "").replace(/\s+/g, " ").trim();
          if (text.length < 4 || text.length > 180) continue;
          if (/장바구니|구매|광고|무료배송|로켓배송만 보기/.test(text))
            continue;
          productNames.push(text);
        }
      }

      try {
        const params = new URLSearchParams({ keyword: requestKeyword });
        const response = await fetch(
          `${autocompleteEndpoint}?${params.toString()}`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              Accept: "application/json, text/plain, */*",
              "X-Requested-With": "XMLHttpRequest",
            },
          },
        );
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();
        if (!response.ok) {
          warnings.push(`쿠팡 자동완성 호출 실패 (${response.status})`);
        } else if (contentType.includes("application/json")) {
          try {
            collectFromJson(JSON.parse(text), "coupang-autocomplete");
          } catch {
            warnings.push("쿠팡 자동완성 JSON 파싱 실패");
          }
        } else {
          collectFromJson(text, "coupang-autocomplete");
        }
      } catch (error) {
        warnings.push(error?.message || "쿠팡 자동완성 호출 실패");
      }

      collectFromDom();
      collectProductNamesFromDom();

      const seen = new Set();
      const items = [];
      for (const candidate of candidates) {
        const key = candidate.keyword.replace(/\s+/g, "").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          rank: items.length + 1,
          keyword: candidate.keyword,
          source: candidate.source,
        });
        if (items.length >= requestMaxResults) break;
      }

      const tokenCounts = new Map();
      const stopWords = new Set([
        "쿠팡",
        "로켓",
        "로켓배송",
        "무료배송",
        "무료",
        "배송",
        "정품",
        "국내",
        "당일",
        "오늘",
        "새상품",
        "상품",
        "구매",
        "할인",
        "특가",
        "옵션",
        "색상",
        "랜덤",
      ]);
      for (const name of productNames) {
        const tokens = name
          .replace(/[()[\]{}"'`~!@#$%^&*_+=|\\:;,.<>/?·•]/g, " ")
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 2 && token.length <= 20)
          .filter((token) => !/^[\d개입묶음세트]+$/.test(token))
          .filter((token) => !stopWords.has(token));
        const uniqueTokens = new Set(tokens);
        for (const token of uniqueTokens) {
          tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
        }
      }
      const productNameTokens = Array.from(tokenCounts.entries())
        .map(([keyword, count]) => ({ keyword, count }))
        .sort(
          (a, b) =>
            b.count - a.count || a.keyword.localeCompare(b.keyword, "ko"),
        )
        .slice(0, requestMaxResults);

      return {
        success: true,
        source: items.some((item) => item.source === "coupang-autocomplete")
          ? "coupang-autocomplete"
          : "coupang-search-dom",
        items,
        productNameTokens,
        warnings,
      };
    },
    args: [keyword, maxResults, COUPANG_AUTOCOMPLETE_ENDPOINT],
  });
  return result?.result || null;
}

// ═══ Wing 상품분석 최근 28일 판매량순 × 자사 카탈로그 전체 ═══

async function startWingSalesRankCheck() {
  const now = Date.now();
  let runId = `${now}-${Math.random().toString(36).slice(2)}`;
  let startedAt = now;
  const existingData = await getStorage(RANK_CHECK_STATUS_KEY);
  const existing = existingData[RANK_CHECK_STATUS_KEY];
  const existingIsActive =
    existing &&
    (existing.status === "running" || existing.status === "starting");
  const lastHeartbeatAt = existing?.heartbeatAt || existing?.startedAt || 0;
  if (existingIsActive && now - lastHeartbeatAt < WING_RANK_STALE_AFTER_MS) {
    return {
      success: false,
      started: false,
      error: "이미 Wing 판매순위 확인이 진행 중입니다",
      runId: existing.runId || null,
    };
  }
  if (existingIsActive) {
    runId = existing.runId || runId;
    startedAt = existing.startedAt || startedAt;
  }

  let targetResponse;
  try {
    const response = await authedFetch(`/api/ads/keyword-rank/wing-targets`);
    if (!response.ok)
      throw new Error(`자사 상품 대표 키워드 조회 실패 (${response.status})`);
    targetResponse = await response.json();
  } catch (error) {
    const errorMessage = error?.message || "자사 상품 대표 키워드 조회 실패";
    await chrome.storage.local.set({
      [RANK_CHECK_STATUS_KEY]: {
        runId,
        total: 0,
        completed: 0,
        failed: 0,
        status: "error",
        error: errorMessage,
        startedAt,
        endedAt: Date.now(),
      },
    });
    return { success: false, started: false, error: errorMessage, runId };
  }

  const targets = Array.isArray(targetResponse?.targets)
    ? targetResponse.targets.filter(
        (target) =>
          target && typeof target.keyword === "string" && target.keyword.trim(),
      )
    : [];
  const productTotal = Number(targetResponse?.productCount) || 0;
  const pendingProductTotal =
    Number(targetResponse?.pendingProductCount) || productTotal;
  const resumed = existingIsActive || targetResponse?.resumed === true;
  if (targets.length === 0) {
    await chrome.storage.local.set({
      [RANK_CHECK_STATUS_KEY]: {
        runId,
        total: 0,
        productTotal,
        pendingProductTotal: 0,
        completed: 0,
        failed: 0,
        status: "done",
        startedAt,
        heartbeatAt: Date.now(),
        endedAt: Date.now(),
      },
    });
    return { success: true, started: false, total: 0, productTotal, runId };
  }

  await chrome.storage.local.set({
    [RANK_CHECK_STATUS_KEY]: {
      runId,
      total: targets.length,
      productTotal,
      pendingProductTotal,
      completed: 0,
      failed: 0,
      current: null,
      status: "starting",
      startedAt,
      heartbeatAt: Date.now(),
      resumed,
    },
  });
  runWingSalesRankBatch(targets, productTotal, runId, startedAt).catch(
    (error) => {
      chrome.storage.local.set({
        [RANK_CHECK_STATUS_KEY]: {
          runId,
          total: targets.length,
          productTotal,
          status: "error",
          error: error?.message || String(error),
          startedAt,
          heartbeatAt: Date.now(),
          endedAt: Date.now(),
        },
      });
    },
  );
  return {
    success: true,
    started: true,
    total: targets.length,
    productTotal,
    pendingProductTotal,
    resumed,
    runId,
  };
}

async function runWingSalesRankBatch(targets, productTotal, runId, startedAt) {
  const total = targets.length;
  let completed = 0;
  let failed = 0;
  let rankedProducts = 0;
  const failures = [];
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);

  try {
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      const keyword = String(target.keyword || "").trim();
      const maxPages = clampNumber(
        target.maxPages,
        1,
        WING_CATALOG_MAX_PAGES,
        5,
      );
      await chrome.storage.local.set({
        [RANK_CHECK_STATUS_KEY]: {
          runId,
          total,
          productTotal,
          completed,
          failed,
          rankedProducts,
          current: keyword,
          currentProducts: Number(target.productCount) || 0,
          currentIndex: index + 1,
          status: "running",
          startedAt,
          heartbeatAt: Date.now(),
        },
      });

      let completedTarget = false;
      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const search = await searchWingCatalogProducts({ keyword, maxPages });
          if (!search?.success)
            throw new Error(search?.error || "Wing 상품분석 조회 실패");
          const sortedItems = sortWingCatalogRowsBySales(search.rows || []);
          const targetIds = new Set(
            Array.isArray(target.vendorItemIds)
              ? target.vendorItemIds.map(String)
              : [],
          );
          const matchedCount = sortedItems.filter(
            (item) =>
              item.vendorItemId && targetIds.has(String(item.vendorItemId)),
          ).length;
          const sync = await postWingSalesRankSync({
            keyword,
            pagesScanned: Array.isArray(search.pages)
              ? search.pages.length
              : maxPages,
            collectedCount: Number(search.collectedCount) || sortedItems.length,
            totalResults: Number.isFinite(Number(search.upstreamTotal))
              ? Number(search.upstreamTotal)
              : null,
            items: sortedItems,
          });
          if (!sync?.success)
            throw new Error(sync?.error || "Wing 판매순위 저장 실패");
          rankedProducts += matchedCount;
          completed++;
          completedTarget = true;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 2) await sleep(randomDelayMs(5000, 9000));
        }
      }
      if (!completedTarget) {
        failed++;
        failures.push({
          keyword,
          error: lastError?.message || String(lastError),
        });
        console.error(
          `[KIDITEM] Wing 판매순위 확인 실패 (${keyword}):`,
          lastError?.message || lastError,
        );
      }

      if (index < targets.length - 1) await sleep(randomDelayMs(1200, 2500));
      await chrome.storage.local.set({
        [RANK_CHECK_STATUS_KEY]: {
          runId,
          total,
          productTotal,
          completed,
          failed,
          rankedProducts,
          current: keyword,
          currentProducts: Number(target.productCount) || 0,
          currentIndex: index + 1,
          status: "running",
          startedAt,
          heartbeatAt: Date.now(),
        },
      });
    }
  } finally {
    clearInterval(keepAlive);
  }

  await chrome.storage.local.set({
    [RANK_CHECK_STATUS_KEY]: {
      runId,
      total,
      productTotal,
      completed,
      failed,
      rankedProducts,
      failures,
      current: null,
      status: "done",
      startedAt,
      heartbeatAt: Date.now(),
      endedAt: Date.now(),
    },
  });
  notifyDashboard();
  return {
    success: true,
    completed,
    failed,
    total,
    productTotal,
    rankedProducts,
    runId,
  };
}

function sortWingCatalogRowsBySales(rows) {
  return [...(Array.isArray(rows) ? rows : [])]
    .sort(
      (a, b) =>
        (Number(b?.salesLast28d) || 0) - (Number(a?.salesLast28d) || 0) ||
        (Number(b?.estimatedRevenue28d) || 0) -
          (Number(a?.estimatedRevenue28d) || 0) ||
        String(a?.productId || "").localeCompare(String(b?.productId || "")),
    )
    .map((item, index) => ({ ...item, salesRank: index + 1 }));
}

async function postWingSalesRankSync(capture) {
  const capturedAt = new Date().toISOString();
  const response = await authedFetch(`/api/ads/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "wing_sales_rank",
      source: "wing-pre-matching",
      timestamp: capturedAt,
      data: [{ ...capture, capturedAt }],
    }),
  });
  const json = await response.json().catch(() => null);
  if (json?.success) {
    chrome.storage.local.set({
      kiditem_last_sync_wing_sales_rank: { time: Date.now(), count: 1 },
    });
    notifyDashboard();
  }
  return (
    json || {
      success: false,
      error: `sync 응답 파싱 실패 (${response.status})`,
    }
  );
}

async function runScheduledWingSalesRankCheck() {
  const token = await getAuthToken();
  if (!token) return;
  try {
    await startWingSalesRankCheck();
  } catch (error) {
    console.error(
      "[KIDITEM] Wing 판매순위 자동 확인 실패:",
      error?.message || error,
    );
  }
}

async function resumeInterruptedWingSalesRankCheck() {
  const token = await getAuthToken();
  if (!token) return;
  const data = await getStorage(RANK_CHECK_STATUS_KEY);
  const status = data[RANK_CHECK_STATUS_KEY];
  if (!status || (status.status !== "running" && status.status !== "starting"))
    return;
  const lastHeartbeatAt = status.heartbeatAt || status.startedAt || 0;
  if (Date.now() - lastHeartbeatAt < WING_RANK_STALE_AFTER_MS) return;
  try {
    await startWingSalesRankCheck();
  } catch (error) {
    console.error(
      "[KIDITEM] 중단된 Wing 판매순위 재개 실패:",
      error?.message || error,
    );
  }
}

// ═══ 레거시 공개 쿠팡 검색 노출순위 (수동 호환용) ═══
// 공개 검색 페이지(www.coupang.com/np/search)를 열어 상품 목록을 DOM 순서대로 수집하고
// /api/ads/extension/sync 로 keyword_rank 페이로드를 전송한다. 순위 매칭/저장은 서버가 담당.

async function checkCoupangKeywordRank(message) {
  const keyword =
    typeof message.keyword === "string" ? message.keyword.trim() : "";
  if (!keyword) return { success: false, error: "검색 키워드를 입력하세요" };
  const maxPages = clampNumber(message.maxPages, 1, COUPANG_RANK_MAX_PAGES, 2);

  const capture = await captureCoupangKeywordSerp(keyword, maxPages);
  if (!capture.success) {
    if (capture.tabId) activateTab(capture.tabId);
    return {
      success: false,
      keyword,
      error: capture.error || "쿠팡 키워드 순위 수집 실패",
      wall: capture.wall || null,
      tabId: capture.tabId || null,
    };
  }

  let posted = false;
  let sync = null;
  if (message.post !== false) {
    const token = await getAuthToken();
    if (token) {
      sync = await postKeywordRankSync(capture).catch((e) => ({
        success: false,
        error: e?.message || "순위 데이터 전송 실패",
      }));
      posted = !!sync?.success;
    }
  }

  return {
    success: true,
    keyword,
    pagesScanned: capture.pagesScanned,
    items: capture.items,
    total: capture.items.length,
    usedFallback: !!capture.usedFallback,
    posted,
    sync,
    tabId: capture.tabId || null,
  };
}

// 등록된 트래커 전체를 순차 확인. 즉시 응답 + fire-and-forget (scrapeTargets 패턴).
// 진행률은 chrome.storage.local[KEYWORD_RANK_STATUS_KEY] 에 기록(Wing 판매순위 배치와 별도 키).
async function startCoupangKeywordRankCheck() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const startedAt = Date.now();

  const existingData = await getStorage(KEYWORD_RANK_STATUS_KEY);
  const existing = existingData[KEYWORD_RANK_STATUS_KEY];
  if (
    existing &&
    (existing.status === "running" || existing.status === "starting") &&
    Date.now() - (existing.startedAt || 0) < 30 * 60 * 1000
  ) {
    return {
      success: false,
      started: false,
      error: "이미 키워드 순위 확인이 진행 중입니다",
      runId: existing.runId || null,
    };
  }

  let trackers = [];
  try {
    const res = await authedFetch(`/api/ads/keyword-rank/trackers`);
    if (!res.ok) throw new Error(`키워드 트래커 조회 실패 (${res.status})`);
    const json = await res.json();
    trackers = Array.isArray(json)
      ? json
      : Array.isArray(json?.trackers)
        ? json.trackers
        : Array.isArray(json?.data)
          ? json.data
          : [];
  } catch (error) {
    const errorMessage = error?.message || "키워드 트래커 조회 실패";
    await chrome.storage.local.set({
      [KEYWORD_RANK_STATUS_KEY]: {
        runId,
        total: 0,
        completed: 0,
        failed: 0,
        status: "error",
        error: errorMessage,
        startedAt,
        endedAt: Date.now(),
      },
    });
    return { success: false, started: false, error: errorMessage, runId };
  }

  const enabled = trackers.filter(
    (tracker) =>
      tracker &&
      tracker.enabled !== false &&
      typeof tracker.keyword === "string" &&
      tracker.keyword.trim(),
  );
  if (enabled.length === 0) {
    await chrome.storage.local.set({
      [KEYWORD_RANK_STATUS_KEY]: {
        runId,
        total: 0,
        completed: 0,
        failed: 0,
        status: "done",
        startedAt,
        endedAt: Date.now(),
      },
    });
    return { success: true, started: false, total: 0, runId };
  }

  await chrome.storage.local.set({
    [KEYWORD_RANK_STATUS_KEY]: {
      runId,
      total: enabled.length,
      completed: 0,
      failed: 0,
      current: null,
      status: "starting",
      startedAt,
    },
  });

  runCoupangKeywordRankBatch(enabled, runId, startedAt).catch((e) => {
    chrome.storage.local.set({
      [KEYWORD_RANK_STATUS_KEY]: {
        runId,
        total: enabled.length,
        status: "error",
        error: e?.message || String(e),
        startedAt,
        endedAt: Date.now(),
      },
    });
  });

  return { success: true, started: true, total: enabled.length, runId };
}

async function startCoupangCompetitorSellerCatalogCollection(message) {
  const sellerId =
    typeof message?.sellerId === "string" ? message.sellerId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(sellerId)) {
    return {
      success: false,
      started: false,
      error: "수집할 판매자 식별자가 올바르지 않습니다",
    };
  }

  const runId = `seller-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const startedAt = Date.now();
  const existingData = await getStorage(COMPETITOR_SELLER_CATALOG_STATUS_KEY);
  const existing = existingData[COMPETITOR_SELLER_CATALOG_STATUS_KEY];
  if (
    existing &&
    (existing.status === "running" || existing.status === "starting") &&
    Date.now() - (existing.startedAt || 0) < 30 * 60 * 1000
  ) {
    return {
      success: false,
      started: false,
      error: `${existing.sellerName || "다른 판매자"} 상품을 이미 수집 중입니다`,
      runId: existing.runId || null,
    };
  }

  const targets = await fetchCoupangCompetitorSellerTargets(200);
  const target = targets.find(
    (candidate) => String(candidate?.sellerId || "").trim() === sellerId,
  );
  if (!target || !isCoupangSellerStoreUrl(target.sellerStoreUrl)) {
    return {
      success: false,
      started: false,
      error: "서버의 추적 판매자 목록에서 해당 판매자샵을 찾지 못했습니다",
    };
  }

  await chrome.storage.local.set({
    [COMPETITOR_SELLER_CATALOG_STATUS_KEY]: {
      runId,
      sellerId,
      sellerName: target.sellerName || sellerId,
      total: 1,
      completed: 0,
      failed: 0,
      current: `${target.sellerName || sellerId} 상품 준비 중`,
      status: "starting",
      startedAt,
    },
  });

  runCoupangCompetitorSellerCatalogCollection(target, runId, startedAt).catch(
    (error) => {
      chrome.storage.local.set({
        [COMPETITOR_SELLER_CATALOG_STATUS_KEY]: {
          runId,
          sellerId,
          sellerName: target.sellerName || sellerId,
          total: 1,
          completed: 0,
          failed: 1,
          current: null,
          status: "error",
          error: error?.message || String(error),
          startedAt,
          endedAt: Date.now(),
        },
      });
    },
  );

  return {
    success: true,
    started: true,
    total: 1,
    runId,
    sellerId,
    sellerName: target.sellerName || sellerId,
  };
}

async function runCoupangCompetitorSellerCatalogCollection(
  target,
  runId,
  startedAt,
) {
  let tabId = null;
  try {
    const tab = await createTab({
      url: target.sellerStoreUrl,
      active: false,
    });
    tabId = tab?.id || null;
    if (!tabId) throw new Error("쿠팡 판매자샵 탭을 열 수 없습니다");

    await chrome.storage.local.set({
      [COMPETITOR_SELLER_CATALOG_STATUS_KEY]: {
        runId,
        sellerId: target.sellerId,
        sellerName: target.sellerName || target.sellerId,
        total: 1,
        completed: 0,
        failed: 0,
        current: `${target.sellerName || target.sellerId} 전체상품 수집 중`,
        status: "running",
        startedAt,
      },
    });

    const catalogs = await collectCoupangSellerCatalogs(tabId, [target], 1);
    const catalog = catalogs[0];
    if (!catalog) {
      throw new Error(
        "판매자샵에서 상품을 찾지 못했습니다. 쿠팡 로그인·보안문자 또는 판매자샵 화면을 확인해 주세요.",
      );
    }
    const sync = await postCompetitorSellerCatalogSync([catalog]);
    if (!sync?.success) {
      throw new Error(sync?.error || "판매자 상품 전송 실패");
    }

    await chrome.storage.local.set({
      [COMPETITOR_SELLER_CATALOG_STATUS_KEY]: {
        runId,
        sellerId: target.sellerId,
        sellerName: catalog.sellerName || target.sellerName || target.sellerId,
        total: 1,
        completed: 1,
        failed: 0,
        catalogProductCount: catalog.collectedProductCount || 0,
        current: null,
        status: "done",
        startedAt,
        endedAt: Date.now(),
      },
    });
    notifyDashboard();
  } finally {
    if (tabId) await removeTab(tabId).catch(() => {});
  }
}

async function runCoupangKeywordRankBatch(trackers, runId, startedAt) {
  const total = trackers.length;
  let completed = 0;
  let failed = 0;
  let resolvedSellerProductCount = 0;
  let trackedSellerCount = 0;
  const failures = [];
  let tabId = null;

  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);

  try {
    for (let i = 0; i < trackers.length; i++) {
      const tracker = trackers[i];
      const keyword = String(tracker.keyword || "").trim();
      const maxPages = clampNumber(
        tracker.maxPages,
        1,
        COUPANG_RANK_MAX_PAGES,
        2,
      );

      await chrome.storage.local.set({
        [KEYWORD_RANK_STATUS_KEY]: {
          runId,
          total,
          completed,
          failed,
          current: keyword,
          currentIndex: i + 1,
          status: "running",
          startedAt,
        },
      });

      try {
        const capture = await captureCoupangKeywordSerp(keyword, maxPages, {
          tabId,
        });
        if (capture.tabId) tabId = capture.tabId;
        if (!capture.success)
          throw new Error(capture.error || "쿠팡 키워드 순위 수집 실패");
        const sync = await postKeywordRankSync(capture);
        if (!sync?.success)
          throw new Error(sync?.error || "순위 데이터 전송 실패");
        completed++;
      } catch (error) {
        failed++;
        failures.push({ keyword, error: error?.message || String(error) });
        console.error(
          `[KIDITEM] 키워드 순위 확인 실패 (${keyword}):`,
          error?.message || error,
        );
      }

      if (i < trackers.length - 1) await sleep(randomDelayMs(4000, 8000));
    }

    if (tabId) {
      // 이미 식별된 지정/기존 판매자는 상품 상세 발굴보다 먼저 수집한다.
      // 상품 상세 대상이 많아 MV3 서비스워커가 중간 종료되더라도, 사용자가
      // 명시적으로 추적한 판매자샵의 최신 상품은 이번 실행 초반에 저장된다.
      const trackedSellerIds = new Set();
      const initialSellerTargets = await fetchCoupangCompetitorSellerTargets(
        COUPANG_SELLER_CATALOG_BATCH_LIMIT,
      );
      await chrome.storage.local.set({
        [KEYWORD_RANK_STATUS_KEY]: {
          runId,
          total,
          completed,
          failed,
          current: `지정 판매자 ${initialSellerTargets.length}곳 상품 추적`,
          status: "running",
          startedAt,
        },
      });
      const initialSellerCatalogs = await collectCoupangSellerCatalogs(
        tabId,
        initialSellerTargets,
        COUPANG_SELLER_CATALOG_BATCH_LIMIT,
      );
      if (initialSellerCatalogs.length > 0) {
        const initialCatalogSync = await postCompetitorSellerCatalogSync(
          initialSellerCatalogs,
        );
        if (!initialCatalogSync?.success) {
          throw new Error(
            initialCatalogSync?.error || "지정 판매자 상품 전송 실패",
          );
        }
        for (const catalog of initialSellerCatalogs) {
          if (catalog?.sellerId) trackedSellerIds.add(catalog.sellerId);
        }
      }

      const productTargets = await fetchCoupangCompetitorProductTargets(
        COUPANG_OVERLAP_PRODUCT_DETAIL_LIMIT,
      );
      await chrome.storage.local.set({
        [KEYWORD_RANK_STATUS_KEY]: {
          runId,
          total,
          completed,
          failed,
          current: `겹치는 상품 ${productTargets.length}개 판매자 확인`,
          status: "running",
          startedAt,
        },
      });
      const sellerIdentities = await resolveCoupangCompetitorSellerIdentities(
        tabId,
        productTargets,
        async ({ processed, targetCount }) => {
          await chrome.storage.local.set({
            [KEYWORD_RANK_STATUS_KEY]: {
              runId,
              total,
              completed,
              failed,
              current: `겹치는 상품 ${processed}/${targetCount} 판매자 확인`,
              status: "running",
              startedAt,
            },
          });
        },
      );
      if (sellerIdentities.length > 0) {
        const identitySync =
          await postCompetitorSellerIdentitySync(sellerIdentities);
        if (!identitySync?.success) {
          throw new Error(
            identitySync?.error || "겹치는 상품 판매자 전송 실패",
          );
        }
      }
      resolvedSellerProductCount = sellerIdentities.length;

      const targets = await fetchCoupangCompetitorSellerTargets(
        COUPANG_SELLER_CATALOG_BATCH_LIMIT,
      );
      const remainingTargets = targets.filter(
        (target) => !trackedSellerIds.has(String(target?.sellerId || "")),
      );
      await chrome.storage.local.set({
        [KEYWORD_RANK_STATUS_KEY]: {
          runId,
          total,
          completed,
          failed,
          current: `새로 확인한 판매자 ${remainingTargets.length}곳 상품 추적`,
          status: "running",
          startedAt,
        },
      });
      const sellerCatalogs = await collectCoupangSellerCatalogs(
        tabId,
        remainingTargets,
        COUPANG_SELLER_CATALOG_BATCH_LIMIT,
      );
      if (sellerCatalogs.length > 0) {
        const sync = await postCompetitorSellerCatalogSync(sellerCatalogs);
        if (!sync?.success) {
          throw new Error(sync?.error || "겹치는 판매자 상품 전송 실패");
        }
        for (const catalog of sellerCatalogs) {
          if (catalog?.sellerId) trackedSellerIds.add(catalog.sellerId);
        }
      }
      trackedSellerCount = trackedSellerIds.size;
    }
  } finally {
    clearInterval(keepAlive);
    if (tabId) await removeTab(tabId).catch(() => {});
  }

  await chrome.storage.local.set({
    [KEYWORD_RANK_STATUS_KEY]: {
      runId,
      total,
      completed,
      failed,
      failures,
      resolvedSellerProductCount,
      trackedSellerCount,
      current: null,
      status: "done",
      startedAt,
      endedAt: Date.now(),
    },
  });
  notifyDashboard();

  console.log(
    `[KIDITEM] 키워드 순위 일괄 확인 완료: ${completed}/${total} 성공, ${failed} 실패`,
  );
  return {
    success: true,
    completed,
    failed,
    total,
    resolvedSellerProductCount,
    trackedSellerCount,
    runId,
  };
}

// 12시간마다 자동 실행 — 토큰 없으면 조용히 건너뜀
async function runScheduledKeywordRankCheck() {
  const token = await getAuthToken();
  if (!token) return;
  try {
    await startCoupangKeywordRankCheck();
  } catch (e) {
    console.error("[KIDITEM] 키워드 순위 자동 확인 실패:", e?.message || e);
  }
}

async function captureCoupangKeywordSerp(keyword, maxPages, options = {}) {
  const items = [];
  let tabId = options.tabId || null;
  let pagesScanned = 0;
  let usedFallback = false;
  let wall = null;

  if (tabId) {
    const alive = await getTab(tabId).catch(() => null);
    if (!alive?.id) tabId = null;
  }

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = buildCoupangRankSearchUrl(keyword, page);

    if (!tabId) {
      const tab = await getOrCreateCoupangRankSearchTab(pageUrl);
      tabId = tab?.id || null;
      if (!tabId)
        return { success: false, error: "쿠팡 검색 탭을 열 수 없습니다" };
    } else {
      const loaded = await updateTabAndWait(tabId, pageUrl, {
        active: false,
      }).catch(() => null);
      if (!loaded) {
        if (items.length === 0)
          return { success: false, tabId, error: "쿠팡 검색 페이지 로딩 실패" };
        break;
      }
    }

    const currentTab = await getTab(tabId).catch(() => null);
    if (!isCoupangSearchUrl(currentTab?.url || "")) {
      if (items.length === 0) {
        return {
          success: false,
          tabId,
          wall: "redirect",
          error:
            "쿠팡 검색 페이지가 아닌 화면으로 이동했습니다 — 열린 탭에서 로그인/보안문자 여부를 확인하세요.",
        };
      }
      break;
    }

    await sleep(COUPANG_RANK_PAGE_RENDER_DELAY_MS);

    let extraction;
    try {
      extraction = await executeCoupangSerpExtraction(tabId);
    } catch (error) {
      if (items.length === 0) {
        return {
          success: false,
          tabId,
          error: error?.message || "쿠팡 검색 결과 파싱 실패",
        };
      }
      break;
    }
    if (!extraction) {
      if (items.length === 0)
        return { success: false, tabId, error: "쿠팡 검색 결과 파싱 실패" };
      break;
    }

    wall = extraction.wall || wall;
    usedFallback = usedFallback || !!extraction.usedFallback;

    const pageItems = Array.isArray(extraction.items) ? extraction.items : [];
    if (pageItems.length === 0) {
      if (page === 1) {
        const hint =
          extraction.wall === "captcha"
            ? "쿠팡 보안문자(캡차) 화면이 감지되었습니다."
            : extraction.wall === "login"
              ? "쿠팡 로그인 화면이 감지되었습니다."
              : "상품 목록 마크업을 찾지 못했습니다.";
        return {
          success: false,
          tabId,
          wall: extraction.wall || null,
          error: `쿠팡 검색 결과가 비어 있습니다 — ${hint} 열린 탭에서 화면을 확인하세요.`,
        };
      }
      break; // 마지막 페이지 도달
    }

    for (let index = 0; index < pageItems.length; index++) {
      const raw = pageItems[index];
      items.push({
        rank: items.length + 1,
        page,
        positionInPage: index + 1,
        isAd: !!raw.isAd,
        productId: raw.productId || null,
        itemId: raw.itemId || null,
        vendorItemId: raw.vendorItemId || null,
        name: raw.name || null,
        priceKrw: raw.priceKrw ?? null,
        reviewCount: raw.reviewCount ?? null,
        ratingScore: raw.ratingScore ?? null,
        link: raw.link || null,
      });
    }
    pagesScanned = page;

    if (page < maxPages) await sleep(randomDelayMs(1500, 3000));
  }

  if (items.length === 0) {
    return {
      success: false,
      tabId,
      wall,
      error: "쿠팡 검색 결과에서 상품을 찾지 못했습니다",
    };
  }

  return {
    success: true,
    tabId,
    keyword,
    pagesScanned,
    items,
    usedFallback,
    wall,
  };
}

async function resolveCoupangCompetitorSellerIdentities(
  tabId,
  targets,
  onProgress = null,
) {
  if (!tabId) return [];
  const detailsByProduct = new Map();
  const identities = [];
  const validTargets = targets.filter((target) =>
    isCoupangProductDetailUrl(target?.link),
  );
  const targetKeys = new Set(
    validTargets.map((target) => buildCoupangProductDetailKey(target)),
  );
  let processed = 0;
  for (const target of targets) {
    if (!isCoupangProductDetailUrl(target?.link)) continue;
    const detailKey = buildCoupangProductDetailKey(target);
    let detail = detailsByProduct.get(detailKey);
    if (detail === undefined) {
      try {
        const loaded = await updateTabAndWait(tabId, target.link, {
          active: false,
        });
        if (!loaded) throw new Error("상품 상세 페이지 로딩 실패");
        const current = await getTab(tabId).catch(() => null);
        if (!isCoupangProductDetailUrl(current?.url || "")) {
          throw new Error("상품 상세가 아닌 페이지로 이동했습니다");
        }
        await sleep(COUPANG_PRODUCT_DETAIL_RENDER_DELAY_MS);
        detail = await executeCoupangSellerDetailExtraction(tabId);
        if (!detail) {
          await sleep(COUPANG_PRODUCT_DETAIL_RENDER_DELAY_MS);
          detail = await executeCoupangSellerDetailExtraction(tabId);
        }
      } catch (error) {
        console.warn(
          "[KIDITEM] 겹치는 상품 판매자 확인 실패:",
          error?.message || error,
        );
        detail = null;
      }
      detailsByProduct.set(detailKey, detail);
      processed += 1;
      if (typeof onProgress === "function") {
        await onProgress({ processed, targetCount: targetKeys.size });
      }
      if (processed < targetKeys.size) await sleep(randomDelayMs(900, 1500));
    }
    if (!detail?.sellerName || !detail?.sellerId || !detail?.sellerStoreUrl) {
      continue;
    }
    identities.push({
      keyword: target.keyword,
      productKey: target.productKey,
      productId: target.productId || null,
      vendorItemId: target.vendorItemId || null,
      link: target.link,
      sellerName: detail.sellerName,
      sellerId: detail.sellerId,
      sellerStoreUrl: detail.sellerStoreUrl,
      capturedAt: new Date().toISOString(),
    });
  }
  return identities;
}

function buildCoupangProductDetailKey(target) {
  const vendorItemId = String(target?.vendorItemId || "").trim();
  if (vendorItemId) return `vendor-item:${vendorItemId}`;
  const productId = String(target?.productId || "").trim();
  if (productId) return `product:${productId}`;
  return `link:${String(target?.link || "")}`;
}

function isCoupangProductDetailUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "www.coupang.com" &&
      /^\/vp\/products\/\d+/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function executeCoupangSellerDetailExtraction(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const sellerAnchor = anchors.find((anchor) => {
        try {
          const parsed = new URL(anchor.href);
          return (
            parsed.protocol === "https:" &&
            parsed.hostname === "shop.coupang.com" &&
            /^\/(?:vid\/)?[A-Za-z0-9_-]+/.test(parsed.pathname)
          );
        } catch {
          return false;
        }
      });
      if (!sellerAnchor) return null;
      return {
        href: sellerAnchor.href,
        text: sellerAnchor.textContent || "",
      };
    },
  });
  return (
    globalThis.KidItemCoupangSellerDetail?.extractCoupangSellerShopLink(
      result?.result,
    ) || null
  );
}

async function collectCoupangSellerCatalogs(tabId, targets, limit) {
  if (!tabId || limit <= 0) return [];
  const candidates = [];
  const queued = new Set();
  for (const target of targets) {
    const sellerId = String(target?.sellerId || "").trim();
    const sellerStoreUrl = String(target?.sellerStoreUrl || "").trim();
    if (
      !sellerId ||
      !isCoupangSellerStoreUrl(sellerStoreUrl) ||
      queued.has(sellerId)
    ) {
      continue;
    }
    queued.add(sellerId);
    candidates.push({
      sellerId,
      sellerName: target.sellerName || null,
      sellerStoreUrl,
      keyword: String(target.keyword || "").trim(),
      priorityScore: Number(target.priorityScore) || 0,
      overlapProductCount: Number(target.overlapProductCount) || 0,
    });
    if (candidates.length >= limit) break;
  }

  const catalogs = [];
  for (const candidate of candidates) {
    try {
      const loaded = await updateTabAndWait(tabId, candidate.sellerStoreUrl, {
        active: false,
      });
      if (!loaded) throw new Error("판매자샵 로딩 실패");
      const current = await getTab(tabId).catch(() => null);
      if (!isCoupangSellerStoreUrl(current?.url || "")) {
        throw new Error("판매자샵이 아닌 페이지로 이동했습니다");
      }
      await sleep(COUPANG_SELLER_CATALOG_RENDER_DELAY_MS);
      await selectNewestSellerCatalogSort(tabId);
      await sleep(COUPANG_SELLER_CATALOG_RENDER_DELAY_MS);
      const catalog = await executeCoupangSellerCatalogExtraction(tabId);
      if (catalog?.products?.length) {
        catalogs.push({
          ...candidate,
          sellerName: catalog.sellerName || candidate.sellerName,
          totalProductCount: catalog.totalProductCount,
          collectedProductCount: catalog.products.length,
          isTruncated:
            Number.isFinite(catalog.totalProductCount) &&
            catalog.totalProductCount > catalog.products.length,
          sort: "newest",
          capturedAt: new Date().toISOString(),
          products: catalog.products,
        });
      }
    } catch (error) {
      console.warn(
        `[KIDITEM] 판매자샵 최신 상품 수집 실패 (${candidate.sellerId}):`,
        error?.message || error,
      );
    }
    if (catalogs.length < candidates.length) {
      await sleep(randomDelayMs(700, 1300));
    }
  }
  return catalogs;
}

async function fetchCoupangCompetitorSellerTargets(limit) {
  const response = await authedFetch(
    `/api/ads/competitors/seller-targets?days=30&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(`겹치는 판매자 목록 조회 실패 (${response.status})`);
  }
  const json = await response.json().catch(() => null);
  return Array.isArray(json?.targets) ? json.targets : [];
}

async function fetchCoupangCompetitorProductTargets(limit) {
  const response = await authedFetch(
    `/api/ads/competitors/product-detail-targets?days=30&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(`겹치는 상품 목록 조회 실패 (${response.status})`);
  }
  const json = await response.json().catch(() => null);
  return Array.isArray(json?.targets) ? json.targets : [];
}

function isCoupangSellerStoreUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "shop.coupang.com" &&
      /^\/(?:vid\/)?[A-Za-z0-9_-]+/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function selectNewestSellerCatalogSort(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const target = Array.from(
        document.querySelectorAll("li.sortkey, [role=button], button"),
      ).find((element) => (element.textContent || "").trim() === "최신순");
      if (!target) return false;
      target.click();
      return true;
    },
  });
  return result?.result === true;
}

async function executeCoupangSellerCatalogExtraction(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (maxItems) => {
      const sleepInPage = (ms) =>
        new Promise((resolve) => globalThis.setTimeout(resolve, ms));
      const productAnchors = () =>
        Array.from(document.querySelectorAll('a[href*="/vp/products/"]'));

      let stableRounds = 0;
      let previousCount = -1;
      for (let round = 0; round < 45; round += 1) {
        const count = productAnchors().length;
        if (count >= maxItems) break;
        stableRounds = count === previousCount ? stableRounds + 1 : 0;
        if (stableRounds >= 3) break;
        previousCount = count;
        globalThis.scrollTo(0, document.documentElement.scrollHeight);
        await sleepInPage(650);
      }

      const digits = (value) => {
        const normalized = String(value || "").replace(/[^\d]/g, "");
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const totalMatch = (document.body?.innerText || "").match(
        /전체\s*\(([\d,]+)\)/,
      );
      const totalProductCount = totalMatch ? digits(totalMatch[1]) : null;
      const seen = new Set();
      const products = [];
      for (const anchor of productAnchors()) {
        if (products.length >= maxItems) break;
        let parsed;
        try {
          parsed = new URL(anchor.getAttribute("href") || "", location.origin);
        } catch {
          continue;
        }
        const productId =
          (parsed.pathname.match(/\/vp\/products\/(\d+)/) || [])[1] || null;
        const itemId = parsed.searchParams.get("itemId") || null;
        const vendorItemId = parsed.searchParams.get("vendorItemId") || null;
        const key = vendorItemId || itemId || productId;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const name = (anchor.querySelector(".name")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
        if (!name) continue;
        const priceKrw = digits(
          anchor.querySelector(".price-value")?.textContent || "",
        );
        const reviewCount = digits(
          anchor.querySelector(".rating-total-count")?.textContent || "",
        );
        const image = anchor.querySelector("img");
        const rawImageUrl = [
          image?.getAttribute("data-img-src"),
          image?.getAttribute("data-src"),
          image?.currentSrc,
          image?.getAttribute("src"),
        ].find(
          (value) =>
            typeof value === "string" &&
            value.trim() &&
            !value.trim().startsWith("data:"),
        );
        let imageUrl = null;
        if (rawImageUrl) {
          try {
            imageUrl = new URL(rawImageUrl, location.href).href;
          } catch {
            imageUrl = null;
          }
        }
        products.push({
          sourceRank: products.length + 1,
          productId,
          itemId,
          vendorItemId,
          name,
          priceKrw,
          reviewCount,
          imageUrl,
          link: `${parsed.origin}${parsed.pathname}${parsed.search}`,
        });
      }

      const sellerName =
        Array.from(document.querySelectorAll("h1,h2,h3,strong,span,div"))
          .map((element) => (element.textContent || "").trim())
          .find(
            (text) =>
              text &&
              text.length <= 120 &&
              (document.body?.innerText || "").includes(
                `${text}의 판매자샵입니다.`,
              ),
          ) || null;
      return { sellerName, totalProductCount, products };
    },
    args: [COUPANG_SELLER_CATALOG_MAX_ITEMS],
  });
  return result?.result || null;
}

async function getOrCreateCoupangRankSearchTab(url) {
  const existing = await queryTabs({ url: `${COUPANG_SEARCH_URL}*` });
  const activeTab =
    existing.find((tab) => tab?.id && tab.status === "complete") ||
    existing.find((tab) => tab?.id);
  if (activeTab?.id) {
    return updateTabAndWait(activeTab.id, url, { active: false }).catch(
      () => activeTab,
    );
  }

  const tab = await createTab({ url, active: false });
  if (!tab?.id) return tab;
  return waitForTabComplete(tab.id, {
    expectedUrl: url,
    timeoutMs: 60000,
  }).catch(() => tab);
}

async function executeCoupangSerpExtraction(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function digitsToNumber(text) {
        const digits = String(text || "").replace(/[^\d]/g, "");
        if (!digits) return null;
        const numeric = Number(digits);
        return Number.isFinite(numeric) ? numeric : null;
      }

      function detectAccessWall() {
        if (/login\.coupang\.com/i.test(location.hostname)) return "login";
        if (/captcha|securityCheck|verification/i.test(location.href))
          return "captcha";
        if (
          document.querySelector(
            'form[action*="captcha" i], #captcha, [class*="captcha" i], input[name*="captcha" i]',
          )
        ) {
          return "captcha";
        }
        const bodyText = (document.body?.innerText || "").slice(0, 4000);
        if (/보안\s*문자|자동\s*입력\s*방지/.test(bodyText)) return "captcha";
        if (/로그인이\s*필요/.test(bodyText)) return "login";
        return null;
      }

      // 레거시 li.search-product 와 신규 product-list 마크업을 모두 시도하고,
      // 전부 실패하면 결과 컨테이너 안의 상품 링크(a[href*="/vp/products/"])를 DOM 순서로 수집
      function findProductElements() {
        const knownSelectors = [
          "ul#productList > li.search-product",
          "ul.search-product-list > li.search-product",
          "li.search-product",
          '#product-list > li[class*="ProductUnit" i]',
          'ul[class*="ProductList" i] > li',
          'li[class*="ProductUnit" i]',
        ];
        for (const selector of knownSelectors) {
          const found = Array.prototype.slice
            .call(document.querySelectorAll(selector))
            .filter((el) => el.querySelector('a[href*="/vp/products/"]'));
          if (found.length > 0) return { elements: found, usedFallback: false };
        }

        const container =
          document.querySelector("#productList") ||
          document.querySelector("#product-list") ||
          document.querySelector('[class*="product-list" i]') ||
          document.querySelector("main") ||
          document.body;
        const seen = new Set();
        const elements = [];
        for (const anchor of container.querySelectorAll(
          'a[href*="/vp/products/"]',
        )) {
          const item = anchor.closest("li") || anchor;
          if (seen.has(item)) continue;
          seen.add(item);
          elements.push(item);
        }
        return { elements, usedFallback: true };
      }

      function parseProductLink(anchor) {
        if (!anchor)
          return {
            link: null,
            productId: null,
            itemId: null,
            vendorItemId: null,
          };
        const rawHref = anchor.getAttribute("href") || "";
        try {
          const parsed = new URL(rawHref, location.origin);
          const productId =
            (parsed.pathname.match(/\/vp\/products\/(\d+)/) || [])[1] || null;
          return {
            link: parsed.origin + parsed.pathname + parsed.search,
            productId,
            itemId: parsed.searchParams.get("itemId") || null,
            vendorItemId: parsed.searchParams.get("vendorItemId") || null,
          };
        } catch {
          return {
            link: rawHref || null,
            productId: null,
            itemId: null,
            vendorItemId: null,
          };
        }
      }

      // 광고 슬롯 감지 — 배지 클래스 / data 속성 / href 신호 / "광고"·"AD" 배지 텍스트를 조합.
      // 판단이 안 서면 isAd=false 쪽으로 기운다.
      function detectIsAd(element, anchor) {
        if (
          element.querySelector(
            '[class*="ad-badge" i], [class*="adBadge" i], [class*="AdMark" i], [class*="sponsored" i], .search-product__ad-badge',
          )
        ) {
          return true;
        }
        if (/search-product__ad|AdMark/i.test(element.className || ""))
          return true;
        if (
          element.querySelector(
            "[data-adsplatform], [data-ads-platform], [data-ad-marker]",
          )
        )
          return true;
        const href = anchor ? anchor.getAttribute("href") || "" : "";
        if (/sourceType=srp_product_ads|adsPlatform/i.test(href)) return true;
        for (const badge of element.querySelectorAll("span, em, div")) {
          const text = (badge.textContent || "").trim();
          if (text.length > 4) continue;
          if (text === "광고" || text === "AD") return true;
        }
        return false;
      }

      function extractName(element, anchor) {
        const nameEl =
          element.querySelector(".name") ||
          element.querySelector('[class*="productName" i]') ||
          element.querySelector('[class*="product-name" i]');
        let name = nameEl ? nameEl.textContent : "";
        if (!name) {
          const img = element.querySelector("img[alt]");
          if (img && img.getAttribute("alt")) name = img.getAttribute("alt");
        }
        if (!name && anchor) name = anchor.textContent;
        name = String(name || "")
          .replace(/\s+/g, " ")
          .trim();
        return name ? name.slice(0, 300) : null;
      }

      function extractPrice(element) {
        const priceEl =
          element.querySelector(".price-value") ||
          element.querySelector('[class*="priceValue" i]') ||
          element.querySelector('[class*="sale-price" i]') ||
          element.querySelector('strong[class*="price" i]') ||
          element.querySelector('[class*="price" i] strong');
        return priceEl ? digitsToNumber(priceEl.textContent) : null;
      }

      function extractReviewCount(element) {
        const countEl =
          element.querySelector(".rating-total-count") ||
          element.querySelector('[class*="ratingCount" i]') ||
          element.querySelector('[class*="rating-total" i]');
        return countEl ? digitsToNumber(countEl.textContent) : null;
      }

      function extractRatingScore(element) {
        const ratingEl =
          element.querySelector("em.rating") ||
          element.querySelector('[class*="ratingValue" i]') ||
          element.querySelector(".rating");
        if (!ratingEl) return null;
        const direct = Number.parseFloat((ratingEl.textContent || "").trim());
        if (Number.isFinite(direct) && direct > 0 && direct <= 5) return direct;
        const width = Number.parseFloat(ratingEl.style?.width || "");
        if (Number.isFinite(width) && width > 0 && width <= 100)
          return Math.round((width / 20) * 10) / 10;
        return null;
      }

      function extractImageUrl(element) {
        const image = element.querySelector("img");
        const rawImageUrl =
          image?.currentSrc ||
          image?.getAttribute("src") ||
          image?.getAttribute("data-img-src") ||
          image?.getAttribute("data-src") ||
          "";
        if (!rawImageUrl) return null;
        try {
          return new URL(rawImageUrl, location.href).href;
        } catch {
          return null;
        }
      }

      const wall = detectAccessWall();
      const { elements, usedFallback } = findProductElements();
      const items = [];
      for (const element of elements) {
        const anchor =
          element.matches && element.matches('a[href*="/vp/products/"]')
            ? element
            : element.querySelector('a[href*="/vp/products/"]');
        if (!anchor) continue;
        const linkInfo = parseProductLink(anchor);
        items.push({
          isAd: detectIsAd(element, anchor),
          productId: linkInfo.productId,
          itemId: linkInfo.itemId,
          vendorItemId: linkInfo.vendorItemId,
          name: extractName(element, anchor),
          priceKrw: extractPrice(element),
          reviewCount: extractReviewCount(element),
          ratingScore: extractRatingScore(element),
          imageUrl: extractImageUrl(element),
          link: linkInfo.link,
        });
      }

      return { items, usedFallback, wall };
    },
  });
  return result?.result || null;
}

async function postKeywordRankSync(capture) {
  const capturedAt = new Date().toISOString();
  const payload = {
    type: "keyword_rank",
    source: "coupang-search",
    timestamp: capturedAt,
    data: [
      {
        keyword: capture.keyword,
        capturedAt,
        pagesScanned: capture.pagesScanned,
        listSize: capture.items.length,
        items: capture.items,
      },
    ],
  };
  const response = await authedFetch(`/api/ads/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (json?.success) {
    chrome.storage.local.set({
      kiditem_last_sync_keyword_rank: { time: Date.now(), count: 1 },
    });
    notifyDashboard();
  }
  return (
    json || {
      success: false,
      error: `sync 응답 파싱 실패 (${response.status})`,
    }
  );
}

async function postCompetitorSellerCatalogSync(catalogs) {
  const capturedAt = new Date().toISOString();
  const response = await authedFetch(`/api/ads/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "competitor_seller_catalog",
      source: "coupang-seller-shop",
      timestamp: capturedAt,
      data: catalogs,
    }),
  });
  const json = await response.json().catch(() => null);
  if (json?.success) {
    chrome.storage.local.set({
      kiditem_last_sync_competitor_seller_catalog: {
        time: Date.now(),
        count: catalogs.length,
      },
    });
    notifyDashboard();
  }
  return (
    json || {
      success: false,
      error: `판매자 상품 sync 응답 파싱 실패 (${response.status})`,
    }
  );
}

async function postCompetitorSellerIdentitySync(identities) {
  const capturedAt = new Date().toISOString();
  const response = await authedFetch(`/api/ads/extension/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "competitor_seller_identity",
      source: "coupang-overlap-product-detail",
      timestamp: capturedAt,
      data: identities,
    }),
  });
  const json = await response.json().catch(() => null);
  if (json?.success) {
    chrome.storage.local.set({
      kiditem_last_sync_competitor_seller_identity: {
        time: Date.now(),
        count: identities.length,
      },
    });
  }
  return (
    json || {
      success: false,
      error: `판매자 확인 sync 응답 파싱 실패 (${response.status})`,
    }
  );
}

function buildCoupangRankSearchUrl(keyword, page) {
  return `${COUPANG_SEARCH_URL}?q=${encodeURIComponent(keyword)}&channel=user&page=${page}&listSize=36`;
}

function randomDelayMs(minMs, maxMs) {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

async function getOrCreateWingCatalogTab() {
  const existing = await queryTabs({ url: `${WING_CATALOG_FORM_URL}*` });
  const activeTab =
    existing.find((tab) => tab?.id && tab.status === "complete") ||
    existing.find((tab) => tab?.id);
  if (activeTab?.id) return activeTab;

  const wingTabs = await queryTabs({ url: "https://wing.coupang.com/*" });
  const reusable = wingTabs.find(
    (tab) =>
      tab?.id &&
      tab.url &&
      tab.url.includes("/tenants/seller-web/vendor-inventory/formV2"),
  );
  if (reusable?.id) return reusable;

  const syncWindow = await createWindow({
    url: WING_CATALOG_FORM_URL,
    focused: false,
    type: "normal",
  });
  return (
    getFirstWindowTab(syncWindow) || (await getFirstTabInWindow(syncWindow.id))
  );
}

async function executeWingCatalogSearch(tabId, payload) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (requestPayload, endpoint) => {
      try {
        // 타임아웃 없는 in-page fetch 는 Wing API stall 시 injection 이 영원히 안 끝나
        // executeScript 가 resolve 안 되고 배치가 그 키워드에서 멈춘다. 20s 로 제한.
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(20000),
        });
        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();
        let body = null;
        if (contentType.includes("application/json")) {
          try {
            body = JSON.parse(text);
          } catch {
            body = null;
          }
        }
        return {
          ok: res.ok,
          status: res.status,
          contentType,
          body,
          textPreview: body ? null : text.slice(0, 200),
        };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          contentType: "",
          body: null,
          error: error?.message || String(error),
        };
      }
    },
    args: [payload, WING_CATALOG_SEARCH_ENDPOINT],
  });
  return result?.result || null;
}

function normalizeWingCatalogProduct(product) {
  if (!product || typeof product !== "object") return null;
  const productId =
    product.productId == null ? null : String(product.productId);
  if (!productId) return null;
  const salePrice = toNullableNumber(product.salePrice);
  const salesLast28d = toNullableNumber(product.salesLast28d);
  const pvLast28Day = toNullableNumber(product.pvLast28Day);
  return {
    productId,
    itemId: product.itemId == null ? null : String(product.itemId),
    vendorItemId:
      product.vendorItemId == null ? null : String(product.vendorItemId),
    productName: String(product.productName || ""),
    itemName: product.itemName ? String(product.itemName) : null,
    brandName: product.brandName ? String(product.brandName) : null,
    manufacture: product.manufacture ? String(product.manufacture) : null,
    categoryHierarchy: Array.isArray(product.displayCategoryInfo)
      ? product.displayCategoryInfo[0]?.categoryHierarchy || null
      : null,
    imagePath: product.imagePath ? String(product.imagePath) : null,
    salePrice,
    rating: toNullableNumber(product.rating),
    ratingCount: toNullableNumber(product.ratingCount),
    pvLast28Day,
    salesLast28d,
    estimatedRevenue28d:
      salePrice != null && salesLast28d != null
        ? Math.round(salePrice * salesLast28d)
        : null,
    conversionRate28d:
      pvLast28Day != null && pvLast28Day > 0 && salesLast28d != null
        ? salesLast28d / pvLast28Day
        : null,
    deliveryInfo: product.deliveryInfo ? String(product.deliveryInfo) : null,
  };
}

function resolveWingCatalogTotal(body) {
  if (!body || typeof body !== "object") return null;
  const candidates = [
    body.total,
    body.totalCount,
    body.productTotalCount,
    body.totalProductCount,
    body.count,
    body.pagination?.total,
    body.pagination?.totalCount,
    body.pageInfo?.total,
    body.pageInfo?.totalCount,
  ];
  for (const candidate of candidates) {
    const numeric = toNullableNumber(candidate);
    if (numeric != null) return numeric;
  }
  return null;
}

function toNullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function isWingCatalogFormUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "wing.coupang.com" &&
      parsed.pathname.includes("/tenants/seller-web/vendor-inventory/formV2")
    );
  } catch {
    return false;
  }
}

async function registerWingThumbnail(message) {
  const productName =
    typeof message.productName === "string" ? message.productName.trim() : "";
  const image = message.image || {};
  if (!productName)
    return { success: false, error: "쿠팡 등록 상품명이 없습니다" };
  if (
    typeof image.dataUrl !== "string" ||
    !image.dataUrl.startsWith("data:image/")
  ) {
    return { success: false, error: "대표이미지 데이터가 없습니다" };
  }

  const tab = await createTab({
    url: buildWingProductSearchUrl(productName),
    active: true,
  });
  if (!tab?.id) return { success: false, error: "Wing 탭을 열 수 없습니다" };
  const tabId = tab.id;

  const loaded = await waitForTabComplete(tabId, { timeoutMs: 60000 }).catch(
    (error) => ({
      error: error?.message || "Wing 탭 로딩 실패",
    }),
  );
  if (loaded?.error) return { success: false, error: loaded.error, tabId };
  if (!isWingInventoryUrl(loaded?.url || "")) {
    activateTab(tabId);
    return {
      success: false,
      pendingLogin: true,
      opened: true,
      tabId,
      error:
        "쿠팡 Wing 로그인 필요 — 열린 Wing 탭에서 로그인 후 다시 실행하세요.",
    };
  }

  await sleep(1500);
  const openResult = await sendTabMessage(tabId, {
    action: "kiditemOpenWingProductEdit",
    productName,
  });
  if (!openResult?.success) {
    activateTab(tabId);
    return {
      success: false,
      opened: true,
      tabId,
      error: openResult?.error || "Wing 상품 수정 화면을 열 수 없습니다",
    };
  }

  await waitForTabComplete(tabId, {
    expectedUrl: openResult.editUrl || undefined,
    timeoutMs: 60000,
  }).catch(() => null);
  await sleep(2500);

  const uploadResult = await sendTabMessage(tabId, {
    action: "kiditemUploadWingThumbnail",
    productName,
    image,
  });
  if (!uploadResult?.success) {
    activateTab(tabId);
    return {
      success: false,
      opened: true,
      tabId,
      error: uploadResult?.error || "Wing 대표이미지 업로드 실패",
    };
  }

  activateTab(tabId);
  return {
    success: true,
    opened: true,
    tabId,
    screenshotUrl: uploadResult.screenshotUrl,
  };
}

function buildWingProductSearchUrl(productName) {
  return `https://wing.coupang.com/vendor-inventory/list?searchKeywordType=PRODUCT_NAME&searchKeywords=${encodeURIComponent(productName)}&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1`;
}

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

function openAndExecuteAdActions(url = AD_ACTION_URL) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        resolve({ success: false, error: "쿠팡 광고센터 탭 생성 실패" });
        return;
      }

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

function createWindow(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.windows.create(createProperties, (syncWindow) => {
      if (chrome.runtime.lastError || !syncWindow?.id) {
        reject(new Error(chrome.runtime.lastError?.message || "Wing 창 생성 실패"));
        return;
      }
      resolve(syncWindow);
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

function getFirstWindowTab(syncWindow) {
  const tabs = Array.isArray(syncWindow?.tabs) ? syncWindow.tabs : [];
  return tabs.find((tab) => tab?.id) || null;
}

async function getFirstTabInWindow(windowId) {
  const tabs = await queryTabs({ windowId });
  return tabs.find((tab) => tab?.id) || null;
}

async function updateTabAndWait(tabId, url, options = {}) {
  const before = await getTab(tabId).catch(() => null);
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

function activateTab(tabId) {
  try {
    chrome.tabs.update(tabId, { active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab?.windowId) return;
      chrome.windows.update(tab.windowId, { focused: true }, () => {});
    });
  } catch {
    /* noop */
  }
}

function waitForTabComplete(tabId, options = {}) {
  const timeoutMs = options.timeoutMs || 45000;
  return new Promise((resolve, reject) => {
    let done = false;
    let sawNavigation = false;
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
      reject(new Error("Wing 탭 로딩 타임아웃"));
    }, timeoutMs);
    const onRemoved = (removedTabId) => {
      if (removedTabId !== tabId || done) return;
      done = true;
      cleanup();
      reject(new Error("Wing 탭이 닫혔습니다"));
    };
    const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "loading") {
        sawNavigation = true;
        return;
      }
      if (
        changeInfo.status === "complete" &&
        isExpectedTab(updatedTab, { ...options, sawNavigation })
      ) {
        finish(updatedTab);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (isExpectedTab(tab, options)) finish(tab);
    });
  });
}

function isExpectedTab(tab, options = {}) {
  if (tab?.status !== "complete") return false;
  if (!options.expectedUrl) return true;
  const currentUrl = tab.url || "";
  if (matchesExpectedWingPage(currentUrl, options.expectedUrl)) return true;
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

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            chrome.runtime.lastError.message || "content script 미응답",
          ),
        );
        return;
      }
      resolve(response);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 등록된 URL 을 **순차적으로** 처리. 각 URL 에 대해:
 *  1) 탭 오픈 (active) → 2) 로드 대기 → 3) manualSync 전송 → 4) 결과 수신 → 5) 탭 닫기 → 6) 다음 URL
 *
 * 과거 병렬(3초 간격) 구현은 이전 탭이 백그라운드화되면서 Chrome throttle 로
 * 달력 setDateRange 타임아웃 → 첫 탭만 성공 버그가 있었다. 순차로 바꿔 이를 제거.
 */
async function handleScrapeTargets(
  urls,
  runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  startedAt = Date.now(),
) {
  if (!urls || urls.length === 0) {
    return { success: false, error: "수집 대상 URL이 없습니다" };
  }

  await chrome.storage.local.remove(BATCH_SCRAPE_CANCEL_KEY);

  const total = urls.length;
  console.log(`[KIDITEM] 순차 배치 스크랩 시작 — ${total}개 URL`);

  let completed = 0;
  let failed = 0;
  let cancelled = false;

  await chrome.storage.local.set({
    [BATCH_SCRAPE_STATUS_KEY]: {
      runId,
      total,
      completed,
      failed,
      current: 0,
      status: "running",
      startedAt,
    },
  });

  for (let i = 0; i < urls.length; i++) {
    if (await isBatchScrapeCancelled(runId)) {
      cancelled = true;
      break;
    }

    const item = urls[i];
    console.log(`[KIDITEM] 순차 스크랩 ${i + 1}/${total}: ${item.url}`);

    await chrome.storage.local.set({
      [BATCH_SCRAPE_STATUS_KEY]: {
        runId,
        total,
        completed,
        failed,
        current: i + 1,
        currentUrl: item.url,
        currentLabel: item.label,
        currentTabId: null,
        status: "running",
        startedAt,
      },
    });

    try {
      const result = await scrapeUrl(item.url, item.id || null, item.label, {
        onTabCreated: async (tabId) => {
          await chrome.storage.local.set({
            [BATCH_SCRAPE_STATUS_KEY]: {
              runId,
              total,
              completed,
              failed,
              current: i + 1,
              currentUrl: item.url,
              currentLabel: item.label,
              currentTabId: tabId,
              status: "running",
              startedAt,
            },
          });
        },
      });
      if (result?.cancelled || (await isBatchScrapeCancelled(runId))) {
        cancelled = true;
        break;
      }
      if (result?.success) completed++;
      else failed++;
    } catch (e) {
      if (await isBatchScrapeCancelled(runId)) {
        cancelled = true;
        break;
      }
      failed++;
      console.error(`[KIDITEM] 스크랩 실패 (${item.url}):`, e?.message || e);
    }
  }

  await chrome.storage.local.set({
    [BATCH_SCRAPE_STATUS_KEY]: {
      runId,
      total,
      completed,
      failed,
      current: cancelled ? completed + failed : total,
      currentTabId: null,
      status: cancelled ? "cancelled" : "done",
      startedAt,
      endedAt: Date.now(),
      cancelled,
    },
  });
  notifyDashboard();

  console.log(
    `[KIDITEM] 순차 배치 ${cancelled ? "중단" : "완료"}: ${completed}/${total} 성공, ${failed} 실패`,
  );
  return { success: !cancelled, completed, failed, total, cancelled };
}

async function isBatchScrapeCancelled(runId) {
  const data = await getStorage(BATCH_SCRAPE_CANCEL_KEY);
  const cancel = data[BATCH_SCRAPE_CANCEL_KEY];
  return !!cancel?.cancelled && (!cancel.runId || cancel.runId === runId);
}

async function cancelBatchScrape(runId = null) {
  await chrome.storage.local.set({
    [BATCH_SCRAPE_CANCEL_KEY]: {
      cancelled: true,
      runId,
      requestedAt: Date.now(),
    },
  });
  const data = await getStorage(BATCH_SCRAPE_STATUS_KEY);
  const status = data[BATCH_SCRAPE_STATUS_KEY] || {};
  if (runId && status.runId && status.runId !== runId) {
    return { success: true, cancelled: false, staleRunId: status.runId };
  }
  if (status.currentTabId) {
    await removeTab(status.currentTabId).catch(() => {});
  }
  await chrome.storage.local.set({
    [BATCH_SCRAPE_STATUS_KEY]: {
      ...status,
      runId: status.runId || runId,
      status: "cancelled",
      cancelled: true,
      endedAt: Date.now(),
    },
  });
  notifyDashboard();
  return { success: true, cancelled: true, runId: status.runId || runId };
}

/**
 * 단일 URL 스크래핑:
 * 1. 새 탭 열기
 * 2. 로딩 완료 대기
 * 3. content script에 manualSync 전송
 * 4. 응답 대기 후 탭 닫기
 */
/**
 * 3시간마다 자동 실행 — 서버에서 등록 URL 가져와서 순차 스크래핑
 */
async function autoScrape() {
  console.log("[KIDITEM] 자동 수집 시작");

  try {
    const res = await authedFetch(`/api/ads/scrape-targets`);
    const json = await res.json();
    const targets = json.targets || [];

    if (targets.length === 0) {
      console.log("[KIDITEM] 등록된 수집 URL 없음");
      chrome.storage.local.set({
        kiditem_auto_scrape: { time: Date.now(), count: 0, status: "empty" },
      });
      return;
    }

    const urls = targets.map((t) => ({ id: t.id, url: t.url, label: t.label }));
    const result = await handleScrapeTargets(urls);

    console.log(
      `[KIDITEM] 자동 수집 완료: ${result.completed}/${result.total} 성공`,
    );

    // 결과 저장
    chrome.storage.local.set({
      kiditem_auto_scrape: {
        time: Date.now(),
        completed: result.completed,
        failed: result.failed,
        total: result.total,
        status: "done",
      },
    });

    // 배지 표시 (수집 건수)
    if (result.completed > 0) {
      chrome.action.setBadgeText({ text: String(result.completed) });
      chrome.action.setBadgeBackgroundColor({ color: "#3182f6" });
      // 30초 후 배지 제거
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 30000);
    }
  } catch (e) {
    console.error("[KIDITEM] 자동 수집 실패:", e.message);
    chrome.storage.local.set({
      kiditem_auto_scrape: {
        time: Date.now(),
        count: 0,
        status: "error",
        error: e.message,
      },
    });
  }
}

/**
 * 월별 일별 동기화 — 하루씩 Wing 매출분석 페이지 열고 스크래핑
 */
async function doMonthlyScrape(year, month) {
  const today = new Date();
  const lastDay = new Date(year, month, 0).getDate();
  // 미래 날짜는 수집 불필요 (당월이면 오늘까지만)
  const endDay =
    year === today.getFullYear() && month === today.getMonth() + 1
      ? Math.min(today.getDate(), lastDay)
      : lastDay;

  const total = endDay;
  chrome.storage.local.set({
    kiditem_monthly_sync: {
      year,
      month,
      completed: 0,
      total,
      status: "running",
    },
  });

  let completed = 0;

  for (let day = 1; day <= endDay; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const url = `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${dateStr}&end_date=${dateStr}`;

    await scrapeUrl(url, null, `매출분석 ${dateStr}`);
    completed++;

    chrome.storage.local.set({
      kiditem_monthly_sync: {
        year,
        month,
        completed,
        total,
        status: "running",
      },
    });

    // 다음 날짜 로드 전 1초 대기
    if (day < endDay) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  chrome.storage.local.set({
    kiditem_monthly_sync: { year, month, completed, total, status: "done" },
  });
  notifyDashboard();
}

function scrapeUrl(url, targetId, label, options = {}) {
  return new Promise((resolve) => {
    // The #kiditemBatch marker is for fallback window.open flows where the
    // content script has to self-start. In service-worker driven scraping we
    // send manualSync ourselves; leaving the marker on creates two competing
    // orchestrators for the same tab.
    const openUrl = url.replace(/#kiditemBatch=1$/, "");

    // 탭 활성화 — 백그라운드 탭은 Chrome이 setTimeout을 throttle해서 setDateRange가 타임아웃 넘김
    chrome.tabs.create({ url: openUrl, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        resolve({ url, success: false, error: "탭 생성 실패" });
        return;
      }

      const tabId = tab.id;
      let resolved = false;
      if (typeof options.onTabCreated === "function") {
        Promise.resolve(options.onTabCreated(tabId)).catch(() => {});
      }

      const cleanup = () => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      };
      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        resolve(result);
      };

      // 타임아웃 180초 — 달력 UI 조작(~5s) + 테이블 리로드(~3.5s) + 페이지네이션(다수 페이지 × 2s)
      const timeout = setTimeout(() => {
        try {
          chrome.tabs.remove(tabId);
        } catch {}
        finish({ url, success: false, error: "타임아웃 (180초)" });
      }, 180000);

      const onRemoved = (removedTabId) => {
        if (removedTabId !== tabId) return;
        finish({
          url,
          label,
          success: false,
          cancelled: true,
          error: "수집이 중단되었습니다",
        });
      };

      // 탭 로딩 완료 감지
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;

        chrome.tabs.onUpdated.removeListener(onUpdated);

        // 페이지 로딩 후 content script가 초기화될 시간 대기 (4초)
        setTimeout(() => {
          chrome.tabs.sendMessage(
            tabId,
            { action: "manualSync" },
            (response) => {
              if (resolved) return;

              // 수집 완료 알림을 서버로 전송
              if (targetId) {
                authedFetch(`/api/ads/scrape-targets`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "markScraped", id: targetId }),
                }).catch(() => {});
              }

              // 탭 닫기 (3초 후 — 데이터 전송 완료 보장)
              setTimeout(() => {
                try {
                  chrome.tabs.remove(tabId);
                } catch {}
              }, 3000);

              if (chrome.runtime.lastError) {
                finish({
                  url,
                  label,
                  success: false,
                  error:
                    "content script 미응답 (페이지가 지원 대상이 아닐 수 있음)",
                });
                return;
              }

              finish({
                url,
                label,
                success: response?.success || false,
                type: response?.type || "unknown",
                count: response?.count || 0,
              });
            },
          );
        }, 4000);
      };

      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
    });
  });
}
