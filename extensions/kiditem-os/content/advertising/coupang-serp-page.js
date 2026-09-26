// KIDITEM OS — 쿠팡 검색 결과(SERP) 읽기(KID-362, advertising.keyword_serp).
//
// 새 런타임의 `sites/coupang-search`가 이 파일을 검색 탭에 주입하고 메시지로 묻는다. 여기서는 판단하지 않는다:
// 화면의 상품 카드를 DOM 순서대로 읽고, 보안문자·로그인 화면 표지를 함께 돌려준다. 순위 매기기·쪽 넘기기·대기는
// 사이트(TypeScript)가 한다. 옛 `coupang-serp-collector.js`의 `extractCoupangSerpInPage` 규칙을 그대로 옮겼다.
(function () {
  "use strict";
  if (window.__kiditemCoupangSerpPageLoaded) return;
  window.__kiditemCoupangSerpPageLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "KIDITEM_COUPANG_SERP_ITEMS") return;
    try {
      sendResponse({ ok: true, url: location.href, ...extract() });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
    return false;
  });

  function digitsToNumber(text) {
    const digits = String(text || "").replace(/[^\d]/g, "");
    if (!digits) return null;
    const numeric = Number(digits);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function detectAccessWall() {
    if (/login\.coupang\.com/i.test(location.hostname)) return "login";
    if (/captcha|securityCheck|verification/i.test(location.href)) return "captcha";
    if (document.querySelector('form[action*="captcha" i], #captcha, [class*="captcha" i], input[name*="captcha" i]')) return "captcha";
    const bodyText = (document.body?.innerText || "").slice(0, 4000);
    if (/보안\s*문자|자동\s*입력\s*방지/.test(bodyText)) return "captcha";
    if (/로그인이\s*필요/.test(bodyText)) return "login";
    return null;
  }

  function findProductElements() {
    const knownSelectors = [
      "ul#productList > li.search-product",
      "ul.search-product-list > li.search-product",
      "li.search-product",
      '#product-list > li[class*="ProductUnit" i]',
      'ul[class*="ProductList" i] > li',
      'li[class*="ProductUnit" i]',
    ];
    for (const selector of knownSelectors) {
      const found = Array.prototype.slice.call(document.querySelectorAll(selector))
        .filter((el) => el.querySelector('a[href*="/vp/products/"]'));
      if (found.length > 0) return { elements: found, usedFallback: false, resultListObserved: true };
    }
    const resultList = document.querySelector("#productList") ||
      document.querySelector("#product-list") ||
      document.querySelector('[class*="product-list" i]');
    const container = resultList || document.querySelector("main") || document.body;
    const seen = new Set();
    const elements = [];
    for (const anchor of container.querySelectorAll('a[href*="/vp/products/"]')) {
      const item = anchor.closest("li") || anchor;
      if (seen.has(item)) continue;
      seen.add(item);
      elements.push(item);
    }
    return { elements, usedFallback: true, resultListObserved: Boolean(resultList) };
  }

  function parseProductLink(anchor) {
    const empty = { link: null, productId: null, itemId: null, vendorItemId: null };
    if (!anchor) return empty;
    try {
      const parsed = new URL(anchor.getAttribute("href") || "", location.origin);
      const productId = (parsed.pathname.match(/^\/vp\/products\/(\d+)$/) || [])[1] || null;
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        parsed.hostname !== "www.coupang.com" || !productId) return empty;
      return {
        link: parsed.origin + parsed.pathname + parsed.search,
        productId,
        itemId: parsed.searchParams.get("itemId") || null,
        vendorItemId: parsed.searchParams.get("vendorItemId") || null,
      };
    } catch {
      return empty;
    }
  }

  function detectIsAd(element, anchor) {
    if (element.querySelector('[class*="ad-badge" i], [class*="adBadge" i], [class*="AdMark" i], [class*="sponsored" i], .search-product__ad-badge')) return true;
    if (/search-product__ad|AdMark/i.test(element.className || "")) return true;
    if (element.querySelector("[data-adsplatform], [data-ads-platform], [data-ad-marker]")) return true;
    const href = anchor ? anchor.getAttribute("href") || "" : "";
    if (/sourceType=srp_product_ads|adsPlatform/i.test(href)) return true;
    for (const badge of element.querySelectorAll("span, em, div")) {
      const text = (badge.textContent || "").trim();
      if (text.length <= 4 && (text === "광고" || text === "AD")) return true;
    }
    return false;
  }

  function extractName(element, anchor) {
    const nameEl = element.querySelector(".name") ||
      element.querySelector('[class*="productName" i]') ||
      element.querySelector('[class*="product-name" i]');
    let name = nameEl ? nameEl.textContent : "";
    if (!name) {
      const img = element.querySelector("img[alt]");
      if (img?.getAttribute("alt")) name = img.getAttribute("alt");
    }
    if (!name && anchor) name = anchor.textContent;
    name = String(name || "").replace(/\s+/g, " ").trim();
    return name ? name.slice(0, 300) : null;
  }

  function extractPrice(element) {
    const priceEl = element.querySelector(".price-value") ||
      element.querySelector('[class*="priceValue" i]') ||
      element.querySelector('[class*="sale-price" i]') ||
      element.querySelector('strong[class*="price" i]') ||
      element.querySelector('[class*="price" i] strong');
    return priceEl ? digitsToNumber(priceEl.textContent) : null;
  }

  function extractReviewCount(element) {
    const countEl = element.querySelector(".rating-total-count") ||
      element.querySelector('[class*="ratingCount" i]') ||
      element.querySelector('[class*="rating-total" i]');
    return countEl ? digitsToNumber(countEl.textContent) : null;
  }

  function extractRatingScore(element) {
    const ratingEl = element.querySelector("em.rating") ||
      element.querySelector('[class*="ratingValue" i]') ||
      element.querySelector(".rating");
    if (!ratingEl) return null;
    const direct = Number.parseFloat((ratingEl.textContent || "").trim());
    if (Number.isFinite(direct) && direct > 0 && direct <= 5) return direct;
    const width = Number.parseFloat(ratingEl.style?.width || "");
    if (Number.isFinite(width) && width > 0 && width <= 100) return Math.round((width / 20) * 10) / 10;
    return null;
  }

  function extractImageUrl(element) {
    const image = element.querySelector("img");
    const raw = image?.currentSrc || image?.getAttribute("src") || image?.getAttribute("data-img-src") || image?.getAttribute("data-src") || "";
    if (!raw || raw.startsWith("data:")) return null;
    try {
      const parsed = new URL(raw, location.href);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  function extract() {
    const wall = detectAccessWall();
    const { elements, usedFallback, resultListObserved } = findProductElements();
    const items = [];
    for (const element of elements) {
      const anchor = element.matches?.('a[href*="/vp/products/"]') ? element : element.querySelector('a[href*="/vp/products/"]');
      if (!anchor) continue;
      const linkInfo = parseProductLink(anchor);
      if (!linkInfo.productId) continue;
      items.push({
        isAd: detectIsAd(element, anchor),
        productId: linkInfo.productId,
        itemId: linkInfo.itemId,
        vendorItemId: linkInfo.vendorItemId,
        name: extractName(element, anchor),
        priceKrw: extractPrice(element),
        reviewCount: extractReviewCount(element),
        ratingScore: extractRatingScore(element),
        imageUrl: extractImageUrl(element),
        link: linkInfo.link,
      });
    }
    return { items, usedFallback, wall, resultListObserved };
  }
})();
