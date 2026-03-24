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
    return true;
  });

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
