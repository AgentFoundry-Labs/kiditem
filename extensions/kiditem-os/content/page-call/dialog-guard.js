// 불러오는 중 뜨는 알림 창 가드(MAIN world, document_start, KID-380 D4 · 실기기 R1). 몰이 로드 중에 `alert`을 띄우면
// (아이스크림몰 "로그인이 만료되었습니다.", Cafe24 "Session이 종료되었거나…") 백그라운드 탭의 스크립트가 멈춰 탭이 다
// 그려지지 않는다. 런타임(`sites/tab-page.ts` `guardDialogs`)이 수집 탭을 옮기기 전에 이 파일을 그 몰 호스트의 등록 content
// script로 걸고 실행이 끝나면 푼다.
// - `alert`은 어느 탭이든 문장만 `window.__kiditemDialogs`에 모으고 바로 돌아간다 — 알림은 안내일 뿐이고 창이 로드를 막는다
//   (실행 동안 그 호스트에서만, 옛 수집기의 알림 처리와 같은 뜻).
// - `confirm`은 운영자 탭에서는 진짜 창이다. ISOLATED 짝(`dialog-guard-bridge.js`)이 런타임에 물어 이 탭이 수집 탭이라는
//   표시(`{kiditemDialogGuard: 'run-tab'}`)를 보내면 그때부터 문장을 모으고 확인한다(옛 수집기의 자동 승인).
// 탭이 보이는지(`visibilityState`)로 가리지 않는다 — DevTools가 붙은 QA Chrome은 백그라운드 탭도 visible이다.
// 모은 문장은 로그인 알림 창 받기(`login-dialogs.js`)가 몰의 말로 돌려준다.
(function installKidItemDialogGuard() {
  "use strict";
  if (window.__kiditemDialogGuard) return;
  window.__kiditemDialogGuard = true;
  const MAX_MESSAGES = 20;
  // 모은 문장은 그 출처의 sessionStorage에도 둔다 — 몰이 알림 창을 띄운 뒤 다른 화면으로 넘겨도(아이스크림몰
  // /error/loginExpired) 다음 문서의 가드가 이어받아 로그인 알림 창 받기가 몰의 말을 돌려준다(실기기 R5).
  const STORE_KEY = "__kiditemDialogs";
  let storage = null;
  try {
    storage = window.sessionStorage || null;
  } catch {
    storage = null;
  }
  let saved = [];
  try {
    saved = JSON.parse((storage && storage.getItem(STORE_KEY)) || "[]");
  } catch {
    saved = [];
  }
  window.__kiditemDialogs = Array.isArray(saved) ? saved.filter((item) => typeof item === "string").slice(0, MAX_MESSAGES) : [];
  window.__kiditemSaveDialogs = function () {
    try {
      if (!storage) return;
      if (window.__kiditemDialogs.length > 0) storage.setItem(STORE_KEY, JSON.stringify(window.__kiditemDialogs));
      else storage.removeItem(STORE_KEY);
    } catch {
      // 저장소를 못 쓰는 화면 — 이 문서 안에서만 모은다.
    }
  };
  function record(message) {
    const messages = window.__kiditemDialogs;
    if (messages.length < MAX_MESSAGES) messages.push(String(message === undefined ? "" : message));
    window.__kiditemSaveDialogs();
  }
  const nativeConfirm = window.confirm;
  let runTab = false;
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data && event.data.kiditemDialogGuard === "run-tab") runTab = true;
  });
  window.alert = function (message) {
    record(message);
  };
  window.confirm = function (message) {
    if (!runTab && typeof nativeConfirm === "function") return nativeConfirm.call(window, message);
    record(message);
    return true;
  };
})();
