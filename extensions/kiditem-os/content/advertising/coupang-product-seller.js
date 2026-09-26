// KIDITEM OS — 쿠팡 상품 상세의 판매자 상점 링크 읽기(KID-362, advertising.competitor_seller_identity).
//
// 새 런타임의 `sites/coupang-product`가 이 파일을 상품 상세 탭에 주입하고 메시지로 묻는다. 여기서는 판단하지 않는다:
// shop.coupang.com 판매자 상점으로 가는 첫 링크의 주소와 글자만 돌려주고, 판매자 ID·이름 풀기는 사이트(TypeScript)가 한다.
(function () {
  "use strict";
  if (window.__kiditemCoupangProductSellerLoaded) return;
  window.__kiditemCoupangProductSellerLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "KIDITEM_COUPANG_PRODUCT_SELLER") return;
    sendResponse({ ok: true, url: location.href, seller: sellerLink() });
    return false;
  });

  function sellerLink() {
    const anchor = Array.from(document.querySelectorAll("a[href]")).find((candidate) => {
      try {
        const parsed = new URL(candidate.href);
        return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" && parsed.port === "" &&
          parsed.hostname === "shop.coupang.com" && /^\/(?:vid\/)?[A-Za-z0-9_-]+\/?$/.test(parsed.pathname);
      } catch {
        return false;
      }
    });
    return anchor ? { href: anchor.href, text: anchor.textContent || "" } : null;
  }
})();
