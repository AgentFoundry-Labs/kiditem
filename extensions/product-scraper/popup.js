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
    apiUrl: $("apiUrl"),
    btnSave: $("btnSave"),
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

      if (url.match(/alibaba\.com/)) {
        platform = "ALIBABA";
      } else if (url.match(/1688\.com/)) {
        platform = "1688";
      }

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
    dom.detectBadge.classList.add("detected");
    dom.detectIcon.textContent = "\u2713";
    dom.detectPlatform.textContent = PLATFORM_LABELS[platform] || platform;
    dom.detectPage.textContent = pageType ? PAGE_LABELS[pageType] || pageType : "";
    dom.btnCollect.disabled = false;
  }

  function showUnsupported() {
    dom.detectBadge.classList.add("unsupported");
    dom.detectIcon.textContent = "\u2014";
    dom.detectPlatform.textContent = "\uc9c0\uc6d0\ud558\uc9c0 \uc54a\ub294 \uc0ac\uc774\ud2b8";
    dom.detectPage.textContent = "Alibaba \ub610\ub294 1688 \ud398\uc774\uc9c0\uc5d0\uc11c \uc0ac\uc6a9\ud558\uc138\uc694";
    dom.btnCollect.disabled = true;
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
    dom.statusText.textContent = "\uc2e4\ud328";
    dom.lastError.textContent = text;
  }

  dom.btnCollect.addEventListener("click", () => {
    if (collecting || !currentTabId) return;

    collecting = true;
    dom.btnCollect.disabled = true;
    dom.btnCollect.textContent = "\uc218\uc9d1 \uc911...";
    showStatus("\ucd94\ucd9c \uc911...", false);

    const apiBase = dom.apiUrl.value.trim();

    chrome.runtime.sendMessage(
      { type: "COLLECT_CURRENT", tabId: currentTabId, apiBase },
      (resp) => {
        if (chrome.runtime.lastError || !resp) {
          showError(chrome.runtime.lastError?.message || "\uc751\ub2f5 \uc5c6\uc74c");
          resetButton();
          return;
        }

        if (resp.ok) {
          showStatus("\uc218\uc9d1 \uc644\ub8cc", false);
        } else {
          showError(resp.error || "\uc218\uc9d1 \uc2e4\ud328");
        }
        resetButton();
      }
    );
  });

  function resetButton() {
    collecting = false;
    dom.btnCollect.disabled = false;
    dom.btnCollect.textContent = "\uc218\uc9d1";
  }

  dom.btnSave.addEventListener("click", () => {
    const url = dom.apiUrl.value.trim();
    if (url) {
      chrome.storage.local.set({ apiBase: url });
      dom.btnSave.textContent = "\uc800\uc7a5\ub428";
      setTimeout(() => { dom.btnSave.textContent = "\uc800\uc7a5"; }, 1000);
    }
  });

  chrome.storage.local.get(["apiBase"], (result) => {
    if (result.apiBase) {
      dom.apiUrl.value = result.apiBase;
    }
  });

  detectSite();
})();
