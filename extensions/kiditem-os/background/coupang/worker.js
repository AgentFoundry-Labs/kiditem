// KIDITEM OS — 쿠팡 Wing/광고센터 도메인 워커
//
// 통합 서비스워커(`background/service-worker.js`)가 의존 모듈을 먼저 싣고
// 이 파일을 importScripts 로 불러온다. 세 도메인 워커가 `adsEnvironmentContext`,
// `collectionSessions` 같은 최상위 const 이름을 공유하므로 전체를 IIFE 로 감싸
// 각 도메인의 최상위 선언을 그 도메인 안에 가둔다. 본문 들여쓰기는 병합 diff 를
// 읽을 수 있게 유지하기 위해 원본 그대로 둔다.

chrome.runtime.onMessage.addListener(KidItemAdCollectorDelay.handleMessage);

const COUPANG_CATALOG_CONTRACT_REVISION = 3;
if (
  KidItemCoupangCatalog.contractRevision !==
  COUPANG_CATALOG_CONTRACT_REVISION
) {
  throw new Error("쿠팡 카탈로그 수집기 계약 revision이 일치하지 않습니다");
}

// KidItem 웹앱이 열리는 커밋된 origin. externally_connectable / 대시보드 탭 조회 /
// 세션·auth 핸드셰이크가 모두 이 목록을 공유한다. (product-scraper 패턴)
const AD_ACTION_URL =
  "https://advertising.coupang.com/dashboard?kiditemExecuteActions=1#kiditemExecuteActions=1";
const WING_CATALOG_FORM_URL =
  "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";
const COUPANG_SEARCH_URL = "https://www.coupang.com/np/search";
const WING_CATALOG_MAX_PAGES = 5;
const BATCH_SCRAPE_STATUS_KEY = "kiditem_batch_scrape";
const BATCH_SCRAPE_CANCEL_KEY = "kiditem_batch_scrape_cancel";
const COLLECTION_WINDOW_STORAGE_KEY = "kiditem_coupang_collection_window";
const CATALOG_COLLECTION_WINDOW_STORAGE_KEY =
  "kiditem_coupang_catalog_collection_window";
const WING_TRAFFIC_PRODUCER = "dashboard.wing_sales";
const WING_ITEMWINNER_PRODUCER = "dashboard.wing_kpi";
const WING_TRAFFIC_URL = "https://wing.coupang.com/tenants/business-insight/sales-analysis";
const WING_ITEMWINNER_URL = "https://wing.coupang.com/tenants/seller-price-management";
const WING_ITEMWINNER_PATH = "/tenants/seller-price-management";
const OWNER_ATTEMPT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_DATE = /^\d{4}-\d{2}-\d{2}$/;
const POPUP_OWNER_CORRELATION_PREFIX = "kiditem_popup_source_owner_v1";
const popupOwnerCorrelationWire = KidItemSourcingAttemptWire.create({
  chrome,
  sourcePath: "/api",
  requestFailureMessage: "Popup source owner request failed",
});

const adsEnvironmentContext = KidItemEnvironmentContext.create({
  chrome,
  fetchFn: fetch,
  legacyStorageKeys: ["kiditem_auth_token", "apiBase"],
});
const coupangEnvironment = KidItemCoupangEnvironmentRuntime.create({
  chrome,
  environmentContext: adsEnvironmentContext,
});
const authedFetch = (environmentId, path, init) =>
  adsEnvironmentContext.authedFetch(environmentId, path, init);
const getAuthToken = (environmentId) =>
  adsEnvironmentContext.getAccessToken(environmentId);
const collectionWindows = Object.fromEntries(
  adsEnvironmentContext.environmentIds.map((environmentId) => [
    environmentId,
    KidItemCollectionWindow.create({
      chrome,
      storageKey: coupangEnvironment.stateKey(COLLECTION_WINDOW_STORAGE_KEY, environmentId),
      sessions: collectionSessions,
      bindTab: (tabId) => coupangEnvironment.bindTab(tabId, environmentId),
    }),
  ]),
);
const catalogCollectionWindows = Object.fromEntries(
  adsEnvironmentContext.environmentIds.map((environmentId) => [
    environmentId,
    KidItemCollectionWindow.create({
      chrome,
      storageKey: coupangEnvironment.stateKey(
        CATALOG_COLLECTION_WINDOW_STORAGE_KEY,
        environmentId,
      ),
    }),
  ]),
);
function collectionWindowFor(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return collectionWindows[environmentId];
}
function catalogCollectionWindowFor(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return catalogCollectionWindows[environmentId];
}

const adCenterCollectors = Object.fromEntries(
  adsEnvironmentContext.environmentIds.map((environmentId) => [
    environmentId,
    KidItemAdCenterCollector.create({
      window: collectionWindows[environmentId], chrome, sessions: collectionSessions,
      statusKey: coupangEnvironment.stateKey(BATCH_SCRAPE_STATUS_KEY, environmentId),
      cancelKey: coupangEnvironment.stateKey(BATCH_SCRAPE_CANCEL_KEY, environmentId),
      bindTab: (tabId) => coupangEnvironment.bindTab(tabId, environmentId),
      notify: () => notifyDashboard(environmentId),
    }),
  ]),
);
const wingReportCollectors = Object.fromEntries(
  adsEnvironmentContext.environmentIds.map((environmentId) => [
    environmentId,
    KidItemWingReportCollector.create({
      window: collectionWindows[environmentId], chrome, sessions: collectionSessions,
      statusKey: coupangEnvironment.stateKey(BATCH_SCRAPE_STATUS_KEY, environmentId),
      cancelKey: coupangEnvironment.stateKey(BATCH_SCRAPE_CANCEL_KEY, environmentId),
      bindTab: (tabId) => coupangEnvironment.bindTab(tabId, environmentId),
      notify: () => notifyDashboard(environmentId),
    }),
  ]),
);
function adCenterCollectorFor(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return adCenterCollectors[environmentId];
}
function wingReportCollectorFor(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return wingReportCollectors[environmentId];
}

function displayedWingTrafficRange(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("Wing 매출분석 URL이 없습니다.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Wing 매출분석 URL이 유효하지 않습니다.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "wing.coupang.com" ||
    !/business-insight\/sales-analysis/i.test(url.pathname)
  ) {
    throw new Error("Wing 매출분석 페이지가 아닙니다.");
  }
  const startDate = url.searchParams.get("start_date") || url.searchParams.get("startDate");
  const endDate = url.searchParams.get("end_date") || url.searchParams.get("endDate");
  if (!OWNER_DATE.test(startDate || "") || !OWNER_DATE.test(endDate || "")) {
    throw new Error("Wing 매출분석 displayed 날짜 범위가 없습니다.");
  }
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const periodDays = Math.round((end - start) / 86400000) + 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || periodDays < 1 || periodDays > 366) {
    throw new Error("Wing 매출분석 displayed 날짜 범위가 owner 허용 범위를 벗어났습니다.");
  }
  return { url: value, startDate, endDate, periodDays };
}

function displayedWingItemwinnerPage(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("Wing 아이템위너 URL이 없습니다.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Wing 아이템위너 URL이 유효하지 않습니다.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "wing.coupang.com" ||
    url.pathname !== WING_ITEMWINNER_PATH
  ) {
    throw new Error("Wing 아이템위너 페이지가 아닙니다.");
  }
  return value;
}

function displayedAdvertisingDashboard(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("광고센터 URL이 없습니다.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("광고센터 URL이 유효하지 않습니다.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "advertising.coupang.com" ||
    !/\/marketing\/dashboard\/sales/i.test(url.pathname)
  ) {
    throw new Error("광고 캠페인 대시보드 페이지가 아닙니다.");
  }
  return value;
}

