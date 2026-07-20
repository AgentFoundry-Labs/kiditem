(function () {
  "use strict";
  if (window.__kiditemLiveCommerceContentLoaded) return;
  window.__kiditemLiveCommerceContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "TRIGGER_LIVE_COMMERCE_EXTRACT") return;
    collect().then(sendResponse);
    return true;
  });

  async function collect() {
    let best = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = ProductScraperLiveCommerceExtractor.extract(document, location.href);
      if (!result.ok) return result;
      if (!best || result.products.length > best.products.length) best = result;
      if (best.products.length >= 100) break;
      window.scrollTo({
        top: Math.min(document.documentElement.scrollHeight, (attempt + 1) * Math.max(window.innerHeight, 800)),
        behavior: "instant",
      });
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    return best || { ok: false, error: "live_page_not_rendered" };
  }
})();
