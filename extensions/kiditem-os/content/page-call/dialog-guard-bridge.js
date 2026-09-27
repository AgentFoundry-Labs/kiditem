// 알림 창 가드의 ISOLATED 짝(document_start, KID-380 실기기 R1). 이 탭이 지금 실행이 쥔 수집 탭인지 런타임에 묻고
// (`kiditem.dialogGuard.isRunTab` — 런타임이 연 탭 목록으로 답한다), 수집 탭이면 같은 출처로 MAIN 가드(`dialog-guard.js`)에
// 표시를 보내 `confirm`을 자동 확인하게 한다. 운영자 탭이거나 답이 없으면 아무것도 보내지 않는다(진짜 `confirm`).
(function installKidItemDialogGuardBridge() {
  "use strict";
  try {
    chrome.runtime.sendMessage({ action: "kiditem.dialogGuard.isRunTab" }, (answer) => {
      if (chrome.runtime.lastError) return;
      if (answer && answer.runTab === true) window.postMessage({ kiditemDialogGuard: "run-tab" }, location.origin);
    });
  } catch {
    // 확장이 다시 로드되는 중이다 — 운영자 탭처럼 둔다.
  }
})();
