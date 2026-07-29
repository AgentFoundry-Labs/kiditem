(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const dom = {
    detectBadge: $("detectBadge"),
    detectIcon: $("detectIcon"),
    detectPlatform: $("detectPlatform"),
    detectPage: $("detectPage"),
    btnCollect: $("btnCollect"),
    statusSection: $("statusSection"),
    dot: $("dot"),
    statusText: $("statusText"),
    lastError: $("lastError"),
    environmentSelect: $("environmentSelect"),
    environmentHelp: $("environmentHelp"),
  };

  const PLATFORM_LABELS = {
    ALIBABA: "Alibaba",
    ALIBABA_1688: "1688",
  };
  const PAGE_LABELS = {
    detail: "상품 페이지",
    search: "검색 결과",
  };

  let currentTabId = null;
  let collecting = false;
  let siteSupported = false;
  let connected = [];

  function selectedEnvironmentId() {
    if (connected.length === 1) return connected[0];
    const chosen = dom.environmentSelect.value;
    return connected.includes(chosen) ? chosen : null;
  }

  function updateCollectAvailability() {
    dom.btnCollect.disabled =
      collecting || !siteSupported || !selectedEnvironmentId();
  }

  function loadConnectedEnvironments() {
    chrome.runtime.sendMessage(
      { action: "getConnectedKidItemEnvironments" },
      (response) => {
        connected = Array.isArray(response?.environments)
          ? response.environments.map((item) => item.environmentId)
          : [];
        dom.environmentSelect.replaceChildren();
        if (connected.length === 0) {
          dom.environmentSelect.append(new Option("로그인된 환경 없음", ""));
          dom.environmentSelect.disabled = true;
          dom.environmentHelp.textContent =
            "로컬, 사무실 또는 스테이징 KidItem에 로그인해주세요.";
        } else {
          dom.environmentSelect.append(new Option("환경 선택", ""));
          for (const environmentId of connected) {
            const label = environmentId === "local"
              ? "로컬"
              : environmentId === "office"
                ? "사무실"
                : "스테이징";
            dom.environmentSelect.append(new Option(label, environmentId));
          }
          dom.environmentSelect.disabled = connected.length === 1;
          if (connected.length === 1) {
            dom.environmentSelect.value = connected[0];
          }
          dom.environmentHelp.textContent = connected.length === 1
            ? "연결된 환경을 사용합니다."
            : "이번 수집을 보낼 환경을 선택하세요.";
        }
        updateCollectAvailability();
      },
    );
  }

  function detectSite() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        showUnsupported();
        return;
      }
      currentTabId = tabs[0].id;
      const url = tabs[0].url || "";
      let platform = null;
      let pageType = null;
      if (url.match(/alibaba\.com/)) platform = "ALIBABA";
      else if (url.match(/1688\.com/)) platform = "1688";
      if (!platform) {
        showUnsupported();
        return;
      }
      if (url.match(/\/offer\/|\/product\/|productdetail|item\.htm/)) {
        pageType = "detail";
      } else if (url.match(/search|SearchText|keywords/)) {
        pageType = "search";
      }
      showDetected(platform, pageType);
    });
  }

  function showDetected(platform, pageType) {
    siteSupported = true;
    dom.detectBadge.classList.add("detected");
    dom.detectIcon.textContent = "✓";
    dom.detectPlatform.textContent = PLATFORM_LABELS[platform] || platform;
    dom.detectPage.textContent = pageType ? PAGE_LABELS[pageType] || pageType : "";
    updateCollectAvailability();
  }

  function showUnsupported() {
    siteSupported = false;
    dom.detectBadge.classList.add("unsupported");
    dom.detectIcon.textContent = "—";
    dom.detectPlatform.textContent = "지원하지 않는 사이트";
    dom.detectPage.textContent = "Alibaba 또는 1688 페이지에서 사용하세요";
    updateCollectAvailability();
  }

  function showStatus(text, isError) {
    dom.statusSection.style.display = "";
    dom.dot.classList.toggle("active", !isError);
    dom.dot.classList.toggle("error", isError);
    dom.statusText.textContent = text;
    dom.lastError.textContent = "";
  }

  function showError(text) {
    dom.statusSection.style.display = "";
    dom.dot.classList.remove("active");
    dom.dot.classList.add("error");
    dom.statusText.textContent = "실패";
    dom.lastError.textContent = text;
  }

  dom.btnCollect.addEventListener("click", () => {
    if (collecting || !currentTabId) return;
    const environmentId = selectedEnvironmentId();
    if (!environmentId) {
      showError("수집할 KidItem 환경을 선택해주세요.");
      return;
    }
    collecting = true;
    updateCollectAvailability();
    dom.btnCollect.textContent = "수집 중...";
    showStatus("추출 중...", false);
    chrome.runtime.sendMessage(
      { type: "COLLECT_CURRENT", tabId: currentTabId, environmentId },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          showError(chrome.runtime.lastError?.message || "응답 없음");
        } else if (response.ok) {
          showStatus("수집 완료", false);
        } else {
          showError(response.error || "수집 실패");
        }
        collecting = false;
        dom.btnCollect.textContent = "수집";
        updateCollectAvailability();
      },
    );
  });

  dom.environmentSelect.addEventListener("change", updateCollectAvailability);
  loadConnectedEnvironments();
  detectSite();
})();
