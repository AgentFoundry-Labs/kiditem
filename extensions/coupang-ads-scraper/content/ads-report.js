// KIDITEM OS — 쿠팡 광고센터 (advertising.coupang.com) 데이터 수집 + 승인 액션 실행

(function () {
  "use strict";

  const SERVER = "http://localhost:4000";

  // showBadge is loaded from utils/dom.js via manifest

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
    if (url.includes("/marketing/campaign/type") || url.includes("/marketing/campaign/registration")) {
      return "campaign_registration";
    }
    if (url.includes("product")) return "product";
    if (
      lowerHeaders.some((header) =>
        header.includes("광고상품") ||
        header.includes("상품명") ||
        header === "상품" ||
        header.includes("product")
      )
    ) {
      return "product";
    }
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

  function kpiRawValue(entry) {
    if (entry == null) return "";
    if (typeof entry === "string" || typeof entry === "number") return String(entry);
    if (typeof entry === "object" && "value" in entry) return String(entry.value || "");
    return "";
  }

  function getKpiNumber(kpis, matchers) {
    for (const [label, entry] of Object.entries(kpis || {})) {
      const key = normalizeKey(label);
      if (!matchers.some((matcher) => key.includes(matcher))) continue;
      const parsed = parseNumber(kpiRawValue(entry));
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function buildCoupangAdsDailyRow(date, normalizedRows, kpis) {
    const rows = Array.isArray(normalizedRows) ? normalizedRows : [];
    const totals = rows.reduce(
      (acc, row) => {
        acc.adSpend += parseNumber(row.runningAdSpend || row.spend);
        acc.adRevenue += parseNumber(row.revenue);
        acc.impressions += parseNumber(row.impressions);
        acc.clicks += parseNumber(row.clicks);
        acc.conversions += parseNumber(row.conversions);
        acc.orders += parseNumber(row.orders);
        return acc;
      },
      {
        adSpend: 0,
        adRevenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        orders: 0,
      },
    );

    const adSpend = totals.adSpend || getKpiNumber(kpis, ["집행 광고비", "광고비", "ad spend"]);
    const adRevenue = totals.adRevenue || getKpiNumber(kpis, ["광고 전환 매출", "광고 매출", "ad gmv", "매출"]);
    const impressions = totals.impressions || getKpiNumber(kpis, ["노출", "impression"]);
    const clicks = totals.clicks || getKpiNumber(kpis, ["클릭수", "clicks", "click count"]);
    const conversions = totals.conversions || getKpiNumber(kpis, ["전환 판매수", "전환수", "conversions", "conversion sales"]);
    const orders = totals.orders || getKpiNumber(kpis, ["전환 주문수", "주문수", "order"]);
    const roas = getKpiNumber(kpis, ["광고 수익률", "광고수익률", "roas"]) ||
      (adSpend > 0 ? Math.round((adRevenue / adSpend) * 10000) / 100 : 0);
    const ctr = getKpiNumber(kpis, ["클릭률", "ctr"]) ||
      (impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0);
    const conversionRate = getKpiNumber(kpis, ["전환율", "conversion rate"]) ||
      (clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0);

    return {
      date,
      adSpend,
      adRevenue,
      impressions,
      clicks,
      conversions,
      orders,
      roas,
      ctr,
      conversionRate,
      rowCount: rows.length,
    };
  }

  function parsePaginationInfo() {
    // 1) React-Table v6 (쿠팡 광고 상세 product 테이블 + 대시보드 캠페인 테이블).
    //    DOM: .pagination-bottom input[aria-label="jump to page"] (현재 페이지 number input)
    //         + .pagination-bottom .-totalPages (총 페이지 수 span).
    //    Playwriter 로 확인: 5/26 시점 기준 두 선택자 모두 명확히 존재.
    //    이전: input[aria-label*='페이지'] 한국어 폴백 + (\d+)/(\d+) 정규식 — 쿠팡 페이지는
    //    aria-label="jump to page" (영문) + 텍스트가 "페이지  / 2" (왼쪽 숫자 없이 input 안에 있음)
    //    → 정규식 미스 → totalPages=1 로 기본값 → product 페이지 2 누락.
    const rtPag = document.querySelector(".pagination-bottom, .-pagination");
    if (rtPag) {
      const input = rtPag.querySelector('input[aria-label="jump to page"], input[type="number"]');
      const totalEl = rtPag.querySelector(".-totalPages");
      const cur = parseNumber(input?.value || "0");
      const tot = parseNumber(totalEl?.textContent || "0");
      if (cur >= 1 && tot >= 1) {
        return { currentPage: cur, totalPages: tot };
      }
    }

    // 2) 레거시 fallback — 한국어 페이지네이션 + 텍스트 정규식
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

  // 매처 우선순위 — 첫 번째 매처가 매칭되는 헤더를 우선 반환.
  // 종전 버그: headers 를 먼저 순회하면서 matchers.some 으로 검사 → 헤더 순서가 우선되어
  //   "광고 전환 매출" 헤더가 "전환" 매처에 먼저 잡혀 conversions=revenue 로 들어감 (캠페인 분석 UI 에 노출됨).
  //   "클릭률" 헤더가 "클릭" 매처에 먼저 잡혀 clicks=CTR% 으로 들어가 0 으로 노출됨.
  // 수정: 매처 (specific → generic 순) 를 먼저 순회 — 첫 매처가 잡히면 즉시 반환.
  function extractValueByHeader(headers, cells, matchers) {
    for (const matcher of matchers) {
      for (let i = 0; i < headers.length; i++) {
        const key = normalizeKey(headers[i]);
        if (key.includes(matcher)) {
          return getCellText(cells[i]);
        }
      }
    }
    return "";
  }

  function findHeaderIndex(headers, matchers) {
    for (const matcher of matchers) {
      for (let i = 0; i < headers.length; i++) {
        const key = normalizeKey(headers[i]);
        if (key.includes(matcher)) {
          return i;
        }
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
    const productUrl = linkEl?.href || "";

    // vendorItemId 추출 — 쿠팡 광고센터 캠페인 상세에서 product link 는 항상
    //   https://www.coupang.com/vp/products/<productId>?vendorItemId=<vendorItemId>
    // 형태. 종전엔 cell text 에서 "ID: ..." 텍스트를 정규식으로 찾으려 했는데
    // 광고센터에는 그런 텍스트 라벨이 없어서 itemId 가 항상 "" 였고,
    // 결과적으로 ad-sync.matchListingFromRow 가 listingId 매칭 실패 → level='product' row 가 0개 저장됨.
    let itemId = "";
    if (productUrl) {
      try {
        const u = new URL(productUrl);
        itemId = u.searchParams.get("vendorItemId") || "";
      } catch {
        // URL 생성 실패 fallback — querystring 직접 파싱
        const m = productUrl.match(/[?&]vendorItemId=(\d+)/);
        if (m) itemId = m[1];
      }
    }
    if (!itemId) {
      // legacy "ID: ..." fallback (다른 페이지에서 텍스트 라벨 있을 수도)
      const idMatch = text.match(/ID\s*[:：]?\s*([A-Za-z0-9-]+)/i);
      if (idMatch) itemId = idMatch[1];
    }

    return {
      imageUrl,
      productUrl,
      itemId,
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
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "syncToServer", payload }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: false, error: "no response" });
      });
    });
  }

  // 현재 캠페인명 감지 — span.page-name 또는 "모든 캠페인" 텍스트
  function detectCampaignName() {
    const pageNameEl = document.querySelector(".page-name, [class*='page-name']");
    if (pageNameEl) return normalizeText(pageNameEl.innerText);
    // "모든 캠페인 > 노출된 광고 > AI스마트광고(wing)" 패턴
    const breadcrumb = document.querySelector("[class*='breadcrumb'], [class*='page-title']");
    if (breadcrumb) {
      const text = normalizeText(breadcrumb.innerText);
      const match = text.match(/(?:노출된 광고|광고)\s*[>›]\s*(.+)/);
      if (match) return match[1].trim();
    }
    return "_전체";
  }

  // 기간 감지 — 날짜 피커, 버튼, URL 등에서 추출
  function detectPeriod() {
    // 1. 날짜 피커에서 날짜 범위 읽기 (YYYY.MM.DD ~ YYYY.MM.DD 형태)
    const dateTexts = [];
    document.querySelectorAll(
      "[class*='date'], [class*='period'], [class*='calendar'], [class*='range'], [class*='picker'], [class*='DateRange'], [class*='dateRange']"
    ).forEach(el => {
      const text = normalizeText(el.innerText);
      if (text) dateTexts.push(text);
    });
    // input[type=date] 또는 날짜 입력란
    document.querySelectorAll("input[type='date'], input[class*='date'], input[placeholder*='날짜']").forEach(el => {
      if (el.value) dateTexts.push(el.value);
    });

    const combined = dateTexts.join(" ");
    // "2026.04.01 ~ 2026.04.04" 또는 "2026-04-01 ~ 2026-04-04" 패턴
    const rangeMatch = combined.match(/(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})\s*[~\-–]\s*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/);

    // 2. 활성 버튼에서 기간 라벨 감지
    let periodLabel = "";
    document.querySelectorAll(
      "button[class*='active'], [class*='active'][class*='period'], [class*='selected'][class*='period'], [aria-selected='true']"
    ).forEach(btn => {
      const text = normalizeText(btn.innerText);
      if (text.includes("7일") || text.includes("이번달") || text.includes("이번 달") || text.includes("어제") || text.includes("14일") || text.includes("30일") || text.includes("월")) {
        periodLabel = text;
      }
    });

    // 3. period 결정
    let period = "7d";
    if (periodLabel.includes("이번달") || periodLabel.includes("이번 달") || periodLabel.includes("월")) {
      period = "30d";
    } else if (periodLabel.includes("14일")) {
      period = "14d";
    } else if (periodLabel.includes("어제")) {
      period = "1d";
    }

    // 날짜 범위가 있으면 일수로 period 재결정
    let dateFrom = null, dateTo = null;
    if (rangeMatch) {
      dateFrom = rangeMatch[1].replace(/\./g, "-").replace(/\//g, "-");
      dateTo = rangeMatch[2].replace(/\./g, "-").replace(/\//g, "-");
      const diffDays = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
      if (diffDays >= 25) period = "30d";
      else if (diffDays >= 12) period = "14d";
      else if (diffDays <= 1) period = "1d";
      else period = "7d";
    } else {
      // 단일 날짜 패턴: "2026.04.01" — range picker에서 같은 날짜를 두 번 눌렀을 때 indicator 표기
      const singleMatch = combined.match(/(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/);
      if (singleMatch) {
        const d = singleMatch[1].replace(/\./g, "-").replace(/\//g, "-");
        dateFrom = d;
        dateTo = d;
        period = "1d";
      }
    }

    return { period, periodLabel, dateFrom, dateTo };
  }

  // URL hash에서 #targetDate=YYYY-MM-DD 읽기
  function getTargetDateFromHash() {
    const hash = window.location.hash || "";
    const match = hash.match(/targetDate=(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  // "최근 7일" 기간 프리셋 버튼 클릭
  // TODO: Playwriter로 실제 셀렉터 확인 후 교체 — 현재는 텍스트 매칭 휴리스틱
  async function ensureLast7Days() {
    const { dateFrom, dateTo, periodLabel } = detectPeriod();
    if (periodLabel && periodLabel.includes("7일")) return true;
    if (dateFrom && dateTo) {
      const diff = Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
      if (diff === 7) return true;
    }

    const btn = Array.from(document.querySelectorAll("button, [role='button'], [role='tab']")).find((el) => {
      const t = normalizeText(el.innerText || "");
      return t === "최근 7일" || t === "7일" || t === "지난 7일";
    });
    if (!btn) return false;
    btn.click();
    await sleep(2500);
    return true;
  }

  // 페이지네이션: 다음 페이지 버튼 클릭 후 테이블 재로딩 대기
  // TODO: Playwriter로 실제 "다음" 버튼 셀렉터 확인 후 교체
  async function goToNextPage() {
    // 1) React-Table v6 — 쿠팡 광고센터의 product/캠페인 테이블 다음 버튼은
    //    button.-btn (innerText="Next") inside div.-next inside .pagination-bottom.
    //    버튼 자체에는 next/aria-label 가 없고 부모 div 에만 .-next 가 붙어있어
    //    레거시 휴리스틱 필터로는 잡히지 않는다. 직접 셀렉터로 우선 시도.
    const rtNextBtn = document.querySelector(
      ".pagination-bottom .-next .-btn, .pagination-bottom .-next button, .-pagination .-next .-btn, .-pagination .-next button"
    );
    if (rtNextBtn && !rtNextBtn.disabled && rtNextBtn.getAttribute("aria-disabled") !== "true") {
      rtNextBtn.click();
      await sleep(2000);
      return true;
    }

    // 2) 레거시 fallback — 텍스트/aria/class 휴리스틱 (한국어 다음 버튼 + 일반 antd pagination)
    const nextBtnCandidates = Array.from(
      document.querySelectorAll("button, [role='button'], a")
    ).filter((el) => {
      const t = normalizeText(el.innerText || "");
      const aria = normalizeText(el.getAttribute("aria-label") || "");
      const cls = String(el.className || "").toLowerCase();
      return (
        t === "다음" ||
        t === ">" ||
        t === "Next" ||
        aria.includes("다음") ||
        aria.toLowerCase().includes("next") ||
        /next|pagination.*next/.test(cls)
      );
    });
    const btn = nextBtnCandidates.find((el) => {
      const disabled =
        el.disabled ||
        el.getAttribute("aria-disabled") === "true" ||
        String(el.className || "").toLowerCase().includes("disabled");
      return !disabled;
    });
    if (!btn) return false;

    btn.click();
    await sleep(2000);
    return true;
  }

  // 날짜 피커를 특정 날짜로 설정.
  // 쿠팡 광고 대시보드는 AntD range calendar. 트리거 → popup → 좌측 패널 월 네비 → 날짜 셀 두 번 클릭 → 적용.
  async function setDateRange(ymd) {
    const [targetY, targetM, targetD] = ymd.split("-").map((v) => parseInt(v, 10));
    if (
      !Number.isInteger(targetY) ||
      !Number.isInteger(targetM) ||
      !Number.isInteger(targetD) ||
      targetM < 1 ||
      targetM > 12 ||
      targetD < 1 ||
      targetD > 31
    ) {
      console.warn(`[KIDITEM] setDateRange: invalid date ${ymd}`);
      return false;
    }
    const targetMonthIndex = targetY * 12 + targetM;

    // 1) 트리거 버튼 클릭 — SPA mount 가 늦으면 즉시 못 잡으므로 최대 15초 폴링
    const triggerSelector = "button.dashboard-metric-widget-date-indicator-revamp.ant-dropdown-trigger";
    let trigger = null;
    for (let i = 0; i < 30; i++) {
      trigger = document.querySelector(triggerSelector);
      if (trigger) break;
      await sleep(500);
    }
    if (!trigger) {
      console.warn("[KIDITEM] setDateRange: trigger not found after 15s polling");
      return false;
    }
    trigger.click();
    await sleep(600);

    // 2) popup 찾기 — antd dropdown mount 도 한 박자 늦을 수 있어 폴링
    const findVisiblePopup = () => {
      const popups = Array.from(
        document.querySelectorAll(".ant-dropdown.dashboard-metric-widget-calendar-dropdown")
      );
      return popups.find((el) => {
        const rect = el.getBoundingClientRect();
        return !el.classList.contains("ant-dropdown-hidden") && rect.width > 0 && rect.height > 0;
      }) || null;
    };

    let popup = null;
    for (let i = 0; i < 15; i++) {
      popup = findVisiblePopup();
      if (popup) break;
      await sleep(200);
    }
    if (!popup) {
      console.warn("[KIDITEM] setDateRange: popup not found");
      return false;
    }
    const left = popup.querySelector(".ant-calendar-range-left");
    const right = popup.querySelector(".ant-calendar-range-right");
    if (!left) {
      console.warn("[KIDITEM] setDateRange: left panel not found");
      return false;
    }

    // 3) 좌/우 패널 중 타겟 월이 보일 때까지 네비게이션
    const readPanel = (panel, name) => {
      if (!panel) return null;
      const yearText = panel.querySelector(".ant-calendar-year-select")?.textContent || "";
      const monthText = panel.querySelector(".ant-calendar-month-select")?.textContent || "";
      const y = parseInt(yearText.replace(/[^\d]/g, ""), 10);
      const m = parseInt(monthText.replace(/[^\d]/g, ""), 10);
      if (!Number.isInteger(y) || !Number.isInteger(m) || y <= 0 || m < 1 || m > 12) {
        return null;
      }
      return { panel, name, y, m, monthIndex: y * 12 + m };
    };
    const readPanels = () => [readPanel(left, "left"), readPanel(right, "right")].filter(Boolean);
    const findTargetPanel = () => readPanels().find((panel) => panel.monthIndex === targetMonthIndex) || null;
    const panelKey = (panels) => panels.map((panel) => `${panel.name}:${panel.monthIndex}`).join("|");

    let targetPanel = findTargetPanel();
    if (!targetPanel) {
      let guard = 0;
      while (guard++ < 60) {
        const panels = readPanels();
        if (panels.length === 0) {
          console.warn("[KIDITEM] setDateRange: calendar header unreadable");
          return false;
        }

        const first = panels[0];
        const last = panels[panels.length - 1];
        const direction = targetMonthIndex < first.monthIndex ? "prev" : "next";
        const beforeKey = panelKey(panels);
        const btn = direction === "prev"
          ? left.querySelector(".ant-calendar-prev-month-btn")
          : (right && right.querySelector(".ant-calendar-next-month-btn"))
            || left.querySelector(".ant-calendar-next-month-btn");

        if (!btn) {
          console.warn(`[KIDITEM] setDateRange: month nav btn not found (direction=${direction})`);
          return false;
        }

        btn.click();
        await sleep(220);

        targetPanel = findTargetPanel();
        if (targetPanel) break;

        let afterPanels = readPanels();
        let afterKey = panelKey(afterPanels);
        for (let wait = 0; wait < 5 && afterPanels.length > 0 && afterKey === beforeKey; wait++) {
          await sleep(200);
          targetPanel = findTargetPanel();
          if (targetPanel) break;
          afterPanels = readPanels();
          afterKey = panelKey(afterPanels);
        }
        if (targetPanel) break;

        if (afterPanels.length === 0 || afterKey === beforeKey) {
          console.warn(`[KIDITEM] setDateRange: month nav stalled at ${beforeKey}`);
          return false;
        }

        const afterFirst = afterPanels[0];
        const afterLast = afterPanels[afterPanels.length - 1];
        if (
          (direction === "next" && afterLast.monthIndex <= last.monthIndex) ||
          (direction === "prev" && afterFirst.monthIndex >= first.monthIndex)
        ) {
          console.warn(`[KIDITEM] setDateRange: month nav moved unexpectedly (${beforeKey} -> ${afterKey})`);
          return false;
        }
      }
    }

    if (!targetPanel) {
      console.warn(`[KIDITEM] setDateRange: target month ${targetY}-${String(targetM).padStart(2, "0")} not visible`);
      return false;
    }

    const findTargetCell = () => {
      const cells = targetPanel.panel.querySelectorAll("td.ant-calendar-cell:not(.ant-calendar-last-month-cell):not(.ant-calendar-next-month-cell)");
      for (const c of cells) {
        const txt = c.querySelector(".ant-calendar-date")?.textContent?.trim();
        if (txt === String(targetD)) {
          return c.querySelector(".ant-calendar-date");
        }
      }
      return null;
    };

    // 4) 날짜 셀 찾기 (이전/다음 달 셀 제외)
    let targetCell = findTargetCell();
    if (!targetCell) {
      console.warn(`[KIDITEM] setDateRange: target cell ${targetD} not found in ${targetPanel.name} panel`);
      return false;
    }

    // 5) 같은 날짜 두 번 클릭 → range start=end=ymd
    targetCell.click();
    await sleep(200);
    targetCell = findTargetCell() || targetCell;
    targetCell.click();
    await sleep(300);

    // 6) 적용 버튼 — "적용" 텍스트 우선, 없으면 popup 내 primary 버튼 fallback
    const primaryBtns = Array.from(popup.querySelectorAll("button.ant-btn.ant-btn-primary"));
    let applyBtn = primaryBtns.find((b) => normalizeText(b.textContent || "") === "적용");
    if (!applyBtn) {
      applyBtn = primaryBtns.find((b) => /적용|확인|apply|ok/i.test(normalizeText(b.textContent || "")));
    }
    if (!applyBtn && primaryBtns.length === 1) {
      applyBtn = primaryBtns[0];
    }
    if (!applyBtn) {
      console.warn("[KIDITEM] setDateRange: apply button not found", primaryBtns.map((b) => b.textContent));
      return false;
    }
    applyBtn.click();

    // 테이블 재로딩 대기
    await sleep(3500);
    return true;
  }

  async function doSync() {
    // hash에 targetDate가 있으면 먼저 날짜 피커 설정
    const targetDate = getTargetDateFromHash();
    if (targetDate) {
      showBadge(`📅 ${targetDate} 날짜 설정 중...`, "#6366f1");
      const ok = await setDateRange(targetDate);
      if (!ok) {
        // 날짜 설정 실패 시 7일 기본값으로 저장하면 일별 집계와 섞여 중복 계산됨. 차라리 중단.
        showBadge(`❌ ${targetDate} 날짜 피커 설정 실패 — 수집 중단 (7일치 오염 방지)`, "#ef4444");
        return { success: false, reason: 'date_picker_failed', targetDate };
      }
      await sleep(1500);
    } else {
      // 캠페인 상세 페이지 진입 시 기본을 7일로 맞춤
      showBadge(`📅 최근 7일 기간 설정 중...`, "#6366f1");
      await ensureLast7Days();
    }

    const kpis = parseAdKpis();
    const campaignName = detectCampaignName();
    let { period, periodLabel, dateFrom, dateTo } = detectPeriod();

    // targetDate 해시가 있으면 "그 하루치"를 수집하는 배치 모드 — period를 '1d'로 강제.
    // 서버는 일별 스냅샷(period='1d')만 합산해 월간 KPI를 만들기 때문에, 7d/30d 누적값이 섞이면 중복 집계됨.
    if (targetDate) {
      period = '1d';
      dateFrom = targetDate;
      dateTo = targetDate;
    }

    // 1페이지 파싱
    let firstPage = parseCampaignTable();
    const aggregatedRaw = [...firstPage.rawRows];
    const aggregatedNormalized = [...firstPage.normalizedRows];
    const headers = firstPage.headers;
    const pageType = firstPage.pageType;
    const pagination = parsePaginationInfo();
    const totalPages = Math.min(pagination.totalPages || 1, 50); // 안전 상한 50

    // 페이지 순회 — dedupe는 externalId 기준
    const seenIds = new Set(aggregatedNormalized.map((r) => r.externalId));
    let currentPage = pagination.currentPage || 1;
    let safetyBreak = 0;

    while (currentPage < totalPages && safetyBreak < 50) {
      safetyBreak++;
      showBadge(`📄 페이지 ${currentPage + 1}/${totalPages} 수집 중...`, "#6366f1");
      const moved = await goToNextPage();
      if (!moved) break;
      const next = parseCampaignTable();
      for (let i = 0; i < next.normalizedRows.length; i++) {
        const row = next.normalizedRows[i];
        if (seenIds.has(row.externalId)) continue;
        seenIds.add(row.externalId);
        aggregatedNormalized.push(row);
        aggregatedRaw.push(next.rawRows[i]);
      }
      const newPag = parsePaginationInfo();
      if (newPag.currentPage <= currentPage) break; // 페이지 증가 안 하면 중단
      currentPage = newPag.currentPage;
    }

    const kpiCount = Object.keys(kpis).length;
    const total = kpiCount + aggregatedRaw.length;

    if (kpiCount > 0 || aggregatedRaw.length > 0) {
      const periodDisplay = periodLabel || period;
      showBadge(
        `📊 [${campaignName}] ${periodDisplay} — KPI ${kpiCount}개 + ${aggregatedRaw.length}행 (${totalPages}p) 동기화 중...`,
        "#f59e0b",
      );
      const json = await syncToServer({
        type: "ad_campaign",
        source: "advertising",
        campaignName,
        period,
        periodLabel,
        // 서버 DTO 가 startDate/endDate 를 기대 (whitelist 로 dateFrom/dateTo 는 drop).
        // 일별 적재의 핵심 필드 — 누락 시 모든 데이터가 today 로 저장되어 readiness 일별 카운트가 깨진다.
        startDate: dateFrom,
        endDate: dateTo,
        dateFrom, // 구버전 서버/로깅 호환
        dateTo,
        data: aggregatedRaw.length > 0 ? aggregatedRaw : [{ _kpiOnly: true }],
        normalizedRows: aggregatedNormalized,
        headers,
        pageType,
        kpis,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      });
      if (json?.success) {
        if (targetDate) {
          const dailyRow = buildCoupangAdsDailyRow(targetDate, aggregatedNormalized, kpis);
          const dailyJson = await syncToServer({
            type: "coupang_ads_daily",
            source: "coupang_ads",
            period: "1d",
            startDate: targetDate,
            endDate: targetDate,
            dateFrom: targetDate,
            dateTo: targetDate,
            data: [dailyRow],
            kpis,
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString(),
          });
          if (!dailyJson?.success) {
            showBadge(`❌ 일별 광고 KPI 저장 실패: ${dailyJson?.error || "실패"}`, "#ef4444");
            return { success: false, error: dailyJson?.error || "일별 광고 KPI 저장 실패" };
          }
        }
        chrome.storage.local.set({ kiditem_last_sync_ads: { time: Date.now(), count: total } });
        showBadge(`✅ 광고 데이터 ${total}건 (${totalPages}p) 동기화 완료`, "#22c55e");
        return { success: true, type: "ads", count: total, pages: totalPages };
      } else {
        showBadge(`❌ ${json?.error || "실패"}`, "#ef4444");
        return { success: false, error: json?.error || "실패" };
      }
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
    const token = await new Promise((resolve) => {
      try {
        chrome.storage.local.get(["kiditem_auth_token"], (r) => resolve(r.kiditem_auth_token || null));
      } catch {
        resolve(null);
      }
    });
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: type, id: action.id, ...payload }),
    });
  }

  async function fetchApprovedQueuedActions(limit = 20) {
    const token = await new Promise((resolve) => {
      try {
        chrome.storage.local.get(["kiditem_auth_token"], (r) => resolve(r.kiditem_auth_token || null));
      } catch {
        resolve(null);
      }
    });
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${SERVER}/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=${limit}`, { headers });
    if (!res.ok) throw new Error(`승인 액션 조회 실패: ${res.status}`);
    const json = await res.json();
    return Array.isArray(json.items) ? json.items : [];
  }

  function findClickableByText(patterns, root = document) {
    const nodes = Array.from(root.querySelectorAll("button, a, [role='button'], [role='tab']"));
    return nodes.find((node) => {
      const text = normalizeText(node.innerText || node.textContent).toLowerCase();
      return patterns.some((pattern) => text.includes(pattern));
    }) || null;
  }

  function setRadioValue(value) {
    const input = document.querySelector(`input[type="radio"][value="${value}"]`);
    if (!input) return false;
    input.click();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function waitForUrlIncludes(part, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (window.location.href.includes(part)) return true;
      await sleep(250);
    }
    return false;
  }

  async function waitForSelector(selector, timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(250);
    }
    return null;
  }

  async function ensureCampaignRegistrationPage() {
    if (window.location.href.includes("/marketing/campaign/registration")) return;

    if (!window.location.href.includes("/marketing/campaign/type")) {
      showBadge("🟦 광고 만들기 버튼 찾는 중...", "#60a5fa");
      const addButton = findClickableByText(["캠페인 추가", "광고 만들기"]);
      if (!addButton) throw new Error("광고 만들기/캠페인 추가 버튼을 찾지 못했습니다.");
      addButton.click();
      await sleep(800);
      await waitForUrlIncludes("/marketing/campaign/type", 8000);
    }

    if (window.location.href.includes("/marketing/campaign/type")) {
      showBadge("🟦 광고 목표 선택 후 다음 단계 이동...", "#60a5fa");
      const nextButton = findClickableByText(["다음"]);
      if (!nextButton) throw new Error("광고 목표 선택 화면의 다음 버튼을 찾지 못했습니다.");
      nextButton.click();
      const ok = await waitForUrlIncludes("/marketing/campaign/registration", 10000);
      if (!ok) throw new Error("광고 등록 화면으로 이동하지 못했습니다.");
    }
  }

  function findCampaignInput(placeholder) {
    return Array.from(document.querySelectorAll("input")).find((input) =>
      normalizeText(input.getAttribute("placeholder")).includes(placeholder),
    ) || null;
  }

  async function searchAndSelectProduct(listing) {
    const label = normalizeText(listing.label || listing.productName || listing.externalId || listing.listingId);
    if (!label) return false;

    const searchInput = findCampaignInput("판매 상품을 검색");
    if (!searchInput) throw new Error("광고 상품 검색 입력창을 찾지 못했습니다.");

    setNativeValue(searchInput, label);
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));

    const searchButton = searchInput.closest("div")?.querySelector("button, [role='button']");
    if (searchButton) searchButton.click();

    await sleep(1500);

    const needle = label.toLowerCase();
    const rows = Array.from(document.querySelectorAll('li[data-bigfoot-component="vendor_item"]'));
    const row = rows.find((item) => normalizeText(item.innerText).toLowerCase().includes(needle)) || rows[0];
    if (!row) return false;

    const selectButton = findClickableByText(["상품 선택"], row);
    if (!selectButton) return false;
    selectButton.click();
    await sleep(700);
    return true;
  }

  async function executeCreateCampaign(action) {
    const payload = action.payload || {};
    const listings = Array.isArray(payload.listings) ? payload.listings : [];
    if (listings.length === 0) {
      return { success: false, errorMessage: "등록할 광고 상품이 없습니다. 전략 탭에서 상품이 포함된 캠페인을 다시 생성해주세요." };
    }

    await ensureCampaignRegistrationPage();

    const campaignNameInput = findCampaignInput("캠페인 이름");
    if (!campaignNameInput) throw new Error("캠페인 이름 입력창을 찾지 못했습니다.");
    setNativeValue(campaignNameInput, payload.campaignName || action.targetLabel || "");

    const adGroupInput = document.querySelector("#reg_ad_group_name") || findCampaignInput("그룹 이름");
    if (!adGroupInput) throw new Error("광고 그룹 이름 입력창을 찾지 못했습니다.");
    setNativeValue(adGroupInput, payload.adGroupName || `${payload.grade || "A"}등급_그룹`);

    let selectedCount = 0;
    for (const listing of listings.slice(0, 20)) {
      if (await searchAndSelectProduct(listing)) selectedCount++;
    }
    if (selectedCount === 0) throw new Error("쿠팡 광고 상품을 선택하지 못했습니다.");

    const operationMode = normalizeText(payload.operationMode);
    if (operationMode.includes("직접")) {
      setRadioValue("MANUAL");
    } else {
      setRadioValue("AUTO");
      setRadioValue(operationMode.includes("매출스타트") ? "PRODUCT_TARGET_BUDGET" : "PRODUCT_TARGET_ROAS");
    }
    await sleep(500);

    const budgetInput = document.querySelector('[data-testid="budget-input"]') || findCampaignInput("예)30,000");
    if (!budgetInput) throw new Error("일예산 입력창을 찾지 못했습니다.");
    setNativeValue(budgetInput, String(payload.dailyBudget || 30000));

    const targetRoasInput = document.querySelector('[data-bigfoot-component="target_roas"] input[data-bigfoot-component="entry"]');
    if (targetRoasInput && payload.targetRoas) setNativeValue(targetRoasInput, String(payload.targetRoas));

    await sleep(500);
    const completeButton = findClickableByText(["완료"]);
    if (!completeButton) throw new Error("완료 버튼을 찾지 못했습니다.");
    completeButton.click();
    await sleep(1500);

    const dialog = findDialog();
    if (dialog) {
      const confirmButton = findClickableByText(["등록", "확인", "완료"], dialog);
      if (confirmButton) {
        confirmButton.click();
        await sleep(1500);
      }
    }

    const bodyText = normalizeText(document.body.innerText);
    if (/필수|선택해주세요|입력해주세요|오류|실패/.test(bodyText)) {
      return {
        success: false,
        errorMessage: "쿠팡 광고 등록 폼 검증 메시지가 남아 있습니다.",
        afterJson: { url: window.location.href, selectedCount },
      };
    }

    return {
      success: true,
      afterJson: {
        status: "submitted",
        url: window.location.href,
        selectedCount,
        campaignName: payload.campaignName || action.targetLabel,
      },
    };
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
    if (action.actionType === "create_campaign") {
      await reportAction(apiUrl, action, "markRunning", {
        beforeJson: { url: window.location.href, payload: action.payload || {} },
      });
      return executeCreateCampaign(action);
    }

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
      if (action.actionType === "create_campaign") return true;
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
        showBadge(`⚙️ ${action.targetLabel} 실행 중...`, "#60a5fa");
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

    showBadge(`✅ 승인 액션 ${executed}개 실행 완료`, "#22c55e");
    return { success: true, executed, skipped };
  }

  // ════════════════════════════════════════════════════════════════════
  // Dashboard sweep — `#kiditemAdSync=1` 진입 시 운영중 캠페인 자동 순회
  //
  // 흐름:
  //   1) 대시보드 진입 → 그리드 렌더 대기 (기본 7일 view 유지, 날짜 변경 금지)
  //      ⚠ 대시보드 자체 날짜를 어제로 바꾸면 운영중 캠페인 행이 사라져서 sweep 큐가 비어버림
  //   2) `.rt-tbody .rt-tr-group` 행 스캔 → cells[1]==='ON' 이고 cells[2] 가 "운영" 포함하는 캠페인 추출
  //   3) 캠페인명 큐 보존 (DOM 떠나도 잃지 않게)
  //   4) 큐 순회: 캠페인명 anchor 클릭 → 상세 페이지 (`/campaign/.../product`)
  //      → 상세 페이지에서 setDateRange("어제") 적용 → parseCampaignTable
  //      → syncToServer(period:'1d', campaignName, startDate=어제, endDate=어제)
  //      → history.back() → 대시보드는 default 7d 유지 → 다음 캠페인
  //
  // SPA 라우팅이라 content script 인스턴스가 한 탭 내내 살아있는 점을 활용 (manifest match `*://*/*` 한 도메인).
  // ════════════════════════════════════════════════════════════════════

  function getYesterdayYmd() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function isDashboardListPage() {
    return /\/marketing\/dashboard\/sales(?:\/?$|\/?\?|\/?#)/.test(window.location.pathname + window.location.search + window.location.hash);
  }

  function canonicalCampaignHref(value) {
    try {
      const url = new URL(value, window.location.href);
      url.hash = "";
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      return `${url.origin}${pathname}${url.search}`;
    } catch {
      return "";
    }
  }

  function campaignIdFromHref(value) {
    try {
      const url = new URL(value, window.location.href);
      for (const key of ["campaignId", "campaignID", "campaignNo", "campaign_id"]) {
        const id = normalizeText(url.searchParams.get(key) || "");
        if (id) return id;
      }
      const segments = url.pathname.split("/").filter(Boolean);
      const index = segments.findIndex((segment) => segment.toLowerCase() === "campaign");
      const candidate = index >= 0 ? segments[index + 1] : "";
      if (candidate && !/^(?:type|registration|create|new)$/i.test(candidate)) {
        return decodeURIComponent(candidate);
      }
    } catch {}
    return null;
  }

  function campaignIdentityFromHref(value) {
    const campaignId = campaignIdFromHref(value);
    if (campaignId) return `campaign:${campaignId}`;
    const href = canonicalCampaignHref(value);
    return href ? `href:${href}` : null;
  }

  // 대시보드 그리드의 캠페인을 모두 뽑는다.
  // - 이전: cells[1]==='ON' && /운영/.test(cells[2]) 로 strict 필터 → 컬럼 순서가
  //   유저별로 다르거나 toggle 텍스트가 "켜짐" 같은 변형이면 누락. 한국 셀러가
  //   "두 개만 들어온다" 고 한 케이스의 주 원인.
  // - 변경: 캠페인명이 있는 모든 row 를 수집하고, 토글/상태 텍스트는 셀 전체에서
  //   휴리스틱 검색. ON/OFF 판정은 toggle aria-checked / class / 텍스트 모두 시도.
  // - 캠페인 상태(운영중/일시정지)는 보존만 하고 sweep 큐 진입 필터로 쓰지 않음
  //   → 사용자가 "캠페인 모두 다" 요구. paused 도 광고 전략 분석용.
  function listAllCampaignsFromDashboard() {
    const grid = document.querySelector(".rt-table, [class*='rt-table'], [role='grid']");
    if (!grid) return [];
    const rowGroups = Array.from(grid.querySelectorAll(".rt-tbody .rt-tr-group"));
    const out = [];
    for (const rg of rowGroups) {
      const cells = Array.from(rg.querySelectorAll("[role='gridcell']"));
      if (cells.length === 0) continue;

      // 캠페인명 — .dashboard-title (anchor 내부) 우선
      const titleEl = rg.querySelector(".dashboard-title");
      const name = normalizeText(titleEl?.innerText || cells[0]?.innerText || "");
      if (!name) continue;
      const anchor =
        titleEl?.closest?.("a[href]") ||
        titleEl?.querySelector?.("a[href]") ||
        rg.querySelector("a[href*='/campaign/'], a[href*='campaignId=']");
      const href = anchor?.href || anchor?.getAttribute?.("href") || "";
      const identity = campaignIdentityFromHref(href);
      if (!identity) {
        console.warn("[KIDITEM] campaign identity missing", name);
        continue;
      }

      // ON/OFF 토글 — 어떤 셀이든 "ON"/"OFF" 텍스트 또는 ant-switch checked 속성으로 판정
      let onOff = "";
      for (const c of cells) {
        const t = normalizeText(c.innerText || "").toUpperCase();
        if (t === "ON" || t === "OFF") {
          onOff = t;
          break;
        }
        const sw = c.querySelector(".ant-switch, [role='switch']");
        if (sw) {
          const checked =
            sw.getAttribute("aria-checked") === "true" ||
            String(sw.className || "").includes("ant-switch-checked");
          onOff = checked ? "ON" : "OFF";
          break;
        }
      }

      // 상태 — "운영", "중지", "일시 정지" 같은 키워드 포함 셀
      let status = "";
      for (const c of cells) {
        const t = normalizeText(c.innerText || "");
        if (/운영|중지|정지|준비|승인|대기/.test(t)) {
          status = t;
          break;
        }
      }

      out.push({
        identity,
        campaignId: campaignIdFromHref(href),
        href: canonicalCampaignHref(href),
        name,
        onOff,
        status,
      });
    }
    return out;
  }

  // 캠페인 상세 페이지 안의 product table 페이지네이션 — 페이지 1, 2, 3... 모든 상품 수집.
  // 각 페이지마다 parseCampaignTable() 호출해 rawRows / normalizedRows 누적.
  // dedupe key: 정규화된 row 의 productId 또는 첫 셀 텍스트.
  async function parseAcrossProductPages() {
    const allRaw = [];
    const allNorm = [];
    let chosenHeaders = [];
    let chosenPageType = "";
    const seenKeys = new Set();

    const dedupKey = (raw) => {
      // raw 는 원본 cell 텍스트들의 객체 — 가장 안정적인 ID 컬럼을 키로
      if (!raw || typeof raw !== "object") return JSON.stringify(raw);
      const candidates = ["상품ID", "옵션ID", "ID", "광고ID", "키워드", "상품명"];
      for (const k of Object.keys(raw)) {
        const lower = String(k).toLowerCase();
        if (candidates.some((c) => k.includes(c) || lower.includes(c.toLowerCase()))) {
          const v = String(raw[k] || "").trim();
          if (v) return v;
        }
      }
      return JSON.stringify(raw).slice(0, 200);
    };

    // safetyBreak: 캠페인 하나당 최대 8 페이지 (= 80 상품) 까지 순회.
    //   이전 30 은 너무 관대해 — 실제 데이터는 4~5 페이지 max. 초과 시 sweep 흐름이
    //   한 캠페인에서 5분 이상 멈춰 사용자가 "함수가 멈췄다" 인식.
    let safetyBreak = 0;
    while (safetyBreak++ < 8) {
      const parsed = parseCampaignTable();
      let pageNew = 0;
      for (let i = 0; i < parsed.rawRows.length; i++) {
        const raw = parsed.rawRows[i];
        const norm = parsed.normalizedRows[i];
        const key = dedupKey(raw);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        allRaw.push(raw);
        if (norm) allNorm.push(norm);
        pageNew++;
      }
      if (parsed.headers.length > chosenHeaders.length) chosenHeaders = parsed.headers;
      if (parsed.pageType && !chosenPageType) chosenPageType = parsed.pageType;
      console.log("[KIDITEM page]", { iter: safetyBreak, rowsThisPage: parsed.rawRows.length, newAfterDedupe: pageNew, totalCollected: allRaw.length });

      const pag = parsePaginationInfo();
      if (!pag.totalPages || pag.totalPages <= 1) break;
      if (pag.currentPage >= pag.totalPages) break;
      if (pageNew === 0) break; // 페이지가 안 바뀌었거나 dedupe 100% — 무한 루프 방지

      const moved = await goToNextPage();
      if (!moved) break;
      // product table re-render 대기 — 5초로 단축 (이전 10초). 5초 안에 안 채워지면 break.
      // 이전: 10초 기다리고 newPag 검사로 break → 페이지 응답 느릴 때 매 페이지 11초 hang.
      const start = Date.now();
      while (Date.now() - start < 5000) {
        const newPagInner = parsePaginationInfo();
        if (newPagInner.currentPage > pag.currentPage) break; // 페이지 번호가 바뀌면 즉시 진행
        await sleep(250);
      }
      await sleep(500);
      const newPag = parsePaginationInfo();
      if (newPag.currentPage <= pag.currentPage) break; // 진행 못 한 경우
    }

    return {
      rawRows: allRaw,
      normalizedRows: allNorm,
      headers: chosenHeaders,
      pageType: chosenPageType,
    };
  }

  // 대시보드 그리드 렌더 대기 (rows + .dashboard-title 둘 다 채워질 때까지)
  // 이전: rows.length > 0 만 보고 바로 통과 → row 가 mount 됐지만 .dashboard-title
  // 이 아직 비어있는 짧은 시점에 listAllCampaignsFromDashboard 가 빈 배열 반환 → 외부
  // 루프가 "더 처리할 캠페인 없음" 으로 판단하고 break 해버리는 race. .dashboard-title
  // 셀에 텍스트가 들어올 때까지 추가 대기.
  async function waitForDashboardGrid(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const grid = document.querySelector(".rt-table, [class*='rt-table'], [role='grid']");
      const rows = grid?.querySelectorAll(".rt-tbody .rt-tr-group") || [];
      if (rows.length > 0) {
        const titled = Array.from(rows).filter((r) => {
          const t = r.querySelector(".dashboard-title");
          return t && normalizeText(t.innerText || "").length > 0;
        });
        if (titled.length > 0) return true;
      }
      await sleep(300);
    }
    return false;
  }

  // 캠페인 상세 페이지 진입 대기 — "대시보드 list 가 아니다 + grid 가 채워졌다" 만 확인.
  // 이전: URL 패턴 /campaign/X/group/Y/product 강제 + page-name 정확 일치 → AI스마트광고
  // 등 다른 URL 패턴이거나 page-name 이 다르게 표기되면 timeout. 더 관대한 매칭으로 변경.
  async function waitForCampaignDetailPage(expectedName, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const onDashboardList = isDashboardListPage();
      const grid = document.querySelector(".rt-table, [class*='rt-table'], [role='grid'], table");
      const rtRows = grid?.querySelectorAll(".rt-tbody .rt-tr-group").length || 0;
      const tableRows = grid?.querySelectorAll("tbody tr").length || 0;
      const hasGrid = rtRows > 0 || tableRows > 0;
      if (!onDashboardList && hasGrid) return true;
      await sleep(300);
    }
    console.warn("[KIDITEM] waitForCampaignDetailPage timeout for", expectedName, "url:", window.location.href);
    return false;
  }

  // 캠페인명으로 anchor 찾아 클릭 (DOM rebuild 가능성 → 매번 fresh lookup)
  function clickCampaignAnchor(campaign) {
    const grid = document.querySelector(".rt-table, [class*='rt-table'], [role='grid']");
    if (!grid) return false;
    const rowGroups = Array.from(grid.querySelectorAll(".rt-tbody .rt-tr-group"));
    for (const rg of rowGroups) {
      const titleEl = rg.querySelector(".dashboard-title");
      if (!titleEl) continue;
      const anchor = titleEl.closest("a");
      const identity = campaignIdentityFromHref(anchor?.href || anchor?.getAttribute?.("href") || "");
      if (identity === campaign.identity) {
        if (anchor) {
          anchor.click();
          return true;
        }
      }
    }
    return false;
  }

  function buildCampaignReportAuthorityEnvelope(campaign, businessDate) {
    if ((campaign?.onOff || "").trim().toUpperCase() === "OFF") {
      return { campaignReportScope: "single_campaign_metadata_raw" };
    }
    return {
      campaignReportScope: "single_campaign_authoritative",
      period: "1d",
      periodLabel: "어제",
      startDate: businessDate,
      endDate: businessDate,
      dateFrom: businessDate,
      dateTo: businessDate,
    };
  }

  function buildCampaignOnlyRows(campaign) {
    return {
      rawRows: [{
        campaignId: campaign.campaignId,
        campaignHref: campaign.href,
        campaignIdentity: campaign.identity,
        campaignName: campaign.name,
        dashboardOnOff: campaign.onOff,
        dashboardStatus: campaign.status,
        _campaignOnly: true,
      }],
      normalizedRows: [{
        pageType: "campaign",
        campaignId: campaign.campaignId,
        campaignIdentity: campaign.identity,
        campaignName: campaign.name,
        onOff: campaign.onOff,
        status: campaign.status,
        _campaignOnly: true,
      }],
    };
  }

  function attachCampaignIdentityToRows(campaign, rawRows = [], normalizedRows = []) {
    const identity = {
      campaignId: campaign.campaignId || null,
      campaignIdentity: campaign.identity,
      campaignName: campaign.name,
    };
    return {
      rawRows: rawRows.map((row) => ({
        ...(row && typeof row === "object" ? row : { value: row }),
        ...identity,
        campaignHref: campaign.href || null,
      })),
      normalizedRows: normalizedRows.map((row) => ({
        ...(row && typeof row === "object" ? row : { value: row }),
        ...identity,
      })),
    };
  }

  // sessionStorage-backed seen — content script 가 reload 돼도 sweep 이어서 진행.
  // 이전: 매 reload 마다 seen=[] 으로 시작 → 같은 첫 N 개만 처리되는 무한 루프 위험.
  const SEEN_KEY = "kiditem_ad_sweep_seen_v1";
  const PROGRESS_KEY = "kiditem_ad_sweep_progress_v1";
  function loadSeen() {
    try {
      const raw = sessionStorage.getItem(SEEN_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }
  function saveSeen(seen) {
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    } catch {}
  }
  function clearSweepState() {
    try {
      sessionStorage.removeItem(SEEN_KEY);
      sessionStorage.removeItem(PROGRESS_KEY);
    } catch {}
  }
  function loadProgress() {
    try {
      const raw = sessionStorage.getItem(PROGRESS_KEY);
      return raw ? JSON.parse(raw) : { synced: 0, failed: 0, totalRows: 0, errors: [] };
    } catch {
      return { synced: 0, failed: 0, totalRows: 0, errors: [] };
    }
  }
  function saveProgress(p) {
    try {
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch {}
  }

  async function runDashboardSweep() {
    if (!isDashboardListPage()) {
      return { success: false, error: "대시보드 페이지가 아닙니다", url: window.location.href };
    }

    const yesterday = getYesterdayYmd();
    const resumeSeen = loadSeen();
    const resumeProgress = loadProgress();
    if (resumeSeen.size > 0) {
      showBadge(`▶️ 이어서 동기화 — ${yesterday} (${resumeSeen.size}개 완료, 이어서 진행)`, "#6366f1");
    } else {
      showBadge(`🔄 광고 동기화 시작 — ${yesterday}`, "#6366f1");
    }

    // 1) 대시보드 그리드 렌더 대기 (기본 7일 상태 유지 — 날짜 변경 금지)
    //    이유: 대시보드에서 setDateRange(어제) 하면 운영중 캠페인 행이 사라져서 sweep 자체가 빈 큐로 끝남.
    //    날짜 변경은 각 캠페인 상세 페이지에 진입한 뒤에 수행한다.
    if (!(await waitForDashboardGrid(15000))) {
      showBadge("❌ 캠페인 목록 로드 실패", "#ef4444");
      return { success: false, error: "dashboard grid not loaded" };
    }
    // 그리드 첫 행 mount 직후 onOff/status 셀이 늦게 채워지는 케이스 대응
    await sleep(1200);

    // 2) 모든 캠페인 sweep — 페이지별 interleaved 처리.
    //    이유: pre-collection 후 per-campaign 처리하면 history.back() 이 어느 페이지로
    //    돌려놓을지 보장 못 함 (Coupang dashboard SPA 가 페이지 state 를 항상 보존하지
    //    않음). page-by-page 처리 + seen 셋으로 dedupe → 어떤 페이지로 떨어져도 중복
    //    수집 없이 진행.
    let synced = resumeProgress.synced || 0;
    let failed = resumeProgress.failed || 0;
    let totalRows = resumeProgress.totalRows || 0;
    const errors = Array.isArray(resumeProgress.errors) ? [...resumeProgress.errors] : [];
    const seen = resumeSeen; // 처리 완료된 캠페인명 (sessionStorage 영속)
    let totalDiscovered = seen.size; // 진행률 표시용 — resume 시 이어서 카운트

    let pageGuard = 0;
    while (pageGuard++ < 100) {
      // 현재 페이지 캠페인 중 아직 처리 안 한 것
      // 첫 진입 후 history.back 으로 돌아왔을 때 행은 mount 됐지만 .dashboard-title
      // 이 비어있는 짧은 race 가 있어 retry 로 보강.
      let pageCamps = listAllCampaignsFromDashboard().filter((c) => !seen.has(c.identity));
      let allCampsOnPage = listAllCampaignsFromDashboard();
      if (pageCamps.length === 0 && allCampsOnPage.length === 0) {
        // grid 자체가 늦게 채워지는 케이스 — 최대 6초 추가 대기
        for (let r = 0; r < 12 && allCampsOnPage.length === 0; r++) {
          await sleep(500);
          allCampsOnPage = listAllCampaignsFromDashboard();
        }
        pageCamps = allCampsOnPage.filter((c) => !seen.has(c.identity));
      }
      const pag = parsePaginationInfo();
      console.log("[KIDITEM sweep]", { iter: pageGuard, currentPage: pag.currentPage, totalPages: pag.totalPages, pageCamps: pageCamps.length, totalOnPage: allCampsOnPage.length, seen: seen.size });

      if (pageCamps.length === 0) {
        // 현재 페이지에서 더 처리할게 없음 → 다음 페이지로
        if (!pag.totalPages || pag.totalPages <= 1) break;
        if (pag.currentPage >= pag.totalPages) break;
        const moved = await goToNextPage();
        if (!moved) break;
        await waitForDashboardGrid(15000);
        await sleep(800);
        continue;
      }

      // 첫 미처리 캠페인 1개 처리 (한 번에 한 개씩 — anchor 클릭 후 SPA 네비)
      const camp = pageCamps[0];
      seen.add(camp.identity);
      saveSeen(seen); // 클릭 직전 영속 — reload 돼도 이 캠페인은 skip
      totalDiscovered++;
      const i = totalDiscovered;
      showBadge(`📥 [${i}] ${camp.name} 진입 중... (page ${pag.currentPage}/${pag.totalPages || 1})`, "#f59e0b");

      // 2a) anchor 클릭 — 동일 인스턴스 SPA 라우팅
      const clicked = clickCampaignAnchor(camp);
      if (!clicked) {
        failed++;
        errors.push({ name: camp.name, error: "anchor not found" });
        saveProgress({ synced, failed, totalRows, errors });
        continue;
      }

      // 2b) 상세 페이지 + 그리드 렌더 대기
      const detailOk = await waitForCampaignDetailPage(camp.name, 20000);
      if (!detailOk) {
        failed++;
        errors.push({ name: camp.name, error: "detail page load timeout" });
        saveProgress({ synced, failed, totalRows, errors });
        try { history.back(); } catch {}
        await waitForDashboardGrid(15000);
        await sleep(800);
        continue;
      }

      // 2c) 상세 페이지에서 날짜 picker 를 "어제" 단일일자로 설정 — OFF 캠페인은 skip
      //   OFF 인 캠페인은 어제 데이터가 0 인 게 자명 + 날짜 picker rendering 이 느림
      //   → setDateRange 가 실패하거나 5초+a 잡아먹어 sweep 전체 hang 인식. 그냥 7d 기본
      //   그대로 두고 KPI 0 으로 sync (서버는 OFF 캠페인 등록 자체가 목적).
      const isOffCampaign = (camp.onOff || "").toUpperCase() === "OFF";
      let dateOk = true;
      if (!isOffCampaign) {
        showBadge(`📅 [${i}] ${camp.name} — ${yesterday} 적용 중...`, "#6366f1");
        dateOk = await setDateRange(yesterday);
      } else {
        console.log("[KIDITEM sweep] skip setDateRange (OFF campaign)", camp.name);
      }
      if (!dateOk) {
        failed++;
        errors.push({ name: camp.name, error: "date_picker_failed" });
        saveProgress({ synced, failed, totalRows, errors });
        try { history.back(); } catch {}
        await waitForDashboardGrid(15000);
        await sleep(800);
        continue;
      }
      if (!isOffCampaign) await sleep(2000);

      // OFF는 현재 대시보드 상태 증거일 뿐 과거 날짜의 0 실적 증거가 아니다.
      // ON만 상세 일자 데이터를 읽고, OFF는 identity/state descriptor만 보낸다.
      showBadge(`📊 [${i}] ${camp.name} 수집 중...`, "#f59e0b");
      const parsed = isOffCampaign
        ? { ...buildCampaignOnlyRows(camp), headers: [], pageType: "campaign" }
        : await parseAcrossProductPages();
      const kpis = isOffCampaign ? {} : parseAdKpis();
      const rowCount = isOffCampaign ? 0 : parsed.normalizedRows.length;
      console.log("[KIDITEM sweep] parsed campaign", camp.name, { rows: parsed.rawRows.length, normalizedRows: rowCount });

      const emptyDescriptor = buildCampaignOnlyRows(camp);
      const persisted = attachCampaignIdentityToRows(
        camp,
        parsed.rawRows.length > 0 ? parsed.rawRows : emptyDescriptor.rawRows,
        parsed.normalizedRows.length > 0
          ? parsed.normalizedRows
          : emptyDescriptor.normalizedRows,
      );
      const authorityEnvelope = buildCampaignReportAuthorityEnvelope(camp, yesterday);

      // 사용자 요구: 데이터(rows/kpis) 가 0 이라도 캠페인 자체는 등록되어야 함.
      //   "쿠팡이랑 똑같이 동기화하라고 했잖아 데이터가 없어도 만들고"
      // 이전: rowCount===0 && kpis 비면 skip → OFF 캠페인 + 광고센터 KPI widget 못 읽은 케이스
      //   완전히 누락. 항상 syncToServer 호출하고 서버가 level='campaign' 빈 row 만들도록 위임.
      const json = await syncToServer({
        type: "ad_campaign",
        source: "advertising",
        campaignName: camp.name,
        ...authorityEnvelope,
        data: persisted.rawRows,
        normalizedRows: persisted.normalizedRows,
        ...(!isOffCampaign ? {
          headers: parsed.headers,
          pageType: parsed.pageType,
          kpis,
        } : {}),
        dashboardOnOff: camp.onOff,
        dashboardStatus: camp.status,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      });
      if (json?.success) {
        synced++;
        totalRows += rowCount;
        showBadge(`✓ [${i}] ${camp.name} — ${rowCount}행 동기화 (총 ${synced} 캠페인)`, "#22c55e");
      } else {
        failed++;
        errors.push({ name: camp.name, error: json?.error || "sync 실패" });
      }
      saveProgress({ synced, failed, totalRows, errors });

      // 2e) 대시보드로 복귀 — 어느 페이지로 떨어지든 OK (seen 셋이 dedupe)
      try { history.back(); } catch {}
      const backOk = await waitForDashboardGrid(15000);
      if (!backOk) {
        // sessionStorage 에 seen + progress 남아있으니 reload 후 이어서 진행
        showBadge(`🔁 dashboard 복귀 실패 — 새로고침 후 이어서 진행 (${synced}/${totalDiscovered})`, "#f59e0b");
        window.location.href = "https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1";
        return { success: false, error: "dashboard 복귀 실패 — 페이지 새로고침", synced, failed, totalRows };
      }
      await sleep(1000);
    }

    if (totalDiscovered === 0) {
      clearSweepState();
      showBadge("ℹ️ 캠페인 없음 — 동기화 종료", "#94a3b8");
      return { success: true, type: "ad_sync", campaigns: 0, totalRows: 0 };
    }

    // sweep 정상 완료 — sessionStorage 비워서 다음 sync 가 처음부터 시작.
    clearSweepState();

    const summary = `✅ 동기화 완료 — ${synced}/${totalDiscovered} 캠페인 (총 ${totalRows}행)`;
    showBadge(summary, failed > 0 ? "#f59e0b" : "#22c55e");

    return {
      success: failed === 0,
      type: "ad_sync",
      campaigns: synced,
      failed,
      totalRows,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // doSync / runDashboardSweep 중복 실행 방지 — auto-trigger + manualSync 동시 시 같은 Promise 공유
  let currentSync = null;
  function runSyncOnce() {
    if (!currentSync) {
      // hash 기반 모드 분기. #kiditemAdSync=1 이면 sweep, 아니면 단일 페이지 doSync.
      const isAdSync = /#kiditemAdSync=1/.test(window.location.hash || "");
      const job = isAdSync ? runDashboardSweep() : doSync();
      currentSync = job.finally(() => {
        currentSync = null;
      });
    }
    return currentSync;
  }

  let currentActionExecution = null;
  function runApprovedActionsOnce() {
    if (!currentActionExecution) {
      currentActionExecution = fetchApprovedQueuedActions(20)
        .then((actions) => {
          if (actions.length === 0) {
            showBadge("ℹ️ 실행할 승인 액션이 없습니다.", "#94a3b8");
            return { success: true, executed: 0, skipped: 0 };
          }
          return executeApprovedActions(actions, `${SERVER}/api/ads/actions`);
        })
        .finally(() => {
          currentActionExecution = null;
        });
    }
    return currentActionExecution;
  }

  // Pure content-script contract used by fixture tests.
  globalThis.KidItemAdsReportContract = Object.freeze({
    attachCampaignIdentityToRows,
    buildCampaignOnlyRows,
    buildCampaignReportAuthorityEnvelope,
    campaignIdFromHref,
    campaignIdentityFromHref,
  });

  // URL flag 기반 자동 모드.
  // 주의: 플래그가 없으면 자동 수집을 돌리지 않는다. 광고 등록 OAuth/login redirect 중
  // hash 가 사라진 뒤 dashboard 로 돌아왔을 때 공지사항/대시보드 수집이 잘못 시작되는 문제 방지.
  // - #targetDate=YYYY-MM-DD : 단일 페이지 단일 날짜 수집 (legacy)
  // - #kiditemAdSync=1       : 대시보드 sweep (운영중 캠페인 일괄)
  // - kiditemExecuteActions=1: 승인된 광고 액션 자동 실행
  const hrefForMode = `${window.location.search || ""}${window.location.hash || ""}`;
  const isBatchMode =
    /targetDate=\d{4}-\d{2}-\d{2}/.test(hrefForMode) ||
    /kiditemAdSync=1/.test(hrefForMode);
  const isActionMode = /kiditemExecuteActions=1/.test(hrefForMode) ||
    sessionStorage.getItem("kiditemExecuteActions") === "1";
  if (isActionMode) {
    sessionStorage.setItem("kiditemExecuteActions", "1");
  }

  setTimeout(() => {
    if (!isActionMode && !isBatchMode) {
      return;
    }
    const runner = isActionMode ? runApprovedActionsOnce() : runSyncOnce();
    runner.then((result) => {
      if (isActionMode) {
        sessionStorage.removeItem("kiditemExecuteActions");
      }
      if (isBatchMode) {
        try {
          chrome.runtime.sendMessage({
            action: "reportBatchScrapeDone",
            success: !!result?.success,
            url: window.location.href,
          });
        } catch {}
      }
    });
  }, 3000);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      runSyncOnce().then((result) => sendResponse(result));
      return true;
    }

    if (msg.action === "executeApprovedAdActions") {
      const payload = msg.payload || {};
      executeApprovedActions(payload.actions || [], payload.apiUrl || `${SERVER}/api/ads/actions`)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message || "실행 실패" }));
      return true;
    }

    if (msg.action === "runApprovedQueuedAdActions") {
      runApprovedActionsOnce()
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message || "실행 실패" }));
      return true;
    }
  });
})();