function advertisingManualReportScope(value) {
  const targetUrl = displayedAdvertisingDashboard(value);
  const url = new URL(targetUrl);
  const targetDate = /(?:^|[#&])targetDate=(\d{4}-\d{2}-\d{2})(?:&|$)/i.exec(url.hash || "")?.[1] || null;
  if (targetDate) {
    return {
      captureMode: "manual_report",
      period: "1d",
      startDate: targetDate,
      endDate: targetDate,
      targetUrl,
    };
  }
  const yesterday = new Date();
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const endDate = formatOwnerDate(yesterday);
  const start = new Date(yesterday);
  start.setDate(start.getDate() - 6);
  const startDate = formatOwnerDate(start);
  const requestedStart = url.searchParams.get("startDate") || url.searchParams.get("start_date");
  const requestedEnd = url.searchParams.get("endDate") || url.searchParams.get("end_date");
  if (OWNER_DATE.test(requestedStart || "") && OWNER_DATE.test(requestedEnd || "") &&
    ownerDateSpan(requestedStart, requestedEnd) === 7) {
    return { captureMode: "manual_report", period: "7d", startDate: requestedStart, endDate: requestedEnd, targetUrl };
  }
  return { captureMode: "manual_report", period: "7d", startDate, endDate, targetUrl };
}

function formatOwnerDate(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function ownerDateSpan(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.round((end - start) / 86_400_000) + 1
    : 0;
}

async function ownerJson(environmentId, path, init) {
  const response = await authedFetch(environmentId, path, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Source owner 요청 실패 (${response.status})`);
  }
  return body;
}

async function exportWingInventoryWorkbook(products, sender) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Wing 상품 행이 없습니다.");
  }
  const environmentId = await coupangEnvironment.environmentForTab(sender?.tab?.id);
  if (!environmentId) {
    throw new Error("현재 Wing 탭이 KidItem 환경에 연결되지 않았습니다.");
  }
  const response = await authedFetch(environmentId, "/api/channels/coupang-wing/inventory-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products, fileName: legacyWingInventoryFileName() }),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    let message = `Wing 상품목록 엑셀 변환 실패 (HTTP ${response.status})`;
    try {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      message = body?.message || body?.error || message;
    } catch {
      // Preserve the HTTP failure when the server did not return JSON.
    }
    throw new Error(message);
  }
  return {
    success: true,
    fileBase64: bytesToBase64(bytes),
    fileName: parseContentDispositionFilename(response.headers.get("content-disposition")) || "wing-inventory.xls",
    contentType: response.headers.get("content-type") || "application/vnd.ms-excel;charset=utf-8",
    total: products.length,
  };
}

function legacyWingInventoryFileName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `wing-inventory_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}.${pad(now.getMinutes())}.xls`;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function parseContentDispositionFilename(header) {
  if (typeof header !== "string") return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] || null;
}

async function beginSourceOwnerAttempt(environmentId, sourcePath, request = {}, scope = null) {
  const correlationKey = `${POPUP_OWNER_CORRELATION_PREFIX}:${environmentId}:${encodeURIComponent(sourcePath)}`;
  const fingerprint = JSON.stringify({ request, scope });
  const stored = await popupOwnerCorrelationWire.getCorrelation(correlationKey);
  let correlation = stored && stored.fingerprint === fingerprint &&
    typeof stored.idempotencyKey === "string" && stored.idempotencyKey.trim() &&
    (stored.attemptId === null || OWNER_ATTEMPT_UUID.test(stored.attemptId))
    ? stored
    : null;
  const status = await ownerJson(environmentId, `${sourcePath}/source`);
  let attempt = status?.latestAttempt;
  if (attempt?.state === "RUNNING") {
    if (scope && (
      (scope.startDate && attempt.plan?.startDate !== scope.startDate) ||
      (scope.endDate && attempt.plan?.endDate !== scope.endDate) ||
      (scope.url && attempt.plan?.targetUrl && attempt.plan.targetUrl !== scope.url) ||
      (scope.targetUrl && attempt.plan?.targetUrl !== scope.targetUrl) ||
      (scope.captureMode && attempt.plan?.captureMode !== scope.captureMode) ||
      (scope.period && attempt.plan?.period !== scope.period) ||
      (scope.targetDate && attempt.plan?.coverageRangeStartDate !== scope.targetDate)
    )) {
      throw new Error("다른 displayed 범위의 source owner 수집이 진행 중입니다.");
    }
    if (!correlation) {
      throw new Error("다른 source owner 수집이 진행 중입니다.");
    }
    if (correlation.attemptId === attempt.attemptId) return attempt;
    if (correlation.attemptId !== null) {
      throw new Error("다른 source owner 수집이 진행 중입니다.");
    }
  } else if (stored) {
    await popupOwnerCorrelationWire.clearCorrelation(correlationKey);
    correlation = null;
  }
  const idempotencyKey = correlation?.idempotencyKey || crypto.randomUUID();
  await popupOwnerCorrelationWire.setCorrelation(correlationKey, {
    fingerprint,
    idempotencyKey,
    attemptId: null,
  });
  attempt = await ownerJson(environmentId, `${sourcePath}/attempts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(request),
  });
  if (!OWNER_ATTEMPT_UUID.test(attempt?.attemptId || "")) {
    throw new Error("Source owner attempt 응답이 유효하지 않습니다.");
  }
  await popupOwnerCorrelationWire.setCorrelation(correlationKey, {
    fingerprint,
    idempotencyKey,
    attemptId: attempt.attemptId,
  });
  return attempt;
}

function parsePopupOwnerRequest(message, action, requiresUrl = true) {
  const allowed = requiresUrl
    ? ["action", "environmentId", "url"]
    : ["action", "environmentId"];
  if (
    !message ||
    message.action !== action ||
    Object.keys(message).some((key) => !allowed.includes(key)) ||
    typeof message.environmentId !== "string" ||
    (requiresUrl && typeof message.url !== "string")
  ) {
    throw new Error("Invalid popup source owner request");
  }
  adsEnvironmentContext.requireEnvironment(message.environmentId);
  return message;
}

const WING_TRAFFIC_DAILY_PARSER_VERSION = "wing-traffic-daily-v2";
const MONTHLY_YEAR_MIN = 2000;
const MONTHLY_YEAR_MAX = 2100;

function parseMonthlyScrapeRequest(message) {
  if (
    !message ||
    typeof message !== "object" ||
    Array.isArray(message) ||
    Object.keys(message).length !== 4 ||
    Object.keys(message).some((key) =>
      !["action", "year", "month", "environmentId"].includes(key),
    ) ||
    message.action !== "monthlyScrape" ||
    !Number.isInteger(message.year) ||
    message.year < MONTHLY_YEAR_MIN ||
    message.year > MONTHLY_YEAR_MAX ||
    String(message.year).length !== 4 ||
    !Number.isInteger(message.month) ||
    message.month < 1 ||
    message.month > 12 ||
    (message.environmentId !== "local" && message.environmentId !== "office")
  ) {
    throw new Error("Invalid monthly Wing traffic request");
  }
  return {
    action: message.action,
    year: message.year,
    month: message.month,
    environmentId: message.environmentId,
  };
}

function kstCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

function monthlyWingTrafficRange(year, month, now = new Date()) {
  const current = kstCalendarDate(now);
  const requestedKey = year * 100 + month;
  const currentKey = current.year * 100 + current.month;
  if (requestedKey > currentKey) {
    throw new Error("아직 종료된 날짜가 없는 미래 월은 수집할 수 없습니다.");
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const kstToday = new Date(Date.UTC(current.year, current.month - 1, current.day));
  const kstYesterday = new Date(kstToday.getTime() - 86_400_000);
  const yesterdayDate = kstYesterday.toISOString().slice(0, 10);
  const endDate = monthEnd < yesterdayDate ? monthEnd : yesterdayDate;
  if (endDate < startDate) {
    throw new Error("선택한 월에 종료된 수집일이 없습니다.");
  }

  return {
    startDate,
    endDate,
    url: `${WING_TRAFFIC_URL}?start_date=${startDate}&end_date=${endDate}`,
    periodDays: ownerDateSpan(startDate, endDate),
  };
}

function monthlyWingTrafficAdmission(attempt, range) {
  const terminalState = attempt?.state;
  if (!["RUNNING", "COMPLETE", "FAILED"].includes(terminalState)) {
    throw new Error("Source owner attempt 응답 상태가 유효하지 않습니다.");
  }
  if (attempt?.plan && attempt.plan.parserVersion !== WING_TRAFFIC_DAILY_PARSER_VERSION) {
    throw new Error("Wing 월별 수집은 daily-v2 source owner만 사용할 수 있습니다.");
  }
  return {
    success: true,
    attemptId: attempt.attemptId,
    terminalState,
    startDate: range.startDate,
    endDate: range.endDate,
  };
}

const collectionRuns = KidItemCollectionRuns.create({
  chrome,
  sessions: collectionSessions,
  collectionWindowFor,
});
// Wing search is a source-capture module. The worker supplies only concrete
// browser/session/attention adapters; request, retry, cursor, normalization,
// and proof policy stay behind its collect interface.
const wingSearchCollector = KidItemWingSearchCollector.create({
  chrome,
  sessions: collectionSessions,
  environment: {
    bindTab: (tabId, environmentId) =>
      coupangEnvironment.bindTab(tabId, environmentId),
  },
  waitForTabComplete,
  attention: (runId, tabId, reason, message) =>
    collectionRuns.requireAttention(runId, tabId, reason, message),
});
const coupangKeywordSuggestionCollector = KidItemCoupangKeywordSuggestionCollector.create({
  chrome,
  sessions: collectionSessions,
  createTab,
  bindTab: (tabId, environmentId) =>
    coupangEnvironment.bindTab(tabId, environmentId),
  waitForTabComplete,
  attention: (runId, tabId, reason, message) =>
    collectionRuns.requireAttention(runId, tabId, reason, message),
});
const keywordSuggestionSourceOwner = KidItemKeywordSuggestionSourceOwner.create({
  chrome,
  sessions: collectionSessions,
  requireEnvironment: (environmentId) =>
    sharedEnvironmentContext.requireEnvironment(environmentId),
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  collect: (input) => coupangKeywordSuggestionCollector.collect(input),
});
const profitabilitySourceOwner = KidItemProfitabilitySourceOwner.create({
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  collectSlice: collectAdvertisingProfitabilitySlice,
  closeAttempt: (environmentId, attemptId) =>
    collectionWindowFor(environmentId).close(attemptId),
});
const adKeywordSourceOwner = KidItemAdKeywordSourceOwner.create({
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  environmentForTab: (tabId) => coupangEnvironment.environmentForTab(tabId),
  ownedTab: async (environmentId, attemptId) => (await collectionWindowFor(environmentId).reattach(attemptId))?.tabId,
  collect: ({ environmentId, attemptId, control }) =>
    adCenterCollectorFor(environmentId).collectKeywords({ environmentId, attemptId, control }),
  closeAttempt: (environmentId, attemptId) => collectionWindowFor(environmentId).close(attemptId),
});
chrome.runtime.onMessage.addListener(adKeywordSourceOwner.handleMessage);
const adCampaignSourceOwner = KidItemAdCampaignSourceOwner.create({
  chrome, sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  environmentForTab: tabId => coupangEnvironment.environmentForTab(tabId),
  ownedTab: async (environmentId, attemptId) => (await collectionWindowFor(environmentId).reattach(attemptId))?.tabId,
  collect: ({ environmentId, attemptId, control }) =>
    adCenterCollectorFor(environmentId).collectCampaigns({ environmentId, attemptId, control }),
  closeAttempt: (environmentId, attemptId) => collectionWindowFor(environmentId).close(attemptId),
});
chrome.runtime.onMessage.addListener(adCampaignSourceOwner.handleMessage);
const adAccountDailyKpiSourceOwner = KidItemAdAccountDailyKpiSourceOwner.create({
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  environmentForTab: tabId => coupangEnvironment.environmentForTab(tabId),
  ownedTab: async (environmentId, attemptId) => (await collectionWindowFor(environmentId).reattach(attemptId))?.tabId,
  collect: ({ environmentId, attemptId, control }) =>
    adCenterCollectorFor(environmentId).collectAccountDailyKpis({ environmentId, attemptId, control }),
  closeAttempt: (environmentId, attemptId) => collectionWindowFor(environmentId).close(attemptId),
});
chrome.runtime.onMessage.addListener(adAccountDailyKpiSourceOwner.handleMessage);
const wingTrafficSourceOwner = KidItemWingTrafficSourceOwner.create({
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  environmentForTab: tabId => coupangEnvironment.environmentForTab(tabId),
  ownedTab: async (environmentId, attemptId) => (await collectionWindowFor(environmentId).reattach(attemptId))?.tabId,
  collect: ({ environmentId, attemptId, control }) =>
    wingReportCollectorFor(environmentId).collectTraffic({ environmentId, attemptId, control }),
  closeAttempt: (environmentId, attemptId) => collectionWindowFor(environmentId).close(attemptId),
});
chrome.runtime.onMessage.addListener(wingTrafficSourceOwner.handleMessage);
const wingTrafficSourceOwnerV2 = KidItemWingTrafficSourceOwnerV2.create({
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  environmentForTab: tabId => coupangEnvironment.environmentForTab(tabId),
  ownedTab: async (environmentId, attemptId) => (await collectionWindowFor(environmentId).reattach(attemptId))?.tabId,
  collect: ({ environmentId, attemptId, control }) =>
    wingReportCollectorFor(environmentId).collectTraffic({ environmentId, attemptId, control }),
  closeAttempt: (environmentId, attemptId) => collectionWindowFor(environmentId).close(attemptId),
});
chrome.runtime.onMessage.addListener(wingTrafficSourceOwnerV2.handleMessage);

function runWingTrafficSourceOwnerV2(args) {
  return wingTrafficSourceOwnerV2.run(args);
}

function runWingTrafficSourceOwner(args) {
  return runWingTrafficSourceOwnerV2(args).catch((error) => {
    if (error?.code === "WING_TRAFFIC_LEGACY_PLAN") return wingTrafficSourceOwner.run(args);
    throw error;
  });
}

async function cancelWingTrafficSourceOwner(args) {
  await wingReportCollectorFor(args.environmentId).cancelRun({ attemptId: args.attemptId });
  return wingTrafficSourceOwnerV2.cancel(args).catch((error) => {
    if (error?.code === "WING_TRAFFIC_LEGACY_PLAN") return wingTrafficSourceOwner.cancel(args);
    throw error;
  });
}

const wingItemwinnerSourceOwner = KidItemWingItemwinnerSourceOwner.create({
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  environmentForTab: tabId => coupangEnvironment.environmentForTab(tabId),
  ownedTab: async (environmentId, attemptId) => (await collectionWindowFor(environmentId).reattach(attemptId))?.tabId,
  collect: ({ environmentId, attemptId, control }) =>
    wingReportCollectorFor(environmentId).collectItemwinner({ environmentId, attemptId, control }),
  closeAttempt: (environmentId, attemptId) => collectionWindowFor(environmentId).close(attemptId),
});
chrome.runtime.onMessage.addListener(wingItemwinnerSourceOwner.handleMessage);
const coupangSerpCollector = KidItemCoupangSerpCollector.create({
  chrome,
  sessions: collectionSessions,
  environment: coupangEnvironment,
  waitForTabComplete,
  delay: sleep,
});
const coupangSellerIdentityCollector = KidItemCoupangSellerIdentityCollector.create({
  chrome,
  sessions: collectionSessions,
  environment: coupangEnvironment,
  waitForTabComplete,
  delay: sleep,
});
const coupangSellerCatalogCollector = KidItemCoupangSellerCatalogCollector.create({
  chrome,
  sessions: collectionSessions,
  environment: coupangEnvironment,
  waitForTabComplete,
  delay: sleep,
});
const trackedWingProductsSourceOwner = KidItemTrackedWingProductsSourceOwner.create({
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  collectKeyword: collectAdvertisingTrackedWingProductsKeyword,
  closeAttempt: async (_environmentId, attemptId, tabId) => {
    if (!Number.isInteger(tabId)) return;
    await collectionSessions.detachTab(attemptId, {
      tabId,
      closeManagedTab: true,
    });
  },
});
const competitorCatalogSourceOwner = KidItemCompetitorCatalogSourceOwner.create({
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  collectTarget: collectAdvertisingCompetitorCatalogTarget,
  closeAttempt: async (_environmentId, attemptId, tabId) => {
    if (!Number.isInteger(tabId)) return;
    await collectionSessions.detachTab(attemptId, {
      tabId,
      closeManagedTab: true,
    });
  },
});
const wingFormRuntimeCompat = KidItemWingFormRuntimeCompat.create({ chrome });
const keywordSerpSourceOwner = KidItemKeywordRankSourceOwner.create({
  kind: "serp",
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  collect: captureCoupangKeywordSerp,
});
const wingRankSourceOwner = KidItemKeywordRankSourceOwner.create({
  kind: "wing",
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  collect: captureWingRank,
});
const sellerIdentitySourceOwner = KidItemKeywordRankSourceOwner.create({
  kind: "identity",
  chrome,
  sessions: collectionSessions,
  request: (environmentId, path, init) => authedFetch(environmentId, path, init),
  collect: captureSellerIdentities,
});
const wingRankBatch = KidItemKeywordRankBatch.create({
  kind: "wing", request: authedFetch, sourceOwner: wingRankSourceOwner,
  sleep, randomDelayMs, keepAlive: (work) => KidItemWorkerKeepAlive.during(work),
});
const serpRankBatch = KidItemKeywordRankBatch.create({
  kind: "serp", request: authedFetch, sourceOwner: keywordSerpSourceOwner,
  sleep, randomDelayMs, keepAlive: (work) => KidItemWorkerKeepAlive.during(work),
  afterBatch: collectSerpSellerEnrichment,
});
const wingFormReadiness = KidItemWingFormReadiness.create({ chrome });
const wingImageFetch = KidItemWingImageFetch.create({
  runtimeId: chrome.runtime.id,
  fetchFn: fetch,
  FileReaderCtor: FileReader,
});
chrome.runtime.onMessage.addListener(wingImageFetch.handleMessage);
const WING_FORM_PORT_NAME = "kiditem-wing-form-v1";

function handleWingFormPort(port) {
  let started = false;
  port.onMessage.addListener((message) => {
    if (started) return;
    started = true;
    if (message?.action !== "registerToWingForm") {
      port.postMessage({ ok: false, error: "지원하지 않는 WING 폼 요청입니다." });
      port.disconnect();
      return;
    }
    registerToWingForm(message)
      .then((result) => port.postMessage(result))
      .catch((error) =>
        port.postMessage({
          ok: false,
          error: error?.message || "WING 상품등록 페이지 열기 실패",
        }),
      )
      .finally(() => port.disconnect());
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[KIDITEM] Extension installed");
  cleanupStorage();
  // 알람은 onInstalled에서만 등록 (서비스워커 재시작 시 유지됨)
  chrome.alarms.create("storage-cleanup", { periodInMinutes: 1440 });
  adsEnvironmentContext.migrateLegacyStorage().catch(() => undefined);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "storage-cleanup") cleanupStorage();
  const scheduled = coupangEnvironment.parseAlarm(alarm.name);
  if (scheduled?.base === "kiditem-coupang-catalog-import-step") {
    KidItemCoupangCatalogImport.handleAlarm(
      alarm,
      coupangCatalogImportDependencies(scheduled.environmentId),
    );
  }
});

function cleanupStorage() {
  chrome.storage.local.get(null, (all) => {
    const keysToRemove = [];
    const now = Date.now();
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7일

    for (const [key, val] of Object.entries(all)) {
      // 싱크 기록 중 7일 지난 것 삭제
      if (
        key.startsWith("kiditem_last_sync_") &&
        val?.time &&
        now - val.time > MAX_AGE
      ) {
        keysToRemove.push(key);
      }
    }
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove);
      console.log(`[KIDITEM] Storage 정리: ${keysToRemove.length}개 삭제`);
    }
  });
}

