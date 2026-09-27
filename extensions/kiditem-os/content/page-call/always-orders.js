// 올웨이즈(alwayzseller.ilevit.com) 팀모집완료 주문 엑셀(MAIN world, KID-380 — 옛 worker.js `scrapeAlwayzOrders` 이식).
// 사이트 `extensions/src/sites/always`가 배송관리 탭에 `page-call/runner.js`와 함께 주입하고 `always.orders`를 부른다.
// 판매자 토큰(localStorage JWT)으로 pre-excel API의 신규 주문 수를 보고(0이면 인증된 빈 수집), 페이지의
// `URL.createObjectURL`을 가로채(그래서 MAIN world) 엑셀추출하기로 앱이 조립한 xlsx blob을 base64로 돌려준다. 토큰은 이
// 페이지의 요청 머리글에만 쓰고 돌려주지 않는다. 읽기만 한다.
(function installAlwaysOrders() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  calls["always.orders"] = async function alwaysOrders() {

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (fn, timeout, interval) => {
      const end = Date.now() + (timeout || 20000);
      while (Date.now() < end) {
        let v;
        try {
          v = fn();
        } catch (e) {
          v = null;
        }
        if (v) return v;
        await sleep(interval || 300);
      }
      return null;
    };
    const btnByText = (txt, scope) =>
      Array.from((scope || document).querySelectorAll("button, a")).find(
        (b) => (b.textContent || "").replace(/\s+/g, "").includes(txt.replace(/\s+/g, "")) && b.offsetParent !== null,
      ) || null;
    try {
      // 0) 엑셀추출하기 버튼 뜰 때까지 SPA 렌더 대기
      const exBtn = await waitFor(() => btnByText("엑셀추출하기"), 30000, 400);
      if (!exBtn) {
        const bodyText = document.body ? document.body.innerText || "" : "";
        const href = typeof location !== "undefined" ? String(location.href || "") : "";
        if (
          /login|로그인|세션.*(?:만료|없)/i.test(bodyText + " " + href)
          || document.querySelector('input[type="password"]')
        ) {
          return {
            success: false,
            pendingLogin: true,
            errorCode: "login_required",
            error: "올웨이즈 로그인이 필요합니다. 로그인한 뒤 다시 수집해주세요.",
          };
        }
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: "올웨이즈 배송관리 화면에서 엑셀추출하기 버튼을 찾지 못했습니다.",
        };
      }
      // 1) pre-excel API 로 신규주문(엑셀추출 이전) 건수 확인 (0이면 추출 안 함)
      const token = localStorage.getItem("@alwayz@seller@token@") || "";
      if (!token) {
        return {
          success: false,
          pendingLogin: true,
          errorCode: "login_required",
          error: "올웨이즈 로그인 세션이 없습니다. 로그인한 뒤 다시 수집해주세요.",
        };
      }
      let preResponse;
      try {
        preResponse = await fetch("https://alwayz-seller-back.ilevit.com/sellers/items/pre-shipping/pre-excel", {
          headers: { "x-access-token": token },
        });
      } catch (e) {
        return {
          success: false,
          errorCode: "network_failed",
          error: "올웨이즈 신규 주문 조회 요청에 실패했습니다. 네트워크 상태를 확인해주세요.",
        };
      }
      if (preResponse.status === 401 || preResponse.status === 403) {
        return {
          success: false,
          pendingLogin: true,
          errorCode: "login_required",
          error: "올웨이즈 로그인 세션이 만료되었습니다. 다시 로그인한 뒤 수집해주세요.",
        };
      }
      if (!preResponse.ok) {
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: `올웨이즈 신규 주문 조회 응답을 확인하지 못했습니다 (HTTP ${preResponse.status}).`,
        };
      }
      let pre;
      try {
        pre = await preResponse.json();
      } catch (e) {
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: "올웨이즈 신규 주문 조회 응답 형식이 변경되었습니다.",
        };
      }
      if (!pre || !Array.isArray(pre.data)) {
        const message = String((pre && (pre.message || pre.error || pre.msg)) || "");
        if (/login|로그인|token|토큰|unauthori|세션/i.test(message)) {
          return {
            success: false,
            pendingLogin: true,
            errorCode: "login_required",
            error: "올웨이즈 로그인 세션을 확인하지 못했습니다. 다시 로그인한 뒤 수집해주세요.",
          };
        }
        return {
          success: false,
          errorCode: "provider_contract_changed",
          error: "올웨이즈 신규 주문 조회 데이터 형식이 변경되었습니다.",
        };
      }
      const cnt = pre.data.length;
      if (cnt === 0) return { success: true, empty: true, rowCount: 0 }; // 인증된 팀모집완료 신규주문 없음
      // 2) createObjectURL 후킹 (클라이언트 조립 xlsx blob 캡처)
      const blobs = [];
      const origCOU = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (obj) {
        try {
          if (obj instanceof Blob) blobs.push(obj);
        } catch (e) {
          /* noop */
        }
        return origCOU(obj);
      };
      // 3) 엑셀추출하기 클릭 → (확인 모달 있으면 확인)
      (btnByText("엑셀추출하기") || exBtn).click();
      await sleep(900);
      const confirm = Array.from(document.querySelectorAll("[role=dialog] button, .modal button, button")).find(
        (b) => /^(확인|추출|다운로드|네|예)$/.test((b.textContent || "").trim()) && b.offsetParent !== null,
      );
      if (confirm) confirm.click();
      // 4) 조립된 xlsx blob 대기 (최대 60초)
      const blob = await waitFor(() => (blobs.length ? blobs[blobs.length - 1] : null), 60000, 500);
      URL.createObjectURL = origCOU; // 후킹 원복
      if (!blob) {
        return { success: false, error: "올웨이즈 엑셀 추출(다운로드)에 실패했습니다." };
      }
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
      return { success: true, xlsxBase64: btoa(bin), fileName: "올웨이즈.xlsx", size: buf.length };
    } catch (e) {
      return { success: false, error: String((e && e.message) || e) };
    }
  };
})();
