// KIDITEM OS — Wing business-insights read transport
//
// This file is intentionally page-local.  It reads only the fixed, observed
// Wing traffic endpoints and never exposes the page's XSRF token through an
// extension message, storage, or a caller-supplied URL.

(function installWingReadApi(root) {
  "use strict";

  const DETAIL_PATH =
    "/tenants/rfm-ss/api/business-insight/vi-detail-search";
  const SUMMARY_PATH =
    "/tenants/rfm-ss/api/business-insight/vendor-summary";
  const METADATA_PATH =
    "/tenants/rfm-ss/api/metadata/business-insights";
  const PAGE_SIZE = 100;
  const MAX_PAGES = 100;
  const REQUEST_TIMEOUT_MS = 30_000;
  const REGISTRATION_TYPES = Object.freeze(["NORMAL", "RFM"]);
  const TRAFFIC_FILTER_SCOPE = "ALL_NORMAL_RFM";
  const TRAFFIC_SEQUENCE_PAGE_BASE = 100;
  const TRAFFIC_TOTAL_FIELDS = Object.freeze([
    ["visitors", "totalUniqueVisitor"],
    ["views", "totalPageViews"],
    ["cartAdds", "totalAddToCart"],
    ["orders", "totalOrders"],
    ["salesQty", "totalUnitsSold"],
    ["revenue", "totalGmv"],
  ]);
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function record(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function failure(errorCode, error, extra = {}) {
    return {
      success: false,
      errorCode,
      error,
      ...extra,
    };
  }

  function finiteNumber(value, field, { integer = false } = {}) {
    const number = typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
    if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) {
      throw new Error(`invalid_${field}`);
    }
    return number;
  }

  function positiveId(value, field) {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`invalid_${field}`);
      }
      return String(value);
    }
    if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
      throw new Error(`invalid_${field}`);
    }
    const normalized = value.trim();
    try {
      if (BigInt(normalized) <= 0n) throw new Error(`invalid_${field}`);
    } catch {
      throw new Error(`invalid_${field}`);
    }
    return normalized;
  }

  function dateText(value) {
    if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
      ? value
      : null;
  }

  // Wing's date-range controls use Korea business dates.  Metadata timestamps
  // are UTC instants, so compare them after applying the KST offset.
  function koreaDate(value) {
    let timestamp = value;
    if (typeof value === "string" && DATE_PATTERN.test(value)) {
      timestamp = Date.parse(`${value}T00:00:00Z`);
    } else if (typeof value === "string") {
      timestamp = Date.parse(value);
    }
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
    return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function rangeFromControl(control) {
    const plan = control?.plan;
    const startDate = dateText(plan?.startDate);
    const endDate = dateText(plan?.endDate);
    if (!startDate || !endDate) {
      return failure("TRAFFIC_DATE_RANGE_INVALID", "Wing 트래픽 owner 날짜 범위가 유효하지 않습니다.");
    }
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    const periodDays = Math.round((end - start) / 86_400_000) + 1;
    const expectedPeriodDays = Number(plan?.periodDays);
    if (!Number.isFinite(start) || !Number.isFinite(end) || periodDays < 1 || periodDays > 366 ||
      !Number.isSafeInteger(expectedPeriodDays) || expectedPeriodDays !== periodDays) {
      return failure("TRAFFIC_DATE_RANGE_INVALID", "Wing 트래픽 owner 날짜 범위가 유효하지 않습니다.");
    }
    const current = root.location;
    if (current?.search) {
      const params = new URLSearchParams(current.search);
      const displayedStart = params.get("start_date") || params.get("startDate");
      const displayedEnd = params.get("end_date") || params.get("endDate");
      if ((displayedStart && displayedStart !== startDate) || (displayedEnd && displayedEnd !== endDate)) {
        return failure("TRAFFIC_DATE_RANGE_MISMATCH", "Wing 트래픽 URL 날짜가 owner 계획과 다릅니다.");
      }
    }
    return { success: true, startDate, endDate, periodDays };
  }

  function expectedDatesFromControl(control, range) {
    const supplied = control?.plan?.expectedDates;
    if (supplied !== undefined) {
      if (!Array.isArray(supplied) || supplied.length !== range.periodDays ||
        supplied.some((value) => !dateText(value))) {
        return failure("TRAFFIC_DATE_RANGE_INVALID", "Wing 트래픽 owner 날짜 목록이 유효하지 않습니다.");
      }
      const expected = [];
      for (let index = 0; index < range.periodDays; index += 1) {
        const date = new Date(Date.parse(`${range.startDate}T00:00:00Z`) + index * 86_400_000)
          .toISOString().slice(0, 10);
        expected.push(date);
      }
      if (supplied.some((date, index) => date !== expected[index])) {
        return failure("TRAFFIC_DATE_RANGE_INVALID", "Wing 트래픽 owner 날짜 목록이 연속적이지 않습니다.");
      }
      return { success: true, dates: [...supplied] };
    }
    const dates = [];
    const start = Date.parse(`${range.startDate}T00:00:00Z`);
    for (let index = 0; index < range.periodDays; index += 1) {
      dates.push(new Date(start + index * 86_400_000).toISOString().slice(0, 10));
    }
    return { success: true, dates };
  }

  function xsrfToken() {
    const cookie = String(root.document?.cookie || "");
    const part = cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("XSRF-TOKEN="));
    if (!part) return null;
    const encoded = part.slice("XSRF-TOKEN=".length);
    if (!encoded) return null;
    try {
      const decoded = decodeURIComponent(encoded);
      return decoded || null;
    } catch {
      return null;
    }
  }

  function responseHeader(response, name) {
    try {
      return response?.headers?.get?.(name) || "";
    } catch {
      return "";
    }
  }

  function htmlResponse(contentType, body) {
    return /text\/html/i.test(contentType) || /^\s*</.test(body || "");
  }

  async function requestJson(path, { method = "GET", body } = {}) {
    const token = xsrfToken();
    if (!token) {
      return failure(
        "WING_XSRF_TOKEN_MISSING",
        "Wing 인증 토큰을 찾지 못했습니다. Wing 탭을 새로고침하거나 다시 로그인해 주세요.",
        { attentionRequired: true, reason: "marketplace_login" },
      );
    }
    if (typeof root.AbortController !== "function" || typeof root.fetch !== "function") {
      return failure("WING_TRANSPORT_UNAVAILABLE", "Wing 페이지 읽기 기능을 사용할 수 없습니다.");
    }

    const controller = new root.AbortController();
    const timer = root.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    let text;
    try {
      response = await root.fetch(path, {
        method,
        credentials: "include",
        redirect: "manual",
        headers: {
          Accept: "application/json, text/plain, */*",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          "X-XSRF-TOKEN": token,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      // The same AbortController covers the body read as well as headers.  A
      // stalled response body must not keep the owner attempt alive forever.
      text = await response.text();
    } catch (error) {
      const timedOut = error?.name === "AbortError" || controller.signal?.aborted;
      return failure(
        timedOut ? "WING_REQUEST_TIMEOUT" : "WING_REQUEST_FAILED",
        timedOut ? "Wing API 응답 시간이 초과되었습니다." : "Wing API 요청에 실패했습니다.",
        { attentionRequired: !timedOut, cause: error?.message || String(error) },
      );
    } finally {
      root.clearTimeout(timer);
    }

    const status = Number(response?.status || 0);
    const type = String(response?.type || "");
    const contentType = responseHeader(response, "content-type");
    const isRedirect = status === 0 || type.toLowerCase() === "opaqueredirect" || (status >= 300 && status < 400);
    if (isRedirect || status === 401 || status === 403) {
      return failure(
        "WING_LOGIN_REQUIRED",
        "Wing 로그인이 만료되었거나 인증이 필요합니다.",
        { attentionRequired: true, reason: "marketplace_login", status },
      );
    }
    // Keep provider outage distinct before treating HTML as a generic login or
    // response-shape problem.  This matters for operator retry guidance.
    if (status === 503 && htmlResponse(contentType, text)) {
      return failure("WING_PROVIDER_UNAVAILABLE", "Wing 서비스가 일시적으로 unavailable 상태입니다.", { status });
    }
    if (!response?.ok) {
      return failure("WING_PROVIDER_HTTP_ERROR", `Wing API 요청이 HTTP ${status}로 실패했습니다.`, { status });
    }
    if (!contentType || !/application\/(?:json|javascript)|text\/json/i.test(contentType) || htmlResponse(contentType, text)) {
      return failure(
        "WING_NON_JSON_RESPONSE",
        "Wing API가 JSON이 아닌 응답을 반환했습니다. 로그인 상태를 확인해 주세요.",
        { attentionRequired: true, reason: "marketplace_login", status },
      );
    }
    try {
      return { success: true, body: JSON.parse(text), status };
    } catch {
      return failure("WING_INVALID_JSON", "Wing API JSON 응답을 해석하지 못했습니다.", { status });
    }
  }

  function validateMetadata(metadata, range) {
    const metrics = metadata?.dataFreshness?.metrics;
    const salesLatest = koreaDate(metrics?.SALES_DAILY?.latestDataDate);
    const trafficLatest = koreaDate(metrics?.TRAFFIC_DAILY?.latestDataDate);
    const viewable = metadata?.viewablePeriods?.sa;
    const viewableStart = koreaDate(viewable?.startDate);
    const viewableEnd = koreaDate(viewable?.endDate);
    if (!salesLatest || !trafficLatest || !viewableStart || !viewableEnd) {
      return failure("WING_METADATA_INVALID", "Wing business-insights metadata가 유효하지 않습니다.");
    }
    // Coupang publishes traffic and sales at different times — its own screen
    // labels them separately — so the last day of a requested window is often
    // not ready while every earlier day is. This used to reject the whole
    // window for that one day, which threw away every measured day and left
    // traffic effectively uncollectable. Narrow to what the provider confirms
    // and collect that; the owner records the confirmed window.
    const confirmedEnd = [salesLatest, trafficLatest, range.endDate]
      .reduce((earliest, date) => (date < earliest ? date : earliest));
    if (confirmedEnd < range.startDate) {
      // Now nothing in the window is confirmed, which is the only case that is
      // still a flat refusal. The reason code stays for logs and correlation;
      // the operator-facing message is Korean, because a screen never shows an
      // English reason code.
      return failure(
        "WING_TRAFFIC_DATA_NOT_READY",
        `쿠팡이 ${range.startDate} 이후 트래픽을 아직 공개하지 않았습니다. 트래픽 ${trafficLatest} · 매출 ${salesLatest}까지 집계돼 있습니다.`,
        { latestSalesDate: salesLatest, latestTrafficDate: trafficLatest, confirmedEnd: null },
      );
    }
    if (range.startDate < viewableStart || confirmedEnd > viewableEnd) {
      return failure(
        "WING_TRAFFIC_RANGE_UNAVAILABLE",
        "쿠팡 business-insights가 요청한 날짜 범위를 제공하지 않습니다.",
        { viewableStart, viewableEnd },
      );
    }
    return {
      success: true,
      confirmedEnd,
      freshness: { salesLatest, trafficLatest },
      viewable: { start: viewableStart, end: viewableEnd },
    };
  }

  /** The requested window clipped to what the provider has published. */
  function confirmedRangeOf(range, confirmedEnd) {
    if (!confirmedEnd || confirmedEnd >= range.endDate) return range;
    const days = Math.round(
      (Date.parse(`${confirmedEnd}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86_400_000,
    ) + 1;
    return { ...range, endDate: confirmedEnd, periodDays: days };
  }

  function requestBody(range, pageNumber) {
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      registrationTypes: [...REGISTRATION_TYPES],
      pageNumber,
      pageSize: PAGE_SIZE,
      sortBy: "GMV",
      sortOrder: "DESC",
      includeSoldVICount: true,
    };
  }

  function normalizeRow(row, expectedAdvertiserId, { optionalAuxiliary = false } = {}) {
    if (!record(row) || !record(row.vendorItemDetails) || !record(row.businessInsightsMetricsResponse)) {
      throw new Error("invalid_vendor_item_row");
    }
    const details = row.vendorItemDetails;
    const metrics = row.businessInsightsMetricsResponse;
    const vendorItemId = positiveId(details.vendorItemId, "vendorItemId");
    const inventoryId = positiveId(details.inventoryId, "inventoryId");
    const vendorId = details.vendorId == null ? "" : String(details.vendorId).trim();
    if (!expectedAdvertiserId || vendorId !== String(expectedAdvertiserId)) {
      throw Object.assign(new Error("advertiser_identity_mismatch"), { code: "ADVERTISER_IDENTITY_MISMATCH" });
    }
    const productName = String(details.itemName || details.productName || "").trim();
    if (!productName) throw new Error("invalid_product_name");
    const values = {
      visitors: finiteNumber(metrics.totalUniqueVisitor, "totalUniqueVisitor", { integer: true }),
      views: finiteNumber(metrics.totalPageViews, "totalPageViews", { integer: true }),
      cartAdds: finiteNumber(metrics.totalAddToCart, "totalAddToCart", { integer: true }),
      orders: finiteNumber(metrics.totalOrders, "totalOrders", { integer: true }),
      salesQty: finiteNumber(metrics.totalUnitsSold, "totalUnitsSold", { integer: true }),
      revenue: finiteNumber(metrics.totalGmv, "totalGmv", { integer: true }),
      conversionRate: metrics.pvToOrder == null && optionalAuxiliary
        ? null
        : finiteNumber(metrics.pvToOrder, "pvToOrder") * 100,
    };
    const auxiliaryNumber = (value, field) => value == null && optionalAuxiliary
      ? null
      : finiteNumber(value, field);
    const changes = {
      visitors: auxiliaryNumber(metrics.uniqueVisitorVariance, "uniqueVisitorVariance"),
      views: auxiliaryNumber(metrics.pageViewsVariance, "pageViewsVariance"),
      cartAdds: auxiliaryNumber(metrics.addToCartVariance, "addToCartVariance"),
      orders: auxiliaryNumber(metrics.ordersVariance, "ordersVariance"),
      unitSold: auxiliaryNumber(metrics.unitsSoldVariance, "unitsSoldVariance"),
      revenue: auxiliaryNumber(metrics.gmvVariance, "gmvVariance"),
      conversion: auxiliaryNumber(metrics.pvToOrderVariance, "pvToOrderVariance"),
    };
    const result = {
      vendorItemId,
      optionId: vendorItemId,
      inventoryId,
      productId: inventoryId,
      productName: productName.slice(0, 100),
      ...values,
      changes,
    };
    result.vendorId = vendorId;
    if (details.productId != null) result.sdpProductId = positiveId(details.productId, "productId");
    return result;
  }

  function normalizeSummary(body, { optionalAuxiliary = false } = {}) {
    if (!record(body) || !record(body.summaryMetrics)) throw new Error("invalid_summary_metrics");
    const metrics = body.summaryMetrics;
    const summary = {};
    for (const [name, providerField] of TRAFFIC_TOTAL_FIELDS) {
      summary[name] = finiteNumber(metrics[providerField], providerField, { integer: true });
    }
    const conversionRate = metrics.pvToOrder == null && optionalAuxiliary
      ? null
      : finiteNumber(metrics.pvToOrder, "pvToOrder") * 100;
    summary.conversionRate = conversionRate;
    const varianceFields = {
      visitors: "uniqueVisitorVariance",
      views: "pageViewsVariance",
      cartAdds: "addToCartVariance",
      orders: "ordersVariance",
      salesQty: "unitsSoldVariance",
      revenue: "gmvVariance",
      conversionRate: "pvToOrderVariance",
    };
    const changeText = (value) => value == null ? null : `${value}%`;
    const auxiliaryNumber = (value, field) => value == null && optionalAuxiliary
      ? null
      : finiteNumber(value, field);
    const kpis = {
      visitor: { value: String(summary.visitors), numValue: summary.visitors, change: changeText(auxiliaryNumber(metrics[varianceFields.visitors], varianceFields.visitors)) },
      pageView: { value: String(summary.views), numValue: summary.views, change: changeText(auxiliaryNumber(metrics[varianceFields.views], varianceFields.views)) },
      addToCart: { value: String(summary.cartAdds), numValue: summary.cartAdds, change: changeText(auxiliaryNumber(metrics[varianceFields.cartAdds], varianceFields.cartAdds)) },
      order: { value: String(summary.orders), numValue: summary.orders, change: changeText(auxiliaryNumber(metrics[varianceFields.orders], varianceFields.orders)) },
      conversion: { value: summary.conversionRate == null ? null : `${summary.conversionRate}%`, numValue: summary.conversionRate, change: changeText(auxiliaryNumber(metrics[varianceFields.conversionRate], varianceFields.conversionRate)) },
      unitSold: { value: String(summary.salesQty), numValue: summary.salesQty, change: changeText(auxiliaryNumber(metrics[varianceFields.salesQty], varianceFields.salesQty)) },
      sales: { value: String(summary.revenue), numValue: summary.revenue, change: changeText(auxiliaryNumber(metrics[varianceFields.revenue], varianceFields.revenue)) },
    };
    return { summary, kpis, metrics, raw: body };
  }

  function dailyAccountSummary(normalized) {
    return {
      visitors: normalized.summary.visitors,
      views: normalized.summary.views,
      cartAdds: normalized.summary.cartAdds,
      orders: normalized.summary.orders,
      salesQty: normalized.summary.salesQty,
      revenue: normalized.summary.revenue,
      providerConversionRate: normalized.summary.conversionRate,
    };
  }

  function totalsOf(rows) {
    return rows.reduce((totals, row) => {
      for (const [name] of TRAFFIC_TOTAL_FIELDS) totals[name] += row[name];
      return totals;
    }, { visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0 });
  }

  function sameTotals(left, right) {
    return TRAFFIC_TOTAL_FIELDS.every(([name]) => left[name] === right[name]);
  }

  function pageFailure(error, pageNumber) {
    if (error?.code === "ADVERTISER_IDENTITY_MISMATCH") {
      return failure("ADVERTISER_IDENTITY_MISMATCH", "Wing 계정 식별자가 owner 계획과 다릅니다.", { pageNumber });
    }
    return failure("WING_TRAFFIC_RESPONSE_INVALID", "Wing 트래픽 응답에 필요한 필드가 없습니다.", { pageNumber, cause: error?.message || String(error) });
  }

  // The daily v2 collector deliberately keeps the provider page scope and
  // account summary separate.  A detail page is option evidence; it must not
  // be used as a substitute for the account-wide visitor/order summary.
  async function collectTrafficDetailRange(range, expectedAdvertiserId, { optionalAuxiliary = false } = {}) {
    const pages = [];
    const rows = [];
    const seen = new Set();
    let totalResults = null;
    let totalPages = null;
    let paginationPageSize = null;

    for (let pageNumber = 0; pageNumber < (totalPages ?? 1); pageNumber += 1) {
      if (pageNumber >= MAX_PAGES) {
        return failure("WING_TRAFFIC_PAGE_LIMIT", "Wing 트래픽 페이지 수가 owner 허용 한도를 초과했습니다.");
      }
      const detailResponse = await requestJson(DETAIL_PATH, {
        method: "POST",
        body: requestBody(range, pageNumber),
      });
      if (!detailResponse.success) return detailResponse;
      const payload = detailResponse.body;
      const pagination = payload?.paginationDetails;
      const vendorItems = payload?.vendorItems;
      if (!record(pagination) || !Array.isArray(vendorItems)) {
        return failure("WING_TRAFFIC_RESPONSE_INVALID", "Wing 트래픽 페이지 응답 형식이 유효하지 않습니다.", { pageNumber });
      }
      let responsePage;
      let responseSize;
      let responseTotal;
      let responsePages;
      try {
        responsePage = finiteNumber(pagination.pageNumber, "pageNumber", { integer: true });
        responseSize = finiteNumber(pagination.pageSize, "pageSize", { integer: true });
        responseTotal = finiteNumber(pagination.totalResults, "totalResults", { integer: true });
        responsePages = finiteNumber(pagination.totalPages, "totalPages", { integer: true });
      } catch (error) {
        return failure("WING_TRAFFIC_RESPONSE_INVALID", "Wing 트래픽 페이지네이션 메타데이터가 유효하지 않습니다.", { pageNumber, cause: error.message });
      }
      if (responsePage !== pageNumber || responseSize !== PAGE_SIZE || responseTotal < 0 ||
        responsePages < 0 || responsePages > MAX_PAGES) {
        return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 페이지네이션이 owner 요청과 다릅니다.", { pageNumber });
      }
      if (totalResults === null) {
        totalResults = responseTotal;
        totalPages = responsePages;
        paginationPageSize = responseSize;
        if (totalResults === 0) {
          if (responsePage !== 0 || responsePages !== 0 || vendorItems.length !== 0) {
            return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 빈 결과 페이지가 유효하지 않습니다.");
          }
          break;
        }
        const expectedPages = Math.ceil(totalResults / PAGE_SIZE);
        if (responsePages !== expectedPages || responsePages < 1) {
          return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 전체 페이지 수가 결과 수와 다릅니다.");
        }
      } else if (responseTotal !== totalResults || responsePages !== totalPages || responseSize !== paginationPageSize) {
        return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 페이지 메타데이터가 페이지 사이에서 변경되었습니다.", { pageNumber });
      }
      const expectedRows = Math.min(PAGE_SIZE, totalResults - pageNumber * PAGE_SIZE);
      if (vendorItems.length !== expectedRows) {
        return failure("WING_TRAFFIC_PAGE_PARTIAL", "Wing 트래픽 페이지가 일부만 반환되었습니다.", { pageNumber, expectedRows, actualRows: vendorItems.length });
      }
      let normalized;
      try {
        normalized = vendorItems.map((row) => normalizeRow(row, expectedAdvertiserId, { optionalAuxiliary }));
      } catch (error) {
        return pageFailure(error, pageNumber);
      }
      for (const row of normalized) {
        if (seen.has(row.vendorItemId)) {
          return failure("WING_TRAFFIC_DUPLICATE_ROW", "Wing 트래픽 응답에 중복 vendorItemId가 있습니다.", { pageNumber, vendorItemId: row.vendorItemId });
        }
        seen.add(row.vendorItemId);
        rows.push(row);
      }
      pages.push({
        pageIndex: pageNumber + 1,
        data: normalized,
        url: root.location?.href || "https://wing.coupang.com/",
      });
    }

    if (totalResults === null || rows.length !== totalResults ||
      (totalResults > 0 && pages.length !== totalPages)) {
      return failure("WING_TRAFFIC_COVERAGE_INCOMPLETE", "Wing 트래픽 전체 페이지를 확인하지 못했습니다.", {
        totalResults, rowCount: rows.length, totalPages, pageCount: pages.length,
      });
    }
    if (totalResults === 0) {
      pages.push({
        pageIndex: 1,
        data: [],
        url: root.location?.href || "https://wing.coupang.com/",
        explicitEmpty: true,
      });
    }
    return {
      success: true,
      pages,
      rows,
      totalResults,
      expectedPages: totalResults === 0 ? 1 : totalPages,
      terminalPageObserved: true,
      complete: true,
    };
  }

  // Resume reads only the page numbers that are not already acknowledged by
  // the source owner.  The provider still returns pagination metadata on each
  // requested page; a frozen expectedPages value therefore fails closed when
  // Wing changes the result shape between attempts.
  async function collectTrafficDetailSubset(range, expectedAdvertiserId, pageIndexes, expectedPages, { optionalAuxiliary = false } = {}) {
    if (!Array.isArray(pageIndexes) || pageIndexes.some((page) => !Number.isSafeInteger(page) || page < 0) ||
      new Set(pageIndexes).size !== pageIndexes.length || pageIndexes.length > MAX_PAGES ||
      (expectedPages !== null && (!Number.isSafeInteger(expectedPages) || expectedPages < 1 || expectedPages > MAX_PAGES ||
        pageIndexes.some((page) => page >= expectedPages)))) {
      return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 재개 페이지 범위가 유효하지 않습니다.");
    }
    if (pageIndexes.length === 0) {
      return { success: true, pages: [], rows: [], totalResults: null, expectedPages, terminalPageObserved: true, complete: true };
    }
    const pages = [];
    const rows = [];
    const seen = new Set();
    let totalResults = null;
    let totalPages = null;
    let paginationPageSize = null;
    for (const pageNumber of pageIndexes) {
      const detailResponse = await requestJson(DETAIL_PATH, {
        method: "POST",
        body: requestBody(range, pageNumber),
      });
      if (!detailResponse.success) return detailResponse;
      const pagination = detailResponse.body?.paginationDetails;
      const vendorItems = detailResponse.body?.vendorItems;
      if (!record(pagination) || !Array.isArray(vendorItems)) {
        return failure("WING_TRAFFIC_RESPONSE_INVALID", "Wing 트래픽 페이지 응답 형식이 유효하지 않습니다.", { pageNumber });
      }
      let responsePage;
      let responseSize;
      let responseTotal;
      let responsePages;
      try {
        responsePage = finiteNumber(pagination.pageNumber, "pageNumber", { integer: true });
        responseSize = finiteNumber(pagination.pageSize, "pageSize", { integer: true });
        responseTotal = finiteNumber(pagination.totalResults, "totalResults", { integer: true });
        responsePages = finiteNumber(pagination.totalPages, "totalPages", { integer: true });
      } catch (error) {
        return failure("WING_TRAFFIC_RESPONSE_INVALID", "Wing 트래픽 페이지네이션 메타데이터가 유효하지 않습니다.", { pageNumber, cause: error.message });
      }
      if (responsePage !== pageNumber || responseSize !== PAGE_SIZE || responseTotal < 0 ||
        responsePages < 0 || responsePages > MAX_PAGES ||
        (expectedPages !== null && responseTotal > 0 && responsePages !== expectedPages) ||
        (expectedPages !== null && responseTotal === 0 && expectedPages !== 1)) {
        return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 재개 페이지네이션이 owner 계획과 다릅니다.", { pageNumber });
      }
      if (totalResults === null) {
        totalResults = responseTotal;
        totalPages = responsePages;
        paginationPageSize = responseSize;
        if (totalResults > 0 && responsePages !== Math.ceil(totalResults / PAGE_SIZE)) {
          return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 전체 페이지 수가 결과 수와 다릅니다.", { pageNumber });
        }
        if (totalResults === 0 && (pageNumber !== 0 || responsePages !== 0 || vendorItems.length !== 0)) {
          return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 빈 결과 페이지가 유효하지 않습니다.", { pageNumber });
        }
      } else if (responseTotal !== totalResults || responsePages !== totalPages || responseSize !== paginationPageSize) {
        return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 재개 페이지 메타데이터가 페이지 사이에서 변경되었습니다.", { pageNumber });
      }
      const expectedRows = totalResults === 0 ? 0 : Math.min(PAGE_SIZE, totalResults - pageNumber * PAGE_SIZE);
      if (expectedRows < 0 || vendorItems.length !== expectedRows) {
        return failure("WING_TRAFFIC_PAGE_PARTIAL", "Wing 트래픽 재개 페이지가 일부만 반환되었습니다.", { pageNumber, expectedRows, actualRows: vendorItems.length });
      }
      let normalized;
      try {
        normalized = vendorItems.map((row) => normalizeRow(row, expectedAdvertiserId, { optionalAuxiliary }));
      } catch (error) {
        return pageFailure(error, pageNumber);
      }
      for (const row of normalized) {
        if (seen.has(row.vendorItemId)) {
          return failure("WING_TRAFFIC_DUPLICATE_ROW", "Wing 트래픽 응답에 중복 vendorItemId가 있습니다.", { pageNumber, vendorItemId: row.vendorItemId });
        }
        seen.add(row.vendorItemId);
        rows.push(row);
      }
      pages.push({
        pageIndex: pageNumber + 1,
        data: normalized,
        url: root.location?.href || "https://wing.coupang.com/",
        ...(totalResults === 0 ? { explicitEmpty: true } : {}),
      });
    }
    return {
      success: true,
      pages,
      rows,
      totalResults,
      expectedPages: expectedPages ?? (totalResults === 0 ? 1 : totalPages),
      terminalPageObserved: true,
      complete: true,
    };
  }

  function acceptedTrafficReceipts(control, plan, dates) {
    const receipts = Array.isArray(control?.receipts) ? control.receipts : [];
    const byDate = new Map(dates.map((date) => [date, new Map()]));
    let period = false;
    for (const receipt of receipts) {
      if (!record(receipt) || receipt.providerVendorId !== plan.expectedAdvertiserId ||
        receipt.filterScope !== TRAFFIC_FILTER_SCOPE || !Number.isSafeInteger(receipt.sequence) || receipt.sequence < 0) {
        return failure("SOURCE_RECEIPT_STATE_INVALID", "Wing 트래픽 owner receipt 상태가 유효하지 않습니다.");
      }
      if (receipt.kind === "period_summary") {
        if (period || receipt.sequence !== plan.periodDays * TRAFFIC_SEQUENCE_PAGE_BASE ||
          receipt.startDate !== plan.startDate || receipt.endDate !== plan.endDate || receipt.period !== plan.periodDays) {
          return failure("SOURCE_RECEIPT_STATE_INVALID", "Wing 트래픽 기간 receipt 상태가 유효하지 않습니다.");
        }
        period = true;
        continue;
      }
      if (receipt.kind !== "daily_page" || !byDate.has(receipt.businessDate) ||
        receipt.sequence !== dates.indexOf(receipt.businessDate) * TRAFFIC_SEQUENCE_PAGE_BASE + receipt.pageIndex - 1 ||
        !Number.isSafeInteger(receipt.pageIndex) || receipt.pageIndex < 1 || receipt.pageIndex > MAX_PAGES ||
        !Number.isSafeInteger(receipt.expectedPages) || receipt.expectedPages < 1 || receipt.expectedPages > MAX_PAGES ||
        receipt.pageIndex > receipt.expectedPages || typeof receipt.terminalPageObserved !== "boolean") {
        return failure("SOURCE_RECEIPT_STATE_INVALID", "Wing 트래픽 일별 receipt 상태가 유효하지 않습니다.");
      }
      const day = byDate.get(receipt.businessDate);
      if (day.size && day.values().next().value.expectedPages !== receipt.expectedPages) {
        return failure("SOURCE_RECEIPT_STATE_INVALID", "Wing 트래픽 일별 페이지 수가 receipt 사이에서 변경되었습니다.");
      }
      if (day.has(receipt.pageIndex)) {
        return failure("SOURCE_RECEIPT_STATE_INVALID", "Wing 트래픽 일별 receipt가 중복되었습니다.");
      }
      day.set(receipt.pageIndex, receipt);
    }
    return { success: true, byDate, period };
  }

  async function collectTrafficDailyV2({ control } = {}) {
    const range = rangeFromControl(control);
    if (!range.success) return range;
    const datesResult = expectedDatesFromControl(control, range);
    if (!datesResult.success) return datesResult;
    const dates = datesResult.dates;
    const plan = control?.plan || {};
    if (plan.parserVersion !== "wing-traffic-daily-v2" || plan.filterScope !== TRAFFIC_FILTER_SCOPE) {
      return failure("WING_TRAFFIC_PLAN_VERSION_UNSUPPORTED", "Wing 트래픽 owner 계획 버전이 일별 수집과 일치하지 않습니다.");
    }
    const expectedAdvertiserId = String(plan.expectedAdvertiserId || "").trim();
    const providerVendorId = String(plan.providerVendorId || "").trim();
    if (!expectedAdvertiserId || providerVendorId !== expectedAdvertiserId) {
      return failure("ADVERTISER_IDENTITY_INVALID", "Wing owner 계정 식별자가 없습니다.");
    }

    const accepted = acceptedTrafficReceipts(control, plan, dates);
    if (!accepted.success) return accepted;
    const dayStates = dates.map((businessDate) => {
      const receipts = accepted.byDate.get(businessDate);
      const expectedPages = receipts.size ? receipts.values().next().value.expectedPages : null;
      const complete = expectedPages !== null && receipts.size === expectedPages &&
        Array.from({ length: expectedPages }, (_, index) => index + 1).every((pageIndex) => receipts.has(pageIndex)) &&
        receipts.get(expectedPages)?.terminalPageObserved === true;
      return { businessDate, receipts, expectedPages, complete };
    });
    const needsProvider = dayStates.some((day) => !day.complete) || !accepted.period;

    // Metadata is checked against the full requested range once. The provider
    // detail calls below intentionally use one explicit day at a time without
    // mutating the displayed date controls.
    let metadataCheck = null;
    if (needsProvider) {
      const metadataPath = `${METADATA_PATH}?platform=WING&date=${encodeURIComponent(new Date().toISOString())}`;
      const metadataResponse = await requestJson(metadataPath);
      if (!metadataResponse.success) return metadataResponse;
      metadataCheck = validateMetadata(metadataResponse.body, range);
      if (!metadataCheck.success) return metadataCheck;
    }

    // The dates this run will confirm: everything the provider has published,
    // plus any day an earlier attempt already finished. A day the provider has
    // not published yet is left for a later run rather than failing this one.
    //
    // The plan's `dates` is deliberately not narrowed — receipt sequences are
    // numbered off it, so dropping entries would renumber the days that remain
    // and collide with receipts already accepted.
    const confirmedEnd = metadataCheck?.confirmedEnd ?? range.endDate;
    const confirmedStates = dayStates.filter(
      (day) => day.businessDate <= confirmedEnd || day.complete,
    );
    if (!confirmedStates.length) {
      return failure(
        "WING_TRAFFIC_DATA_NOT_READY",
        `쿠팡이 ${range.startDate} 이후 트래픽을 아직 공개하지 않았습니다.`,
        { confirmedEnd: null },
      );
    }
    const confirmedStart = confirmedStates[0].businessDate;
    const confirmedLast = confirmedStates[confirmedStates.length - 1].businessDate;
    const confirmedRange = {
      startDate: confirmedStart,
      endDate: confirmedLast,
      periodDays: confirmedStates.length,
    };

    const dailyPages = [];
    const products = [];
    const accountDaily = [];
    for (const dayState of confirmedStates) {
      const businessDate = dayState.businessDate;
      const acceptedPageCount = dayState.receipts.size;
      if (dayState.complete) {
        dailyPages.push({
          businessDate,
          pages: [],
          expectedPages: dayState.expectedPages,
          acceptedPageCount,
          acceptedPageIndexes: [...dayState.receipts.keys()].sort((left, right) => left - right),
          terminalPageObserved: true,
          complete: true,
          accepted: true,
        });
        continue;
      }
      const dayRange = { startDate: businessDate, endDate: businessDate, periodDays: 1 };
      const missingPages = dayState.expectedPages === null
        ? null
        : Array.from({ length: dayState.expectedPages }, (_, index) => index)
          .filter((pageNumber) => !dayState.receipts.has(pageNumber + 1));
      const detail = missingPages === null
        ? await collectTrafficDetailRange(dayRange, expectedAdvertiserId, { optionalAuxiliary: true })
        : await collectTrafficDetailSubset(dayRange, expectedAdvertiserId, missingPages, dayState.expectedPages, { optionalAuxiliary: true });
      if (!detail.success) return { ...detail, businessDate };
      let normalizedSummary = null;
      if (!dayState.receipts.has(1)) {
        const summaryResponse = await requestJson(SUMMARY_PATH, {
          method: "POST",
          body: {
            startDate: businessDate,
            endDate: businessDate,
            registrationTypes: [...REGISTRATION_TYPES],
            searchIds: [],
          },
        });
        if (!summaryResponse.success) return { ...summaryResponse, businessDate };
        try {
          normalizedSummary = normalizeSummary(summaryResponse.body, { optionalAuxiliary: true });
        } catch (error) {
          return failure("WING_TRAFFIC_SUMMARY_INVALID", "Wing 트래픽 일별 summary 응답이 유효하지 않습니다.", {
            businessDate, cause: error.message,
          });
        }
      }
      const accountSummary = normalizedSummary ? dailyAccountSummary(normalizedSummary) : undefined;
      const dayPages = detail.pages.map((page) => ({
        ...page,
        businessDate,
        ...(page.pageIndex === 1 && accountSummary ? {
          accountSummary,
          accountSummaryRaw: normalizedSummary.raw,
        } : {}),
      }));
      const expectedPages = detail.expectedPages ?? dayState.expectedPages;
      const capturedPageIndexes = dayPages.map((page) => page.pageIndex);
      const allPageIndexes = new Set([...dayState.receipts.keys(), ...capturedPageIndexes]);
      const complete = Number.isSafeInteger(expectedPages) && expectedPages > 0 &&
        allPageIndexes.size === expectedPages &&
        Array.from({ length: expectedPages }, (_, index) => index + 1).every((pageIndex) => allPageIndexes.has(pageIndex)) &&
        (dayState.receipts.get(expectedPages)?.terminalPageObserved === true || capturedPageIndexes.includes(expectedPages));
      dailyPages.push({
        businessDate,
        pages: dayPages,
        expectedPages,
        acceptedPageCount,
        acceptedPageIndexes: [...dayState.receipts.keys()].sort((left, right) => left - right),
        terminalPageObserved: complete,
        complete,
        ...(accountSummary ? { accountSummary, accountSummaryRaw: normalizedSummary.raw } : {}),
      });
      products.push(...detail.rows);
      if (accountSummary) {
        accountDaily.push({
          businessDate,
          ...accountSummary,
          providerConversionRate: accountSummary.providerConversionRate,
          observedAt: new Date().toISOString(),
        });
      }
    }

    // The period summary uses the same observed provider endpoint once for the
    // exact requested interval. It is evidence for reconciliation, not a daily
    // anchor and contains no option rows.
    let period = null;
    let periodSummaryData = null;
    if (!accepted.period) {
      const periodResponse = await requestJson(SUMMARY_PATH, {
        method: "POST",
        body: {
          startDate: confirmedRange.startDate,
          endDate: confirmedRange.endDate,
          registrationTypes: [...REGISTRATION_TYPES],
          searchIds: [],
        },
      });
      if (!periodResponse.success) return periodResponse;
      let periodSummary;
      try {
        periodSummary = normalizeSummary(periodResponse.body, { optionalAuxiliary: true });
      } catch (error) {
        return failure("WING_TRAFFIC_SUMMARY_INVALID", "Wing 트래픽 기간 summary 응답이 유효하지 않습니다.", { cause: error.message });
      }
      periodSummaryData = dailyAccountSummary(periodSummary);
      // The summary declares the window this run confirmed. The owner reads that
      // declaration as the confirmed set and records it as the run's coverage,
      // so it must describe the days actually collected, not the days requested.
      period = {
        kind: "period_summary",
        startDate: confirmedRange.startDate,
        endDate: confirmedRange.endDate,
        period: confirmedRange.periodDays,
        providerVendorId: expectedAdvertiserId,
        filterScope: TRAFFIC_FILTER_SCOPE,
        accountSummary: periodSummaryData,
        accountSummaryRaw: periodSummary.raw,
        url: root.location?.href || "https://wing.coupang.com/",
      };
    }
    const pages = dailyPages.flatMap((day) => day.pages);
    return {
      success: true,
      parserVersion: "wing-traffic-daily-v2",
      filterScope: TRAFFIC_FILTER_SCOPE,
      expectedDates: dates,
      // What this run confirmed, which can be shorter than the plan when the
      // provider has not published a later day yet.
      confirmedDates: confirmedStates.map((day) => day.businessDate),
      products,
      pages,
      dailyPages,
      periodSummary: period,
      periodSummaryAccepted: accepted.period,
      accountDaily,
      expectedPages: null,
      terminalPageObserved: true,
      // Complete describes the confirmed window. A day the provider has not
      // published is not an incomplete day; it is a day this run did not claim.
      complete: dailyPages.every((day) => day.complete && day.terminalPageObserved) && (accepted.period || !!period),
      gridReady: true,
      metadata: metadataCheck,
      periodSummaryData,
    };
  }

  async function collectTraffic({ control } = {}) {
    if (control?.plan?.parserVersion === "wing-traffic-daily-v2") {
      return collectTrafficDailyV2({ control });
    }
    const range = rangeFromControl(control);
    if (!range.success) return range;
    const expectedAdvertiserId = String(control?.plan?.expectedAdvertiserId || "").trim();
    if (!expectedAdvertiserId) return failure("ADVERTISER_IDENTITY_INVALID", "Wing owner 계정 식별자가 없습니다.");

    const metadataPath = `${METADATA_PATH}?platform=WING&date=${encodeURIComponent(new Date().toISOString())}`;
    const metadataResponse = await requestJson(metadataPath);
    if (!metadataResponse.success) return metadataResponse;
    const metadataCheck = validateMetadata(metadataResponse.body, range);
    if (!metadataCheck.success) return metadataCheck;
    // Every provider request below asks for the window the provider has actually
    // published, so this legacy path cannot claim a day metadata just said is not
    // there. The narrowing rule is the same one the daily collector uses.
    const confirmed = confirmedRangeOf(range, metadataCheck.confirmedEnd);

    const pages = [];
    const rows = [];
    const seen = new Set();
    let totalResults = null;
    let totalPages = null;
    let paginationPageSize = null;

    for (let pageNumber = 0; pageNumber < (totalPages ?? 1); pageNumber += 1) {
      if (pageNumber >= MAX_PAGES) return failure("WING_TRAFFIC_PAGE_LIMIT", "Wing 트래픽 페이지 수가 owner 허용 한도를 초과했습니다.");
      const detailResponse = await requestJson(DETAIL_PATH, {
        method: "POST",
        body: requestBody(confirmed, pageNumber),
      });
      if (!detailResponse.success) return detailResponse;
      const payload = detailResponse.body;
      const pagination = payload?.paginationDetails;
      const vendorItems = payload?.vendorItems;
      if (!record(pagination) || !Array.isArray(vendorItems)) {
        return failure("WING_TRAFFIC_RESPONSE_INVALID", "Wing 트래픽 페이지 응답 형식이 유효하지 않습니다.", { pageNumber });
      }
      let responsePage;
      let responseSize;
      let responseTotal;
      let responsePages;
      try {
        responsePage = finiteNumber(pagination.pageNumber, "pageNumber", { integer: true });
        responseSize = finiteNumber(pagination.pageSize, "pageSize", { integer: true });
        responseTotal = finiteNumber(pagination.totalResults, "totalResults", { integer: true });
        responsePages = finiteNumber(pagination.totalPages, "totalPages", { integer: true });
      } catch (error) {
        return failure("WING_TRAFFIC_RESPONSE_INVALID", "Wing 트래픽 페이지네이션 메타데이터가 유효하지 않습니다.", { pageNumber, cause: error.message });
      }
      if (responsePage !== pageNumber || responseSize !== PAGE_SIZE || responseTotal < 0 || responsePages < 0 || responsePages > MAX_PAGES) {
        return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 페이지네이션이 owner 요청과 다릅니다.", { pageNumber });
      }
      if (totalResults === null) {
        totalResults = responseTotal;
        totalPages = responsePages;
        paginationPageSize = responseSize;
        if (totalResults === 0) {
          if (responsePage !== 0 || responsePages !== 0 || vendorItems.length !== 0) {
            return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 빈 결과 페이지가 유효하지 않습니다.");
          }
          break;
        }
        const expectedPages = Math.ceil(totalResults / PAGE_SIZE);
        if (responsePages !== expectedPages || responsePages < 1) {
          return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 전체 페이지 수가 결과 수와 다릅니다.");
        }
      } else if (responseTotal !== totalResults || responsePages !== totalPages || responseSize !== paginationPageSize) {
        return failure("WING_TRAFFIC_PAGE_CONFLICT", "Wing 트래픽 페이지 메타데이터가 페이지 사이에서 변경되었습니다.", { pageNumber });
      }
      const expectedRows = Math.min(PAGE_SIZE, totalResults - pageNumber * PAGE_SIZE);
      if (vendorItems.length !== expectedRows) {
        return failure("WING_TRAFFIC_PAGE_PARTIAL", "Wing 트래픽 페이지가 일부만 반환되었습니다.", { pageNumber, expectedRows, actualRows: vendorItems.length });
      }
      let normalized;
      try {
        normalized = vendorItems.map((row) => normalizeRow(row, expectedAdvertiserId));
      } catch (error) {
        return pageFailure(error, pageNumber);
      }
      for (const row of normalized) {
        if (seen.has(row.vendorItemId)) {
          return failure("WING_TRAFFIC_DUPLICATE_ROW", "Wing 트래픽 응답에 중복 vendorItemId가 있습니다.", { pageNumber, vendorItemId: row.vendorItemId });
        }
        seen.add(row.vendorItemId);
        rows.push(row);
      }
      pages.push({ pageIndex: pageNumber + 1, data: normalized, url: root.location?.href || "https://wing.coupang.com/" });
    }

    if (totalResults === null) return failure("WING_TRAFFIC_RESPONSE_INVALID", "Wing 트래픽 결과가 없습니다.");
    const summaryResponse = await requestJson(SUMMARY_PATH, {
      method: "POST",
      body: {
        startDate: confirmed.startDate,
        endDate: confirmed.endDate,
        registrationTypes: [...REGISTRATION_TYPES],
        searchIds: [],
      },
    });
    if (!summaryResponse.success) return summaryResponse;
    let normalizedSummary;
    try {
      normalizedSummary = normalizeSummary(summaryResponse.body);
    } catch (error) {
      return failure("WING_TRAFFIC_SUMMARY_INVALID", "Wing 트래픽 summary 응답이 유효하지 않습니다.", { cause: error.message });
    }
    const detailTotals = totalsOf(rows);
    if (!sameTotals(detailTotals, normalizedSummary.summary)) {
      return failure("WING_TRAFFIC_SUMMARY_MISMATCH", "Wing 트래픽 detail과 summary 합계가 일치하지 않습니다.", { detailTotals, summary: normalizedSummary.summary });
    }
    if (rows.length !== totalResults || (totalResults > 0 && pages.length !== totalPages)) {
      return failure("WING_TRAFFIC_COVERAGE_INCOMPLETE", "Wing 트래픽 전체 페이지를 확인하지 못했습니다.", { totalResults, rowCount: rows.length, totalPages, pageCount: pages.length });
    }
    if (totalResults === 0) {
      if (pages.length !== 0 || !sameTotals(detailTotals, { visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0 })) {
        return failure("WING_TRAFFIC_EMPTY_INVALID", "Wing 트래픽 빈 계정 결과를 확인하지 못했습니다.");
      }
      pages.push({ pageIndex: 1, data: [], url: root.location?.href || "https://wing.coupang.com/" });
    }
    return {
      success: true,
      products: rows,
      pages,
      expectedPages: totalResults === 0 ? 1 : totalPages,
      terminalPageObserved: true,
      complete: true,
      gridReady: true,
      kpis: normalizedSummary.kpis,
      summary: normalizedSummary.summary,
      metadata: metadataCheck,
    };
  }

  root.KidItemWingReadApi = Object.freeze({
    collectTraffic,
    collectTrafficDailyV2,
    normalizeRow,
    normalizeSummary,
    validateMetadata,
    constants: Object.freeze({
      DETAIL_PATH,
      SUMMARY_PATH,
      METADATA_PATH,
      TRAFFIC_FILTER_SCOPE,
      TRAFFIC_SEQUENCE_PAGE_BASE,
      PAGE_SIZE,
      REQUEST_TIMEOUT_MS,
    }),
  });
})(globalThis);