// 동기화 완료 후 대시보드 탭 자동 새로고침
function notifyDashboard(environmentId) {
  return adsEnvironmentContext.publish(environmentId, "kiditem-sync");
}

// 아이콘 클릭 시 사이드 패널 열기
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ═══ content script에서 메시지 수신 ═══
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "inputWingCategorySearch") {
    wingFormRuntimeCompat
      .insertText(
        sender?.tab?.id,
        sender?.url || sender?.tab?.url,
        msg.value,
      )
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          error:
            error?.message || "WING 카테고리 검색 입력에 실패했습니다.",
        }),
      );
    return true;
  }

  if (msg.action === "bindKidItemEnvironment") {
    const tabId = sender?.tab?.id || msg.tabId;
    Promise.resolve()
      .then(async () => {
        adsEnvironmentContext.requireEnvironment(msg.environmentId);
        const connected = await adsEnvironmentContext.connectedEnvironmentIds();
        if (!connected.includes(msg.environmentId)) {
          throw new Error("선택한 환경에 로그인된 KidItem 탭이 없습니다.");
        }
        await coupangEnvironment.bindTab(tabId, msg.environmentId);
        return { success: true, environmentId: msg.environmentId };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 병합 전에는 쿠팡 워커가 `environmentIds`(문자열 배열)를, 소싱 워커가
  // `environments`(객체 배열)를 같은 액션 이름으로 돌려줬다. 하나의 확장에서는
  // 두 리스너가 같은 메시지에 경쟁 응답해 사이드패널이 비결정적으로 깨지므로,
  // 여기서만 응답하되 두 소비자가 모두 읽을 수 있게 양쪽 필드를 함께 담는다.
  if (msg.action === "getConnectedKidItemEnvironments") {
    adsEnvironmentContext.connectedEnvironmentIds()
      .then((environmentIds) =>
        sendResponse({
          success: true,
          environmentIds,
          environments: environmentIds.map((environmentId) =>
            adsEnvironmentContext.requireEnvironment(environmentId),
          ),
        }),
      )
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "kiditemApiRequest") {
    const path = typeof msg.path === "string" ? msg.path : "";
    if (!path.startsWith("/api/") || /^https?:/i.test(path)) {
      sendResponse({ success: false, error: "허용되지 않은 API 경로입니다." });
      return;
    }
    Promise.resolve()
      .then(async () => {
        const environmentId = msg.environmentId ||
          (await coupangEnvironment.environmentForTab(sender?.tab?.id));
        adsEnvironmentContext.requireEnvironment(environmentId);
        const headers = new Headers(msg.init?.headers || {});
        headers.delete("authorization");
        const response = await authedFetch(environmentId, path, {
          ...(msg.init || {}),
          headers,
        });
        const body = await response.json().catch(() => null);
        return { success: true, ok: response.ok, status: response.status, body };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "exportWingInventoryWorkbook") {
    KidItemWorkerKeepAlive.during(
      exportWingInventoryWorkbook(msg.products, sender),
    )
      .then(sendResponse)
      .catch((error) => sendResponse({
        success: false,
        error: error?.message || "Wing 상품목록 엑셀 변환 실패",
      }));
    return true;
  }

  if (msg.action === "collectAdvertisingWingTrafficFromPopup") {
    Promise.resolve()
      .then(async () => {
        const request = parsePopupOwnerRequest(
          msg,
          "collectAdvertisingWingTrafficFromPopup",
        );
        const range = displayedWingTrafficRange(request.url);
        const attempt = await beginSourceOwnerAttempt(
          request.environmentId,
          "/api/ads/traffic",
          {
            startDate: range.startDate,
            endDate: range.endDate,
            url: range.url,
          },
          range,
        );
        return KidItemWorkerKeepAlive.during(
          runWingTrafficSourceOwner({
            environmentId: request.environmentId,
            attemptId: attempt.attemptId,
          }),
        );
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error?.message || "Wing 트래픽 owner 수집 실패" }));
    return true;
  }

  if (msg.action === "collectAdvertisingWingItemwinnerFromPopup") {
    Promise.resolve()
      .then(async () => {
        const request = parsePopupOwnerRequest(
          msg,
          "collectAdvertisingWingItemwinnerFromPopup",
        );
        const targetUrl = displayedWingItemwinnerPage(request.url);
        const attempt = await beginSourceOwnerAttempt(
          request.environmentId,
          "/api/ads/wing-itemwinner",
          { targetUrl },
          { targetUrl },
        );
        return KidItemWorkerKeepAlive.during(
          wingItemwinnerSourceOwner.run({
            environmentId: request.environmentId,
            attemptId: attempt.attemptId,
          }),
        );
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error?.message || "Wing 아이템위너 owner 수집 실패" }));
    return true;
  }

  if (msg.action === "collectAdvertisingCampaignsFromPopup") {
    Promise.resolve()
      .then(async () => {
        const request = parsePopupOwnerRequest(
          msg,
          "collectAdvertisingCampaignsFromPopup",
        );
        const scope = advertisingManualReportScope(request.url);
        const attempt = await beginSourceOwnerAttempt(
          request.environmentId,
          "/api/ads/ad-campaigns",
          scope,
          scope,
        );
        const campaign = await KidItemWorkerKeepAlive.during(
          adCampaignSourceOwner.run({
            environmentId: request.environmentId,
            attemptId: attempt.attemptId,
          }),
        );
        if (scope.period !== "1d" || campaign?.terminalState !== "COMPLETE") return campaign;
        const daily = await beginSourceOwnerAttempt(
          request.environmentId,
          "/api/ads/account-daily-kpis",
          { targetDate: scope.startDate },
          { targetDate: scope.startDate },
        );
        const accountDailyKpi = await KidItemWorkerKeepAlive.during(
          adAccountDailyKpiSourceOwner.run({
            environmentId: request.environmentId,
            attemptId: daily.attemptId,
          }),
        );
        return {
          ...campaign,
          accountDailyKpi,
          success: campaign.success === true && accountDailyKpi.success === true,
          error: accountDailyKpi.success === true ? campaign.error : accountDailyKpi.error,
          errorCode: accountDailyKpi.success === true ? campaign.errorCode : accountDailyKpi.errorCode,
        };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error?.message || "광고 캠페인 owner 수집 실패" }));
    return true;
  }

  if (msg.action === "monthlyScrape") {
    let request;
    let range;
    try {
      request = parseMonthlyScrapeRequest(msg);
      range = monthlyWingTrafficRange(request.year, request.month);
    } catch (error) {
      sendResponse({
        success: false,
        error: error?.message || "Invalid monthly Wing traffic request",
      });
      return;
    }
    doMonthlyScrape(request.year, request.month, request.environmentId, range)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "Wing 월별 owner 수집 승인 실패",
        }),
      );
    return true;
  }

  if (msg.action === "reportCollectionTargetProgress") {
    const runId = typeof msg.runId === "string" ? msg.runId : null;
    const progress = msg.progress;
    let senderUrl;
    try { senderUrl = new URL(sender?.url || sender?.tab?.url || ""); } catch {}
    if (!runId || !progress || typeof progress !== "object" || Array.isArray(progress)
      || Object.keys(msg).some((key) => !["action", "runId", "progress"].includes(key))
      || !Number.isInteger(sender?.tab?.id)
      || senderUrl?.origin !== "https://advertising.coupang.com"
      || senderUrl.username || senderUrl.password) {
      sendResponse({ success: false, error: "invalid collection progress" });
      return;
    }
    coupangEnvironment.environmentForTab(sender.tab.id)
      .then((environmentId) => adCenterCollectorFor(environmentId).reportProgress({
        environmentId, attemptId: runId, tabId: sender.tab.id, progress,
      }))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) =>
        sendResponse({ success: false, error: error?.message || "progress update failed" }),
      );
    return true;
  }

});

