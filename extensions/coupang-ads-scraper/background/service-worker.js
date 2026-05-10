// KIDITEM OS — Background Service Worker

const API_URL = "http://localhost:4000";
const AUTH_TOKEN_KEY = "kiditem_auth_token";
const AD_ACTION_URL = "https://advertising.coupang.com/dashboard?kiditemExecuteActions=1#kiditemExecuteActions=1";
const WING_IMAGE_SYNC_URL =
  "https://wing.coupang.com/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_REGISTRATION_DATE&countPerPage=50&page=1";
const WING_IMAGE_SYNC_MAX_PAGES = 50;
const WING_IMAGE_SYNC_TAB_KEY = "kiditem_image_sync_tab_id";
const WING_IMAGE_SYNC_WINDOW_KEY = "kiditem_image_sync_window_id";
const BATCH_SCRAPE_STATUS_KEY = "kiditem_batch_scrape";
const BATCH_SCRAPE_CANCEL_KEY = "kiditem_batch_scrape_cancel";
const IMAGE_SYNC_STATUS_KEY = "kiditem_image_sync_status";
const IMAGE_SYNC_CANCEL_KEY = "kiditem_image_sync_cancel";

function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTH_TOKEN_KEY], (r) => resolve(r[AUTH_TOKEN_KEY] || null));
  });
}

async function authedFetch(path, init = {}) {
  const token = await getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[KIDITEM] Extension installed");
  cleanupStorage();
  // 알람은 onInstalled에서만 등록 (서비스워커 재시작 시 유지됨)
  chrome.alarms.create("storage-cleanup", { periodInMinutes: 1440 });
  chrome.alarms.create("auto-scrape", { periodInMinutes: 180 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "storage-cleanup") cleanupStorage();
  if (alarm.name === "auto-scrape") autoScrape();
});

function cleanupStorage() {
  chrome.storage.local.get(null, (all) => {
    const keysToRemove = [];
    const now = Date.now();
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7일

    for (const [key, val] of Object.entries(all)) {
      // 싱크 기록 중 7일 지난 것 삭제
      if (key.startsWith("kiditem_last_sync_") && val?.time && now - val.time > MAX_AGE) {
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
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.dispatchEvent(new CustomEvent("kiditem-sync")),
      }).catch(() => {});
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
          sendResponse({ success: true, completed: result.completed || 0, total: result.total || 0 });
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
      kiditem_monthly_sync: { year, month, completed: 0, total: 0, status: "starting" }
    });
    doMonthlyScrape(year, month).catch((e) => {
      chrome.storage.local.set({
        kiditem_monthly_sync: { year, month, completed: 0, total: 0, status: "error", error: e.message }
      });
    });
    sendResponse({ success: true, message: `${year}-${String(month).padStart(2, "0")} 일별 수집 시작` });
    return; // sync response, no need for return true
  }

  // 배치 스크랩 진행률은 handleScrapeTargets 의 sequential 루프가 소유.
  // content script 의 auto-trigger 경로는 이 메시지를 보내지만, 카운트/상태는 오너(서비스워커)가 담당.
  // 여기서는 탭 자가 종료만 처리.
  if (msg.action === "reportBatchScrapeDone") {
    const tabId = sender?.tab?.id;
    if (tabId) {
      setTimeout(() => {
        try { chrome.tabs.remove(tabId); } catch {}
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
    const runId = typeof msg.runId === "string" ? msg.runId : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
        [BATCH_SCRAPE_STATUS_KEY]: { runId, status: "error", error: e.message, startedAt, endedAt: Date.now() },
      });
    });
    sendResponse({ success: true, started: true, total: urls.length, runId, startedAt });
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
      .catch((e) => sendResponse({ success: false, error: e?.message || "수집 중단 실패" }));
    return true;
  }

  if (msg.action === "ping") {
    sendResponse({ success: true, version: chrome.runtime.getManifest().version });
    return;
  }

  if (msg.action === "scrapeCoupangImageRows") {
    scrapeCoupangImageRows(typeof msg.runId === "string" ? msg.runId : null)
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ success: false, error: e?.message || "쿠팡 이미지 목록 수집 실패" }));
    return true;
  }

  if (msg.action === "getCoupangImageRowsStatus") {
    chrome.storage.local.get(IMAGE_SYNC_STATUS_KEY, (data) => {
      const status = data[IMAGE_SYNC_STATUS_KEY] || { status: "idle" };
      const runId = typeof msg.runId === "string" ? msg.runId : null;
      if (runId && status.runId && status.runId !== runId) {
        sendResponse({ status: "idle", runId, staleRunId: status.runId });
        return;
      }
      sendResponse(status);
    });
    return true;
  }

  if (msg.action === "cancelCoupangImageRows") {
    cancelCoupangImageRows(typeof msg.runId === "string" ? msg.runId : null)
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ success: false, error: e?.message || "이미지 수집 중단 실패" }));
    return true;
  }

  if (msg.action === "registerWingThumbnail") {
    registerWingThumbnail(msg)
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ success: false, error: e?.message || "쿠팡 Wing 대표이미지 등록 실패" }));
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
    chrome.storage.local.remove(AUTH_TOKEN_KEY, () => sendResponse({ success: true }));
    return true;
  }

  if (msg.action === "openAndExecuteAdActions") {
    openAndExecuteAdActions(msg.url || AD_ACTION_URL)
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ success: false, error: e?.message || "광고 액션 실행 탭 생성 실패" }));
    return true;
  }

  // ── 상품 수정 자동화: Wing 탭 열고 content script에 작업 위임 ──
  if (msg.action === "openAndEditProduct") {
    const { productName } = msg;
    const wingUrl = `https://wing.coupang.com/vendor-inventory/list?searchKeywordType=PRODUCT_NAME&searchKeywords=${encodeURIComponent(productName)}&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1`;

    // pending 작업 저장 (content script가 페이지 로드 시 읽어서 실행)
    chrome.storage.local.set({ kiditem_pending_edit: { productName, ts: Date.now() } }, () => {
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
          if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
          chrome.tabs.onUpdated.removeListener(onUpdated);

          // 페이지 초기화 대기 후 메시지 전송 (pending 방식으로 이미 처리되지만 직접 전송도 시도)
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: "searchAndEdit", productName }, (response) => {
              if (resolved) return;
              resolved = true;
              clearTimeout(timeout);
              sendResponse(response || { success: false, error: "content script 미응답" });
            });
          }, 3000);
        };

        chrome.tabs.onUpdated.addListener(onUpdated);
      });
    });
    return true; // async
  }
});

