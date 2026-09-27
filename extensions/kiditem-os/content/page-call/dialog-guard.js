// 불러오는 중 뜨는 알림 창 가드(MAIN world, document_start, KID-380 D4 · 실기기 R1). 몰이 로드 중에 `alert`을 띄우면
// (아이스크림몰 "로그인이 만료되었습니다.", Cafe24 "Session이 종료되었거나…") 백그라운드 탭의 스크립트가 멈춰 탭이 다
// 그려지지 않는다. 런타임(`sites/tab-page.ts` `guardDialogs`)이 수집 탭을 옮기기 전에 이 파일을 그 몰 호스트의 등록 content
// script로 걸고 실행이 끝나면 푼다.
// - `alert`은 운영자 탭이라는 표시가 오기 전까지 문장만 `window.__kiditemDialogs`에 모으고 바로 돌아간다 — 알림은 안내일
//   뿐이고 창이 로드를 막는다(실행 동안 그 호스트에서만, 옛 수집기의 알림 처리와 같은 뜻).
// - `confirm`은 수집 탭 표시가 오기 전까지 진짜 창이다. ISOLATED 짝(`dialog-guard-bridge.js`)이 런타임에 물어 수집 탭이면
//   `{kiditemDialogGuard: 'run-tab'}`(문장을 모으고 확인 — 옛 수집기의 자동 승인), 운영자 탭이면 `'operator-tab'`(둘 다 진짜
//   창)을 보낸다. 런타임이 탭을 운영자에게 넘기면(focus·keep) 짝을 거쳐 다시 `'operator-tab'`이 온다.
// - 몰 쓰기(등록 폼 채우기, KID-256)는 채우는 처리기가 `{kiditemDialogGuard: 'write-tab'}`을 보낸다 — 알림은 모으고 `confirm`은
//   문장을 모은 뒤 거절한다(몰이 묻는 저장·이동을 받지 않는다). 탭을 운영자에게 넘기면 `'operator-tab'`으로 진짜 창이 돌아온다.
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
  // 몰 쓰기 처리기가 몰 말을 나오는 즉시 듣는 곳(KID-256 — 옛 채우기의 `said` 배열). 모은 문장 상한과 상관없이 모두 받는다.
  const sinks = new Set();
  window.__kiditemDialogSink = function (sink) {
    sinks.add(sink);
    return () => sinks.delete(sink);
  };
  function record(message) {
    const text = String(message === undefined ? "" : message);
    const messages = window.__kiditemDialogs;
    if (messages.length < MAX_MESSAGES) messages.push(text);
    window.__kiditemSaveDialogs();
    for (const sink of sinks) {
      try {
        sink(text);
      } catch {
        // 듣는 쪽 오류가 몰 화면을 멈추지 않게.
      }
    }
  }
  const nativeAlert = window.alert;
  const nativeConfirm = window.confirm;
  // 짝이 알려 주기 전(`unknown`)·수집 탭(`run`)·몰 쓰기 탭(`write`)·운영자 탭(`operator` — 런타임이 수집 탭이 아니라 답했거나, GS샵 SMS 인증처럼
  // 운영자에게 넘겼거나, 운영자에게 남긴 탭, 리뷰 2 SHOULD 2·3).
  let mode = "unknown";
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const mark = event.data && event.data.kiditemDialogGuard;
    // 몰 쓰기 탭(`write`)은 수집 탭 표시가 뒤늦게 와도 그대로다 — 운영자에게 넘길 때(`operator-tab`)만 풀린다.
    if (mark === "run-tab" && mode !== "write") mode = "run";
    else if (mark === "write-tab") mode = "write";
    else if (mark === "operator-tab") mode = "operator";
  });
  // 같은 문서의 몰 쓰기 처리기(`form-fill.js`)가 채우기 직전에 부른다 — postMessage 표시는 늦게 닿아 그 사이 뜬 confirm이
  // 수집 탭 규칙(자동 확인)으로 받아들여질 수 있다(KID-256).
  window.__kiditemWriteTab = function () {
    mode = "write";
  };
  window.alert = function (message) {
    if (mode === "operator" && typeof nativeAlert === "function") return nativeAlert.call(window, message);
    record(message);
  };
  window.confirm = function (message) {
    if (mode !== "run" && mode !== "write" && typeof nativeConfirm === "function") return nativeConfirm.call(window, message);
    record(message);
    // 몰 쓰기 탭은 몰이 묻는 저장·이동·삭제를 받지 않는다(옛 폼 채우기의 confirm 거절, KID-256). 수집 탭은 자동 확인.
    return mode !== "write";
  };
})();