// ═══ 대시보드(외부 웹페이지)에서 메시지 수신 ═══
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const senderEnvironment = adsEnvironmentContext.resolveSender(sender);
  if (!senderEnvironment) {
    sendResponse({ success: false, error: "Untrusted KidItem web origin" });
    return false;
  }
  const environmentId = senderEnvironment.environmentId;
  msg = { ...msg, environmentId };

  // 수집 세션 공통 액션(list/get/cancel/openAttentionTab)은 통합
  // 서비스워커가 producer 로 도메인을 골라 처리한다. 도메인 워커가 각자
  // 응답하면 세 리스너가 같은 메시지에 경쟁 응답하게 된다.

  // ping 은 통합 서비스워커가 세 도메인의 capabilities 를 합쳐 한 번만 응답한다.
  // 이 도메인의 capabilities 는 파일 끝의 KidItemDomains.register 로 넘긴다.

  if (msg.action === "startCoupangCatalogImport") {
    KidItemCoupangCatalogImport.start(msg, coupangCatalogImportDependencies(environmentId))
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 상품 수집 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getCoupangCatalogImportStatus") {
    KidItemCoupangCatalogImport.getStatus(
      typeof msg.attemptId === "string" ? msg.attemptId : null,
      coupangCatalogImportDependencies(environmentId),
    )
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ attemptId: msg.attemptId, active: false, attention: null, error: e?.message || "쿠팡 상품 수집 상태 조회 실패" }));
    return true;
  }

  if (msg.action === "cancelCoupangCatalogImport") {
    KidItemCoupangCatalogImport.cancel(
      typeof msg.attemptId === "string" ? msg.attemptId : null,
      coupangCatalogImportDependencies(environmentId),
    )
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ success: false, error: e?.message || "쿠팡 상품 수집 중단 실패" }));
    return true;
  }

  if (msg.action === "deleteWingProduct") {
    deleteWingProduct(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({ ok: false, error: e?.message || "WING 상품 삭제 실패" }),
      );
    return true;
  }

  if (msg.action === "registerToWingForm") {
    registerToWingForm(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({ ok: false, error: e?.message || "WING 상품등록 페이지 열기 실패" }),
      );
    return true;
  }



  if (msg.action === "runCoupangReviewCollection") {
    KidItemCoupangReviewCollector.start(
      {
        attemptId: msg.attemptId,
        attemptToken: msg.attemptToken,
        plan: msg.plan,
      },
      coupangReviewCollectorDependencies(environmentId),
    )
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          started: false,
          error: e?.message || "쿠팡 리뷰 수집 시작 실패",
        }),
      );
    return true;
  }

  if (msg.action === "getCoupangReviewCollectionStatus") {
    KidItemCoupangReviewCollector.getStatus(
      typeof msg.runId === "string" ? msg.runId : null,
      coupangReviewCollectorDependencies(environmentId).stateKey,
    )
      .then((status) => sendResponse(status))
      .catch(() => sendResponse({ status: "idle" }));
    return true;
  }

  if (msg.action === "cancelCoupangReviewCollection") {
    const dependencies = coupangReviewCollectorDependencies(environmentId);
    KidItemCoupangReviewCollector.cancel(
      typeof msg.runId === "string" ? msg.runId : null,
      dependencies.stateKey,
      dependencies,
    )
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          cancelled: false,
          error: e?.message || "쿠팡 리뷰 수집 중단 실패",
        }),
      );
    return true;
  }


  if (msg.action === "registerWingThumbnail") {
    registerWingThumbnail(msg)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "쿠팡 Wing 대표이미지 등록 실패",
        }),
      );
    return true;
  }

  if (msg.action === "setAuthToken") {
    const token = typeof msg.token === "string" ? msg.token : null;
    if (!token) {
      sendResponse({ success: false, error: "token required" });
      return;
    }
    adsEnvironmentContext.setAccessToken(environmentId, token)
      .then(() => sendResponse({ success: true, environmentId }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "clearAuthToken") {
    adsEnvironmentContext.clearAccessToken(environmentId)
      .then(() => sendResponse({ success: true, environmentId }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "openAndExecuteAdActions") {
    openAndExecuteAdActions(AD_ACTION_URL, environmentId)
      .then((result) => sendResponse(result))
      .catch((e) =>
        sendResponse({
          success: false,
          error: e?.message || "광고 액션 실행 탭 생성 실패",
        }),
      );
    return true;
  }

  // ── 상품 수정 자동화: Wing 탭 열고 content script에 작업 위임 ──
  if (msg.action === "openAndEditProduct") {
    const { productName } = msg;
    openAndEditProduct(productName)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "상품 수정 탭 생성 실패",
        }),
      );
    return true;
  }
});

function coupangCatalogImportDependencies(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return {
    environmentId,
    authedFetch: (path, init) => authedFetch(environmentId, path, init),
    alarmName: coupangEnvironment.alarmName(
      "kiditem-coupang-catalog-import-step",
      environmentId,
    ),
    stateKey: coupangEnvironment.stateKey(
      "kiditem_coupang_catalog_import",
      environmentId,
    ),
    keepAlive: (operation) => KidItemWorkerKeepAlive.during(operation),
    collectionWindow: catalogCollectionWindowFor(environmentId),
    collectionSessions,
    notifyDashboard: () => notifyDashboard(environmentId),
    sendTabMessage,
    getTab,
    waitForTabComplete,
  };
}

function coupangReviewCollectorDependencies(environmentId) {
  adsEnvironmentContext.requireEnvironment(environmentId);
  return {
    authedFetch: (path, init) => authedFetch(environmentId, path, init),
    stateKey: coupangEnvironment.stateKey(
      KidItemCoupangReviewCollector.stateKey,
      environmentId,
    ),
    createTab,
    waitForTabComplete,
    removeTab,
  };
}

// 단일 상품 직접 등록: formV2 탭을 열고 content script(wing-registration-fill)에 채움 데이터 전송.
// ⚠️ 제출은 하지 않는다 — content script 가 채우기만 하고 사용자가 확인 후 등록.
function waitForTabComplete(tabId, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return resolve(false);
        if (tab.status === "complete") return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(check, 400);
      });
    };
    check();
  });
}

async function registerToWingForm(message) {
  const product = message && message.product;
  if (!product || typeof product !== "object") {
    return { ok: false, error: "product 데이터가 없습니다." };
  }
  // 폼 채움만 하는 기본 경로에는 아직 provider side effect 가 없다. 실행 ID는
  // 실제 제출을 자동화하는 경우에만 필수다.
  const autoSubmit = message.autoSubmit === true;
  const executionId = typeof message?.executionId === "string" ? message.executionId.trim() : "";
  const expectedVendorId = typeof message?.expectedVendorId === "string" ? message.expectedVendorId.trim() : "";
  if (autoSubmit && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(executionId)) {
    return { ok: false, error: "등록 실행 ID가 올바르지 않습니다." };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(expectedVendorId)) {
    return { ok: false, error: "승인된 WING 판매자 식별자가 올바르지 않습니다." };
  }
  // ⚠️ 웹의 등록 확인 모달에서 "상품등록까지 자동 실행"을 켠 경우에만 true 가 실려 온다.
  //    엄격한 === true 비교로만 켠다. 값이 없거나 truthy 한 다른 값이면 제출하지 않는다.
  const url =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";
  const tab = await interactiveTabs.createTab({
    url: "about:blank",
    reason: INTERACTIVE_TAB_REASONS.PRODUCT_EDIT,
  });
  // 정적 document_start content script도 Wing 번들과 경합할 수 있다. 빈 탭에
  // 새 문서 초기화 스크립트를 먼저 등록한 뒤 Wing으로 이동해 provider 코드보다
  // 앞에서 전역 lodash 누락 기능을 보완한다. 이후 폼 채움 흐름은 기존과 동일하다.
  const preparedNavigation = await wingFormRuntimeCompat.prepareNavigation(
    tab.id,
    url,
  );
  if (!preparedNavigation.ok) {
    return {
      ok: false,
      tabId: tab.id,
      error: `WING 상품등록 화면을 열지 못했습니다. ${preparedNavigation.error}`,
    };
  }
  const loaded = await waitForTabComplete(tab.id, 60000);
  if (!loaded) {
    return {
      ok: false,
      tabId: tab.id,
      error: "WING 상품등록 화면 로딩 시간이 초과되었습니다.",
    };
  }
  // Wing formV2의 현재 배포 코드가 lodash import 없이 전역 `_.isEmpty`를
  // 호출해 옵션 Vue 컴포넌트 렌더를 중단한다. 번들 버전이 아니라 필요한
  // 런타임 capability만 MAIN world에서 확인·보완한다. Coupang이 고치면 no-op이다.
  const runtimeCompatibility = await wingFormRuntimeCompat.ensure(tab.id);
  if (!runtimeCompatibility.ok) {
    return {
      ok: false,
      tabId: tab.id,
      error: `WING 상품등록 화면을 준비하지 못했습니다. ${runtimeCompatibility.error}`,
    };
  }
  const readiness = await wingFormReadiness.wait(tab.id, url);
  if (!readiness.ok) {
    return {
      ok: false,
      tabId: tab.id,
      failure: readiness,
      error: readiness.code === "wing_form_content_not_ready"
        ? "WING 상품등록 확장 스크립트가 준비되지 않았습니다. 확장을 리로드한 뒤 다시 시도하세요."
        : "WING 상품등록 화면 준비 상태를 확인하지 못했습니다.",
    };
  }
  const formSessionId = globalThis.crypto?.randomUUID?.()
    || `wing-form-${tab.id}-${Date.now()}`;
  try {
    const fill = await chrome.tabs.sendMessage(tab.id, {
      action: "fillWingForm",
      formSessionId,
      product,
      autoSubmit,
      executionId,
      expectedVendorId,
    });
    // 채움이 실패했으면 성공으로 보고하지 않는다. 예전에는 ok:true 로 덮어써서
    // "폼은 열렸는데 아무것도 안 채워졌고 에러도 없는" 상태가 됐다.
    if (!fill?.ok) {
      return {
        ok: false,
        tabId: tab.id,
        fill,
        error: fill?.error || "WING 폼 자동 채우기에 실패했습니다. 열린 탭에서 직접 입력해 주세요.",
      };
    }
    // 제출까지 요청받았으면 제출 결과를 그대로 올려보낸다. 성공을 확증하지 못한 경우
    // (status:'unknown') 웹이 등록상품으로 올리지 않도록 submission 을 그대로 전달한다.
    return {
      ok: true,
      tabId: tab.id,
      fill,
      submission: fill.submission || { attempted: false },
      evidence: fill.evidence,
    };
  } catch (e) {
    return {
      ok: false,
      tabId: tab.id,
      error: `${e?.message || "content script 미응답"} — 확장을 리로드(chrome://extensions)한 뒤 다시 시도하세요.`,
    };
  }
}

