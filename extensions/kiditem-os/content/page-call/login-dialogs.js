// 사이트 로그인 알림 창 받기(MAIN world, KID-377 — 옛 worker.js `installMallLoginDialogRecorder`·`readMallLoginDialogs`
// 이식). 몰은 로그인 결과를 `alert`으로 말하는 화면이 많고(아이디 또는 비밀번호가 일치하지 않습니다), 백그라운드 탭의
// 알림 창은 그 탭의 스크립트를 멈춰 확인조차 막는다. 러너(`runner.js`)의 처리기 둘:
// - `login.watchDialogs`: 로그인하는 동안 `alert` 대신 문장을 모아 둔다.
// - `login.takeDialogs`: 모아 둔 문장을 돌려주고 원래 `alert`으로 되돌린다.
// 불러오는 중 알림 창 가드(`dialog-guard.js`, KID-380 D4)가 이 문서에 이미 있으면 `alert`을 다시 바꾸지 않고 가드가
// 모은 문장을 쓴다 — 지켜보기 전에 모인 문장(로드 중 알림)은 로그인 결과가 아니므로 버린다. 가드가 없는 문서(운영자 탭)는
// 옛 규칙 그대로 이 파일이 `alert`을 바꿨다가 되돌린다.
(function installKidItemLoginDialogs() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});
  const guarded = () => window.__kiditemDialogGuard === true && Array.isArray(window.__kiditemDialogs);
  calls["login.watchDialogs"] = () => {
    if (guarded()) {
      window.__kiditemDialogs.length = 0;
      return true;
    }
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
    if (guarded()) messages.push(...window.__kiditemDialogs.splice(0));
    return messages;
  };
})();
