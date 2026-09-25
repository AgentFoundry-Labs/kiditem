// 셀피아 송장 조회 페이지 처리기(MAIN world, KID-359 H3 — 옛 `scrapeSellpiaDeliTracking` 이식). 사이트
// `extensions/src/sites/sellpia`가 셀피아 탭(`order_delivery_reprint.html`)에 `page-call/runner.js`와 함께 주입하고
// `sellpia.shipmentTracking`을 부른다. 셀피아 세션 쿠키로 `delivery_link.action.html`에 한 번 POST하고, 줄인 행만
// 돌려준다(원본 응답·쿠키는 돌려주지 않는다). 판매처 필터는 화면이 몰별로 한다 — 전 몰 송장을 돌려준다.
(function installSellpiaShipmentTracking() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  function loginPage() {
    return /login/i.test(window.location.pathname) || Boolean(document.querySelector('input[type="password"]'));
  }

  function looksLikeHtml(text) {
    return /^\s*(?:<!doctype\s+html|<html|<form)/i.test(text) || /<input[^>]+type=["']?password/i.test(text);
  }

  calls["sellpia.shipmentTracking"] = async function sellpiaShipmentTracking(args) {
    if (loginPage()) return { status: "login_required" };
    const start = String(args && args.startDate);
    const end = String(args && args.endDate);
    // 송장번호채번일자 기준 — 채번 직후(출력 전) 주문도 잡힌다(print_datetime은 출력 전 주문을 놓친다).
    const body = new URLSearchParams({
      domode: "GET_ORDER_DELIVERY_REPRINT_LIST",
      date_type: "delinum_date",
      s_date: start,
      e_date: end,
      delinum: "",
      receiver: "",
      onlydeli_sellpia_code: "",
      pick_num: "",
    });
    const response = await fetch("delivery_link.action.html", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
    });
    if (!response.ok) return { status: "http_error", httpStatus: response.status };
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return looksLikeHtml(text) ? { status: "login_required" } : { status: "unexpected_response" };
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.list)) {
      return { status: "unexpected_response" };
    }
    const clean = (value) => String(value == null ? "" : value).trim();
    const rows = data.list
      .map((item) => {
        const ship = item.ship_info || {};
        return {
          ordNo: clean(ship.ord_no || String(item.group_no || "").split("_").pop() || ""),
          itemNo: "",
          invNo: clean(item.delinum),
          courier: clean(item.delicom), // 셀피아 택배사 코드(예 1136 = CJ)
          provider: clean(ship.provider_name || item.receiver), // 판매처명(몰 매핑용)
          receiver: clean(item.receiver).replace(/\([^)]*\)\s*$/, "").trim(), // 수취인(몰명 괄호 제거)
          post: clean(item.receiver_post),
          addr: [clean(item.receiver_addr1), clean(item.receiver_addr2)].filter(Boolean).join(" "),
        };
      })
      .filter((row) => row.ordNo && row.invNo);
    return { status: "ok", rows, total: data.list.length, range: { start, end } };
  };
})();
