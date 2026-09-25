// 도매꾹 주문 엑셀 생성 요청(MAIN world, KID-359 H3 — 옛 worker.js `triggerDomeggookExcelGen` 이식). 사이트
// `extensions/src/sites/domeggook`이 기간을 그날로 맞춘 주문목록(lstAll) 탭에 `page-call/runner.js`와 함께 주입하고
// `domeggook.requestExcel`을 부른다. "엑셀다운로드"를 눌러 생성요청 모달(iframe#gLayerFrame, 같은 출처)을 제출한다.
// 주문이 없으면 도매꾹이 native alert("…없습니다")를 띄우고 모달을 열지 않는다 — alert를 가로채 "empty"로 답한다
// (페이지의 window.alert를 바꿔야 해서 MAIN world다). 엑셀은 도매꾹 서버가 비동기로 만든다 — 파일은 사이트가 받는다.
(function installDomeggookRequestExcel() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  calls["domeggook.requestExcel"] = async function domeggookRequestExcel() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // 주문이 없으면 도매꾹은 "다운로드할 주문내역이 없습니다" 류 native alert 를 띄우고 생성 모달을
    // 열지 않는다. alert 를 가로채 '주문 없음(empty)'으로 정상 처리한다(주문이 있으면 alert 는 안 뜬다).
    // window 가 없는 테스트/비브라우저 환경을 방어한다(MAIN world 에서는 항상 존재).
    const win = typeof window !== "undefined" ? window : null;
    const origAlert = win ? win.alert : null;
    let alertMsg = "";
    if (win) {
      win.alert = (m) => {
        alertMsg = String(m == null ? "" : m);
      };
    }
    const emptyByAlert = () => /없습니다|없음|no\s*(order|data|result)/i.test(alertMsg);
    try {
      const btn = [
        ...document.querySelectorAll(
          "#lList a, #lList button, #lList input[type='button'], #lList [role='button'], #lList [onclick]",
        ),
      ].find(
        (element) =>
          String(element.textContent || element.value || "").replace(/\s+/g, "") ===
          "엑셀다운로드",
      );
      if (!btn) return { status: "failed", error: "엑셀다운로드 버튼을 찾지 못했습니다. (로그인/화면 확인)" };
      btn.click();
      await sleep(300);
      if (emptyByAlert()) return { status: "empty", message: alertMsg };
      let doc = null;
      let modalSeen = false;
      for (let i = 0; i < 25; i++) {
        await sleep(300);
        if (emptyByAlert()) return { status: "empty", message: alertMsg };
        const iframe = document.querySelector("iframe#gLayerFrame, #gLayerFrame iframe");
        try {
          if (iframe?.contentDocument) {
            modalSeen = true;
          }
          if (iframe?.contentDocument?.querySelector("#lXlsReqNoticeBtnSubmit")) {
            doc = iframe.contentDocument;
            if (iframe.contentWindow) {
              iframe.contentWindow.confirm = () => true; // 혹시 모를 confirm 자동 승인
              iframe.contentWindow.alert = () => {};
            }
            break;
          }
          const dialog = document.querySelector("#gLayerFrame:not(iframe), [role='dialog']");
          if (dialog) modalSeen = true;
          if (dialog?.querySelector("#lXlsReqNoticeBtnSubmit")) {
            doc = document;
            break;
          }
        } catch (e) {
          /* 로딩 중 접근 예외 — 무시하고 재시도 */
        }
      }
      if (emptyByAlert()) return { status: "empty", message: alertMsg };
      if (!modalSeen) return { status: "failed", error: "도매꾹 생성 요청 모달을 열지 못했습니다." };
      const submit = doc?.querySelector("#lXlsReqNoticeBtnSubmit");
      if (!submit) {
        if (emptyByAlert()) return { status: "empty", message: alertMsg };
        return { status: "failed", error: "도매꾹 생성 요청 버튼을 찾지 못했습니다." };
      }
      submit.click();
      return { status: "requested" };
    } catch (e) {
      return { status: "failed", error: String((e && e.message) || e) };
    } finally {
      if (win) win.alert = origAlert;
    }
  };
})();