/**
 * 등록상품 1건을 WING 에서 삭제한다. ⚠️ 되돌릴 수 없다.
 *
 * 웹은 **서버가 인가한** externalId 만 넘긴다(사용자가 화면에서 고른 값이 아니다).
 * 여기서는 그 ID 로 검색된 목록 화면을 열어 content script 에 넘기기만 한다.
 * 대상이 정확히 1건이 아니면 content script 가 아무것도 하지 않고 실패로 돌려준다.
 */
async function deleteWingProduct(message) {
  const listingId = typeof message?.listingId === "string" ? message.listingId.trim() : "";
  const operationId = typeof message?.operationId === "string" ? message.operationId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) {
    return { ok: false, error: "삭제 대상 리스팅 ID가 올바르지 않습니다." };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    return { ok: false, error: "삭제 작업 ID가 올바르지 않습니다." };
  }
  // External messages are untrusted: freeze every provider fact through an
  // authenticated, one-time server claim before opening or clicking WING.
  const claimResponse = await authedFetch(
    message.environmentId,
    `/api/channels/listings/${encodeURIComponent(listingId)}/deletion-operations/${encodeURIComponent(operationId)}/extension-claim`,
    { method: "POST" },
  );
  if (!claimResponse.ok) {
    return { ok: false, error: `삭제 실행 권한을 확인하지 못했습니다 (${claimResponse.status}).` };
  }
  const claim = await claimResponse.json();
  const externalId = typeof claim?.externalId === "string" ? claim.externalId.trim() : "";
  const expectedVendorId = typeof claim?.expectedVendorId === "string" ? claim.expectedVendorId.trim() : "";
  const executionCapability = typeof claim?.executionCapability === "string" ? claim.executionCapability.trim() : "";
  if (!/^\d{6,20}$/.test(externalId) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(expectedVendorId)
    || !/^[0-9a-f-]{36}$/i.test(executionCapability)) {
    return { ok: false, error: "서버 삭제 실행 권한이 완전하지 않습니다." };
  }
  // 검색어를 URL 에 실어 대상 1건만 남은 목록을 연다. 전체 목록에서 찾게 하면
  // 페이지네이션 때문에 행을 못 찾거나 동명이인 행이 섞인다.
  const url =
    "https://wing.coupang.com/tenants/seller-web/vendor-inventory/list" +
    `?searchType=VENDOR_INVENTORY_ID&keyword=${encodeURIComponent(externalId)}`;
  const tab = await interactiveTabs.createTab({
    url,
    reason: INTERACTIVE_TAB_REASONS.PRODUCT_EDIT,
  });
  await coupangEnvironment.bindTab(tab.id, message.environmentId);
  await waitForTabComplete(tab.id, 60000);
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: "deleteWingProduct",
      operationId,
      externalId,
      displayName: claim.displayName || null,
      expectedVendorId,
    });
    if (!result?.ok) {
      return {
        ok: false,
        tabId: tab.id,
        result,
        error: result?.error || "WING 상품 삭제에 실패했습니다. 열린 탭에서 직접 확인하세요.",
      };
    }
    // A DOM observation is not server-verifiable provider evidence. The web
    // caller records reconciling/uncertain; only independent provider API or
    // catalog reconciliation may deactivate the local listing.
    return { ok: true, tabId: tab.id, providerDeletionObserved: true };
  } catch (e) {
    return {
      ok: false,
      tabId: tab.id,
      error: `${e?.message || "content script 미응답"} — 확장을 리로드(chrome://extensions)한 뒤 다시 시도하세요.`,
    };
  }
}

async function captureWingRank(keyword, maxPages, { environmentId, attemptId }) {
  let search, tabId;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!await collectionSessions.getOwned(attemptId, environmentId)) return { cancelled: true };
    try {
      search = await wingSearchCollector.collect({
        keyword, maxPages, environmentId, attemptId, collectionTabId: tabId,
      });
      if (search?.tabId) tabId = search.tabId;
      if (search?.attentionRequired || search?.cancelled) return search;
      if (!search?.success) throw new Error(search?.error || "Wing 상품분석 조회 실패");
      break;
    } catch (error) {
      if (!await collectionSessions.getOwned(attemptId, environmentId)) return { cancelled: true };
      if (attempt === 2) throw error;
      await sleep(randomDelayMs(5000, 9000));
    }
  }
  return {
    success: true,
    pagesScanned: search.pages.length,
    collectedCount: search.collectedCount,
    totalResults: search.upstreamTotal,
    items: sortWingCatalogRowsBySales(search.rows),
    proof: { maxPages: search.maxPages, stopReason: search.stopReason,
      pages: search.pages.map(({ searchPage, itemCount, nextSearchPage, resultArrayObserved }) => ({
        searchPage, itemCount, nextSearchPage, resultArrayObserved,
      })),
    },
  };
}

function toAdvertisingTrackedWingSnapshot(row, sourceKeyword) {
  return {
    productId: String(row.productId),
    sourceKeyword,
    salePriceKrw: wingOperationBoundedInteger(row.salePrice),
    ratingCount: wingOperationBoundedInteger(row.ratingCount),
    ratingAverage: wingOperationBoundedNumber(row.rating, 0, 5),
    pvLast28Day: wingOperationBoundedInteger(row.pvLast28Day),
    salesLast28d: wingOperationBoundedInteger(row.salesLast28d),
    estimatedRevenue28d: wingOperationBoundedNumber(
      row.estimatedRevenue28d,
      0,
      2147483647,
    ),
    conversionRate28d: wingOperationBoundedNumber(
      row.conversionRate28d,
      0,
      1,
    ),
  };
}

function wingOperationBoundedInteger(value) {
  if (
    value == null ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    return null;
  }
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 2147483647
    ? numeric
    : null;
}

function wingOperationBoundedNumber(value, minimum, maximum) {
  if (
    value == null ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum
    ? numeric
    : null;
}

function wingSearchHasIncompleteProof(search) {
  if (!search || search.success !== true) return true;
  if (INCOMPLETE_WING_SEARCH_STOP_REASONS.has(search.stopReason)) return true;
  return Array.isArray(search.pages)
    && search.pages.some((page) => page?.resultArrayObserved !== true);
}

async function collectAdvertisingTrackedWingProductsKeyword({
  environmentId,
  attemptId,
  keyword,
  plannedProducts,
  collectionTabId,
}) {
  const session = await collectionSessions.getOwned(attemptId, environmentId);
  if (session?.producer !== ADVERTISING_TRACKED_WING_PRODUCTS_PRODUCER) {
    throw new Error("tracked_wing_source_owner_session_invalid");
  }
  const search = await wingSearchCollector.collect({
    keyword,
    maxPages: WING_CATALOG_MAX_PAGES,
    environmentId,
    attemptId,
    ...(Number.isInteger(collectionTabId) ? { collectionTabId } : {}),
  });
  if (search?.attentionRequired) {
    return {
      success: false,
      attentionRequired: true,
      reason: "marketplace_login",
      error: search.error || "Coupang Wing login is required.",
      ...(Number.isInteger(search.tabId) ? { tabId: search.tabId } : {}),
    };
  }
  if (search?.cancelled) {
    return {
      success: false,
      cancelled: true,
      ...(Number.isInteger(search.tabId) ? { tabId: search.tabId } : {}),
    };
  }
  if (!search?.success) {
    return {
      success: false,
      error: search?.error || "Wing catalog search failed.",
      ...(Number.isInteger(search?.tabId) ? { tabId: search.tabId } : {}),
    };
  }
  if (wingSearchHasIncompleteProof(search)) {
    return {
      success: false,
      errorCode: "INCOMPLETE_WING_SEARCH",
      error: "Wing catalog search proof is incomplete.",
      stopReason: search.stopReason || null,
      ...(Array.isArray(search.pages) ? { pages: search.pages } : {}),
      ...(search.pagination && typeof search.pagination === "object"
        ? { pagination: search.pagination }
        : {}),
      ...(Number.isInteger(search.tabId) ? { tabId: search.tabId } : {}),
    };
  }
  const frozenProducts = new Set(
    Array.isArray(plannedProducts) ? plannedProducts : [],
  );
  const maxTrackedItems = Math.min(
    frozenProducts.size,
    ADVERTISING_TRACKED_WING_PRODUCTS_MAX_ITEMS,
  );
  return {
    success: true,
    ...(Number.isInteger(search.tabId) ? { tabId: search.tabId } : {}),
    ...(search.pagination && typeof search.pagination === "object"
      ? { pagination: search.pagination }
      : {}),
    items: (Array.isArray(search.rows) ? search.rows : [])
      .filter(
        (row) =>
          row &&
          row.productId != null &&
          frozenProducts.has(String(row.productId)),
      )
      .slice(0, maxTrackedItems)
      .map((row) => toAdvertisingTrackedWingSnapshot(row, keyword)),
  };
}

function sortWingCatalogRowsBySales(rows) {
  return [...(Array.isArray(rows) ? rows : [])]
    .sort(
      (a, b) =>
        (Number(b?.salesLast28d) || 0) - (Number(a?.salesLast28d) || 0) ||
        (Number(b?.estimatedRevenue28d) || 0) -
          (Number(a?.estimatedRevenue28d) || 0) ||
        String(a?.productId || "").localeCompare(String(b?.productId || "")),
    )
    .map((item, index) => ({ ...item, salesRank: index + 1 }));
}

// ═══ 공개 쿠팡 검색 노출순위 (수동 호환용) ═══
// 공개 검색 페이지(www.coupang.com/np/search)를 열어 상품 목록을 DOM 순서대로 수집한다.

async function captureCoupangKeywordSerp(keyword, maxPages, options = {}) {
  return coupangSerpCollector.collect(keyword, maxPages, options);
}

async function captureSellerIdentities(targets, { environmentId, attemptId, expiresAt }) {
  return coupangSellerIdentityCollector.collect(targets, {
    environmentId,
    attemptId,
    expiresAt,
    onProgress: ({ processed, targetCount }) => collectionSessions.progress(attemptId, {
      current: processed,
      total: targetCount,
      completed: processed,
      failed: 0,
      label: "겹치는 상품 판매자 확인",
    }),
  });
}

async function collectAdvertisingCompetitorCatalogTarget(input) {
  return coupangSellerCatalogCollector.collectTarget(input);
}

function randomDelayMs(minMs, maxMs) {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function stableInputFingerprint(value) {
  const normalized = String(value || "").normalize("NFKC").trim();
  let primary = 2166136261;
  let secondary = 0x9e3779b9 ^ normalized.length;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    primary ^= code;
    primary = Math.imul(primary, 16777619);
    secondary ^= code + index;
    secondary = Math.imul(secondary ^ (secondary >>> 16), 0x5bd1e995);
  }
  return `fp64:${(primary >>> 0).toString(16).padStart(8, "0")}${(secondary >>> 0).toString(16).padStart(8, "0")}`;
}

function isWingCatalogFormUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "wing.coupang.com" &&
      parsed.pathname.includes("/tenants/seller-web/vendor-inventory/formV2")
    );
  } catch {
    return false;
  }
}