async function registerWingThumbnail(message) {
  const productName = typeof message.productName === "string" ? message.productName.trim() : "";
  const image = message.image || {};
  if (!productName) return { success: false, error: "쿠팡 등록 상품명이 없습니다" };
  if (typeof image.dataUrl !== "string" || !image.dataUrl.startsWith("data:image/")) {
    return { success: false, error: "대표이미지 데이터가 없습니다" };
  }

  const tab = await createTab({
    url: buildWingProductSearchUrl(productName),
    active: true,
  });
  if (!tab?.id) return { success: false, error: "Wing 탭을 열 수 없습니다" };
  const tabId = tab.id;

  const loaded = await waitForTabComplete(tabId, { timeoutMs: 60000 }).catch((error) => ({
    error: error?.message || "Wing 탭 로딩 실패",
  }));
  if (loaded?.error) return { success: false, error: loaded.error, tabId };
  if (!isWingInventoryUrl(loaded?.url || "")) {
    activateTab(tabId);
    return {
      success: false,
      pendingLogin: true,
      opened: true,
      tabId,
      error: "쿠팡 Wing 로그인 필요 — 열린 Wing 탭에서 로그인 후 다시 실행하세요.",
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
        if (!sent) resolve({ success: true, opened: true, tabId, pendingLogin: true });
      }, 180000);

      const sendRunMessage = () => {
        if (sent) return;
        sent = true;
        clearTimeout(timeout);
        cleanup();
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: "runApprovedQueuedAdActions" }, (response) => {
            if (chrome.runtime.lastError) {
              resolve({ success: true, opened: true, tabId, warning: chrome.runtime.lastError.message });
              return;
            }
            resolve({ success: true, opened: true, tabId, response });
          });
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

