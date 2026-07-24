// TikTok Creative Center MAIN-world capture hook.
//
// ⚠️ UNVERIFIED against live TikTok Creative Center. Runs in the PAGE world so
// it can observe the page's own `creative_radar_api` responses, which are the
// only reliable data source on this bot/region-gated surface. It NEVER receives
// or reads KidItem auth tokens, cookies, or backend URLs (per extension boundary
// rules); it only forwards same-origin API JSON to the ISOLATED content script
// via serializable `window.postMessage`.
//
// Mirrors the live-commerce MAIN-world bridge pattern. See
// [[reference_market_trend_research_tools]] for the sourcing trend context.
(function () {
  "use strict";
  if (window.__kiditemTiktokCcHookLoaded) return;
  window.__kiditemTiktokCcHookLoaded = true;

  const API_MARKER = "/creative_radar_api/v1/";
  const CAPTURE_MESSAGE = "__kiditem_tiktok_cc_capture";
  const FLUSH_REQUEST = "__kiditem_tiktok_cc_flush";
  const MAX_BODY_BYTES = 2_000_000;
  const MAX_BUFFER = 100;

  // Re-broadcastable buffer: the content script may attach its listener after the
  // page has already fired its initial API calls, so it can request a flush.
  const buffer = [];

  function emit(url, payload) {
    try {
      window.postMessage({ type: CAPTURE_MESSAGE, url, payload }, window.location.origin);
    } catch (e) {
      /* payload not structured-cloneable — drop it */
    }
  }

  function handle(url, bodyText) {
    if (!url || String(url).indexOf(API_MARKER) === -1) return;
    if (typeof bodyText !== "string" || !bodyText || bodyText.length > MAX_BODY_BYTES) return;
    let payload = null;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      return;
    }
    const safeUrl = String(url).slice(0, 500);
    buffer.push({ url: safeUrl, payload });
    while (buffer.length > MAX_BUFFER) buffer.shift();
    emit(safeUrl, payload);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== FLUSH_REQUEST) return;
    for (const entry of buffer) emit(entry.url, entry.payload);
  });

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (...args) {
      const promise = originalFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url && url.indexOf(API_MARKER) !== -1) {
          promise
            .then((response) => {
              try {
                response.clone().text().then((text) => handle(url, text)).catch(() => {});
              } catch (e) {
                /* body already consumed */
              }
              return response;
            })
            .catch(() => {});
        }
      } catch (e) {
        /* never break the page's fetch */
      }
      return promise;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function" && OriginalXHR.prototype) {
    const URL_PROP = "__kiditemCcUrl";
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function (method, url, ...rest) {
      try {
        this[URL_PROP] = typeof url === "string" ? url : "";
      } catch (e) {
        /* noop */
      }
      return originalOpen.call(this, method, url, ...rest);
    };

    OriginalXHR.prototype.send = function (...sendArgs) {
      try {
        const url = this[URL_PROP] || "";
        if (url && url.indexOf(API_MARKER) !== -1) {
          this.addEventListener("load", function () {
            try {
              if (this.responseType === "" || this.responseType === "text") {
                handle(url, this.responseText);
              } else if (this.responseType === "json" && this.response != null) {
                handle(url, JSON.stringify(this.response));
              }
            } catch (e) {
              /* noop */
            }
          });
        }
      } catch (e) {
        /* never break the page's XHR */
      }
      return originalSend.apply(this, sendArgs);
    };
  }
})();
