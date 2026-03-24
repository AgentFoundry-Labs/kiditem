var ProductScraper = ProductScraper || {};

ProductScraper.common = (() => {
  "use strict";

  const PLATFORMS = {
    "alibaba.com": "ALIBABA",
    "1688.com": "1688",
  };

  function detectPlatform() {
    const host = location.hostname;
    for (const [domain, name] of Object.entries(PLATFORMS)) {
      if (host.includes(domain)) return name;
    }
    return null;
  }

  function detectPageType() {
    const path = location.pathname;
    const host = location.hostname;

    if (host.includes("alibaba.com")) {
      if (path.includes("/product-detail/")) return "detail";
      if (path.includes("/trade/search") || path.includes("/products/")) return "search";
    }
    if (host.includes("1688.com")) {
      if (host.startsWith("s.") || path.includes("offer_search")) return "search";
      if (host.startsWith("detail.") || /\/offer\/\d+/.test(path)) return "detail";
    }
    return "unknown";
  }

  function q(selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch {}
    }
    return null;
  }

  function qAll(selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) return [...els];
      } catch {}
    }
    return [];
  }

  function txt(selectors) {
    const el = q(selectors);
    return el ? el.textContent.trim() : "";
  }

  function parsePrice(text) {
    if (!text) return { min: null, max: null, currency: "USD" };
    let currency = "USD";
    if (text.includes("¥") || text.includes("￥")) currency = "CNY";
    else if (text.includes("₩")) currency = "KRW";
    else if (text.includes("$")) currency = "USD";

    const nums = text.match(/[\d,.]+/g);
    if (!nums) return { min: null, max: null, currency };
    const parsed = nums
      .map((n) => parseFloat(n.replace(/,/g, "")))
      .filter((n) => !isNaN(n) && n > 0);
    if (parsed.length === 0) return { min: null, max: null, currency };
    return {
      min: Math.min(...parsed),
      max: parsed.length > 1 ? Math.max(...parsed) : null,
      currency,
    };
  }

  function parseMoq(text) {
    if (!text) return null;
    const match = text.match(/([\d,]+)\s*(piece|set|unit|pair|item|개|건)/i);
    if (match) return parseInt(match[1].replace(/,/g, ""), 10);
    const numMatch = text.match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1], 10) : null;
  }

  function parseNumber(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[^\d.]/g, "");
    return cleaned ? parseFloat(cleaned) : 0;
  }

  function uniqueImages(imgs) {
    const seen = new Set();
    const urls = [];
    for (const img of imgs) {
      const src = img.src || img.dataset.src || img.dataset.lazySrc || "";
      if (!src || src.startsWith("data:")) continue;
      const clean = src.split("?")[0];
      if (!seen.has(clean)) {
        seen.add(clean);
        urls.push(src);
      }
    }
    return urls.slice(0, 20);
  }

  function tryJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data["@type"] === "Product" || data.name) {
          return {
            title: data.name || "",
            price_min: data.offers?.lowPrice ?? data.offers?.price ?? null,
            price_max: data.offers?.highPrice ?? null,
            currency: data.offers?.priceCurrency || "USD",
            description: (data.description || "").slice(0, 2000),
            images: Array.isArray(data.image) ? data.image : data.image ? [data.image] : [],
          };
        }
      } catch {}
    }
    return null;
  }

  function baseResult(platform) {
    return {
      source_url: location.href,
      source_platform: platform,
      page_type: detectPageType(),
      title: "",
      images: [],
      price_min: null,
      price_max: null,
      currency: "USD",
      moq: null,
      supplier_name: "",
      description: "",
      specs: [],
      pack_info: [],
      extracted_at: new Date().toISOString(),
    };
  }

  return {
    detectPlatform,
    detectPageType,
    q,
    qAll,
    txt,
    parsePrice,
    parseMoq,
    parseNumber,
    uniqueImages,
    tryJsonLd,
    baseResult,
  };
})();
