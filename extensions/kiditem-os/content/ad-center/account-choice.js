// 광고센터 로그인의 계정 유형 선택(ISOLATED world, KID-371 — 옛 `content/coupang/ads-report.js`
// findAdvertisingAccountLoginButton 이식). 사이트 `extensions/src/sites/ad-center`가 `/user/login` 탭에 `page-call/bridge.js`와 함께
// 넣고 `adCenter.chooseWingAccount`를 부른다. 비밀번호 칸이 이미 보이면 누르지 않고 `form`, 아니면 "쿠팡 wing 로그인" 버튼·링크
// (또는 마켓플레이스·로켓그로스·wing 카드의 "로그인하기")를 한 번 눌러 `clicked`, 없으면 `not_found`다. 자격증명은 다루지 않는다 —
// 다음 로그인 단계(xauth 폼)로 넘어가는 이동 클릭일 뿐이다.
(function installAdCenterAccountChoice() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  const SOCIAL = /카카오|네이버|구글|애플|페이스북|간편|kakao|naver|google|apple|facebook|sns/i;

  calls["adCenter.chooseWingAccount"] = function chooseWingAccount() {
    if (document.querySelector('input[type="password"]')) return { state: "form" };
    const target = findWingLogin();
    if (!target) return { state: "not_found" };
    target.click();
    return { state: "clicked" };
  };

  function label(element) {
    return String(element.textContent || element.value || "").replace(/\s+/g, " ").trim();
  }

  /** 버튼이 속한 계정 카드의 글(조상 몇 단계, 옛 advertisingAccountCardText). */
  function cardText(element) {
    let node = element.parentElement;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      const text = String(node.textContent || "");
      if (text.length > 40) return text;
      node = node.parentElement;
    }
    return label(element);
  }

  function findWingLogin() {
    const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]')).filter((element) => {
      if (element.disabled) return false;
      const text = label(element);
      return /로그인/.test(text) && !SOCIAL.test(text);
    });
    // "쿠팡 wing 로그인" 같은 이름이 먼저, 그다음 wing 카드의 "로그인하기". 어느 카드인지 모르면 누르지 않는다.
    return candidates.find((element) => /wing/i.test(label(element)))
      || candidates.find((element) => /로그인하기/.test(label(element)) && /마켓플레이스|로켓그로스|wing/i.test(cardText(element)))
      || null;
  }
})();