async function scrapeCoupangImageRows(runId = null) {
  const imageRunId = runId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const startedAt = Date.now();
  await chrome.storage.local.remove(IMAGE_SYNC_CANCEL_KEY);

  const tab = await getOrCreateWingInventoryTab();
  const tabId = tab?.id;
  if (!tabId) return { success: false, error: "Wing 탭을 열 수 없습니다" };

  await setImageSyncStatus({
    runId: imageRunId,
    status: "running",
    phase: "opening",
    currentPage: 0,
    totalPages: 1,
    rows: 0,
    tabId,
    startedAt,
  });

  const allRows = [];
  const seenPageSignatures = new Set();
  let totalPages = 1;

  try {
    for (let page = 1; page <= Math.min(totalPages, WING_IMAGE_SYNC_MAX_PAGES); page++) {
      if (await isImageSyncCancelled(imageRunId)) {
        return finishImageSyncCancelled(imageRunId, { tabId, rows: allRows.length, totalPages, currentPage: page - 1 });
      }

      const pageUrl = buildWingImageSyncPageUrl(page);
      await setImageSyncStatus({
        runId: imageRunId,
        status: "running",
        phase: "loading",
        currentPage: page,
        totalPages,
        rows: allRows.length,
        tabId,
        startedAt,
      });

      let loaded;
      try {
        loaded = await updateTabAndWait(tabId, pageUrl, { active: false });
      } catch (error) {
        if (await isImageSyncCancelled(imageRunId)) {
          return finishImageSyncCancelled(imageRunId, { tabId, rows: allRows.length, totalPages, currentPage: page });
        }
        throw error;
      }
      if (!isWingInventoryUrl(loaded.url)) {
        activateTab(tabId);
        await setImageSyncStatus({
          runId: imageRunId,
          status: "error",
          phase: "login",
          currentPage: page,
          totalPages,
          rows: allRows.length,
          tabId,
          startedAt,
          endedAt: Date.now(),
          error: "쿠팡 Wing 로그인 필요",
        });
        return {
          success: false,
          pendingLogin: true,
          opened: true,
          tabId,
          error: "쿠팡 Wing 로그인 필요 — 열린 Wing 이미지 동기화 창에서 로그인 후 다시 실행하세요.",
        };
      }

      if (await isImageSyncCancelled(imageRunId)) {
        return finishImageSyncCancelled(imageRunId, { tabId, rows: allRows.length, totalPages, currentPage: page });
      }

      await setImageSyncStatus({
        runId: imageRunId,
        status: "running",
        phase: "scraping",
        currentPage: page,
        totalPages,
        rows: allRows.length,
        tabId,
        startedAt,
      });

      await sleep(1500);
      let response;
      try {
        response = await sendTabMessage(tabId, { action: "scrapeInventoryImagePage" });
      } catch (error) {
        if (await isImageSyncCancelled(imageRunId)) {
          return finishImageSyncCancelled(imageRunId, { tabId, rows: allRows.length, totalPages, currentPage: page });
        }
        throw error;
      }
      if (!response?.success) {
        if (response?.pendingLogin) activateTab(tabId);
        await setImageSyncStatus({
          runId: imageRunId,
          status: "error",
          phase: "scraping",
          currentPage: page,
          totalPages,
          rows: allRows.length,
          tabId,
          startedAt,
          endedAt: Date.now(),
          error: response?.error || "Wing 상품목록 수집 실패",
        });
        return {
          success: false,
          pendingLogin: !!response?.pendingLogin,
          opened: true,
          tabId,
          error: response?.error || "Wing 상품목록 수집 실패",
        };
      }

      const rows = Array.isArray(response.rows) ? response.rows : [];
      if (rows.length === 0) break;
      const pageSignature = buildInventoryRowsSignature(rows);
      if (seenPageSignatures.has(pageSignature)) {
        console.warn(`[KIDITEM] Wing image sync duplicate page detected at page ${page}; stopping pagination`);
        break;
      }
      seenPageSignatures.add(pageSignature);
      allRows.push(...rows);
      const nextTotalPages = Number(response.totalPages || 1);
      totalPages = Math.max(1, Math.min(nextTotalPages, WING_IMAGE_SYNC_MAX_PAGES));

      await setImageSyncStatus({
        runId: imageRunId,
        status: "running",
        phase: "scraping",
        currentPage: page,
        totalPages,
        rows: allRows.length,
        tabId,
        startedAt,
      });
    }

    await setImageSyncStatus({
      runId: imageRunId,
      status: "done",
      phase: "finished",
      currentPage: Math.min(totalPages, WING_IMAGE_SYNC_MAX_PAGES),
      totalPages,
      rows: allRows.length,
      tabId,
      startedAt,
      endedAt: Date.now(),
    });

    return {
      success: true,
      opened: true,
      tabId,
      rows: allRows,
      total: allRows.length,
      runId: imageRunId,
    };
  } catch (error) {
    await setImageSyncStatus({
      runId: imageRunId,
      status: "error",
      phase: "finished",
      currentPage: 0,
      totalPages,
      rows: allRows.length,
      tabId,
      startedAt,
      endedAt: Date.now(),
      error: error?.message || String(error),
    });
    throw error;
  }
}

