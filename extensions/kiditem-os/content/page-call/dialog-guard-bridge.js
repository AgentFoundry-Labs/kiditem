// 알림 창 가드의 ISOLATED 짝(document_start, KID-380 실기기 R1). 이 탭이 지금 실행이 쥔 수집 탭인지 런타임에 묻고
// (`kiditem.dialogGuard.isRunTab` — 런타임이 연 탭 목록으로 답한다), 수집 탭이면 같은 출처로 MAIN 가드(`dialog-guard.js`)에
// 표시를 보내 `confirm`을 자동 확인하게 하고, 운영자 탭이면 운영자 탭 표시(진짜 창)를 보낸다. 답이 없으면 아무것도 보내지 않는다.
(function installKidItemDialogGuardBridge() {
  "use strict";
  const mark = (runTab) => window.postMessage({ kiditemDialogGuard: runTab ? "run-tab" : "operator-tab" }, location.origin);
  try {
    chrome.runtime.sendMessage({ action: "kiditem.dialogGuard.isRunTab" }, (answer) => {
      if (chrome.runtime.lastError) return;
      if (answer && typeof answer.runTab === "boolean") mark(answer.runTab);
    });
    // 런타임이 이 탭을 운영자에게 넘기거나(GS샵 SMS 인증·남긴 로그인 탭) 다시 쓸 때(리뷰 2 SHOULD 2·3).
    // 자기 메시지(setRunTab)만 받고 답하지 않는다 — 그 밖(페이지 호출 KIDITEM_PAGE_CALL 등)은 false로 곧바로 넘긴다(재QA 2 B1).
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.action === "kiditem.dialogGuard.setRunTab" && typeof message.runTab === "boolean") mark(message.runTab);
      return false;
    });
  } catch {
    // 확장이 다시 로드되는 중이다 — 운영자 탭처럼 둔다.
  }
})();
