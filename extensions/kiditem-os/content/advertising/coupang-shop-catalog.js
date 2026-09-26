// KIDITEM OS — 쿠팡 판매자샵(shop.coupang.com) 상품 목록 읽기(KID-362, advertising.competitor_catalog).
//
// 새 런타임의 `sites/coupang-shop`이 이 파일을 판매자샵 탭에 주입하고 메시지로 묻는다: 최신순 정렬 누르기, 그리고
// 끝까지 스크롤하며(상한까지) 상품 카드를 읽기. 옛 `coupang-seller-catalog-collector.js`의 페이지 함수 규칙 그대로다.
// 상한·완결 판단은 사이트와 서버가 한다.
(function () {
  "use strict";
  if (window.__kiditemCoupangShopCatalogLoaded) return;
  window.__kiditemCoupangShopCatalogLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "KIDITEM_COUPANG_SHOP_SORT_NEWEST") {
      sendResponse({ ok: true, url: location.href, clicked: selectNewest() });
      return false;
    }
    if (message?.type !== "KIDITEM_COUPANG_SHOP_CATALOG") return;
    const maxItems = Math.max(1, Math.min(500, Number(message.maxItems) || 100));
    extract(maxItems).then(
      (catalog) => sendResponse({ ok: true, url: location.href, ...catalog }),
      (error) => sendResponse({ ok: false, error: error?.message || String(error) }),
    );
    return true;
  });

  function selectNewest() {
    const target = Array.from(document.querySelectorAll("li.sortkey, [role=button], button"))
      .find((element) => (element.textContent || "").trim() === "최신순");
    if (!target) return false;
    target.click();
    return true;
  }

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const productAnchors = () => Array.from(document.querySelectorAll('a[href*="/vp/products/"]'));
  const digits = (value) => {
    const normalized = String(value || "").replace(/[^\d]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  async function extract(maxItems) {
    let stableRounds = 0;
    let previousCount = -1;
    for (let round = 0; round < 45; round += 1) {
      const count = productAnchors().length;
      if (count >= maxItems) break;
      stableRounds = count === previousCount ? stableRounds + 1 : 0;
      if (stableRounds >= 3) break;
      previousCount = count;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(650);
    }
    const totalMatch = (document.body?.innerText || "").match(/전체\s*\(([\d,]+)\)/);
    const totalProductCount = totalMatch ? digits(totalMatch[1]) : null;
    const seen = new Set();
    const products = [];
    for (const anchor of productAnchors()) {
      if (products.length >= maxItems) break;
      let parsed;
      try {
        parsed = new URL(anchor.getAttribute("href") || "", location.origin);
      } catch {
        continue;
      }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        parsed.hostname !== "www.coupang.com" || !/^\/vp\/products\/\d+$/.test(parsed.pathname)) continue;
      const productId = (parsed.pathname.match(/^\/vp\/products\/(\d+)$/) || [])[1] || null;
      const itemId = parsed.searchParams.get("itemId") || null;
      const vendorItemId = parsed.searchParams.get("vendorItemId") || null;
      const key = vendorItemId || itemId || productId;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const name = (anchor.querySelector(".name")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (!name) continue;
      const image = anchor.querySelector("img");
      const rawImageUrl = [image?.getAttribute("data-img-src"), image?.getAttribute("data-src"), image?.currentSrc, image?.getAttribute("src")]
        .find((value) => typeof value === "string" && value.trim() && !value.trim().startsWith("data:"));
      let imageUrl = null;
      if (rawImageUrl) {
        try {
          const imageParsed = new URL(rawImageUrl, location.href);
          if (imageParsed.protocol === "https:" && !imageParsed.username && !imageParsed.password && !imageParsed.port) imageUrl = imageParsed.href;
        } catch {
          imageUrl = null;
        }
      }
      products.push({
        sourceRank: products.length + 1,
        productId,
        itemId,
        vendorItemId,
        name,
        priceKrw: digits(anchor.querySelector(".price-value")?.textContent || ""),
        reviewCount: digits(anchor.querySelector(".rating-total-count")?.textContent || ""),
        imageUrl,
        link: `${parsed.origin}${parsed.pathname}${parsed.search}`,
      });
    }
    const bodyText = document.body?.innerText || "";
    const sellerName = Array.from(document.querySelectorAll("h1,h2,h3,strong,span,div"))
      .map((element) => (element.textContent || "").trim())
      .find((text) => text && text.length <= 120 && bodyText.includes(`${text}의 판매자샵입니다.`)) || null;
    return { sellerName, totalProductCount, products };
  }
})();