async function setImageSyncStatus(status) {
  await chrome.storage.local.set({ [IMAGE_SYNC_STATUS_KEY]: status });
}

async function isImageSyncCancelled(runId) {
  const data = await getStorage(IMAGE_SYNC_CANCEL_KEY);
  const cancel = data[IMAGE_SYNC_CANCEL_KEY];
  return !!cancel?.cancelled && (!cancel.runId || cancel.runId === runId);
}

async function finishImageSyncCancelled(runId, status = {}) {
  await setImageSyncStatus({
    ...status,
    runId,
    status: "cancelled",
    phase: "finished",
    endedAt: Date.now(),
    cancelled: true,
  });
  return {
    success: false,
    cancelled: true,
    error: "이미지 수집이 중단되었습니다",
    runId,
  };
}

async function cancelCoupangImageRows(runId = null) {
  await chrome.storage.local.set({
    [IMAGE_SYNC_CANCEL_KEY]: { cancelled: true, runId, requestedAt: Date.now() },
  });
  const data = await getStorage(IMAGE_SYNC_STATUS_KEY);
  const status = data[IMAGE_SYNC_STATUS_KEY] || {};
  if (runId && status.runId && status.runId !== runId) {
    return { success: true, cancelled: false, staleRunId: status.runId };
  }
  if (status.windowId) {
    await removeWindow(status.windowId).catch(() => {});
    await clearManagedImageSyncWindow();
  } else if (status.tabId) {
    await removeTab(status.tabId).catch(() => {});
    await clearManagedImageSyncWindow();
  }
  await setImageSyncStatus({
    ...status,
    runId: status.runId || runId,
    status: "cancelled",
    phase: "finished",
    cancelled: true,
    endedAt: Date.now(),
  });
  return { success: true, cancelled: true, runId: status.runId || runId };
}

function buildWingImageSyncPageUrl(page) {
  const url = new URL(WING_IMAGE_SYNC_URL);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function buildInventoryRowsSignature(rows) {
  return rows.map((row) => `${row?.inventoryId || ""}:${row?.url || ""}`).join("|");
}

function isWingInventoryUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "wing.coupang.com" && parsed.pathname.includes("vendor-inventory/list");
  } catch {
    return false;
  }
}

async function getOrCreateWingInventoryTab() {
  const managed = await getManagedImageSyncTab();
  if (managed?.id) return managed;

  const syncWindow = await createWindow({
    url: WING_IMAGE_SYNC_URL,
    focused: false,
    type: "normal",
  });
  const tab = getFirstWindowTab(syncWindow) || await getFirstTabInWindow(syncWindow.id);
  if (tab?.id && syncWindow?.id) {
    await chrome.storage.local.set({
      [WING_IMAGE_SYNC_TAB_KEY]: tab.id,
      [WING_IMAGE_SYNC_WINDOW_KEY]: syncWindow.id,
    });
  }
  return tab;
}

async function getManagedImageSyncTab() {
  const data = await getStorage([WING_IMAGE_SYNC_TAB_KEY, WING_IMAGE_SYNC_WINDOW_KEY]);
  const tabId = data[WING_IMAGE_SYNC_TAB_KEY];
  const windowId = data[WING_IMAGE_SYNC_WINDOW_KEY];

  if (!tabId || !windowId) {
    if (tabId || windowId) await clearManagedImageSyncWindow();
    return null;
  }

  const tab = await getTab(tabId).catch(() => null);
  if (!tab?.id || tab.windowId !== windowId) {
    await clearManagedImageSyncWindow();
    return null;
  }

  const syncWindow = await getWindow(windowId).catch(() => null);
  if (!syncWindow?.id) {
    await clearManagedImageSyncWindow();
    return null;
  }

  return tab;
}

