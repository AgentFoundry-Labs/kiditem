(() => {
  "use strict";

  const EXTRACT_DELAY_MS = 2000;
  const SCROLL_STEP_MS = 300;
  const SCROLL_SETTLE_MS = 1500;

  const EXTRACTORS = {
    ALIBABA: ProductScraper.alibaba,
    "1688": ProductScraper.alibaba1688,
  };

  let __pageDetailData = null;
  let __extracted = false;

  function alive() {
    try { return !!chrome.runtime?.id; } catch (e) { return false; }
  }

  window.addEventListener("message", (e) => {
    // Origin check: 브리지 스크립트는 같은 window 에서 주입되므로 e.source===window + 동일 origin 만 신뢰.
    // 교차 origin 프레임이나 외부 창에서 오는 postMessage 는 스푸핑으로 간주하고 무시.
    if (e.source !== window) return;
    if (e.origin !== window.location.origin) return;
    if (!e.data) return;
    if (e.data.type === "__ps_detail_data") {
      try {
        __pageDetailData = JSON.parse(e.data.payload);
      } catch (err) {}
    }
    if (e.data.type === "__ps_1688_detail_data") {
      try {
        __pageDetailData = JSON.parse(e.data.payload);
      } catch (err) {}
    }
  });

  const DESC_WAIT_MS = 8000;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "TRIGGER_EXTRACT") {
      doExtract();
      sendResponse({ ok: true });
    }
    if (msg.type === "TRIGGER_1688_TREND_EXTRACT") {
      collect1688TrendSearch(msg.maxResults).then(sendResponse);
      return true;
    }
    return true;
  });

  function is1688VerificationPage() {
    try {
      const url = new URL(location.href);
      if (url.pathname.indexOf("/punish") !== -1) return true;
      if (url.searchParams.get("action") === "captcha") return true;
    } catch (e) {}

    const bodyText = (document.body && document.body.innerText || "").slice(0, 5000);
    return /(?:滑块|验证码|安全验证|访问异常|unusual\s+traffic|captcha)/i.test(bodyText);
  }

  async function collect1688TrendSearch(maxResults) {
    const requested = Number(maxResults);
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(20, Math.floor(requested)))
      : 20;

    if (ProductScraper.common.detectPlatform() !== "1688") {
      return { ok: false, error: "not_1688" };
    }

    let best = null;
    let unchangedAttempts = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      if (is1688VerificationPage()) {
        return {
          ok: false,
          status: "verification_required",
          verificationUrl: location.href,
        };
      }

      const next = ProductScraper.alibaba1688.extractTrendSearch(limit);
      if (next && (!best || next.items.length > best.items.length)) {
        best = next;
        unchangedAttempts = 0;
      } else {
        unchangedAttempts++;
      }

      if (best && best.items.length >= limit) break;
      if (best && best.items.length > 0 && unchangedAttempts >= 3) break;

      window.scrollTo({
        top: Math.min(
          document.documentElement.scrollHeight,
          (attempt + 1) * Math.max(window.innerHeight, 800)
        ),
        behavior: "instant",
      });
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    window.scrollTo({ top: 0, behavior: "instant" });
    if (!best) {
      return { ok: false, error: "search_results_not_rendered" };
    }
    return { ok: true, ...best };
  }

  function run() {
    if (!alive()) return;
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;
      if (resp.running) doExtract();
    });
  }

  function scrollPage() {
    return new Promise((resolve) => {
      const docH = document.documentElement.scrollHeight;
      const viewH = window.innerHeight;
      const steps = Math.ceil(docH / viewH);
      const maxSteps = Math.min(steps, 15);
      let i = 0;

      const tick = () => {
        if (i >= maxSteps) {
          window.scrollTo({ top: 0, behavior: "instant" });
          setTimeout(resolve, SCROLL_SETTLE_MS);
          return;
        }
        const y = Math.min((i + 1) * viewH, docH);
        window.scrollTo({ top: y, behavior: "instant" });
        i++;
        setTimeout(tick, SCROLL_STEP_MS);
      };
      tick();
    });
  }

  async function doExtract() {
    const platform = ProductScraper.common.detectPlatform();
    if (!platform) return;

    const extractor = EXTRACTORS[platform];
    if (!extractor) return;

    const pageType = ProductScraper.common.detectPageType();
    const isDetail = pageType === "detail";

    if (isDetail) {
      await scrollPage();
    }

    let data;
    if (isDetail && __pageDetailData) {
      data = extractor.extract(__pageDetailData);
    } else {
      data = extractor.extract();
    }

    if (!data) return;

    sendResult(data);

    if (isDetail && (platform === "ALIBABA" || platform === "1688")) {
      extractDescriptionPhase(extractor, data).then((hadDescription) => {
        if (!alive()) return;
        chrome.runtime.sendMessage({
          type: "EXTRACTION_COMPLETE",
          hadDescription,
        });
      });
    }
  }

  async function extractDescriptionPhase(extractor, baseData) {
    const descEl = extractor.scrollToDescription();
    if (!descEl) {
      console.log("[product-scraper] description section not found");
      return false;
    }

    console.log("[product-scraper] scrolled to description, waiting for content...");
    await extractor.waitForDescriptionContent(descEl, DESC_WAIT_MS);

    const descContent = extractor.collectDescriptionContent(descEl);
    if (!descContent || descContent.description_image_count === 0) {
      console.log("[product-scraper] no description content found after wait");
      return false;
    }

    console.log(
      `[product-scraper] description: ${descContent.description_image_count} images, ${descContent.description_text.length} chars text`
    );

    if (alive()) {
      chrome.runtime.sendMessage({
        type: "DESCRIPTION_DATA",
        data: {
          source_url: baseData.source_url,
          product_id: baseData.product_id || "",
          ...descContent,
        },
      });
    }
    return true;
  }

  // ── Send result to background ──

  function sendResult(data) {
    const filledFields = Object.entries(data).filter(([, v]) => {
      if (v === null || v === undefined || v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }).length;

    const method = data._extraction_method || "unknown";
    console.log(
      `[product-scraper] ${data.source_platform} ${data.page_type} (${method}): ${filledFields} fields from`,
      location.href
    );

    if (alive()) chrome.runtime.sendMessage({ type: "PRODUCT_DATA", data });

  }

  setTimeout(run, EXTRACT_DELAY_MS);
})();
