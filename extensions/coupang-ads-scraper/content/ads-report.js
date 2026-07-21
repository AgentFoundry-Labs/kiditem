// KIDITEM OS — 쿠팡 광고센터 (advertising.coupang.com) 데이터 수집 + 승인 액션 실행

(function () {
  "use strict";

  const SERVER = "http://localhost:4000";

  // showBadge is loaded from utils/dom.js via manifest

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 백그라운드 창에서 수집이 실패하던 직접 원인.
  //
  // 수집 창은 `chrome.windows.create({ focused: false })` 로 열린다. 그 창이
  // 다른 창에 가려지면 Chrome 은 그 탭을 hidden 으로 보고 타이머를 클램프한다.
  // 5분 넘게 hidden 이면 intensive throttling 이 걸려 nested timer 예산이
  // 분당 1회까지 떨어진다.
  //
  // 기존 대기 루프는 전부 `while (Date.now() - start < timeoutMs) { ... await
  // sleep(300) }` 형태였다. sleep(300) 이 60초로 늘어나면 15초 예산은 조건을
  // 딱 한 번 검사한 뒤 만료된다. 즉 백그라운드에서는 모든 대기가 사실상
  // "1회 시도 후 타임아웃" 이 된다. 광고센터 탭을 눈으로 열어두면 되는데
  // 백그라운드면 실패하던 증상이 이것이다.
  //
  // 실측 뒷받침: 캠페인 목록 스크레이프(수집 초반, 5분 이내)는 백그라운드에서도
  // 값이 들어왔지만(2026-07-18·19 집행 광고비 48,196원·47,676원 정상 수집),
  // 그 뒤 캠페인 상세 sweep 은 한 행도 남기지 못했다.
  //
  // 그래서 벽시계 예산과 별개로 최소 시도 횟수를 보장한다. 스로틀이 걸리면
  // 느려질 뿐 실패하지는 않는다.
  const THROTTLED_MIN_ATTEMPTS = 6;

  async function pollUntil(check, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || 10000;
    const intervalMs = Number(options.intervalMs) || 300;
    const minAttempts = Number(options.minAttempts) || THROTTLED_MIN_ATTEMPTS;
    const now = options.now || (() => Date.now());
    const wait = options.wait || sleep;
    const startedAt = now();
    let attempts = 0;

    for (;;) {
      const result = await check();
      attempts += 1;
      if (result) return result;
      // 예산이 남았거나, 아직 최소 시도 횟수를 못 채웠으면 계속한다.
      if (now() - startedAt >= timeoutMs && attempts >= minAttempts) {
        return null;
      }
      await wait(intervalMs);
    }
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
  }

  function parseNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value || "").replace(/,/g, "").trim();
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed)) return 0;

    // 쿠팡 KPI 위젯은 큰 수를 `1.2만`, `3.4억`처럼 축약한다. 숫자만
    // 남기면 각각 1.2/3.4로 축소 저장되므로 숫자 바로 뒤의 단위를 반영한다.
    const suffix = normalized.slice((match.index || 0) + match[0].length).trim();
    const multiplier = suffix.startsWith("억")
      ? 100_000_000
      : suffix.startsWith("만")
        ? 10_000
        : suffix.startsWith("천")
          ? 1_000
          : 1;
    return parsed * multiplier;
  }

  const CONVERSION_COUNT_HEADERS = [
    "광고 전환 판매수",
    "전환 판매수",
    "광고 전환수",
    "전환수",
    "conversion sales",
    "conversions",
  ];

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
    if (typeof entry === "object" && "value" in entry) {
      const rawValue = String(entry.value || "");
      if (/[천만억]/.test(rawValue)) return rawValue;
      const scaleUnit = normalizeText(entry.unit || "").match(/[천만억]/)?.[0] || "";
      return scaleUnit ? `${rawValue}${scaleUnit}` : rawValue;
    }
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
    const observed = {
      adSpend: false,
      adRevenue: false,
      impressions: false,
      clicks: false,
      conversions: false,
      orders: false,
    };
    const observationFields = {
      adSpend: ["runningAdSpend", "spend"],
      adRevenue: ["revenue"],
      impressions: ["impressions"],
      clicks: ["clicks"],
      conversions: ["conversions"],
      orders: ["orders"],
    };
    const totals = rows.reduce(
      (acc, row) => {
        for (const [metric, fields] of Object.entries(observationFields)) {
          const parserEvidence = row?._observedMetrics;
          const hasParserEvidence =
            parserEvidence &&
            Object.prototype.hasOwnProperty.call(parserEvidence, metric);
          const rowObserved = hasParserEvidence
            ? parserEvidence[metric] === true
            : fields.some((field) =>
                Object.prototype.hasOwnProperty.call(row || {}, field) &&
                row[field] !== null &&
                row[field] !== undefined &&
                row[field] !== "");
          if (rowObserved) observed[metric] = true;
        }
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

    const adSpend = observed.adSpend
      ? totals.adSpend
      : getKpiNumber(kpis, ["집행 광고비", "광고비", "ad spend"]);
    const adRevenue = observed.adRevenue
      ? totals.adRevenue
      : getKpiNumber(kpis, ["광고 전환 매출", "광고 매출", "ad gmv", "매출"]);
    const impressions = observed.impressions
      ? totals.impressions
      : getKpiNumber(kpis, ["노출", "impression"]);
    const clicks = observed.clicks
      ? totals.clicks
      : getKpiNumber(kpis, ["클릭수", "clicks", "click count"]);
    const conversions = observed.conversions
      ? totals.conversions
      : getKpiNumber(kpis, ["전환 판매수", "전환수", "conversions", "conversion sales"]);
    const orders = observed.orders
      ? totals.orders
      : getKpiNumber(kpis, ["전환 주문수", "주문수", "order"]);
    const roas = getKpiNumber(kpis, ["광고 수익률", "광고수익률", "roas"]) ||
      (adSpend > 0 ? Math.round((adRevenue / adSpend) * 10000) / 100 : 0);
    const ctr = getKpiNumber(kpis, ["클릭률", "ctr"]) ||
      (impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0);
    const conversionRate = getKpiNumber(kpis, ["전환율", "conversion rate"]) ||
      (clicks > 0 ? Math.round((orders / clicks) * 10000) / 100 : 0);

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

  function evaluateExplicitEmptyDailyKpis(kpis) {
    const projected = buildCoupangAdsDailyRow("1970-01-01", [], kpis || {});
    const additive = {
      adSpend: projected.adSpend,
      adRevenue: projected.adRevenue,
      impressions: projected.impressions,
      clicks: projected.clicks,
      conversions: projected.conversions,
      orders: projected.orders,
    };
    const nonZeroMetrics = Object.entries(additive)
      .filter(([, value]) => Number(value) !== 0)
      .map(([key]) => key);
    return {
      consistent: nonZeroMetrics.length === 0,
      additive,
      nonZeroMetrics,
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
        return { currentPage: cur, totalPages: tot, verified: true, source: "react_table" };
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

    if (match) {
      return {
        currentPage: parseNumber(currentPageText || match[1]) || 1,
        totalPages: parseNumber(match[2]) || 1,
        verified: true,
        source: "text_counter",
      };
    }
    return {
      currentPage: parseNumber(currentPageText || "1") || 1,
      totalPages: 1,
      verified: false,
      source: "fallback",
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

  function findConversionCountHeaderIndex(headers) {
    return findHeaderIndex(headers, CONVERSION_COUNT_HEADERS);
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
    const clicks = extractValueByHeader(headers, cells, ["클릭수", "clicks", "click count"]);
    // `전환` 단독 매처는 `광고 전환 매출`까지 잡아 매출액을 판매수로 저장한다.
    // 판매수/전환수임이 명시된 헤더만 허용한다.
    const conversions = extractValueByHeader(headers, cells, CONVERSION_COUNT_HEADERS);
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
    const observedMetrics = {
      adSpend: findHeaderIndex(headers, ["집행 광고비", "광고비", "비용"]) >= 0,
      adRevenue: findHeaderIndex(headers, ["광고 전환 매출", "광고 매출", "전환매출", "매출"]) >= 0,
      impressions: findHeaderIndex(headers, ["노출", "impression"]) >= 0,
      clicks: findHeaderIndex(headers, ["클릭수", "clicks", "click count"]) >= 0,
      conversions: findConversionCountHeaderIndex(headers) >= 0,
      orders: findHeaderIndex(headers, ["광고 전환 주문수", "전환 주문수", "주문수", "order"]) >= 0,
    };
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
        _observedMetrics: observedMetrics,
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

  function findReportSurfaceRoot(element) {
    return element?.closest?.(
      ".ReactTable, .ant-spin-nested-loading, .ant-table-wrapper, [data-testid='report-grid']",
    ) || element;
  }

  function isAdReportHeaderSet(headers) {
    const joined = headers.map(normalizeKey).join(" ");
    return /캠페인|광고상품|상품명|키워드|집행 광고비|노출|클릭수|전환|campaign|product|keyword|impression|click count|ad spend|revenue/.test(
      joined,
    );
  }

  function parseCampaignTable() {
    const rawRows = [];
    const normalizedRows = [];
    let selectedHeaders = [];
    const surfaceRoots = [];
    const rememberSurfaceRoot = (element) => {
      const root = findReportSurfaceRoot(element);
      if (root && !surfaceRoots.includes(root)) surfaceRoots.push(root);
    };

    document.querySelectorAll("table").forEach((table) => {
      if (rawRows.length >= MAX_AD_ROWS) return;
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => normalizeText(th.innerText.replace(/\n/g, " ")));
      if (headers.length < 3 || !isAdReportHeaderSet(headers)) return;
      rememberSurfaceRoot(table);
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
      if (headers.length < 3 || !isAdReportHeaderSet(headers)) return;
      rememberSurfaceRoot(grid);

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

    return {
      rawRows,
      normalizedRows,
      headers: selectedHeaders,
      pageType: guessPageType(selectedHeaders),
      surfaceRoots,
    };
  }

  const REPORT_LOADING_SELECTORS = [
    ".ant-spin-spinning",
    ".rt-loading.-active",
    "[aria-busy='true']",
    "[data-testid='loading']",
  ];
  const REPORT_EMPTY_SELECTORS = [
    ".rt-noData",
    ".ant-empty",
    ".ant-table-placeholder",
    "[data-testid='empty-state']",
  ];

  function isElementVisible(element) {
    if (!element) return false;
    for (let current = element; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute?.("aria-hidden") === "true") {
        return false;
      }
      const style = typeof getComputedStyle === "function"
        ? getComputedStyle(current)
        : current.style || {};
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    if (typeof element.getClientRects === "function" && element.getClientRects().length === 0) {
      return false;
    }
    return true;
  }

  function visibleElementsWithin(roots, selectors) {
    const found = new Set();
    for (const root of roots || []) {
      for (const selector of selectors) {
        if (root?.matches?.(selector) && isElementVisible(root)) found.add(root);
        for (const element of Array.from(root?.querySelectorAll?.(selector) || [])) {
          if (isElementVisible(element)) found.add(element);
        }
      }
    }
    return [...found];
  }

  function isExplicitEmptyStateText(value) {
    return /^(?:(?:조회된|검색된)\s*)?(?:데이터|조회 결과|검색 결과|광고 실적|등록된 광고 상품|표시할 항목)(?:가|이)?\s*(?:없습니다|없어요|없음)\.?$|^no (?:data|results)(?: available)?\.?$/i
      .test(normalizeText(value));
  }

  function classifyReportSurfaceEvidence({ rowCount, loadingVisible, emptyText }) {
    if (loadingVisible) return { kind: "loading", explicitEmpty: false };
    if (Number(rowCount) > 0) return { kind: "rows", explicitEmpty: false };
    const normalizedEmptyText = normalizeText(emptyText);
    if (isExplicitEmptyStateText(normalizedEmptyText)) {
      return {
        kind: "empty",
        explicitEmpty: true,
        emptyText: normalizedEmptyText,
      };
    }
    return { kind: "unknown", explicitEmpty: false };
  }

  function readReportSurfaceState(parsed) {
    const roots = Array.isArray(parsed?.surfaceRoots) ? parsed.surfaceRoots : [];
    const loadingVisible = visibleElementsWithin(roots, REPORT_LOADING_SELECTORS).length > 0;
    const emptyText = visibleElementsWithin(roots, REPORT_EMPTY_SELECTORS)
      .map((element) => normalizeText(element.innerText || element.textContent || ""))
      .find(isExplicitEmptyStateText) || "";
    return classifyReportSurfaceEvidence({
      rowCount: parsed?.rawRows?.length || 0,
      loadingVisible,
      emptyText,
    });
  }

  function reportPageSignature(parsed) {
    const rows = Array.isArray(parsed?.normalizedRows) ? parsed.normalizedRows : [];
    const normalized = rows
      .map((row) => row?.externalId || row?.itemId || JSON.stringify(row || {}))
      .join("\u0001");
    if (normalized) return normalized;
    return (parsed?.rawRows || []).map((row) => JSON.stringify(row)).join("\u0001");
  }

  function readReportPageSnapshot() {
    const parsed = parseCampaignTable();
    return {
      ok: true,
      parsed,
      pagination: parsePaginationInfo(),
      surface: readReportSurfaceState(parsed),
      signature: reportPageSignature(parsed),
    };
  }

  async function readSettledReportPage(timeoutMs = 10000, options = {}) {
    const readSnapshot = options.readSnapshot || readReportPageSnapshot;
    const now = options.now || (() => Date.now());
    const wait = options.wait || sleep;
    let latest = readSnapshot();
    // pollUntil: 벽시계 예산과 별개로 최소 시도 횟수를 보장해 백그라운드
    // 타이머 스로틀에서도 그리드 렌더를 놓치지 않는다.
    const settled = await pollUntil(
      () => {
        latest = readSnapshot();
        const paginationReady =
          latest.surface.kind === "empty" || latest.pagination?.verified === true;
        return (
          (latest.surface.kind === "rows" || latest.surface.kind === "empty") &&
          paginationReady
        );
      },
      { timeoutMs, intervalMs: 250, now, wait },
    );
    if (settled) return latest;
    return {
      ...latest,
      ok: false,
      error: latest.surface.kind === "loading"
        ? "report_still_loading"
        : latest.surface.kind === "rows" && latest.pagination?.verified !== true
          ? "pagination_unverified"
          : "report_surface_unverified",
    };
  }

  async function advanceReportPage(previous, timeoutMs = 10000) {
    if (!(await goToNextPage())) {
      return { ok: false, error: "page_navigation_failed" };
    }

    let latest = readReportPageSnapshot();
    let sequenceGap = false;
    // pollUntil: 페이지 넘김 정착 대기도 백그라운드 스로틀에서 1회 시도로
    // 무너지지 않도록 최소 시도 횟수를 보장한다.
    const advanced = await pollUntil(
      () => {
        latest = readReportPageSnapshot();
        const currentPage = Number(latest.pagination?.currentPage) || 1;
        const previousPage = Number(previous.pagination?.currentPage) || 1;
        if (currentPage > previousPage + 1) {
          sequenceGap = true;
          return true;
        }
        const surfaceSettled = latest.surface.kind === "empty" ||
          (latest.surface.kind === "rows" && latest.pagination?.verified === true);
        const contentChanged =
          latest.surface.kind === "empty" || latest.signature !== previous.signature;
        return currentPage === previousPage + 1 && surfaceSettled && contentChanged;
      },
      { timeoutMs, intervalMs: 250 },
    );
    if (sequenceGap) {
      return { ok: false, error: "page_sequence_gap", snapshot: latest };
    }
    if (advanced) return { ok: true, snapshot: latest };

    const currentPage = Number(latest.pagination?.currentPage) || 1;
    const previousPage = Number(previous.pagination?.currentPage) || 1;
    return {
      ok: false,
      error: currentPage <= previousPage
        ? "page_number_not_increased"
        : "next_page_not_settled",
      snapshot: latest,
    };
  }

  function paginatedFailure(result, error, snapshot) {
    return {
      ...result,
      complete: false,
      error,
      lastPage: Number(snapshot?.pagination?.currentPage) || null,
    };
  }

  async function collectPaginatedReport(options = {}) {
    const maxPages = Math.max(1, Number(options.maxPages) || 1);
    const readPage = options.readPage || readSettledReportPage;
    const advancePage = options.advancePage || advanceReportPage;
    const result = {
      rawRows: [],
      normalizedRows: [],
      headers: [],
      pageType: "",
      expectedPages: 0,
      visitedPages: [],
      explicitEmpty: false,
      complete: false,
      error: null,
    };
    const seenPageSignatures = new Set();

    let snapshot = await readPage();
    if (!snapshot?.ok) {
      return paginatedFailure(result, snapshot?.error || "report_page_not_ready", snapshot);
    }

    const initialPage = Number(snapshot.pagination?.currentPage) || 1;
    const expectedPages = Number(snapshot.pagination?.totalPages) || 1;
    result.expectedPages = expectedPages;
    if (initialPage !== 1) {
      return paginatedFailure(result, "pagination_did_not_start_at_page_one", snapshot);
    }
    if (expectedPages > maxPages) {
      return paginatedFailure(result, "pagination_limit_exceeded", snapshot);
    }

    while (true) {
      const currentPage = Number(snapshot.pagination?.currentPage) || 1;
      const currentTotal = Number(snapshot.pagination?.totalPages) || 1;
      if (currentTotal !== expectedPages) {
        return paginatedFailure(result, "pagination_total_changed", snapshot);
      }
      if (result.visitedPages.includes(currentPage)) {
        return paginatedFailure(result, "page_number_not_increased", snapshot);
      }
      if (snapshot.surface?.kind === "empty") {
        if (expectedPages !== 1 || currentPage !== 1) {
          return paginatedFailure(result, "unexpected_empty_page", snapshot);
        }
        result.explicitEmpty = true;
      } else if (snapshot.surface?.kind !== "rows") {
        return paginatedFailure(result, "report_surface_unverified", snapshot);
      } else if (snapshot.pagination?.verified !== true) {
        return paginatedFailure(result, "pagination_unverified", snapshot);
      }

      const parsed = snapshot.parsed || {};
      const pageSignature = snapshot.signature || reportPageSignature(parsed);
      if (snapshot.surface?.kind === "rows" && seenPageSignatures.has(pageSignature)) {
        return paginatedFailure(result, "page_content_repeated", snapshot);
      }
      if (snapshot.surface?.kind === "rows") seenPageSignatures.add(pageSignature);
      for (let index = 0; index < (parsed.rawRows || []).length; index += 1) {
        const raw = parsed.rawRows[index];
        const normalized = parsed.normalizedRows?.[index] || null;
        result.rawRows.push(raw);
        if (normalized) result.normalizedRows.push(normalized);
      }
      if ((parsed.headers || []).length > result.headers.length) {
        result.headers = parsed.headers;
      }
      if (!result.pageType && parsed.pageType) result.pageType = parsed.pageType;
      result.visitedPages.push(currentPage);

      if (currentPage === expectedPages) {
        result.complete = result.visitedPages.length === expectedPages;
        return result.complete
          ? result
          : paginatedFailure(result, "pagination_pages_missing", snapshot);
      }

      const advanced = await advancePage(snapshot);
      if (!advanced?.ok || !advanced.snapshot) {
        return paginatedFailure(
          result,
          advanced?.error || "page_navigation_failed",
          advanced?.snapshot || snapshot,
        );
      }
      const nextPage = Number(advanced.snapshot.pagination?.currentPage) || 1;
      if (nextPage <= currentPage) {
        return paginatedFailure(result, "page_number_not_increased", advanced.snapshot);
      }
      if (nextPage !== currentPage + 1) {
        return paginatedFailure(result, "page_sequence_gap", advanced.snapshot);
      }
      snapshot = advanced.snapshot;
    }
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

  async function syncTargetDateDaily(targetDate, normalizedRows, kpis) {
    const dailyRow = buildCoupangAdsDailyRow(targetDate, normalizedRows, kpis);
    const response = await syncToServer({
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
    return { response, dailyRow };
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

  function normalizeDisplayedDate(value) {
    const match = String(value || "").match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (!match) return null;
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  function displayedRangeMatchesTarget(text, targetDate) {
    const displayedDates = String(text || "")
      .match(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g)
      ?.map(normalizeDisplayedDate)
      .filter(Boolean) || [];
    return displayedDates.length > 0 && displayedDates.every((date) => date === targetDate);
  }

  function getDateRangeTrigger() {
    return document.querySelector(
      "button.dashboard-metric-widget-date-indicator-revamp.ant-dropdown-trigger",
    );
  }

  async function waitForDisplayedTargetDate(targetDate, timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const trigger = getDateRangeTrigger();
      const displayed = normalizeText(trigger?.innerText || trigger?.textContent || "");
      if (displayedRangeMatchesTarget(displayed, targetDate)) return true;
      await sleep(250);
    }
    return false;
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

    // 테이블 재로딩 대기 후 트리거가 요청 날짜를 실제 표시하는지 확인한다.
    // 클릭 성공만 믿으면 달력 race 때 기본 7일치를 대상 하루로 오염시킬 수 있다.
    await sleep(3500);
    const confirmed = await waitForDisplayedTargetDate(ymd);
    if (!confirmed) {
      const displayed = normalizeText(getDateRangeTrigger()?.innerText || "");
      console.warn(`[KIDITEM] setDateRange: requested ${ymd}, displayed ${displayed || "(empty)"}`);
    }
    return confirmed;
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
        return {
          success: false,
          complete: false,
          reason: "date_picker_failed",
          error: `${targetDate} 날짜를 광고센터에 적용하지 못했습니다.`,
          targetDate,
          expectedPages: 0,
          visitedPages: [],
        };
      }
      await sleep(1500);
    } else {
      // 캠페인 상세 페이지 진입 시 기본을 7일로 맞춤
      showBadge(`📅 최근 7일 기간 설정 중...`, "#6366f1");
      await ensureLast7Days();
    }

    const campaignName = detectCampaignName();
    let { period, periodLabel, dateFrom, dateTo } = detectPeriod();

    // targetDate 해시가 있으면 "그 하루치"를 수집하는 배치 모드 — period를 '1d'로 강제.
    // 서버는 일별 스냅샷(period='1d')만 합산해 월간 KPI를 만들기 때문에, 7d/30d 누적값이 섞이면 중복 집계됨.
    if (targetDate) {
      period = '1d';
      dateFrom = targetDate;
      dateTo = targetDate;
    }

    const collection = await collectPaginatedReport({ maxPages: 50 });
    if (!collection.complete) {
      const error = `광고 페이지 수집 불완전: ${collection.error || "unknown"}`;
      showBadge(`❌ ${error}`, "#ef4444");
      return {
        success: false,
        complete: false,
        error,
        expectedPages: collection.expectedPages,
        visitedPages: collection.visitedPages,
      };
    }

    const aggregatedRaw = collection.rawRows;
    const aggregatedNormalized = collection.normalizedRows;
    const headers = collection.headers;
    const pageType = collection.pageType;
    const totalPages = collection.expectedPages;
    // 페이지가 rows/명시적 empty 상태로 settle된 뒤 읽어야 이전 페이지의 KPI를
    // 대상 날짜 KPI로 잘못 저장하지 않는다.
    const kpis = parseAdKpis();

    if (targetDate && collection.explicitEmpty) {
      // 명시적 empty-state와 비영(非零) additive KPI가 동시에 보이면 widget이
      // 이전 기간 값을 유지한 모순 상태다. 이 경우 ad_campaign/daily 모두 저장하지 않는다.
      const emptyKpiEvidence = evaluateExplicitEmptyDailyKpis(kpis);
      if (!emptyKpiEvidence.consistent) {
        const error = `explicit_empty_kpi_contradiction:${emptyKpiEvidence.nonZeroMetrics.join(",")}`;
        showBadge(`❌ ${targetDate} 빈 결과와 KPI가 서로 달라 저장하지 않았습니다.`, "#ef4444");
        return {
          success: false,
          complete: true,
          expectedPages: collection.expectedPages,
          visitedPages: collection.visitedPages,
          reason: "explicit_empty_kpi_contradiction",
          error,
          nonZeroMetrics: emptyKpiEvidence.nonZeroMetrics,
        };
      }

      // rows가 없고 additive KPI도 모두 0/없음인 clean empty만 일별 0 fact로 저장한다.
      const { response: dailyJson } = await syncTargetDateDaily(targetDate, [], {});
      if (dailyJson?.success) {
        chrome.storage.local.set({ kiditem_last_sync_ads: { time: Date.now(), count: 0 } });
        showBadge(`✅ ${targetDate} 광고 실적 없음(0건) 저장 완료`, "#22c55e");
        return {
          success: true,
          type: "ads",
          count: 0,
          pages: collection.expectedPages,
          expectedPages: collection.expectedPages,
          visitedPages: collection.visitedPages,
          empty: true,
          complete: true,
          error: null,
        };
      }
      return {
        success: false,
        complete: true,
        expectedPages: collection.expectedPages,
        visitedPages: collection.visitedPages,
        error: dailyJson?.error || `${targetDate} 광고 0건 저장 실패`,
      };
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
        // A target-date dashboard contains rows from multiple campaigns. The
        // server preserves these rows as dated raw evidence only; the exact
        // account/day aggregate is sent by syncTargetDateDaily below.
        campaignReportScope: targetDate ? "multi_campaign_raw" : undefined,
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
          const { response: dailyJson } = await syncTargetDateDaily(
            targetDate,
            aggregatedNormalized,
            kpis,
          );
          if (!dailyJson?.success) {
            showBadge(`❌ 일별 광고 KPI 저장 실패: ${dailyJson?.error || "실패"}`, "#ef4444");
            return {
              success: false,
              complete: true,
              expectedPages: collection.expectedPages,
              visitedPages: collection.visitedPages,
              error: dailyJson?.error || "일별 광고 KPI 저장 실패",
            };
          }
        }
        chrome.storage.local.set({ kiditem_last_sync_ads: { time: Date.now(), count: total } });
        showBadge(`✅ 광고 데이터 ${total}건 (${totalPages}p) 동기화 완료`, "#22c55e");
        return {
          success: true,
          type: "ads",
          count: total,
          pages: totalPages,
          expectedPages: collection.expectedPages,
          visitedPages: collection.visitedPages,
          complete: true,
          error: null,
        };
      } else {
        showBadge(`❌ ${json?.error || "실패"}`, "#ef4444");
        return {
          success: false,
          complete: true,
          expectedPages: collection.expectedPages,
          visitedPages: collection.visitedPages,
          error: json?.error || "실패",
        };
      }
    }
    return {
      success: false,
      error: collection.explicitEmpty
        ? "광고 데이터 없음"
        : "광고 데이터 0건을 확인할 명시적 빈 상태가 없습니다.",
      expectedPages: collection.expectedPages,
      visitedPages: collection.visitedPages,
      complete: collection.complete,
    };
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
      if (
        url.protocol !== "https:" ||
        url.hostname.toLowerCase() !== "advertising.coupang.com" ||
        url.username ||
        url.password ||
        url.port
      ) return "";
      url.hash = "";
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      const sortedSearch = new URLSearchParams(
        [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
          leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)),
      ).toString();
      return `${url.origin}${pathname}${sortedSearch ? `?${sortedSearch}` : ""}`;
    } catch {
      return "";
    }
  }

  function campaignIdFromHref(value) {
    try {
      const url = new URL(value, window.location.href);
      if (
        url.protocol !== "https:" ||
        url.hostname.toLowerCase() !== "advertising.coupang.com" ||
        url.username ||
        url.password ||
        url.port
      ) return null;
      const segments = url.pathname.split("/").filter(Boolean);
      const campaignIndex = segments.findIndex((segment) => segment.toLowerCase() === "campaign");
      if (campaignIndex < 0) return null;
      const pathCandidate = normalizeText(segments[campaignIndex + 1] || "");
      const pathId = pathCandidate &&
        !/^(?:type|registration|create|new|product|detail|dashboard|sales)$/i.test(pathCandidate)
        ? decodeURIComponent(pathCandidate)
        : null;
      const queryIds = [...url.searchParams.entries()]
        .filter(([key]) => ["campaignid", "campaignno", "campaign_id"].includes(key.toLowerCase()))
        .map(([, entryValue]) => normalizeText(entryValue))
        .filter(Boolean);
      const uniqueQueryIds = [...new Set(queryIds)];
      if (uniqueQueryIds.length > 1) return null;
      const queryId = uniqueQueryIds[0] || null;
      if (pathId && queryId && pathId !== queryId) return null;
      return queryId || pathId;
    } catch {}
    return null;
  }

  // 캠페인 상세 URL 이 아닌 href 는 캠페인 식별자가 될 수 없다.
  // AI스마트광고처럼 상세 페이지가 없는 캠페인의 anchor 는 대시보드 목록
  // URL 로 resolve 되는데, 그걸 identity 로 쓰면 그런 캠페인들이 전부 같은
  // identity(= 같은 target_key) 로 붕괴해 서로를 덮어쓴다.
  // 실측(2026-07-19): identity 가 `href:https://advertising.coupang.com/
  // marketing/dashboard/sales` 하나로 뭉쳐 캠페인 팩트가 1행만 남았다.
  function isCampaignDetailHref(value) {
    if (!value) return false;
    if (isDashboardListHref(value)) return false;
    return campaignIdFromHref(value) !== null;
  }

  function isDashboardListHref(value) {
    try {
      const url = new URL(value, window.location.href);
      return /\/marketing\/dashboard\/sales\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }

  // 표시명은 identity가 아니다. provider campaign id 또는 캠페인 전용 상세
  // href가 없는 행은 raw dashboard evidence에만 남기고 authoritative detail
  // projection에서는 제외한다.
  function campaignIdentityFromHref(value) {
    const campaignId = campaignIdFromHref(value);
    if (campaignId) return `campaign:${campaignId}`;
    return null;
  }

  function campaignIdentityMatches(campaign, currentHref = window.location.href) {
    if (!campaign?.identity) return false;
    const currentId = campaignIdFromHref(currentHref);
    if (campaign.campaignId) return currentId === campaign.campaignId;
    return campaignIdentityFromHref(currentHref) === campaign.identity;
  }

  function campaignDetailReady({
    onDashboardList,
    identityMatches,
    hasDashboardCampaignRows,
    surfaceKind,
  }) {
    return !onDashboardList &&
      identityMatches &&
      !hasDashboardCampaignRows &&
      (surfaceKind === "rows" || surfaceKind === "empty");
  }

  function campaignUsesDetailReport(campaign) {
    // 상세 URL 이 없는 캠페인(AI스마트광고 등)은 상세 리포트 화면 자체가
    // 없다. 예전에는 ON 이기만 하면 상세로 넘어가려 해서 도달할 수 없는
    // `campaignDetailReady` 를 계속 기다렸고, sweep 이 첫 캠페인에서 멈춰
    // "처리 0.0개/분 / 완료 예상 1437시간" 상태가 됐다.
    if (campaign && campaign.hasDetailHref === false) return false;
    return (campaign?.onOff || "").toUpperCase() !== "OFF";
  }

  // 대시보드 그리드의 캠페인을 모두 뽑는다.
  // - 이전: cells[1]==='ON' && /운영/.test(cells[2]) 로 strict 필터 → 컬럼 순서가
  //   유저별로 다르거나 toggle 텍스트가 "켜짐" 같은 변형이면 누락. 한국 셀러가
  //   "두 개만 들어온다" 고 한 케이스의 주 원인.
  // - 변경: 캠페인명이 있는 모든 row 를 수집하고, 토글/상태 텍스트는 셀 전체에서
  //   휴리스틱 검색. ON/OFF 판정은 toggle aria-checked / class / 텍스트 모두 시도.
  // - 캠페인 상태(운영중/일시정지)는 보존만 하고 sweep 큐 진입 필터로 쓰지 않음
  //   → 사용자가 "캠페인 모두 다" 요구. paused 도 광고 전략 분석용.
  function inspectCampaignsFromDashboard() {
    const grid = document.querySelector(".rt-table, [class*='rt-table'], [role='grid']");
    if (!grid) return { campaigns: [], titledRowCount: 0, missingIdentityNames: [] };
    const rowGroups = Array.from(grid.querySelectorAll(".rt-tbody .rt-tr-group"));
    const out = [];
    const missingIdentityNames = [];
    let titledRowCount = 0;
    for (const rg of rowGroups) {
      const cells = Array.from(rg.querySelectorAll("[role='gridcell']"));
      if (cells.length === 0) continue;

      // 이름이 같은 캠페인이 존재할 수 있으므로 anchor URL/campaign id를 identity로 쓴다.
      const titleEl = rg.querySelector(".dashboard-title");
      const name = normalizeText(titleEl?.innerText || cells[0]?.innerText || "");
      if (!name) continue;
      titledRowCount += 1;
      const anchor =
        titleEl?.closest?.("a[href]") ||
        titleEl?.querySelector?.("a[href]") ||
        rg.querySelector("a[href*='/campaign/'], a[href*='campaignId=']");
      const href = anchor?.href || anchor?.getAttribute?.("href") || "";
      const identity = campaignIdentityFromHref(href, name);
      if (!identity) {
        missingIdentityNames.push(name);
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
        // 상세 리포트로 넘어갈 수 있는 캠페인인지. 상세 URL 이 없으면
        // sweep 이 도달할 수 없는 화면을 기다리다 큐가 멈춘다.
        hasDetailHref: isCampaignDetailHref(canonicalCampaignHref(href)),
        name,
        onOff,
        status,
      });
    }
    return { campaigns: out, titledRowCount, missingIdentityNames };
  }

  function campaignIdentityCoverage(inspection) {
    const missingCount = inspection?.missingIdentityNames?.length || 0;
    return missingCount > 0
      ? {
          complete: false,
          error: "campaign_identity_missing",
          missingCount,
        }
      : {
          complete: true,
          error: null,
          missingCount: 0,
        };
  }

  function filterPendingCampaigns(campaigns, completedSeen, attemptedThisRun) {
    return (campaigns || []).filter((campaign) =>
      !completedSeen.has(campaign.identity) &&
      !attemptedThisRun.has(campaign.identity));
  }

  function normalizeSweepErrors(errors) {
    const normalized = [];
    const campaignIndexes = new Map();
    for (const value of Array.isArray(errors) ? errors : []) {
      if (!value || typeof value !== "object") continue;
      const entry = { ...value };
      const identity = typeof entry.identity === "string"
        ? entry.identity.trim()
        : "";
      if (!identity) {
        normalized.push(entry);
        continue;
      }

      entry.identity = identity;
      const previousIndex = campaignIndexes.get(identity);
      if (previousIndex === undefined) {
        campaignIndexes.set(identity, normalized.length);
        normalized.push(entry);
      } else {
        // 재개 전 여러 번 실패한 동일 캠페인은 가장 최근 오류 하나만 미해결로 센다.
        normalized[previousIndex] = entry;
      }
    }
    return normalized;
  }

  function reconcileCampaignFailureState(errors, campaign, error = null, details = {}) {
    const identity = typeof campaign?.identity === "string"
      ? campaign.identity.trim()
      : "";
    const remainingErrors = normalizeSweepErrors(errors).filter(
      (entry) => !identity || entry.identity !== identity,
    );
    if (error) {
      remainingErrors.push({
        ...details,
        identity,
        name: campaign?.name || "",
        error,
      });
    }
    return {
      errors: remainingErrors,
      failed: remainingErrors.length,
    };
  }

  // 캠페인 상세 페이지 안의 product table 페이지네이션 — 페이지 1, 2, 3... 모든 상품 수집.
  // expectedPages 전체를 순서대로 방문하지 못하면 일부 행을 성공 저장하지 않는다.
  async function parseAcrossProductPages() {
    return collectPaginatedReport({ maxPages: 8 });
  }

  // 대시보드 그리드 렌더 대기 (rows + .dashboard-title 둘 다 채워질 때까지)
  // 이전: rows.length > 0 만 보고 바로 통과 → row 가 mount 됐지만 .dashboard-title
  // 이 아직 비어있는 짧은 시점에 listAllCampaignsFromDashboard 가 빈 배열 반환 → 외부
  // 루프가 "더 처리할 캠페인 없음" 으로 판단하고 break 해버리는 race. .dashboard-title
  // 셀에 텍스트가 들어올 때까지 추가 대기.
  async function waitForDashboardGrid(timeoutMs = 15000) {
    // pollUntil: 백그라운드 창의 타이머 스로틀에도 최소 시도 횟수를 보장한다.
    const found = await pollUntil(
      () => {
        const grid = document.querySelector(".rt-table, [class*='rt-table'], [role='grid']");
        const rows = grid?.querySelectorAll(".rt-tbody .rt-tr-group") || [];
        if (rows.length > 0) {
          const titled = Array.from(rows).filter((r) => {
            const t = r.querySelector(".dashboard-title");
            return t && normalizeText(t.innerText || "").length > 0;
          });
          if (titled.length > 0) return true;
        }
        if (readReportSurfaceState(parseCampaignTable()).kind === "empty") return true;
        return false;
      },
      { timeoutMs, intervalMs: 300 },
    );
    return found === true;
  }

  // 상세 URL이 클릭한 campaign identity와 일치하고, 대시보드의 이전 행이 사라진 뒤
  // 실제 상세 rows 또는 명시적 empty-state가 보일 때만 진입 완료로 판정한다.
  async function waitForCampaignDetailPage(expectedCampaign, timeoutMs = 20000) {
    // pollUntil: 상세 진입은 sweep 에서 가장 늦게 도달하는 대기라 백그라운드
    // intensive throttling(5분 경과)의 직격탄을 맞는다. 벽시계 예산만 보던
    // 기존 루프는 여기서 1회 시도 후 타임아웃했다.
    const ready = await pollUntil(
      () => {
        const snapshot = readReportPageSnapshot();
        const isReady = campaignDetailReady({
          onDashboardList: isDashboardListPage(),
          identityMatches: campaignIdentityMatches(expectedCampaign),
          hasDashboardCampaignRows:
            document.querySelectorAll(".rt-tbody .dashboard-title, [role='grid'] .dashboard-title").length > 0,
          surfaceKind: snapshot.surface.kind,
        });
        return isReady ? snapshot : false;
      },
      { timeoutMs, intervalMs: 300 },
    );
    if (ready) {
      return {
        ok: true,
        identity: expectedCampaign.identity,
        surface: ready.surface,
      };
    }
    console.warn(
      "[KIDITEM] waitForCampaignDetailPage timeout for",
      expectedCampaign?.identity,
      "url:",
      window.location.href,
    );
    return {
      ok: false,
      error: "campaign_detail_identity_or_surface_timeout",
      identity: expectedCampaign?.identity || null,
    };
  }

  // DOM rebuild 가능성에 대비해 identity로 fresh anchor를 다시 찾아 클릭한다.
  function clickCampaignAnchor(campaign) {
    const grid = document.querySelector(".rt-table, [class*='rt-table'], [role='grid']");
    if (!grid) return false;
    const rowGroups = Array.from(grid.querySelectorAll(".rt-tbody .rt-tr-group"));
    for (const rg of rowGroups) {
      const titleEl = rg.querySelector(".dashboard-title");
      if (!titleEl) continue;
      const anchor =
        titleEl.closest?.("a[href]") ||
        titleEl.querySelector?.("a[href]") ||
        rg.querySelector("a[href*='/campaign/'], a[href*='campaignId=']");
      const href = anchor?.href || anchor?.getAttribute?.("href") || "";
      const rowName = normalizeText(titleEl.innerText || "");
      if (anchor && campaignIdentityFromHref(href, rowName) === campaign?.identity) {
        anchor.click();
        return true;
      }
    }
    return false;
  }

  function findAllCampaignsBreadcrumb() {
    const candidates = Array.from(
      document.querySelectorAll(".path-name__text, .path-name, [class*='breadcrumb'] a, [class*='breadcrumb'] button"),
    );
    const label = candidates.find(
      (candidate) => normalizeText(candidate.innerText || candidate.textContent || "") === "모든 캠페인",
    );
    return label?.closest("a, button, [role='button'], .path-name") || label || null;
  }

  async function returnToDashboard(timeoutMs = 20000) {
    if (isDashboardListPage()) return waitForDashboardGrid(timeoutMs);

    // 실제 광고센터 상세 화면의 상단 경로에 있는 `모든 캠페인`을 우선 사용한다.
    // SPA의 history stack은 날짜/페이지 전환 중 신뢰할 수 없어 history.back()만으로는
    // 간헐적으로 상세 화면에 남는다.
    const breadcrumb = findAllCampaignsBreadcrumb();
    if (breadcrumb) {
      breadcrumb.click();
      if (await waitForDashboardGrid(timeoutMs)) return true;
    }

    try {
      history.back();
    } catch {}
    return waitForDashboardGrid(timeoutMs);
  }

  // sessionStorage-backed seen — content script 가 reload 돼도 sweep 이어서 진행.
  // 이전: 매 reload 마다 seen=[] 으로 시작 → 같은 첫 N 개만 처리되는 무한 루프 위험.
  // v2부터 캠페인명이 아니라 campaign id/canonical href를 저장한다. v1 이름
  // 배열을 재사용하면 동명이 캠페인의 진행률과 재개 상태가 섞인다.
  const SEEN_KEY = "kiditem_ad_sweep_seen_v2";
  const PROGRESS_KEY = "kiditem_ad_sweep_progress_v2";
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

  let activeCollectionRunId = null;
  let lastReportedSweepProgress = { current: 0, total: 0 };

  function readDashboardCampaignTotal() {
    const candidates = Array.from(document.querySelectorAll(
      ".-totalRows, [class*='total-count'], [class*='totalCount'], .pagination-bottom, .-pagination",
    ));
    for (const candidate of candidates) {
      const text = normalizeText(candidate.innerText || candidate.textContent || "");
      const match =
        text.match(/(?:총|전체)\s*([\d,]+)\s*(?:개|건)?/i) ||
        text.match(/of\s*([\d,]+)/i);
      const count = parseNumber(match?.[1] || "0");
      if (count > 0) return count;
    }
    return null;
  }

  function estimateSweepProgressTotal({
    current,
    pageRemainingIncludingCurrent,
    explicitTotal,
    previousTotal,
  }) {
    const currentValue = Math.max(0, Number(current) || 0);
    const pageLowerBound = Math.max(
      currentValue,
      currentValue - 1 + Math.max(0, Number(pageRemainingIncludingCurrent) || 0),
    );
    return Math.max(
      currentValue,
      pageLowerBound,
      Math.max(0, Number(explicitTotal) || 0),
      Math.max(0, Number(previousTotal) || 0),
    );
  }

  function normalizeSweepProgress(progress, previous = { current: 0, total: 0 }) {
    const current = Math.max(
      Math.max(0, Number(previous.current) || 0),
      Math.max(0, Number(progress.current) || 0),
    );
    const total = Math.max(
      current,
      Math.max(0, Number(previous.total) || 0),
      Math.max(0, Number(progress.total) || 0),
    );
    return { ...progress, current: Math.min(current, total), total };
  }

  async function reportSweepProgress(progress) {
    const normalized = normalizeSweepProgress(progress, lastReportedSweepProgress);
    lastReportedSweepProgress = {
      current: normalized.current,
      total: normalized.total,
    };
    if (activeCollectionRunId) {
      await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            {
              action: "reportCollectionTargetProgress",
              runId: activeCollectionRunId,
              progress: normalized,
            },
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
    return normalized;
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
      rawRows: [
        {
          campaignId: campaign.campaignId,
          campaignHref: campaign.href,
          campaignIdentity: campaign.identity,
          campaignName: campaign.name,
          dashboardOnOff: campaign.onOff,
          dashboardStatus: campaign.status,
          _campaignOnly: true,
        },
      ],
      normalizedRows: [
        {
          pageType: "campaign",
          campaignId: campaign.campaignId,
          campaignIdentity: campaign.identity,
          campaignName: campaign.name,
          onOff: campaign.onOff,
          status: campaign.status,
          _campaignOnly: true,
        },
      ],
    };
  }

  function attachCampaignIdentityToRows(campaign, rawRows = [], normalizedRows = []) {
    const identityFields = {
      campaignId: campaign.campaignId || null,
      campaignName: campaign.name,
      campaignIdentity: campaign.identity,
    };
    return {
      rawRows: rawRows.map((row) => ({
        ...(row && typeof row === "object" ? row : { value: row }),
        ...identityFields,
        campaignHref: campaign.href || null,
      })),
      normalizedRows: normalizedRows.map((row) => ({
        ...(row && typeof row === "object" ? row : { value: row }),
        ...identityFields,
      })),
    };
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
    let totalRows = resumeProgress.totalRows || 0;
    let errors = normalizeSweepErrors(resumeProgress.errors);
    let failed = errors.length;
    const seen = resumeSeen; // 서버 저장까지 완료된 campaign identity (sessionStorage 영속)
    const attemptedThisRun = new Set(); // 실패는 같은 실행에서만 건너뛰고 reload/restart 시 재시도
    let totalDiscovered = seen.size; // 진행률 표시용 — resume 시 이어서 카운트
    let progressTotal = Math.max(
      seen.size,
      Number(resumeProgress.progressTotal) || 0,
    );
    let sweepError = null;
    let sweepFinished = false;

    let pageGuard = 0;
    while (pageGuard++ < 100) {
      // 현재 페이지 캠페인 중 아직 처리 안 한 것
      // 첫 진입 후 history.back 으로 돌아왔을 때 행은 mount 됐지만 .dashboard-title
      // 이 비어있는 짧은 race 가 있어 retry 로 보강.
      let inspection = inspectCampaignsFromDashboard();
      if (inspection.campaigns.length === 0 || inspection.missingIdentityNames.length > 0) {
        // grid/anchor href가 늦게 채워지는 케이스 — 최대 6초 추가 대기. 제목은
        // 있는데 identity가 끝내 없으면 일부 캠페인을 누락한 성공으로 처리하지 않는다.
        for (
          let r = 0;
          r < 12 &&
            (inspection.campaigns.length === 0 || inspection.missingIdentityNames.length > 0);
          r += 1
        ) {
          await sleep(500);
          inspection = inspectCampaignsFromDashboard();
        }
      }
      const identityCoverage = campaignIdentityCoverage(inspection);
      if (!identityCoverage.complete) {
        sweepError = identityCoverage.error;
        break;
      }
      const allCampsOnPage = inspection.campaigns;
      const pageCamps = filterPendingCampaigns(allCampsOnPage, seen, attemptedThisRun);
      const pag = parsePaginationInfo();
      console.log("[KIDITEM sweep]", { iter: pageGuard, currentPage: pag.currentPage, totalPages: pag.totalPages, pageCamps: pageCamps.length, totalOnPage: allCampsOnPage.length, seen: seen.size });

      if (pageCamps.length === 0) {
        // 현재 페이지에서 더 처리할게 없음 → 다음 페이지로
        const dashboardSurface = readReportSurfaceState(parseCampaignTable());
        if (
          totalDiscovered === 0 &&
          inspection.titledRowCount === 0 &&
          dashboardSurface.kind === "empty"
        ) {
          sweepFinished = true;
          break;
        }
        if (pag.verified !== true) {
          sweepError = "dashboard_pagination_unverified";
          break;
        }
        if (!pag.totalPages || pag.totalPages <= 1) {
          sweepFinished = true;
          break;
        }
        if (pag.currentPage >= pag.totalPages) {
          sweepFinished = true;
          break;
        }
        const moved = await goToNextPage();
        if (!moved) {
          sweepError = "dashboard_page_navigation_failed";
          break;
        }
        const dashboardReady = await waitForDashboardGrid(15000);
        const nextPagination = parsePaginationInfo();
        if (!dashboardReady || nextPagination.currentPage <= pag.currentPage) {
          sweepError = dashboardReady
            ? "dashboard_page_number_not_increased"
            : "dashboard_next_page_not_loaded";
          break;
        }
        await sleep(800);
        continue;
      }

      // 첫 미처리 캠페인 1개 처리 (한 번에 한 개씩 — anchor 클릭 후 SPA 네비)
      const camp = pageCamps[0];
      attemptedThisRun.add(camp.identity);
      totalDiscovered++;
      const i = totalDiscovered;
      progressTotal = estimateSweepProgressTotal({
        current: i,
        pageRemainingIncludingCurrent: pageCamps.length,
        explicitTotal: readDashboardCampaignTotal(),
        previousTotal: progressTotal,
      });
      await reportSweepProgress({
        current: i,
        total: progressTotal,
        completed: synced,
        failed,
        label: camp.name,
      });
      const usesDetailReport = campaignUsesDetailReport(camp);
      const isOffCampaign = !usesDetailReport;
      showBadge(
        isOffCampaign
          ? `📋 [${i}] ${camp.name} — OFF 상태 저장 중...`
          : `📥 [${i}] ${camp.name} 진입 중... (page ${pag.currentPage}/${pag.totalPages || 1})`,
        "#f59e0b",
      );

      if (usesDetailReport) {
        // 2a) ON 캠페인만 anchor를 클릭해 상세 rows를 수집한다. OFF는 대시보드에서
        // 확인한 identity/status만 저장해 상세 화면 기본 7일 데이터를 읽을 여지를 없앤다.
        const clicked = clickCampaignAnchor(camp);
        if (!clicked) {
          ({ errors, failed } = reconcileCampaignFailureState(
            errors,
            camp,
            "anchor not found",
          ));
          saveProgress({ synced, failed, totalRows, errors, progressTotal });
          continue;
        }

        // 2b) 상세 identity + rows/명시적 empty-state 렌더 대기
        const detail = await waitForCampaignDetailPage(camp, 20000);
        if (!detail.ok) {
          ({ errors, failed } = reconcileCampaignFailureState(
            errors,
            camp,
            detail.error,
          ));
          saveProgress({ synced, failed, totalRows, errors, progressTotal });
          await returnToDashboard(20000);
          await sleep(800);
          continue;
        }
      }

      // OFF 캠페인은 대시보드의 상태 자체만 어제 campaign-only 0 descriptor로 저장한다.
      // 상세 화면의 기본 7일 rows/KPI를 어제 데이터로 위장하지 않는다.
      let parsed;
      let kpis = {};
      if (!isOffCampaign) {
        showBadge(`📅 [${i}] ${camp.name} — ${yesterday} 적용 중...`, "#6366f1");
        const dateOk = await setDateRange(yesterday);
        if (!dateOk) {
          ({ errors, failed } = reconcileCampaignFailureState(
            errors,
            camp,
            "date_picker_failed",
          ));
          saveProgress({ synced, failed, totalRows, errors, progressTotal });
          await returnToDashboard(20000);
          await sleep(800);
          continue;
        }
        await sleep(2000);
        showBadge(`📊 [${i}] ${camp.name} 수집 중...`, "#f59e0b");
        parsed = await parseAcrossProductPages();
        if (!parsed.complete) {
          ({ errors, failed } = reconcileCampaignFailureState(
            errors,
            camp,
            parsed.error || "campaign_pagination_incomplete",
            {
              expectedPages: parsed.expectedPages,
              visitedPages: parsed.visitedPages,
            },
          ));
          saveProgress({ synced, failed, totalRows, errors, progressTotal });
          await reportSweepProgress({
            current: i,
            total: progressTotal,
            completed: synced,
            failed,
            label: `${camp.name}: ${parsed.error || "페이지 수집 불완전"}`,
          });
          await returnToDashboard(20000);
          await sleep(800);
          continue;
        }
        kpis = parseAdKpis();
      } else {
        const campaignOnly = buildCampaignOnlyRows(camp);
        parsed = {
          ...campaignOnly,
          headers: [],
          pageType: "campaign",
          expectedPages: 0,
          visitedPages: [],
          explicitEmpty: true,
          complete: true,
          error: null,
        };
        console.log("[KIDITEM sweep] persist OFF campaign-only descriptor", camp.identity);
      }

      const rowCount = isOffCampaign || parsed.explicitEmpty
        ? 0
        : parsed.normalizedRows.length;
      const emptyDescriptor = buildCampaignOnlyRows(camp);
      const baseRawRows = parsed.rawRows.length > 0
        ? parsed.rawRows
        : emptyDescriptor.rawRows;
      const baseNormalizedRows = parsed.normalizedRows.length > 0
        ? parsed.normalizedRows
        : emptyDescriptor.normalizedRows;
      const persistedRows = attachCampaignIdentityToRows(
        camp,
        baseRawRows,
        baseNormalizedRows,
      );
      const persistedRawRows = persistedRows.rawRows;
      const persistedNormalizedRows = persistedRows.normalizedRows;
      const authorityEnvelope = buildCampaignReportAuthorityEnvelope(
        camp,
        yesterday,
      );
      console.log("[KIDITEM sweep] parsed campaign", camp.identity, {
        rows: parsed.rawRows.length,
        normalizedRows: rowCount,
        expectedPages: parsed.expectedPages,
        visitedPages: parsed.visitedPages,
        offCampaignOnly: isOffCampaign,
      });

      // 사용자 요구: 데이터(rows/kpis) 가 0 이라도 캠페인 자체는 등록되어야 함.
      //   "쿠팡이랑 똑같이 동기화하라고 했잖아 데이터가 없어도 만들고"
      // 이전: rowCount===0 && kpis 비면 skip → OFF 캠페인 + 광고센터 KPI widget 못 읽은 케이스
      //   완전히 누락. 항상 syncToServer 호출하고 서버가 level='campaign' 빈 row 만들도록 위임.
      const json = await syncToServer({
        type: "ad_campaign",
        source: "advertising",
        campaignName: camp.name,
        ...authorityEnvelope,
        data: persistedRawRows,
        normalizedRows: persistedNormalizedRows,
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
        ({ errors, failed } = reconcileCampaignFailureState(errors, camp));
        synced++;
        totalRows += rowCount;
        seen.add(camp.identity);
        saveSeen(seen);
        showBadge(`✓ [${i}] ${camp.name} — ${rowCount}행 동기화 (총 ${synced} 캠페인)`, "#22c55e");
      } else {
        ({ errors, failed } = reconcileCampaignFailureState(
          errors,
          camp,
          json?.error || "sync 실패",
        ));
      }
      saveProgress({ synced, failed, totalRows, errors, progressTotal });
      await reportSweepProgress({
        current: i,
        total: progressTotal,
        completed: synced,
        failed,
        label: json?.success ? camp.name : `${camp.name}: ${json?.error || "동기화 실패"}`,
      });

      // 2e) 대시보드로 복귀 — 어느 페이지로 떨어지든 OK (seen 셋이 dedupe)
      const backOk = await returnToDashboard(20000);
      if (!backOk) {
        // 수집 창 소유자가 같은 탭을 명시적으로 대시보드로 이동한 뒤 manualSync를
        // 재호출한다. 여기서 location을 바꾸면 응답 전에 content script가 unload되어
        // 세션이 무한 대기 상태가 된다.
        showBadge(`🔁 dashboard 복귀 실패 — 이어서 실행 준비 (${synced}/${totalDiscovered})`, "#f59e0b");
        const resumeProgressSnapshot = await reportSweepProgress({
          current: totalDiscovered,
          total: Math.max(progressTotal, totalDiscovered),
          completed: synced,
          failed,
          label: "광고 대시보드에서 이어서 실행",
        });
        return {
          success: false,
          resumeRequired: true,
          resumeUrl: "https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1",
          error: "dashboard 복귀 실패 — 대시보드에서 이어서 실행합니다.",
          synced,
          failed,
          totalRows,
          progress: resumeProgressSnapshot,
        };
      }
      await sleep(1000);
    }

    if (!sweepFinished && !sweepError && pageGuard > 100) {
      sweepError = "dashboard_pagination_limit_exceeded";
    }
    if (sweepError) {
      errors.push({ name: "_dashboard", error: sweepError });
      saveProgress({ synced, failed: failed + 1, totalRows, errors, progressTotal });
      const failedProgressSnapshot = await reportSweepProgress({
        current: totalDiscovered,
        total: progressTotal,
        completed: synced,
        failed: failed + 1,
        label: sweepError,
      });
      showBadge(`❌ 광고 동기화 중단: ${sweepError}`, "#ef4444");
      return {
        success: false,
        type: "ad_sync",
        campaigns: synced,
        failed: failed + 1,
        totalRows,
        error: sweepError,
        errors,
        progress: failedProgressSnapshot,
      };
    }

    if (totalDiscovered === 0) {
      clearSweepState();
      showBadge("ℹ️ 캠페인 없음 — 동기화 종료", "#94a3b8");
      const emptyProgressSnapshot = await reportSweepProgress({
        current: 0,
        total: 0,
        completed: 0,
        failed: 0,
        label: "동기화할 광고 캠페인 없음",
      });
      return {
        success: true,
        type: "ad_sync",
        campaigns: 0,
        totalRows: 0,
        progress: emptyProgressSnapshot,
      };
    }

    // sweep 정상 완료 — sessionStorage 비워서 다음 sync 가 처음부터 시작.
    clearSweepState();

    const summary = `✅ 동기화 완료 — ${synced}/${totalDiscovered} 캠페인 (총 ${totalRows}행)`;
    showBadge(summary, failed > 0 ? "#f59e0b" : "#22c55e");
    const finalProgressSnapshot = await reportSweepProgress({
      current: totalDiscovered,
      total: Math.max(progressTotal, totalDiscovered),
      completed: synced,
      failed,
      label: failed > 0 ? "일부 캠페인 동기화 실패" : "광고 동기화 완료",
    });

    return {
      success: failed === 0,
      type: "ad_sync",
      campaigns: synced,
      failed,
      totalRows,
      errors: errors.length > 0 ? errors : undefined,
      progress: finalProgressSnapshot,
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

  // Pure parser contract used by fixture tests. Content scripts run in an isolated
  // world, so this does not expose data to the marketplace page itself.
  globalThis.KidItemAdsReportContract = Object.freeze({
    attachCampaignIdentityToRows,
    buildCoupangAdsDailyRow,
    buildCampaignOnlyRows,
    buildCampaignReportAuthorityEnvelope,
    campaignDetailReady,
    campaignIdFromHref,
    campaignIdentityCoverage,
    campaignIdentityFromHref,
    campaignUsesDetailReport,
    clickCampaignAnchor,
    classifyReportSurfaceEvidence,
    collectPaginatedReport,
    displayedRangeMatchesTarget,
    estimateSweepProgressTotal,
    evaluateExplicitEmptyDailyKpis,
    findConversionCountHeaderIndex,
    findHeaderIndex,
    filterPendingCampaigns,
    isElementVisible,
    isExplicitEmptyStateText,
    inspectCampaignsFromDashboard,
    kpiRawValue,
    normalizeSweepErrors,
    normalizeSweepProgress,
    parseNumber,
    pollUntil,
    readSettledReportPage,
    readReportSurfaceState,
    reconcileCampaignFailureState,
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
      if (
        typeof msg.collectionRunId === "string" &&
        msg.collectionRunId !== activeCollectionRunId
      ) {
        activeCollectionRunId = msg.collectionRunId;
        lastReportedSweepProgress = { current: 0, total: 0 };
      }
      runSyncOnce()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({ success: false, error: error?.message || String(error) }),
        );
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
