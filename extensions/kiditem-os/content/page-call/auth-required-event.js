/* global window, location */
// 서비스워커가 KidItem 웹 탭에 필요할 때만 넣는 재로그인 힌트(KID-366, 확장 `sites/tab-page` requestWebAuth).
// 확장이 가진 토큰이 없거나 서버가 401로 답하면, 웹(AuthProvider)이 이 이벤트를 받아 `setAuthToken`을 다시 보낸다.
// 토큰·주소·본문은 싣지 않는다 — 이름 하나짜리 이벤트다. KidItem 웹 origin에서만 띄운다.
(function () {
  "use strict";
  const WEB_ORIGINS = ["http://localhost:3000", "http://kiditem-office"];
  if (!WEB_ORIGINS.includes(location.origin)) return;
  window.dispatchEvent(new CustomEvent("kiditem:extension-auth-required"));
})();
