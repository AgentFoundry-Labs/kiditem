// 셀피아 재고 목록 페이지 처리기(MAIN world, KID-361 J1 — 옛 `orders/sellpia-inventory.js`의
// `requestSellpiaInventorySnapshot` 이식). 사이트 `extensions/src/sites/sellpia`가 상품 목록 화면
// (`product_list_total.html`)을 새 백그라운드 탭으로 열고 `page-call/runner.js`와 함께 주입해 `sellpia.inventory`를 부른다.
// 셀피아 세션 쿠키로 `product_search.ajax.html`에 전체 목록(`limit: "0"`)을 한 번 POST하고, 옛 규칙대로 줄인 행만
// 상품·옵션 코드 순으로 돌려준다(원본 응답·쿠키는 돌려주지 않는다). 실패는 첫 시도만 한 번 더 한다(옛 규칙).
(function installSellpiaInventory() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});
  const POSTGRES_INTEGER_MAX = 2_147_483_647;
  const EXPECTED_PAGE_PATH = "/product_list_total.html";
  const SNAPSHOT_PATH = "/product_search.ajax.html";

  function textValue(value, allowEmpty) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).trim();
    if (normalized) return normalized;
    return allowEmpty ? "" : null;
  }

  function integerValue(value, optional) {
    const normalized = textValue(value, true);
    if (normalized === null || normalized === "") return optional ? null : undefined;
    const digits = normalized.replace(/,/g, "");
    if (!/^\d+$/.test(digits)) return undefined;
    const parsed = Number(digits);
    if (!Number.isSafeInteger(parsed) || parsed > POSTGRES_INTEGER_MAX) return undefined;
    return parsed;
  }

  function normalizeRow(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const productCode = textValue(value.product_code, false);
    const optionCode = value.option_code == null ? "" : textValue(value.option_code, true);
    const name = value.p_title == null ? "" : textValue(value.p_title, true);
    const currentStock = integerValue(value.stock_cnt, false);
    const purchasePrice = integerValue(value.buy_price, true);
    const salePrice = integerValue(value.sale_price, true);
    if (
      productCode === null
      || optionCode === null
      || name === null
      || currentStock === undefined
      || purchasePrice === undefined
      || salePrice === undefined
    ) return null;
    const optionName = textValue(value.option_title, false);
    const barcode = textValue(value.barcode, false);
    if (
      productCode.length > 100
      || optionCode.length > 100
      || name.length > 500
      || (optionName ? optionName.length : 0) > 500
      || (barcode ? barcode.length : 0) > 100
    ) return null;
    return { productCode, optionCode, name, optionName, barcode, currentStock, purchasePrice, salePrice };
  }

  function looksLikeLogin(text) {
    const prefix = text.slice(0, 1024);
    return /^\s*(?:<!doctype\s+html|<html|<form)/i.test(prefix) || /<input[^>]+type=["']?password/i.test(prefix);
  }

  function loginPage() {
    return /login/i.test(window.location.pathname)
      || window.location.pathname !== EXPECTED_PAGE_PATH
      || Boolean(document.querySelector('input[type="password"]'));
  }

  function identity(row) {
    return `${row.productCode}-${row.optionCode}`;
  }

  async function readOnce(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const body = new URLSearchParams({
        mode: "soldout_manager",
        search_type: "1",
        search_key: "",
        search_key2: "",
        search_key3: "",
        search_key4: "",
        soldout_include: "Y",
        discontinued_include: "N",
        prd_type_req: "",
        prd_cate_req: "",
        market_type_req: "",
        limit: "0",
      });
      const response = await fetch(SNAPSHOT_PATH, { method: "POST", credentials: "include", body, signal: controller.signal });
      let responseUrl;
      try {
        responseUrl = new URL(response.url || SNAPSHOT_PATH, window.location.origin);
      } catch {
        return { status: "unexpected_response", reason: "response_url" };
      }
      if (
        response.status === 401
        || response.status === 403
        || response.redirected
        || responseUrl.origin !== window.location.origin
        || responseUrl.pathname !== SNAPSHOT_PATH
      ) return { status: "login_required" };
      if (!response.ok) return { status: "http_error", httpStatus: response.status };
      const text = await response.text();
      if (text.length > options.maxBytes) return { status: "unexpected_response", reason: "too_large" };
      if (looksLikeLogin(text)) return { status: "login_required" };
      let rawRows;
      try {
        rawRows = JSON.parse(text);
      } catch {
        return { status: "unexpected_response", reason: "not_json" };
      }
      if (!Array.isArray(rawRows)) return { status: "unexpected_response", reason: "not_list" };
      if (rawRows.length < 1) return { status: "unexpected_response", reason: "empty" };
      if (rawRows.length > options.maxRows) return { status: "unexpected_response", reason: "too_many_rows" };
      const rows = [];
      const seen = new Set();
      for (const rawRow of rawRows) {
        const row = normalizeRow(rawRow);
        if (!row) return { status: "unexpected_response", reason: "invalid_row" };
        const key = identity(row);
        if (seen.has(key)) return { status: "unexpected_response", reason: "duplicate_row" };
        seen.add(key);
        rows.push(row);
      }
      rows.sort((left, right) => (identity(left) < identity(right) ? -1 : identity(left) > identity(right) ? 1 : 0));
      return { status: "ok", rows };
    } catch (error) {
      if (error && error.name === "AbortError") return { status: "timeout" };
      return { status: "network_error" };
    } finally {
      clearTimeout(timer);
    }
  }

  calls["sellpia.inventory"] = async function sellpiaInventory(args) {
    if (loginPage()) return { status: "login_required" };
    const options = {
      timeoutMs: Number(args && args.timeoutMs) || 45_000,
      maxRows: Number(args && args.maxRows) || 20_000,
      maxBytes: Number(args && args.maxBytes) || 10 * 1024 * 1024,
    };
    const first = await readOnce(options);
    // 옛 수집기: HTTP 오류·연결 실패만 한 번 더 시도한다(로그인·형식·시간 초과는 곧바로 끝낸다).
    if (first.status === "http_error" || first.status === "network_error") return readOnce(options);
    return first;
  };
})();
