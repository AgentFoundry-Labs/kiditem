// 아이스크림몰 배송조회 화면 열기(ISOLATED world, 맨 위 문서, KID-359 H3 — 옛 worker.js
// `ensureIcecreamMallDeliveryInquiry` 이식). 사이트가 `icecream.openDeliveryInquiry`를 부른다. 이미 열려 있으면 그대로,
// 아니면 '배송 조회' 메뉴를 누르고 배송목록 프레임 자체가 그려질 때까지(옆 메뉴 글자가 아니라) 12초 기다린다.
(function installIcecreamOpenDeliveryInquiry() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  calls["icecream.openDeliveryInquiry"] = async function icecreamOpenDeliveryInquiry() {
    function hasDeliveryInquiryText(text) {
      const compact = String(text || "").replace(/\s+/g, "");
      return (
        compact.includes("배송조회") ||
        (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호"))
      );
    }

    // Wait for the delivery page itself. Right after the menu click the side
    // menu shows its own "배송 조회" label while the delivery frame is still
    // about:blank, and picking a frame then scrapes the menu page, which has no
    // delivery table header.
    function isDeliveryInquiryDocument(doc, href) {
      const compact = String(doc?.body?.innerText || "").replace(/\s+/g, "");
      if (compact.includes("배송목록") && compact.includes("주문번호") && compact.includes("배송번호")) {
        return true;
      }
      return String(href || "").includes("deliveryInquiry.deliveryInquiryListView") &&
        hasDeliveryInquiryText(compact);
    }

    function hasDeliveryInquiryFrame() {
      if (isDeliveryInquiryDocument(document, location.href)) {
        return true;
      }

      return Array.from(document.querySelectorAll("iframe,frame")).some((frame) => {
        try {
          return isDeliveryInquiryDocument(frame.contentDocument, frame.contentWindow?.location?.href);
        } catch {
          return false;
        }
      });
    }

    function clickDeliveryInquiryMenu() {
      const candidates = menuCandidates();
      const exact = candidates.find((item) => item.text === "배송 조회" || item.text === "배송조회");
      if (exact) {
        exact.element.click();
        return true;
      }

      const deliverySection = candidates.find((item) => item.text === "배송");
      deliverySection?.element.click();

      const afterSectionClick = menuCandidates().find(
        (item) => item.text === "배송 조회" || item.text === "배송조회",
      );
      if (afterSectionClick) {
        afterSectionClick.element.click();
        return true;
      }

      return false;
    }

    function menuCandidates() {
      return Array.from(
        document.querySelectorAll("a,button,input[type='button'],[role='button'],[onclick]"),
      )
        .map((element) => ({
          element,
          text: String(
            element.textContent ||
              element.value ||
              element.getAttribute("title") ||
              element.getAttribute("aria-label") ||
              "",
          )
            .replace(/\s+/g, " ")
            .trim(),
        }))
        .filter((item) => item.text.includes("배송"));
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    if (hasDeliveryInquiryFrame()) {
      return { status: "opened", opened: false };
    }

    const clicked = clickDeliveryInquiryMenu();
    if (!clicked) {
      const bodyText = document.body?.innerText || "";
      return bodyText.includes("배송")
        ? { status: "failed", error: "아이스크림몰 배송조회 메뉴를 찾지 못했습니다." }
        : { status: "login_required" };
    }

    const expiresAt = Date.now() + 12000;
    while (Date.now() < expiresAt) {
      if (hasDeliveryInquiryFrame()) {
        return { status: "opened", opened: true };
      }
      await delay(400);
    }

    return { status: "failed", error: "배송조회 메뉴를 눌렀지만 배송목록 화면이 열리지 않았습니다." };
  };
})();
