// 셀피아 상품별 이익현황 페이지 처리기(MAIN world, KID-361 J3 — 옛 `sellpia-product-profit-collector.js`의
// `scrapeSellpiaProductProfit` 이식). 사이트 `extensions/src/sites/sellpia`가 이익현황 화면(`stat_prd_profit.html`)을 새
// 백그라운드 탭으로 열고 `page-call/runner.js`와 함께 주입해 `sellpia.profitRows`를 판매 창 한 번 + 달마다 구매기간 한 번
// 부른다. 한 번 부를 때 셀피아 세션 쿠키로 `stat_action.ajax.html`에 한 번 POST하고(판매 창은 고정, 구매기간만 바꾼다),
// 상품 줄을 옛 규칙대로 검증·정리해 돌려준다. 판매 창과 구매기간의 대조·조립은 수집기가 한다.
(function installSellpiaProfit() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});
  const MAX_ROWS = 20000;
  const INT4_MAX = 2147483647;

  function loginPage() {
    return /login/i.test(window.location.pathname) || Boolean(document.querySelector('input[type="password"]'));
  }

  function looksLikeHtml(text) {
    return /^\s*(?:<!doctype\s+html|<html|<form)/i.test(text) || /<input[^>]+type=["']?password/i.test(text);
  }

  const pad = (n) => String(n).padStart(2, "0");
  const toYmd = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

  function toValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(timestamp)) return null;
    const parsed = new Date(timestamp);
    return parsed.toISOString().slice(0, 10) === value ? parsed : null;
  }

  function int(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= INT4_MAX ? parsed : null;
  }

  function signedInt(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !/^-?\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= -2147483648 && parsed <= INT4_MAX ? parsed : null;
  }

  function boundedString(value, max, allowEmpty) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const normalized = String(value).trim();
    if ((!allowEmpty && !normalized) || normalized.length > max) return null;
    return normalized;
  }

  function addInt(left, right) {
    return int(left + right);
  }

  class InvalidResponse extends Error {}

  function createGraphKeyReader(startValue, endValue) {
    return (key) => {
      const value = String(key);
      const monthMatch = value.match(/^(\d{4})-(\d{1,2})$/);
      if (monthMatch) {
        const month = Number(monthMatch[2]);
        if (month < 1 || month > 12) return null;
        return { kind: "month", yearMonth: `${monthMatch[1]}-${pad(month)}` };
      }
      const fullDateMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const shortDateMatch = value.match(/^(\d{1,2})[/-](\d{1,2})$/);
      const yearCandidates = fullDateMatch
        ? [Number(fullDateMatch[1])]
        : shortDateMatch
          ? Array.from({ length: endValue.getUTCFullYear() - startValue.getUTCFullYear() + 1 }, (_, offset) => startValue.getUTCFullYear() + offset)
          : [];
      const month = Number(fullDateMatch ? fullDateMatch[2] : shortDateMatch ? shortDateMatch[1] : NaN);
      const day = Number(fullDateMatch ? fullDateMatch[3] : shortDateMatch ? shortDateMatch[2] : NaN);
      if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return null;
      const candidates = yearCandidates
        .map((year) => new Date(Date.UTC(year, month - 1, day)))
        .filter((date) => date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date >= startValue && date <= endValue);
      if (candidates.length !== 1) return null;
      const date = candidates[0];
      return { kind: "day", date: toYmd(date), yearMonth: date.toISOString().slice(0, 7) };
    };
  }

  // 옛 `parseRows` 그대로: 상품·옵션이 겹치거나 그래프 키가 창 밖이거나 값이 틀리면 전체를 거절한다. 판매만 음수인
  // 금융 조정 줄(`할인`)만 빼고 센다. 월 판매 합이 셀피아 상단 합계와 같아야 한다.
  function parseRows(rows, rangeMonths, readGraphKey) {
    const products = [];
    const identities = new Set();
    let skippedAdjustmentCount = 0;
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new InvalidResponse();
      const productCode = boundedString(row.product_code, 64, false);
      const optionCode = boundedString(row.option_code == null ? "" : row.option_code, 64, true);
      const productName = boundedString(row.product_name, 400, false);
      const salePrice = row.sale_price == null || row.sale_price === "" ? 0 : int(row.sale_price);
      const buyPrice = row.buy_price == null || row.buy_price === "" ? 0 : int(row.buy_price);
      const barcode = row.dp_code == null || row.dp_code === "" ? undefined : boundedString(row.dp_code, 64, false);
      if (!productCode || optionCode === null || !productName || salePrice === null || buyPrice === null || barcode === null) {
        throw new InvalidResponse();
      }
      const identity = `${productCode}\u0000${optionCode}`;
      if (identities.has(identity)) throw new InvalidResponse();
      identities.add(identity);
      const graph = row.graph;
      if (!graph || typeof graph !== "object" || Array.isArray(graph)) throw new InvalidResponse();
      const rawMonthValues = [];
      const nativeGraphKeys = new Set();
      let graphKind = null;
      for (const key of Object.keys(graph)) {
        const graphKey = readGraphKey(key);
        const nativeKey = graphKey && graphKey.kind === "day" ? `day:${graphKey.date}` : `month:${graphKey && graphKey.yearMonth}`;
        if (!graphKey || !rangeMonths.has(graphKey.yearMonth) || nativeGraphKeys.has(nativeKey)
          || (graphKind !== null && graphKind !== graphKey.kind) || typeof graph[key] !== "string") {
          throw new InvalidResponse();
        }
        graphKind = graphKey.kind;
        nativeGraphKeys.add(nativeKey);
        const parts = graph[key].split(",");
        if (parts.length !== 3) throw new InvalidResponse();
        const inAmount = signedInt(parts[0]);
        const orderAmount = signedInt(parts[1]);
        const orderQty = signedInt(parts[2]);
        if (inAmount === null || orderAmount === null || orderQty === null) throw new InvalidResponse();
        rawMonthValues.push({ yearMonth: graphKey.yearMonth, inAmount, orderAmount, orderQty });
      }
      const pureFinancialAdjustment = salePrice === 0 && buyPrice === 0 && barcode === undefined
        && rawMonthValues.some((month) => month.orderAmount < 0)
        && rawMonthValues.every((month) => month.inAmount === 0 && month.orderAmount <= 0 && month.orderQty >= 0);
      if (pureFinancialAdjustment) {
        skippedAdjustmentCount += 1;
        continue;
      }
      const monthValues = new Map();
      for (const month of rawMonthValues) {
        if (month.inAmount < 0 || month.orderAmount < 0 || month.orderQty < 0) throw new InvalidResponse();
        const previous = monthValues.get(month.yearMonth);
        if (!previous) {
          monthValues.set(month.yearMonth, { inAmount: month.inAmount, orderAmount: month.orderAmount, orderQty: month.orderQty });
          continue;
        }
        const inAmount = addInt(previous.inAmount, month.inAmount);
        const orderAmount = addInt(previous.orderAmount, month.orderAmount);
        const orderQty = addInt(previous.orderQty, month.orderQty);
        if (inAmount === null || orderAmount === null || orderQty === null) throw new InvalidResponse();
        monthValues.set(month.yearMonth, { inAmount, orderAmount, orderQty });
      }
      let graphOrderAmount = 0;
      let graphOrderQty = 0;
      for (const month of monthValues.values()) {
        graphOrderAmount = addInt(graphOrderAmount, month.orderAmount);
        graphOrderQty = addInt(graphOrderQty, month.orderQty);
        if (graphOrderAmount === null || graphOrderQty === null) throw new InvalidResponse();
      }
      const totalOrderAmount = int(row.total_order_amount);
      const totalOrderQty = int(row.total_order_qty);
      const totalInAmount = int(row.total_in_amount);
      const totalInQty = int(row.total_in_qty);
      if (totalOrderAmount === null || totalOrderQty === null || totalInAmount === null || totalInQty === null
        || graphOrderAmount !== totalOrderAmount || graphOrderQty !== totalOrderQty) {
        throw new InvalidResponse();
      }
      products.push({
        productCode,
        optionCode,
        productName,
        ...(row.option_name ? { optionName: String(row.option_name) } : {}),
        ...(row.provider_name ? { providerName: String(row.provider_name) } : {}),
        salePrice,
        buyPrice,
        ...(barcode === undefined ? {} : { barcode }),
        months: [...monthValues.entries()].map(([yearMonth, values]) => ({ yearMonth, ...values })),
        totalOrderAmount,
        totalOrderQty,
        totalInAmount,
        totalInQty,
      });
    }
    return { products, skippedAdjustmentCount };
  }

  calls["sellpia.profitRows"] = async function sellpiaProfitRows(args) {
    if (loginPage()) return { status: "login_required" };
    const start = String(args && args.start);
    const end = String(args && args.end);
    const purchaseStart = String(args && args.purchaseStart);
    const purchaseEnd = String(args && args.purchaseEnd);
    const startValue = toValidDate(start);
    const endValue = toValidDate(end);
    if (!startValue || !endValue || startValue > endValue || !toValidDate(purchaseStart) || !toValidDate(purchaseEnd)) {
      return { status: "unexpected_response", reason: "invalid_range" };
    }
    const rangeMonths = new Set();
    for (let index = startValue.getUTCFullYear() * 12 + startValue.getUTCMonth(); index <= endValue.getUTCFullYear() * 12 + endValue.getUTCMonth(); index += 1) {
      rangeMonths.add(`${Math.floor(index / 12)}-${pad(index % 12 + 1)}`);
    }
    const body = new URLSearchParams({
      mode: "stat_prd_profit",
      // 판매 창은 401일 그대로 두고 구매기간만 달마다 좁힌다(옛 규칙).
      s_date: start,
      e_date: end,
      in_s_date: purchaseStart,
      in_e_date: purchaseEnd,
      buy_point: "R",
      provider: "",
      vat_tp: "1",
      p_str: "",
      period_free: "false",
      prd_cate: "",
      prd_type: "",
    });
    const response = await fetch("stat_action.ajax.html", {
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
    if (!Array.isArray(data) || data.length > MAX_ROWS) return { status: "unexpected_response", reason: "not_list" };
    try {
      const parsed = parseRows(data, rangeMonths, createGraphKeyReader(startValue, endValue));
      return { status: "ok", products: parsed.products, skippedAdjustmentCount: parsed.skippedAdjustmentCount };
    } catch (error) {
      if (error instanceof InvalidResponse) return { status: "unexpected_response", reason: "invalid_row" };
      throw error;
    }
  };
})();