async function openAndEditProduct(value) {
  const productName = typeof value === "string" ? value.trim() : "";
  if (!productName) return { success: false, error: "상품명이 없습니다" };
  await chrome.storage.local.set({
    kiditem_pending_edit: { productName, ts: Date.now() },
  });
  const tab = await interactiveTabs.createTab({
    url: buildWingProductSearchUrl(productName),
    reason: INTERACTIVE_TAB_REASONS.PRODUCT_EDIT,
  });
  await waitForTabComplete(tab.id, { timeoutMs: 30000 });
  await sleep(3000);
  return sendTabMessage(tab.id, { action: "searchAndEdit", productName });
}

async function registerWingThumbnail(message) {
  const productName =
    typeof message.productName === "string" ? message.productName.trim() : "";
  const image = message.image || {};
  if (!productName)
    return { success: false, error: "쿠팡 등록 상품명이 없습니다" };
  if (
    typeof image.dataUrl !== "string" ||
    !image.dataUrl.startsWith("data:image/")
  ) {
    return { success: false, error: "대표이미지 데이터가 없습니다" };
  }

  const tab = await interactiveTabs.createTab({
    url: buildWingProductSearchUrl(productName),
    reason: INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
  });
  if (!tab?.id) return { success: false, error: "Wing 탭을 열 수 없습니다" };
  const tabId = tab.id;

  const loaded = await waitForTabComplete(tabId, { timeoutMs: 60000 }).catch(
    (error) => ({
      error: error?.message || "Wing 탭 로딩 실패",
    }),
  );
  if (loaded?.error) return { success: false, error: loaded.error, tabId };
  if (!isWingInventoryUrl(loaded?.url || "")) {
    await interactiveTabs.focusTab(
      tabId,
      INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
    );
    return {
      success: false,
      pendingLogin: true,
      opened: true,
      tabId,
      error:
        "쿠팡 Wing 로그인 필요 — 열린 Wing 탭에서 로그인 후 다시 실행하세요.",
    };
  }

  await sleep(1500);
  const openResult = await sendTabMessage(tabId, {
    action: "kiditemOpenWingProductEdit",
    productName,
  });
  if (!openResult?.success) {
    await interactiveTabs.focusTab(
      tabId,
      INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
    );
    return {
      success: false,
      opened: true,
      tabId,
      error: openResult?.error || "Wing 상품 수정 화면을 열 수 없습니다",
    };
  }

  await waitForTabComplete(tabId, {
    expectedUrl: openResult.editUrl || undefined,
    timeoutMs: 60000,
  }).catch(() => null);
  await sleep(2500);

  const uploadResult = await sendTabMessage(tabId, {
    action: "kiditemUploadWingThumbnail",
    productName,
    image,
  });
  if (!uploadResult?.success) {
    await interactiveTabs.focusTab(
      tabId,
      INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
    );
    return {
      success: false,
      opened: true,
      tabId,
      error: uploadResult?.error || "Wing 대표이미지 업로드 실패",
    };
  }

  await interactiveTabs.focusTab(
    tabId,
    INTERACTIVE_TAB_REASONS.THUMBNAIL_REGISTRATION,
  );
  return {
    success: true,
    opened: true,
    tabId,
    screenshotUrl: uploadResult.screenshotUrl,
  };
}

function buildWingProductSearchUrl(productName) {
  return `https://wing.coupang.com/vendor-inventory/list?searchKeywordType=PRODUCT_NAME&searchKeywords=${encodeURIComponent(productName)}&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1`;
}

function buildCoupangSearchUrl(keyword) {
  return `${COUPANG_SEARCH_URL}?component=&q=${encodeURIComponent(keyword)}&channel=user`;
}

function isCoupangSearchUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.coupang.com" &&
      parsed.pathname.includes("/np/search")
    );
  } catch {
    return false;
  }
}

async function openAndExecuteAdActions(url = AD_ACTION_URL, environmentId) {
  const tab = await interactiveTabs.createTab({
    url,
    reason: INTERACTIVE_TAB_REASONS.AD_MUTATION,
  });
  await coupangEnvironment.bindTab(tab.id, environmentId);
  return new Promise((resolve) => {
      const tabId = tab.id;
      let sent = false;
      const cleanup = () => chrome.tabs.onUpdated.removeListener(onUpdated);
      const timeout = setTimeout(() => {
        cleanup();
        if (!sent)
          resolve({ success: true, opened: true, tabId, pendingLogin: true });
      }, 180000);

      const sendRunMessage = () => {
        if (sent) return;
        sent = true;
        clearTimeout(timeout);
        cleanup();
        setTimeout(() => {
          chrome.tabs.sendMessage(
            tabId,
            { action: "runApprovedQueuedAdActions" },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({
                  success: true,
                  opened: true,
                  tabId,
                  warning: chrome.runtime.lastError.message,
                });
                return;
              }
              resolve({ success: true, opened: true, tabId, response });
            },
          );
        }, 3000);
      };

      function onUpdated(updatedTabId, changeInfo, updatedTab) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        const currentUrl = updatedTab?.url || "";
        if (!currentUrl.startsWith("https://advertising.coupang.com/")) return;
        sendRunMessage();
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function isWingInventoryUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "wing.coupang.com" &&
      parsed.pathname.includes("vendor-inventory/list")
    );
  } catch {
    return false;
  }
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (data) => resolve(data || {}));
  });
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        reject(new Error(chrome.runtime.lastError?.message || "탭 조회 실패"));
        return;
      }
      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.remove(tabId, () =>
        resolve({ success: !chrome.runtime.lastError }),
      );
    } catch {
      resolve({ success: false });
    }
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
  });
}

function createTab(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        reject(new Error(chrome.runtime.lastError?.message || "탭 생성 실패"));
        return;
      }
      resolve(tab);
    });
  });
}

async function updateTabAndWait(tabId, url, options = {}) {
  const before = await getTab(tabId).catch(() => null);
  if (before?.active && options.allowActive !== true) {
    throw new Error("active user tab is collection-protected");
  }
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url, active: !!options.active }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      waitForTabComplete(tabId, {
        expectedUrl: url,
        previousUrl: before?.url || null,
      })
        .then(resolve)
        .catch(reject);
    });
  });
}

const COUPANG_TAB_DIAGNOSTIC_MAX_URL_LENGTH = 2048;

function coupangSafeTabDiagnosticPageIdentity(url) {
  if (typeof url !== "string" || !url) return "unknown";
  if (url.length > COUPANG_TAB_DIAGNOSTIC_MAX_URL_LENGTH) return "oversized";

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid";
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  let type = "other";
  if (hostname === "wing.coupang.com") {
    if (
      pathname === "/vendor-inventory/list" ||
      pathname === "/tenants/seller-web/vendor-inventory/list"
    ) {
      type = "wing-inventory-list";
    } else if (
      pathname === "/vendor-inventory/modify" ||
      pathname === "/tenants/seller-web/vendor-inventory/modify"
    ) {
      type = "wing-inventory-modify";
    } else {
      type = "wing";
    }
  } else if (hostname === "login.coupang.com") {
    type = "coupang-login";
  }

  const identity = [`type=${type}`];
  if (type === "wing-inventory-list" || type === "wing-inventory-modify") {
    const vendorInventoryId = parsed.searchParams.get("vendorInventoryId");
    const page = parsed.searchParams.get("page");
    if (/^[0-9]{1,18}$/.test(vendorInventoryId || "")) {
      identity.push(`vendorInventoryId=${vendorInventoryId}`);
    }
    if (/^[0-9]{1,18}$/.test(page || "")) {
      identity.push(`page=${page}`);
    }
  }
  return identity.join(",");
}

function waitForTabComplete(tabId, options = {}) {
  const timeoutMs = options.timeoutMs || 45000;
  return new Promise((resolve, reject) => {
    let done = false;
    let sawNavigation = false;
    let lastObservedStatus = "unobserved";
    let lastObservedPage = "unobserved";
    const observeTab = (url, status) => {
      lastObservedStatus =
        status === "loading" || status === "complete" ? status : "unknown";
      lastObservedPage = coupangSafeTabDiagnosticPageIdentity(url);
    };
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timeout);
    };
    const finish = (tab) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(tab || {});
    };
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(
        new Error(
          [
            "Wing 탭 로딩 타임아웃",
            `expectedPage=${options.expectedUrl ? coupangSafeTabDiagnosticPageIdentity(options.expectedUrl) : "not-specified"}`,
            `lastObservedStatus=${lastObservedStatus}`,
            `lastObservedPage=${lastObservedPage}`,
            `navigationObserved=${sawNavigation}`,
          ].join("; "),
        ),
      );
    }, timeoutMs);
    const onRemoved = (removedTabId) => {
      if (removedTabId !== tabId || done) return;
      done = true;
      cleanup();
      reject(new Error("Wing 탭이 닫혔습니다"));
    };
    const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
      if (updatedTabId !== tabId) return;
      const observedUrl = updatedTab?.url ?? changeInfo?.url;
      observeTab(observedUrl, changeInfo?.status ?? updatedTab?.status);
      if (changeInfo?.status === "loading") {
        sawNavigation = true;
        return;
      }
      if (
        changeInfo?.status === "complete" &&
        isExpectedTab(updatedTab, { ...options, sawNavigation })
      ) {
        finish(updatedTab);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      observeTab(tab?.url, tab?.status);
      if (isExpectedTab(tab, options)) finish(tab);
    });
  });
}

function isExpectedTab(tab, options = {}) {
  if (tab?.status !== "complete") return false;
  if (!options.expectedUrl) return true;
  const currentUrl = tab.url || "";
  if (matchesExpectedWingPage(currentUrl, options.expectedUrl)) return true;
  if (options.sawNavigation && currentUrl === options.expectedUrl) return true;
  if (options.sawNavigation && isWingInventoryUrl(currentUrl)) return true;
  if (options.previousUrl && currentUrl === options.previousUrl) return false;
  return Boolean(currentUrl && !isWingInventoryUrl(currentUrl));
}

function matchesExpectedWingPage(currentUrl, expectedUrl) {
  try {
    const current = new URL(currentUrl);
    const expected = new URL(expectedUrl);
    if (current.hostname !== expected.hostname) return false;
    if (!current.pathname.includes("vendor-inventory/list")) return false;
    const currentPage = current.searchParams.get("page") || "1";
    const expectedPage = expected.searchParams.get("page") || "1";
    return currentPage === expectedPage;
  } catch {
    return false;
  }
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            chrome.runtime.lastError.message || "content script 미응답",
          ),
        );
        return;
      }
      resolve(response);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCING_WING_CATALOG_MAX_KEYWORDS = 12;
