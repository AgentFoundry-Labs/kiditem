(() => {
  "use strict";

  const REPORT_PATH = "/marketing-reporting/billboard/reports/pa";
  const REPORT_STRUCTURE = "캠페인 > 광고그룹 > 상품";
  const REPORT_POLL_TIMEOUT_MS = 10 * 60 * 1000;
  const REPORT_FORM_READINESS_TIMEOUT_MS = 10_000;

  function sleep(milliseconds) {
    const bounded = Math.min(5_000, Math.max(0, Math.round(Number(milliseconds) || 0)));
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: "waitForAdCollectorDelay", milliseconds: bounded },
          () => {
            void chrome.runtime.lastError;
            resolve();
          },
        );
      } catch {
        resolve();
      }
    });
  }

  function normalizedText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseMetric(value) {
    const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
    if (!normalized || normalized === "-" || normalized === ".") return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
  }

  function normalizeBusinessDate(value) {
    const text = normalizedText(value);
    const iso = text.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
    const korean = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    // chart-report's `dt` is compact YYYYMMDD, while older report rows use
    // ISO or Korean-formatted dates.
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    const parts = iso || korean || compact;
    if (!parts) return null;
    return `${parts[1]}-${String(parts[2]).padStart(2, "0")}-${String(parts[3]).padStart(2, "0")}`;
  }

  function firstMetric(row, fields) {
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(row || {}, field)) {
        return parseMetric(row[field]);
      }
    }
    return 0;
  }

  function sumMetrics(row, fields) {
    return fields.reduce((total, field) => total + parseMetric(row?.[field]), 0);
  }

  function isOfficialProfitabilityReportUrl(href = window.location.href) {
    try {
      const url = new URL(href);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      return url.hostname === "advertising.coupang.com" && pathname === REPORT_PATH;
    } catch {
      return false;
    }
  }

  function isProfitabilityReportSurfaceReady() {
    if (!isOfficialProfitabilityReportUrl()) return false;
    return Boolean(
      findVisibleByText("button", "보고서 만들기") &&
      findVisibleByText("h1,h2,h3,h4,h5,h6", "캠페인 선택") &&
      [...document.querySelectorAll('input[type="radio"]')].some((candidate) => {
        const owner = candidate.closest("label") || candidate.parentElement;
        return normalizedText(owner?.innerText || owner?.textContent).startsWith("기간 설정");
      }),
    );
  }

  function reportRowMatches(rowText, slice) {
    const text = normalizedText(rowText);
    return text.includes(`${slice.startDate} ~ ${slice.endDate}`) &&
      text.includes("[일별]") && text.includes(REPORT_STRUCTURE);
  }

  function externalOptionIdFromReportRow(row) {
    return normalizedText(
      // The product-report API uses snake_case. `advertised_vendor_item_id`
      // is the advertised sellable option; `vendor_item_id` is retained for
      // reports that omit that explicit advertising target.
      row?.advertised_vendor_item_id ||
      row?.advertisedVendorItemId ||
      row?.vendor_item_id ||
      row?.vendoritemid ||
      row?.vendorItemId ||
      row?.externaloptionid ||
      row?.externalOptionId ||
      // chart-report also returns an advertising-item id. It identifies the
      // ad-centre object, not the Coupang sellable option, so it is only a
      // legacy fallback when the provider omits the vendor-item identifier.
      row?.adviid,
    );
  }

  function aggregateProductRows(rows) {
    const aggregated = new Map();
    for (const row of rows) {
      const businessDate = normalizeBusinessDate(row.dt || row.reportday || row.reportDay);
      const externalOptionId = externalOptionIdFromReportRow(row);
      if (!businessDate || !externalOptionId) {
        // The provider includes campaign/ad-group aggregate rows in the same
        // hierarchy as product rows. They intentionally have no option ID and
        // must not be published as a product fact (or double-counted).
        continue;
      }
      const key = `${businessDate}\u0000${externalOptionId}`;
      const current = aggregated.get(key) || {
        businessDate,
        externalOptionId,
        adSpend: 0,
        impressions: 0,
        clicks: 0,
        orders: 0,
        conversions: 0,
        adRevenue: 0,
      };
      current.adSpend += firstMetric(row, ["ad_cost_sum", "adCostSum", "adcost"]);
      current.impressions += firstMetric(row, ["impressions_count", "impressioncount"]);
      current.clicks += firstMetric(row, ["clicks_count", "clickcount"]);
      // The current API separates direct and halo attribution. Keep the
      // original aliases as a legacy fallback, but use the 14-day order and
      // unit totals exposed by the actual product-report response.
      current.orders += Object.prototype.hasOwnProperty.call(row, "to1dclk")
        ? parseMetric(row.to1dclk)
        : sumMetrics(row, [
            "direct_order_14_days_by_cli_count",
            "halo_order_14_days_by_cli_count",
          ]);
      current.conversions += Object.prototype.hasOwnProperty.call(row, "tu1dclk")
        ? parseMetric(row.tu1dclk)
        : sumMetrics(row, [
            "direct_unit_14_days_by_cli_count",
            "halo_unit_14_days_by_cli_count",
          ]);
      current.adRevenue += Object.prototype.hasOwnProperty.call(row, "ts1dclk")
        ? parseMetric(row.ts1dclk)
        : sumMetrics(row, [
            "direct_sale_14_days_by_cli_price",
            "halo_sale_14_days_by_cli_price",
          ]);
      aggregated.set(key, current);
    }
    return [...aggregated.values()].sort((left, right) =>
      left.businessDate.localeCompare(right.businessDate) ||
      left.externalOptionId.localeCompare(right.externalOptionId),
    );
  }

  function reportFieldNames(rows) {
    const fields = new Set();
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      for (const field of Object.keys(row)) fields.add(field);
    }
    return [...fields].sort();
  }

  function nonEmptyFieldCount(rows, field) {
    return rows.reduce((count, row) => {
      const value = normalizedText(row?.[field]);
      return count + (value && value !== "0" ? 1 : 0);
    }, 0);
  }

  function reportIdentityDiagnostics(rows) {
    const dateFields = ["dt", "reportday", "reportDay"];
    const identifierFields = [
      "advertised_vendor_item_id",
      "advertisedVendorItemId",
      "vendor_item_id",
      "vendoritemid",
      "vendorItemId",
      "externaloptionid",
      "externalOptionId",
      "adviid",
    ];
    return [
      `rows=${rows.length}`,
      `date=${dateFields.map((field) => `${field}:${nonEmptyFieldCount(rows, field)}/${rows.reduce((count, row) => count + (normalizeBusinessDate(row?.[field]) ? 1 : 0), 0)}`).join(",")}`,
      `identifier=${identifierFields
        .map((field) => `${field}:${nonEmptyFieldCount(rows, field)}`)
        .join(",")}`,
    ].join(";");
  }

  function isVisible(element) {
    if (!element || element.isConnected === false) return false;
    const style = window.getComputedStyle?.(element);
    return style?.display !== "none" && style?.visibility !== "hidden";
  }

  function findVisibleByText(selector, label, exact = true, root = document) {
    return [...root.querySelectorAll(selector)].find((element) => {
      if (!isVisible(element)) return false;
      const text = normalizedText(element.innerText || element.textContent);
      return exact ? text === label : text.includes(label);
    }) || null;
  }

  function isEnabledControl(element) {
    return Boolean(
      element &&
      element.disabled !== true &&
      element.getAttribute?.("aria-disabled") !== "true",
    );
  }

  async function pollUntil(factory, options = {}) {
    const timeoutMs = options.timeoutMs || 30_000;
    const intervalMs = options.intervalMs || 250;
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const value = await factory();
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  function clickRadio(label) {
    const input = [...document.querySelectorAll('input[type="radio"]')].find((candidate) => {
      const owner = candidate.closest("label") || candidate.parentElement;
      return normalizedText(owner?.innerText || owner?.textContent).startsWith(label);
    });
    if (!input) throw new Error(`profitability_report_radio_missing:${label}`);
    if (!input.checked) input.click();
  }

  function enabledReportDateInputs(root = document) {
    const startInput = root.querySelector('input[placeholder="시작일"]');
    const endInput = root.querySelector('input[placeholder="종료일"]');
    return startInput && endInput && !startInput.disabled && !endInput.disabled
      ? { startInput, endInput }
      : null;
  }

  function activateReportDateInput(input) {
    if (!input) return false;
    // Ant Design opens this range picker on mousedown. HTMLElement.click()
    // emits only the click event, so reproduce the pointer sequence that a
    // real Chrome click sends.
    input.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    input.focus?.();
    input.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    input.click();
    return true;
  }

  async function openReportDatePicker(startInput) {
    activateReportDateInput(startInput);
    let dropdown = await pollUntil(() =>
      [...document.querySelectorAll(".ant-picker-dropdown")].find(isVisible) || null,
      { timeoutMs: 2_000, intervalMs: 100 },
    );
    if (dropdown) return dropdown;

    // Some report builds bind the same handler to the range wrapper instead
    // of the input. Retry that stable Ant Design contract only after the first
    // activation is confirmed not to have opened a picker.
    const rangePicker = startInput.closest?.(".ant-picker-range");
    if (rangePicker) activateReportDateInput(rangePicker);
    dropdown = await pollUntil(() =>
      [...document.querySelectorAll(".ant-picker-dropdown")].find(isVisible) || null,
      { timeoutMs: 8_000, intervalMs: 100 },
    );
    return dropdown;
  }

  function currentPickerMonth(dropdown) {
    const firstPanel = dropdown.querySelector(".ant-picker-panel:first-child") ||
      dropdown.querySelector(".ant-picker-panel");
    const year = parseMetric(firstPanel?.querySelector(".ant-picker-year-btn")?.textContent);
    const month = parseMetric(firstPanel?.querySelector(".ant-picker-month-btn")?.textContent);
    return year && month ? year * 12 + month - 1 : null;
  }

  async function selectReportDateRange(startDate, endDate) {
    // Selecting "기간 설정" is a React state transition. The old disabled
    // range inputs remain in the DOM briefly, and a direct click on them is
    // ignored without opening Ant Design's picker.
    const dateInputs = await pollUntil(() => enabledReportDateInputs(), {
      timeoutMs: 10_000,
      intervalMs: 100,
    });
    if (!dateInputs) throw new Error("profitability_report_date_inputs_missing");
    const { startInput, endInput } = dateInputs;
    const dropdown = await openReportDatePicker(startInput);
    if (!dropdown) throw new Error("profitability_report_date_picker_missing");

    const [year, month] = startDate.split("-").map(Number);
    const targetMonth = year * 12 + month - 1;
    for (let step = 0; step < 36; step += 1) {
      const shownMonth = currentPickerMonth(dropdown);
      if (shownMonth === targetMonth) break;
      const selector = shownMonth !== null && shownMonth > targetMonth
        ? ".ant-picker-header-prev-btn"
        : ".ant-picker-header-next-btn";
      const control = dropdown.querySelector(selector);
      if (!control) throw new Error("profitability_report_date_navigation_missing");
      control.click();
      await sleep(80);
    }
    if (currentPickerMonth(dropdown) !== targetMonth) {
      throw new Error("profitability_report_date_month_unreachable");
    }
    const targetPanel = dropdown.querySelector(".ant-picker-panel:first-child") ||
      dropdown.querySelector(".ant-picker-panel");
    const startCell = targetPanel?.querySelector(
      `td[title="${startDate}"]:not(.ant-picker-cell-disabled)`,
    );
    if (!startCell) throw new Error(`profitability_report_start_date_disabled:${startDate}`);
    activateReportDateInput(startCell.querySelector(".ant-picker-cell-inner") || startCell);
    await sleep(100);
    const activeDropdown = [...document.querySelectorAll(".ant-picker-dropdown")].find(isVisible) || dropdown;
    const activeTargetPanel = activeDropdown.querySelector(".ant-picker-panel:first-child") ||
      activeDropdown.querySelector(".ant-picker-panel");
    const endCell = activeTargetPanel?.querySelector(
      `td[title="${endDate}"]:not(.ant-picker-cell-disabled)`,
    );
    if (!endCell) throw new Error(`profitability_report_end_date_disabled:${endDate}`);
    activateReportDateInput(endCell.querySelector(".ant-picker-cell-inner") || endCell);
    const selectionApplied = await pollUntil(() => {
      const current = enabledReportDateInputs();
      return current?.startInput.value === startDate && current.endInput.value === endDate;
    }, { timeoutMs: 5_000, intervalMs: 50 });
    if (!selectionApplied) {
      throw new Error("profitability_report_date_selection_failed");
    }
  }

  function campaignPickerButton(root = document) {
    const campaignHeading = findVisibleByText(
      "h1,h2,h3,h4,h5,h6",
      "캠페인 선택",
      true,
      root,
    );
    const sibling = campaignHeading?.nextElementSibling;
    const siblingButton = sibling?.matches?.("button") ? sibling :
      sibling?.querySelector?.("button");
    const button = [
      siblingButton,
      campaignHeading?.parentElement?.querySelector?.("button"),
      findVisibleByText("button", "모든 캠페인", true, root),
      findVisibleByText("button", "캠페인을 선택하세요", true, root),
    ].find(isVisible);
    return button || null;
  }

  async function waitForCampaignSelectionReady() {
    const ready = await pollUntil(() => {
      const picker = campaignPickerButton();
      const createButton = findVisibleByText("button", "보고서 만들기");
      const pickerLabel = normalizedText(picker?.innerText || picker?.textContent);
      // The date range change asynchronously clears the old campaign choice.
      // Do not open the picker while that reset is still in flight: the stale
      // selection can be overwritten after confirmation and leave Create
      // disabled even though the click appeared to succeed.
      return picker &&
        isEnabledControl(picker) &&
        pickerLabel === "캠페인을 선택하세요" &&
        createButton &&
        !isEnabledControl(createButton)
        ? picker
        : null;
    }, { timeoutMs: REPORT_FORM_READINESS_TIMEOUT_MS, intervalMs: 100 });
    if (!ready) {
      throw new Error("profitability_report_campaign_selection_not_ready");
    }
    return ready;
  }

  async function waitForEnabledCreateButton() {
    const visibleButton = findVisibleByText("button", "보고서 만들기");
    if (!visibleButton) throw new Error("profitability_report_create_button_missing");
    const ready = await pollUntil(() => {
      const button = findVisibleByText("button", "보고서 만들기");
      return isEnabledControl(button) ? button : null;
    }, { timeoutMs: REPORT_FORM_READINESS_TIMEOUT_MS, intervalMs: 100 });
    if (!ready) throw new Error("profitability_report_create_button_not_ready");
    return ready;
  }

  async function selectAllCampaigns() {
    const button = await waitForCampaignSelectionReady();
    button.click();
    const allCheckbox = await pollUntil(() =>
      [...document.querySelectorAll('input[type="checkbox"]')].find((candidate) => {
        const owner = candidate.closest("label") || candidate.parentElement;
        return isVisible(candidate) &&
          isEnabledControl(candidate) &&
          normalizedText(owner?.innerText || owner?.textContent).startsWith("전체선택");
      }) || null,
    );
    if (!allCheckbox) throw new Error("profitability_report_campaign_select_all_missing");
    if (!allCheckbox.checked) allCheckbox.click();
    const campaignCount = [...document.querySelectorAll('input[type="checkbox"]')]
      .filter((candidate) => isVisible(candidate) && candidate !== allCheckbox).length;
    const confirm = findVisibleByText("button", "확인");
    if (!confirm) throw new Error("profitability_report_campaign_confirm_missing");
    confirm.click();
    await sleep(150);
    return campaignCount;
  }

  function matchingReportRows(slice) {
    return [...document.querySelectorAll('[role="row"]')].filter((row) =>
      !row.closest('[role="dialog"]') && reportRowMatches(row.innerText, slice),
    );
  }

  function reportRowState(row) {
    const text = normalizedText(row?.innerText);
    if (text.includes("생성 완료")) return "completed";
    if (text.includes("생성 실패")) return "failed";
    return "pending";
  }

  function completedReportRow(slice) {
    return matchingReportRows(slice).find((row) => reportRowState(row) === "completed") || null;
  }

  function pendingReportRow(slice) {
    return matchingReportRows(slice).find((row) => reportRowState(row) === "pending") || null;
  }

  function reportListHasRows() {
    return [...document.querySelectorAll('[role="row"]')].some((row) =>
      Boolean(normalizedText(row.getAttribute?.("row-id"))),
    );
  }

  async function waitForExistingReport(slice) {
    let matched = null;
    await pollUntil(() => {
      matched = completedReportRow(slice) || pendingReportRow(slice);
      return matched || reportListHasRows();
    }, { timeoutMs: 10_000, intervalMs: 250 });
    return matched;
  }

  async function prepareReport(slice) {
    clickRadio("기간 설정");
    await selectReportDateRange(slice.startDate, slice.endDate);
    clickRadio("일별");
    const campaignCount = await selectAllCampaigns();
    clickRadio(REPORT_STRUCTURE);
    return campaignCount;
  }

  async function waitForReport(slice, createIfMissing = true) {
    let created = false;
    const existing = completedReportRow(slice);
    if (existing) return existing;
    if (!pendingReportRow(slice) && createIfMissing) {
      const createButton = await waitForEnabledCreateButton();
      createButton.click();
      created = true;
      await sleep(1_000);
    }
    const row = await pollUntil(async () => {
      const current = completedReportRow(slice);
      if (current) return current;
      const refresh = findVisibleByText("button", "목록 새로 고침");
      refresh?.click();
      return null;
    }, { timeoutMs: REPORT_POLL_TIMEOUT_MS, intervalMs: 5_000 });
    if (!row) {
      throw new Error(created
        ? "profitability_report_generation_timeout"
        : "profitability_report_not_found");
    }
    return row;
  }

  function reportIdFromRow(row) {
    const reportId = normalizedText(row?.getAttribute?.("row-id"));
    if (!reportId) throw new Error("profitability_report_id_missing");
    return reportId;
  }

  function parseChartReportText(text) {
    const rows = [];
    const lines = String(text || "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        const row = JSON.parse(line);
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          throw new Error("row_not_object");
        }
        rows.push(row);
      } catch {
        throw new Error(`profitability_report_response_invalid:${index + 1}`);
      }
    }
    return rows;
  }

  async function fetchChartReportRows(row, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== "function") {
      throw new Error("profitability_report_fetch_unavailable");
    }
    const reportId = reportIdFromRow(row);
    const response = await fetchImpl(
      `/marketing-reporting/v2/api/chart-report?id=${encodeURIComponent(reportId)}`,
      {
        credentials: "same-origin",
        headers: { accept: "text/plain, application/x-ndjson, application/json" },
        method: "GET",
      },
    );
    if (!response?.ok) {
      throw new Error(`profitability_report_fetch_failed:${response?.status || 0}`);
    }
    const text = await response.text();
    const rows = parseChartReportText(text);
    return {
      reportId,
      responseBytes: new TextEncoder().encode(text).length,
      rows,
    };
  }

  function advertiserId() {
    const term = [...document.querySelectorAll("dt")].find((candidate) =>
      normalizedText(candidate.textContent) === "업체코드",
    );
    const value = normalizedText(term?.nextElementSibling?.textContent);
    if (!value) throw new Error("profitability_report_advertiser_missing");
    return value;
  }

  function profitabilityAccount(value) {
    const externalAccountId = normalizedText(value?.externalAccountId);
    const expectedAdvertiserId = normalizedText(value?.expectedAdvertiserId);
    if (!externalAccountId || !expectedAdvertiserId) {
      throw new Error("profitability_report_account_missing");
    }
    return { externalAccountId, expectedAdvertiserId };
  }

  function accountSwitchControl(account, root = document) {
    const values = new Set([
      account.externalAccountId,
      account.expectedAdvertiserId,
    ]);
    const candidates = root.querySelectorAll(
      '[data-advertiser-id], [data-advertiserid], [data-account-id], [data-accountid], button, [role="button"], a',
    );
    return [...candidates].find((candidate) => {
      if (!isVisible(candidate)) return false;
      const declared = [
        candidate.getAttribute?.("data-advertiser-id"),
        candidate.getAttribute?.("data-advertiserid"),
        candidate.getAttribute?.("data-account-id"),
        candidate.getAttribute?.("data-accountid"),
      ].map(normalizedText);
      return declared.some((value) => values.has(value)) ||
        values.has(normalizedText(candidate.innerText || candidate.textContent));
    }) || null;
  }

  async function switchProfitabilityAccount(value) {
    const account = profitabilityAccount(value);
    if (advertiserId() === account.expectedAdvertiserId) {
      return account.expectedAdvertiserId;
    }
    const control = accountSwitchControl(account);
    if (!control) throw new Error("profitability_report_account_switch_unavailable");
    control.click();
    const verified = await pollUntil(() => {
      try {
        return advertiserId() === account.expectedAdvertiserId
          ? account.expectedAdvertiserId
          : null;
      } catch {
        return null;
      }
    }, { timeoutMs: 10_000, intervalMs: 100 });
    if (!verified) {
      throw new Error(`profitability_report_advertiser_mismatch:${account.expectedAdvertiserId}`);
    }
    return verified;
  }

  async function run(input) {
    // chrome.tabs.update() can report the previous same-origin document as
    // complete for a short moment. Also allow the advertising login handoff to
    // replace this document before the owned command starts touching the form.
    const reportReady = await pollUntil(
      () => isProfitabilityReportSurfaceReady(),
      { timeoutMs: 20_000, intervalMs: 250 },
    );
    if (!reportReady) {
      throw new Error("profitability_report_wrong_page");
    }
    const providerAdvertiserId = await switchProfitabilityAccount(
      input?.profitabilityAccount,
    );
    const slice = input?.profitabilitySlice;
    if (!slice?.startDate || !slice?.endDate || !Array.isArray(slice.businessDates)) {
      throw new Error("profitability_report_slice_missing");
    }
    let campaignCount = 0;
    // The form is interactive before the requested-report table has finished
    // loading. Waiting for that initial list response lets a retry reuse an
    // existing report instead of opening the fragile date picker again.
    let reportRow = await waitForExistingReport(slice);
    if (!reportRow) {
      if (!pendingReportRow(slice)) {
        campaignCount = await prepareReport(slice);
      }
      reportRow = await waitForReport(slice, true);
    }
    const detail = await fetchChartReportRows(reportRow);
    const rows = aggregateProductRows(detail.rows);
    if (detail.rows.length > 0 && rows.length === 0) {
      // A product report that exposes no resolvable product rows must never be
      // projected as a confirmed-zero day. Include field names only (never
      // values) so a provider schema change can be diagnosed safely.
      throw new Error(
        `profitability_report_product_identity_missing:${reportIdentityDiagnostics(detail.rows)}`,
      );
    }
    const allowedDates = new Set(slice.businessDates);
    if (rows.some((row) => !allowedDates.has(row.businessDate))) {
      throw new Error("profitability_report_row_out_of_range");
    }
    return {
      success: true,
      type: "profitability_report",
      completed: 1,
      totalRows: detail.rows.length,
      aggregatedRows: rows.length,
      profitabilityReceipt: {
        providerAdvertiserId,
        reportId: detail.reportId,
        campaignCount,
        expectedRowCount: rows.length,
        collectedRowCount: rows.length,
        responseBytes: detail.responseBytes,
        rows,
      },
    };
  }

  globalThis.KidItemProfitabilityReport = Object.freeze({
    REPORT_PATH,
    REPORT_STRUCTURE,
    activateReportDateInput,
    aggregateProductRows,
    enabledReportDateInputs,
    externalOptionIdFromReportRow,
    fetchChartReportRows,
    isVisible,
    isOfficialProfitabilityReportUrl,
    isProfitabilityReportSurfaceReady,
    campaignPickerButton,
    normalizeBusinessDate,
    firstMetric,
    parseMetric,
    parseChartReportText,
    reportFieldNames,
    reportIdentityDiagnostics,
    sumMetrics,
    pendingReportRow,
    reportListHasRows,
    reportIdFromRow,
    reportRowState,
    reportRowMatches,
    accountSwitchControl,
    profitabilityAccount,
    run,
    selectAllCampaigns,
    switchProfitabilityAccount,
    waitForExistingReport,
    waitForReport,
  });
})();
