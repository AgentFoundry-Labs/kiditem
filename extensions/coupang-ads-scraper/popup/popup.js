const API_URL = "http://localhost:4000";
const DASHBOARD_URL = "http://localhost:3000";

function timeAgo(ts) {
  if (!ts) return "-";
  const diff = Date.now() - ts;
  if (diff < 60000) return "방금 전";
  if (diff < 3600000) return Math.floor(diff / 60000) + "분 전";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "시간 전";
  return Math.floor(diff / 86400000) + "일 전";
}

async function init() {
  // 서버 연결 확인
  try {
    const res = await fetch(`${API_URL}/api/ads/extension/status`);
    const json = await res.json();
    document.getElementById("serverStatus").textContent = "localhost:4000";
    document.getElementById("connBadge").textContent = "연결됨";
    document.getElementById("connBadge").className = "badge";
  } catch {
    document.getElementById("serverStatus").textContent = "연결 안됨";
    document.getElementById("connBadge").textContent = "오프라인";
    document.getElementById("connBadge").className = "badge offline";
  }

  // 승인 대기 액션 수
  try {
    const actionsRes = await fetch(`${API_URL}/api/ads/actions?approvalStatus=approved&executeStatus=queued`);
    const actionsJson = await actionsRes.json();
    const queuedCount = actionsJson.summary?.approvedQueued ?? actionsJson.items?.length ?? 0;
    document.getElementById("pendingActions").textContent = queuedCount > 0 ? `${queuedCount}건` : "없음";
    document.getElementById("pendingActions").className = queuedCount > 0 ? "status-value" : "status-value none";
  } catch {
    document.getElementById("pendingActions").textContent = "-";
    document.getElementById("pendingActions").className = "status-value none";
  }

  // 마지막 동기화 시간
  chrome.storage.local.get(["kiditem_last_sync_itemwinner", "kiditem_last_sync_ads"], (data) => {
    const w = data.kiditem_last_sync_itemwinner;
    const a = data.kiditem_last_sync_ads;

    document.getElementById("winnerSync").textContent = w ? `${timeAgo(w.time)} (${w.count}개)` : "아직 없음";
    document.getElementById("winnerSync").className = w ? "status-value" : "status-value none";

    document.getElementById("adsSync").textContent = a ? `${timeAgo(a.time)} (${a.count}개)` : "아직 없음";
    document.getElementById("adsSync").className = a ? "status-value" : "status-value none";
  });
}

// 현재 페이지 동기화 버튼
document.getElementById("btnSync").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const resultEl = document.getElementById("syncResult");
  resultEl.textContent = "동기화 중...";
  resultEl.className = "sync-result success";

  chrome.tabs.sendMessage(tab.id, { action: "manualSync" }, (response) => {
    if (chrome.runtime.lastError) {
      resultEl.textContent = "이 페이지에서는 동기화할 수 없습니다. Wing 또는 광고센터를 열어주세요.";
      resultEl.className = "sync-result error";
      return;
    }
    if (response?.success) {
      resultEl.textContent = `${response.type} ${response.count}개 동기화 완료`;
      resultEl.className = "sync-result success";
      setTimeout(init, 1000);
    } else {
      resultEl.textContent = `${response?.error || "동기화 실패"}`;
      resultEl.className = "sync-result error";
    }
  });
});

// 승인된 액션 실행
document.getElementById("btnExecute").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const resultEl = document.getElementById("syncResult");
  resultEl.textContent = "lease 요청 중...";
  resultEl.className = "sync-result success";

  try {
    const leaseRes = await fetch(`${API_URL}/api/ads/execution/lease`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerKey: `ext-${chrome.runtime.id.substring(0, 8)}` }),
    });
    const leaseJson = await leaseRes.json();

    if (!leaseJson.tasks || leaseJson.tasks.length === 0) {
      resultEl.textContent = "실행할 승인 액션이 없습니다.";
      resultEl.className = "sync-result error";
      return;
    }

    resultEl.textContent = `${leaseJson.tasks.length}개 액션 실행 중...`;

    chrome.tabs.sendMessage(tab.id, {
      action: "executeApprovedAdActions",
      payload: { actions: leaseJson.tasks, apiUrl: `${API_URL}/api/ads/actions` },
    }, (response) => {
      if (chrome.runtime.lastError) {
        resultEl.textContent = "광고센터 페이지에서 실행해주세요.";
        resultEl.className = "sync-result error";
        return;
      }
      if (response?.success) {
        resultEl.textContent = `${response.executed}개 실행 완료, ${response.skipped}개 건너뜀`;
        resultEl.className = "sync-result success";
        setTimeout(init, 1000);
      } else {
        resultEl.textContent = response?.error || "실행 실패";
        resultEl.className = "sync-result error";
      }
    });
  } catch (e) {
    resultEl.textContent = `실행 실패: ${e.message}`;
    resultEl.className = "sync-result error";
  }
});

// 대시보드 열기
document.getElementById("btnOpen").addEventListener("click", () => {
  chrome.tabs.create({ url: DASHBOARD_URL });
});

// 대시보드에 익스텐션 ID 등록 (정보 수집 연동용)
document.getElementById("btnRegister").addEventListener("click", async () => {
  const extId = chrome.runtime.id;
  const resultEl = document.getElementById("syncResult");

  try {
    const tabs = await chrome.tabs.query({ url: `${DASHBOARD_URL}/*` });

    if (tabs.length === 0) {
      const newTab = await chrome.tabs.create({ url: DASHBOARD_URL });
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === newTab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          chrome.scripting.executeScript({
            target: { tabId: newTab.id },
            func: (id) => { localStorage.setItem("kiditem-ext-id", id); },
            args: [extId],
          });
        }
      });
      resultEl.textContent = `익스텐션 ID 등록됨: ${extId.substring(0, 12)}...`;
      resultEl.className = "sync-result success";
    } else {
      for (const tab of tabs) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (id) => { localStorage.setItem("kiditem-ext-id", id); },
          args: [extId],
        });
      }
      resultEl.textContent = `익스텐션 ID 등록됨: ${extId.substring(0, 12)}...`;
      resultEl.className = "sync-result success";
    }
  } catch (e) {
    resultEl.textContent = `등록 실패: ${e.message}`;
    resultEl.className = "sync-result error";
  }
});

init();
