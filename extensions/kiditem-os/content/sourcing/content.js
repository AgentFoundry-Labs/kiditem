(() => {
  "use strict";

  const EXTRACT_DELAY_MS = 2000;
  const SCROLL_STEP_MS = 300;
  const SCROLL_SETTLE_MS = 1500;
  const TREND_MAX_ATTEMPTS = 16;
  const TREND_RETRY_DELAY_MS = 750;

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
    // 1688 검색 결과는 클라이언트 렌더라 `tab.status === 'complete'` 이후에도
    // 한참 뒤에 그려진다. 수집 탭은 `active:false`(백그라운드)라 렌더가 더 느리다.
    // 예전 12회로는 다 그려지기 전에 추출해 0건으로 끝나는 경우가 있었다.
    // 다만 background 탭의 750ms timer 는 약 1초로 throttle 될 수 있으므로,
    // 16회/최대 15회 wait 로 제한해 수집기의 20초 메시지 타임아웃에 5초
    // 이상의 응답 여유를 남긴다.
    // 카드를 찾으면 아래 unchangedAttempts 조건으로 곧바로 빠져나가므로
    // 정상 페이지에서는 느려지지 않는다.
    for (let attempt = 0; attempt < TREND_MAX_ATTEMPTS; attempt++) {
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
      // 마지막 관측 뒤에는 새 DOM 을 읽을 다음 iteration 이 없으므로 scroll/sleep
      // 하지 않는다. 특히 background timer throttling 아래서 불필요한 1초가 된다.
      if (attempt + 1 >= TREND_MAX_ATTEMPTS) break;

      window.scrollTo({
        top: Math.min(
          document.documentElement.scrollHeight,
          (attempt + 1) * Math.max(window.innerHeight, 800)
        ),
        behavior: "instant",
      });
      await new Promise((resolve) => setTimeout(resolve, TREND_RETRY_DELAY_MS));
    }

    window.scrollTo({ top: 0, behavior: "instant" });
    if (!best) {
      return { ok: false, error: "search_results_not_rendered" };
    }
    if (!best.items || best.items.length === 0) {
      // 추출기는 돌았지만 상품 카드를 하나도 못 잡은 상태. 예전에는 이걸
      // `ok:true` + 0건으로 보고해서 "에러 0건인데 수집 0건"이 되어 원인을
      // 볼 수 없었다(운영자는 그냥 빈 결과로만 보임). 소프트 차단(빈 결과)인지
      // 검색 DOM 변경으로 선택자가 늙은 것인지 가리려면 실패로 드러내야 한다.
      return {
        ...best,
        ok: false,
        error: "1688 검색 결과에서 상품 카드를 찾지 못했습니다(차단 또는 검색 페이지 구조 변경).",
      };
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
