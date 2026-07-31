// 소싱(Alibaba/1688) 수동 수집 섹션.
//
// 병합 전에는 product-scraper 확장의 별도 팝업(popup.html)이 담당했다. MV3 는
// 툴바 클릭에 팝업과 사이드패널을 동시에 걸 수 없으므로, 그 UI를 KIDITEM OS
// 사이드패널의 한 섹션으로 옮겼다. 환경 선택은 패널이 이미 갖고 있는
// `environmentSelect` 를 그대로 쓴다(도메인마다 따로 고르게 하지 않는다).
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const dom = {
    detectBadge: $("sourcingDetectBadge"),
    detectIcon: $("sourcingDetectIcon"),
    detectPlatform: $("sourcingDetectPlatform"),
    detectPage: $("sourcingDetectPage"),
    btnCollect: $("sourcingBtnCollect"),
    statusSection: $("sourcingStatusSection"),
    dot: $("sourcingDot"),
    statusText: $("sourcingStatusText"),
    lastError: $("sourcingLastError"),
    environmentSelect: $("environmentSelect"),
  };
  if (!dom.btnCollect || !dom.environmentSelect) return;

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

  // 패널의 환경 셀렉트는 popup.js 가 채운다. 선택지가 하나뿐이면 그 값이,
  // 여러 개면 사용자가 고른 값이 들어 있다.
  function selectedEnvironmentId() {
    const chosen = dom.environmentSelect.value;
    return chosen || null;
  }

  function updateCollectAvailability() {
    dom.btnCollect.disabled =
      collecting || !siteSupported || !selectedEnvironmentId();
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
      else if (url.match(/1688\.com/)) platform = "ALIBABA_1688";
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
    dom.detectBadge.classList.remove("unsupported");
    dom.detectBadge.classList.add("detected");
    dom.detectIcon.textContent = "✓";
    dom.detectPlatform.textContent = PLATFORM_LABELS[platform] || platform;
    dom.detectPage.textContent = pageType
      ? PAGE_LABELS[pageType] || pageType
      : "";
    updateCollectAvailability();
  }

  function showUnsupported() {
    siteSupported = false;
    dom.detectBadge.classList.remove("detected");
    dom.detectBadge.classList.add("unsupported");
    dom.detectIcon.textContent = "—";
    dom.detectPlatform.textContent = "지원하지 않는 사이트";
    dom.detectPage.textContent = "Alibaba 또는 1688 페이지에서 사용하세요";
    updateCollectAvailability();
  }

  function showStatus(text) {
    dom.statusSection.classList.remove("error");
    dom.statusSection.classList.add("success");
    dom.dot.classList.remove("dot-gray");
    dom.dot.classList.add("dot-green");
    dom.statusText.textContent = text;
    dom.lastError.textContent = "";
  }

  function showError(text) {
    dom.statusSection.classList.remove("success");
    dom.statusSection.classList.add("error");
    dom.dot.classList.remove("dot-green");
    dom.dot.classList.add("dot-gray");
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
    showStatus("추출 중...");
    chrome.runtime.sendMessage(
      { type: "COLLECT_CURRENT", tabId: currentTabId, environmentId },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          showError(chrome.runtime.lastError?.message || "응답 없음");
        } else if (response.ok) {
          showStatus("수집 완료");
        } else {
          showError(response.error || "수집 실패");
        }
        collecting = false;
        dom.btnCollect.textContent = "현재 상품 수집";
        updateCollectAvailability();
      },
    );
  });

  dom.environmentSelect.addEventListener("change", updateCollectAvailability);
  detectSite();
})();
