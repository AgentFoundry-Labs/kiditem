// KIDITEM OS — 쿠팡 광고센터 (advertising.coupang.com) 데이터 수집 + 승인 액션 실행

(function () {
  "use strict";

  // showBadge is loaded from utils/dom.js via manifest

  function sleep(ms) {
    const milliseconds = Math.min(
      5_000,
      Math.max(0, Math.round(Number(ms) || 0)),
    );
    if (typeof chrome?.runtime?.sendMessage !== "function") {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: "waitForAdCollectorDelay", milliseconds },
          () => {
            void chrome.runtime.lastError;
            resolve();
          },
        );
      } catch {
        // 확장이 다시 로드되는 순간에는 즉시 상위 상태 검사를 진행해 실패를
        // 표면화한다. 비활성 페이지 타이머로 되돌아가 장시간 대기하지 않는다.
        resolve();
      }
    });
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
  // 짧은 대기는 위 sleep()에서 visibility throttling 대상이 아닌 확장 service
  // worker로 넘긴다. 최소 시도 횟수도 함께 유지해 worker/content 응답 경계의
  // 일시적인 렌더 지연이 단 한 번의 검사로 실패 처리되지 않게 한다.
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

  // Provider identities are positive, canonical decimal IDs.  This helper is
  // intentionally strict at the API boundary: String({}) and String(true)
  // must never become target IDs that can be joined to a different product.
  function normalizeProviderId(value) {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value > 0 ? String(value) : "";
    }
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return "";
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && String(parsed) === value ? value : "";
  }

  function normalizeProviderCount(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value
      : null;
  }

  // 키워드 칸에 들어오지만 키워드가 아닌 UI 컨트롤 라벨. 서버도
  // `advertising/domain/ad-keyword.ts`에서 같은 값을 거부한다.
  const AD_KEYWORD_CONTROL_LABELS = new Set([
    "키워드 보기",
    "키워드보기",
    "키워드 관리",
    "키워드관리",
    "키워드 추가",
    "키워드추가",
    "선택 상품",
    "view keywords",
  ]);

  /** 컨트롤 라벨이면 "" 을 돌려준다 (키워드 없음). */
  function adKeywordControlLabel(value) {
    const normalized = normalizeText(value);
    if (!normalized) return "";
    if (AD_KEYWORD_CONTROL_LABELS.has(normalized)) return "";
    if (AD_KEYWORD_CONTROL_LABELS.has(normalized.toLowerCase())) return "";
    return normalized;
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

  /**
   * Parse a report cell while retaining whether the provider actually
   * displayed a numeric value. `parseNumber` intentionally returns 0 for an
   * empty/unparseable cell because it is also used for optional UI text; that
   * fallback is unsafe for additive KPI evidence. A header is not evidence by
   * itself — blank, placeholder, and malformed cells remain unobserved.
   */
  function parseMetricCell(value) {
    if (typeof value === "number") {
      return Number.isFinite(value)
        ? { value, observed: true }
        : { value: 0, observed: false };
    }
    const raw = String(value ?? "").trim();
    // `parseNumber` is deliberately permissive (it extracts numbers embedded
    // in labels for optional UI text). Evidence parsing must be stricter so a
    // malformed cell such as "error 123" cannot become an observed 123. Keep
    // only the provider's numeric decorations and Korean scale/count units.
    const numericText = raw.replace(/[,₩$€¥%\s]/g, "");
    if (
      !numericText ||
      !/^[+-]?\d+(?:\.\d+)?(?:[천만억](?:원|건|회|개)?|원|건|회|개|KRW)?$/i.test(numericText)
    ) {
      return { value: 0, observed: false };
    }
    const parsed = parseNumber(raw);
    return Number.isFinite(parsed)
      ? { value: parsed, observed: true }
      : { value: 0, observed: false };
  }

  /**
   * Resolve a numeric report field by header priority, skipping matching
   * headers whose cells are blank or malformed. This matters for Coupang
   * grids that expose both `집행 광고비` and a fallback `비용` column: a blank
   * first column must not mask a valid value in the fallback column.
   */
  function extractMetricByHeader(headers, cells, matchers) {
    for (const matcher of matchers) {
      for (let i = 0; i < headers.length; i++) {
        const key = normalizeKey(headers[i]);
        if (!key.includes(matcher)) continue;
        const parsed = parseMetricCell(getCellText(cells[i]));
        if (parsed.observed) return parsed;
      }
    }
    return { value: 0, observed: false };
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

  function getKpiEvidence(kpis, matchers) {
    for (const [label, entry] of Object.entries(kpis || {})) {
      const key = normalizeKey(label);
      if (!matchers.some((matcher) => key.includes(matcher))) continue;
      const raw = kpiRawValue(entry);
      // A widget with a displayed 0 is evidence. A label whose value is still
      // blank/placeholder is not evidence and must not become a synthesized 0.
      const parsed = parseMetricCell(raw);
      if (parsed.observed) return parsed;
    }
    return { observed: false, value: 0 };
  }

  function getKpiNullable(kpis, matchers) {
    const evidence = getKpiEvidence(kpis, matchers);
    return evidence.observed ? evidence.value : null;
  }

  function buildCoupangAdsDailyRow(date, normalizedRows, kpis, options = {}) {
    const rows = Array.isArray(normalizedRows) ? normalizedRows : [];
    const explicitEmpty = options?.explicitEmpty === true;
    const observed = {
      adSpend: false,
      adRevenue: false,
      impressions: false,
      clicks: false,
      conversions: false,
      orders: false,
    };
    const allRowsObserved = {
      adSpend: rows.length > 0,
      adRevenue: rows.length > 0,
      impressions: rows.length > 0,
      clicks: rows.length > 0,
      conversions: rows.length > 0,
      orders: rows.length > 0,
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
            ? parserEvidence[metric] === true && rowMetricValue(row, metric, fields).observed
            : rowMetricValue(row, metric, fields).observed;
          if (!rowObserved) allRowsObserved[metric] = false;
        }
        acc.adSpend += rowMetricValue(row, "adSpend", observationFields.adSpend).value;
        acc.adRevenue += rowMetricValue(row, "adRevenue", observationFields.adRevenue).value;
        acc.impressions += rowMetricValue(row, "impressions", observationFields.impressions).value;
        acc.clicks += rowMetricValue(row, "clicks", observationFields.clicks).value;
        acc.conversions += rowMetricValue(row, "conversions", observationFields.conversions).value;
        acc.orders += rowMetricValue(row, "orders", observationFields.orders).value;
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

    for (const metric of Object.keys(observed)) {
      observed[metric] = allRowsObserved[metric];
    }

    const metricMatchers = {
      adSpend: ["집행 광고비", "광고비", "ad spend"],
      adRevenue: ["광고 전환 매출", "광고 매출", "ad gmv", "매출"],
      impressions: ["노출", "impression"],
      clicks: ["클릭수", "clicks", "click count"],
      conversions: ["전환 판매수", "전환수", "conversions", "conversion sales"],
      orders: ["전환 주문수", "주문수", "order"],
    };
    const values = {};
    for (const metric of Object.keys(metricMatchers)) {
      if (observed[metric]) {
        values[metric] = totals[metric];
        continue;
      }
      const evidence = getKpiEvidence(kpis, metricMatchers[metric]);
      if (evidence.observed) observed[metric] = true;
      values[metric] = evidence.value;
    }
    if (explicitEmpty) {
      for (const metric of Object.keys(observed)) observed[metric] = true;
      for (const metric of Object.keys(values)) values[metric] = 0;
    }

    const roas = explicitEmpty
      ? null
      : getKpiNullable(kpis, ["광고 수익률", "광고수익률", "roas"]);
    const ctr = explicitEmpty
      ? null
      : getKpiNullable(kpis, ["클릭률", "ctr"]);
    const conversionRate = explicitEmpty
      ? null
      : getKpiNullable(kpis, ["전환율", "conversion rate"]);

    return {
      date,
      adSpend: values.adSpend,
      adRevenue: values.adRevenue,
      impressions: values.impressions,
      clicks: values.clicks,
      conversions: values.conversions,
      orders: values.orders,
      roas,
      ctr,
      conversionRate,
      observedMetrics: observed,
      rowCount: rows.length,
    };
  }

  function rowMetricValue(row, metric, fields) {
    const candidates = metric === "adSpend"
      // `runningAdSpend` is the preferred alias, but it may be null when the
      // provider only rendered a generic `spend` column. Never let a numeric
      // placeholder on the preferred property mask a valid fallback.
      ? ["runningAdSpend", "spend"]
      : fields;
    for (const field of candidates) {
      if (!Object.prototype.hasOwnProperty.call(row || {}, field)) continue;
      const parsed = parseMetricCell(row[field]);
      if (parsed.observed) return parsed;
    }
    return { value: 0, observed: false };
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
    // 광고상품 그리드의 `키워드` 칸은 키워드가 아니라 모달을 여는 버튼이다.
    // 헤더로 셀 텍스트를 읽으면 버튼 라벨("키워드 보기")이 그대로 키워드로
    // 저장돼 product 행 전부가 같은 가짜 키워드를 갖게 된다. 실제 키워드는
    // `collectCampaignKeywords`가 광고센터 API에서 따로 가져온다.
    const keywordLabel = extractValueByHeader(headers, cells, ["키워드"]);
    const keyword = adKeywordControlLabel(
      extractValueByHeader(headers, cells, ["키워드", "검색어"]),
    );
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
    const currentBid = extractValueByHeader(headers, cells, ["입찰가"]);
    // `전환` 단독 매처는 `광고 전환 매출`까지 잡아 매출액을 판매수로 저장한다.
    // 판매수/전환수임이 명시된 헤더만 허용한다.
    const adSpendMetric = extractMetricByHeader(headers, cells, ["집행 광고비", "광고비", "비용"]);
    const runningAdSpendMetric = extractMetricByHeader(headers, cells, ["집행 광고비"]);
    const impressionsMetric = extractMetricByHeader(headers, cells, ["노출", "impression"]);
    const clicksMetric = extractMetricByHeader(headers, cells, ["클릭수", "clicks", "click count"]);
    const conversionsMetric = extractMetricByHeader(headers, cells, CONVERSION_COUNT_HEADERS);
    const ordersMetric = extractMetricByHeader(headers, cells, ["광고 전환 주문수", "전환 주문수", "주문수", "order"]);
    const revenueMetric = extractMetricByHeader(headers, cells, ["광고 전환 매출", "총요 결과 광고 전환 매출", "매출", "전환매출"]);
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
    // Header presence alone is not evidence. A mounted grid can render a
    // column whose cell is blank, a placeholder, or malformed text while it
    // is still hydrating. Only a finite parsed cell value proves that metric
    // for this row; the daily reducer later requires proof from every row.
    const observedMetrics = {
      adSpend: adSpendMetric.observed,
      adRevenue: revenueMetric.observed,
      impressions: impressionsMetric.observed,
      clicks: clicksMetric.observed,
      conversions: conversionsMetric.observed,
      orders: ordersMetric.observed,
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
        // Keep an absent/invalid primary spend source nullable so the daily
        // reducer can fall back to a valid `spend` column instead of letting
        // a synthesized numeric zero mask it.
        runningAdSpend: runningAdSpendMetric.observed ? runningAdSpendMetric.value : null,
        budgetNote,
        currentBid: parseNumber(currentBid),
        impressions: impressionsMetric.value,
        clicks: clicksMetric.value,
        conversions: conversionsMetric.value,
        orders: ordersMetric.value,
        spend: adSpendMetric.value,
        revenue: revenueMetric.value,
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
  const REPORT_IMPLICIT_EMPTY_STABLE_MS = 1000;
  const REPORT_IMPLICIT_EMPTY_MIN_SAMPLES = 3;

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

  function findVisibleDateRangePopup(root = document) {
    const popups = Array.from(
      root?.querySelectorAll?.(
        ".ant-dropdown.dashboard-metric-widget-calendar-dropdown",
      ) || [],
    );
    return popups.find(
      (element) =>
        !element.classList?.contains("ant-dropdown-hidden") &&
        isElementVisible(element),
    ) || null;
  }

  async function openDateRangePopup(options = {}) {
    const getTrigger = options.getTrigger || (() =>
      document.querySelector(
        "button.dashboard-metric-widget-date-indicator-revamp.ant-dropdown-trigger",
      ));
    const findPopup = options.findPopup || (() => findVisibleDateRangePopup());
    const wait = options.wait || sleep;
    const now = options.now || (() => Date.now());
    const maxAttempts = Math.max(
      1,
      Math.min(5, Math.round(Number(options.maxAttempts) || 3)),
    );

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const existingPopup = findPopup();
      if (existingPopup) return existingPopup;

      const trigger = getTrigger();
      if (!trigger) return null;
      trigger.click();

      const popup = await pollUntil(findPopup, {
        timeoutMs: Number(options.popupTimeoutMs) || 3000,
        intervalMs: Number(options.intervalMs) || 200,
        minAttempts: Number(options.minAttempts) || 3,
        now,
        wait,
      });
      if (popup) return popup;
    }

    return findPopup();
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

  function classifyReportSurfaceEvidence({ rowCount, loadingVisible, emptyText, recognizedGrid }) {
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
    // 인식된 리포트 그리드(헤더 일치)가 렌더됐는데 로딩 인디케이터도 없고 행이 0이면
    // 명시적 empty가 아니라 안정화가 필요한 implicit empty 후보로만 분류한다.
    // React가 헤더를 먼저 그리고 행을 늦게 붙이는 동안 알려진 스피너가 없을 수 있으므로
    // 이 신호 하나만으로 즉시 authoritative empty를 만들면 실제 일별 실적을 0으로 덮어쓴다.
    // readSettledReportPage가 여러 번의 동일한 0행 관찰과 최소 지연을 확인한 뒤에만
    // 이 후보를 완료 상태로 받아들인다.
    if (recognizedGrid) {
      return {
        kind: "implicit-empty",
        explicitEmpty: false,
        implicitEmpty: true,
        emptyText: "",
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
    // settled empty 판정에는 페이지 전역 로딩 인디케이터까지 확인해, 데이터가 아직
    // 로딩 중일 때(스피너 표시 중) 빈 그리드로 오분류하는 것을 막는다.
    const pageBody =
      typeof document !== "undefined" && document.body ? [document.body] : roots;
    const pageLoadingVisible =
      visibleElementsWithin(pageBody, REPORT_LOADING_SELECTORS).length > 0;
    return classifyReportSurfaceEvidence({
      rowCount: parsed?.rawRows?.length || 0,
      loadingVisible,
      emptyText,
      recognizedGrid: roots.length > 0 && !pageLoadingVisible,
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
    let implicitEmptySignature = "";
    let implicitEmptyStartedAt = null;
    let implicitEmptySamples = 0;

    const recordImplicitEmptySample = (snapshot) => {
      const signature = JSON.stringify([
        snapshot?.parsed?.pageType || "",
        ...(snapshot?.parsed?.headers || []).map(normalizeText),
      ]);
      const sampledAt = now();
      if (signature !== implicitEmptySignature) {
        implicitEmptySignature = signature;
        implicitEmptyStartedAt = sampledAt;
        implicitEmptySamples = 1;
      } else {
        implicitEmptySamples += 1;
      }
      return (
        implicitEmptySamples >= REPORT_IMPLICIT_EMPTY_MIN_SAMPLES &&
        sampledAt - implicitEmptyStartedAt >= REPORT_IMPLICIT_EMPTY_STABLE_MS
      );
    };

    const resetImplicitEmptySamples = () => {
      implicitEmptySignature = "";
      implicitEmptyStartedAt = null;
      implicitEmptySamples = 0;
    };

    if (latest.surface?.kind === "implicit-empty") {
      recordImplicitEmptySample(latest);
    }
    // pollUntil: 벽시계 예산과 별개로 최소 시도 횟수를 보장해 백그라운드
    // 타이머 스로틀에서도 그리드 렌더를 놓치지 않는다.
    const settled = await pollUntil(
      () => {
        latest = readSnapshot();
        const implicitEmptyStable = latest.surface?.kind === "implicit-empty"
          ? recordImplicitEmptySample(latest)
          : false;
        if (latest.surface?.kind !== "implicit-empty") resetImplicitEmptySamples();
        const paginationReady =
          (latest.surface.kind === "empty" &&
            latest.surface.explicitEmpty === true) ||
          implicitEmptyStable ||
          latest.pagination?.verified === true;
        return (
          (latest.surface.kind === "rows" ||
            (latest.surface.kind === "empty" && latest.surface.explicitEmpty === true) ||
            implicitEmptyStable) &&
          paginationReady
        );
      },
      { timeoutMs, intervalMs: 250, now, wait },
    );
    if (settled) {
      if (latest.surface.kind === "implicit-empty") {
        return {
          ...latest,
          surface: {
            ...latest.surface,
            kind: "empty",
            stabilizedEmpty: true,
          },
        };
      }
      return latest;
    }
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

  function normalizeCollectionAttempt(value) {
    const attempt = Number(value);
    return Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
  }

  function normalizeCollectionRunId(value) {
    return typeof value === "string" && value.trim()
      ? value.trim()
      : null;
  }

  function manualSyncAdmission({
    syncRunning,
    activeRunId,
    activeAttempt,
    requestedRunId,
    requestedAttempt,
  }) {
    const activeId = normalizeCollectionRunId(activeRunId);
    const requestedId = normalizeCollectionRunId(requestedRunId);
    const activeTry = normalizeCollectionAttempt(activeAttempt);
    const requestedTry = normalizeCollectionAttempt(requestedAttempt);
    const sameExecution =
      activeId === requestedId &&
      activeTry === requestedTry;
    // 자동 트리거(#targetDate 레거시 배치)는 runId 없이 currentSync 를 먼저
    // 점유한다. 그 뒤 배경 드라이버가 실제 runId 로 보낸 manualSync 를 거절하면
    // ad_sync_already_running 으로 10초간 헛돌다 실패한다. 주인 없는(runId=null)
    // 진행 중 수집은 같은 페이지의 동일 작업이므로 새 요청이 그대로 이어받는다.
    const activeUnowned = syncRunning && activeId === null;
    if (syncRunning && !sameExecution && !activeUnowned) {
      return {
        accepted: false,
        shareCurrent: false,
        runId: requestedId,
        attempt: requestedTry,
        error: "ad_sync_already_running",
      };
    }
    return {
      accepted: true,
      shareCurrent: Boolean(syncRunning),
      runId: requestedId,
      attempt: requestedTry,
      error: null,
    };
  }

  function withCollectionRunId(payload, collectionRunId, collectionAttempt) {
    const normalizedRunId = normalizeCollectionRunId(collectionRunId);
    if (!normalizedRunId || payload?.type !== "ad_campaign") return payload;
    return {
      ...payload,
      collectionRunId: normalizedRunId,
      collectionAttempt: normalizeCollectionAttempt(collectionAttempt),
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // 상품별 광고 키워드 수집 ("키워드 보기" 모달)
  //
  // 모달을 열고 페이지를 넘기며 DOM을 긁을 필요가 없다. 모달이 렌더하는 값의
  // 실제 출처는 광고센터 내부 API 두 개다 (2026-07-31 라이브 리버스):
  //
  //   GET  /marketing/tetris-api/campaign/{campaignId}/ad-group/{adGroupId}
  //     -> adGroup.ads[] = { id(=adId), vendorItemId, itemName, isActive }
  //        상품 <-> adId 매핑의 유일한 출처.
  //   POST /marketing/cmg-api/tableMetric
  //        { campaignIds, creativeId:<adId>, start, end, tableType:'keyword' }
  //     -> { "<키워드>": { impressions, clicks, deliveredAdCost, ... } }
  //        모달이 실제로 보여주는 키워드 목록.
  //   GET  /marketing/tetris-api/ad/keywords/{adId}
  //     -> 광고주가 직접 등록한 키워드(검수 상태·입찰가). 스마트 타겟팅만 쓰는
  //        광고는 [] 를 준다.
  //
  // ⚠ adGroup.ads[].approvedKeywords 는 최초 로드에서 항상 [] 다. 여기서
  //   키워드를 찾으면 안 된다.
  // ⚠ start/end 는 KST 자정 기준 epoch ms 이고 end 는 그 날을 포함한다.
  // ⚠ **하루 범위(start === end)로 물으면 키워드 표가 항상 비어서 돌아온다.**
  //   노출이 17,058회 발생한 광고로도 라이브 확인함(2026-07-31). 쿠팡은 여러 날
  //   범위에서만 키워드 분해를 내려준다. 그래서 최근 7일 창으로 조회하고,
  //   결과를 "일별 실적"이 아니라 **창 종료일 시점의 현재 상태 관측**으로
  //   보낸다. 서버도 같은 의미로 최신 관측만 읽고 날짜별로 합산하지 않는다.
  // ⚠ 페이지 world 의 fetch 는 쿠팡 anti-spoofing 래퍼가 가로챈다. content
  //   script 는 isolated world 라 영향받지 않으므로 여기서만 직접 호출한다.
  // ════════════════════════════════════════════════════════════════════

  // 한 캠페인에서 키워드를 조회할 광고 수 상한. 광고 1개당 요청 2회라
  // 상한 없이 돌면 광고센터에 과도한 부하를 준다.
  const AD_KEYWORD_MAX_ADS_PER_CAMPAIGN = 60;
  // 키워드 표가 값을 돌려주는 최소 범위. 광고센터 기본 "최근 7일" 과 같다.
  const AD_KEYWORD_WINDOW_DAYS = 7;
  const AD_KEYWORD_REQUEST_DELAY_MS = 250;
  const AD_KEYWORD_REQUEST_TIMEOUT_MS = 15000;

  function kstDayEpochMs(ymd) {
    const parsed = Date.parse(`${ymd}T00:00:00+09:00`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Trailing keyword window ending on `businessDate`, inclusive of both ends.
   * Returns null when the date is unusable.
   */
  function adKeywordWindow(businessDate, windowDays = AD_KEYWORD_WINDOW_DAYS) {
    const end = kstDayEpochMs(businessDate);
    if (end === null) return null;
    const days = Math.max(2, Math.floor(windowDays));
    const start = end - (days - 1) * 86400000;
    return { start, end, days, startDate: ymdFromKstEpochMs(start), endDate: businessDate };
  }

  function ymdFromKstEpochMs(epochMs) {
    const seoul = new Date(epochMs + 9 * 60 * 60 * 1000);
    const y = seoul.getUTCFullYear();
    const m = String(seoul.getUTCMonth() + 1).padStart(2, "0");
    const d = String(seoul.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /** `/marketing/dashboard/sales/campaign/{cid}/group/{agid}/...` → ids */
  function parseCampaignAdGroupRoute(href) {
    const match = String(href || "").match(
      /\/campaign\/(\d+)\/group\/(\d+)(?:\/|\?|#|$)/,
    );
    return match ? { campaignId: match[1], adGroupId: match[2] } : null;
  }

  async function adCenterJson(path, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      AD_KEYWORD_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(path, {
        credentials: "same-origin",
        signal: controller.signal,
        ...init,
        headers: {
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });
      if (!response.ok) {
        return { ok: false, status: response.status, data: null };
      }
      const text = await response.text();
      if (!text.trim()) return { ok: true, status: response.status, data: null };
      return { ok: true, status: response.status, data: JSON.parse(text) };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchAdGroupAds(campaignId, adGroupId) {
    const normalizedCampaignId = normalizeProviderId(campaignId);
    const normalizedAdGroupId = normalizeProviderId(adGroupId);
    if (!normalizedCampaignId || !normalizedAdGroupId) {
      return {
        ok: false,
        adsArrayObserved: false,
        enumeratedAdCount: 0,
        ads: [],
        rawAds: [],
        invalidAdCount: 0,
        adGroupId: normalizedAdGroupId || null,
        adGroupName: null,
        adSelectionType: null,
        error: "invalid_provider_id",
      };
    }
    const result = await adCenterJson(
      `/marketing/tetris-api/campaign/${encodeURIComponent(normalizedCampaignId)}/ad-group/${encodeURIComponent(normalizedAdGroupId)}`,
    );
    if (!result.ok || !Array.isArray(result.data?.adGroup?.ads)) {
      return {
        ok: false,
        adsArrayObserved: false,
        enumeratedAdCount: 0,
        ads: [],
        rawAds: [],
        invalidAdCount: 0,
        adGroupId: normalizedAdGroupId,
        adGroupName: null,
        adSelectionType: null,
      };
    }
    const adGroup = result.data.adGroup;
    const ads = adGroup.ads;
    const rawAds = ads.map((ad) => ({
      adId: normalizeProviderId(ad?.id),
      vendorItemId: normalizeProviderId(ad?.vendorItemId),
      itemName: normalizeText(String(ad?.itemName || "")),
      isActive: ad?.isActive === true,
    }));
    const validAds = rawAds.filter((ad) => ad.adId && ad.vendorItemId);
    return {
      ok: true,
      adGroupId: normalizedAdGroupId,
      adsArrayObserved: true,
      enumeratedAdCount: ads.length,
      adGroupName: normalizeText(adGroup.name || "") || null,
      adSelectionType: normalizeText(adGroup.adSelectionType || "").toUpperCase() || null,
      rawAds,
      invalidAdCount: rawAds.length - validAds.length,
      ads: validAds,
    };
  }

  /**
   * Keyword-grain metric table for one ad over the trailing window ending on
   * `businessDate`. A one-day window returns an empty table, so the window is
   * never collapsed to a single day.
   */
  async function fetchAdKeywordMetrics(campaignId, adId, businessDate) {
    const window = adKeywordWindow(businessDate);
    if (!window) return { ok: false, keywords: [] };
    const result = await adCenterJson("/marketing/cmg-api/tableMetric", {
      method: "POST",
      body: JSON.stringify({
        campaignIds: [String(campaignId)],
        creativeId: String(adId),
        start: window.start,
        end: window.end,
        tableType: "keyword",
        targetList: [],
        isMatchTypeEnabled: false,
      }),
    });
    if (!result.ok || !result.data || typeof result.data !== "object") {
      return { ok: false, keywords: [] };
    }
    const keywords = [];
    for (const [keyword, metrics] of Object.entries(result.data)) {
      const label = normalizeText(keyword);
      if (!label) continue;
      const m = metrics && typeof metrics === "object" ? metrics : {};
      keywords.push({
        keyword: label,
        impressions: Math.round(parseNumber(m.impressions)) || 0,
        clicks: Math.round(parseNumber(m.clicks)) || 0,
        spend: Math.round(parseNumber(m.deliveredAdCost)) || 0,
        revenue: Math.round(parseNumber(m.adAttributedSales)) || 0,
        conversions: Math.round(parseNumber(m.adAttributedUnits)) || 0,
        orders: Math.round(parseNumber(m.adAttributedOrders)) || 0,
      });
    }
    return { ok: true, keywords };
  }

  /**
   * Manually registered keywords for one ad. Field names are read
   * defensively: the live account this was reversed against runs pure smart
   * targeting, so only the empty-array shape is confirmed.
   */
  async function fetchRegisteredAdKeywords(adId) {
    const result = await adCenterJson(
      `/marketing/tetris-api/ad/keywords/${encodeURIComponent(adId)}`,
    );
    if (!result.ok || !Array.isArray(result.data)) return null;
    const registered = new Map();
    for (const entry of result.data) {
      if (!entry || typeof entry !== "object") continue;
      const label = normalizeText(
        String(entry.keyword ?? entry.name ?? entry.text ?? ""),
      );
      if (!label) continue;
      registered.set(label, {
        status: normalizeText(
          String(entry.status ?? entry.auditStatus ?? entry.reviewStatus ?? ""),
        ) || null,
        currentBid: (() => {
          const bid = parseNumber(entry.bidPrice ?? entry.price ?? entry.bid);
          return Number.isFinite(bid) && bid > 0 ? Math.round(bid) : null;
        })(),
        onOff: entry.isActive === false ? "OFF" : entry.isActive === true ? "ON" : null,
      });
    }
    return registered;
  }

  /**
   * Collect every advertised product's keyword footprint for one campaign on
   * one business date, then send it as a single `ad_keyword` payload.
   *
   * Returns a result descriptor instead of throwing: keyword collection is
   * supplementary to the campaign daily sweep and must never fail it.
   */
  async function captureKeywordGroup(campaign, businessDate, route, group, checkpoint = async () => {}) {
    const keywordWindow = adKeywordWindow(businessDate);
    const ads = group.ads.slice(0, AD_KEYWORD_MAX_ADS_PER_CAMPAIGN);
    const truncated = group.ads.length - ads.length;
    const rows = [];
    let failedAds = 0;
    const proof = [];

    for (let index = 0; index < ads.length; index += 1) {
      await checkpoint();
      const ad = ads[index];
      showBadge(
        `🔑 [${campaign.name}] 키워드 ${index + 1}/${ads.length} 수집 중...`,
        "#6366f1",
      );
      const [metrics, registered] = await Promise.all([
        fetchAdKeywordMetrics(route.campaignId, ad.adId, businessDate),
        fetchRegisteredAdKeywords(ad.adId),
      ]);
      await checkpoint();
      proof.push({ adId: ad.adId, metricsOk: metrics.ok, registeredOk: registered !== null });
      if (!metrics.ok || !registered) {
        failedAds += 1;
        continue;
      }
      // A registered keyword with no impressions is absent from the metric
      // table, but it is still attached to the ad and must be reported.
      const seen = new Set(metrics.keywords.map((entry) => entry.keyword));
      const zeroMetricRegistered = [...registered.keys()]
        .filter((keyword) => !seen.has(keyword))
        .map((keyword) => ({
          keyword,
          impressions: 0,
          clicks: 0,
          spend: 0,
          revenue: 0,
          conversions: 0,
          orders: 0,
        }));

      for (const entry of [...metrics.keywords, ...zeroMetricRegistered]) {
        const registration = registered.get(entry.keyword) || null;
        rows.push({
          ...entry,
          campaignId: route.campaignId,
          campaignIdentity: campaign?.identity || null,
          campaignName: campaign?.name || detectCampaignName(),
          adGroup: group.adGroupName,
          adId: ad.adId,
          externalOptionId: ad.vendorItemId,
          productName: ad.itemName,
          origin: registration ? "registered" : "smart_targeting",
          windowDays: keywordWindow.days,
          status: registration?.status ?? null,
          onOff: registration?.onOff ?? (ad.isActive ? "ON" : "OFF"),
          currentBid: registration?.currentBid ?? null,
        });
      }
      if (index < ads.length - 1) await sleep(AD_KEYWORD_REQUEST_DELAY_MS);
    }

    return {
      ok: failedAds === 0 && truncated === 0,
      reason: truncated > 0 ? "ad_group_truncated" : failedAds > 0 ? "keyword_requests_failed" : null,
      adCount: ads.length, keywordCount: rows.length, rows: rows.length, failedAds, truncatedAds: truncated,
      receipt: { capturedAt: new Date().toISOString(), ads: proof, rows },
    };
  }

  async function collectCampaignKeywords(campaign, businessDate, routeOverride) {
    // The campaign sweep is already parked on a campaign detail URL, so it
    // reads the ids from the location. The standalone sweep never navigates —
    // it enumerates every campaign from the roster API and passes ids in.
    const route = routeOverride ?? parseCampaignAdGroupRoute(window.location.href);
    if (!route) return { ok: false, reason: "no_ad_group_route" };
    const keywordWindow = adKeywordWindow(businessDate);
    if (!keywordWindow) return { ok: false, reason: "invalid_business_date" };

    const group = await fetchAdGroupAds(route.campaignId, route.adGroupId);
    if (!group.ok) return { ok: false, reason: "ad_group_fetch_failed" };


    const captured = await captureKeywordGroup(campaign, businessDate, route, group);
    const { receipt, ...result } = captured;
    if (!result.ok) return result;
    return {
      ...result,
      adGroupId: route.adGroupId,
      groupPlan: { adsArrayObserved: group.adsArrayObserved, enumeratedAdCount: group.enumeratedAdCount,
        adGroupName: group.adGroupName, ads: group.ads.slice(0, AD_KEYWORD_MAX_ADS_PER_CAMPAIGN) },
      groupResult: receipt,
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // 전체 상품 키워드 수집 (`advertising.ad_keyword`)
  //
  // 캠페인 순회(ad_sync)에 딸린 보조 수집과 달리, 이쪽은 **모든 캠페인의 모든
  // 광고상품**을 대상으로 한다. 페이지 이동이 전혀 없다 — 캠페인 명부를
  // `POST /marketing/tetris-api/campaigns` 로 한 번에 받고, 각 캠페인의
  // `groupList[]` 가 광고그룹 id 를 준다. 대시보드에 머문 채 API 만 호출한다.
  //
  // 한 번에 다 못 돌 수 있으므로(계정 전체 1,500 광고 이상) 광고 단위로 예산을
  // 두고 owner의 접수 영수증을 다음 명시적 실행에서 재사용한다.
  // 운영중 캠페인 순서로 수집해서, 예산이 끊겨도
  // 실제로 돈이 나가는 쪽이 먼저 수집된다.
  // ════════════════════════════════════════════════════════════════════

  // 한 번 실행에서 조회할 광고 수. 광고 1개당 요청 2회라 상한 없이 돌면
  // 광고센터에 과부하가 된다. 남은 광고는 다음 실행이 이어받는다.
  const AD_KEYWORD_SWEEP_MAX_ADS_PER_RUN = 300;
  const AD_KEYWORD_SWEEP_MAX_WALL_MS = 10 * 60 * 1000;
  const AD_KEYWORD_ROSTER_PAGE_SIZE = 50;
  const AD_KEYWORD_ROSTER_MAX_PAGES = 20;

  /** Every campaign with its ad groups, straight from the roster API. */
  async function fetchAdCampaignRoster() {
    const campaigns = [];
    const pages = [];
    for (let page = 0; page < AD_KEYWORD_ROSTER_MAX_PAGES; page += 1) {
      const result = await adCenterJson("/marketing/tetris-api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          isDeleted: false,
          pagination: { page, size: AD_KEYWORD_ROSTER_PAGE_SIZE },
          sortedBy: "IS_ACTIVE",
          isSortDesc: false,
          budgetTypes: [
            "LIFETIME",
            "DAILY",
            "DAILY_SOFT",
            "MONTHLY_FIXED",
            "MONTHLY_CUSTOM",
          ],
        }),
      });
      const campaignsArrayObserved = Array.isArray(result.data?.campaigns);
      const hasNextPage = typeof result.data?.pageInfo?.hasNextPage === "boolean"
        ? result.data.pageInfo.hasNextPage : null;
      pages.push({ page, campaignsArrayObserved, hasNextPage,
        campaignCount: campaignsArrayObserved ? result.data.campaigns.length : 0 });
      if (!result.ok || !campaignsArrayObserved || hasNextPage === null) {
        return { ok: false, campaigns, pages };
      }
      const pageCampaigns = result.data.campaigns;
      for (const campaign of pageCampaigns) {
        const campaignId = normalizeProviderId(campaign?.id);
        if (!campaignId) continue;
        const groups = Array.isArray(campaign.groupList) ? campaign.groupList : [];
        campaigns.push({
          campaignId,
          name: normalizeText(String(campaign.name || "")) || campaignId,
          isActive: campaign.isActive === true,
          totalAdCount: normalizeProviderCount(campaign.totalAdCount),
          groupsArrayObserved: Array.isArray(campaign.groupList),
          groups: groups
            .map((group) => ({
              adGroupId: normalizeProviderId(group?.id),
              adGroupName: normalizeText(String(group?.name || "")) || null,
            }))
            .filter((group) => group.adGroupId),
        });
        if (campaigns[campaigns.length - 1].groups.length !== groups.length) return { ok: false, campaigns, pages };
      }
      if (hasNextPage === false) return { ok: true, campaigns, pages };
    }
    return { ok: false, campaigns, pages };
  }

  function observedKeywordAdvertiser(control) {
    const term = [...document.querySelectorAll("dt")].find(candidate =>
      normalizeText(candidate.textContent) === "업체코드");
    const observed = normalizeText(term?.nextElementSibling?.textContent);
    if (!observed || observed !== control?.plan?.expectedAdvertiserId) {
      throw Object.assign(new Error("광고센터 업체코드가 수집 계정과 일치하지 않습니다."),
        { code: "ADVERTISER_IDENTITY_MISMATCH" });
    }
    return observed;
  }

  function keywordSourceStep(control, step, body, sequence) {
    if (!control?.attemptId || control.attemptId !== activeCollectionRunId ||
      control.state !== "RUNNING" || Date.now() >= Date.parse(control.expiresAt)) {
      throw Object.assign(new Error("유효한 광고 키워드 수집 허가가 필요합니다."), { code: "SOURCE_ATTEMPT_UNAVAILABLE" });
    }
    const advertiserId = observedKeywordAdvertiser(control);
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "advertisingKeywordSourceStep", attemptId: control.attemptId, step,
        ...(sequence !== undefined ? { sequence } : {}),
        ...(body ? { body: { ...body, advertiserId } } : {}) }, response => {
        if (chrome.runtime.lastError || !response?.success) {
          reject(Object.assign(new Error(response?.error || chrome.runtime.lastError?.message || "광고 키워드 전송 실패"),
            { code: response?.errorCode || "SOURCE_OWNER_UNAVAILABLE" }));
        } else resolve(step === "checkpoint" ? control : response.control);
      });
    });
  }

  async function runKeywordSweep(initialControl) {
    const loginHandoff = advertisingLoginHandoffResponse();
    if (loginHandoff) return loginHandoff;
    let control = await keywordSourceStep(initialControl, "checkpoint");
    if (!control.roster) {
      showBadge("🔑 광고 캠페인 명부 조회 중...", "#6366f1");
      const roster = await fetchAdCampaignRoster();
      if (!roster.ok) throw Object.assign(new Error("광고 캠페인 명부를 읽지 못했습니다."), { code: "CAMPAIGN_ROSTER_INCOMPLETE" });
      control = await keywordSourceStep(control, "roster", { campaigns: roster.campaigns, pages: roster.pages });
    }
    const startedAt = Date.now();
    let adBudget = AD_KEYWORD_SWEEP_MAX_ADS_PER_RUN, keywordCount = 0, adCount = 0;
    for (const queued of control.queue) {
      if (queued.resultComplete) continue;
      if (adBudget <= 0 || Date.now() - startedAt >= AD_KEYWORD_SWEEP_MAX_WALL_MS) break;
      control = await keywordSourceStep(control, "checkpoint");
      let unit = control.queue.find(item => item.sequence === queued.sequence);
      if (unit.resultComplete) continue;
      if (!unit.plan) {
        const group = await fetchAdGroupAds(unit.campaignId, unit.adGroupId);
        control = await keywordSourceStep(control, "group_plan", {
          adsArrayObserved: group.adsArrayObserved, enumeratedAdCount: group.enumeratedAdCount,
          adGroupName: group.adGroupName, ads: group.ads.slice(0, AD_KEYWORD_MAX_ADS_PER_CAMPAIGN),
        }, unit.sequence);
        unit = control.queue.find(item => item.sequence === queued.sequence);
      }
      const captured = await captureKeywordGroup(
        { name: unit.campaignName, identity: unit.campaignIdentity }, control.plan.endDate,
        { campaignId: unit.campaignId, adGroupId: unit.adGroupId }, unit.plan,
        async () => { control = await keywordSourceStep(control, "checkpoint"); },
      );
      control = await keywordSourceStep(control, "group_result", captured.receipt, unit.sequence);
      keywordCount += captured.keywordCount;
      adCount += captured.adCount;
      adBudget -= Math.max(1, captured.adCount);
    }
    const completed = control.queue.filter(unit => unit.resultComplete).length;
    const complete = completed === control.queue.length;
    return { success: true, type: "ad_keyword", keywordCount, adCount,
      keywordReceipt: { complete, continuationRequired: !complete },
      progress: { current: completed, total: control.queue.length, completed, failed: 0,
        label: complete ? "광고 키워드 owner 반영 확인 중" : "광고 키워드 수집 일시정지 — 계속하려면 다시 실행해주세요." } };
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

  function normalizeDisplayedDate(value) {
    const match = String(value || "").match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (!match) return null;
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  // 기간은 "YYYY.MM.DD ~ YYYY.MM.DD"로, 하루는 그 날짜 한 번 또는 양쪽 모두로 표시된다.
  function displayedRangeMatches(text, startDate, endDate) {
    const displayedDates = String(text || "")
      .match(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g)
      ?.map(normalizeDisplayedDate)
      .filter(Boolean) || [];
    if (displayedDates.length === 0) return false;
    if (startDate === endDate) return displayedDates.every((date) => date === startDate);
    return displayedDates.length === 2 &&
      displayedDates[0] === startDate &&
      displayedDates[1] === endDate;
  }

  function displayedRangeMatchesTarget(text, targetDate) {
    return displayedRangeMatches(text, targetDate, targetDate);
  }

  function dailyReportSelectionSettled(text, targetDate, pagination) {
    const currentPage = Number(pagination?.currentPage) || 1;
    return displayedRangeMatchesTarget(text, targetDate) && currentPage === 1;
  }

  function displayedTargetDateSettled(text, targetDate) {
    return displayedRangeMatchesTarget(text, targetDate);
  }

  function getDateRangeTrigger() {
    return document.querySelector(
      "button.dashboard-metric-widget-date-indicator-revamp.ant-dropdown-trigger",
    );
  }

  // 날짜 표시가 요청 기간이 될 때까지, firstPage면 보고서가 1페이지로 돌아올 때까지 기다린다.
  async function waitForDisplayedRange(startDate, endDate, options = {}) {
    const settled = await pollUntil(
      () => {
        const trigger = getDateRangeTrigger();
        const displayed = normalizeText(
          trigger?.innerText || trigger?.textContent || "",
        );
        if (!displayedRangeMatches(displayed, startDate, endDate)) return false;
        return !options.firstPage ||
          (Number(parsePaginationInfo().currentPage) || 1) === 1;
      },
      {
        timeoutMs: Number(options.timeoutMs) || 8000,
        intervalMs: 250,
        now: options.now,
        wait: options.wait,
      },
    );
    return settled === true;
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

  function getReportPageInput() {
    return document.querySelector(
      ".pagination-bottom input[aria-label='jump to page'], " +
      ".-pagination input[aria-label='jump to page'], " +
      ".pagination-bottom input[type='number'], " +
      ".-pagination input[type='number']",
    );
  }

  function writeReportPageInput(input, pageNumber) {
    if (!input) return false;
    input.focus?.();
    setNativeValue(input, String(pageNumber));
    if (typeof KeyboardEvent === "function") {
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }));
      input.dispatchEvent(new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }));
    }
    input.blur?.();
    return true;
  }

  async function resetReportPaginationToFirstPage(options = {}) {
    const readSnapshot = options.readSnapshot || readReportPageSnapshot;
    const findPageInput = options.findPageInput || getReportPageInput;
    const writePageInput = options.writePageInput || writeReportPageInput;
    const wait = options.wait || sleep;
    const now = options.now || (() => Date.now());
    const initial = readSnapshot();
    const initialPage = Number(initial?.pagination?.currentPage) || 1;
    if (initialPage === 1) return true;

    const input = findPageInput();
    if (!input || !writePageInput(input, 1)) return false;
    // React-Table updates the jump input before its rows finish rendering.
    // Wait for both page=1 and a settled, changed report surface so page 2
    // rows cannot be persisted under the next business date.
    const initialSignature = initial?.signature || "";
    const reset = await pollUntil(
      () => {
        const snapshot = readSnapshot();
        const currentPage = Number(snapshot?.pagination?.currentPage) || 1;
        const surfaceSettled =
          snapshot?.surface?.kind === "empty" ||
          (
            snapshot?.surface?.kind === "rows" &&
            snapshot?.pagination?.verified === true
          );
        const contentSettled =
          snapshot?.surface?.kind === "empty" ||
          !initialSignature ||
          snapshot?.signature !== initialSignature;
        return currentPage === 1 && surfaceSettled && contentSettled;
      },
      {
        timeoutMs: Number(options.timeoutMs) || 10000,
        intervalMs: Number(options.intervalMs) || 250,
        minAttempts: Number(options.minAttempts) || THROTTLED_MIN_ATTEMPTS,
        now,
        wait,
      },
    );
    return reset === true;
  }

  // 날짜 피커를 특정 기간으로 설정한다.
  // 쿠팡 광고 대시보드는 AntD range calendar다. 트리거 → popup → 시작 달과 끝 달이
  // 함께 보일 때까지 월 네비 → 시작일 셀과 끝일 셀 클릭(하루는 같은 셀 두 번) → 적용 →
  // 표시 기간과 1페이지 복귀를 확인한다.
  async function selectReportDateRange(startDate, endDate, options = {}) {
    const wait = options.wait || sleep;
    const now = options.now || (() => Date.now());
    const parseDay = (value) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
      if (!match) return null;
      const [y, m, d] = match.slice(1).map((part) => parseInt(part, 10));
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      return { y, m, d, monthIndex: y * 12 + m };
    };
    const start = parseDay(startDate);
    const end = parseDay(endDate);
    // 두 패널은 이어진 두 달만 보여 준다. 그보다 긴 기간은 한 번에 고를 수 없다.
    if (!start || !end || startDate > endDate || end.monthIndex - start.monthIndex > 1) {
      console.warn(`[KIDITEM] selectReportDateRange: invalid range ${startDate} ~ ${endDate}`);
      return false;
    }

    // 1) 트리거 버튼 — SPA mount 가 늦으면 즉시 못 잡으므로 최대 15초 폴링
    const triggerSelector = "button.dashboard-metric-widget-date-indicator-revamp.ant-dropdown-trigger";
    let trigger = null;
    for (let i = 0; i < 30; i++) {
      trigger = document.querySelector(triggerSelector);
      if (trigger) break;
      await wait(500);
    }
    if (!trigger) {
      console.warn("[KIDITEM] selectReportDateRange: trigger not found after 15s polling");
      return false;
    }
    // 2) AntD가 다시 마운트되며 첫 클릭을 버릴 수 있으므로 트리거를
    // 다시 찾고 제한된 횟수만큼 팝업 열기를 재시도한다.
    const popup = await openDateRangePopup({
      getTrigger: () => document.querySelector(triggerSelector),
      wait,
      now,
    });
    if (!popup) {
      console.warn("[KIDITEM] selectReportDateRange: popup not found after retries");
      return false;
    }
    const left = popup.querySelector(".ant-calendar-range-left");
    const right = popup.querySelector(".ant-calendar-range-right");
    if (!left) {
      console.warn("[KIDITEM] selectReportDateRange: left panel not found");
      return false;
    }

    // 3) 시작 달과 끝 달이 좌/우 패널에 함께 보일 때까지 네비게이션
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
    const panelFor = (monthIndex) =>
      readPanels().find((panel) => panel.monthIndex === monthIndex) || null;
    const rangeVisible = () => Boolean(panelFor(start.monthIndex) && panelFor(end.monthIndex));
    const panelKey = (panels) => panels.map((panel) => `${panel.name}:${panel.monthIndex}`).join("|");

    if (!rangeVisible()) {
      let guard = 0;
      while (guard++ < 60) {
        const panels = readPanels();
        if (panels.length === 0) {
          console.warn("[KIDITEM] selectReportDateRange: calendar header unreadable");
          return false;
        }

        const first = panels[0];
        const last = panels[panels.length - 1];
        const direction = start.monthIndex < first.monthIndex
          ? "prev"
          : end.monthIndex > last.monthIndex
            ? "next"
            : null;
        if (!direction) {
          console.warn(`[KIDITEM] selectReportDateRange: ${startDate} ~ ${endDate} months are not shown together`);
          return false;
        }
        const beforeKey = panelKey(panels);
        const btn = direction === "prev"
          ? left.querySelector(".ant-calendar-prev-month-btn")
          : (right && right.querySelector(".ant-calendar-next-month-btn"))
            || left.querySelector(".ant-calendar-next-month-btn");

        if (!btn) {
          console.warn(`[KIDITEM] selectReportDateRange: month nav btn not found (direction=${direction})`);
          return false;
        }

        btn.click();
        await wait(220);
        if (rangeVisible()) break;

        let afterPanels = readPanels();
        let afterKey = panelKey(afterPanels);
        for (let settle = 0; settle < 5 && afterPanels.length > 0 && afterKey === beforeKey; settle++) {
          await wait(200);
          if (rangeVisible()) break;
          afterPanels = readPanels();
          afterKey = panelKey(afterPanels);
        }
        if (rangeVisible()) break;

        if (afterPanels.length === 0 || afterKey === beforeKey) {
          console.warn(`[KIDITEM] selectReportDateRange: month nav stalled at ${beforeKey}`);
          return false;
        }

        const afterFirst = afterPanels[0];
        const afterLast = afterPanels[afterPanels.length - 1];
        if (
          (direction === "next" && afterLast.monthIndex <= last.monthIndex) ||
          (direction === "prev" && afterFirst.monthIndex >= first.monthIndex)
        ) {
          console.warn(`[KIDITEM] selectReportDateRange: month nav moved unexpectedly (${beforeKey} -> ${afterKey})`);
          return false;
        }
      }
    }

    if (!rangeVisible()) {
      console.warn(`[KIDITEM] selectReportDateRange: ${startDate} ~ ${endDate} months not visible`);
      return false;
    }

    // 4) 날짜 셀 찾기 (이전/다음 달 셀 제외). 클릭할 때마다 패널이 다시 그려지므로
    // 셀은 누르기 직전에 다시 찾는다.
    const findCell = (monthIndex, day) => {
      const panel = panelFor(monthIndex);
      if (!panel) return null;
      const cells = panel.panel.querySelectorAll("td.ant-calendar-cell:not(.ant-calendar-last-month-cell):not(.ant-calendar-next-month-cell)");
      for (const cell of cells) {
        const date = cell.querySelector(".ant-calendar-date");
        if (date?.textContent?.trim() === String(day)) return date;
      }
      return null;
    };

    // 5) 시작일 → 끝일 클릭. 하루는 같은 날짜를 두 번 눌러 start=end로 만든다.
    const startCell = findCell(start.monthIndex, start.d);
    if (!startCell) {
      console.warn(`[KIDITEM] selectReportDateRange: start cell ${startDate} not found`);
      return false;
    }
    startCell.click();
    await wait(200);
    const endCell = findCell(end.monthIndex, end.d) || (startDate === endDate ? startCell : null);
    if (!endCell) {
      console.warn(`[KIDITEM] selectReportDateRange: end cell ${endDate} not found`);
      return false;
    }
    endCell.click();
    await wait(300);

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
      console.warn("[KIDITEM] selectReportDateRange: apply button not found", primaryBtns.map((b) => b.textContent));
      return false;
    }
    applyBtn.click();

    // 테이블 재로딩 대기 후 트리거가 요청 기간을 실제 표시하는지 확인한다.
    // 기간이 바뀌어도 React-Table은 직전 기간의 page=2를 유지할 수 있으므로
    // jump input을 실제 1페이지로 이동시키고 rows 정착까지 확인한다.
    await wait(3500);
    const rangeShown = await waitForDisplayedRange(startDate, endDate, { now, wait });
    const pageReset = rangeShown
      ? await resetReportPaginationToFirstPage({ now, wait })
      : false;
    const confirmed = pageReset
      ? await waitForDisplayedRange(startDate, endDate, { firstPage: true, now, wait })
      : false;
    if (!confirmed) {
      const displayed = normalizeText(getDateRangeTrigger()?.innerText || getDateRangeTrigger()?.textContent || "");
      const page = parsePaginationInfo().currentPage;
      console.warn(
        `[KIDITEM] selectReportDateRange: requested ${startDate} ~ ${endDate}, displayed ` +
        `${displayed || "(empty)"}, page=${page || "unknown"}`,
      );
    }
    return confirmed;
  }

  function setDateRange(ymd) {
    return selectReportDateRange(ymd, ymd);
  }

  async function doSync(campaignControl = null) {
    const manualCampaignControl = campaignControl?.plan?.captureMode === "manual_report"
      ? campaignControl
      : null;
    if (manualCampaignControl) {
      activeCampaignControl = manualCampaignControl;
      await campaignSourceStep("resume");
    }
    if (!manualCampaignControl) {
      return {
        success: false,
        complete: false,
        errorCode: "SOURCE_ATTEMPT_UNAVAILABLE",
        error: "광고 source owner 수집 허가가 필요합니다.",
      };
    }
    // 로그인 화면에 떨어졌으면 날짜 피커를 만지기 전에 자동 로그인/재개로 넘긴다.
    const loginHandoff = advertisingLoginHandoffResponse();
    if (loginHandoff) return loginHandoff;
    // 보고서는 행을 읽기 전에 계획한 1일 또는 7일 기간을 정확히 표시해야 한다.
    // 화면이 그 기간을 확인해 주지 않으면 다른 기간이 섞이지 않도록 시도를 실패시킨다.
    const reportPlan = manualCampaignControl.plan;
    const targetDate = reportPlan.period === "1d" ? reportPlan.startDate : null;
    const reportRange = `${reportPlan.startDate} ~ ${reportPlan.endDate}`;
    showBadge(`📅 ${reportRange} 기간 설정 중...`, "#6366f1");
    if (!(await selectReportDateRange(reportPlan.startDate, reportPlan.endDate))) {
      showBadge(`❌ ${reportRange} 기간을 맞추지 못해 수집을 멈췄습니다.`, "#ef4444");
      return {
        success: false,
        complete: false,
        reason: "date_picker_failed",
        errorCode: "MANUAL_REPORT_SCOPE_MISMATCH",
        error: `광고 보고서 기간을 ${reportRange}로 맞추지 못했습니다.`,
        expectedPages: 0,
        visitedPages: [],
      };
    }
    await sleep(1500);

    const campaignName = detectCampaignName();
    let { period, periodLabel, dateFrom, dateTo } = detectPeriod();

    // targetDate 해시가 있으면 "그 하루치"를 수집하는 배치 모드 — period를 '1d'로 강제.
    // 서버는 일별 스냅샷(period='1d')만 합산해 월간 KPI를 만들기 때문에, 7d/30d 누적값이 섞이면 중복 집계됨.
    if (targetDate) {
      period = '1d';
      dateFrom = targetDate;
      dateTo = targetDate;
    }
    if (manualCampaignControl && period === manualCampaignControl.plan.period && !dateFrom && !dateTo) {
      dateFrom = manualCampaignControl.plan.startDate;
      dateTo = manualCampaignControl.plan.endDate;
    }

    if (manualCampaignControl) {
      if (period !== manualCampaignControl.plan.period ||
        dateFrom !== manualCampaignControl.plan.startDate ||
        dateTo !== manualCampaignControl.plan.endDate ||
        window.location.href !== manualCampaignControl.plan.targetUrl) {
        return {
          success: false,
          complete: false,
          errorCode: "MANUAL_REPORT_SCOPE_MISMATCH",
          error: "광고 화면의 URL 또는 표시 기간이 동결된 source owner 계획과 다릅니다.",
        };
      }
    }

    const collection = await collectPaginatedReport({
      maxPages: 50,
      // Exact-day rows can still be hydrating after the date picker settles.
      ...(targetDate
        ? { readPage: () => readSettledReportPage(30000) }
        : {}),
    });
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
      // 이전 기간 값을 유지한 모순 상태다. 이 경우 ad_campaign을 저장하지 않는다.
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
    }

    const kpiCount = Object.keys(kpis).length;
    const total = kpiCount + aggregatedRaw.length;

    if (manualCampaignControl) {
      if (total === 0 && !collection.explicitEmpty) {
        return {
          success: false,
          complete: true,
          expectedPages: collection.expectedPages,
          visitedPages: collection.visitedPages,
          error: "광고 데이터 0건을 확인할 명시적 빈 상태가 없습니다.",
        };
      }
      const plan = manualCampaignControl.plan;
      const reportPayload = {
        campaignReportScope: targetDate ? "multi_campaign_raw" : undefined,
        campaignName,
        period,
        periodLabel,
        startDate: dateFrom,
        endDate: dateTo,
        dateFrom,
        dateTo,
        data: aggregatedRaw,
        normalizedRows: aggregatedNormalized,
        headers,
        pageType,
        kpis,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      };
      showBadge(
        `📊 [${campaignName}] ${periodLabel || period} — KPI ${kpiCount}개 + ${aggregatedRaw.length}행 (${totalPages}p) owner 저장 중...`,
        "#f59e0b",
      );
      let campaignJson;
      try {
        campaignJson = await campaignSourceStep("receipt", {
          kind: "manual_report",
          key: `manual_report:${plan.period}:${plan.startDate}:${plan.endDate}`,
          period: plan.period,
          startDate: plan.startDate,
          endDate: plan.endDate,
          payload: reportPayload,
        });
      } catch (error) {
        return {
          success: false,
          complete: true,
          expectedPages: collection.expectedPages,
          visitedPages: collection.visitedPages,
          error: error?.message || "광고 manual report owner 저장 실패",
          errorCode: error?.code,
        };
      }
      showBadge(`✅ 광고 데이터 ${total}건 (${totalPages}p) owner 저장 완료`, "#22c55e");
      return {
        success: campaignJson?.success !== false,
        type: "ads",
        campaignReceipt: { complete: campaignJson?.success !== false },
        count: total,
        pages: totalPages,
        expectedPages: collection.expectedPages,
        visitedPages: collection.visitedPages,
        empty: collection.explicitEmpty,
        complete: true,
        error: campaignJson?.success === false ? campaignJson.error : null,
      };
    }

    if (kpiCount > 0 || aggregatedRaw.length > 0) {
      return {
        success: false,
        complete: true,
        expectedPages: collection.expectedPages,
        visitedPages: collection.visitedPages,
        errorCode: "SOURCE_ATTEMPT_UNAVAILABLE",
        error: "광고 campaign source owner 수집 허가가 필요합니다.",
      };
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

  function findDialog() {
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'], .modal, .popup, .layer-popup"));
    return dialogs.find((dialog) => dialog.offsetParent !== null) || null;
  }

  async function kiditemApiRequest(path, init = {}) {
    const result = await chrome.runtime.sendMessage({
      action: "kiditemApiRequest",
      path,
      init,
    });
    if (!result?.success) throw new Error(result?.error || "KidItem API 요청 실패");
    return result;
  }

  async function reportAction(action, type, payload) {
    const result = await kiditemApiRequest("/api/ads/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Every report names the attempt the queue listed (KID-160), so it moves
      // only that attempt and never a retry queued after it.
      body: JSON.stringify({
        action: type,
        id: action.id,
        executionTaskId: action.executionTaskId,
        ...payload,
      }),
    });
    // The worker answers every HTTP status with success:true. The server refuses
    // a report with 409 when the attempt is not this executor's to report:
    // another executor started it, a newer attempt replaced it, its execution
    // deadline passed, it was cancelled or closed, or the operator applies the
    // action by hand. That must stop the action before it touches Coupang, and
    // this executor reports nothing more for it. The refusal code the server
    // put on the body travels with the error so the run can tell these apart.
    // Any other status is a failed request, not a refusal.
    if (!result.ok) {
      const refused = result.status === 409;
      const error = new Error(`실행 보고 ${refused ? "거절" : "실패"} (${type}): ${result.status}`);
      error.executionReportRefused = refused;
      error.executionReportCode = typeof result.body?.code === "string" ? result.body.code : null;
      throw error;
    }
  }

  async function reportActionFailure(action, payload) {
    try {
      await reportAction(action, "markFailed", payload);
    } catch (error) {
      console.warn("[KidItem] 실행 실패 보고를 남기지 못했습니다:", error instanceof Error ? error.message : error);
    }
  }

  // Called only after the change reached Coupang. A refused done report (409)
  // means the attempt is no longer this executor's (its deadline passed or a
  // newer attempt replaced it); any other failure leaves the server without the
  // outcome. Neither becomes a failure report, which would invite approving the
  // action again and changing Coupang twice. The executor warns about both; a
  // lost report leaves the attempt running until its execution deadline passes.
  async function reportActionDone(action, afterJson) {
    try {
      await reportAction(action, "markDone", { afterJson });
      return "recorded";
    } catch (error) {
      const reason = error instanceof Error ? error.message : error;
      if (error?.executionReportRefused) {
        console.warn("[KidItem] 실행 완료 보고가 거절되어 액션을 멈춥니다:", reason);
        return "refused";
      }
      console.warn("[KidItem] 광고센터에 반영했지만 실행 완료 보고를 남기지 못했습니다:", reason);
      return "unrecorded";
    }
  }

  async function fetchApprovedQueuedActions(limit = 20) {
    const res = await kiditemApiRequest(
      `/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=${limit}`,
    );
    if (!res.ok) throw new Error(`승인 액션 조회 실패: ${res.status}`);
    const json = res.body || {};
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

  async function executeCreateCampaign(action, claim) {
    const payload = action.payload || {};
    const listings = Array.isArray(payload.listings) ? payload.listings : [];
    if (listings.length === 0) {
      return { success: false, errorMessage: "등록할 광고 상품이 없습니다. 전략 탭에서 상품이 포함된 캠페인을 다시 생성해주세요." };
    }

    // A retried attempt may follow one that already created the campaign before
    // its report was lost and its attempt released (KID-160). The ad center's
    // campaign roster is read first, without leaving the page: a campaign with
    // this name ends the action as done, and a roster that cannot be read to
    // the end leaves it failed, since creating without knowing could make a
    // second campaign.
    const campaignName = normalizeText(payload.campaignName || action.targetLabel || "");
    if (!campaignName) {
      // A campaign without a name can be neither checked against the roster nor registered.
      return { success: false, errorMessage: CAMPAIGN_NAME_MISSING_MESSAGE };
    }
    const roster = await fetchAdCampaignRoster();
    if (!roster.ok) {
      return { success: false, errorMessage: CAMPAIGN_ROSTER_UNREAD_MESSAGE };
    }
    const existing = roster.campaigns.find((campaign) => campaign.name === campaignName);
    if (existing) {
      return {
        success: true,
        afterJson: {
          note: "campaign_already_exists",
          campaignName,
          campaignId: existing.campaignId,
        },
      };
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
    assertWithinWriteDeadline(claim);
    completeButton.click();
    await sleep(1500);

    const dialog = findDialog();
    if (dialog) {
      const confirmButton = findClickableByText(["등록", "확인", "완료"], dialog);
      if (confirmButton) {
        assertWithinWriteDeadline(claim, { confirmationStep: true });
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

  // The claim (markRunning) is an executor's first report for an action, for
  // every action type. The executor reads the page, touches Coupang or reports
  // an outcome only after the server accepts the claim, so a refused claim ends
  // the action before any of that and every outcome is for an attempt it claimed.
  function claimEvidence(action) {
    return action.actionType === "create_campaign"
      ? { url: window.location.href, payload: action.payload || {} }
      : { url: window.location.href };
  }

  // An approved action writes to Coupang only within this long after its claim.
  // The server treats a running attempt with no outcome for 30 minutes as
  // stopped and lets the operator queue it again
  // (EXECUTION_TASK_RUNNING_DEADLINE_MS in
  // apps/server/src/advertising/domain/execution-task-lifecycle.ts). An executor
  // that stalled after its claim (a sleeping PC, a throttled tab) must not write
  // that late, so this deadline stays well inside the server's while leaving
  // room for several slow ad-center page loads.
  const ACTION_WRITE_DEADLINE_MS = 10 * 60 * 1000;
  const ACTION_WRITE_DEADLINE_MESSAGE =
    `실행 기한(${ACTION_WRITE_DEADLINE_MS / 60000}분)이 지나 광고센터에 쓰지 않았습니다.`;
  // A stop at a confirmation click follows a click that may already have
  // written, so its failure does not claim that nothing changed.
  const ACTION_CONFIRM_DEADLINE_MESSAGE =
    `실행 기한(${ACTION_WRITE_DEADLINE_MS / 60000}분)이 지나 확인 단계에서 멈췄습니다. 광고센터에 반영됐을 수 있으니 다시 승인하기 전에 확인해 주세요.`;
  const CAMPAIGN_ROSTER_UNREAD_MESSAGE =
    "광고센터 캠페인 목록을 끝까지 읽지 못해 같은 이름의 캠페인이 있는지 확인하지 못했습니다. 캠페인을 만들지 않았습니다.";
  const CAMPAIGN_NAME_MISSING_MESSAGE =
    "캠페인 이름이 없습니다. 전략 탭에서 캠페인 이름을 넣어 다시 생성해주세요.";

  /**
   * Checked immediately before each click that can write to Coupang, with
   * nothing awaited in between; the thrown failure becomes the action's
   * reported outcome. A stop at a confirmation click follows a click that may
   * already have written, so its error carries `executionMayHaveApplied` and
   * the run warns about it.
   */
  function assertWithinWriteDeadline(claim, { confirmationStep = false } = {}) {
    if (Date.now() - claim.claimedAt <= ACTION_WRITE_DEADLINE_MS) return;
    const error = new Error(
      confirmationStep ? ACTION_CONFIRM_DEADLINE_MESSAGE : ACTION_WRITE_DEADLINE_MESSAGE,
    );
    error.executionMayHaveApplied = confirmationStep;
    throw error;
  }

  // Campaign registration is the only action this extension applies to
  // Coupang. Keyword pauses, bid changes and daily budget changes are applied
  // by hand in the ad center (KID-138 decision A), and the server refuses their
  // claim. One an older server still lets through, like any other type without
  // an executor here, is reported failed without touching the page.
  async function executeClaimedAction(action, claim) {
    if (action.actionType === "create_campaign") {
      return executeCreateCampaign(action, claim);
    }
    return { success: false, errorMessage: `지원하지 않는 액션: ${action.actionType}` };
  }

  // The server refuses the claim of an action the operator applies by hand
  // (EXECUTION_REPORT_MANUAL_ACTION in
  // apps/server/src/advertising/domain/execution-task-lifecycle.ts, held equal
  // by a test) and closes its queued attempt. The extension keeps no list of
  // those types.
  const MANUAL_ACTION_REFUSAL_CODE = "EXECUTION_REPORT_MANUAL_ACTION";

  // Every listed action is claimed, whatever page the tab shows: the server
  // decides which actions an executor may run, and an action never claimed
  // would stay queued and hold a place in the 20-action queue.
  async function executeApprovedActions(actions) {
    let executed = 0;
    let skipped = 0;
    // Actions listed without their attempt id, which are never claimed.
    let missingAttemptId = 0;
    // Claims refused because the operator applies the action by hand.
    let manual = 0;
    // Reports that did not land. The operator sees each kind as a warning.
    let claimRefused = 0;
    let claimUnreported = 0;
    // Actions stopped at a confirmation click, after which Coupang may already have changed.
    let confirmationStopped = 0;
    let doneRefused = 0;
    let doneUnreported = 0;

    for (const action of actions) {
      // Every report names the attempt it is for. An action listed without one
      // (an older server, or an approved action with no attempt) cannot be
      // fenced to an attempt, so it is not claimed at all.
      if (typeof action.executionTaskId !== "string" || !action.executionTaskId.trim()) {
        skipped++;
        missingAttemptId++;
        continue;
      }
      // The write deadline runs from the moment the claim is sent.
      const claim = { claimedAt: Date.now() };
      try {
        showBadge(`⚙️ ${action.targetLabel} 실행 중...`, "#60a5fa");
        await reportAction(action, "markRunning", { beforeJson: claimEvidence(action) });
      } catch (error) {
        // No accepted claim: another executor may own the attempt, or the
        // operator applies the action by hand, so this one reports nothing for
        // the action and never touches Coupang for it.
        skipped++;
        if (!error?.executionReportRefused) claimUnreported++;
        else if (error.executionReportCode === MANUAL_ACTION_REFUSAL_CODE) manual++;
        else claimRefused++;
        console.warn(
          "[KidItem] 실행 선점이 받아들여지지 않아 액션을 건너뜁니다:",
          error instanceof Error ? error.message : error,
        );
        continue;
      }
      let result;
      try {
        result = await executeClaimedAction(action, claim);
      } catch (error) {
        // The action failed while it was being worked on Coupang.
        skipped++;
        if (error?.executionMayHaveApplied) confirmationStopped++;
        await reportActionFailure(action, {
          errorMessage: error instanceof Error ? error.message : "실행 실패",
        });
        continue;
      }
      if (!result.success) {
        skipped++;
        await reportActionFailure(action, {
          errorMessage: result.errorMessage || "실행 실패",
          afterJson: result.afterJson || {},
        });
        continue;
      }
      const done = await reportActionDone(action, result.afterJson || {});
      if (done === "recorded") executed++;
      else if (done === "refused") doneRefused++;
      else doneUnreported++;
    }

    // A refused or lost done report follows a change that reached Coupang; only
    // its record is missing.
    const executedUnrecorded = doneRefused + doneUnreported;
    // A skip the operator must act on, or a report that did not land, is a
    // warning, never only a count.
    const warnings = [];
    if (missingAttemptId > 0) {
      warnings.push(`실행 시도 id가 없는 승인 액션 ${missingAttemptId}개는 광고센터에 쓰지 않고 건너뛰었습니다. 확장과 서버 버전이 같은지 확인하고 다시 승인해 주세요.`);
    }
    if (manual > 0) {
      warnings.push(`자동 실행하지 않는 승인 액션 ${manual}개는 광고센터에 쓰지 않았습니다. 광고센터에서 직접 처리해 주세요.`);
    }
    if (claimRefused > 0) {
      warnings.push(`실행 보고가 거절된 승인 액션 ${claimRefused}개는 광고센터에 쓰지 않고 건너뛰었습니다. 다른 실행이 맡았거나 이미 닫힌 실행 시도입니다.`);
    }
    if (claimUnreported > 0) {
      warnings.push(`시작 보고 전달에 실패한 승인 액션 ${claimUnreported}개는 광고센터에 쓰지 않고 건너뛰었습니다. 서버에 실행 중으로 남았다면 실행 기한(30분)이 지나 실패로 바뀐 뒤 다시 승인할 수 있습니다.`);
    }
    if (confirmationStopped > 0) {
      warnings.push(`승인 액션 ${confirmationStopped}개는 확인 단계에서 실행 기한(${ACTION_WRITE_DEADLINE_MS / 60000}분)이 지나 멈췄습니다. 광고센터에 반영됐을 수 있으니 다시 승인하기 전에 광고센터에서 확인해 주세요.`);
    }
    if (doneRefused > 0) {
      warnings.push(`승인 액션 ${doneRefused}개는 광고센터에 반영됐을 수 있지만 완료 보고가 거절됐습니다. 실행 기한이 지났거나 새 실행 시도로 바뀌었으니 다시 승인하기 전에 광고센터에서 확인해 주세요.`);
    }
    if (doneUnreported > 0) {
      warnings.push(`승인 액션 ${doneUnreported}개는 광고센터에 이미 반영됐을 수 있지만 실행 기록을 남기지 못했습니다. 다시 승인하기 전에 광고센터에서 확인해 주세요.`);
    }
    if (warnings.length > 0) {
      const warning = warnings.join(" ");
      showBadge(`⚠️ ${warning}`, "#f59e0b");
      return {
        success: true,
        executed,
        ...(executedUnrecorded > 0 ? { executedUnrecorded } : {}),
        skipped,
        warning,
      };
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
  //      → 상세 페이지를 한 번 연 뒤 어제까지 31개 날짜를 하루씩 적용
  //      → 각 날짜를 period:'1d', startDate=endDate인 exact-day fact로 저장
  //      → history.back() → 대시보드는 default 7d 유지 → 다음 캠페인
  //
  // SPA 라우팅이라 content script 인스턴스가 한 탭 내내 살아있는 점을 활용 (manifest match `*://*/*` 한 도메인).
  // ════════════════════════════════════════════════════════════════════

  const SEOUL_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;
  const CAMPAIGN_DAILY_WINDOW_DAYS = 31;

  function utcYmd(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseBusinessYmd(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ));
    return utcYmd(date) === value ? date : null;
  }

  function getYesterdayYmd(nowValue = new Date()) {
    const instant = nowValue instanceof Date
      ? nowValue
      : new Date(nowValue);
    if (!Number.isFinite(instant.getTime())) return null;
    // Server aggregation is keyed to Asia/Seoul business dates. Deriving the
    // boundary from the browser's local timezone made a UTC/overseas browser
    // disagree with the server around Korean midnight.
    const seoulClock = new Date(instant.getTime() + SEOUL_UTC_OFFSET_MS);
    const yesterday = new Date(Date.UTC(
      seoulClock.getUTCFullYear(),
      seoulClock.getUTCMonth(),
      seoulClock.getUTCDate() - 1,
    ));
    return utcYmd(yesterday);
  }

  function buildRollingCampaignBusinessDates(
    endDate = getYesterdayYmd(),
    days = CAMPAIGN_DAILY_WINDOW_DAYS,
  ) {
    const cursor = parseBusinessYmd(endDate);
    const count = Math.max(
      1,
      Math.min(CAMPAIGN_DAILY_WINDOW_DAYS, Math.floor(Number(days) || 0)),
    );
    if (!cursor) return [];
    const dates = [];
    // Newest first: even when a marketplace interruption happens during the
    // initial backfill, yesterday/7d are available before older history.
    for (let offset = 0; offset < count; offset += 1) {
      dates.push(utcYmd(cursor));
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return dates;
  }

  function campaignBusinessDateKey(campaign, businessDate) {
    const identity =
      typeof campaign?.identity === "string" ? campaign.identity.trim() : "";
    return identity && parseBusinessYmd(businessDate)
      ? `${identity}\u001f${businessDate}`
      : "";
  }

  function filterPendingCampaignBusinessDates(
    campaign,
    businessDates,
    completedKeys,
  ) {
    return (Array.isArray(businessDates) ? businessDates : []).filter((date) => {
      const key = campaignBusinessDateKey(campaign, date);
      return key && !completedKeys?.has?.(key);
    });
  }

  function campaignDailyCoverage(
    businessDates,
    expectedDays = CAMPAIGN_DAILY_WINDOW_DAYS,
  ) {
    const values = Array.isArray(businessDates)
      ? businessDates.filter((value) => parseBusinessYmd(value))
      : [];
    const unique = [...new Set(values)];
    let contiguous =
      values.length === expectedDays &&
      unique.length === expectedDays;
    for (let index = 1; contiguous && index < unique.length; index += 1) {
      const expected = parseBusinessYmd(unique[index - 1]);
      expected.setUTCDate(expected.getUTCDate() - 1);
      contiguous = unique[index] === utcYmd(expected);
    }
    return {
      campaignDailyCollectionComplete: contiguous,
      campaignDailyWindowDays: unique.length,
      campaignDailyFrom: unique.at(-1) || null,
      campaignDailyTo: unique[0] || null,
    };
  }

  function isDashboardListPage() {
    try {
      const url = new URL(window.location.href);
      return (
        url.protocol === "https:" &&
        url.hostname.toLowerCase() === "advertising.coupang.com" &&
        /\/marketing\/dashboard\/sales\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  }

  function isAdvertisingLoginPage() {
    try {
      const url = new URL(window.location.href);
      return (
        url.protocol === "https:" &&
        url.hostname.toLowerCase() === "advertising.coupang.com" &&
        /^\/user\/login\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  }

  // 로그인 화면 자동 통과 — 확장은 자격증명을 입력·저장·로깅·전송하지 않는다.
  // 브라우저 자동완성이 아이디·비밀번호를 "이미" 채운 경우에만 로그인 버튼을
  // 클릭한다(값 문자열은 다루지 않고 채워졌는지 길이만 확인). 자동완성이 없으면
  // 누르지 않고 기존 로그인 안내(pendingLogin) 흐름으로 넘어간다. 저장된 비번이
  // 틀린 경우의 재제출 루프는 sessionStorage 시도 횟수 제한으로 막는다.
  const AD_LOGIN_AUTOSUBMIT_ATTEMPTS_KEY =
    "kiditem_ad_login_autosubmit_attempts_v1";
  const AD_LOGIN_AUTOSUBMIT_MAX = 2;
  let advertisingLoginAutoSubmitted = false;
  function isSocialLoginLabel(label) {
    return /카카오|네이버|구글|애플|페이스북|간편|kakao|naver|google|apple|facebook|sns/i.test(
      label,
    );
  }
  function findAdvertisingLoginControls() {
    const password = document.querySelector('input[type="password"]');
    if (!password) {
      return { form: null, username: null, password: null, submit: null };
    }
    const form =
      password.form ||
      (typeof password.closest === "function" ? password.closest("form") : null) ||
      document;
    const username =
      form.querySelector(
        'input[type="text"], input[type="email"], input[name*="user" i], input[name*="id" i], input[name*="login" i]',
      ) || null;
    const labelOf = (el) => String(el.textContent || el.value || "").trim();
    // 실제 제출 컨트롤(type=submit)을 우선한다. 소셜 로그인/OAuth 링크는 라벨에
    // "로그인"이 들어가도 절대 누르지 않는다(a[role=button] 후보 제외).
    let submit = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submit && isSocialLoginLabel(labelOf(submit))) submit = null;
    if (!submit) {
      const buttons = Array.from(
        form.querySelectorAll('button, input[type="button"]') || [],
      );
      submit =
        buttons.find((el) => {
          if (el.disabled) return false;
          const label = labelOf(el);
          return /로그인|login|sign\s*in/i.test(label) && !isSocialLoginLabel(label);
        }) || null;
    }
    return { form, username, password, submit };
  }
  function advertisingLoginFieldsPrefilled() {
    // 값 문자열은 저장·로깅·전송하지 않는다 — 채워졌는지 길이만 본다.
    const { username, password } = findAdvertisingLoginControls();
    const usernameFilled = !!(username && String(username.value || "").length > 0);
    const passwordFilled = !!(password && String(password.value || "").length > 0);
    return usernameFilled && passwordFilled;
  }
  function advertisingAccountCardText(el) {
    // 버튼이 속한 계정 카드의 텍스트(조상 몇 단계)를 얻어 wing 카드를 식별한다.
    let node = el.parentElement;
    for (let depth = 0; depth < 6 && node; depth += 1) {
      const text = String(node.textContent || "");
      if (text.length > 40) return text;
      node = node.parentElement;
    }
    return String(el.textContent || "");
  }
  function findAdvertisingAccountLoginButton() {
    // 계정 유형 선택 화면("쿠팡 광고센터 로그인")의 "로그인하기" 버튼들.
    // 맨 왼쪽 = 쿠팡 wing(마켓플레이스 & 로켓그로스 판매자) 카드. 자격증명을
    // 다루지 않고 다음 로그인 단계로 넘어가는 네비게이션 클릭이다.
    const buttons = Array.from(
      document.querySelectorAll('a, button, [role="button"]') || [],
    ).filter((el) => {
      if (el.disabled) return false;
      const label = String(el.textContent || el.value || "").trim();
      return /로그인하기/.test(label) && !isSocialLoginLabel(label);
    });
    if (buttons.length === 0) return null;
    const wing = buttons.find((el) =>
      /마켓플레이스|로켓그로스|wing/i.test(advertisingAccountCardText(el)),
    );
    // wing(맨 왼쪽) 카드 우선, 못 찾으면 DOM 순서상 첫 번째(=맨 왼쪽).
    return wing || buttons[0];
  }
  function advertisingLoginAutoSubmitCount() {
    try {
      const parsed = Number.parseInt(
        sessionStorage.getItem(AD_LOGIN_AUTOSUBMIT_ATTEMPTS_KEY) || "0",
        10,
      );
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }
  function commitAdvertisingLoginClick(el, badge) {
    advertisingLoginAutoSubmitted = true;
    try {
      sessionStorage.setItem(
        AD_LOGIN_AUTOSUBMIT_ATTEMPTS_KEY,
        String(advertisingLoginAutoSubmitCount() + 1),
      );
    } catch {}
    try {
      showBadge(badge, "#6366f1");
    } catch {}
    el.click();
    return true;
  }
  function attemptAdvertisingLoginAutoSubmit() {
    if (advertisingLoginAutoSubmitted) return false;
    if (!isAdvertisingLoginPage()) return false;
    // 저장된 비번이 틀리면 실패 → 페이지 재렌더 → 문서 플래그 초기화 → 재제출
    // 루프가 될 수 있다. sessionStorage 는 같은 탭·origin 리로드에도 남으므로,
    // 세션당 자동 로그인 시도 횟수를 제한해 캡차/계정잠금을 막는다.
    if (advertisingLoginAutoSubmitCount() >= AD_LOGIN_AUTOSUBMIT_MAX) return false;

    // 1) 계정 유형 선택 화면이면 맨 왼쪽(쿠팡 wing / 마켓플레이스 & 로켓그로스)
    //    "로그인하기"를 누른다 — 자격증명을 다루지 않는 네비게이션 클릭.
    const accountButton = findAdvertisingAccountLoginButton();
    if (accountButton && typeof accountButton.click === "function") {
      return commitAdvertisingLoginClick(accountButton, "🔓 쿠팡 wing 로그인 선택");
    }

    // 2) 아이디/비번 입력 폼이면, 브라우저 자동완성이 채운 경우에만 로그인 버튼을
    //    누른다(값은 다루지 않고 채워졌는지만 확인).
    if (!advertisingLoginFieldsPrefilled()) return false;
    const { submit } = findAdvertisingLoginControls();
    if (!submit || typeof submit.click !== "function") return false;
    return commitAdvertisingLoginClick(submit, "🔓 광고센터 자동 로그인");
  }
  // 수집 중 로그인 화면을 만났을 때의 응답. 자동완성 자격증명이 있어 로그인
  // 버튼을 눌렀거나(또는 init 타이머가 이미 눌렀다면) 리다이렉트 후 배경
  // 드라이버가 재개하도록 resumeRequired 로 넘긴다 — 이때는 수동 로그인
  // attention 으로 올리지 않아 헛된 알림을 막는다. 자동완성이 없거나 시도 예산을
  // 다 쓴 경우에만 pendingLogin(수동 로그인 필요)으로 넘어간다.
  function advertisingLoginHandoffResponse() {
    if (!isAdvertisingLoginPage()) return null;
    const submitting =
      attemptAdvertisingLoginAutoSubmit() || advertisingLoginAutoSubmitted;
    if (submitting) {
      return {
        success: false,
        resumeRequired: true,
        loginHandoff: true,
        error: "쿠팡 광고센터 자동 로그인 중",
        url: window.location.href,
      };
    }
    return {
      success: false,
      pendingLogin: true,
      error: "쿠팡 광고센터 로그인이 필요합니다.",
      url: window.location.href,
    };
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
      return (
        url.protocol === "https:" &&
        url.hostname.toLowerCase() === "advertising.coupang.com" &&
        !url.username &&
        !url.password &&
        !url.port &&
        /\/marketing\/dashboard\/sales\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  }

  function isExplicitDashboardListAnchor(anchor) {
    const rawHref = typeof anchor?.getAttribute === "function"
      ? String(anchor.getAttribute("href") || "").trim()
      : "";
    // `a.href`는 빈 href나 `#`도 현재 dashboard URL로 resolve한다. 그런
    // placeholder를 실제 no-detail 캠페인 링크로 인정하면 DOM drift 상황에서
    // 모든 캠페인을 raw-only 성공으로 오판할 수 있으므로 명시적 경로만 허용한다.
    if (
      !/^\/marketing\/dashboard\/sales(?:\/?(?:[?#].*)?)?$/i.test(rawHref) &&
      !/^https:\/\/advertising\.coupang\.com\/marketing\/dashboard\/sales(?:\/?(?:[?#].*)?)?$/i.test(rawHref)
    ) {
      return false;
    }
    return isDashboardListHref(rawHref);
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

  function dashboardCampaignTitleElement(row) {
    if (!row || typeof row.querySelector !== "function") return null;
    // 광고센터 2026-07 DOM은 기존 `.dashboard-title` 대신
    // `data-bigfoot-component="campaign_name"` 아래의 href 없는 <a>를 쓴다.
    // 첫 gridcell 전체 텍스트에는 "수정/삭제"가 섞이므로 이름은 이 요소에서
    // 우선 읽어야 한다.
    return (
      row.querySelector("[data-bigfoot-component='campaign_name'] a") ||
      row.querySelector(".dashboard-title") ||
      row.querySelector("[data-bigfoot-component='campaign_name']")
    );
  }

  function dashboardCampaignAnchor(row, titleElement = dashboardCampaignTitleElement(row)) {
    if (!row || typeof row.querySelector !== "function") return null;
    const closestAnchor = titleElement?.closest?.("a");
    if (closestAnchor) return closestAnchor;
    const nestedAnchor = titleElement?.querySelector?.("a");
    if (nestedAnchor) return nestedAnchor;
    return (
      row.querySelector("[data-bigfoot-component='campaign_name'] a") ||
      row.querySelector("a[href*='/campaign/'], a[href*='campaignId=']")
    );
  }

  function findDashboardCampaignGrid() {
    const candidates = Array.from(
      document.querySelectorAll(
        ".rt-table, [class*='rt-table'], [role='grid']",
      ),
    );
    if (candidates.length === 0) {
      const onlyCandidate = document.querySelector(
        ".rt-table, [class*='rt-table'], [role='grid']",
      );
      if (onlyCandidate) candidates.push(onlyCandidate);
    }
    return candidates.find((grid) => {
      const rowGroups = Array.from(
        grid.querySelectorAll(".rt-tbody .rt-tr-group"),
      );
      if (
        rowGroups.some((row) => {
          const title = dashboardCampaignTitleElement(row);
          return title && normalizeText(title.innerText || "").length > 0;
        })
      ) {
        return true;
      }
      const headers = Array.from(
        grid.querySelectorAll(".rt-thead .rt-th, [role='columnheader']"),
      )
        .map((node) => normalizeText(node.innerText || ""))
        .filter(Boolean);
      return headers.length >= 3 && isAdReportHeaderSet(headers);
    }) || null;
  }

  function campaignNavigationKey(campaign) {
    return [
      "dashboard-campaign",
      Math.max(1, Number(campaign?.pageNumber) || 1),
      Math.max(0, Number(campaign?.rowIndex) || 0),
      normalizeText(campaign?.name || ""),
    ].join("\u001f");
  }

  function campaignIdentityProbeProgressLabel(campaign) {
    const pageNumber = Math.max(1, Number(campaign?.pageNumber) || 1);
    const rowNumber = Math.max(0, Number(campaign?.rowIndex) || 0) + 1;
    const name = normalizeText(campaign?.name || "") || "캠페인";
    return `${name} · 상세 식별 이동 (${pageNumber}페이지 ${rowNumber}행)`;
  }

  function campaignAttemptKey(campaign) {
    const identity = typeof campaign?.identity === "string"
      ? campaign.identity.trim()
      : "";
    return identity || campaign?.navigationKey || campaignNavigationKey(campaign);
  }

  function campaignWithIdentityFromHref(campaign, href) {
    const campaignId = campaignIdFromHref(href);
    if (!campaignId) return null;
    const canonicalHref = canonicalCampaignHref(href);
    if (!canonicalHref || !isCampaignDetailHref(canonicalHref)) return null;
    return {
      ...campaign,
      identity: `campaign:${campaignId}`,
      campaignId,
      href: canonicalHref,
      hasDetailHref: true,
      discoveredByNavigation:
        campaign?.discoveredByNavigation === true ||
        campaign?.requiresIdentityProbe === true,
      requiresIdentityProbe: false,
    };
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

  // AI스마트광고(HUB) 같은 자동화 광고 캠페인은 상세에 상품별 일별 실적이 없다.
  // 상세로 들어가면 인식된 그리드에 상품 행이 0이라 31일 하루씩 돌아도 진척이
  // 없고, 라이브 실증 결과 sweep 이 이 캠페인(대시보드 2번째)에서 "진행 31/279
  // 같은 위치에서 반복되어 중단"으로 계속 막혔다. 이름으로 감지해 상세 진입/resume
  // 없이 대시보드에서 roster 만 저장하고 넘어간다.
  function isAutomatedNoDetailCampaign(campaign) {
    const name = normalizeText(campaign?.name || "");
    return /AI\s*스마트\s*광고|\(\s*HUB\s*\)/i.test(name);
  }

  function campaignUsesDetailReport(campaign) {
    // 상세 URL 이 없는 캠페인은 상세 리포트 화면 자체가 없다.
    // 현재 ON/OFF는 오늘의 roster 상태일 뿐 과거 31일의 실적 유무가 아니다.
    // 지금 OFF인 캠페인도 검증된 상세 URL이 있으면 과거 집행 실적을 전부
    // 수집해야 한다. metadata-only 예외는 상세 URL 부재 또는 상품별 상세가 없는
    // 자동화 캠페인(AI스마트광고)인 경우뿐이다.
    if (campaign?.hasDetailHref === false) return false;
    if (isAutomatedNoDetailCampaign(campaign)) return false;
    return true;
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
    const grid = findDashboardCampaignGrid();
    if (!grid) {
      return {
        campaigns: [],
        rawOnlyCampaigns: [],
        titledRowCount: 0,
        missingIdentityNames: [],
      };
    }
    const rowGroups = Array.from(grid.querySelectorAll(".rt-tbody .rt-tr-group"));
    const out = [];
    const rawOnlyCampaigns = [];
    const missingIdentityNames = [];
    let titledRowCount = 0;
    for (let rowIndex = 0; rowIndex < rowGroups.length; rowIndex += 1) {
      const rg = rowGroups[rowIndex];
      const cells = Array.from(rg.querySelectorAll("[role='gridcell']"));
      if (cells.length === 0) continue;

      // 이름이 같은 캠페인이 존재할 수 있으므로 anchor URL/campaign id를 identity로 쓴다.
      const titleEl = dashboardCampaignTitleElement(rg);
      const name = normalizeText(titleEl?.innerText || cells[0]?.innerText || "");
      if (!name) continue;
      titledRowCount += 1;

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

      const anchor = dashboardCampaignAnchor(rg, titleEl);
      const href = anchor?.href || anchor?.getAttribute?.("href") || "";
      const identity = campaignIdentityFromHref(href, name);
      if (!identity) {
        missingIdentityNames.push(name);
        const isLinklessClickableCampaignAnchor =
          anchor &&
          typeof anchor.click === "function" &&
          rg.querySelector("[data-bigfoot-component='campaign_name'] a") === anchor &&
          String(anchor.getAttribute?.("href") || "").trim() === "";
        // 상세 URL/provider id가 없는 AI 캠페인은 표시명을 authoritative
        // identity로 승격하지 않는다. 대신 대시보드에서 관찰한 원본 행을
        // multi_campaign_raw로 저장할 수 있게 별도 큐에 보존한다. 이 행 하나
        // 때문에 식별 가능한 다른 캠페인 전체 sweep을 중단하면 안 된다.
        //
        // anchor 자체가 없거나 예상하지 못한 URL이면 DOM drift일 수 있으므로
        // 기존 fail-closed 동작을 유지한다. 실측된 no-detail 캠페인처럼 anchor가
        // dashboard list URL을 가리키거나, 빈 href 클릭 anchor인 자동화 캠페인만
        // raw-only로 분류한다.
        if (
          isExplicitDashboardListAnchor(anchor) ||
          (isAutomatedNoDetailCampaign({ name }) &&
            isLinklessClickableCampaignAnchor)
        ) {
          rawOnlyCampaigns.push({
            rowIndex,
            name,
            onOff,
            status,
            cells: cells.map((cell) =>
              normalizeText(cell.innerText || cell.textContent || "")),
          });
        } else if (isLinklessClickableCampaignAnchor) {
          // 현재 광고센터는 href를 렌더하지 않고 클릭 핸들러에서만 상세 URL을
          // push한다. 이름을 identity로 발명하지 않고, sweep이 이 행을 클릭한
          // 뒤 실제 `/campaign/{providerId}/...` URL에서 identity를 확정한다.
          out.push({
            identity: null,
            campaignId: null,
            href: "",
            hasDetailHref: null,
            requiresIdentityProbe: true,
            navigationKey: campaignNavigationKey({ rowIndex, name }),
            rowIndex,
            name,
            onOff,
            status,
          });
        }
        continue;
      }

      out.push({
        identity,
        campaignId: campaignIdFromHref(href),
        href: canonicalCampaignHref(href),
        // 상세 리포트로 넘어갈 수 있는 캠페인인지. 상세 URL 이 없으면
        // sweep 이 도달할 수 없는 화면을 기다리다 큐가 멈춘다.
        hasDetailHref: isCampaignDetailHref(canonicalCampaignHref(href)),
        requiresIdentityProbe: false,
        navigationKey: campaignNavigationKey({ rowIndex, name }),
        rowIndex,
        name,
        onOff,
        status,
      });
    }
    return {
      campaigns: out,
      rawOnlyCampaigns,
      titledRowCount,
      missingIdentityNames,
    };
  }

  function campaignIdentityCoverage(inspection) {
    const missingCount = inspection?.missingIdentityNames?.length || 0;
    const rawOnlyCount = inspection?.rawOnlyCampaigns?.length || 0;
    const navigableCount = (inspection?.campaigns || []).filter(
      (campaign) => campaign?.requiresIdentityProbe === true,
    ).length;
    return missingCount !== rawOnlyCount + navigableCount
      ? {
          complete: false,
          error: "campaign_identity_missing",
          missingCount,
          rawOnlyCount,
        }
      : {
          complete: true,
          error: null,
          missingCount,
          rawOnlyCount,
        };
  }

  function buildDashboardRawOnlyRows(campaigns) {
    const values = Array.isArray(campaigns) ? campaigns : [];
    return {
      rawRows: values.map((campaign) => ({
        campaignName: campaign.name || null,
        dashboardOnOff: campaign.onOff || null,
        dashboardStatus: campaign.status || null,
        dashboardCells: Array.isArray(campaign.cells) ? campaign.cells : [],
        _campaignOnly: true,
        _rawOnly: true,
      })),
      normalizedRows: values.map((campaign) => ({
        pageType: "campaign",
        campaignId: null,
        campaignIdentity: null,
        campaignName: campaign.name || null,
        onOff: campaign.onOff || null,
        status: campaign.status || null,
        _campaignOnly: true,
        _rawOnly: true,
      })),
    };
  }

  function dashboardRawOnlyKey(campaign, pageNumber = 1) {
    return [
      "dashboard-raw",
      Math.max(1, Number(pageNumber) || 1),
      Math.max(0, Number(campaign?.rowIndex) || 0),
      normalizeText(campaign?.name || ""),
      ...(Array.isArray(campaign?.cells) ? campaign.cells : []),
    ].join("\u001f");
  }

  function filterPendingCampaigns(
    campaigns,
    completedSeen,
    attemptedThisRun,
    completedNavigationKeys = new Set(),
  ) {
    return (campaigns || []).filter((campaign) => {
      const attemptKey = campaignAttemptKey(campaign);
      if (!attemptKey) return false;
      const completedLinklessNavigation =
        campaign?.requiresIdentityProbe === true &&
        completedNavigationKeys.has(campaign.navigationKey);
      return (
        (!campaign.identity || !completedSeen.has(campaign.identity)) &&
        !completedLinklessNavigation &&
        !attemptedThisRun.has(attemptKey)
      );
    });
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
      const navigationKey = typeof entry.navigationKey === "string"
        ? entry.navigationKey.trim()
        : "";
      const errorKey = identity
        ? `identity:${identity}`
        : navigationKey
          ? `navigation:${navigationKey}`
          : "";
      if (!errorKey) {
        normalized.push(entry);
        continue;
      }

      if (identity) entry.identity = identity;
      else delete entry.identity;
      if (navigationKey) entry.navigationKey = navigationKey;
      const previousIndex = campaignIndexes.get(errorKey);
      if (previousIndex === undefined) {
        campaignIndexes.set(errorKey, normalized.length);
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
    const navigationKey = typeof campaign?.navigationKey === "string"
      ? campaign.navigationKey.trim()
      : "";
    const remainingErrors = normalizeSweepErrors(errors).filter(
      (entry) =>
        (!identity || entry.identity !== identity) &&
        (!navigationKey || entry.navigationKey !== navigationKey),
    );
    if (error) {
      remainingErrors.push({
        ...details,
        ...(identity ? { identity } : {}),
        ...(navigationKey ? { navigationKey } : {}),
        name: campaign?.name || "",
        error,
      });
    }
    return {
      errors: remainingErrors,
      failed: remainingErrors.length,
    };
  }

  function clearResolvedDashboardSweepErrors(errors) {
    return normalizeSweepErrors(errors).filter(
      (entry) => entry.name !== "_dashboard",
    );
  }

  function dashboardSweepCompletionLabel(failed, rawOnlyCampaigns) {
    if (Number(failed) > 0) return "일부 캠페인 동기화 실패";
    if (Number(rawOnlyCampaigns) > 0) {
      return `광고 동기화 완료 · ${Number(rawOnlyCampaigns)}개는 식별자 없어 원본만 보존`;
    }
    return "광고 동기화 완료";
  }

  // 캠페인 상세 페이지 안의 product table 페이지네이션 — 페이지 1, 2, 3... 모든 상품 수집.
  // expectedPages 전체를 순서대로 방문하지 못하면 일부 행을 성공 저장하지 않는다.
  async function parseAcrossProductPages() {
    return collectPaginatedReport({ maxPages: 8 });
  }

  // The product_sales endpoint does not return display metadata such as the
  // product link, thumbnail, status, or display name. Observe those fields
  // once from the already-loaded detail grid, then let the API own every
  // additive metric for each exact day. In particular, never carry the
  // detail page's default 7-day metric cells into an exact-day receipt.
  function stripManualProductMetricColumns(columns) {
    // Do not attempt to maintain a metric-label allowlist here.  The API
    // receipt is the sole source of additive values and this grid may render
    // new provider columns without warning.  Display metadata is copied
    // explicitly by captureManualProductMetadata instead.
    void columns;
    return {};
  }

  async function captureManualProductMetadata(campaign, group) {
    const ads = Array.isArray(group?.ads) ? group.ads : [];
    let parsed = null;
    try {
      // The product grid is a real React-Table report: the first page can be
      // settled while later metadata rows remain behind its paginator. The
      // API roster gives us a safe upper bound on pages (one non-empty page
      // cannot contain more rows than the known ad roster), while the strict
      // collector still requires every provider-declared page to be visited.
      const collected = await collectPaginatedReport({
        maxPages: Math.max(1, ads.length),
        readPage: () => readSettledReportPage(30000),
        advancePage: (previous) => advanceReportPage(previous),
      });
      if (collected?.complete) {
        parsed = collected;
      } else {
        console.warn(
          "[KIDITEM manual product] metadata pagination incomplete",
          collected?.error || "unknown_error",
        );
      }
    } catch (error) {
      console.warn("[KIDITEM manual product] metadata observation unavailable", error?.message || error);
    }
    const observedRows = Array.isArray(parsed?.normalizedRows) ? parsed.normalizedRows : [];
    const byVendorItemId = new Map();
    const byProductName = new Map();
    let invalidObservedId = false;
    const metadataRows = observedRows.map((row) => {
      const metadata = {
        itemId: normalizeProviderId(row.itemId) || null,
        vendorItemId: normalizeProviderId(row.itemId) || null,
        productName: normalizeText(row.productName || "") || null,
        imageUrl: normalizeText(row.imageUrl || "") || null,
        productUrl: normalizeText(row.productUrl || "") || null,
        status: row.status == null ? null : normalizeText(row.status) || null,
        onOff: row.onOff == null ? null : normalizeText(row.onOff) || null,
        // Product-sales owns all additive metrics.  Keep this observation
        // metadata-only; arbitrary grid headers are period-sensitive and may
        // leak stale or unknown metrics into the owner payload.
        rawColumns: {},
      };
      const rawItemId = normalizeText(row.itemId || "");
      if (rawItemId && !metadata.itemId) invalidObservedId = true;
      if (metadata.vendorItemId) {
        const rowsForId = byVendorItemId.get(metadata.vendorItemId) || [];
        rowsForId.push(metadata);
        byVendorItemId.set(metadata.vendorItemId, rowsForId);
      }
      if (metadata.productName) {
        const rowsForName = byProductName.get(normalizeKey(metadata.productName)) || [];
        rowsForName.push(metadata);
        byProductName.set(normalizeKey(metadata.productName), rowsForName);
      }
      return metadata;
    });

    const metadataByAdId = new Map();
    const metadataByVendorItemId = new Map();
    const failure = (reason) => ({
      ok: false,
      reason,
      campaignId: campaign?.campaignId || null,
      campaignIdentity: campaign?.identity || null,
      campaignName: campaign?.name || "",
      adGroupId: group?.adGroupId || null,
      adGroupName: group?.adGroupName || null,
      adSelectionType: group?.adSelectionType || null,
      ads,
      metadataByAdId,
      metadataByVendorItemId,
      observedRowCount: observedRows.length,
      metadataAdCount: metadataByVendorItemId.size,
    });

    if (invalidObservedId) return failure("metadata_conflicting_or_invalid_item_id");

    const rowsWithIds = metadataRows.filter((metadata) => metadata.vendorItemId);
    const domHasVerifiedIds = rowsWithIds.length > 0;
    if (metadataRows.length !== ads.length) return failure("metadata_observed_count_mismatch");
    // A partially identified grid is not safe to join: falling back to names
    // could silently map an ad to a different vendor item.
    if (domHasVerifiedIds && rowsWithIds.length !== metadataRows.length) {
      return failure("metadata_identity_incomplete");
    }

    if (domHasVerifiedIds) {
      for (const ad of ads) {
        const adId = normalizeProviderId(ad?.adId);
        const vendorItemId = normalizeProviderId(ad?.vendorItemId);
        const matches = byVendorItemId.get(vendorItemId) || [];
        if (!adId || !vendorItemId || matches.length !== 1) {
          return failure(matches.length > 1
            ? "metadata_duplicate_vendor_item_id"
            : "metadata_vendor_item_id_unmatched");
        }
        const metadata = matches[0];
        metadataByAdId.set(adId, metadata);
        metadataByVendorItemId.set(vendorItemId, metadata);
      }
    } else {
      // Name matching is only an emergency compatibility path for a grid that
      // genuinely exposes no item IDs. It must be one-to-one, with no blank or
      // colliding names and exactly one DOM row per advertised ad.
      if (metadataRows.length !== ads.length || ads.length === 0) {
        return failure("metadata_observed_count_mismatch");
      }
      for (const ad of ads) {
        const adId = normalizeProviderId(ad?.adId);
        const vendorItemId = normalizeProviderId(ad?.vendorItemId);
        const name = normalizeKey(ad?.itemName || "");
        const matches = name ? (byProductName.get(name) || []) : [];
        if (!adId || !vendorItemId || !name || matches.length !== 1) {
          return failure(matches.length > 1
            ? "metadata_ambiguous_product_name"
            : "metadata_product_name_unmatched");
        }
        const metadata = matches[0];
        metadataByAdId.set(adId, metadata);
        metadataByVendorItemId.set(vendorItemId, metadata);
      }
    }

    if (metadataByVendorItemId.size !== ads.length || metadataByAdId.size !== ads.length) {
      return failure("metadata_one_to_one_join_failed");
    }

    return {
      ok: true,
      reason: null,
      campaignId: campaign?.campaignId || null,
      campaignIdentity: campaign?.identity || null,
      campaignName: campaign?.name || "",
      adGroupId: group?.adGroupId || null,
      adGroupName: group?.adGroupName || null,
      adSelectionType: group?.adSelectionType || null,
      ads,
      metadataByAdId,
      metadataByVendorItemId,
      observedRowCount: observedRows.length,
      metadataAdCount: metadataByVendorItemId.size,
    };
  }

  // While a campaign sweep runs, the collector replaces Coupang's alert and
  // confirm in this tab's page world with a recorder so the page never blocks
  // (background/coupang/ad-center-collector.js). Both worlds share the tab's
  // sessionStorage, and a dialog recorded during a page wait is a page error.
  const ADS_DIALOG_LOG_KEY = "kiditem_ads_dialog_log_v1";
  const DASHBOARD_NOT_LOADED_REASON =
    "쿠팡 광고 대시보드 표를 불러오지 못했습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.";
  const FAILED_CAMPAIGN_NAMES_SHOWN = 3;

  function recordedDialogs() {
    try {
      const log = JSON.parse(sessionStorage.getItem(ADS_DIALOG_LOG_KEY) || "[]");
      return Array.isArray(log)
        ? log.filter((entry) => Number.isSafeInteger(entry?.seq) && entry.seq > 0)
        : [];
    } catch {
      return [];
    }
  }

  function recordedDialogCursor() {
    return recordedDialogs().reduce((cursor, entry) => Math.max(cursor, entry.seq), 0);
  }

  // The latest alert or confirm recorded after `cursor` as { kind, message }, or
  // null when the page showed none. A recorded confirm was answered false, so
  // the page did not go on either.
  function recordedDialogSince(cursor) {
    const dialog = recordedDialogs()
      .filter((entry) => (entry.kind === "alert" || entry.kind === "confirm") && entry.seq > cursor)
      .at(-1);
    return dialog
      ? { kind: dialog.kind, message: normalizeText(String(dialog.message ?? "")).slice(0, 120) }
      : null;
  }

  function withCoupangDialog(reason, dialog) {
    if (!dialog) return reason.slice(0, 300);
    const label = dialog.kind === "confirm" ? "쿠팡 확인 창" : "쿠팡 알림";
    const text = normalizeText(String(dialog.message ?? "")).slice(0, 120);
    return `${reason} ${label}: '${text}'`.slice(0, 300);
  }

  function dialogFailureDetails(dialog) {
    return dialog ? { dialogKind: dialog.kind, dialogMessage: dialog.message } : {};
  }

  // The owner failure message for campaigns still failing after their retry.
  function campaignSweepFailureReason(errors) {
    const failures = normalizeSweepErrors(errors).filter((entry) => entry?.name !== "_dashboard");
    const shown = failures
      .map((entry) => normalizeText(entry?.name || ""))
      .filter(Boolean)
      .slice(0, FAILED_CAMPAIGN_NAMES_SHOWN)
      .map((name) => (name.length > 40 ? `${name.slice(0, 39)}…` : name));
    const hidden = failures.length - shown.length;
    const names = shown.length > 0
      ? `: ${shown.join(", ")}${hidden > 0 ? ` 외 ${hidden}개` : ""}`
      : "";
    const latest = failures.filter((entry) => typeof entry?.dialogMessage === "string").at(-1);
    return withCoupangDialog(
      `쿠팡 광고 캠페인 ${failures.length}개를 불러오지 못했습니다${names}.`,
      latest ? { kind: latest.dialogKind, message: latest.dialogMessage } : null,
    );
  }

  // Korean reasons for a sweep that stopped at the dashboard itself. The codes
  // stay in the sweep's error list; this message is what reaches the screen.
  const DASHBOARD_SWEEP_ERROR_REASONS = Object.freeze({
    campaign_identity_missing: "쿠팡 광고 대시보드에서 캠페인을 구분할 정보를 찾지 못했습니다.",
    dashboard_pagination_unverified: "쿠팡 광고 대시보드의 페이지 정보를 확인하지 못했습니다.",
    dashboard_page_navigation_failed: "쿠팡 광고 대시보드의 다음 페이지로 넘어가지 못했습니다.",
    dashboard_next_page_not_loaded: "쿠팡 광고 대시보드의 다음 페이지를 불러오지 못했습니다.",
    dashboard_page_number_not_increased: "쿠팡 광고 대시보드의 다음 페이지로 넘어가지 않았습니다.",
    dashboard_return_after_identity_probe_failed: "쿠팡 광고 캠페인 화면에서 대시보드로 돌아오지 못했습니다.",
    dashboard_pagination_limit_exceeded: "쿠팡 광고 대시보드의 페이지가 너무 많아 수집을 멈췄습니다.",
  });

  function dashboardSweepErrorReason(sweepError, dialog = null) {
    const reason = Object.hasOwn(DASHBOARD_SWEEP_ERROR_REASONS, sweepError)
      ? DASHBOARD_SWEEP_ERROR_REASONS[sweepError]
      : "쿠팡 광고 대시보드 수집을 마치지 못했습니다.";
    return withCoupangDialog(reason, dialog);
  }

  // 대시보드 그리드 렌더 대기 (rows + .dashboard-title 둘 다 채워질 때까지)
  // 이전: rows.length > 0 만 보고 바로 통과 → row 가 mount 됐지만 .dashboard-title
  // 이 아직 비어있는 짧은 시점에 listAllCampaignsFromDashboard 가 빈 배열 반환 → 외부
  // 루프가 "더 처리할 캠페인 없음" 으로 판단하고 break 해버리는 race. .dashboard-title
  // 셀에 텍스트가 들어올 때까지 추가 대기.
  async function waitForDashboardGrid(timeoutMs = 15000) {
    const dialogCursor = recordedDialogCursor();
    // pollUntil: 백그라운드 창의 타이머 스로틀에도 최소 시도 횟수를 보장한다.
    const found = await pollUntil(
      () => {
        // A Coupang dialog while the grid loads is a page error, not a slow render.
        if (recordedDialogSince(dialogCursor)) return "dialog";
        // 상세 화면에도 campaign table/empty-state가 존재한다. URL 경계를 먼저
        // 확인하지 않으면 상세 화면을 dashboard 복귀 완료로 오판할 수 있다.
        if (!isDashboardListPage()) return false;
        const grid = findDashboardCampaignGrid();
        const rows = grid?.querySelectorAll(".rt-tbody .rt-tr-group") || [];
        if (rows.length > 0) {
          const titled = Array.from(rows).filter((r) => {
            const t = dashboardCampaignTitleElement(r);
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
  async function waitForCampaignDetailPage(expectedCampaign, timeoutMs = 20000, dialogCursor = recordedDialogCursor()) {
    // pollUntil: 상세 진입은 sweep 에서 가장 늦게 도달하는 대기라 백그라운드
    // intensive throttling(5분 경과)의 직격탄을 맞는다. 벽시계 예산만 보던
    // 기존 루프는 여기서 1회 시도 후 타임아웃했다.
    const ready = await pollUntil(
      () => {
        // A Coupang dialog while the detail page loads is a page error.
        if (recordedDialogSince(dialogCursor)) return { dialog: true };
        const snapshot = readReportPageSnapshot();
        const isReady = campaignDetailReady({
          onDashboardList: isDashboardListPage(),
          identityMatches: campaignIdentityMatches(expectedCampaign),
          hasDashboardCampaignRows:
            document.querySelectorAll(
              ".rt-tbody .dashboard-title, [role='grid'] .dashboard-title, " +
              ".rt-tbody [data-bigfoot-component='campaign_name'] a, " +
              "[role='grid'] [data-bigfoot-component='campaign_name'] a",
            ).length > 0,
          surfaceKind: snapshot.surface.kind,
        });
        return isReady ? snapshot : false;
      },
      { timeoutMs, intervalMs: 300 },
    );
    const dialog = recordedDialogSince(dialogCursor);
    if (dialog) {
      return {
        ok: false,
        error: `coupang_${dialog.kind}`,
        identity: expectedCampaign?.identity || null,
        dialog,
      };
    }
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
    const grid = findDashboardCampaignGrid();
    if (!grid) return false;
    const rowGroups = Array.from(grid.querySelectorAll(".rt-tbody .rt-tr-group"));
    for (let rowIndex = 0; rowIndex < rowGroups.length; rowIndex += 1) {
      const rg = rowGroups[rowIndex];
      const titleEl = dashboardCampaignTitleElement(rg);
      if (!titleEl) continue;
      const anchor = dashboardCampaignAnchor(rg, titleEl);
      const href = anchor?.href || anchor?.getAttribute?.("href") || "";
      const rowName = normalizeText(titleEl.innerText || "");
      const identityMatches =
        campaign?.identity &&
        campaignIdentityFromHref(href, rowName) === campaign.identity;
      const navigationMatches =
        campaign?.requiresIdentityProbe === true &&
        campaignNavigationKey({
          pageNumber: campaign.pageNumber,
          rowIndex,
          name: rowName,
        }) === campaign.navigationKey;
      if (anchor && (identityMatches || navigationMatches)) {
        anchor.click();
        return true;
      }
    }
    return false;
  }

  async function probeCampaignIdentityByNavigation(campaign, timeoutMs = 20000) {
    if (campaign?.identity) {
      return { ok: true, campaign, navigated: false };
    }
    if (campaign?.requiresIdentityProbe !== true) {
      return { ok: false, error: "campaign_identity_missing" };
    }
    // 2026-07 광고센터의 href 없는 캠페인명은 React SPA 이동처럼 보이지만
    // 실제로는 새 document를 로드한다. 클릭 전에 dashboard row identity를
    // sessionStorage에 남겨 새 content script가 상세 URL의 provider id와
    // 결합해 같은 collection run을 이어갈 수 있게 한다.
    const dialogCursor = recordedDialogCursor();
    savePendingCampaignNavigation(campaign);
    if (!clickCampaignAnchor(campaign)) {
      clearPendingCampaignNavigation();
      return { ok: false, error: "campaign_anchor_not_found" };
    }
    const immediate = campaignWithIdentityFromHref(campaign, window.location.href);
    if (immediate) {
      return { ok: true, campaign: immediate, navigated: true };
    }
    const resolved = await pollUntil(
      () => {
        // A Coupang dialog while the campaign opens is a page error.
        if (recordedDialogSince(dialogCursor)) return { dialog: true };
        if (isDashboardListPage()) return false;
        return campaignWithIdentityFromHref(campaign, window.location.href) || false;
      },
      { timeoutMs, intervalMs: 200 },
    );
    const dialog = recordedDialogSince(dialogCursor);
    if (dialog) {
      clearPendingCampaignNavigation();
      return { ok: false, error: `coupang_${dialog.kind}`, dialog };
    }
    if (resolved) {
      return { ok: true, campaign: resolved, navigated: true };
    }
    clearPendingCampaignNavigation();
    return { ok: false, error: "campaign_identity_navigation_timeout" };
  }

  function dashboardReturnHref(control) {
    if (!control) return "";
    const ownHref = typeof control.getAttribute === "function"
      ? String(control.getAttribute("href") || "").trim()
      : "";
    if (ownHref && isDashboardListHref(ownHref)) return ownHref;
    const nested = control.querySelector?.("[href]");
    const nestedHref = typeof nested?.getAttribute === "function"
      ? String(nested.getAttribute("href") || "").trim()
      : "";
    return nestedHref && isDashboardListHref(nestedHref) ? nestedHref : "";
  }

  function findDashboardReturnControl() {
    // 실측(2026-07-24): 상세 화면 하단의 "모든 캠페인"은 breadcrumb가 아니라
    // 현재 상세 화면 안의 캠페인 표 제목이다. 실제 SPA 목록 복귀 컨트롤은
    // 왼쪽 메뉴의 매출 성장 항목이다. 이 메뉴는 data-bigfoot-component는
    // 안정적으로 갖지만 현재 DOM에서는 li/nested element 어디에도 href를
    // 렌더하지 않고 React onClick으로만 이동한다.
    const primaryLabel = document.querySelector(
      "[data-bigfoot-component='lnb-menu-ads-management-sales']",
    );
    // 실측 DOM은 data-bigfoot marker가 href 없는 <a>에 있고, React 이동
    // 핸들러도 그 <a>에만 연결돼 있다. 바깥 li[role=menuitem]의 native
    // click()은 이벤트를 안쪽 자식으로 전달하지 않아 아무 이동도 일으키지
    // 않으므로 marker 자체를 클릭해야 한다.
    if (typeof primaryLabel?.click === "function") {
      return primaryLabel;
    }
    const candidates = [
      ...Array.from(
        document.querySelectorAll(
          "li[role='menuitem'][href], nav a[href]",
        ),
      ),
    ].filter(Boolean);
    return candidates.find(
      (candidate) =>
        typeof candidate.click === "function" &&
        dashboardReturnHref(candidate),
    ) || null;
  }

  async function returnToDashboard(timeoutMs = 20000) {
    if (isDashboardListPage()) return waitForDashboardGrid(timeoutMs);

    // 날짜 선택이 상세 SPA history를 추가하므로 history.back() 한 번은 같은
    // 상세 화면의 이전 날짜 상태로만 돌아갈 수 있다. 검증된 매출 성장 메뉴만
    // 클릭한다. 상세 URL이 먼저 바뀌고 LNB가 나중에 mount되는 SPA race가
    // 있으므로 컨트롤도 기다린 뒤, 정확한 dashboard URL + grid가 확인될
    // 때만 복귀 성공이다.
    const dashboardControl = await pollUntil(
      () => findDashboardReturnControl() || false,
      {
        timeoutMs: Math.min(timeoutMs, 10000),
        intervalMs: 200,
      },
    );
    if (!dashboardControl) return false;
    dashboardControl.click();
    return waitForDashboardGrid(timeoutMs);
  }

  // sessionStorage-backed seen — content script 가 reload 돼도 sweep 이어서 진행.
  // 이전: 매 reload 마다 seen=[] 으로 시작 → 같은 첫 N 개만 처리되는 무한 루프 위험.
  // v2부터 캠페인명이 아니라 campaign id/canonical href를 저장한다. v1 이름
  // 배열을 재사용하면 동명이 캠페인의 진행률과 재개 상태가 섞인다.
  const SEEN_KEY = "kiditem_ad_sweep_seen_v2";
  const COMPLETED_NAVIGATION_KEYS_KEY =
    "kiditem_ad_sweep_completed_navigation_keys_v1";
  const PENDING_CAMPAIGN_NAVIGATION_KEY =
    "kiditem_ad_sweep_pending_campaign_navigation_v1";
  const PROGRESS_KEY = "kiditem_ad_sweep_progress_v2";
  const LEGACY_RUN_KEY = "kiditem_ad_sweep_run_v1";
  const RUN_KEY = "kiditem_ad_sweep_run_v2";
  const SWEEP_CONTRACT_VERSION = "daily-window-v2";
  // A complete roster can contain dozens of campaigns. Holding one
  // content-script response open for every campaign × 31 days exceeds the
  // collection window's 30-minute message budget. Persist exact-day keys and
  // intentionally hand off after a bounded slice; the owner navigates back to
  // the dashboard and resumes the same run/attempt.
  const MAX_DAILY_WORK_UNITS_PER_INVOCATION = 12;
  const MAX_DAILY_SLICE_WALL_MS = 20 * 60 * 1000;
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
  function loadCompletedNavigationKeys() {
    try {
      const raw = sessionStorage.getItem(COMPLETED_NAVIGATION_KEYS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }
  function saveCompletedNavigationKeys(completedNavigationKeys) {
    try {
      sessionStorage.setItem(
        COMPLETED_NAVIGATION_KEYS_KEY,
        JSON.stringify([...completedNavigationKeys]),
      );
    } catch {}
  }
  function terminalLinklessNavigationKey(campaign) {
    const navigationKey =
      typeof campaign?.navigationKey === "string"
        ? campaign.navigationKey.trim()
        : "";
    if (
      !navigationKey ||
      (campaign?.requiresIdentityProbe !== true &&
        campaign?.discoveredByNavigation !== true)
    ) {
      return null;
    }
    return navigationKey;
  }
  function persistTerminalLinklessNavigation(
    campaign,
    completedNavigationKeys,
  ) {
    const navigationKey = terminalLinklessNavigationKey(campaign);
    if (
      !navigationKey ||
      !completedNavigationKeys ||
      typeof completedNavigationKeys.add !== "function" ||
      typeof completedNavigationKeys[Symbol.iterator] !== "function"
    ) {
      return null;
    }
    completedNavigationKeys.add(navigationKey);
    saveCompletedNavigationKeys(completedNavigationKeys);
    return navigationKey;
  }
  function savePendingCampaignNavigation(campaign) {
    if (!campaign || typeof campaign !== "object") return false;
    const pending = {
      campaignId:
        typeof campaign.campaignId === "string" ? campaign.campaignId : null,
      href: typeof campaign.href === "string" ? campaign.href : "",
      identity:
        typeof campaign.identity === "string" ? campaign.identity : null,
      name: normalizeText(campaign.name || ""),
      navigationKey:
        typeof campaign.navigationKey === "string"
          ? campaign.navigationKey
          : campaignNavigationKey(campaign),
      onOff: normalizeText(campaign.onOff || ""),
      pageNumber: Math.max(1, Number(campaign.pageNumber) || 1),
      rowIndex: Math.max(0, Number(campaign.rowIndex) || 0),
      status: normalizeText(campaign.status || ""),
      discoveredByNavigation: true,
      requiresIdentityProbe: true,
    };
    if (!pending.name || !pending.navigationKey) return false;
    try {
      sessionStorage.setItem(
        PENDING_CAMPAIGN_NAVIGATION_KEY,
        JSON.stringify(pending),
      );
      return true;
    } catch {
      return false;
    }
  }
  function loadPendingCampaignNavigation() {
    try {
      const raw = sessionStorage.getItem(PENDING_CAMPAIGN_NAVIGATION_KEY);
      if (!raw) return null;
      const pending = JSON.parse(raw);
      if (
        !pending ||
        typeof pending !== "object" ||
        typeof pending.name !== "string" ||
        !pending.name.trim() ||
        typeof pending.navigationKey !== "string" ||
        !pending.navigationKey.trim()
      ) {
        return null;
      }
      return {
        ...pending,
        name: normalizeText(pending.name),
        navigationKey: pending.navigationKey.trim(),
        pageNumber: Math.max(1, Number(pending.pageNumber) || 1),
        rowIndex: Math.max(0, Number(pending.rowIndex) || 0),
        discoveredByNavigation: true,
        requiresIdentityProbe: pending.requiresIdentityProbe !== false,
      };
    } catch {
      return null;
    }
  }
  function clearPendingCampaignNavigation() {
    try {
      sessionStorage.removeItem(PENDING_CAMPAIGN_NAVIGATION_KEY);
    } catch {}
  }
  function campaignNavigationHandoff(href = window.location.href) {
    const pending = loadPendingCampaignNavigation();
    if (!pending) return { state: "none", campaign: null };
    const resumed = campaignWithIdentityFromHref(pending, href);
    if (resumed) return { state: "detail", campaign: resumed };
    if (isDashboardListHref(href)) {
      return { state: "returned_to_dashboard", campaign: pending };
    }
    return { state: "unresolved", campaign: pending };
  }
  function campaignResumedFromDetailHref(href = window.location.href) {
    const handoff = campaignNavigationHandoff(href);
    return handoff.state === "detail" ? handoff.campaign : null;
  }
  function clearSweepState() {
    try {
      sessionStorage.removeItem(SEEN_KEY);
      sessionStorage.removeItem(COMPLETED_NAVIGATION_KEYS_KEY);
      sessionStorage.removeItem(PENDING_CAMPAIGN_NAVIGATION_KEY);
      sessionStorage.removeItem(PROGRESS_KEY);
      sessionStorage.removeItem(LEGACY_RUN_KEY);
      sessionStorage.removeItem(RUN_KEY);
      // The managed collection tab is reused across browser-collection runs.
      // Keep the lockout guard within one run, but do not let a completed or
      // abandoned run consume the next run's account-selector click budget.
      // A wrong credential still cannot loop because same-run resumes do not
      // clear this counter.
      sessionStorage.removeItem(AD_LOGIN_AUTOSUBMIT_ATTEMPTS_KEY);
    } catch {}
  }
  function prepareSweepRun(collectionRunId, collectionAttempt) {
    const requestedRunId =
      typeof collectionRunId === "string" ? collectionRunId.trim() : "";
    const requestedAttempt = normalizeCollectionAttempt(collectionAttempt);
    const requestedSweepKey = requestedRunId
      ? `${requestedRunId}:${requestedAttempt}:${SWEEP_CONTRACT_VERSION}`
      : "";
    if (!requestedRunId) {
      // popup 등 run id가 없는 명시적 수동 실행은 항상 새 sweep이다.
      clearSweepState();
      return { fresh: true, runId: null, attempt: 1 };
    }
    try {
      const storedSweepKey = String(sessionStorage.getItem(RUN_KEY) || "").trim();
      if (storedSweepKey === requestedSweepKey) {
        return {
          fresh: false,
          runId: requestedRunId,
          attempt: requestedAttempt,
        };
      }
      clearSweepState();
      sessionStorage.setItem(RUN_KEY, requestedSweepKey);
      return {
        fresh: true,
        runId: requestedRunId,
        attempt: requestedAttempt,
      };
    } catch {
      return {
        fresh: true,
        runId: requestedRunId,
        attempt: requestedAttempt,
      };
    }
  }

  function normalizeProfitabilitySlice(value) {
    if (!value || typeof value !== "object") return null;
    const dates = Array.isArray(value.businessDates)
      ? value.businessDates.filter((date) => parseBusinessYmd(date))
      : [];
    if (dates.length < 1 || dates.length > CAMPAIGN_DAILY_WINDOW_DAYS) return null;
    if (new Set(dates).size !== dates.length) return null;
    for (let index = 1; index < dates.length; index += 1) {
      const expected = parseBusinessYmd(dates[index - 1]);
      expected.setUTCDate(expected.getUTCDate() + 1);
      if (dates[index] !== utcYmd(expected)) return null;
    }
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    if (value.startDate !== startDate || value.endDate !== endDate) return null;
    return {
      sliceId: typeof value.sliceId === "string" ? value.sliceId : `${startDate}_${endDate}`,
      startDate,
      endDate,
      businessDates: dates,
    };
  }

  function loadProgress() {
    try {
      const raw = sessionStorage.getItem(PROGRESS_KEY);
      return raw
        ? JSON.parse(raw)
        : {
            synced: 0,
            failed: 0,
            totalRows: 0,
            errors: [],
            rawOnlyCampaigns: 0,
            savedRawOnlyKeys: [],
          };
    } catch {
      return {
        synced: 0,
        failed: 0,
        totalRows: 0,
        errors: [],
        rawOnlyCampaigns: 0,
        savedRawOnlyKeys: [],
      };
    }
  }
  function saveProgress(p) {
    try {
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch {}
  }

  let activeCollectionRunId = null;
  let activeCollectionAttempt = 1;
  let activeCampaignControl = null;
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

  function campaignDateWorkUnits({
    completedCampaignDateKeys,
    completedCampaignIdentities,
    failedCampaignKeys,
    rawOnlyCampaignCount,
    daysPerCampaign = CAMPAIGN_DAILY_WINDOW_DAYS,
  }) {
    const terminalKeys = new Set([
      ...(completedCampaignIdentities || []),
      ...(failedCampaignKeys || []),
    ]);
    let partialDateUnits = 0;
    for (const value of completedCampaignDateKeys || []) {
      const separator = typeof value === "string" ? value.lastIndexOf("\u001f") : -1;
      if (separator <= 0) continue;
      const identity = value.slice(0, separator);
      if (!terminalKeys.has(identity)) partialDateUnits += 1;
    }
    const terminalCampaignUnits =
      terminalKeys.size * Math.max(1, Number(daysPerCampaign) || 1);
    const rawOnlyUnits =
      Math.max(0, Number(rawOnlyCampaignCount) || 0) *
      Math.max(1, Number(daysPerCampaign) || 1);
    return terminalCampaignUnits + rawOnlyUnits + partialDateUnits;
  }

  function unresolvedCampaignWorkKeys(errors) {
    return normalizeSweepErrors(errors)
      .filter(
        (entry) =>
          entry?.name !== "_dashboard" && entry?.retryable !== true,
      )
      .map((entry) => {
        const identity = typeof entry?.identity === "string"
          ? entry.identity.trim()
          : "";
        if (identity) return identity;
        const navigationKey = typeof entry?.navigationKey === "string"
          ? entry.navigationKey.trim()
          : "";
        return navigationKey ? `navigation:${navigationKey}` : "";
      })
      .filter(Boolean);
  }

  function estimateSweepDateWorkTotal({
    current,
    campaignTotal,
    previousTotal,
    daysPerCampaign = CAMPAIGN_DAILY_WINDOW_DAYS,
  }) {
    const days = Math.max(1, Number(daysPerCampaign) || 1);
    return Math.max(
      Math.max(0, Number(current) || 0),
      Math.max(0, Number(campaignTotal) || 0) * days,
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
    if (!campaignUsesDetailReport(campaign)) {
      return { campaignReportScope: "single_campaign_metadata_raw" };
    }
    return {
      campaignReportScope: "single_campaign_authoritative",
      period: "1d",
      periodLabel: businessDate,
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

  async function campaignSourceStep(step, body) {
    const control = activeCampaignControl;
    if (!control || control.attemptId !== activeCollectionRunId || control.state !== "RUNNING" ||
      Date.now() >= Date.parse(control.expiresAt)) throw new Error("유효한 광고 캠페인 수집 허가가 필요합니다.");
    const advertiserId = observedKeywordAdvertiser(control);
    if (body && control.receipts.some(receipt => receipt.key === body.key)) return;
    const payload = body ? { ...body, advertiserId, capturedAt: new Date().toISOString() } : null;
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "advertisingCampaignSourceStep", attemptId: control.attemptId, step,
        ...(payload ? { body: payload } : {}) }, result => {
        if (chrome.runtime.lastError || !result?.success) {
          reject(Object.assign(new Error(result?.error || chrome.runtime.lastError?.message || "광고 캠페인 owner 전송 실패"),
            { code: result?.errorCode || "SOURCE_OWNER_UNAVAILABLE" }));
        } else resolve(result);
      });
    });
    if (step === "resume") activeCampaignControl = response.control;
    if (step === "receipt") {
      control.receipts.push(response.receipt);
      control.manifestChecksum = response.manifestChecksum;
      if (payload.kind === "dashboard_page") control.pages.push(payload);
      if (payload.kind === "campaign") {
        const { payload: _rows, ...campaign } = payload;
        control.campaigns.push(campaign);
      }
    }
    return response;
  }

  async function runDashboardSweep(initialControl) {
    const loginHandoff = advertisingLoginHandoffResponse();
    if (loginHandoff) return loginHandoff;
    activeCampaignControl = initialControl;
    await campaignSourceStep("resume");
    const startedOnDashboard = isDashboardListPage();
    const navigationHandoff = campaignNavigationHandoff(window.location.href);
    let detailResumeCampaign =
      navigationHandoff.state === "detail"
        ? navigationHandoff.campaign
        : null;
    let dashboardReturnedCampaign =
      startedOnDashboard &&
      navigationHandoff.state === "returned_to_dashboard"
        ? navigationHandoff.campaign
        : null;
    if (!startedOnDashboard && !detailResumeCampaign) {
      // 진단: resume 가 대시보드도, 인식된 상세도 아닌 곳에 떨어진 이유를 에러에
      // 실어 웹 모달에서 바로 보이게 한다(수집 창 콘솔을 자동화로 못 읽는 상황 대응).
      let landedPath = window.location.href;
      try {
        landedPath = new URL(window.location.href).pathname +
          (window.location.hash || "");
      } catch {}
      let pendingName = "∅";
      try {
        const pend = loadPendingCampaignNavigation();
        pendingName = pend ? pend.name || "(무명)" : "∅";
      } catch {}
      const urlCid = campaignIdFromHref(window.location.href) || "∅";
      return {
        success: false,
        error:
          "대시보드 페이지가 아닙니다 " +
          `[path:${landedPath} handoff:${navigationHandoff.state} ` +
          `pending:${pendingName} urlCid:${urlCid}]`,
        url: window.location.href,
      };
    }

    const yesterday = activeCampaignControl.plan.endDate;
    const campaignBusinessDates = activeCampaignControl.plan.businessDates;
    const dailyWindowDays = campaignBusinessDates.length;
    const dailyCoverage = campaignDailyCoverage(
      campaignBusinessDates,
      dailyWindowDays,
    );
    if (!dailyCoverage.campaignDailyCollectionComplete) {
      return {
        success: false,
        error: "campaign_daily_window_invalid",
        coverage: dailyCoverage,
      };
    }
    const acceptedCampaignByKey = new Map(activeCampaignControl.campaigns.map(campaign => [campaign.campaignKey, campaign]));
    const acceptedDays = new Set(activeCampaignControl.receipts.filter(receipt => receipt.kind === "campaign_day")
      .flatMap(receipt => {
        const campaign = acceptedCampaignByKey.get(receipt.campaignKey);
        return campaign?.campaignId ? [`campaign:${campaign.campaignId}\u001f${receipt.businessDate}`] : [];
      }));
    const acceptedCampaigns = activeCampaignControl.campaigns.filter(campaign => campaign.mode !== "raw_only" &&
      (campaign.mode === "metadata" || campaignBusinessDates.every(date => acceptedDays.has(`campaign:${campaign.campaignId}\u001f${date}`))));
    const resumeSeen = new Set(acceptedCampaigns.map(campaign => `campaign:${campaign.campaignId}`));
    const completedNavigationKeys = loadCompletedNavigationKeys();
    const resumeProgress = loadProgress();
    if (detailResumeCampaign) {
      showBadge(
        `▶️ ${detailResumeCampaign.name} 상세 페이지에서 ${dailyWindowDays}일 수집 재개`,
        "#6366f1",
      );
    } else if (resumeSeen.size > 0) {
      showBadge(`▶️ ${dailyWindowDays}일 광고 동기화 이어서 진행 — ${yesterday}까지 (${resumeSeen.size}개 완료)`, "#6366f1");
    } else {
      showBadge(`🔄 ${dailyWindowDays}일 광고 동기화 시작 — ${dailyCoverage.campaignDailyFrom} ~ ${yesterday}`, "#6366f1");
    }

    // 1) 대시보드 그리드 렌더 대기 (기본 7일 상태 유지 — 날짜 변경 금지)
    //    이유: 대시보드에서 setDateRange(어제) 하면 운영중 캠페인 행이 사라져서 sweep 자체가 빈 큐로 끝남.
    //    날짜 변경은 각 캠페인 상세 페이지에 진입한 뒤에 수행한다.
    if (startedOnDashboard) {
      const dialogCursor = recordedDialogCursor();
      if (!(await waitForDashboardGrid(15000))) {
        showBadge("❌ 캠페인 목록 로드 실패", "#ef4444");
        // The collector reloads the tab once for this code before failing the sweep.
        return {
          success: false,
          errorCode: "AD_DASHBOARD_NOT_LOADED",
          error: withCoupangDialog(DASHBOARD_NOT_LOADED_REASON, recordedDialogSince(dialogCursor)),
        };
      }
    }
    // 그리드 첫 행 mount 직후 onOff/status 셀이 늦게 채워지는 케이스 대응
    if (startedOnDashboard) await sleep(1200);

    // 2) 모든 캠페인 sweep — 페이지별 interleaved 처리.
    //    이유: pre-collection 후 per-campaign 처리하면 history.back() 이 어느 페이지로
    //    돌려놓을지 보장 못 함 (Coupang dashboard SPA 가 페이지 state 를 항상 보존하지
    //    않음). page-by-page 처리 + seen 셋으로 dedupe → 어떤 페이지로 떨어져도 중복
    //    수집 없이 진행.
    let synced = resumeSeen.size;
    let totalRows = resumeProgress.totalRows || 0;
    let errors = normalizeSweepErrors(resumeProgress.errors);
    let failed = errors.length;
    const seen = resumeSeen; // Owner-accepted coverage only; local storage is navigation/progress.
    const attemptedThisRun = new Set(); // 실패는 같은 실행에서만 건너뛰고 reload/restart 시 재시도
    const completedCampaignDateKeys = acceptedDays;
    const savedRawOnlyKeys = new Set(activeCampaignControl.campaigns.filter(campaign => campaign.mode === "raw_only").map(campaign => campaign.campaignKey));
    let rawOnlyCampaigns = Math.max(
      Math.max(0, Number(resumeProgress.rawOnlyCampaigns) || 0),
      savedRawOnlyKeys.size,
    );
    const confirmedRawOnlyKeys = new Set(savedRawOnlyKeys);
    let totalDiscovered = seen.size; // 진행률 표시용 — resume 시 이어서 카운트
    let progressTotal = Math.max(
      seen.size,
      Number(resumeProgress.progressTotal) || 0,
    );
    let progressWorkTotal = Math.max(
      0,
      Number(resumeProgress.progressWorkTotal) || 0,
    );
    let dateWorkUnitsThisInvocation = 0;
    const invocationStartedAt = Date.now();
    let resumeAfterDateBudget = false;
    let sweepError = null;
    let sweepErrorDetail = null;
    // The Coupang dialog, if any, shown while the sweep stopped at the dashboard.
    let sweepDialog = null;
    let sweepFinished = false;
    // Campaigns still failing when the sweep ends get one more visit in the
    // same attempt. The flag survives the document reloads of that retry.
    let retriedFailedCampaigns = resumeProgress.retriedFailedCampaigns === true;
    const saveSweepProgress = (overrides = {}) => {
      saveProgress({
        synced,
        failed,
        totalRows,
        errors,
        progressTotal,
        progressWorkTotal,
        rawOnlyCampaigns,
        savedRawOnlyKeys: [...savedRawOnlyKeys],
        completedCampaignDateKeys: [...completedCampaignDateKeys],
        retriedFailedCampaigns,
        ...overrides,
      });
    };
    const currentDateWorkUnits = () => campaignDateWorkUnits({
      completedCampaignDateKeys,
      completedCampaignIdentities: seen,
      failedCampaignKeys: unresolvedCampaignWorkKeys(errors),
      rawOnlyCampaignCount: savedRawOnlyKeys.size,
      daysPerCampaign: dailyWindowDays,
    });
    const reportCurrentSweepProgress = async ({
      label,
      terminal = false,
      completed = synced,
      failedCount = failed,
    }) => {
      const observedCurrent = currentDateWorkUnits();
      progressWorkTotal = estimateSweepDateWorkTotal({
        current: observedCurrent,
        campaignTotal: progressTotal,
        previousTotal: progressWorkTotal,
        daysPerCampaign: dailyWindowDays,
      });
      const current = terminal
        ? progressWorkTotal
        : observedCurrent;
      return reportSweepProgress({
        current,
        total: progressWorkTotal,
        completed,
        failed: failedCount,
        label,
      });
    };
    const recordCampaignFailure = async (
      campaign,
      error,
      details = {},
      label = `${campaign?.name || "캠페인"}: ${error}`,
      terminalNavigation = true,
    ) => {
      ({ errors, failed } = reconcileCampaignFailureState(
        errors,
        campaign,
        error,
        details,
      ));
      if (terminalNavigation) {
        persistTerminalLinklessNavigation(campaign, completedNavigationKeys);
      }
      clearPendingCampaignNavigation();
      saveSweepProgress();
      // 광고센터의 dashboard/detail 전환은 full-document navigation일 수 있다.
      // 이 보고가 returnToDashboard보다 늦으면 content-script port가 먼저 닫혀
      // background가 이전 31일 진행률만 보고 같은 위치로 오판한다.
      return reportCurrentSweepProgress({
        failedCount: failed,
        label,
      });
    };

    if (dashboardReturnedCampaign) {
      // href 없는 캠페인을 클릭했지만 새 document가 다시 dashboard라면 provider
      // identity를 얻을 수 없는 terminal navigation이다. pending을 그대로 두면
      // reload마다 같은 row를 다시 클릭하므로 현재 sweep의 skip-set에 남긴다.
      totalDiscovered += 1;
      progressTotal = estimateSweepProgressTotal({
        current: totalDiscovered,
        pageRemainingIncludingCurrent: 1,
        explicitTotal: readDashboardCampaignTotal(),
        previousTotal: progressTotal,
      });
      await recordCampaignFailure(
        dashboardReturnedCampaign,
        "campaign_identity_navigation_returned_to_dashboard",
        {},
        `${dashboardReturnedCampaign.name}: 상세 페이지를 열지 못해 건너뜀`,
      );
      dashboardReturnedCampaign = null;
    }

    let pageGuard = 0;
    while (pageGuard++ < 100) {
      await campaignSourceStep("checkpoint");
      // 현재 페이지 캠페인 중 아직 처리 안 한 것
      // 첫 진입 후 history.back 으로 돌아왔을 때 행은 mount 됐지만 .dashboard-title
      // 이 비어있는 짧은 race 가 있어 retry 로 보강.
      const resumingDetailDocument = detailResumeCampaign !== null;
      let inspection;
      let pag;
      if (resumingDetailDocument) {
        inspection = {
          campaigns: [detailResumeCampaign],
          rawOnlyCampaigns: [],
          titledRowCount: 1,
          missingIdentityNames: [],
        };
        pag = {
          currentPage: detailResumeCampaign.pageNumber || 1,
          totalPages: detailResumeCampaign.pageNumber || 1,
          verified: true,
        };
      } else {
        inspection = inspectCampaignsFromDashboard();
        pag = parsePaginationInfo();
        const hasUnconfirmedRawOnly = inspection.rawOnlyCampaigns.some((campaign) =>
          !confirmedRawOnlyKeys.has(dashboardRawOnlyKey(campaign, pag.currentPage)));
        if (inspection.titledRowCount === 0 || hasUnconfirmedRawOnly) {
          // grid/anchor href가 늦게 채워지는 케이스 — 최대 6초 추가 대기. 제목은
          // 있는데 href가 끝내 없으면 raw-only evidence로 보존한다.
          for (
            let r = 0;
            r < 12;
            r += 1
          ) {
            await sleep(500);
            inspection = inspectCampaignsFromDashboard();
            pag = parsePaginationInfo();
            if (
              inspection.titledRowCount > 0 &&
              inspection.rawOnlyCampaigns.length === 0
            ) break;
          }
        }
        for (const campaign of inspection.campaigns) {
          campaign.pageNumber = Math.max(1, Number(pag.currentPage) || 1);
          campaign.navigationKey = campaignNavigationKey(campaign);
        }
      }
      const identityCoverage = campaignIdentityCoverage(inspection);
      if (!identityCoverage.complete) {
        sweepError = identityCoverage.error;
        break;
      }
      if (!resumingDetailDocument) {
        const pageKey = `dashboard:${pag.currentPage}`;
        await campaignSourceStep("receipt", {
          kind: "dashboard_page", key: pageKey, pageIndex: pag.currentPage, totalPages: pag.totalPages,
          verified: pag.verified === true, explicitEmpty: readReportSurfaceState(parseCampaignTable()).kind === "empty",
          campaigns: [...inspection.campaigns, ...inspection.rawOnlyCampaigns].map(campaign => ({
            key: inspection.rawOnlyCampaigns.includes(campaign) ? dashboardRawOnlyKey(campaign, pag.currentPage) : campaign.navigationKey,
            name: campaign.name, campaignId: campaign.campaignId || null, identity: campaign.identity || null,
            href: campaign.href || null, hasDetailHref: campaign.hasDetailHref ?? null,
            onOff: campaign.onOff || null, status: campaign.status || null, rowIndex: campaign.rowIndex,
          })),
        });
        const frozenPage = activeCampaignControl.pages.find(page => page.key === pageKey);
        inspection = {
          ...inspection,
          campaigns: frozenPage.campaigns.filter(campaign => !campaign.key.startsWith("dashboard-raw\u001f"))
            .map(campaign => ({ ...campaign, navigationKey: campaign.key, pageNumber: frozenPage.pageIndex,
              requiresIdentityProbe: !campaign.identity, href: campaign.href || "" })),
          rawOnlyCampaigns: frozenPage.campaigns.filter(campaign => campaign.key.startsWith("dashboard-raw\u001f"))
            .map(campaign => {
              const observed = inspection.rawOnlyCampaigns.find(row => dashboardRawOnlyKey(row, pag.currentPage) === campaign.key);
              if (!observed && !savedRawOnlyKeys.has(campaign.key)) throw new Error("동결된 캠페인 원본 행을 확인할 수 없습니다.");
              return observed || { ...campaign, cells: campaign.key.split("\u001f").slice(4) };
            }),
        };
        pag = { currentPage: frozenPage.pageIndex, totalPages: frozenPage.totalPages, verified: frozenPage.verified };
      }
      for (const campaign of inspection.rawOnlyCampaigns) {
        confirmedRawOnlyKeys.add(
          dashboardRawOnlyKey(campaign, pag.currentPage),
        );
      }
      const pendingRawOnlyCampaigns = inspection.rawOnlyCampaigns.filter(
        (campaign) =>
          !savedRawOnlyKeys.has(dashboardRawOnlyKey(campaign, pag.currentPage)),
      );
      if (pendingRawOnlyCampaigns.length > 0) {
        for (const campaign of pendingRawOnlyCampaigns) {
        const rawOnlyRows = buildDashboardRawOnlyRows([campaign]);
        await campaignSourceStep("receipt", { kind: "campaign", key: `campaign:${dashboardRawOnlyKey(campaign, pag.currentPage)}`,
          campaignKey: dashboardRawOnlyKey(campaign, pag.currentPage), campaignId: null, mode: "raw_only", payload: {
          type: "ad_campaign",
          source: "advertising",
          campaignName: "_전체",
          campaignReportScope: "multi_campaign_raw",
          data: rawOnlyRows.rawRows,
          normalizedRows: rawOnlyRows.normalizedRows,
          url: window.location.href,
          title: document.title,
          timestamp: new Date().toISOString(),
        } });
          savedRawOnlyKeys.add(
            dashboardRawOnlyKey(campaign, pag.currentPage),
          );
        }
        rawOnlyCampaigns += pendingRawOnlyCampaigns.length;
        saveSweepProgress();
      }
      const allCampsOnPage = inspection.campaigns;
      const pageCamps = resumingDetailDocument
        ? allCampsOnPage
        : filterPendingCampaigns(
            allCampsOnPage,
            seen,
            attemptedThisRun,
            completedNavigationKeys,
          );
      console.log("[KIDITEM sweep]", {
        iter: pageGuard,
        currentPage: pag.currentPage,
        totalPages: pag.totalPages,
        pageCamps: pageCamps.length,
        totalOnPage: allCampsOnPage.length,
        rawOnlyOnPage: inspection.rawOnlyCampaigns.length,
        seen: seen.size,
      });

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
        const nextPageDialogCursor = recordedDialogCursor();
        const moved = await goToNextPage();
        if (!moved) {
          sweepError = "dashboard_page_navigation_failed";
          sweepDialog = recordedDialogSince(nextPageDialogCursor);
          break;
        }
        const dashboardReady = await waitForDashboardGrid(15000);
        const nextPagination = parsePaginationInfo();
        if (!dashboardReady || nextPagination.currentPage <= pag.currentPage) {
          sweepError = dashboardReady
            ? "dashboard_page_number_not_increased"
            : "dashboard_next_page_not_loaded";
          sweepDialog = recordedDialogSince(nextPageDialogCursor);
          break;
        }
        await sleep(800);
        continue;
      }

      // 첫 미처리 캠페인 1개 처리 (한 번에 한 개씩 — anchor 클릭 후 SPA 네비)
      let camp = pageCamps[0];
      attemptedThisRun.add(campaignAttemptKey(camp));

      // 2026-07 광고센터 목록은 캠페인 anchor에 href를 렌더하지 않는다.
      // 먼저 행을 클릭하고 실제 상세 URL에서 provider campaign id를 확정한다.
      // 이름/행 번호는 클릭 대상을 다시 찾기 위한 navigation key일 뿐,
      // 서버에 저장하는 identity로는 절대 사용하지 않는다.
      if (camp.requiresIdentityProbe) {
        showBadge(`🔎 ${camp.name} — 캠페인 식별 중...`, "#6366f1");
      }
      if (!resumingDetailDocument && camp.requiresIdentityProbe) {
        // href 없는 캠페인명 클릭은 새 document를 열 수 있다. 클릭 이후에는
        // 현재 content-script 응답 port가 닫히므로, 어느 dashboard row를
        // 이동 중인지 먼저 session progress에 기록한다. 숫자 진행률이 아직
        // 31/279로 같아도 row별 label이 달라 background가 다음 캠페인 이동을
        // 동일 위치 반복으로 오판하지 않는다.
        await reportCurrentSweepProgress({
          label: campaignIdentityProbeProgressLabel(camp),
        });
      }
      // 대시보드 행 클릭이 새 document를 연 경우에는 sessionStorage의
      // pending row와 현재 상세 URL을 이미 결합했다. 같은 행을 다시 클릭하지
      // 않고 바로 상세 수집을 이어간다.
      const identityProbe = resumingDetailDocument
        ? { ok: true, campaign: camp, navigated: true }
        : await probeCampaignIdentityByNavigation(camp, 20000);
      detailResumeCampaign = null;
      if (!identityProbe.ok) {
        totalDiscovered++;
        const failedIndex = totalDiscovered;
        progressTotal = estimateSweepProgressTotal({
          current: failedIndex,
          pageRemainingIncludingCurrent: pageCamps.length,
          explicitTotal: readDashboardCampaignTotal(),
          previousTotal: progressTotal,
        });
        await recordCampaignFailure(
          camp,
          identityProbe.error,
          dialogFailureDetails(identityProbe.dialog),
          `${camp.name}: 캠페인 식별 실패`,
        );
        await returnToDashboard(20000);
        await sleep(800);
        continue;
      }
      camp = identityProbe.campaign;
      attemptedThisRun.add(camp.identity);
      if (seen.has(camp.identity)) {
        clearPendingCampaignNavigation();
        persistTerminalLinklessNavigation(camp, completedNavigationKeys);
        const returnDialogCursor = recordedDialogCursor();
        const backOk = await returnToDashboard(20000);
        if (!backOk) {
          sweepError = "dashboard_return_after_identity_probe_failed";
          sweepDialog = recordedDialogSince(returnDialogCursor);
          break;
        }
        await sleep(800);
        continue;
      }

      totalDiscovered++;
      const i = totalDiscovered;
      progressTotal = estimateSweepProgressTotal({
        current: i,
        pageRemainingIncludingCurrent: pageCamps.length,
        explicitTotal: readDashboardCampaignTotal(),
        previousTotal: progressTotal,
      });
      saveSweepProgress();
      await reportCurrentSweepProgress({ label: camp.name });

      const usesDetailReport = campaignUsesDetailReport(camp);
      const isMetadataOnlyCampaign = !usesDetailReport;
      // Read compatibility: a previously accepted legacy DOM receipt needs no
      // new product-grain proof.  Any date still being collected, however,
      // must pass the current API contract below before the DOM collector can
      // be considered.
      const pendingBusinessDates = isMetadataOnlyCampaign
        ? [null]
        : filterPendingCampaignBusinessDates(
          camp,
          campaignBusinessDates,
          completedCampaignDateKeys,
        );
      const previouslyCompletedDateCount = isMetadataOnlyCampaign
        ? 0
        : campaignBusinessDates.length - pendingBusinessDates.length;
      if (usesDetailReport) await campaignSourceStep("receipt", {
        kind: "campaign", key: `campaign:${camp.navigationKey}`, campaignKey: camp.navigationKey,
        campaignId: camp.campaignId, mode: "daily",
      });
      showBadge(
        isMetadataOnlyCampaign
          ? `📋 [${i}] ${camp.name} — 상세 없는 상태 저장 중...`
          : `📥 [${i}] ${camp.name} 진입 중... (page ${pag.currentPage}/${pag.totalPages || 1})`,
        "#f59e0b",
      );

      if (usesDetailReport) {
        // 2a) 상세 URL이 확인된 캠페인은 현재 ON/OFF와 무관하게 들어간다.
        // 오늘 OFF여도 최근 31일에 집행 실적이 있을 수 있다.
        const dialogCursor = recordedDialogCursor();
        const clicked = identityProbe.navigated || clickCampaignAnchor(camp);
        if (!clicked) {
          await recordCampaignFailure(
            camp,
            "anchor not found",
          );
          continue;
        }

        // 2b) 상세 identity + rows/명시적 empty-state 렌더 대기
        const detail = await waitForCampaignDetailPage(camp, 20000, dialogCursor);
        if (!detail.ok) {
          await recordCampaignFailure(
            camp,
            detail.error,
            dialogFailureDetails(detail.dialog),
          );
          await returnToDashboard(20000);
          await sleep(800);
          continue;
        }
      }

      // A verified MANUAL_SELECTION group has a stable ad roster and a
      // provider product_sales endpoint. Capture display-only metadata once,
      // then use the API for every exact business date below. Product-detail
      // collection is fail-closed: an absent module, route, group, or
      // selection enum cannot silently fall back to a different DOM period.
      // Previously accepted DOM receipts remain readable through the pending
      // date check above.
      let manualProductContext = null;
      let manualProductCollector = null;
      let manualProductUnavailable = null;
      if (usesDetailReport && pendingBusinessDates.length > 0) {
        const module = globalThis.KidItemAdProductMetrics;
        const route = parseCampaignAdGroupRoute(window.location.href);
        if (!module?.create) {
          manualProductUnavailable = {
            error: "PRODUCT_DETAIL_API_MODULE_UNAVAILABLE",
            details: { campaignId: camp.campaignId, route: window.location.href },
          };
        } else if (!route) {
          manualProductUnavailable = {
            error: "PRODUCT_DETAIL_ROUTE_UNAVAILABLE",
            details: { campaignId: camp.campaignId, route: window.location.href },
          };
        } else if (route.campaignId !== normalizeProviderId(camp.campaignId)) {
          manualProductUnavailable = {
            error: "PRODUCT_DETAIL_ROUTE_IDENTITY_MISMATCH",
            details: { campaignId: camp.campaignId, routeCampaignId: route.campaignId },
          };
        } else {
          const group = await fetchAdGroupAds(route.campaignId, route.adGroupId);
          if (!group.ok) {
            manualProductUnavailable = {
              error: "PRODUCT_DETAIL_GROUP_UNAVAILABLE",
              details: { campaignId: route.campaignId, adGroupId: route.adGroupId, groupError: group.error || null },
            };
          } else if (group.adSelectionType === "AUTO_SELECTION") {
            // AUTO is not a confirmed product-grain empty result. Keep it
            // explicitly unavailable until an equivalent provider proof exists.
            manualProductUnavailable = {
              error: "AUTO_PRODUCT_DETAIL_UNAVAILABLE",
              details: {
                campaignId: route.campaignId,
                adGroupId: route.adGroupId,
                enumeratedAdCount: group.enumeratedAdCount,
              },
            };
          } else if (group.adSelectionType !== "MANUAL_SELECTION") {
            manualProductUnavailable = {
              error: "PRODUCT_DETAIL_SELECTION_UNAVAILABLE",
              details: {
                campaignId: route.campaignId,
                adGroupId: route.adGroupId,
                adSelectionType: group.adSelectionType,
                enumeratedAdCount: group.enumeratedAdCount,
              },
            };
          } else {
            // A detail URL is one group route, not proof that the campaign has
            // only one group. Re-read the complete current campaign roster and
            // accept this migration path only when it proves exactly one
            // matching group and an exact ad count/metadata join.
            const roster = await fetchAdCampaignRoster();
            const rosterCampaign = roster.ok
              ? roster.campaigns.find((entry) => entry.campaignId === camp.campaignId)
              : null;
            const metadata = await captureManualProductMetadata(camp, group);
            const groups = rosterCampaign?.groups || [];
            const totalAdCount = rosterCampaign?.totalAdCount;
            const safeSingleGroup = Boolean(
              roster.ok &&
              rosterCampaign &&
              rosterCampaign.groupsArrayObserved === true &&
              groups.length === 1 &&
              groups[0].adGroupId === route.adGroupId &&
              Number.isInteger(totalAdCount) &&
              totalAdCount === group.enumeratedAdCount &&
              group.invalidAdCount === 0 &&
              group.ads.length === group.enumeratedAdCount &&
              metadata.ok === true &&
              metadata.observedRowCount === group.enumeratedAdCount &&
              metadata.metadataAdCount === group.enumeratedAdCount,
            );
            if (!safeSingleGroup) {
              manualProductUnavailable = {
                error: "MANUAL_PRODUCT_GROUP_ROSTER_UNAVAILABLE",
                details: {
                  rosterComplete: roster.ok === true,
                  expectedGroupIds: groups.map((entry) => entry.adGroupId),
                  routeAdGroupId: route.adGroupId,
                  totalAdCount: totalAdCount ?? null,
                  enumeratedAdCount: group.enumeratedAdCount,
                  metadataAdCount: metadata.metadataAdCount,
                  observedRowCount: metadata.observedRowCount,
                  metadataReason: metadata.reason || null,
                },
              };
            } else {
              manualProductContext = {
                ...metadata,
                campaignId: route.campaignId,
                adGroupId: route.adGroupId,
                adGroupName: group.adGroupName,
                adSelectionType: group.adSelectionType,
                ads: group.ads,
                invalidAdCount: group.invalidAdCount,
                expectedGroupIds: [route.adGroupId],
                totalAdCount,
              };
              manualProductCollector = module.create({
                requestJson: adCenterJson,
              });
            }
          }
        }
      }

      // 상세 리포트 캠페인은 페이지를 한 번만 연 뒤 어제부터 과거 31일까지 하루씩
      // 수집한다. 각 날짜는 exact-day authoritative payload라 서버가 7일/14일/
      // 이번달을 중복 없이 합산할 수 있다. 상세 URL 자체가 없는 캠페인만 roster
      // metadata를 한 번 저장하며 과거 31일의 0원 실적을 발명하지 않는다.
      let campaignRows = 0;
      let campaignFailure = null;

      for (
        let dateIndex = 0;
        dateIndex < pendingBusinessDates.length;
        dateIndex += 1
      ) {
        const businessDate = pendingBusinessDates[dateIndex];
        await campaignSourceStep("checkpoint");
        const dailyOrdinal = previouslyCompletedDateCount + dateIndex + 1;
        let parsed;
        let kpis = {};
        let apiProof = null;

        if (!isMetadataOnlyCampaign) {
          const dailyLabel =
            `${camp.name} · ${businessDate} (${dailyOrdinal}/${campaignBusinessDates.length}일)`;
          showBadge(
            manualProductContext
              ? `📊 [${i}] ${dailyLabel} API 수집 중...`
              : `📅 [${i}] ${dailyLabel} 적용 중...`,
            "#6366f1",
          );
          await reportCurrentSweepProgress({ label: dailyLabel });
          if (manualProductUnavailable) {
            campaignFailure = {
              error: manualProductUnavailable.error,
              details: { businessDate, ...manualProductUnavailable.details },
            };
            break;
          } else if (manualProductContext && manualProductCollector) {
            try {
              if (manualProductContext.invalidAdCount > 0 || manualProductContext.ads.length === 0) {
                throw Object.assign(
                  new Error("manual ad roster contains invalid or missing ad identities"),
                  { code: "AD_PRODUCT_METRICS_INVALID_AD" },
                );
              }
              const collected = await manualProductCollector.collectDay({
                campaignId: manualProductContext.campaignId,
                adGroupId: manualProductContext.adGroupId,
                businessDate,
                metadata: manualProductContext,
              });
              parsed = {
                rawRows: collected.rawRows,
                normalizedRows: collected.rows,
                headers: [],
                pageType: "product",
                expectedPages: 1,
                visitedPages: [1],
                explicitEmpty: false,
                complete: true,
                error: null,
              };
              apiProof = collected.proof;
              kpis = {};
            } catch (error) {
              campaignFailure = {
                error: error?.code || "product_sales_api_failed",
                details: { businessDate, message: error?.message || String(error) },
              };
              break;
            }
          } else {
            const dateOk = await setDateRange(businessDate);
            if (!dateOk) {
              campaignFailure = {
                error: "date_picker_failed",
                details: { businessDate },
              };
              break;
            }

            showBadge(`📊 [${i}] ${dailyLabel} 수집 중...`, "#f59e0b");
            parsed = await parseAcrossProductPages();
            if (!parsed.complete) {
              campaignFailure = {
                error: parsed.error || "campaign_pagination_incomplete",
                details: {
                  businessDate,
                  expectedPages: parsed.expectedPages,
                  visitedPages: parsed.visitedPages,
                },
              };
              break;
            }
            kpis = parseAdKpis();
          }
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
          console.log(
            "[KIDITEM sweep] persist no-detail campaign-only descriptor",
            camp.identity,
          );
        }

        const rowCount = isMetadataOnlyCampaign || parsed.explicitEmpty
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
        const authorityEnvelope = buildCampaignReportAuthorityEnvelope(
          camp,
          businessDate || yesterday,
        );
        console.log("[KIDITEM sweep] parsed campaign day", camp.identity, {
          businessDate,
          rows: parsed.rawRows.length,
          normalizedRows: rowCount,
          expectedPages: parsed.expectedPages,
          visitedPages: parsed.visitedPages,
          metadataOnlyCampaign: isMetadataOnlyCampaign,
        });

        // 명시적인 empty day도 campaign-only descriptor로 보내 서버가 그 날의
        // 0 실적을 authoritative하게 교체한다. 상세 URL이 없는 descriptor만
        // metadata-only scope라 일별 fact로 승격되지 않는다.
        await campaignSourceStep("receipt", {
          kind: isMetadataOnlyCampaign ? "campaign" : "campaign_day",
          key: isMetadataOnlyCampaign ? `campaign:${camp.navigationKey}` : `day:${camp.navigationKey}:${businessDate}`,
          campaignKey: camp.navigationKey,
          ...(isMetadataOnlyCampaign ? { campaignId: camp.campaignId, mode: "metadata" } : {
            businessDate,
            proof: apiProof || { dateApplied: true, complete: parsed.complete, explicitEmpty: parsed.explicitEmpty,
              expectedPages: parsed.expectedPages, visitedPages: parsed.visitedPages },
          }),
          payload: {
          type: "ad_campaign",
          source: "advertising",
          campaignName: camp.name,
          ...authorityEnvelope,
          data: persistedRows.rawRows,
          normalizedRows: persistedRows.normalizedRows,
          ...(!isMetadataOnlyCampaign ? {
            headers: parsed.headers,
            pageType: parsed.pageType,
            kpis,
          } : {}),
          dashboardOnOff: camp.onOff,
          dashboardStatus: camp.status,
          url: window.location.href,
          title: document.title,
          timestamp: new Date().toISOString(),
        } });

        campaignRows += rowCount;
        totalRows += rowCount;
        if (!isMetadataOnlyCampaign) {
          completedCampaignDateKeys.add(
            campaignBusinessDateKey(camp, businessDate),
          );
          dateWorkUnitsThisInvocation += 1;
          showBadge(
            `✓ [${i}] ${camp.name} — ${businessDate} ${rowCount}행 (${dailyOrdinal}/${campaignBusinessDates.length}일)`,
            "#22c55e",
          );
          await reportCurrentSweepProgress({
            label:
              `${camp.name} · ${businessDate} 완료 ` +
              `(${dailyOrdinal}/${campaignBusinessDates.length}일)`,
          });
          if (
            dateWorkUnitsThisInvocation >=
              MAX_DAILY_WORK_UNITS_PER_INVOCATION ||
            Date.now() - invocationStartedAt >= MAX_DAILY_SLICE_WALL_MS
          ) {
            resumeAfterDateBudget = true;
          }
        }
        saveSweepProgress();
        if (resumeAfterDateBudget) break;
      }

      const remainingCampaignDates = isMetadataOnlyCampaign
        ? []
        : filterPendingCampaignBusinessDates(
            camp,
            campaignBusinessDates,
            completedCampaignDateKeys,
          );
      const campaignCollectionComplete =
        !campaignFailure && remainingCampaignDates.length === 0;
      if (campaignCollectionComplete) {
        // 키워드는 추세가 아니라 "지금 이 상품에 무슨 키워드가 붙어 있나"를
        // 보는 현재 상태다. 31일 × 광고수만큼 조회하면 광고센터에 과한 부하가
        // 되므로 최신 완료 영업일 하루만 수집한다. 실패해도 캠페인 일별 수집
        // 결과를 되돌리지 않는다 — 보조 수집이다.
        if (!isMetadataOnlyCampaign) {
          const keywordResult = await collectCampaignKeywords(camp, yesterday)
            .catch((error) => ({
              ok: false,
              reason: error?.message || String(error),
            }));
          if (keywordResult?.ok && keywordResult.groupResult) {
            const advertiserId = observedKeywordAdvertiser(activeCampaignControl);
            await campaignSourceStep("receipt", {
              kind: "auxiliary_keywords", key: `keywords:${camp.navigationKey}:${keywordResult.adGroupId}`,
              campaignKey: camp.navigationKey, adGroupId: keywordResult.adGroupId,
              groupPlan: { ...keywordResult.groupPlan, advertiserId }, groupResult: { ...keywordResult.groupResult, advertiserId },
            }).catch(error => {
              if (error?.code === "SOURCE_OWNER_UNAVAILABLE") throw error;
              console.warn("[KIDITEM sweep] optional keyword receipt", error?.message);
            });
          }
          console.log("[KIDITEM sweep] campaign keywords", camp.identity, keywordResult);
          if (keywordResult?.ok && keywordResult.keywordCount > 0) {
            showBadge(
              `🔑 [${i}] ${camp.name} — 키워드 ${keywordResult.keywordCount}개 수집`,
              "#22c55e",
            );
          }
        }
        clearPendingCampaignNavigation();
        ({ errors, failed } = reconcileCampaignFailureState(errors, camp));
        synced++;
        seen.add(camp.identity);
        saveSeen(seen);
        persistTerminalLinklessNavigation(camp, completedNavigationKeys);
        showBadge(
          isMetadataOnlyCampaign
            ? `✓ [${i}] ${camp.name} — 상세 없는 상태 동기화`
            : `✓ [${i}] ${camp.name} — 31일 ${campaignRows}행 동기화 (총 ${synced} 캠페인)`,
          "#22c55e",
        );
      } else if (campaignFailure) {
        // A day that fails is left for the end-of-sweep retry, which revisits
        // the campaign and resumes from the dates the owner already accepted.
        await recordCampaignFailure(
          camp,
          campaignFailure.error,
          { ...campaignFailure.details, retryable: true },
          `${camp.name}: 일부 날짜를 불러오지 못해 마지막에 다시 수집`,
        );
        showBadge(
          `⚠️ ${camp.name}: 일부 날짜를 불러오지 못해 마지막에 다시 수집합니다`,
          "#f59e0b",
        );
      }
      if (!campaignFailure) {
        saveSweepProgress();
        await reportCurrentSweepProgress({
          label: resumeAfterDateBudget
            ? `${camp.name}: 다음 날짜부터 이어서 수집`
            : camp.name,
        });
      }

      // 2e) 대시보드로 복귀 — 어느 페이지로 떨어지든 OK (seen 셋이 dedupe)
      if (resumeAfterDateBudget) {
        // 정상적인 12일 slice handoff도 detail → dashboard full reload를 만든다.
        // 이 pending은 다음 dashboard에서 실패로 소비하면 안 된다. dashboard가
        // 같은 row를 다시 클릭할 때 새로운 pending을 저장하고 남은 날짜를 잇는다.
        clearPendingCampaignNavigation();
      }
      const backOk = await returnToDashboard(20000);
      if (!backOk) {
        // 수집 창 소유자가 같은 탭을 명시적으로 대시보드로 이동한 뒤 manualSync를
        // 재호출한다. 여기서 location을 바꾸면 응답 전에 content script가 unload되어
        // 세션이 무한 대기 상태가 된다.
        showBadge(`🔁 dashboard 복귀 실패 — 이어서 실행 준비 (${synced}/${totalDiscovered})`, "#f59e0b");
        const resumeProgressSnapshot = await reportCurrentSweepProgress({
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
      if (resumeAfterDateBudget) {
        showBadge(
          `🔁 일별 수집 ${dateWorkUnitsThisInvocation}일 처리 — 이어서 실행`,
          "#6366f1",
        );
        const resumeProgressSnapshot = await reportCurrentSweepProgress({
          label: campaignCollectionComplete
            ? "다음 캠페인의 일별 수집을 이어서 실행"
            : `${camp.name}: 남은 날짜 수집을 이어서 실행`,
        });
        return {
          success: false,
          resumeRequired: true,
          resumeUrl: "https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1",
          error: "광고 일별 수집을 이어서 실행합니다.",
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
      errors.push({
        name: "_dashboard",
        error: sweepError,
        ...(sweepErrorDetail ? { detail: sweepErrorDetail } : {}),
      });
      saveSweepProgress({ failed: failed + 1 });
      const sweepErrorReason = dashboardSweepErrorReason(sweepError, sweepDialog);
      const failedProgressSnapshot = await reportCurrentSweepProgress({
        failedCount: failed + 1,
        label: sweepErrorReason,
      });
      showBadge(`❌ 광고 동기화 중단: ${sweepErrorReason}`, "#ef4444");
      return {
        success: false,
        type: "ad_sync",
        campaigns: synced,
        failed: failed + 1,
        totalRows,
        error: sweepErrorReason,
        errors,
        progress: failedProgressSnapshot,
      };
    }

    if (totalDiscovered === 0 && rawOnlyCampaigns === 0) {
      clearSweepState();
      showBadge("ℹ️ 캠페인 없음 — 동기화 종료", "#94a3b8");
      const emptyProgressSnapshot = await reportCurrentSweepProgress({
        terminal: true,
        completed: 0,
        failedCount: 0,
        label: "동기화할 광고 캠페인 없음",
      });
      return {
        success: true,
        type: "ad_sync",
        campaigns: 0,
        campaignReceipt: { complete: true },
        totalRows: 0,
        progress: emptyProgressSnapshot,
      };
    }

    // sweep 정상 완료 — 이전 실행의 dashboard-level 오류(예:
    // campaign_identity_missing)는 이번 전체 순회가 끝났으면 해결된 상태다.
    // 캠페인별 미해결 오류만 남기고 sessionStorage를 비운다.
    errors = clearResolvedDashboardSweepErrors(errors);
    failed = errors.length;
    if (failed > 0 && !retriedFailedCampaigns) {
      // Coupang pages fail transiently. Visit every campaign still failing
      // once more in this attempt before the attempt fails. The collector
      // reloads this hashless dashboard URL, so the retry starts at page one.
      retriedFailedCampaigns = true;
      for (const entry of errors) {
        if (typeof entry.navigationKey === "string") completedNavigationKeys.delete(entry.navigationKey);
      }
      saveCompletedNavigationKeys(completedNavigationKeys);
      clearPendingCampaignNavigation();
      saveSweepProgress();
      showBadge(`🔁 불러오지 못한 캠페인 ${failed}개를 한 번 더 수집합니다`, "#6366f1");
      const retryProgressSnapshot = await reportCurrentSweepProgress({
        label: `불러오지 못한 캠페인 ${failed}개 다시 수집`,
      });
      return {
        success: false,
        resumeRequired: true,
        resumeUrl: "https://advertising.coupang.com/marketing/dashboard/sales",
        error: "불러오지 못한 광고 캠페인을 한 번 더 수집합니다.",
        synced,
        failed,
        totalRows,
        progress: retryProgressSnapshot,
      };
    }
    clearSweepState();

    const rawOnlySummary = rawOnlyCampaigns > 0
      ? ` + 식별자 없는 ${rawOnlyCampaigns}개 raw 보존`
      : "";
    const summary = `✅ 동기화 완료 — ${synced}/${totalDiscovered} 캠페인${rawOnlySummary} (총 ${totalRows}행)`;
    showBadge(summary, failed > 0 ? "#f59e0b" : "#22c55e");
    const finalProgressSnapshot = await reportCurrentSweepProgress({
      terminal: failed === 0,
      label: dashboardSweepCompletionLabel(failed, rawOnlyCampaigns),
    });

    return {
      success: failed === 0,
      type: "ad_sync",
      campaignReceipt: { complete: failed === 0 },
      campaigns: synced,
      rawOnlyCampaigns,
      failed,
      totalRows,
      ...(failed > 0 ? { error: campaignSweepFailureReason(errors) } : {}),
      errors: errors.length > 0 ? errors : undefined,
      progress: finalProgressSnapshot,
    };
  }

  // doSync / runDashboardSweep 중복 실행 방지 — auto-trigger + manualSync 동시 시 같은 Promise 공유
  let currentSync = null;
  function shouldRunKeywordSweep(syncMode = null) {
    return (
      syncMode === "keyword_sweep" ||
      /#kiditemAdKeyword=1/.test(window.location.hash || "")
    );
  }

  function shouldRunDashboardSweep(syncMode = null) {
    return (
      syncMode === "campaign_sweep" ||
      /#kiditemAdSync=1/.test(window.location.hash || "") ||
      campaignResumedFromDetailHref(window.location.href) !== null
    );
  }

  function shouldRunProfitabilityReport(syncMode = null) {
    return syncMode === "profitability_report";
  }

  function shouldRunManualCampaignReport(syncMode = null) {
    return syncMode === "campaign_manual_report";
  }

  function runSyncOnce(
    syncMode = null,
    environmentId = null,
    profitabilityInput = null,
  ) {
    if (!currentSync) {
      // 대시보드 hash뿐 아니라 href 없는 캠페인 클릭이 연 상세 document의
      // pending handoff도 같은 sweep이다. 후자는 상세 URL에 hash가 없으므로
      // sessionStorage owner를 확인하지 않으면 legacy doSync로 잘못 분기한다.
      // Keyword sweep is checked first: it never navigates, so a stale
      // campaign-detail handoff must not hijack an explicit keyword request.
      const job = shouldRunProfitabilityReport(syncMode)
        ? globalThis.KidItemProfitabilityReport.run({
            profitabilitySlice: profitabilityInput?.profitabilitySlice || null,
            profitabilityAccount: profitabilityInput?.profitabilityAccount || null,
            collectionRunId: activeCollectionRunId,
            environmentId,
          })
        : shouldRunKeywordSweep(syncMode)
        ? runKeywordSweep(profitabilityInput?.keywordControl)
        : shouldRunManualCampaignReport(syncMode)
          ? profitabilityInput?.campaignControl
            ? doSync(profitabilityInput.campaignControl)
            : Promise.resolve({ success: false, error: "campaign_control_missing" })
        : shouldRunDashboardSweep(syncMode)
          ? runDashboardSweep(profitabilityInput?.campaignControl)
          : doSync(profitabilityInput?.campaignControl || null);
      currentSync = job.finally(() => {
        currentSync = null;
      });
    }
    return currentSync;
  }

  // One approved-action execution per tab. A second Run for the same actions
  // joins the execution already in flight; a Run for other actions is refused
  // until it ends, so a list is never silently dropped. Another tab is refused
  // by the server at its running report.
  const ACTION_EXECUTION_BUSY_MESSAGE =
    "이미 다른 승인 액션 실행이 진행 중입니다. 끝난 뒤 다시 실행해 주세요.";
  let currentActionExecution = null;
  let currentActionExecutionKey = null;
  function runActionExecutionOnce(key, execute) {
    if (currentActionExecution) {
      return key === currentActionExecutionKey
        ? currentActionExecution
        : Promise.resolve({ success: false, error: ACTION_EXECUTION_BUSY_MESSAGE });
    }
    currentActionExecutionKey = key;
    currentActionExecution = Promise.resolve()
      .then(execute)
      .finally(() => {
        currentActionExecution = null;
        currentActionExecutionKey = null;
      });
    return currentActionExecution;
  }

  function runApprovedActionsOnce() {
    return runActionExecutionOnce("queued", () =>
      fetchApprovedQueuedActions(20).then((actions) => {
        if (actions.length === 0) {
          showBadge("ℹ️ 실행할 승인 액션이 없습니다.", "#94a3b8");
          return { success: true, executed: 0, skipped: 0 };
        }
        return executeApprovedActions(actions);
      }),
    );
  }

  // Pure parser contract used by fixture tests. Content scripts run in an isolated
  // world, so this does not expose data to the marketplace page itself.
  globalThis.KidItemAdsReportContract = Object.freeze({
    adKeywordControlLabel,
    attachCampaignIdentityToRows,
    buildCoupangAdsDailyRow,
    buildCampaignRow,
    buildCampaignOnlyRows,
    captureManualProductMetadata,
    collectCampaignKeywords,
    fetchAdCampaignRoster,
    fetchAdGroupAds,
    fetchAdKeywordMetrics,
    fetchRegisteredAdKeywords,
    adKeywordWindow,
    kstDayEpochMs,
    parseCampaignAdGroupRoute,
    runKeywordSweep,
    shouldRunKeywordSweep,
    buildCampaignReportAuthorityEnvelope,
    buildDashboardRawOnlyRows,
    buildRollingCampaignBusinessDates,
    campaignDateWorkUnits,
    campaignAttemptKey,
    campaignBusinessDateKey,
    campaignDailyCoverage,
    campaignDetailReady,
    campaignIdFromHref,
    campaignIdentityCoverage,
    campaignIdentityFromHref,
    campaignIdentityProbeProgressLabel,
    campaignNavigationHandoff,
    campaignResumedFromDetailHref,
    campaignWithIdentityFromHref,
    campaignUsesDetailReport,
    clearResolvedDashboardSweepErrors,
    clearPendingCampaignNavigation,
    clickCampaignAnchor,
    classifyReportSurfaceEvidence,
    collectPaginatedReport,
    displayedRangeMatchesTarget,
    dashboardReturnHref,
    dashboardRawOnlyKey,
    dashboardSweepCompletionLabel,
    dailyReportSelectionSettled,
    displayedTargetDateSettled,
    estimateSweepProgressTotal,
    estimateSweepDateWorkTotal,
    evaluateExplicitEmptyDailyKpis,
    findDashboardReturnControl,
    findVisibleDateRangePopup,
    findConversionCountHeaderIndex,
    findHeaderIndex,
    filterPendingCampaignBusinessDates,
    filterPendingCampaigns,
    isElementVisible,
    isExplicitEmptyStateText,
    inspectCampaignsFromDashboard,
    isAdvertisingLoginPage,
    advertisingLoginFieldsPrefilled,
    advertisingLoginHandoffResponse,
    attemptAdvertisingLoginAutoSubmit,
    findAdvertisingLoginControls,
    findAdvertisingAccountLoginButton,
    isDashboardListPage,
    kpiRawValue,
    loadProgress,
    loadPendingCampaignNavigation,
    getYesterdayYmd,
    manualSyncAdmission,
    normalizeSweepErrors,
    normalizeSweepProgress,
    openDateRangePopup,
    parseNumber,
    persistTerminalLinklessNavigation,
    pollUntil,
    probeCampaignIdentityByNavigation,
    prepareSweepRun,
    normalizeProfitabilitySlice,
    readSettledReportPage,
    readReportSurfaceState,
    reconcileCampaignFailureState,
    resetReportPaginationToFirstPage,
    returnToDashboard,
    savePendingCampaignNavigation,
    selectReportDateRange,
    sleep,
    shouldRunDashboardSweep,
    shouldRunProfitabilityReport,
    unresolvedCampaignWorkKeys,
    campaignSweepFailureReason,
    dashboardSweepErrorReason,
    withCollectionRunId,
  });

  // URL flag 기반 자동 모드.
  // targetDate와 dashboard hash는 collection-window의 owner manualSync가 처리한다.
  // content script가 source owner 없이 광고 데이터를 자동 수집하지 않도록 하고,
  // 승인된 광고 액션 실행만 명시적인 플래그에서 자동 시작한다.
  // - kiditemExecuteActions=1: 승인된 광고 액션 자동 실행
  const hrefForMode = `${window.location.search || ""}${window.location.hash || ""}`;
  const isActionMode = /kiditemExecuteActions=1/.test(hrefForMode) ||
    sessionStorage.getItem("kiditemExecuteActions") === "1";
  if (isActionMode) {
    sessionStorage.setItem("kiditemExecuteActions", "1");
  }

  // 수집 탭이 광고센터 로그인 화면에 떨어지면, 브라우저 자동완성이 자격증명을
  // 채울 시간을 잠깐 준 뒤 로그인 버튼을 눌러 자동 통과한다(최대 ~5초 폴링).
  // 채워지지 않으면 누르지 않는다 — 확장은 자격증명을 입력·저장하지 않는다.
  if (isAdvertisingLoginPage()) {
    let loginAutoSubmitAttempts = 0;
    const loginAutoSubmitTimer = setInterval(() => {
      loginAutoSubmitAttempts += 1;
      if (attemptAdvertisingLoginAutoSubmit() || loginAutoSubmitAttempts >= 12) {
        clearInterval(loginAutoSubmitTimer);
      }
    }, 400);
  }

  if (isActionMode) {
    setTimeout(() => {
      runApprovedActionsOnce().then(() => {
        sessionStorage.removeItem("kiditemExecuteActions");
      });
    }, 3000);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "manualSync") {
      const admission = manualSyncAdmission({
        syncRunning: currentSync !== null,
        activeRunId: activeCollectionRunId,
        activeAttempt: activeCollectionAttempt,
        requestedRunId: msg.collectionRunId,
        requestedAttempt: msg.collectionAttempt,
      });
      if (!admission.accepted) {
        // prepareSweepRun clears sessionStorage and changes the globals used by
        // the active collection. Never call it for a new run/attempt while the
        // previous Promise still owns this content script; otherwise old
        // payloads and its terminal marker can be re-stamped as the new run.
        sendResponse({
          success: false,
          retryable: true,
          error: admission.error,
        });
        return false;
      }
      if (admission.shareCurrent) {
        runSyncOnce(msg.syncMode, msg.environmentId, {
          profitabilitySlice: msg.profitabilitySlice,
          profitabilityAccount: msg.profitabilityAccount,
          keywordControl: msg.keywordControl,
          campaignControl: msg.campaignControl,
        })
          .then((result) => sendResponse(result))
          .catch((error) =>
            sendResponse({ success: false, error: error?.message || String(error), errorCode: error?.code }),
          );
        return true;
      }

      const preparedRun = prepareSweepRun(
        admission.runId,
        admission.attempt,
      );
      if (
        msg.syncMode === "profitability_report" &&
        !normalizeProfitabilitySlice(msg.profitabilitySlice)
      ) {
        sendResponse({
          success: false,
          error: "profitability_ad_slice_invalid",
        });
        return false;
      }
      const executionChanged =
        preparedRun.runId !== activeCollectionRunId ||
        preparedRun.attempt !== activeCollectionAttempt ||
        preparedRun.fresh;
      // An idle run without a collectionRunId is a new popup/manual execution.
      // Explicitly clear prior active ids so its payloads cannot inherit the
      // previous browser-collection owner.
      activeCollectionRunId = preparedRun.runId;
      activeCollectionAttempt = preparedRun.attempt;
      if (executionChanged) {
        lastReportedSweepProgress = { current: 0, total: 0 };
      }
      runSyncOnce(msg.syncMode, msg.environmentId, {
        profitabilitySlice: msg.profitabilitySlice,
        profitabilityAccount: msg.profitabilityAccount,
        keywordControl: msg.keywordControl,
        campaignControl: msg.campaignControl,
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({ success: false, error: error?.message || String(error), errorCode: error?.code }),
        );
      return true;
    }

    if (msg.action === "executeApprovedAdActions") {
      const payload = msg.payload || {};
      const actions = payload.actions || [];
      const key = `actions:${Array.isArray(actions) ? actions.map((action) => action?.id).join(",") : ""}`;
      runActionExecutionOnce(key, () => executeApprovedActions(actions))
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
