// 꼬망세(nstore.edupre.co.kr) 주문 엑셀 읽기(ISOLATED world, KID-380 — 옛 worker.js `scrapeKkomangseExport` 이식).
// 사이트 `extensions/src/sites/kkomangse`가 전체주문 목록 탭에 `page-call/bridge.js`와 함께 주입하고 `kkomangse.orders`를
// 부른다. 목록 폼(.form_list)을 직렬화해 `_mode=get_search_excel`로 같은 출처에서 xlsx를 받아 base64로 돌려준다.
// 읽기만 한다. 폼이 없고 비밀번호 칸이 보이면 로그인 화면이다(사이트가 실행 자격으로 한 번 로그인한다).
(function installKkomangseOrders() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  calls["kkomangse.orders"] = async function kkomangseOrders() {
    try {
      const form = document.querySelector(".form_list") || document.forms[0];
      if (!form) {
        if (document.querySelector('input[type="password"]')) {
          return {
            success: false,
            pendingLogin: true,
            errorCode: "login_required",
            error: "꼬망세 로그인이 필요합니다. nstore.edupre.co.kr 에 로그인한 뒤 다시 수집해 주세요.",
          };
        }
        return { success: false, error: "꼬망세 주문 폼을 찾지 못했습니다. nstore.edupre.co.kr 로그인을 확인하세요." };
      }
      const params = new URLSearchParams();
      for (const el of form.querySelectorAll("input[name],select[name],textarea[name]")) {
        if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
        params.append(el.name, el.value);
      }
      params.set("_mode", "get_search_excel");
      const action = form.getAttribute("action") || location.pathname;
      const res = await fetch(action + "?" + params.toString(), { credentials: "include" });
      if (!res.ok) return { success: false, error: "꼬망세 엑셀 다운로드 실패 (HTTP " + res.status + ")" };
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
        return { success: false, error: "엑셀이 아닌 응답입니다. nstore.edupre.co.kr 로그인이 필요할 수 있습니다." };
      }
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
      }
      return { success: true, xlsxBase64: btoa(bin), size: buf.length };
    } catch (e) {
      return { success: false, error: String((e && e.message) || e) };
    }
  };
})();