const SOURCING_WING_CATALOG_MAX_ITEMS = 100;
const ADVERTISING_TRACKED_WING_PRODUCTS_PRODUCER =
  "advertising.wing_tracked_products";
const ADVERTISING_TRACKED_WING_PRODUCTS_MAX_ITEMS = 300;
const INCOMPLETE_WING_SEARCH_STOP_REASONS = new Set([
  "authentication_token_missing",
  "non_json_response",
]);

// The sourcing Wing-catalog owner is loaded before this worker, but its
// boundary helpers live here so the owner can share the worker's canonical
// keyword contract and the focused source-owner test harness can load the
// same production seam without the whole worker.
function parseSourcingWingCatalogInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("wing_catalog_operation_input_invalid");
  }
  if (
    !Array.isArray(input.keywords) ||
    input.keywords.length < 1 ||
    input.keywords.length > SOURCING_WING_CATALOG_MAX_KEYWORDS ||
    !Number.isInteger(input.maxPages) ||
    input.maxPages < 1 ||
    input.maxPages > WING_CATALOG_MAX_PAGES ||
    ![
      "catalog_search",
      "market_analysis",
      "recommendation_validation",
      "tracked_metrics",
    ].includes(input.purpose) ||
    Object.keys(input).some(
      (key) => !["keywords", "maxPages", "purpose"].includes(key),
    )
  ) {
    throw new Error("wing_catalog_operation_input_invalid");
  }
  const keywords = KidItemWingKeywordContract.parseBatchKeywords(
    input.keywords,
    SOURCING_WING_CATALOG_MAX_KEYWORDS,
    100,
  );
  return { keywords, maxPages: input.maxPages, purpose: input.purpose };
}

function sourcingWingCatalogBoundedInteger(value) {
  if (
    value == null ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    return null;
  }
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 2147483647
    ? numeric
    : null;
}

function sourcingWingCatalogBoundedNumber(value, minimum, maximum) {
  if (
    value == null ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.trim() === "") ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum
    ? numeric
    : null;
}

function toSourcingWingCatalogObservation(row, sourceKeyword, capturedAt) {
  return {
    productId: String(row.productId),
    itemId: row.itemId == null ? null : String(row.itemId),
    vendorItemId:
      row.vendorItemId == null ? null : String(row.vendorItemId),
    productName: String(row.productName || "").slice(0, 500),
    itemName: row.itemName == null ? null : String(row.itemName).slice(0, 500),
    brandName:
      row.brandName == null ? null : String(row.brandName).slice(0, 500),
    manufacture:
      row.manufacture == null ? null : String(row.manufacture).slice(0, 500),
    categoryHierarchy:
      row.categoryHierarchy == null
        ? null
        : String(row.categoryHierarchy).slice(0, 1000),
    imagePath:
      row.imagePath == null ? null : String(row.imagePath).slice(0, 2000),
    salePriceKrw: sourcingWingCatalogBoundedInteger(row.salePrice),
    ratingAverage: sourcingWingCatalogBoundedNumber(row.rating, 0, 5),
    ratingCount: sourcingWingCatalogBoundedInteger(row.ratingCount),
    viewsLast28d: sourcingWingCatalogBoundedInteger(row.pvLast28Day),
    salesLast28d: sourcingWingCatalogBoundedInteger(row.salesLast28d),
    estimatedRevenue28d: sourcingWingCatalogBoundedNumber(
      row.estimatedRevenue28d,
      0,
      2147483647,
    ),
    conversionRate28d: sourcingWingCatalogBoundedNumber(
      row.conversionRate28d,
      0,
      1,
    ),
    deliveryInfo:
      row.deliveryInfo == null
        ? null
        : String(row.deliveryInfo).slice(0, 1000),
    sourceKeyword,
    capturedAt,
  };
}

function parseAdvertisingTrackedWingProductsStart(message) {
  if (
    !message ||
    typeof message !== "object" ||
    Array.isArray(message) ||
    Object.keys(message).some(
      (key) => key !== "action" && key !== "idempotencyKey" && key !== "keywords",
    ) ||
    typeof message.idempotencyKey !== "string" ||
    message.idempotencyKey.trim().length === 0 ||
    message.idempotencyKey.length > 128 ||
    !Array.isArray(message.keywords)
  ) {
    throw new Error("Invalid tracked Wing collection request");
  }
  const keywords = KidItemWingKeywordContract.parseBatchKeywords(
    message.keywords,
    SOURCING_WING_CATALOG_MAX_KEYWORDS,
    100,
  );
  return { idempotencyKey: message.idempotencyKey.trim(), keywords };
}
function parseSourcingKeywordSuggestionStart(message) {
  return keywordSuggestionSourceOwner.parseStart(message);
}

function runSourcingKeywordSuggestions(input) {
  return keywordSuggestionSourceOwner.run(input);
}

async function cancelSourcingKeywordSuggestions(attemptId, environmentId) {
  return keywordSuggestionSourceOwner.cancel({ environmentId, attemptId });
}

async function collectSerpSellerEnrichment({ environmentId, idempotencyKey, isCancelled, setCancelActive }) {
  const collectCatalog = (phase, excludeCompletedAttemptId) => competitorCatalogSourceOwner.run({
    environmentId, idempotencyKey: `${idempotencyKey}:catalog:${phase}`,
    input: { target: "rank_enrichment", ...(excludeCompletedAttemptId ? { excludeCompletedAttemptId } : {}) },
    onAttempt: async ({ attemptId }) => {
      const cancel = () => competitorCatalogSourceOwner.cancel({ environmentId, attemptId });
      setCancelActive(cancel);
      if (isCancelled()) await cancel();
    },
  });
  try {
    if (isCancelled()) return;
    const initial = await collectCatalog("initial");
    if (isCancelled() || initial.terminalState !== "COMPLETE") return;

    const response = await authedFetch(environmentId, "/api/ads/competitor-seller-identities/attempts", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `${idempotencyKey}:identity` },
      body: "{}",
    });
    if (!response.ok) throw new Error(`판매자 식별 대상 조회 실패 (${response.status})`);
    const identity = KidItemKeywordRankSourceOwner.parseStart({
      action: "collectAdvertisingSellerIdentities", attemptId: (await response.json())?.attemptId,
    }, "identity");
    const cancelIdentity = () => sellerIdentitySourceOwner.fail({ environmentId, attemptId: identity.attemptId,
      code: "COLLECTION_CANCELLED", message: "판매자 식별 수집이 취소되었습니다." });
    setCancelActive(cancelIdentity);
    if (isCancelled()) { await cancelIdentity(); return; }
    const outcome = await sellerIdentitySourceOwner.run({ environmentId, attemptId: identity.attemptId });
    if (isCancelled() || outcome.terminalState !== "COMPLETE") return;
    await collectCatalog("new", initial.attemptId);
  } finally {
    setCancelActive(null);
  }
}

async function collectAdvertisingProfitabilitySlice({
  environmentId,
  attemptId,
  account,
  slice,
}) {
  return adCenterCollectorFor(environmentId).collectProfitabilitySlice({
    environmentId, attemptId, account, slice,
  });
}

async function cancelCollectionSession(runId, environmentId) {
  const session = await collectionSessions.getOwned(runId, environmentId);
  if (session?.producer === "advertising.ad_sync") {
    await adCenterCollectorFor(environmentId).cancelRun({ attemptId: runId });
    return adCampaignSourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === "advertising.ad_keyword") {
    await adCenterCollectorFor(environmentId).cancelRun({ attemptId: runId });
    return adKeywordSourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === "advertising.ad_account_daily_kpi") {
    await adCenterCollectorFor(environmentId).cancelRun({ attemptId: runId });
    return adAccountDailyKpiSourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === WING_TRAFFIC_PRODUCER) {
    // The router preserves the legacy v1 owner cancellation path
    // (wingTrafficSourceOwner.cancel) while selecting the daily v2 owner.
    return cancelWingTrafficSourceOwner({ environmentId, attemptId: runId });
  }
  if (session?.producer === WING_ITEMWINNER_PRODUCER) {
    await wingReportCollectorFor(environmentId).cancelRun({ attemptId: runId });
    return wingItemwinnerSourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === "channels.coupang_catalog") {
    return KidItemCoupangCatalogImport.cancel(runId, coupangCatalogImportDependencies(environmentId));
  }
  if (session?.producer === "advertising.competitor_seller_identity") {
    return sellerIdentitySourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === "advertising.keyword_rank") {
    return keywordSerpSourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === "advertising.wing_rank") {
    return wingRankSourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === "advertising.profitability_import") {
    await adCenterCollectorFor(environmentId).cancelRun({ attemptId: runId });
    return profitabilitySourceOwner.cancel({ environmentId, attemptId: runId });
  }
  if (session?.producer === ADVERTISING_TRACKED_WING_PRODUCTS_PRODUCER) {
    return trackedWingProductsSourceOwner.cancel({
      environmentId,
      attemptId: runId,
    });
  }
  if (session?.producer === "advertising.competitor_catalog") {
    return competitorCatalogSourceOwner.cancel({
      environmentId,
      attemptId: runId,
    });
  }
  throw new Error("Collection producer source owner does not support cancellation");
}

/**
 * 월별 Wing 트래픽 source owner 승인 — 하나의 고정 범위를 승인하고
 * 서비스워커 keepalive 아래 일별-v2 owner를 시작한다. 진행률과 terminal
 * 상태는 서버 attempt가 소유하며, 이 함수는 승인 ACK만 반환한다.
 */
async function doMonthlyScrape(year, month, environmentId, frozenRange = null) {
  const range = frozenRange || monthlyWingTrafficRange(year, month);
  adsEnvironmentContext.requireEnvironment(environmentId);
  const attempt = await beginSourceOwnerAttempt(
    environmentId,
    "/api/ads/traffic",
    {
      startDate: range.startDate,
      endDate: range.endDate,
      url: range.url,
    },
    range,
  );
  const admission = monthlyWingTrafficAdmission(attempt, range);
  if (admission.terminalState === "RUNNING") {
    const dispatch = KidItemWorkerKeepAlive.during(
      runWingTrafficSourceOwnerV2({
        environmentId,
        attemptId: admission.attemptId,
      }),
    );
    dispatch.catch((error) =>
      console.error(
        "[KIDITEM] Wing 월별 owner dispatch 실패:",
        error?.message || error,
      ),
    );
  }
  return admission;
}