function clearManagedImageSyncWindow() {
  return chrome.storage.local.remove([WING_IMAGE_SYNC_TAB_KEY, WING_IMAGE_SYNC_WINDOW_KEY]);
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

function getWindow(windowId) {
  return new Promise((resolve, reject) => {
    chrome.windows.get(windowId, (syncWindow) => {
      if (chrome.runtime.lastError || !syncWindow?.id) {
        reject(new Error(chrome.runtime.lastError?.message || "창 조회 실패"));
        return;
      }
      resolve(syncWindow);
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.remove(tabId, () => resolve({ success: !chrome.runtime.lastError }));
    } catch {
      resolve({ success: false });
    }
  });
}

function removeWindow(windowId) {
  return new Promise((resolve) => {
    try {
      chrome.windows.remove(windowId, () => resolve({ success: !chrome.runtime.lastError }));
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
        reject(new Error(chrome.runtime.lastError?.message || "Wing 이미지 동기화 창 생성 실패"));
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
      }).then(resolve).catch(reject);
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
      if (changeInfo.status === "complete" && isExpectedTab(updatedTab, { ...options, sawNavigation })) {
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
        reject(new Error(chrome.runtime.lastError.message || "content script 미응답"));
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
async function handleScrapeTargets(urls, runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt = Date.now()) {
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
      if (result?.cancelled || await isBatchScrapeCancelled(runId)) {
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

  console.log(`[KIDITEM] 순차 배치 ${cancelled ? "중단" : "완료"}: ${completed}/${total} 성공, ${failed} 실패`);
  return { success: !cancelled, completed, failed, total, cancelled };
}

async function isBatchScrapeCancelled(runId) {
  const data = await getStorage(BATCH_SCRAPE_CANCEL_KEY);
  const cancel = data[BATCH_SCRAPE_CANCEL_KEY];
  return !!cancel?.cancelled && (!cancel.runId || cancel.runId === runId);
}

async function cancelBatchScrape(runId = null) {
  await chrome.storage.local.set({
    [BATCH_SCRAPE_CANCEL_KEY]: { cancelled: true, runId, requestedAt: Date.now() },
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
      chrome.storage.local.set({ kiditem_auto_scrape: { time: Date.now(), count: 0, status: "empty" } });
      return;
    }

    const urls = targets.map(t => ({ id: t.id, url: t.url, label: t.label }));
    const result = await handleScrapeTargets(urls);

    console.log(`[KIDITEM] 자동 수집 완료: ${result.completed}/${result.total} 성공`);

    // 결과 저장
    chrome.storage.local.set({
      kiditem_auto_scrape: {
        time: Date.now(),
        completed: result.completed,
        failed: result.failed,
        total: result.total,
        status: "done",
      }
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
      kiditem_auto_scrape: { time: Date.now(), count: 0, status: "error", error: e.message }
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
    kiditem_monthly_sync: { year, month, completed: 0, total, status: "running" }
  });

  let completed = 0;

  for (let day = 1; day <= endDay; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const url = `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${dateStr}&end_date=${dateStr}`;

    await scrapeUrl(url, null, `매출분석 ${dateStr}`);
    completed++;

    chrome.storage.local.set({
      kiditem_monthly_sync: { year, month, completed, total, status: "running" }
    });

    // 다음 날짜 로드 전 1초 대기
    if (day < endDay) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  chrome.storage.local.set({
    kiditem_monthly_sync: { year, month, completed, total, status: "done" }
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
        try { chrome.tabs.remove(tabId); } catch {}
        finish({ url, success: false, error: "타임아웃 (180초)" });
      }, 180000);

      const onRemoved = (removedTabId) => {
        if (removedTabId !== tabId) return;
        finish({ url, label, success: false, cancelled: true, error: "수집이 중단되었습니다" });
      };

      // 탭 로딩 완료 감지
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;

        chrome.tabs.onUpdated.removeListener(onUpdated);

        // 페이지 로딩 후 content script가 초기화될 시간 대기 (4초)
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: "manualSync" }, (response) => {
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
              try { chrome.tabs.remove(tabId); } catch {}
            }, 3000);

            if (chrome.runtime.lastError) {
              finish({ url, label, success: false, error: "content script 미응답 (페이지가 지원 대상이 아닐 수 있음)" });
              return;
            }

            finish({
              url,
              label,
              success: response?.success || false,
              type: response?.type || "unknown",
              count: response?.count || 0,
            });
          });
        }, 4000);
      };

      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
    });
  });
}
