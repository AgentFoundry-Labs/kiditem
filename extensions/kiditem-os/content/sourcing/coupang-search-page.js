// KIDITEM OS — 쿠팡 검색 페이지 근거 읽기(KID-360, sourcing.coupang_keyword_suggestion).
//
// 새 런타임의 `sites/coupang-search`가 이 파일을 검색 탭에 주입하고 메시지로 묻는다. 여기서는 판단하지 않는다:
// 같은 출처 자동완성 응답 원문, 검색 화면의 키워드 링크, 상품명만 모아 돌려주고, 거르기·순위·토큰 세기는
// 사이트(TypeScript)가 한다.
(function () {
  "use strict";
  if (window.__kiditemCoupangSearchPageLoaded) return;
  window.__kiditemCoupangSearchPageLoaded = true;

  const LINK_SELECTORS = [
    'a[href*="/np/search"]',
    'a[href*="q="]',
    '[class*="related"] a',
    '[class*="suggest"] a',
    '[class*="keyword"] a',
  ];
  const PRODUCT_NAME_SELECTORS = [
    ".search-product-wrap .name",
    ".search-product .name",
    ".descriptions .name",
    "a.search-product-link",
    "li.search-product",
    '[class*="search-product"] [class*="name"]',
  ];

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "KIDITEM_COUPANG_SEARCH_EVIDENCE") return;
    read(String(message.keyword || "")).then(sendResponse);
    return true;
  });

  async function read(keyword) {
    let autocomplete = null;
    try {
      const response = await fetch(`/np/search/autoComplete?${new URLSearchParams({ keyword })}`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json, text/plain, */*", "X-Requested-With": "XMLHttpRequest" },
      });
      autocomplete = {
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        text: String((await response.text()) || "").slice(0, 200000),
      };
    } catch (error) {
      autocomplete = { status: 0, contentType: "", text: "", error: error?.message || String(error) };
    }
    const links = [];
    for (const element of document.querySelectorAll(LINK_SELECTORS.join(","))) {
      links.push({ text: element.textContent || "", href: element.getAttribute("href") || "" });
      if (links.length >= 500) break;
    }
    const productNames = [];
    for (const element of document.querySelectorAll(PRODUCT_NAME_SELECTORS.join(","))) {
      productNames.push(element.textContent || "");
      if (productNames.length >= 500) break;
    }
    return { ok: true, url: location.href, autocomplete, links, productNames };
  }
})();
