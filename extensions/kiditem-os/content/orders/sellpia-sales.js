// 셀피아 판매현황 페이지 처리기(MAIN world, KID-361 J2 — 옛 `sellpia-sales-collector.js`의 `scrapeSellpiaSaleSummary`
// 이식). 사이트 `extensions/src/sites/sellpia`가 판매현황 화면(`sale_summary.html?mode=main_link`)을 새 백그라운드 탭으로
// 열고 `page-call/runner.js`와 함께 주입해 `sellpia.sales`를 부른다. 셀피아 세션 쿠키로 `order_search.ajax.html`에 기간
// 전체를 한 번 POST하고(판매처 all, 주문일자 기준), 판매처 이름은 화면 전역(`provider_list_all`)에서 찾아 판매처·일 줄로
// 편 값만 돌려준다(원본 응답·쿠키는 돌려주지 않는다). 형식이 조금이라도 다르면 한 줄도 돌려주지 않는다 — 빈 응답(`{}`)만
// 빈 판매현황이다.
(function installSellpiaSales() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  function loginPage() {
    return /login/i.test(window.location.pathname) || Boolean(document.querySelector('input[type="password"]'));
  }

  function looksLikeHtml(text) {
    return /^\s*(?:<!doctype\s+html|<html|<form)/i.test(text) || /<input[^>]+type=["']?password/i.test(text);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function isYmd(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function parseMetric(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(normalized)) return null;
    const parsed = Number(normalized.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function sellerNames() {
    const all = window.provider_list_all;
    const short = window.provider_list_s;
    return (id) => {
      if (all && Object.prototype.hasOwnProperty.call(all, id) && all[id]) return String(all[id]).trim();
      if (short && Object.prototype.hasOwnProperty.call(short, id) && short[id]) return String(short[id]).trim();
      return "";
    };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  calls["sellpia.sales"] = async function sellpiaSales(args) {
    if (loginPage()) return { status: "login_required" };
    const start = String(args && args.startDate);
    const end = String(args && args.endDate);
    if (!isYmd(start) || !isYmd(end) || start > end) return { status: "unexpected_response", reason: "invalid_range" };
    const body = new URLSearchParams({
      mode: "selldate", // 판매일자별 집계
      s_date: start,
      e_date: end,
      seller: "all",
      o_type: "",
      r_type: "",
      p_str: "",
      s_type: "1", // 주문일자 기준
      fs_type: "",
      nick_type: "",
      nick_str: "",
    });
    const response = await fetch("order_search.ajax.html", {
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
      return looksLikeHtml(text) ? { status: "login_required" } : { status: "unexpected_response", reason: "not_json" };
    }
    // 정상 응답은 `{ sellerId: { YYYY-MM-DD: metrics } }`다. 배열·null·오류 봉투를 빈 매출로 오인하면 창 바꿔 쓰기가
    // 기존 매출을 지우므로, plain object 밖은 한 줄도 받지 않는다.
    if (!isPlainObject(data)) return { status: "unexpected_response", reason: "not_object" };
    const sellerIds = Object.keys(data);
    if (sellerIds.length === 0) return { status: "ok", rows: [], sellers: 0 };

    // 판매처 이름표(`provider_list.js.html?mode=more`)는 크다 — 3초까지 기다린다(옛 규칙).
    for (let i = 0; i < 30 && typeof window.provider_list_all === "undefined"; i++) await sleep(100);
    const nameOf = sellerNames();
    const rows = [];
    for (const sellerId of sellerIds) {
      const sellerName = nameOf(sellerId);
      const dayMap = data[sellerId];
      if (!sellerId.trim() || sellerId.length > 64 || !sellerName || !isPlainObject(dayMap)) {
        return { status: "unexpected_response", reason: "unknown_seller" };
      }
      const dates = Object.keys(dayMap);
      if (dates.length === 0) return { status: "unexpected_response", reason: "seller_without_days" };
      for (const date of dates) {
        const metrics = dayMap[date];
        if (!isYmd(date) || date < start || date > end || !isPlainObject(metrics)) {
          return { status: "unexpected_response", reason: "invalid_day" };
        }
        if (!("price" in metrics) || !("amount" in metrics) || !("buy_price" in metrics)) {
          return { status: "unexpected_response", reason: "missing_metric" };
        }
        const price = parseMetric(metrics.price);
        const amount = parseMetric(metrics.amount);
        const buyPrice = parseMetric(metrics.buy_price);
        if (price === null || amount === null || buyPrice === null) return { status: "unexpected_response", reason: "invalid_metric" };
        rows.push({ sellerId: String(sellerId), sellerName, date, price, amount, buyPrice });
      }
    }
    return { status: "ok", rows, sellers: sellerIds.length };
  };
})();
