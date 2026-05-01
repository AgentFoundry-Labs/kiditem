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
    // 1) React-Table v6 (쿠팡 광고 상세 product 테이블 + 대시보드 캠페인 테이블).
    //    DOM: .pagination-bottom input[aria-label="jump to page"] (현재 페이지 number input)
    //         + .pagination-bottom .-totalPages (총 페이지 수 span).
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

  // URL hash에서 #targetDate=YYYY-MM-DD 읽기 — 일별 백필 배치 모드 트리거.
  function getTargetDateFromHash() {
    const hash = window.location.hash || "";
    const match = hash.match(/targetDate=(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  // "최근 7일" 기간 프리셋 버튼 클릭 — 캠페인 상세 진입 시 기본 기간 보정.
  // TODO: Playwright 로 실제 셀렉터 확인 후 교체 — 현재는 텍스트 매칭 휴리스틱.
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

  // 페이지네이션: 다음 페이지 버튼 클릭 후 테이블 재로딩 대기.
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

  // 날짜 피커를 특정 날짜로 설정 — 단일일자 백필용.
  // 쿠팡 광고 대시보드는 AntD range calendar. 트리거 → popup → 좌측 패널 월 네비 → 날짜 셀 두 번 클릭 → 적용.
  async function setDateRange(ymd) {
    const [targetY, targetM, targetD] = ymd.split("-").map((v) => parseInt(v, 10));

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
    let popup = null;
    for (let i = 0; i < 15; i++) {
      popup = document.querySelector(".ant-dropdown.dashboard-metric-widget-calendar-dropdown");
      if (popup && !popup.classList.contains("ant-dropdown-hidden")) break;
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

    // 3) 좌측 패널 year/month 를 타겟으로 네비게이션
    const readHeader = () => {
      const y = parseInt(left.querySelector(".ant-calendar-year-select")?.textContent?.replace(/[^\d]/g, "") || "0", 10);
      const m = parseInt(left.querySelector(".ant-calendar-month-select")?.textContent?.replace(/[^\d]/g, "") || "0", 10);
      return { y, m };
    };

    let guard = 0;
    while (guard++ < 60) {
      const { y, m } = readHeader();
      if (y === targetY && m === targetM) break;
      // diff = (targetY*12+targetM) - (y*12+m). 음수면 과거로 이동 (prev-month), 양수면 미래 (next-month).
      // AntD range calendar 는 좌측=prev-only, 우측=next-only 라 미래로 갈 때 우측의 next 버튼을 클릭해야 함.
      const diff = (targetY * 12 + targetM) - (y * 12 + m);
      if (diff === 0) break;
      let btn = null;
      if (diff < 0) {
        btn = left.querySelector(".ant-calendar-prev-month-btn");
      } else {
        btn = (right && right.querySelector(".ant-calendar-next-month-btn"))
          || left.querySelector(".ant-calendar-next-month-btn");
      }
      if (!btn) {
        console.warn(`[KIDITEM] setDateRange: month nav btn not found (diff=${diff})`);
        return false;
      }
      btn.click();
      await sleep(180);
    }

    // 4) 날짜 셀 찾기 (이전/다음 달 셀 제외)
    const cells = left.querySelectorAll("td.ant-calendar-cell:not(.ant-calendar-last-month-cell):not(.ant-calendar-next-month-cell)");
    let targetCell = null;
    for (const c of cells) {
      const txt = c.querySelector(".ant-calendar-date")?.textContent?.trim();
      if (txt === String(targetD)) {
        targetCell = c.querySelector(".ant-calendar-date");
        break;
      }
    }
    if (!targetCell) {
      console.warn(`[KIDITEM] setDateRange: target cell ${targetD} not found in left panel`);
      return false;
    }

    // 5) 같은 날짜 두 번 클릭 → range start=end=ymd
    targetCell.click();
    await sleep(200);
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

  // 안전 상한 — 한 번에 50 페이지까지만 순회. 캠페인 detail 페이지 평균이 1~10p 라
  // 50 은 충분한 여유 + 폭주 방지.
  const MAX_PAGES_PER_SYNC = 50;

  async function doSync() {
    // hash 에 targetDate 가 있으면 먼저 날짜 피커 설정 (일별 백필 배치 모드)
    const targetDate = getTargetDateFromHash();
    if (targetDate) {
      showBadge(`📅 ${targetDate} 날짜 설정 중...`, "#6366f1");
      const ok = await setDateRange(targetDate);
      if (!ok) {
        // 날짜 설정 실패 시 7일 기본값으로 저장하면 일별 집계와 섞여 중복 계산됨. 차라리 중단.
        showBadge(`❌ ${targetDate} 날짜 피커 설정 실패 — 수집 중단 (7일치 오염 방지)`, "#ef4444");
        return { success: false, reason: "date_picker_failed", targetDate };
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

    // targetDate 해시가 있으면 "그 하루치"를 수집하는 배치 모드 — period 를 '1d'로 강제.
    // 서버는 일별 스냅샷(period='1d')만 합산해 월간 KPI를 만들기 때문에, 7d/30d 누적값이 섞이면 중복 집계됨.
    if (targetDate) {
      period = "1d";
      dateFrom = targetDate;
      dateTo = targetDate;
    }

    // 1페이지 파싱
    const firstPage = parseCampaignTable();
    const aggregatedRaw = [...firstPage.rawRows];
    const aggregatedNormalized = [...firstPage.normalizedRows];
    const headers = firstPage.headers;
    const pageType = firstPage.pageType;
    const pagination = parsePaginationInfo();
    const totalPages = Math.min(pagination.totalPages || 1, MAX_PAGES_PER_SYNC);

    // 페이지 순회 — dedupe 는 externalId 기준 (동일 row 중복 적재 방지)
    const seenIds = new Set(aggregatedNormalized.map((r) => r.externalId));
    let currentPage = pagination.currentPage || 1;
    let safetyBreak = 0;

    while (currentPage < totalPages && safetyBreak < MAX_PAGES_PER_SYNC) {
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
        // 서버 DTO 가 startDate/endDate 를 기대 (whitelist 로 dateFrom/dateTo 만으로는 일부 경로 drop).
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

  setTimeout(doSync, 3000);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      doSync().then((result) => sendResponse(result));
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
