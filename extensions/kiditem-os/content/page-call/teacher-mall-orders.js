// 티쳐몰(shop.teacherville.co.kr selleradmin) 출고 전 주문 엑셀(MAIN world, KID-380 — 옛 worker.js `scrapeTeachervilleOrders` 이식).
// 사이트 `extensions/src/sites/teacher-mall`이 주문상품 목록(order/catalog) 탭에 `page-call/runner.js`와 함께 주입하고
// `teacher-mall.orders`를 부른다. 페이지 컨텍스트(jQuery·로그인 세션 쿠키)에서 출고 전(25·35·40·45) 행의 order_seq로
// `order_process/excel_down`을 POST해 셀피아 양식(엑셀 양식 `templateSeq`) SpreadsheetML(.xls)을 base64로 돌려준다.
// 양식 번호·입점사 기본값·다운로드 사유는 사이트 모듈의 몰 상수를 인자로 받는다(옛 값 117·708·"배송준비확인"). 읽기만 한다.
(function installTeacherMallOrders() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  calls["teacher-mall.orders"] = async function teacherMallOrders(args) {
    const templateSeq = String(args?.templateSeq || "");
    const fallbackProviderSeq = String(args?.fallbackProviderSeq || "");
    const downloadReason = String(args?.downloadReason || "");

    try {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const loginRequired = () => ({
        success: false,
        pendingLogin: true,
        errorCode: "login_required",
        error: "티쳐몰 로그인이 필요합니다. selleradmin에 로그인한 뒤 다시 수집해주세요.",
      });
      const providerContractChanged = (message) => ({
        success: false,
        errorCode: "provider_contract_changed",
        error: message,
      });
      const pageLooksLikeLogin = () => {
        const bodyText = document.body ? document.body.innerText || "" : "";
        const href = typeof location !== "undefined" ? String(location.href || "") : "";
        return (
          /login|로그인|세션.*(?:만료|없)/i.test(bodyText + " " + href)
          || Boolean(document.querySelector('input[type="password"]'))
        );
      };
      // 페이지/jQuery/엑셀폼 로딩 대기
      for (let i = 0; i < 30 && !(document.querySelector("form#excel_down_form") && (window.$ || window.jQuery)); i += 1) {
        await sleep(300);
      }
      const form = document.querySelector("form#excel_down_form");
      if (!form) {
        return pageLooksLikeLogin()
          ? loginRequired()
          : providerContractChanged("티쳐몰 주문 다운로드 폼을 찾지 못했습니다. 주문관리 화면 구조를 확인해주세요.");
      }
      // 목록(catalog_ajax)이 채워질 때까지 잠깐 더 대기 — 주문 행 체크박스가 지연 렌더된다.
      for (let i = 0; i < 20 && document.querySelectorAll('input[type="checkbox"][name="order_seq[]"]').length === 0; i += 1) {
        await sleep(300);
      }
      // 출고 전 상태 행(25 결제확인·35 상품준비·40 부분출고준비·45 출고준비)의 order_seq[] 수집.
      // 55 출고완료부터는 이미 출고된 주문이라 제외. (tr class 예: "list-row step25")
      const PRE_SHIP = ["25", "35", "40", "45"];
      const orderCheckboxes = document.querySelectorAll(
        'input[type="checkbox"][name="order_seq[]"]',
      );
      const seqs = [];
      orderCheckboxes.forEach((c) => {
        const tr = c.closest("tr");
        const step = ((tr && tr.className) || "").match(/step(\d+)/);
        if (step && PRE_SHIP.includes(step[1]) && c.value) seqs.push(c.value);
      });
      if (seqs.length === 0) {
        if (pageLooksLikeLogin()) return loginRequired();
        // 주문 행이 렌더된 것 자체가 인증된 목록이 로딩됐다는 증거다. 그 목록에 출고 전
        // (25/35/40/45) 행이 하나도 없으면 수집할 주문이 없는 것이지 로딩 실패가 아니다.
        // 전부 출고완료(55+)인 날에 이걸 오류로 처리해 "로딩 완료 여부를 확인하지 못했다"가 떴다.
        if (orderCheckboxes.length > 0) return { success: true, empty: true, rowCount: 0 };
        const bodyText = document.body ? document.body.innerText || "" : "";
        if (/조회[^\n]{0,30}(?:주문|결과|데이터)[^\n]{0,20}(?:없|0건)|(?:주문|결과|데이터)[^\n]{0,30}(?:없|0건)/i.test(bodyText)) {
          return { success: true, empty: true, rowCount: 0 };
        }
        // 여기까지 오면 행도 없고 "없음" 문구도 못 읽은 것 — 진짜로 판정 불가다.
        return providerContractChanged(
          "티쳐몰 주문 목록의 로딩 완료 여부를 확인하지 못했습니다. 주문관리 화면을 새로고침한 뒤 다시 수집해주세요.",
        );
      }
      // excel_down: 양식 117(티쳐몰 주문서) + 체크박스 order_seq 파이프 목록 + 다운로드 사유(5~50자).
      // excel_provider_seq(입점사 seq)/ship_set 은 폼 히든값을 그대로 사용. excel_type/step/params 는 보내지 않는다.
      const providerSeq = (form.querySelector('input[name="excel_provider_seq"]') || {}).value || fallbackProviderSeq;
      const shipSet = (form.querySelector('[name="excel_ship_set_code"]') || {}).value || "";
      const body = new URLSearchParams();
      body.set("order_seq", seqs.join("|") + "|");
      body.set("seq", templateSeq);
      body.set("excel_provider_seq", providerSeq);
      body.set("excel_ship_set_code", shipSet);
      body.set("download_reason_select", "direct");
      body.set("download_reason_text", downloadReason);
      body.set("download_reason", downloadReason);
      const res = await fetch("/selleradmin/order_process/excel_down", {
        method: "POST",
        credentials: "include",
        body,
      });
      if (res.status === 401 || res.status === 403 || /login/i.test(String(res.url || ""))) {
        return loginRequired();
      }
      if (!res.ok) {
        return providerContractChanged("티쳐몰 엑셀 다운로드 응답을 확인하지 못했습니다 (HTTP " + res.status + ").");
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 100) {
        const responseText = new TextDecoder().decode(buf);
        if (/login|로그인|세션.*(?:만료|없)|type=["']?password/i.test(responseText)) {
          return loginRequired();
        }
        if (/(?:주문|결과|데이터)[^\n]{0,30}(?:없|0건)|no\s*(?:orders?|data)/i.test(responseText)) {
          return { success: true, empty: true, rowCount: 0 };
        }
        return providerContractChanged("티쳐몰 엑셀 응답 형식을 확인하지 못했습니다.");
      }
      // SpreadsheetML(XML) 텍스트 → base64 그대로 전달 (백엔드 SheetJS 가 파싱). btoa 는 latin1 바이트 기준.
      let bin = "";
      const CH = 0x8000;
      for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
      return { success: true, xlsxBase64: btoa(bin), fileName: "티쳐몰.xls", size: buf.length, orderCount: seqs.length };
    } catch (e) {
      const message = String((e && e.message) || e);
      return {
        success: false,
        errorCode: /failed to fetch|networkerror|network request failed|load failed/i.test(message)
          ? "network_failed"
          : "unknown_failure",
        error: /failed to fetch|networkerror|network request failed|load failed/i.test(message)
          ? "티쳐몰 주문 수집 요청에 실패했습니다. 네트워크 상태를 확인해주세요."
          : message,
      };
    }
  };
})();