for (const environmentId of adsEnvironmentContext.environmentIds) {
  KidItemWorkerKeepAlive.during(adCampaignSourceOwner.recover(environmentId))
    .catch(error => console.error("[KIDITEM] 광고 캠페인 owner 복구 실패:", error?.message || error));
  KidItemWorkerKeepAlive.during(adKeywordSourceOwner.recover(environmentId))
    .catch((error) => console.error("[KIDITEM] 광고 키워드 owner 복구 실패:", error?.message || error));
  KidItemWorkerKeepAlive.during(adAccountDailyKpiSourceOwner.recover(environmentId))
    .catch((error) => console.error("[KIDITEM] 광고 계정 일별 KPI owner 복구 실패:", error?.message || error));
  KidItemWorkerKeepAlive.during(wingTrafficSourceOwner.recover(environmentId))
    .catch((error) => console.error("[KIDITEM] Wing 트래픽 owner 복구 실패:", error?.message || error));
  KidItemWorkerKeepAlive.during(wingTrafficSourceOwnerV2.recover(environmentId))
    .catch((error) => console.error("[KIDITEM] Wing 트래픽 일별 owner 복구 실패:", error?.message || error));
  KidItemWorkerKeepAlive.during(wingItemwinnerSourceOwner.recover(environmentId))
    .catch((error) => console.error("[KIDITEM] Wing 아이템위너 owner 복구 실패:", error?.message || error));
  KidItemWorkerKeepAlive.during(profitabilitySourceOwner.recover(environmentId))
    .catch((error) =>
      console.error(
        "[KIDITEM] 수익성 광고비 source owner 복구 실패:",
        error?.message || error,
      ),
    );
  KidItemWorkerKeepAlive.during(
    trackedWingProductsSourceOwner.recover(environmentId),
  ).catch((error) =>
    console.error(
      "[KIDITEM] 추적 Wing source owner 복구 실패:",
      error?.message || error,
    ),
  );
  KidItemWorkerKeepAlive.during(
    competitorCatalogSourceOwner.recover(environmentId),
  ).catch((error) =>
    console.error(
      "[KIDITEM] 경쟁 판매자 source owner 복구 실패:",
      error?.message || error,
    ),
  );
}

function parseAdvertisingProfitabilityStart(message) {
  if (
    !message ||
    typeof message !== "object" ||
    Array.isArray(message) ||
    Object.keys(message).some((key) =>
      key !== "action" && key !== "idempotencyKey") ||
    typeof message.idempotencyKey !== "string" ||
    message.idempotencyKey.trim().length === 0 ||
    message.idempotencyKey.length > 128
  ) {
    throw new Error("Invalid Advertising profitability collection request");
  }
  return { idempotencyKey: message.idempotencyKey.trim() };
}

// ── 통합 서비스워커 등록 ──
// producer 접두사로 이 도메인이 만든 수집 세션을 식별한다.
KidItemDomains.register({
  producerPrefixes: ["advertising", "channels", "dashboard"],
  externalPorts: {
    [WING_FORM_PORT_NAME]: (port) => handleWingFormPort(port),
  },
  externalActions: {
    collectAdvertisingSellerIdentities: {
      validate: (message) => KidItemKeywordRankSourceOwner.parseStart(message, "identity"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        sellerIdentitySourceOwner.run({ environmentId, attemptId }),
      ),
    },
    collectAdvertisingWingRankBatch: {
      validate: (message) => KidItemKeywordRankBatch.parseStart(message, "collectAdvertisingWingRankBatch"),
      handle: ({ idempotencyKey }, environmentId) => wingRankBatch.start({ environmentId, idempotencyKey }),
    },
    cancelAdvertisingWingRankBatch: {
      validate: (message) => KidItemKeywordRankBatch.parseStart(message, "cancelAdvertisingWingRankBatch"),
      handle: ({ idempotencyKey }, environmentId) => KidItemWorkerKeepAlive.during(
        wingRankBatch.cancel({ environmentId, idempotencyKey }),
      ),
    },
    collectAdvertisingKeywordSerpBatch: {
      validate: (message) => KidItemKeywordRankBatch.parseStart(message, "collectAdvertisingKeywordSerpBatch"),
      handle: ({ idempotencyKey }, environmentId) => serpRankBatch.start({ environmentId, idempotencyKey }),
    },
    cancelAdvertisingKeywordSerpBatch: {
      validate: (message) => KidItemKeywordRankBatch.parseStart(message, "cancelAdvertisingKeywordSerpBatch"),
      handle: ({ idempotencyKey }, environmentId) => KidItemWorkerKeepAlive.during(
        serpRankBatch.cancel({ environmentId, idempotencyKey }),
      ),
    },
    collectAdvertisingKeywordSerp: {
      validate: (message) => KidItemKeywordRankSourceOwner.parseStart(message, "serp"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        keywordSerpSourceOwner.run({ environmentId, attemptId }),
      ),
    },
    collectAdvertisingWingRank: {
      validate: (message) => KidItemKeywordRankSourceOwner.parseStart(message, "wing"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        wingRankSourceOwner.run({ environmentId, attemptId }),
      ),
    },
    collectSourcingWingCatalog: {
      validate: parseSourcingWingCatalogStart,
      handle: ({ idempotencyKey, input }, environmentId) =>
        KidItemWorkerKeepAlive.during(runSourcingWingCatalog({ environmentId, idempotencyKey, input })),
    },
    collectSourcingKeywordSuggestions: {
      validate: parseSourcingKeywordSuggestionStart,
      handle: ({ idempotencyKey, input }, environmentId) =>
        KidItemWorkerKeepAlive.during(runSourcingKeywordSuggestions({ environmentId, idempotencyKey, input })),
    },
    collectAdvertisingProfitability: {
      validate: parseAdvertisingProfitabilityStart,
      handle: ({ idempotencyKey }, environmentId) =>
        KidItemWorkerKeepAlive.during(
          profitabilitySourceOwner.run({ environmentId, idempotencyKey }),
        ),
    },
    collectAdvertisingKeywords: {
      validate: (message) => KidItemAdKeywordSourceOwner.parseAction(message, "collectAdvertisingKeywords"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        adKeywordSourceOwner.run({ environmentId, attemptId }),
      ),
    },
    collectAdvertisingCampaigns: {
      validate: message => KidItemAdCampaignSourceOwner.parseAction(message, "collectAdvertisingCampaigns"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(adCampaignSourceOwner.run({ environmentId, attemptId })),
    },
    cancelAdvertisingCampaigns: {
      validate: message => KidItemAdCampaignSourceOwner.parseAction(message, "cancelAdvertisingCampaigns"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        adCenterCollectorFor(environmentId).cancelRun({ attemptId })
          .then(() => adCampaignSourceOwner.cancel({ environmentId, attemptId })),
      ),
    },
    cancelAdvertisingKeywords: {
      validate: (message) => KidItemAdKeywordSourceOwner.parseAction(message, "cancelAdvertisingKeywords"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        adCenterCollectorFor(environmentId).cancelRun({ attemptId })
          .then(() => adKeywordSourceOwner.cancel({ environmentId, attemptId })),
      ),
    },
    collectAdvertisingAccountDailyKpis: {
      validate: message => KidItemAdAccountDailyKpiSourceOwner.parseAction(message, "collectAdvertisingAccountDailyKpis"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        adAccountDailyKpiSourceOwner.run({ environmentId, attemptId }),
      ),
    },
    cancelAdvertisingAccountDailyKpis: {
      validate: message => KidItemAdAccountDailyKpiSourceOwner.parseAction(message, "cancelAdvertisingAccountDailyKpis"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        adCenterCollectorFor(environmentId).cancelRun({ attemptId })
          .then(() => adAccountDailyKpiSourceOwner.cancel({ environmentId, attemptId })),
      ),
    },
    collectAdvertisingWingTraffic: {
      validate: message => KidItemWingTrafficSourceOwner.parseAction(message, "collectAdvertisingWingTraffic"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        runWingTrafficSourceOwner({ environmentId, attemptId }),
      ),
    },
    cancelAdvertisingWingTraffic: {
      validate: message => KidItemWingTrafficSourceOwner.parseAction(message, "cancelAdvertisingWingTraffic"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        cancelWingTrafficSourceOwner({ environmentId, attemptId }),
      ),
    },
    collectAdvertisingWingItemwinner: {
      validate: message => KidItemWingItemwinnerSourceOwner.parseAction(message, "collectAdvertisingWingItemwinner"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        wingItemwinnerSourceOwner.run({ environmentId, attemptId }),
      ),
    },
    cancelAdvertisingWingItemwinner: {
      validate: message => KidItemWingItemwinnerSourceOwner.parseAction(message, "cancelAdvertisingWingItemwinner"),
      handle: ({ attemptId }, environmentId) => KidItemWorkerKeepAlive.during(
        wingReportCollectorFor(environmentId).cancelRun({ attemptId })
          .then(() => wingItemwinnerSourceOwner.cancel({ environmentId, attemptId })),
      ),
    },
    collectAdvertisingTrackedWingProducts: {
      validate: parseAdvertisingTrackedWingProductsStart,
      handle: ({ idempotencyKey, keywords }, environmentId) =>
        KidItemWorkerKeepAlive.during(
          trackedWingProductsSourceOwner.run({
            environmentId,
            idempotencyKey,
            keywords,
          }),
        ),
    },
    collectAdvertisingCompetitorCatalog: {
      validate: KidItemCompetitorCatalogSourceOwner.parseStart,
      handle: ({ idempotencyKey, input }, environmentId) =>
        KidItemWorkerKeepAlive.during(
          competitorCatalogSourceOwner.run({
            environmentId,
            idempotencyKey,
            input,
          }),
        ),
    },
  },
  capabilities: {
    sellerIdentitySourceOwnerV1: true,
    keywordSerpSourceOwnerV1: true,
    wingRankSourceOwnerV1: true,
    profitabilityAdvertisingSourceOwnerV1: true,
    trackedWingProductsSourceOwnerV1: true,
    competitorCatalogSourceOwnerV1: true,
    sourcingWingCatalogSourceOwnerV1: true,
    wingCatalogSearch: true,
    wingCatalogSearchSource: "wing-pre-matching",
    coupangKeywordSuggestions: true,
    sourcingKeywordSuggestionSourceOwnerV1: true,
    coupangKeywordSuggestionSource: "coupang-search-page",
    coupangProductNameTokens: true,
    coupangKeywordRank: true,
    coupangKeywordRankSource: "coupang-search-page",
    coupangCompetitorSeller: true,
    coupangCompetitorSellerSource: "coupang-product-detail",
    coupangCompetitorSellerCatalog: true,
    coupangCompetitorSellerCatalogSource: "coupang-seller-shop-newest-first",
    coupangCompetitorSellerCatalogOnDemand: true,
    wingCatalogSalesRank: true,
    wingCatalogSalesRankCancel: true,
    wingCatalogSalesRankSource: "wing-pre-matching-sales-28d",
    coupangCatalogSnapshot: true,
    coupangCatalogSourceAttempts: true,
    coupangCatalogSnapshotSource: "wing-inventory-v1",
    coupangReviewCollection: true,
    coupangReviewCollectionSource: "wing-cs-product-review",
    browserCollectionSessions: true,
    advertisingKeywordSourceOwnerV1: true,
    advertisingCampaignSourceOwnerV1: true,
    advertisingAccountDailyKpiSourceOwnerV1: true,
    wingTrafficSourceOwnerV1: true,
    wingTrafficSourceOwnerV2: true,
    wingItemwinnerSourceOwnerV1: true,
    kiditemEnvironmentProfilesV1: true,
    wingFormRegister: true,
    wingFormRegisterSource: "wing-formV2-fill",
    wingFormReadinessV2: true,
    wingFormPortV1: true,
  },
  cancelAdditionalCollections: (environmentId) =>
    KidItemCoupangReviewCollector.cancelAdditionalCollections(
      coupangReviewCollectorDependencies(environmentId),
    ),
  retryAdditionalCollections: (environmentId) =>
    KidItemCoupangReviewCollector.retryAdditionalCollections(
      coupangReviewCollectorDependencies(environmentId),
    ),
  cancelCollectionSession,
});
