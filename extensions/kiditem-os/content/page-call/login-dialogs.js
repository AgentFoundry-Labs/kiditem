// 사이트 로그인 알림 창 받기(MAIN world, KID-377 — 옛 worker.js `installMallLoginDialogRecorder`·`readMallLoginDialogs`
// 이식). 몰은 로그인 결과를 `alert`으로 말하는 화면이 많고(아이디 또는 비밀번호가 일치하지 않습니다), 백그라운드 탭의
// 알림 창은 그 탭의 스크립트를 멈춰 확인조차 막는다. 러너(`runner.js`)의 처리기 둘:
// - `login.watchDialogs`: 로그인하는 동안 `alert` 대신 문장을 모아 둔다.
// - `login.takeDialogs`: 모아 둔 문장을 돌려주고 원래 `alert`으로 되돌린다.
(function installKidItemLoginDialogs() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});
  calls["login.watchDialogs"] = () => {
    if (!window.__kiditemLoginDialogs) {
      window.__kiditemLoginDialogs = [];
      const nativeAlert = window.alert;
      window.alert = function (message) {
        window.__kiditemLoginDialogs.push(String(message === undefined ? "" : message));
      };
      window.__kiditemRestoreLoginDialogs = function () {
        window.alert = nativeAlert;
        delete window.__kiditemRestoreLoginDialogs;
        delete window.__kiditemLoginDialogs;
      };
    }
    return true;
  };
  calls["login.takeDialogs"] = () => {
    const messages = Array.isArray(window.__kiditemLoginDialogs) ? window.__kiditemLoginDialogs.slice() : [];
    if (typeof window.__kiditemRestoreLoginDialogs === "function") window.__kiditemRestoreLoginDialogs();
    return messages;
  };
})();
