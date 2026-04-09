// KIDITEM — 쿠팡 광고센터 (advertising.coupang.com) 데이터 수집 + 승인 액션 실행

(function () {
  "use strict";

  const SERVER = "http://localhost:4000";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
  }

  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value || "").replace(/[^\d.-]/g, "");
    return raw ? Number(raw) || 0 : 0;
  }

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (!setter) {
      input.value = value;
      return;
    }
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function guessPageType(headers = []) {
    const lowerHeaders = headers.map((header) => normalizeKey(header));
    const url = window.location.href.toLowerCase();
    if (url.includes("keyword")) return "keyword";
    if (lowerHeaders.some((header) => header.includes("키워드") || header.includes("입찰가"))) return "keyword";
    return "campaign";
  }

  function parseAdKpis() {
    const kpis = {};
    document.querySelectorAll(".widget-item, [class*='widget-item']").forEach((widget) => {
      const labelEl = widget.querySelector("h5");
      const valueEl = widget.querySelector(".metric-value, [class*='metric-value']");
      if (labelEl && valueEl) {
        const label = normalizeText(labelEl.innerText);
        const value = normalizeText(valueEl.innerText);
        const unitEl = widget.querySelector(".item-contents");
        const unit = unitEl ? normalizeText(unitEl.innerText.replace(valueEl.innerText, "")) : "";
        kpis[label] = { value, unit };
      }
    });
    return kpis;
  }

  function parsePaginationInfo() {
    const currentPageInput =
      document.querySelector("input[aria-label*='페이지']") ||
      document.querySelector("input[class*='page']");
    const currentPageText = normalizeText(currentPageInput?.value || "");

    const pageCounterCandidates = Array.from(
      document.querySelectorAll("[class*='pagination'], [class*='pager'], .page-area")
    )
      .map((node) => normalizeText(node.innerText))
      .filter(Boolean);

    const combinedText = pageCounterCandidates.join(" ");
    const match =
      combinedText.match(/(\d+)\s*\/\s*(\d+)/) ||
      combinedText.match(/페이지\s*(\d+)\s*\/\s*(\d+)/);

    return {
      currentPage: parseNumber(currentPageText || match?.[1] || "1") || 1,
      totalPages: parseNumber(match?.[2] || "1") || 1,
    };
  }

  function getCellText(cell) {
    return normalizeText(cell?.innerText || "");
  }

  function extractValueByHeader(headers, cells, matchers) {
    for (let i = 0; i < headers.length; i++) {
      const key = normalizeKey(headers[i]);
      if (matchers.some((matcher) => key.includes(matcher))) {
        return getCellText(cells[i]);
      }
    }
    return "";
  }

  function findHeaderIndex(headers, matchers) {
    for (let i = 0; i < headers.length; i++) {
      const key = normalizeKey(headers[i]);
      if (matchers.some((matcher) => key.includes(matcher))) {
        return i;
      }
    }
    return -1;
  }

  function extractCellByHeader(headers, cells, matchers) {
    const index = findHeaderIndex(headers, matchers);
    return index >= 0 ? cells[index] || null : null;
  }

  function extractProductMeta(cell) {
    if (!cell) {
      return {
        imageUrl: "",
        productUrl: "",
        itemId: "",
        productDisplayName: "",
      };
    }

    const text = normalizeText(cell.innerText.replace(/\n/g, " "));
    const imageEl = cell.querySelector("img");
    const linkEl = cell.querySelector("a[href]");
    const imageUrl =
      imageEl?.src ||
      imageEl?.getAttribute("src") ||
      imageEl?.getAttribute("data-src") ||
      "";
    const idMatch = text.match(/ID\s*[:：]?\s*([A-Za-z0-9-]+)/i);

    return {
      imageUrl,
      productUrl: linkEl?.href || "",
      itemId: idMatch?.[1] || "",
      productDisplayName: text,
    };
  }

  function buildCampaignRow(headers, cells) {
    if (!headers.length || !cells.length) return null;

    const rowData = {};
    cells.forEach((cell, i) => {
      const key = headers[i] || `col_${i}`;
      rowData[key] = getCellText(cell).replace(/\n/g, " ");
    });

    const productCell = extractCellByHeader(headers, cells, ["광고상품", "상품명", "상품"]);
    const productMeta = extractProductMeta(productCell);
    const campaignName = extractValueByHeader(headers, cells, ["캠페인"]);
    const keyword = extractValueByHeader(headers, cells, ["키워드", "검색어"]);
    const keywordLabel = extractValueByHeader(headers, cells, ["키워드"]);
    const productName =
      productMeta.productDisplayName ||
      extractValueByHeader(headers, cells, ["광고상품", "상품명", "상품"]);
    const onOff = extractValueByHeader(headers, cells, ["on/off", "on off"]);
    const status = extractValueByHeader(headers, cells, ["상태"]);
    const saleType = extractValueByHeader(headers, cells, ["판매 방식", "판매방식"]);
    const campaignMission = extractValueByHeader(headers, cells, ["성과 미션", "미션"]);
    const adEfficiencyTarget = extractValueByHeader(headers, cells, ["광고비 효율성", "광고수익률", "광고 수익률"]);
    const weeklyBudgetScore = extractValueByHeader(headers, cells, ["주간 예산 점수"]);
    const dailyBudget = extractValueByHeader(headers, cells, ["일예산", "예산"]);
    const todaySpend = extractValueByHeader(headers, cells, ["오늘 누적광고비"]);
    const runningAdSpend = extractValueByHeader(headers, cells, ["집행 광고비"]);
    const currentBid = extractValueByHeader(headers, cells, ["입찰가"]);
    const impressions = extractValueByHeader(headers, cells, ["노출"]);
    const clicks = extractValueByHeader(headers, cells, ["클릭수", "클릭"]);
    const conversions = extractValueByHeader(headers, cells, ["광고 전환 판매수", "전환 판매수", "전환수", "전환"]);
    const orders = extractValueByHeader(headers, cells, ["광고 전환 주문수", "전환 주문수", "주문수"]);
    const spend = extractValueByHeader(headers, cells, ["집행 광고비", "광고비", "비용"]);
    const revenue = extractValueByHeader(headers, cells, ["광고 전환 매출", "총요 결과 광고 전환 매출", "매출", "전환매출"]);
    const roas = extractValueByHeader(headers, cells, ["광고 수익률", "광고수익률", "roas"]);
    const ctr = extractValueByHeader(headers, cells, ["클릭률", "ctr"]);
    const conversionRate = extractValueByHeader(headers, cells, ["전환율"]);
    const budgetCellText = extractValueByHeader(headers, cells, ["일예산", "예산"]);
    const pagination = parsePaginationInfo();
    const budgetNote = normalizeText(
      budgetCellText
        .replace(dailyBudget, "")
        .replace(/\s+/g, " ")
    );

    const pageType = guessPageType(headers);
    const externalId = [
      pageType,
      campaignName || "",
      keyword || "",
      productMeta.itemId || "",
      productName || "",
    ].join("::");

    return {
      rawRow: rowData,
      normalizedRow: {
        pageType,
        externalId,
        campaignName,
        keyword,
        keywordLabel,
        productName,
        imageUrl: productMeta.imageUrl,
        productUrl: productMeta.productUrl,
        itemId: productMeta.itemId,
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        onOff,
        status,
        saleType,
        campaignMission,
        adEfficiencyTarget,
        weeklyBudgetScore,
        dailyBudget: parseNumber(dailyBudget),
        todaySpend: parseNumber(todaySpend),
        runningAdSpend: parseNumber(runningAdSpend),
        budgetNote,
        currentBid: parseNumber(currentBid),
        impressions: parseNumber(impressions),
        clicks: parseNumber(clicks),
        conversions: parseNumber(conversions),
        orders: parseNumber(orders),
        spend: parseNumber(spend),
        revenue: parseNumber(revenue),
        roas: parseNumber(roas),
        ctr: parseNumber(ctr),
        conversionRate: parseNumber(conversionRate),
        rawColumns: rowData,
      },
    };
  }

  function appendStructuredRows(headers, rowElements, getCells, rawRows, normalizedRows) {
    if (!headers.length || rowElements.length === 0) return false;

    let appended = false;
    rowElements.forEach((row) => {
      const cells = Array.from(getCells(row));
      if (cells.length < 3) return;
      const built = buildCampaignRow(headers, cells);
      if (!built) return;
      rawRows.push(built.rawRow);
      normalizedRows.push(built.normalizedRow);
      appended = true;
    });

    return appended;
  }

  const MAX_AD_ROWS = 300;

  function parseCampaignTable() {
    const rawRows = [];
    const normalizedRows = [];
    let selectedHeaders = [];

    document.querySelectorAll("table").forEach((table) => {
      if (rawRows.length >= MAX_AD_ROWS) return;
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => normalizeText(th.innerText.replace(/\n/g, " ")));
      if (headers.length < 3) return;
      const trs = Array.from(table.querySelectorAll("tbody tr")).slice(0, MAX_AD_ROWS - rawRows.length);
      const appended = appendStructuredRows(
        headers,
        trs,
        (row) => row.querySelectorAll("td"),
        rawRows,
        normalizedRows
      );
      if (appended && selectedHeaders.length === 0) selectedHeaders = headers;
    });

    document.querySelectorAll(".rt-table, [class*='rt-table'], [role='grid']").forEach((grid) => {
      if (rawRows.length >= MAX_AD_ROWS) return;
      const headerNodes = Array.from(
        grid.querySelectorAll(".rt-thead .rt-th, [role='columnheader']")
      ).filter((node) => normalizeText(node.innerText).length > 0);
      const headers = headerNodes.map((node) => normalizeText(node.innerText.replace(/\n/g, " ")));
      if (headers.length < 3) return;

      const rowGroups = Array.from(grid.querySelectorAll(".rt-tbody .rt-tr-group"));
      const appended = appendStructuredRows(
        headers,
        rowGroups,
        (row) =>
          row.querySelectorAll(
            ".rt-tr.-odd .rt-td, .rt-tr.-even .rt-td, .rt-tr[role='row'] .rt-td, .rt-td[role='gridcell'], [role='gridcell']"
          ),
        rawRows,
        normalizedRows
      );
      if (appended && selectedHeaders.length === 0) selectedHeaders = headers;
    });

    return { rawRows, normalizedRows, headers: selectedHeaders, pageType: guessPageType(selectedHeaders) };
  }

  function syncToServer(payload) {
    return fetch(`${SERVER}/api/ads/extension/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .catch(e => ({ success: false, error: e.message }));
  }

  function detectCampaignName() {
    const pageNameEl = document.querySelector(".page-name, [class*='page-name']");
    if (pageNameEl) return normalizeText(pageNameEl.innerText);
    const breadcrumb = document.querySelector("[class*='breadcrumb'], [class*='page-title']");
    if (breadcrumb) {
      const text = normalizeText(breadcrumb.innerText);
      const match = text.match(/(?:노출된 광고|광고)\s*[>›]\s*(.+)/);
      if (match) return match[1].trim();
    }
    return "_전체";
  }

  function detectPeriod() {
    const activeBtn = document.querySelector("[class*='active'][class*='period'], button[class*='active']");
    if (activeBtn) {
      const text = normalizeText(activeBtn.innerText);
      if (text.includes("7일")) return "7d";
      if (text.includes("이번달") || text.includes("이번 달")) return "month";
      if (text.includes("어제")) return "yesterday";
    }
    const url = window.location.href;
    if (url.includes("7d") || url.includes("week")) return "7d";
    if (url.includes("month")) return "month";
    return "7d";
  }

  function doSync() {
    const kpis = parseAdKpis();
    const { rawRows, normalizedRows, headers, pageType } = parseCampaignTable();
    const kpiCount = Object.keys(kpis).length;
    const total = kpiCount + rawRows.length;
    const campaignName = detectCampaignName();
    const period = detectPeriod();

    if (kpiCount > 0 || rawRows.length > 0) {
      showBadge(`[${campaignName}] KPI ${kpiCount}개 + ${rawRows.length}행 — 동기화 중...`, "#f59e0b");
      syncToServer({
        type: "ad_campaign",
        source: "advertising",
        campaignName,
        period,
        data: rawRows.length > 0 ? rawRows : [{ _kpiOnly: true }],
        normalizedRows,
        headers,
        pageType,
        kpis,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      }).then((json) => {
        if (json?.success) {
          chrome.storage.local.set({ kiditem_last_sync_ads: { time: Date.now(), count: total } });
          showBadge(`광고 데이터 ${total}건 동기화 완료`, "#22c55e");
        } else {
          showBadge(`${json?.error || "실패"}`, "#ef4444");
        }
      });
      return { success: true, type: "ads", count: total };
    }
    return { success: false, error: "광고 데이터 없음" };
  }

  function getActionLabels(action) {
    const payload = action.payload || {};
    return [
      action.targetLabel,
      payload.keyword,
      payload.campaignName,
      payload.productName,
    ].filter(Boolean).map(normalizeText);
  }

  function findTargetRow(action) {
    const labels = getActionLabels(action).map((label) => label.toLowerCase());
    const rows = Array.from(document.querySelectorAll("table tbody tr"));

    return rows.find((row) => {
      const text = normalizeText(row.innerText).toLowerCase();
      return labels.some((label) => label && text.includes(label));
    }) || null;
  }

  function clickBestButton(container, patterns) {
    const nodes = Array.from(container.querySelectorAll("button, a, [role='button']"));
    for (const node of nodes) {
      const text = normalizeText(node.innerText).toLowerCase();
      if (patterns.some((pattern) => text.includes(pattern))) {
        node.click();
        return true;
      }
    }
    return false;
  }

  function findDialog() {
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'], .modal, .popup, .layer-popup"));
    return dialogs.find((dialog) => dialog.offsetParent !== null) || null;
  }

  function findInputInDialog(dialog, labelHints) {
    const labels = Array.from(dialog.querySelectorAll("label, dt, span, p, div"));
    for (const labelNode of labels) {
      const text = normalizeText(labelNode.innerText).toLowerCase();
      if (labelHints.some((hint) => text.includes(hint))) {
        const wrapper = labelNode.closest("div, section, li, form") || labelNode.parentElement;
        const input = (wrapper && wrapper.querySelector("input")) || dialog.querySelector("input[type='number'], input");
        if (input) return input;
      }
    }
    return dialog.querySelector("input[type='number'], input");
  }

  async function openEditor(row) {
    if (clickBestButton(row, ["수정", "변경", "편집", "설정", "관리"])) {
      await sleep(700);
      return true;
    }
    row.click();
    await sleep(500);
    return true;
  }

  async function submitDialog(dialog) {
    if (!clickBestButton(dialog, ["저장", "적용", "확인", "완료"])) {
      throw new Error("저장 버튼을 찾지 못했습니다.");
    }
    await sleep(1200);
    return true;
  }

  async function reportAction(apiUrl, action, type, payload) {
    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: type, id: action.id, ...payload }),
    });
  }

  async function executePauseKeyword(action, row) {
    const rowText = normalizeText(row.innerText).toLowerCase();
    if (["off", "중지", "일시중지", "비활성"].some((token) => rowText.includes(token))) {
      return { success: true, afterJson: { note: "already_paused" } };
    }

    if (!clickBestButton(row, ["중지", "off", "일시중지", "끄기", "비활성"])) {
      throw new Error("키워드 중지 버튼을 찾지 못했습니다.");
    }
    await sleep(600);
    const dialog = findDialog();
    if (dialog) {
      clickBestButton(dialog, ["확인", "저장", "적용"]);
      await sleep(1200);
    }
    return { success: true, afterJson: { status: "paused_attempted" } };
  }

  async function executeNumericChange(action, row, labelHints) {
    await openEditor(row);
    const dialog = findDialog() || document.body;
    const input = findInputInDialog(dialog, labelHints);
    if (!input) throw new Error("수정 입력창을 찾지 못했습니다.");
    setNativeValue(input, String(action.proposedValue || ""));
    await sleep(200);
    await submitDialog(dialog);
    return {
      success: true,
      afterJson: {
        currentValue: action.currentValue,
        proposedValue: action.proposedValue,
        status: "submitted",
      },
    };
  }

  async function executeSingleAction(action, apiUrl) {
    const row = findTargetRow(action);
    if (!row) {
      return { success: false, errorMessage: `대상 행을 찾지 못했습니다: ${action.targetLabel}` };
    }

    await reportAction(apiUrl, action, "markRunning", {
      beforeJson: { rowText: normalizeText(row.innerText), url: window.location.href },
    });

    if (action.actionType === "pause_keyword") {
      return executePauseKeyword(action, row);
    }
    if (action.actionType === "change_bid") {
      return executeNumericChange(action, row, ["입찰가", "bid"]);
    }
    if (action.actionType === "change_daily_budget") {
      return executeNumericChange(action, row, ["일예산", "예산", "budget"]);
    }

    return { success: false, errorMessage: `지원하지 않는 액션: ${action.actionType}` };
  }

  async function executeApprovedActions(actions, apiUrl) {
    const pageType = guessPageType(parseCampaignTable().headers);
    const runnable = actions.filter((action) => {
      const actionPageType = normalizeText(action?.payload?.pageType || action.targetType || "").toLowerCase();
      return !actionPageType || actionPageType.includes(pageType);
    });

    if (runnable.length === 0) {
      return { success: false, error: `현재 페이지(${pageType})에서 실행 가능한 승인 액션이 없습니다.` };
    }

    let executed = 0;
    let skipped = actions.length - runnable.length;

    for (const action of runnable) {
      try {
        showBadge(`${action.targetLabel} 실행 중...`, "#60a5fa");
        const result = await executeSingleAction(action, apiUrl);
        if (result.success) {
          executed++;
          await reportAction(apiUrl, action, "markDone", { afterJson: result.afterJson || {} });
        } else {
          skipped++;
          await reportAction(apiUrl, action, "markFailed", {
            errorMessage: result.errorMessage || "실행 실패",
            afterJson: result.afterJson || {},
          });
        }
      } catch (error) {
        skipped++;
        await reportAction(apiUrl, action, "markFailed", {
          errorMessage: error instanceof Error ? error.message : "실행 실패",
        });
      }
    }

    showBadge(`승인 액션 ${executed}개 실행 완료`, "#22c55e");
    return { success: true, executed, skipped };
  }

  setTimeout(doSync, 3000);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      const result = doSync();
      sendResponse(result);
      return true;
    }

    if (msg.action === "executeApprovedAdActions") {
      const payload = msg.payload || {};
      executeApprovedActions(payload.actions || [], payload.apiUrl || `${SERVER}/api/ads/actions`)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message || "실행 실패" }));
      return true;
    }
  });
})();
