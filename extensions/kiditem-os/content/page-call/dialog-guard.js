// 불러오는 중 뜨는 알림 창 가드(MAIN world, document_start, KID-380 D4). 몰이 로드 중에 `alert`을 띄우면(아이스크림몰
// "로그인이 만료되었습니다.", Cafe24 "Session이 종료되었거나…") 백그라운드 탭의 스크립트가 멈춰 탭이 다 그려지지 않는다.
// 런타임(`sites/tab-page.ts` `guardDialogs`)이 수집 탭을 옮기기 전에 이 파일을 그 몰 호스트의 등록 content script로 걸고
// 실행이 끝나면 푼다. `alert`·`confirm`은 문장만 `window.__kiditemDialogs`에 모으고 바로 돌아간다(`confirm`은 확인 —
// 옛 수집기의 자동 승인과 같다). 모은 문장은 로그인 알림 창 받기(`login-dialogs.js`)가 몰의 말로 돌려준다.
(function installKidItemDialogGuard() {
  "use strict";
  if (window.__kiditemDialogGuard) return;
  window.__kiditemDialogGuard = true;
  const MAX_MESSAGES = 20;
  if (!Array.isArray(window.__kiditemDialogs)) window.__kiditemDialogs = [];
  function record(message) {
    const messages = window.__kiditemDialogs;
    if (messages.length < MAX_MESSAGES) messages.push(String(message === undefined ? "" : message));
  }
  window.alert = function (message) {
    record(message);
  };
  window.confirm = function (message) {
    record(message);
    return true;
  };
})();
