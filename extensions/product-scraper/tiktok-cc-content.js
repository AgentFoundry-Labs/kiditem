// TikTok Creative Center content script (ISOLATED world).
//
// ⚠️ UNVERIFIED against live TikTok Creative Center. Accumulates the page's own
// `creative_radar_api` JSON captured by the MAIN-world hook (tiktok-cc-hook.js),
// normalizes it via ProductScraperTiktokCcExtractor, and answers the background
// collector's TRIGGER_TIKTOK_CC_EXTRACT request. Falls back to a brittle DOM
// scrape only when the API hook yielded nothing. See
// [[reference_market_trend_research_tools]].
(function () {
  "use strict";
  if (window.__kiditemTiktokCcContentLoaded) return;
  window.__kiditemTiktokCcContentLoaded = true;

  const CAPTURE_MESSAGE = "__kiditem_tiktok_cc_capture";
  const FLUSH_REQUEST = "__kiditem_tiktok_cc_flush";
  const MAX_CAPTURES = 200;
  const MAX_ATTEMPTS = 8;
  const FLUSH_WAIT_MS = 400;
  const SCROLL_WAIT_MS = 500;
  const ENOUGH_ITEMS = 50;

  const captures = [];

  window.addEventListener("message", (event) => {
    // Only trust same-window, same-origin messages from the page-world hook.
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== CAPTURE_MESSAGE) return;
    if (typeof data.url !== "string" || data.payload == null) return;
    captures.push({ url: data.url, payload: data.payload });
    while (captures.length > MAX_CAPTURES) captures.shift();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "TRIGGER_TIKTOK_CC_EXTRACT") return;
    collect(message).then(sendResponse);
    return true;
  });

  function requestFlush() {
    try {
      window.postMessage({ type: FLUSH_REQUEST }, window.location.origin);
    } catch (e) {
      /* noop */
    }
  }

  function detectBlock() {
    try {
      const url = new URL(location.href);
      if (/(?:\/login|\/passport|\/signup)/i.test(url.pathname)) return "login_required";
    } catch (e) {
      /* noop */
    }
    const text = (document.body && document.body.innerText || "").slice(0, 8000);
    if (/(?:log in to continue|please log in|sign in to continue|log in to view)/i.test(text)) {
      return "login_required";
    }
    if (/(?:not available in your region|region is not supported|access denied|restricted in your)/i.test(text)) {
      return "region_blocked";
    }
    return null;
  }

  function deriveDefaultRegion(fallback) {
    const extractor = window.ProductScraperTiktokCcExtractor;
    const sanitize = extractor && extractor.sanitizeRegion ? extractor.sanitizeRegion : (v) => (typeof v === "string" && /^[A-Za-z]{2,8}$/.test(v) ? v.toUpperCase() : null);
    try {
      const url = new URL(location.href);
      for (const key of ["region", "country", "countryCode", "country_code"]) {
        const sane = sanitize(url.searchParams.get(key));
        if (sane) return sane;
      }
    } catch (e) {
      /* noop */
    }
    return sanitize(fallback) || null;
  }

  async function collect(message) {
    if (!window.ProductScraperTiktokCcExtractor) {
      return { ok: false, error: "tiktok_cc_extractor_unavailable" };
    }
    const blocked = detectBlock();
    if (blocked) {
      return {
        ok: false,
        status: blocked,
        error: blocked === "login_required"
          ? "TikTok Creative Center 로그인이 필요합니다."
          : "현재 지역에서는 TikTok Creative Center 데이터를 볼 수 없습니다.",
      };
    }

    const trendType = typeof message.trendType === "string" ? message.trendType : null;
    const sourceKeyword = typeof message.sourceKeyword === "string" ? message.sourceKeyword : null;
    const defaultRegion = deriveDefaultRegion(message.defaultRegion);
    const options = { trendTypeHint: trendType, sourceKeyword, defaultRegion };

    let best = { region: defaultRegion || "US", items: [] };
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      requestFlush();
      await sleep(FLUSH_WAIT_MS);
      const normalized = window.ProductScraperTiktokCcExtractor.normalizeCaptures(captures, options);
      if (normalized.items.length > best.items.length) best = normalized;
      if (best.items.length >= ENOUGH_ITEMS) break;
      if (attempt + 1 >= MAX_ATTEMPTS) break;
      window.scrollTo({
        top: Math.min(
          document.documentElement.scrollHeight,
          (attempt + 1) * Math.max(window.innerHeight, 800),
        ),
        behavior: "instant",
      });
      await sleep(SCROLL_WAIT_MS);
    }
    window.scrollTo({ top: 0, behavior: "instant" });

    if (best.items.length === 0) {
      const domItems = window.ProductScraperTiktokCcExtractor.extractFromDom(document, options);
      if (domItems.length) {
        return {
          ok: true,
          region: defaultRegion || "US",
          items: domItems,
          apiCount: captures.length,
          domCount: domItems.length,
        };
      }
      return {
        ok: false,
        error: "TikTok 트렌드 데이터를 찾지 못했습니다(로그인·지역 제한 또는 응답 구조 변경).",
        apiCount: captures.length,
      };
    }

    return {
      ok: true,
      region: best.region,
      items: best.items,
      apiCount: captures.length,
      domCount: 0,
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
