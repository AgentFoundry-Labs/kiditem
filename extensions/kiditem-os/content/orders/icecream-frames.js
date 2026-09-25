// 아이스크림몰 프레임 살피기(ISOLATED world, 모든 프레임, KID-359 H3 — 옛 worker.js `detectIcecreamMallLoginState`·
// `detectIcecreamMallDeliveryFrame` 이식). 사이트 `extensions/src/sites/icecream-mall`이 `TabPage.frames`로 넣으면
// 프레임마다 이 파일의 마지막 값 `{ loginPage, deliveryScore, href }`가 돌아온다 — 로그인 화면인지, 배송조회 화면이 어느
// 프레임에 열렸는지(점수가 가장 큰 프레임)를 고른다. 읽기만 한다.
(function inspectIcecreamFrame() {
  "use strict";
  const login = (function detectLogin() {
    const passwordInput = findPasswordInput();
    return {
      loginPage: Boolean(passwordInput),
      href: location.href,
    };

    function findPasswordInput() {
      return Array.from(document.querySelectorAll("input")).find((input) => {
        const type = String(input.type || "").toLowerCase();
        const descriptor = inputDescriptor(input);
        return isVisibleInput(input) && (type === "password" || descriptor.includes("비밀번호") || descriptor.includes("password") || descriptor.includes("passwd") || descriptor.includes("pwd"));
      });
    }

    function inputDescriptor(input) {
      return [
        input.name,
        input.id,
        input.placeholder,
        input.title,
        input.getAttribute("aria-label"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    }

    function isVisibleInput(input) {
      const rect = input.getBoundingClientRect();
      const style = window.getComputedStyle(input);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        !input.disabled
      );
    }
  })();
  const delivery = (function detectDelivery() {
    const text = document.body?.innerText || "";
    const compact = text.replace(/\s+/g, "");
    const href = location.href || "";
    let score = 0;
    if (href.includes("deliveryInquiry.deliveryInquiryListView")) score += 10;
    if (compact.includes("배송조회")) score += 5;
    if (compact.includes("배송목록")) score += 5;
    if (compact.includes("주문번호") && compact.includes("배송번호")) score += 5;
    if (compact.includes("상품번호") || compact.includes("상품명")) score += 2;
    return {
      candidate: score > 0,
      score,
      href,
    };
  })();
  return { loginPage: login.loginPage, deliveryScore: delivery.score, href: login.href };
})();
