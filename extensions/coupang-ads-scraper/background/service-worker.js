// KIDITEM OS — Background Service Worker

const API_URL = "http://localhost:3000";

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

  if (msg.action === "syncToServer") {
    const payload = msg.payload || {};
    fetch(`${API_URL}/api/extension/sync`, {
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
    handleScrapeTargets(msg.urls || [])
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true; // async
  }

  if (msg.action === "ping") {
    sendResponse({ success: true, version: chrome.runtime.getManifest().version });
    return;
  }
});

/**
 * 등록된 URL들을 순차적으로 탭에서 열고 스크래핑
 * content script(ads-report.js, wing-unified.js)가 자동으로 데이터 수집
 */
async function handleScrapeTargets(urls) {
  if (!urls || urls.length === 0) {
    return { success: false, error: "수집 대상 URL이 없습니다" };
  }

  const results = [];
  let completed = 0;
  let failed = 0;

  for (const item of urls) {
    try {
      const result = await scrapeUrl(item.url, item.id, item.label);
      results.push(result);
      if (result.success) completed++;
      else failed++;
    } catch (e) {
      results.push({ url: item.url, success: false, error: e.message });
      failed++;
    }
  }

  return { success: true, completed, failed, total: urls.length, results };
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
    const res = await fetch(`${API_URL}/api/scrape-targets`);
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
              fetch(`${API_URL}/api/scrape-targets`, {
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
