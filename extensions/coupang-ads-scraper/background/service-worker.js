// KIDITEM OS — Background Service Worker

const API_URL = "http://localhost:4000";

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
  chrome.tabs.query({ url: "http://localhost:4000/*" }, (tabs) => {
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

  if (msg.action === "syncToServer") {
    const payload = msg.payload || {};
    fetch(`${API_URL}/api/ads/extension/sync`, {
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

  // 배치 스크랩 진행률은 handleScrapeTargets 의 sequential 루프가 소유.
  // content script (#kiditemBatch=1) 에서 sync 완료 후 보내는 신호 — 탭 자가 종료만 처리.
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

  // 배치 진행률 조회 — 팝업/대시보드가 polling 으로 읽어가는 상태
  if (msg.action === "getBatchScrapeStatus") {
    chrome.storage.local.get("kiditem_batch_scrape", (data) => {
      sendResponse(data.kiditem_batch_scrape || { status: "idle" });
    });
    return true;
  }
});

// ═══ 대시보드(외부 웹페이지)에서 메시지 수신 ═══
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action === "scrapeTargets") {
    // MV3 service worker 가 긴 async chain 중 idle 종료되면 port 가 닫혀 loop 중단됨.
    // 즉시 응답 + fire-and-forget. 진행률은 chrome.storage.local.kiditem_batch_scrape 에 기록.
    const urls = msg.urls || [];
    const runId = typeof msg.runId === "string"
      ? msg.runId
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();
    chrome.storage.local.set({
      kiditem_batch_scrape: {
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
        kiditem_batch_scrape: { runId, status: "error", error: e.message, startedAt, endedAt: Date.now() },
      });
    });
    sendResponse({ success: true, started: true, total: urls.length, runId, startedAt });
    return false;
  }

  if (msg.action === "getBatchScrapeStatus") {
    chrome.storage.local.get("kiditem_batch_scrape", (data) => {
      sendResponse(data.kiditem_batch_scrape || { status: "idle" });
    });
    return true;
  }

  if (msg.action === "ping") {
    sendResponse({ success: true, version: chrome.runtime.getManifest().version });
    return;
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

/**
 * 등록된 URL들을 순차적으로 탭에서 열고 스크래핑.
 * content script(ads-report.js, wing-unified.js)가 자동으로 데이터 수집.
 * MV3 service worker idle 종료 대비: 진행률은 chrome.storage.local.kiditem_batch_scrape 에 기록.
 */
async function handleScrapeTargets(urls, runId, startedAt) {
  if (!urls || urls.length === 0) {
    if (runId) {
      chrome.storage.local.set({
        kiditem_batch_scrape: {
          runId,
          status: "error",
          error: "수집 대상 URL이 없습니다",
          startedAt: startedAt || Date.now(),
          endedAt: Date.now(),
        },
      });
    }
    return { success: false, error: "수집 대상 URL이 없습니다" };
  }

  const results = [];
  let completed = 0;
  let failed = 0;
  const total = urls.length;
  const start = startedAt || Date.now();

  if (runId) {
    chrome.storage.local.set({
      kiditem_batch_scrape: {
        runId,
        total,
        completed,
        failed,
        current: 0,
        status: "running",
        startedAt: start,
      },
    });
  }

  for (let i = 0; i < urls.length; i++) {
    const item = urls[i];
    try {
      const result = await scrapeUrl(item.url, item.id, item.label);
      results.push(result);
      if (result.success) completed++;
      else failed++;
    } catch (e) {
      results.push({ url: item.url, success: false, error: e.message });
      failed++;
    }
    if (runId) {
      chrome.storage.local.set({
        kiditem_batch_scrape: {
          runId,
          total,
          completed,
          failed,
          current: i + 1,
          status: i + 1 < total ? "running" : "done",
          startedAt: start,
          ...(i + 1 === total ? { endedAt: Date.now() } : {}),
        },
      });
    }
  }

  return { success: true, completed, failed, total, results };
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
    const res = await fetch(`${API_URL}/api/ads/scrape-targets`);
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

function scrapeUrl(url, targetId, label) {
  return new Promise((resolve) => {
    // 탭 생성
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        resolve({ url, success: false, error: "탭 생성 실패" });
        return;
      }

      const tabId = tab.id;
      let resolved = false;

      // 타임아웃 (30초)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { chrome.tabs.remove(tabId); } catch {}
          resolve({ url, success: false, error: "타임아웃 (30초)" });
        }
      }, 30000);

      // 탭 로딩 완료 감지
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;

        chrome.tabs.onUpdated.removeListener(onUpdated);

        // 페이지 로딩 후 content script가 초기화될 시간 대기 (4초)
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: "manualSync" }, (response) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);

            // 수집 완료 알림을 서버로 전송
            if (targetId) {
              fetch(`${API_URL}/api/ads/scrape-targets`, {
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
              resolve({ url, label, success: false, error: "content script 미응답 (페이지가 지원 대상이 아닐 수 있음)" });
              return;
            }

            resolve({
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
    });
  });
}
