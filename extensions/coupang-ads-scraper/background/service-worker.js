// KIDITEM — Background Service Worker

const API_URL = "http://localhost:4000";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[KIDITEM] Extension installed");
  cleanupStorage();
});

// 24시간마다 storage 정리
chrome.alarms.create("storage-cleanup", { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "storage-cleanup") cleanupStorage();
});

function cleanupStorage() {
  chrome.storage.local.get(null, (all) => {
    const keysToRemove = [];
    const now = Date.now();
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7일

    for (const [key, val] of Object.entries(all)) {
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

// content script에서 메시지 수신
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "syncToServer") {
    fetch(`${API_URL}/api/ads/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const key = `kiditem_last_sync_${msg.payload.type}`;
          chrome.storage.local.set({ [key]: { time: Date.now(), count: msg.payload.data.length } });
        }
        sendResponse(json);
      })
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true; // async response
  }
});

// 대시보드(외부 웹페이지)에서 메시지 수신
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
function scrapeUrl(url, targetId, label) {
  return new Promise((resolve) => {
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

            // 탭 닫기 (3초 후)
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
