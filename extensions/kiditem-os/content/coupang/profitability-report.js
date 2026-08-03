(() => {
  "use strict";

  const REPORT_PATH = "/marketing-reporting/billboard/reports/pa";
  const REPORT_STRUCTURE = "캠페인 > 광고그룹 > 상품";
  const REPORT_POLL_TIMEOUT_MS = 10 * 60 * 1000;
  const GRID_SCROLL_DELAYS_MS = [16, 40, 80];

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
    const parts = iso || korean;
    if (!parts) return null;
    return `${parts[1]}-${String(parts[2]).padStart(2, "0")}-${String(parts[3]).padStart(2, "0")}`;
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

  function mergeGridRowFragments(fragments) {
    const rows = new Map();
    for (const fragment of fragments) {
      const rowId = String(fragment?.rowId || "").trim();
      if (!rowId) continue;
      const current = rows.get(rowId) || {};
      rows.set(rowId, { ...current, ...(fragment.cells || {}) });
    }
    return rows;
  }

  function aggregateProductRows(rows) {
    const aggregated = new Map();
    for (const row of rows) {
      const businessDate = normalizeBusinessDate(row.reportday);
      const externalOptionId = normalizedText(row.adviid);
      if (!businessDate || !externalOptionId) {
        throw new Error("profitability_report_product_identity_missing");
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
      current.adSpend += parseMetric(row.adcost);
      current.impressions += parseMetric(row.impressioncount);
      current.clicks += parseMetric(row.clickcount);
      current.orders += parseMetric(row.to1dclk);
      current.conversions += parseMetric(row.tu1dclk);
      current.adRevenue += parseMetric(row.ts1dclk);
      aggregated.set(key, current);
    }
    return [...aggregated.values()].sort((left, right) =>
      left.businessDate.localeCompare(right.businessDate) ||
      left.externalOptionId.localeCompare(right.externalOptionId),
    );
  }

  function dailySpend(rows) {
    const totals = new Map();
    for (const row of rows) {
      const businessDate = normalizeBusinessDate(row.reportday || row.businessDate);
      if (!businessDate) continue;
      totals.set(
        businessDate,
        (totals.get(businessDate) || 0) + parseMetric(row.adcost ?? row.adSpend),
      );
    }
    return totals;
  }

  function assertDailySpendMatches(summaryRows, productRows, businessDates) {
    const summary = dailySpend(summaryRows);
    const products = dailySpend(productRows);
    for (const businessDate of businessDates) {
      if (!summary.has(businessDate)) {
        throw new Error(`profitability_report_daily_summary_missing:${businessDate}`);
      }
      if (summary.get(businessDate) !== (products.get(businessDate) || 0)) {
        throw new Error(`profitability_report_daily_spend_mismatch:${businessDate}`);
      }
    }
    return true;
  }

  function isVisible(element) {
    if (!element || element.isConnected === false) return false;
    const style = window.getComputedStyle?.(element);
    return style?.display !== "none" && style?.visibility !== "hidden";
  }

  function isReportDialogOpen(dialog) {
    if (!isVisible(dialog)) return false;
    if (typeof dialog.getClientRects === "function" && dialog.getClientRects().length === 0) {
      return false;
    }
    return window.getComputedStyle?.(dialog)?.opacity !== "0";
  }

  function findVisibleByText(selector, label, exact = true, root = document) {
    return [...root.querySelectorAll(selector)].find((element) => {
      if (!isVisible(element)) return false;
      const text = normalizedText(element.innerText || element.textContent);
      return exact ? text === label : text.includes(label);
    }) || null;
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

  async function selectAllCampaigns() {
    const campaignHeading = findVisibleByText("h1,h2,h3,h4,h5,h6", "캠페인 선택");
    const button = campaignHeading?.nextElementSibling?.querySelector("button") ||
      [...document.querySelectorAll("button")].find((candidate) =>
        normalizedText(candidate.innerText || candidate.textContent) === "모든 캠페인",
      );
    if (!button) throw new Error("profitability_report_campaign_picker_missing");
    button.click();
    const allCheckbox = await pollUntil(() =>
      [...document.querySelectorAll('input[type="checkbox"]')].find((candidate) => {
        const owner = candidate.closest("label") || candidate.parentElement;
        return isVisible(candidate) &&
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
    const existing = matchingReportRows(slice).find((row) =>
      normalizedText(row.innerText).includes("생성 완료"),
    );
    if (existing) return existing;
    if (createIfMissing) {
      const createButton = findVisibleByText("button", "보고서 만들기");
      if (!createButton) throw new Error("profitability_report_create_button_missing");
      createButton.click();
      created = true;
      await sleep(1_000);
    }
    const row = await pollUntil(async () => {
      const current = matchingReportRows(slice).at(-1) || null;
      const text = normalizedText(current?.innerText);
      if (text.includes("생성 실패")) throw new Error("profitability_report_generation_failed");
      if (current && text.includes("생성 완료")) return current;
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

  async function openReportDialog(row, slice) {
    const button = await pollUntil(() => {
      const candidates = [row];
      if (slice) candidates.unshift(...[...matchingReportRows(slice)].reverse());
      return candidates
        .filter(Boolean)
        .map((candidate) => findVisibleByText("button", "차트 보기", true, candidate))
        .find(Boolean) || null;
    }, { timeoutMs: 10_000, intervalMs: 100 });
    if (!button) throw new Error("profitability_report_chart_button_missing");
    button.click();
    const dialog = await pollUntil(() =>
      [...document.querySelectorAll('[role="dialog"]')].find(isVisible) || null,
      { timeoutMs: 30_000 },
    );
    if (!dialog) throw new Error("profitability_report_dialog_missing");
    return dialog;
  }

  async function selectTable(dialog, label) {
    const tableCombo = await pollUntil(() => {
      const comboBoxes = [...dialog.querySelectorAll('[role="combobox"]')].filter(isVisible);
      return comboBoxes.length >= 2 ? comboBoxes.at(-1) : null;
    }, { timeoutMs: 30_000, intervalMs: 100 });
    if (!tableCombo) throw new Error("profitability_report_table_selector_missing");
    activateReportDateInput(tableCombo);
    const option = await pollUntil(() =>
      [...document.querySelectorAll('[role="option"], .ant-select-item-option')].find((candidate) =>
        isVisible(candidate) && normalizedText(candidate.innerText || candidate.textContent) === label,
      ) || null,
    );
    if (!option) throw new Error(`profitability_report_table_option_missing:${label}`);
    option.click();
    await sleep(300);
  }

  function collectMountedGridFragments(grid) {
    return [...grid.querySelectorAll('[role="row"][row-id]')].map((row) => ({
      rowId: row.getAttribute("row-id"),
      cells: Object.fromEntries(
        [...row.querySelectorAll("[col-id]")]
          .map((cell) => [cell.getAttribute("col-id"), normalizedText(cell.innerText || cell.textContent)])
          .filter(([column]) => column),
      ),
    }));
  }

  async function collectCompleteGrid(dialog) {
    const grid = await pollUntil(() =>
      [...dialog.querySelectorAll(".ag-root")].find(isVisible) || null,
      { timeoutMs: 30_000 },
    );
    if (!grid) throw new Error("profitability_report_grid_missing");
    const expectedRowCount = Math.max(0, parseMetric(grid.getAttribute("aria-rowcount")) - 1);
    const viewport = grid.querySelector(".ag-body-viewport");
    if (!viewport) throw new Error("profitability_report_grid_viewport_missing");
    const fragments = [];
    for (let pass = 0; pass < 3; pass += 1) {
      const step = Math.max(160, Math.floor(viewport.clientHeight * 0.9));
      for (let top = 0; top <= viewport.scrollHeight; top += step) {
        viewport.scrollTop = Math.min(top, viewport.scrollHeight);
        await sleep(GRID_SCROLL_DELAYS_MS[pass]);
        fragments.push(...collectMountedGridFragments(grid));
      }
      const merged = mergeGridRowFragments(fragments);
      if (merged.size === expectedRowCount) {
        viewport.scrollTop = 0;
        return { expectedRowCount, rows: [...merged.values()] };
      }
    }
    const collectedRowCount = mergeGridRowFragments(fragments).size;
    throw new Error(
      `profitability_report_grid_incomplete:${collectedRowCount}/${expectedRowCount}`,
    );
  }

  async function closeReportDialog(dialog) {
    const closeButton = dialog.querySelector("button.close-button, .ant-modal-close");
    if (!closeButton) throw new Error("profitability_report_dialog_close_missing");
    activateReportDateInput(closeButton);
    const closed = await pollUntil(() => !isReportDialogOpen(dialog), {
      timeoutMs: 5_000,
      intervalMs: 50,
    });
    if (!closed) throw new Error("profitability_report_dialog_close_failed");
  }

  function advertiserId() {
    const term = [...document.querySelectorAll("dt")].find((candidate) =>
      normalizedText(candidate.textContent) === "업체코드",
    );
    const value = normalizedText(term?.nextElementSibling?.textContent);
    if (!value) throw new Error("profitability_report_advertiser_missing");
    return value;
  }

  function sendReportToServer(payload, environmentId) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "syncProfitabilityReportToServer",
        environmentId,
        payload,
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || "profitability_report_upload_failed"));
          return;
        }
        resolve(response.body || response);
      });
    });
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
    const slice = input?.profitabilitySlice;
    if (!slice?.startDate || !slice?.endDate || !Array.isArray(slice.businessDates)) {
      throw new Error("profitability_report_slice_missing");
    }
    const campaignCount = await prepareReport(slice);
    const reportRow = await waitForReport(slice, true);
    const dialog = await openReportDialog(reportRow, slice);
    await selectTable(dialog, "일별 합계");
    const summary = await collectCompleteGrid(dialog);
    await selectTable(dialog, "모든 항목");
    const detail = await collectCompleteGrid(dialog);
    assertDailySpendMatches(summary.rows, detail.rows, slice.businessDates);
    const rows = aggregateProductRows(detail.rows);
    const allowedDates = new Set(slice.businessDates);
    if (rows.some((row) => !allowedDates.has(row.businessDate))) {
      throw new Error("profitability_report_row_out_of_range");
    }
    await sendReportToServer({
      collectionRunId: input.collectionRunId,
      advertiserId: advertiserId(),
      campaignCount,
      expectedRowCount: detail.expectedRowCount,
      collectedRowCount: detail.rows.length,
      businessDates: slice.businessDates,
      rows,
    }, input.environmentId);
    await closeReportDialog(dialog);
    return {
      success: true,
      type: "profitability_report",
      completed: 1,
      totalRows: detail.rows.length,
      aggregatedRows: rows.length,
    };
  }

  globalThis.KidItemProfitabilityReport = Object.freeze({
    REPORT_PATH,
    REPORT_STRUCTURE,
    activateReportDateInput,
    aggregateProductRows,
    assertDailySpendMatches,
    closeReportDialog,
    dailySpend,
    enabledReportDateInputs,
    isVisible,
    isOfficialProfitabilityReportUrl,
    isProfitabilityReportSurfaceReady,
    mergeGridRowFragments,
    normalizeBusinessDate,
    openReportDialog,
    parseMetric,
    reportRowMatches,
    run,
    waitForReport,
  });
})();
