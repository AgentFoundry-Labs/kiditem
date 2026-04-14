const API_URL = "http://localhost:4000";

function timeAgo(ts) {
  if (!ts) return "-";
  const diff = Date.now() - ts;
  if (diff < 60000) return "방금 전";
  if (diff < 3600000) return Math.floor(diff / 60000) + "분 전";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "시간 전";
  return Math.floor(diff / 86400000) + "일 전";
}

function setCardValue(id, text, hasDot, dotColor) {
  const el = document.getElementById(id);
  if (!el) return;
  const dot = hasDot ? `<span class="dot ${dotColor}"></span>` : "";
  el.innerHTML = dot + text;
  el.className = text === "-" || text === "아직 없음" ? "value none" : "value";
}

async function init() {
  // 서버 연결 확인
  try {
    await fetch(`${API_URL}/api/ads/extension/sync`);
    setCardValue("serverStatus", "연결됨 ✅", false);
    document.getElementById("connBadge").textContent = "연결됨";
    document.getElementById("connBadge").className = "badge";
  } catch {
    setCardValue("serverStatus", "연결 안됨 ❌", false);
    document.getElementById("connBadge").textContent = "오프라인";
    document.getElementById("connBadge").className = "badge offline";
  }

  // 마지막 동기화 시간
  chrome.storage.local.get(["kiditem_last_sync_traffic", "kiditem_last_sync_itemwinner", "kiditem_last_sync_ads"], (data) => {
    const t = data.kiditem_last_sync_traffic;
    const w = data.kiditem_last_sync_itemwinner;
    const a = data.kiditem_last_sync_ads;

    if (t) {
      setCardValue("trafficSync", `${timeAgo(t.time)} (${t.count}개)`, true, "dot-green");
    } else {
      setCardValue("trafficSync", "아직 없음", true, "dot-gray");
    }

    if (w) {
      setCardValue("winnerSync", `${timeAgo(w.time)} (${w.count}개)`, true, "dot-green");
    } else {
      setCardValue("winnerSync", "아직 없음", true, "dot-gray");
    }

    if (a) {
      setCardValue("adsSync", `${timeAgo(a.time)} (${a.count}개)`, true, "dot-green");
    } else {
      setCardValue("adsSync", "아직 없음", true, "dot-gray");
    }
  });

  try {
    const res = await fetch(`${API_URL}/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=50`);
    const json = await res.json();
    const count = Array.isArray(json.items) ? json.items.length : 0;
    if (count > 0) {
      setCardValue("approvedActions", `${count}개 대기`, true, "dot-orange");
    } else {
      setCardValue("approvedActions", "없음", true, "dot-gray");
    }
  } catch {
    setCardValue("approvedActions", "조회 실패", true, "dot-gray");
  }
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
      resultEl.textContent = `✅ ${response.type} ${response.count}개 동기화 완료`;
      resultEl.className = "sync-result success";
      setTimeout(init, 1000);
    } else {
      resultEl.textContent = `❌ ${response?.error || "동기화 실패"}`;
      resultEl.className = "sync-result error";
    }
  });
});

document.getElementById("btnRunApproved").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const resultEl = document.getElementById("syncResult");
  resultEl.textContent = "승인 액션 조회 중...";
  resultEl.className = "sync-result success";

  try {
    const res = await fetch(`${API_URL}/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=20`);
    const json = await res.json();
    const actions = Array.isArray(json.items) ? json.items : [];

    if (actions.length === 0) {
      resultEl.textContent = "실행할 승인 액션이 없습니다.";
      resultEl.className = "sync-result error";
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { action: "executeApprovedAdActions", payload: { actions, apiUrl: `${API_URL}/api/ads/actions` } },
      (response) => {
        if (chrome.runtime.lastError) {
          resultEl.textContent = "광고센터 탭에서 실행해주세요.";
          resultEl.className = "sync-result error";
          return;
        }

        if (response?.success) {
          resultEl.textContent = `✅ ${response.executed || 0}개 실행, ${response.skipped || 0}개 보류`;
          resultEl.className = "sync-result success";
          setTimeout(init, 500);
        } else {
          resultEl.textContent = `❌ ${response?.error || "실행 실패"}`;
          resultEl.className = "sync-result error";
        }
      }
    );
  } catch (e) {
    resultEl.textContent = `❌ ${e?.message || "실행 실패"}`;
    resultEl.className = "sync-result error";
  }
});

// 월별 일별 동기화
(function () {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  document.getElementById("monthInput").value = defaultMonth;
})();

document.getElementById("btnMonthlySync").addEventListener("click", () => {
  const monthVal = document.getElementById("monthInput").value; // "2026-04"
  if (!monthVal) return;

  const [year, month] = monthVal.split("-").map(Number);
  const progressEl = document.getElementById("monthlySyncProgress");
  progressEl.style.display = "block";
  progressEl.className = "sync-progress";
  progressEl.textContent = "수집 준비 중...";

  let pollInterval = null;

  chrome.runtime.sendMessage({ action: "monthlyScrape", year, month }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      progressEl.className = "sync-progress error";
      progressEl.textContent = "❌ " + (chrome.runtime.lastError?.message || response?.error || "실패");
      return;
    }

    // 진행상황 polling
    pollInterval = setInterval(() => {
      chrome.storage.local.get(["kiditem_monthly_sync"], (data) => {
        const s = data.kiditem_monthly_sync;
        if (!s || s.year !== year || s.month !== month) return;

        if (s.status === "running") {
          progressEl.className = "sync-progress";
          progressEl.textContent = `📊 ${s.completed} / ${s.total}일 수집 중...`;
        } else if (s.status === "done") {
          progressEl.className = "sync-progress done";
          progressEl.textContent = `✅ ${s.completed}일 동기화 완료 (${year}-${String(month).padStart(2, "0")})`;
          clearInterval(pollInterval);
          setTimeout(init, 1000);
        } else if (s.status === "error") {
          progressEl.className = "sync-progress error";
          progressEl.textContent = `❌ 오류: ${s.error || "알 수 없는 오류"}`;
          clearInterval(pollInterval);
        }
      });
    }, 1000);
  });
});

// 대시보드 열기
document.getElementById("btnOpen").addEventListener("click", () => {
  chrome.tabs.create({ url: API_URL });
});

// 대시보드에 익스텐션 ID 등록
document.getElementById("btnRegister").addEventListener("click", async () => {
  const extId = chrome.runtime.id;
  const resultEl = document.getElementById("syncResult");

  try {
    const tabs = await chrome.tabs.query({ url: `${API_URL}/*` });

    if (tabs.length === 0) {
      const newTab = await chrome.tabs.create({ url: API_URL });
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
      resultEl.textContent = `✅ 익스텐션 ID 등록됨: ${extId.substring(0, 12)}...`;
      resultEl.className = "sync-result success";
    } else {
      for (const tab of tabs) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (id) => { localStorage.setItem("kiditem-ext-id", id); },
          args: [extId],
        });
      }
      resultEl.textContent = `✅ 익스텐션 ID 등록됨: ${extId.substring(0, 12)}...`;
      resultEl.className = "sync-result success";
    }
  } catch (e) {
    resultEl.textContent = `❌ 등록 실패: ${e.message}`;
    resultEl.className = "sync-result error";
  }
});

// Footer link
document.getElementById("footerLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: API_URL });
});

init();
