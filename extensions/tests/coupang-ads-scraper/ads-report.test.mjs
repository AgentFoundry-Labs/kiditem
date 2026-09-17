import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const source = fs.readFileSync(
  path.join(repoRoot, "extensions/kiditem-os/content/coupang/ads-report.js"),
  "utf8",
);

test("managed daily collection owns targetDate pages instead of an unowned auto-start", () => {
  assert.doesNotMatch(source, /legacyBatchAutoStartDelayMs/);
  assert.doesNotMatch(source, /isLegacyBatchMode/);
  assert.doesNotMatch(source, /action:\s*["']reportBatchScrapeDone["']/);
  assert.match(source, /if \(isActionMode\) \{/);
  assert.match(source, /readSettledReportPage\(30000\)/);
});

function loadContract(options = {}) {
  const location = options.location || {
    href: "https://advertising.coupang.com/marketing/dashboard/sales",
    pathname: "/marketing/dashboard/sales",
    search: "",
    hash: "",
  };
  const document = options.document || {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    title: "광고센터",
  };
  const messageListeners = [];
  const timeoutCalls = [];
  const configuredSetTimeout = options.setTimeout || (() => 0);
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: {
          addListener(listener) {
            messageListeners.push(listener);
          },
        },
        sendMessage:
          options.sendMessage ||
          ((_message, callback) => callback?.({ success: true })),
      },
      storage: { local: { set() {} } },
    },
    console: options.console || console,
    document,
    history: options.history || { back() {} },
    location,
    sessionStorage: options.sessionStorage || {
      getItem() {
        return null;
      },
      removeItem() {},
      setItem() {},
    },
    setTimeout(callback, delay) {
      timeoutCalls.push({ callback, delay });
      return configuredSetTimeout(callback, delay);
    },
    clearTimeout() {},
    setInterval: options.setInterval || (() => 0),
    clearInterval() {},
    showBadge() {},
    URL,
    URLSearchParams,
    ...options.globals,
  });
  context.window = context;
  context.window.location = location;
  vm.runInContext(source, context, { filename: "ads-report.js" });
  if (options.exposeRuntime) {
    return {
      contract: context.KidItemAdsReportContract,
      context,
      messageListeners,
      timeoutCalls,
    };
  }
  return context.KidItemAdsReportContract;
}

function reportSnapshot(page, totalPages, rowIds = [], surfaceKind = "rows") {
  const rawRows = rowIds.map((id) => ({ "상품ID": id }));
  const normalizedRows = rowIds.map((id) => ({
    externalId: id,
    pageType: "product",
  }));
  return {
    ok: true,
    parsed: {
      rawRows,
      normalizedRows,
      headers: ["상품ID"],
      pageType: "product",
    },
    pagination: {
      currentPage: page,
      totalPages,
      verified: true,
      source: "fixture",
    },
    surface: {
      kind: surfaceKind,
      explicitEmpty: surfaceKind === "empty",
    },
    signature: rowIds.join("|"),
  };
}

test("login callback URL is not mistaken for the advertising dashboard", () => {
  const loginHref =
    "https://advertising.coupang.com/user/login?callback_url=" +
    encodeURIComponent("https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1");
  const contract = loadContract({
    location: {
      href: loginHref,
      pathname: "/user/login",
      search: `?callback_url=${encodeURIComponent(
        "https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1",
      )}`,
      hash: "",
    },
  });

  assert.equal(contract.isAdvertisingLoginPage(), true);
  assert.equal(contract.isDashboardListPage(), false);
});

test("campaign detail returns through the verified sales navigation instead of the misleading all-campaigns heading", async () => {
  const location = {
    href: "https://advertising.coupang.com/marketing/campaign/104640375/group/205034227/product",
    pathname: "/marketing/campaign/104640375/group/205034227/product",
    search: "",
    hash: "",
  };
  let sidebarClicks = 0;
  let inertAncestorClicks = 0;
  let headingClicks = 0;
  const title = { innerText: "운영 캠페인" };
  const row = {
    querySelector(selector) {
      return selector.includes("campaign_name") ? title : null;
    },
  };
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? [row] : [];
    },
  };
  const salesAncestor = {
    click() {
      inertAncestorClicks += 1;
    },
  };
  const salesLabel = {
    click() {
      sidebarClicks += 1;
      location.href =
        "https://advertising.coupang.com/marketing/dashboard/sales";
      location.pathname = "/marketing/dashboard/sales";
    },
    getAttribute() {
      return null;
    },
    querySelector() {
      return null;
    },
    closest(selector) {
      return selector === "li[role='menuitem']" ? salesAncestor : null;
    },
  };
  const misleadingHeading = {
    innerText: "모든 캠페인",
    click() {
      headingClicks += 1;
    },
  };
  const contract = loadContract({
    location,
    document: {
      querySelector(selector) {
        if (
          selector ===
          "[data-bigfoot-component='lnb-menu-ads-management-sales']"
        ) {
          return salesLabel;
        }
        if (
          location.pathname === "/marketing/dashboard/sales" &&
          selector.includes(".rt-table")
        ) {
          return grid;
        }
        if (selector.includes("h3")) return misleadingHeading;
        return null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  assert.equal(await contract.returnToDashboard(10), true);
  assert.equal(sidebarClicks, 1);
  assert.equal(inertAncestorClicks, 0);
  assert.equal(headingClicks, 0);
});

test("campaign detail waits for the verified sales navigation to mount before returning", async () => {
  const location = {
    href: "https://advertising.coupang.com/marketing/campaign/104640375/product",
    pathname: "/marketing/campaign/104640375/product",
    search: "",
    hash: "",
  };
  let lookupCount = 0;
  let sidebarClicks = 0;
  const row = {
    querySelector(selector) {
      return selector.includes("campaign_name")
        ? { innerText: "운영 캠페인" }
        : null;
    },
  };
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? [row] : [];
    },
  };
  const salesControl = {
    click() {
      sidebarClicks += 1;
      location.href = "https://advertising.coupang.com/marketing/dashboard/sales";
      location.pathname = "/marketing/dashboard/sales";
    },
    getAttribute(name) {
      return name === "href" ? "/marketing/dashboard/sales" : null;
    },
    querySelector() {
      return null;
    },
  };
  const salesLabel = {
    click() {
      salesControl.click();
    },
    closest() {
      return salesControl;
    },
  };
  const contract = loadContract({
    location,
    setTimeout(callback) {
      callback();
      return 0;
    },
    document: {
      querySelector(selector) {
        if (selector === "[data-bigfoot-component='lnb-menu-ads-management-sales']") {
          lookupCount += 1;
          return lookupCount >= 3 ? salesLabel : null;
        }
        if (
          location.pathname === "/marketing/dashboard/sales" &&
          selector.includes(".rt-table")
        ) {
          return grid;
        }
        return null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  assert.equal(await contract.returnToDashboard(10), true);
  assert.ok(lookupCount >= 3);
  assert.equal(sidebarClicks, 1);
});

test("dashboard readiness ignores a date-picker grid mounted before the campaign grid", async () => {
  const location = {
    href: "https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1",
    pathname: "/marketing/dashboard/sales",
    search: "",
    hash: "#kiditemAdSync=1",
  };
  const calendarGrid = {
    className: "ant-calendar-table",
    closest() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const title = { innerText: "운영 캠페인" };
  const row = {
    querySelector(selector) {
      return selector.includes("campaign_name") ? title : null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const campaignGrid = {
    className: "rt-table",
    closest() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".rt-tbody .rt-tr-group") return [row];
      if (selector.includes("columnheader")) {
        return ["ON/OFF", "상품명", "상태"].map((innerText) => ({
          innerText,
        }));
      }
      return [];
    },
  };
  const contract = loadContract({
    location,
    setTimeout(callback) {
      callback();
      return 0;
    },
    document: {
      querySelector(selector) {
        if (selector.includes("[role='grid']")) return calendarGrid;
        return null;
      },
      querySelectorAll(selector) {
        if (selector.includes("[role='grid']")) {
          return [calendarGrid, campaignGrid];
        }
        return [];
      },
      title: "광고센터",
    },
  });

  assert.equal(await contract.returnToDashboard(10), true);
});

test("campaign detail does not use history fallback when no verified dashboard control exists", async () => {
  let historyBackCalls = 0;
  const contract = loadContract({
    location: {
      href: "https://advertising.coupang.com/marketing/campaign/104640375/product",
      pathname: "/marketing/campaign/104640375/product",
      search: "",
      hash: "",
    },
    document: {
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
    history: {
      back() {
        historyBackCalls += 1;
      },
    },
    setTimeout(callback) {
      callback();
      return 0;
    },
  });

  assert.equal(await contract.returnToDashboard(10), false);
  assert.equal(historyBackCalls, 0);
});

test("a new collection run clears stale sweep state while same-run navigation resumes it", () => {
  const values = new Map([
    // A same-run marker written by the old one-day contract must still be
    // invalidated after upgrading to the daily31 contract.
    ["kiditem_ad_sweep_run_v1", "new-run:2"],
    ["kiditem_ad_sweep_seen_v2", JSON.stringify(["campaign:old"])],
    [
      "kiditem_ad_sweep_completed_navigation_keys_v1",
      JSON.stringify(["dashboard-campaign\u001f1\u001f0\u001fold"]),
    ],
    [
      "kiditem_ad_sweep_pending_campaign_navigation_v1",
      JSON.stringify({
        name: "old",
        navigationKey: "dashboard-campaign\u001f1\u001f0\u001fold",
      }),
    ],
    ["kiditem_ad_sweep_progress_v2", JSON.stringify({ synced: 1 })],
    ["kiditem_ad_login_autosubmit_attempts_v1", "2"],
  ]);
  const sessionStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  const contract = loadContract({ sessionStorage });

  assert.deepEqual(
    { ...contract.prepareSweepRun("new-run", 2) },
    { fresh: true, runId: "new-run", attempt: 2 },
  );
  assert.equal(values.has("kiditem_ad_sweep_seen_v2"), false);
  assert.equal(
    values.has("kiditem_ad_sweep_completed_navigation_keys_v1"),
    false,
  );
  assert.equal(
    values.has("kiditem_ad_sweep_pending_campaign_navigation_v1"),
    false,
  );
  assert.equal(values.has("kiditem_ad_sweep_progress_v2"), false);
  assert.equal(values.has("kiditem_ad_sweep_run_v1"), false);
  assert.equal(
    values.has("kiditem_ad_login_autosubmit_attempts_v1"),
    false,
  );
  assert.equal(
    values.get("kiditem_ad_sweep_run_v2"),
    "new-run:2:daily-window-v2",
  );

  values.set("kiditem_ad_sweep_seen_v2", JSON.stringify(["campaign:new"]));
  values.set(
    "kiditem_ad_sweep_completed_navigation_keys_v1",
    JSON.stringify(["dashboard-campaign\u001f1\u001f0\u001fnew"]),
  );
  values.set(
    "kiditem_ad_sweep_progress_v2",
    JSON.stringify({
      synced: 1,
      rawOnlyCampaigns: 1,
      savedRawOnlyKeys: ["raw-page-1-row-2"],
    }),
  );
  values.set("kiditem_ad_login_autosubmit_attempts_v1", "1");
  assert.deepEqual(
    { ...contract.prepareSweepRun("new-run", 2) },
    { fresh: false, runId: "new-run", attempt: 2 },
  );
  assert.equal(values.has("kiditem_ad_sweep_seen_v2"), true);
  assert.equal(
    values.has("kiditem_ad_sweep_completed_navigation_keys_v1"),
    true,
  );
  assert.equal(values.has("kiditem_ad_sweep_progress_v2"), true);
  assert.equal(values.get("kiditem_ad_login_autosubmit_attempts_v1"), "1");
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.loadProgress())),
    {
      synced: 1,
      rawOnlyCampaigns: 1,
      savedRawOnlyKeys: ["raw-page-1-row-2"],
    },
  );

  assert.deepEqual(
    { ...contract.prepareSweepRun("new-run", 3) },
    { fresh: true, runId: "new-run", attempt: 3 },
  );
  assert.equal(values.has("kiditem_ad_sweep_seen_v2"), false);
  assert.equal(values.has("kiditem_ad_sweep_progress_v2"), false);
  assert.equal(
    values.has("kiditem_ad_login_autosubmit_attempts_v1"),
    false,
  );
  assert.equal(
    values.get("kiditem_ad_sweep_run_v2"),
    "new-run:3:daily-window-v2",
  );
});

test("dashboard collection hash waits for run-scoped manualSync instead of auto-starting", () => {
  assert.doesNotMatch(source, /const isLegacyBatchMode\s*=/);
  assert.doesNotMatch(source, /runSyncOnce\(\);/);
  assert.match(source, /if \(isActionMode\) \{/);
});

test("explicit campaign sweep mode survives when Coupang drops the dashboard hash", () => {
  const contract = loadContract({
    location: {
      href: "https://advertising.coupang.com/marketing/dashboard/sales",
      pathname: "/marketing/dashboard/sales",
      search: "",
      hash: "",
    },
  });

  assert.equal(typeof contract.shouldRunDashboardSweep, "function");
  assert.equal(contract.shouldRunDashboardSweep("campaign_sweep"), true);
});

test("manual sync shares only the same active run and rejects a new attempt before mutation", () => {
  const contract = loadContract();
  const same = contract.manualSyncAdmission({
    syncRunning: true,
    activeRunId: "run-1",
    activeAttempt: 2,
    requestedRunId: " run-1 ",
    requestedAttempt: 2,
  });
  const differentRun = contract.manualSyncAdmission({
    syncRunning: true,
    activeRunId: "run-1",
    activeAttempt: 2,
    requestedRunId: "run-2",
    requestedAttempt: 1,
  });
  const differentAttempt = contract.manualSyncAdmission({
    syncRunning: true,
    activeRunId: "run-1",
    activeAttempt: 2,
    requestedRunId: "run-1",
    requestedAttempt: 3,
  });
  const idleUnscoped = contract.manualSyncAdmission({
    syncRunning: false,
    activeRunId: "run-old",
    activeAttempt: 1,
    requestedRunId: null,
    requestedAttempt: null,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(same)), {
    accepted: true,
    shareCurrent: true,
    runId: "run-1",
    attempt: 2,
    error: null,
  });
  for (const rejected of [differentRun, differentAttempt]) {
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.shareCurrent, false);
    assert.equal(rejected.error, "ad_sync_already_running");
  }
  assert.deepEqual(JSON.parse(JSON.stringify(idleUnscoped)), {
    accepted: true,
    shareCurrent: false,
    runId: null,
    attempt: 1,
    error: null,
  });

  const listenerIndex = source.lastIndexOf(
    'if (msg.action === "manualSync")',
  );
  const admissionIndex = source.indexOf(
    "manualSyncAdmission({",
    listenerIndex,
  );
  const prepareIndex = source.indexOf(
    "prepareSweepRun(",
    listenerIndex,
  );
  const rejectionIndex = source.indexOf(
    "if (!admission.accepted)",
    listenerIndex,
  );
  assert.ok(listenerIndex >= 0);
  assert.ok(admissionIndex > listenerIndex);
  assert.ok(rejectionIndex > admissionIndex && rejectionIndex < prepareIndex);
});

test("targetDate pages stay idle and the retired account-day KPI sync mode cannot capture", async () => {
  const sent = [];
  const runtime = loadContract({
    exposeRuntime: true,
    console: { log() {}, warn() {}, error() {} },
    sendMessage: (message, callback) => {
      sent.push(message);
      callback?.({ success: true });
    },
    location: {
      href: "https://advertising.coupang.com/marketing/dashboard/sales#targetDate=2026-09-05",
      pathname: "/marketing/dashboard/sales",
      search: "",
      hash: "#targetDate=2026-09-05",
    },
  });
  assert.equal(runtime.messageListeners.length, 1);
  assert.equal(runtime.timeoutCalls.some(({ delay }) => delay === 6000), false);
  assert.doesNotMatch(source, /action:\s*["']reportBatchScrapeDone["']/);
  assert.doesNotMatch(source, /account_daily_kpi|accountDailyKpi|AccountDailyKpi|coupang_ads_daily/);
  assert.equal(runtime.contract.shouldRunAccountDailyKpi, undefined);
  assert.equal(runtime.contract.validateAccountDailyTargetDate, undefined);

  const response = await new Promise((resolve) => {
    runtime.messageListeners[0](
      {
        action: "manualSync",
        collectionRunId: "run-daily",
        collectionAttempt: 1,
        syncMode: "account_daily_kpi",
        targetDate: "2026-09-05",
        accountDailyKpiControl: {
          attemptId: "11111111-1111-4111-8111-111111111111",
          state: "RUNNING",
          expiresAt: "2030-01-01T00:00:00.000Z",
          plan: { businessDates: ["2026-09-05"] },
        },
      },
      { tab: { id: 41 }, url: runtime.context.location.href, frameId: 0 },
      resolve,
    );
  });

  // Without a campaign manual-report permit the page never reaches the date
  // picker and never sends a source step for the retired owner.
  assert.equal(response.success, false);
  assert.equal(response.errorCode, "SOURCE_ATTEMPT_UNAVAILABLE");
  assert.equal(response.targetDate, undefined);
  assert.deepEqual(sent, []);
});

test("approved action mode remains the only content auto-start", () => {
  assert.match(
    source,
    /if \(isActionMode\) \{[\s\S]{0,180}runApprovedActionsOnce\(\)\.then/,
  );
  assert.match(source, /sessionStorage\.removeItem\("kiditemExecuteActions"\)/);
});

function fakeLoginDocument({ usernameValue, passwordValue, submit }) {
  const password = { value: passwordValue, form: null };
  const username = { value: usernameValue };
  const form = {
    querySelector(selector) {
      if (/password/.test(selector)) return password;
      if (/submit/.test(selector)) return submit;
      return username;
    },
    querySelectorAll() {
      return [submit];
    },
  };
  password.form = form;
  return {
    title: "coupang wing 판매자 로그인",
    querySelector(selector) {
      return /password/.test(selector) ? password : null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

const LOGIN_LOCATION = {
  href: "https://advertising.coupang.com/user/login",
  pathname: "/user/login",
  search: "",
  hash: "",
};

test("advertising login auto-submit clicks the login button only when both fields are prefilled", () => {
  let clicks = 0;
  const submit = {
    textContent: "로그인",
    disabled: false,
    click() {
      clicks += 1;
    },
  };
  const contract = loadContract({
    location: LOGIN_LOCATION,
    document: fakeLoginDocument({
      usernameValue: "kiditem01",
      passwordValue: "hunter2hunter2",
      submit,
    }),
  });

  assert.equal(contract.advertisingLoginFieldsPrefilled(), true);
  assert.equal(contract.attemptAdvertisingLoginAutoSubmit(), true);
  assert.equal(clicks, 1);
  // 한 번 누른 뒤에는 같은 페이지에서 다시 누르지 않는다(로그인 루프 방지).
  assert.equal(contract.attemptAdvertisingLoginAutoSubmit(), false);
  assert.equal(clicks, 1);
});

test("automatic advertising login returns an explicit navigation handoff", () => {
  let clicks = 0;
  const submit = {
    textContent: "로그인",
    disabled: false,
    click() {
      clicks += 1;
    },
  };
  const contract = loadContract({
    location: LOGIN_LOCATION,
    document: fakeLoginDocument({
      usernameValue: "kiditem01",
      passwordValue: "hunter2hunter2",
      submit,
    }),
  });

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(contract.advertisingLoginHandoffResponse()),
    ),
    {
      success: false,
      resumeRequired: true,
      loginHandoff: true,
      error: "쿠팡 광고센터 자동 로그인 중",
      url: LOGIN_LOCATION.href,
    },
  );
  assert.equal(clicks, 1);
});

test("advertising login auto-submit never clicks when credentials are not prefilled", () => {
  let clicks = 0;
  const submit = {
    textContent: "로그인",
    disabled: false,
    click() {
      clicks += 1;
    },
  };
  const contract = loadContract({
    location: LOGIN_LOCATION,
    document: fakeLoginDocument({
      usernameValue: "kiditem01",
      passwordValue: "",
      submit,
    }),
  });

  assert.equal(contract.advertisingLoginFieldsPrefilled(), false);
  assert.equal(contract.attemptAdvertisingLoginAutoSubmit(), false);
  assert.equal(clicks, 0);
});

test("advertising login auto-submit stops after the per-session attempt budget", () => {
  let clicks = 0;
  const submit = {
    textContent: "로그인",
    disabled: false,
    click() {
      clicks += 1;
    },
  };
  const contract = loadContract({
    location: LOGIN_LOCATION,
    document: fakeLoginDocument({
      usernameValue: "kiditem01",
      passwordValue: "hunter2hunter2",
      submit,
    }),
    // 저장된 비번 오류로 로그인 페이지가 여러 번 재렌더돼 이미 2회 시도한 상태.
    sessionStorage: {
      getItem(key) {
        return key === "kiditem_ad_login_autosubmit_attempts_v1" ? "2" : null;
      },
      setItem() {},
      removeItem() {},
    },
  });

  // 예산을 초과하면 더 누르지 않아 캡차/계정잠금을 막는다.
  assert.equal(contract.attemptAdvertisingLoginAutoSubmit(), false);
  assert.equal(clicks, 0);
});

test("advertising login auto-submit never clicks a social login button", () => {
  let clicks = 0;
  const social = {
    textContent: "카카오로 로그인",
    disabled: false,
    click() {
      clicks += 1;
    },
  };
  const contract = loadContract({
    location: LOGIN_LOCATION,
    document: fakeLoginDocument({
      usernameValue: "kiditem01",
      passwordValue: "hunter2hunter2",
      submit: social,
    }),
  });

  // 자격증명이 채워졌어도 소셜 로그인/OAuth 버튼은 절대 누르지 않는다.
  assert.equal(contract.advertisingLoginFieldsPrefilled(), true);
  assert.equal(contract.attemptAdvertisingLoginAutoSubmit(), false);
  assert.equal(clicks, 0);
});

function fakeAccountPickerDocument(handlers) {
  const makeButton = (cardText, onClick) => {
    const button = {
      textContent: "로그인하기",
      disabled: false,
      click: onClick,
      parentElement: null,
    };
    button.parentElement = { textContent: cardText, parentElement: null };
    return button;
  };
  const buttons = [
    makeButton(
      "coupang wing 쿠팡 마켓플레이스 & 로켓그로스 판매자 광고운영, 결제, 분석 로그인하기",
      handlers.wing,
    ),
    makeButton(
      "coupang SUPPLIER HUB 쿠팡 로켓배송 판매자 광고운영, 결제, 분석 로그인하기",
      handlers.supplier,
    ),
    makeButton(
      "coupang ads 광고 대행사 또는 분석가 로그인하기",
      handlers.ads,
    ),
  ];
  return {
    title: "쿠팡 광고센터 로그인",
    querySelector(selector) {
      // 계정 유형 선택 화면에는 비밀번호 입력이 없다.
      return /password/.test(selector) ? null : null;
    },
    querySelectorAll(selector) {
      return /button|role="button"/.test(selector) ? buttons : [];
    },
  };
}

test("advertising account picker clicks the leftmost coupang wing 로그인하기", () => {
  const clicked = [];
  const contract = loadContract({
    location: LOGIN_LOCATION,
    document: fakeAccountPickerDocument({
      wing: () => clicked.push("wing"),
      supplier: () => clicked.push("supplier"),
      ads: () => clicked.push("ads"),
    }),
  });

  const chosen = contract.findAdvertisingAccountLoginButton();
  assert.equal(chosen.parentElement.textContent.includes("마켓플레이스"), true);

  assert.equal(contract.attemptAdvertisingLoginAutoSubmit(), true);
  // 오직 맨 왼쪽 쿠팡 wing 카드만 눌린다 — 로켓배송/광고 대행사 카드는 안 누른다.
  assert.deepEqual(clicked, ["wing"]);
});

test("conversion-count fixture never selects advertising conversion revenue", () => {
  const contract = loadContract();
  const headers = [
    "노출수",
    "광고 전환 매출",
    "광고 전환 주문수",
    "광고 전환 판매수",
  ];

  assert.equal(contract.findConversionCountHeaderIndex(headers), 3);
  assert.equal(
    contract.findConversionCountHeaderIndex(["광고 전환 매출", "광고 전환 주문수"]),
    -1,
  );

  const daily = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [
      {
        runningAdSpend: 40215,
        revenue: 216470,
        impressions: 178536,
        clicks: 295,
        conversions: 21,
        orders: 21,
      },
    ],
    {},
  );
  assert.equal(daily.adRevenue, 216470);
  assert.equal(daily.conversions, 21);
});

test("daily provider ratios stay unavailable when the report omits them", () => {
  const contract = loadContract();
  const daily = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [
      {
        spend: 0,
        revenue: 0,
        impressions: 2_000,
        clicks: 40,
        conversions: 4,
        orders: 3,
        _observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: true,
          conversions: true,
          orders: true,
        },
      },
    ],
    {},
  );

  assert.equal(daily.conversions, 4);
  assert.equal(daily.orders, 3);
  assert.equal(daily.roas, null);
  assert.equal(daily.ctr, null);
  assert.equal(daily.conversionRate, null);
  assert.deepEqual(JSON.parse(JSON.stringify(daily.observedMetrics)), {
    adSpend: true,
    adRevenue: true,
    impressions: true,
    clicks: true,
    conversions: true,
    orders: true,
  });
});

test("target-date fixture accepts only the requested displayed range", () => {
  const contract = loadContract();

  assert.equal(
    contract.displayedRangeMatchesTarget("2026.07.17 ~ 2026.07.17", "2026-07-17"),
    true,
  );
  assert.equal(
    contract.displayedRangeMatchesTarget("2026.07.11 ~ 2026.07.17", "2026-07-17"),
    false,
  );
});

test("date range popup discovery ignores hidden AntD dropdowns", () => {
  const hiddenPopup = {
    classList: { contains: (name) => name === "ant-dropdown-hidden" },
    getAttribute() {
      return null;
    },
    getClientRects() {
      return [{}];
    },
    hidden: false,
    parentElement: null,
    style: {},
  };
  const visiblePopup = {
    ...hiddenPopup,
    classList: { contains: () => false },
  };
  const contract = loadContract({
    document: {
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [hiddenPopup, visiblePopup];
      },
      title: "Advertising report",
    },
  });

  assert.equal(contract.findVisibleDateRangePopup(), visiblePopup);
});

test("date range popup opener retries when the first trigger click is dropped", async () => {
  const contract = loadContract();
  const popup = { id: "visible-date-range-popup" };
  let clicks = 0;
  let clock = 0;
  const trigger = {
    click() {
      clicks += 1;
    },
  };

  const opened = await contract.openDateRangePopup({
    findPopup: () => (clicks >= 2 ? popup : null),
    getTrigger: () => trigger,
    intervalMs: 1,
    maxAttempts: 3,
    minAttempts: 2,
    now: () => clock,
    popupTimeoutMs: 2,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  });

  assert.equal(opened, popup);
  assert.equal(clicks, 2);
});

// The ad center's report date indicator opens an AntD range calendar: a left
// and a right panel for two consecutive months, previous/next month controls,
// day cells (with other-month days mixed in) and an apply button. Every click
// re-renders the panels, as React does, and applying shows the picked range in
// the indicator. `applyRange` lets a fixture show something other than what was
// picked.
function reportCalendar({ displayed, leftMonth, applyRange = (picked) => picked }) {
  const dom = new JSDOM(`<!doctype html><body>
    <dl><dt>업체코드</dt><dd>A0001</dd></dl>
    <button class="dashboard-metric-widget-date-indicator-revamp ant-dropdown-trigger"></button>
    <div class="ant-dropdown dashboard-metric-widget-calendar-dropdown ant-dropdown-hidden">
      <div class="ant-calendar-range">
        <div class="ant-calendar-range-part ant-calendar-range-left"></div>
        <div class="ant-calendar-range-part ant-calendar-range-right"></div>
      </div>
      <div class="ant-calendar-footer">
        <button class="ant-btn">취소</button><button class="ant-btn ant-btn-primary">적용</button>
      </div>
    </div>
  </body>`, { url: "https://advertising.coupang.com/marketing/dashboard/sales" });
  const { document } = dom.window;
  dom.window.HTMLElement.prototype.getClientRects = () => [{ width: 1, height: 1 }];
  const trigger = document.querySelector(".ant-dropdown-trigger");
  const popup = document.querySelector(".ant-dropdown");
  const parts = {
    left: document.querySelector(".ant-calendar-range-left"),
    right: document.querySelector(".ant-calendar-range-right"),
  };
  const state = { left: { ...leftMonth }, picks: [], clicks: [], navigations: [], displayed: { ...displayed } };
  const monthAt = ({ y, m }, delta) => {
    const index = y * 12 + (m - 1) + delta;
    return { y: Math.floor(index / 12), m: (index % 12) + 1 };
  };
  const dateKey = ({ y, m }, day) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const showDisplayed = () => {
    const dotted = (value) => value.replaceAll("-", ".");
    trigger.textContent = `${dotted(state.displayed.start)} ~ ${dotted(state.displayed.end)}`;
  };
  const pick = (value) => {
    state.clicks.push(value);
    state.picks.push(value);
    render();
  };
  const navigate = (direction) => {
    state.navigations.push(direction);
    state.left = monthAt(state.left, direction === "prev" ? -1 : 1);
    render();
  };
  function renderPanel(part, month, navClass, direction) {
    part.replaceChildren();
    const header = document.createElement("div");
    header.className = "ant-calendar-header";
    const nav = document.createElement("a");
    nav.className = navClass;
    nav.addEventListener("click", () => navigate(direction));
    const year = document.createElement("a");
    year.className = "ant-calendar-year-select";
    year.textContent = `${month.y}년`;
    const monthSelect = document.createElement("a");
    monthSelect.className = "ant-calendar-month-select";
    monthSelect.textContent = `${month.m}월`;
    header.append(nav, year, monthSelect);
    const row = document.createElement("tr");
    const addCell = (className, day, value) => {
      const cell = document.createElement("td");
      cell.className = className;
      const date = document.createElement("div");
      date.className = "ant-calendar-date";
      date.textContent = String(day);
      date.addEventListener("click", () => pick(value));
      cell.append(date);
      row.append(cell);
    };
    // A trailing day of the previous month repeats a real day number.
    addCell("ant-calendar-cell ant-calendar-last-month-cell", 30, dateKey(monthAt(month, -1), 30));
    const days = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
    for (let day = 1; day <= days; day += 1) addCell("ant-calendar-cell", day, dateKey(month, day));
    addCell("ant-calendar-cell ant-calendar-next-month-cell", 1, dateKey(monthAt(month, 1), 1));
    const table = document.createElement("table");
    table.className = "ant-calendar-table";
    table.append(row);
    part.append(header, table);
  }
  function render() {
    renderPanel(parts.left, state.left, "ant-calendar-prev-month-btn", "prev");
    renderPanel(parts.right, monthAt(state.left, 1), "ant-calendar-next-month-btn", "next");
  }
  trigger.addEventListener("click", () => {
    popup.classList.remove("ant-dropdown-hidden");
    render();
  });
  document.querySelector(".ant-btn-primary").addEventListener("click", () => {
    if (state.picks.length >= 2) {
      const [first, second] = state.picks.slice(-2);
      state.displayed = applyRange(first <= second
        ? { start: first, end: second }
        : { start: second, end: first });
    }
    state.picks = [];
    popup.classList.add("ant-dropdown-hidden");
    showDisplayed();
  });
  showDisplayed();
  return { document, state, trigger };
}

function virtualClock() {
  let clock = 0;
  return {
    now: () => clock,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  };
}

test("report range picker selects a 7-day range inside one month and confirms it", async () => {
  const calendar = reportCalendar({
    displayed: { start: "2026-09-08", end: "2026-09-14" },
    leftMonth: { y: 2026, m: 9 },
  });
  const contract = loadContract({ document: calendar.document });

  const selected = await contract.selectReportDateRange("2026-09-07", "2026-09-13", virtualClock());

  assert.equal(selected, true);
  assert.deepEqual(calendar.state.navigations, []);
  assert.deepEqual(calendar.state.clicks, ["2026-09-07", "2026-09-13"]);
  assert.equal(calendar.trigger.textContent, "2026.09.07 ~ 2026.09.13");
});

test("report range picker moves back a month for a range that starts in the previous month", async () => {
  const calendar = reportCalendar({
    displayed: { start: "2026-09-08", end: "2026-09-14" },
    leftMonth: { y: 2026, m: 9 },
  });
  const contract = loadContract({ document: calendar.document });

  const selected = await contract.selectReportDateRange("2026-08-30", "2026-09-05", virtualClock());

  assert.equal(selected, true);
  assert.deepEqual(calendar.state.navigations, ["prev"]);
  assert.deepEqual(calendar.state.clicks, ["2026-08-30", "2026-09-05"], "the previous month's trailing 30 is not clicked");
  assert.equal(calendar.trigger.textContent, "2026.08.30 ~ 2026.09.05");
});

test("report range picker moves forward across a year boundary until both months are visible", async () => {
  const calendar = reportCalendar({
    displayed: { start: "2026-09-08", end: "2026-09-14" },
    leftMonth: { y: 2026, m: 9 },
  });
  const contract = loadContract({ document: calendar.document });

  const selected = await contract.selectReportDateRange("2026-12-29", "2027-01-04", virtualClock());

  assert.equal(selected, true);
  assert.deepEqual(calendar.state.navigations, ["next", "next", "next"]);
  assert.deepEqual(calendar.state.clicks, ["2026-12-29", "2027-01-04"]);
  assert.equal(calendar.trigger.textContent, "2026.12.29 ~ 2027.01.04");
});

test("report range picker picks one day twice for a 1-day range", async () => {
  const calendar = reportCalendar({
    displayed: { start: "2026-09-08", end: "2026-09-14" },
    leftMonth: { y: 2026, m: 8 },
  });
  const contract = loadContract({ document: calendar.document });

  const selected = await contract.selectReportDateRange("2026-09-13", "2026-09-13", virtualClock());

  assert.equal(selected, true);
  assert.deepEqual(calendar.state.clicks, ["2026-09-13", "2026-09-13"]);
  assert.equal(calendar.trigger.textContent, "2026.09.13 ~ 2026.09.13");
});

test("report range picker reports failure when the indicator does not show the picked range", async () => {
  const calendar = reportCalendar({
    displayed: { start: "2026-09-08", end: "2026-09-14" },
    leftMonth: { y: 2026, m: 9 },
    // The page keeps its own preset instead of the picked range.
    applyRange: () => ({ start: "2026-09-08", end: "2026-09-14" }),
  });
  const contract = loadContract({ document: calendar.document, console: { log() {}, warn() {}, error() {} } });

  const selected = await contract.selectReportDateRange("2026-09-07", "2026-09-13", virtualClock());

  assert.equal(selected, false);
  assert.deepEqual(calendar.state.clicks, ["2026-09-07", "2026-09-13"]);
});

// A clock that moves a second every time the page reads it, so a confirmation
// that never succeeds runs out of time without real waiting.
function advancingDate() {
  let clock = Date.parse("2026-09-14T00:00:00.000Z");
  return class AdvancingDate extends Date {
    constructor(...args) {
      super(...(args.length > 0 ? args : [clock]));
    }

    static now() {
      clock += 1000;
      return clock;
    }
  };
}

test("a manual report fails with a scope mismatch when its report range cannot be confirmed", async () => {
  const attemptId = "11111111-1111-4111-8111-111111111111";
  const targetUrl = "https://advertising.coupang.com/marketing/dashboard/sales#kiditemManualReport=2026-09-07_2026-09-13";
  const url = new URL(targetUrl);
  const calendar = reportCalendar({
    displayed: { start: "2026-09-08", end: "2026-09-14" },
    leftMonth: { y: 2026, m: 9 },
    applyRange: () => ({ start: "2026-09-08", end: "2026-09-14" }),
  });
  const control = {
    attemptId,
    state: "RUNNING",
    expiresAt: "2030-01-02T00:00:00.000Z",
    receipts: [],
    pages: [],
    campaigns: [],
    plan: {
      captureMode: "manual_report",
      period: "7d",
      startDate: "2026-09-07",
      endDate: "2026-09-13",
      targetUrl,
      expectedAdvertiserId: "A0001",
      businessDates: ["2026-09-13"],
    },
  };
  const steps = [];
  const runtime = loadContract({
    exposeRuntime: true,
    document: calendar.document,
    location: { href: targetUrl, pathname: url.pathname, search: url.search, hash: url.hash },
    globals: { Date: advancingDate() },
    console: { log() {}, warn() {}, error() {} },
    sendMessage(message, callback) {
      if (message.action === "advertisingCampaignSourceStep") {
        steps.push(message.step);
        callback?.({ success: true, control });
        return;
      }
      callback?.({ success: true });
    },
  });

  const response = await new Promise((resolve) => {
    for (const listener of runtime.messageListeners) {
      listener({
        action: "manualSync",
        collectionRunId: attemptId,
        collectionAttempt: 1,
        environmentId: "local",
        syncMode: "campaign_manual_report",
        campaignControl: control,
      }, {}, resolve);
    }
  });

  assert.equal(response.success, false);
  assert.equal(response.errorCode, "MANUAL_REPORT_SCOPE_MISMATCH");
  assert.equal(response.error, "광고 보고서 기간을 2026-09-07 ~ 2026-09-13로 맞추지 못했습니다.");
  assert.deepEqual(calendar.state.clicks, ["2026-09-07", "2026-09-13"], "the report picked the planned range");
  assert.deepEqual(steps, ["resume"], "nothing was sent to the owner for an unconfirmed range");
});

test("empty target date builds an explicit all-zero daily fact", () => {
  const contract = loadContract();
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.buildCoupangAdsDailyRow(
      "2026-07-01",
      [],
      {},
      { explicitEmpty: true },
    ))),
    {
      date: "2026-07-01",
      adSpend: 0,
      adRevenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      roas: null,
      ctr: null,
      conversionRate: null,
      observedMetrics: {
        adSpend: true,
        adRevenue: true,
        impressions: true,
        clicks: true,
        conversions: true,
        orders: true,
      },
      rowCount: 0,
    },
  );
});

test("observed zero row metrics do not fall back to stale KPI widgets", () => {
  const contract = loadContract();
  const staleKpis = {
    "집행 광고비": { value: "1.2", unit: "만" },
    "광고 전환 매출": { value: "3.4", unit: "만" },
    "노출수": { value: "120", unit: "" },
    "클릭수": { value: "12", unit: "" },
    "전환 판매수": { value: "4", unit: "" },
    "전환 주문수": { value: "3", unit: "" },
  };
  const observedZero = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [{ spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, orders: 0 }],
    staleKpis,
  );
  const unobserved = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [{ productName: "metric fields absent" }],
    staleKpis,
  );

  assert.equal(observedZero.adSpend, 0);
  assert.equal(observedZero.adRevenue, 0);
  assert.equal(observedZero.impressions, 0);
  assert.equal(observedZero.clicks, 0);
  assert.equal(observedZero.conversions, 0);
  assert.equal(observedZero.orders, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(observedZero.observedMetrics)), {
    adSpend: true,
    adRevenue: true,
    impressions: true,
    clicks: true,
    conversions: true,
    orders: true,
  });
  assert.equal(unobserved.adSpend, 12_000);
  assert.equal(unobserved.adRevenue, 34_000);
  assert.equal(unobserved.impressions, 120);
  assert.equal(unobserved.clicks, 12);
  assert.equal(unobserved.conversions, 4);
  assert.equal(unobserved.orders, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(unobserved.observedMetrics)), {
    adSpend: true,
    adRevenue: true,
    impressions: true,
    clicks: true,
    conversions: true,
    orders: true,
  });
});

test("campaign row evidence requires a valid cell and spend falls back when the primary column is blank", () => {
  const contract = loadContract();
  const headers = [
    "집행 광고비",
    "광고비",
    "광고 전환 매출",
    "노출수",
    "클릭수",
    "광고 전환 판매수",
    "광고 전환 주문수",
  ];
  const values = ["", "12,345", "", "error 123", "0", "—", "3"];
  const cells = values.map((innerText) => ({
    innerText,
    querySelector() { return null; },
  }));

  const built = contract.buildCampaignRow(headers, cells);
  assert.equal(built.normalizedRow.runningAdSpend, null);
  assert.equal(built.normalizedRow.spend, 12_345);
  assert.deepEqual(JSON.parse(JSON.stringify(built.normalizedRow._observedMetrics)), {
    adSpend: true,
    adRevenue: false,
    impressions: false,
    clicks: true,
    conversions: false,
    orders: true,
  });

  const daily = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [built.normalizedRow],
    {},
  );
  assert.equal(daily.adSpend, 12_345);
  assert.equal(daily.adRevenue, 0);
  assert.equal(daily.impressions, 0);
  assert.equal(daily.clicks, 0);
  assert.equal(daily.conversions, 0);
  assert.equal(daily.orders, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(daily.observedMetrics)), {
    adSpend: true,
    adRevenue: false,
    impressions: false,
    clicks: true,
    conversions: false,
    orders: true,
  });
});

test("additive row evidence requires every row or an explicit KPI fallback", () => {
  const contract = loadContract();
  const daily = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [
      { clicks: 12 },
      { productName: "second row has no clicks" },
    ],
    {},
  );

  assert.equal(daily.clicks, 0);
  assert.equal(JSON.parse(JSON.stringify(daily.observedMetrics)).clicks, false);
});

test("Korean abbreviated KPI numbers preserve their magnitude", () => {
  const contract = loadContract();

  assert.equal(contract.parseNumber("1.2만"), 12_000);
  assert.equal(contract.parseNumber("3.4억원"), 340_000_000);
  assert.equal(contract.parseNumber("7.5천회"), 7_500);
  assert.equal(contract.parseNumber("₩ 12,345"), 12_345);
  assert.equal(contract.parseNumber(contract.kpiRawValue({ value: "1.2", unit: "만" })), 12_000);
  assert.equal(
    contract.parseNumber(contract.kpiRawValue({ value: "3.4", unit: "억원" })),
    340_000_000,
  );
});

test("zero rows require explicit evidence or a stabilized recognized grid", async () => {
  const contract = loadContract();
  const visibleElement = {
    getAttribute() {
      return null;
    },
    getClientRects() {
      return [{}];
    },
    hidden: false,
    parentElement: null,
    style: {},
  };
  const hiddenParent = {
    getAttribute() {
      return null;
    },
    hidden: true,
    parentElement: null,
    style: {},
  };

  assert.equal(contract.isElementVisible(visibleElement), true);
  assert.equal(
    contract.isElementVisible({ ...visibleElement, parentElement: hiddenParent }),
    false,
  );
  assert.equal(
    contract.isElementVisible({ ...visibleElement, getClientRects: () => [] }),
    false,
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.classifyReportSurfaceEvidence({
      rowCount: 0,
      loadingVisible: true,
      emptyText: "데이터가 없습니다.",
    }))),
    { kind: "loading", explicitEmpty: false },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.classifyReportSurfaceEvidence({
      rowCount: 0,
      loadingVisible: false,
      emptyText: "조회된 데이터가 없습니다.",
    }))),
    {
      kind: "empty",
      explicitEmpty: true,
      emptyText: "조회된 데이터가 없습니다.",
    },
  );

  // 인식된 그리드(헤더 일치)가 있고 로딩도 없는데 행이 0이면 안정화가 필요한
  // implicit empty 후보로 분류한다(AI스마트광고 HUB 처럼 상품 행 없는 캠페인).
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.classifyReportSurfaceEvidence({
      rowCount: 0,
      loadingVisible: false,
      emptyText: "",
      recognizedGrid: true,
    }))),
    {
      kind: "implicit-empty",
      explicitEmpty: false,
      implicitEmpty: true,
      emptyText: "",
    },
  );
  // recognizedGrid 신호가 없으면 기존대로 unknown(그리드 미인식/로딩 가능성 → 더 대기).
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.classifyReportSurfaceEvidence({
      rowCount: 0,
      loadingVisible: false,
      emptyText: "",
      recognizedGrid: false,
    }))),
    { kind: "unknown", explicitEmpty: false },
  );

  const unknown = await contract.collectPaginatedReport({
    maxPages: 1,
    readPage: async () => reportSnapshot(1, 1, [], "unknown"),
  });
  assert.equal(unknown.complete, false);
  assert.equal(unknown.explicitEmpty, false);
  assert.equal(unknown.error, "report_surface_unverified");

  const explicitEmpty = await contract.collectPaginatedReport({
    maxPages: 1,
    readPage: async () => reportSnapshot(1, 1, [], "empty"),
  });
  assert.equal(explicitEmpty.complete, true);
  assert.equal(explicitEmpty.explicitEmpty, true);
  assert.deepEqual([...explicitEmpty.visitedPages], [1]);
  assert.match(source, /targetDate\s*&&\s*collection\.explicitEmpty/);
});

test("empty/loading evidence is scoped to the selected report container", () => {
  const externalEmpty = {
    getAttribute() {
      return null;
    },
    getClientRects() {
      return [{}];
    },
    hidden: false,
    innerText: "데이터가 없습니다.",
    parentElement: null,
    style: {},
  };
  const document = {
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".ant-empty" ? [externalEmpty] : [];
    },
    title: "광고센터",
  };
  const contract = loadContract({ document });
  const unrelatedReportRoot = {
    matches() {
      return false;
    },
    querySelectorAll() {
      return [];
    },
  };
  const actualReportRoot = {
    matches() {
      return false;
    },
    querySelectorAll(selector) {
      return selector === ".ant-empty" ? [externalEmpty] : [];
    },
  };

  // 컨테이너 밖의 empty 문구는 scope 되어 무시된다. 다만 인식된 그리드가 렌더됐고
  // 로딩도 없으므로 implicit empty 후보가 된다 — 명시적 문구는 없으니 emptyText 는
  // 비어 있고 readSettledReportPage 에서 추가 안정화를 거친다.
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.readReportSurfaceState({
      rawRows: [],
      surfaceRoots: [unrelatedReportRoot],
    }))),
    {
      kind: "implicit-empty",
      explicitEmpty: false,
      implicitEmpty: true,
      emptyText: "",
    },
  );
  // 컨테이너 안의 명시적 empty 문구는 그대로 emptyText 로 보존된다.
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.readReportSurfaceState({
      rawRows: [],
      surfaceRoots: [actualReportRoot],
    }))),
    {
      kind: "empty",
      explicitEmpty: true,
      emptyText: "데이터가 없습니다.",
    },
  );
});

test("header-first grid waits for late rows before accepting implicit empty", async () => {
  const contract = loadContract();
  const implicitEmpty = reportSnapshot(1, 1, [], "empty");
  implicitEmpty.surface = {
    kind: "implicit-empty",
    explicitEmpty: false,
    implicitEmpty: true,
    emptyText: "",
  };
  const rows = reportSnapshot(1, 1, ["late-product"]);
  let clock = 0;
  let reads = 0;

  const settled = await contract.readSettledReportPage(2_000, {
    now: () => clock,
    readSnapshot: () => (reads++ < 4 ? implicitEmpty : rows),
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  });

  assert.equal(settled.ok, true);
  assert.equal(settled.surface.kind, "rows");
  assert.deepEqual(
    [...settled.parsed.normalizedRows].map((row) => row.externalId),
    ["late-product"],
  );
});

test("recognized zero-row grid becomes empty only after stable sampling", async () => {
  const contract = loadContract();
  const implicitEmpty = reportSnapshot(1, 1, [], "empty");
  implicitEmpty.surface = {
    kind: "implicit-empty",
    explicitEmpty: false,
    implicitEmpty: true,
    emptyText: "",
  };
  let clock = 0;
  let reads = 0;

  const settled = await contract.readSettledReportPage(2_000, {
    now: () => clock,
    readSnapshot: () => {
      reads += 1;
      return implicitEmpty;
    },
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  });

  assert.equal(settled.ok, true);
  assert.equal(settled.surface.kind, "empty");
  assert.equal(settled.surface.implicitEmpty, true);
  assert.equal(settled.surface.stabilizedEmpty, true);
  assert.ok(reads >= 3);
  assert.ok(clock >= 1_000);
});

test("explicit empty daily result rejects stale additive KPI and accepts clean zero", () => {
  const contract = loadContract();
  const stale = contract.evaluateExplicitEmptyDailyKpis({
    "집행 광고비": { value: "1.2", unit: "만" },
    "광고 전환 매출": { value: "0", unit: "원" },
  });
  const clean = contract.evaluateExplicitEmptyDailyKpis({
    "집행 광고비": { value: "0", unit: "원" },
    "광고 전환 매출": { value: "0", unit: "원" },
    "광고 수익률": { value: "125", unit: "%" },
  });

  assert.equal(stale.consistent, false);
  assert.deepEqual([...stale.nonZeroMetrics], ["adSpend"]);
  assert.equal(stale.additive.adSpend, 12_000);
  assert.equal(clean.consistent, true);
  assert.deepEqual([...clean.nonZeroMetrics], []);
  assert.ok(
    source.indexOf("if (targetDate && collection.explicitEmpty)") <
      source.indexOf("const kpiCount = Object.keys(kpis).length"),
    "explicit empty must be resolved before any KPI/ad_campaign save branch",
  );
});

test("paginated report succeeds only after every expected page is visited", async () => {
  const contract = loadContract();
  const pages = [
    reportSnapshot(1, 2, ["product-1"]),
    reportSnapshot(2, 2, ["product-2"]),
  ];
  let nextIndex = 0;
  const result = await contract.collectPaginatedReport({
    maxPages: 8,
    readPage: async () => pages[0],
    advancePage: async () => ({ ok: true, snapshot: pages[++nextIndex] }),
  });

  assert.equal(result.complete, true);
  assert.equal(result.error, null);
  assert.equal(result.expectedPages, 2);
  assert.deepEqual([...result.visitedPages], [1, 2]);
  assert.deepEqual(
    [...result.normalizedRows].map((row) => row.externalId),
    ["product-1", "product-2"],
  );
});

test("rows wait for a late paginator instead of assuming one page", async () => {
  const contract = loadContract();
  const unverified = reportSnapshot(1, 1, ["product-1"]);
  unverified.pagination.verified = false;
  unverified.pagination.source = "fallback";
  const verified = reportSnapshot(1, 2, ["product-1"]);
  let clock = 0;
  let reads = 0;

  const settled = await contract.readSettledReportPage(1_000, {
    now: () => clock,
    readSnapshot: () => (reads++ < 2 ? unverified : verified),
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  });

  assert.equal(settled.ok, true);
  assert.equal(settled.pagination.verified, true);
  assert.equal(settled.pagination.totalPages, 2);

  clock = 0;
  const timedOut = await contract.readSettledReportPage(500, {
    now: () => clock,
    readSnapshot: () => unverified,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.error, "pagination_unverified");
});

test("same-page duplicate external ids are preserved", async () => {
  const contract = loadContract();
  const result = await contract.collectPaginatedReport({
    maxPages: 1,
    readPage: async () => reportSnapshot(1, 1, ["degraded-id", "degraded-id"]),
  });

  assert.equal(result.complete, true);
  assert.equal(result.rawRows.length, 2);
  assert.equal(result.normalizedRows.length, 2);
});

test("pagination navigation, page limit, and non-increasing page failures are not complete", async (t) => {
  const contract = loadContract();

  await t.test("navigation failure", async () => {
    const result = await contract.collectPaginatedReport({
      maxPages: 8,
      readPage: async () => reportSnapshot(1, 2, ["product-1"]),
      advancePage: async () => ({ ok: false, error: "page_navigation_failed" }),
    });
    assert.equal(result.complete, false);
    assert.equal(result.error, "page_navigation_failed");
    assert.deepEqual([...result.visitedPages], [1]);
  });

  await t.test("page limit", async () => {
    const result = await contract.collectPaginatedReport({
      maxPages: 8,
      readPage: async () => reportSnapshot(1, 9, ["product-1"]),
    });
    assert.equal(result.complete, false);
    assert.equal(result.error, "pagination_limit_exceeded");
    assert.equal(result.expectedPages, 9);
  });

  await t.test("page number did not increase", async () => {
    const first = reportSnapshot(1, 2, ["product-1"]);
    const result = await contract.collectPaginatedReport({
      maxPages: 8,
      readPage: async () => first,
      advancePage: async () => ({ ok: true, snapshot: first }),
    });
    assert.equal(result.complete, false);
    assert.equal(result.error, "page_number_not_increased");
  });
});

test("campaign identity is anchored to href/id so duplicate names remain distinct", () => {
  const contract = loadContract();
  const firstHref = "https://advertising.coupang.com/marketing/campaign/100/product";
  const secondHref = "https://advertising.coupang.com/marketing/campaign/200/product";

  assert.equal(contract.campaignIdFromHref(firstHref), "100");
  assert.equal(contract.campaignIdentityFromHref(firstHref), "campaign:100");
  assert.equal(contract.campaignIdentityFromHref(secondHref), "campaign:200");
  assert.notEqual(
    contract.campaignIdentityFromHref(firstHref),
    contract.campaignIdentityFromHref(secondHref),
  );

  const firstRows = contract.attachCampaignIdentityToRows(
    {
      campaignId: "100",
      identity: "campaign:100",
      href: firstHref,
      name: "동일 캠페인명",
    },
    [{ "상품ID": "product-1" }],
    [{ externalId: "product-1", campaignName: "stale-name" }],
  );
  const secondRows = contract.attachCampaignIdentityToRows(
    {
      campaignId: "200",
      identity: "campaign:200",
      href: secondHref,
      name: "동일 캠페인명",
    },
    [{ "상품ID": "product-1" }],
    [{ externalId: "product-1", campaignName: "stale-name" }],
  );

  assert.equal(firstRows.normalizedRows[0].campaignName, "동일 캠페인명");
  assert.equal(firstRows.normalizedRows[0].campaignId, "100");
  assert.equal(firstRows.normalizedRows[0].campaignIdentity, "campaign:100");
  assert.equal(firstRows.rawRows[0].campaignId, "100");
  assert.equal(firstRows.rawRows[0].campaignIdentity, "campaign:100");
  assert.equal(secondRows.normalizedRows[0].campaignId, "200");
  assert.notEqual(
    firstRows.normalizedRows[0].campaignId,
    secondRows.normalizedRows[0].campaignId,
  );
});

test("campaign href identity accepts only canonical specific Coupang ad URLs", () => {
  const contract = loadContract();
  const first =
    "https://advertising.coupang.com/marketing/campaign/X/product?z=2&campaignId=X&a=1#ignored";
  const reordered =
    "https://advertising.coupang.com/marketing/campaign/X/product?a=1&campaignId=X&z=2#different";

  assert.equal(contract.campaignIdentityFromHref(first), "campaign:X");
  assert.equal(contract.campaignIdentityFromHref(reordered), "campaign:X");
  assert.equal(
    contract.campaignIdentityFromHref("https://example.test/campaign/X"),
    null,
  );
  assert.equal(
    contract.campaignIdentityFromHref(
      "https://advertising.coupang.com.evil.test/campaign/X",
    ),
    null,
  );
  assert.equal(
    contract.campaignIdentityFromHref(
      "http://advertising.coupang.com/campaign/X",
    ),
    null,
  );
  assert.equal(
    contract.campaignIdentityFromHref(
      "https://user@advertising.coupang.com/campaign/X",
    ),
    null,
  );
  assert.equal(
    contract.campaignIdentityFromHref(
      "https://advertising.coupang.com/campaign/#X",
    ),
    null,
  );
});

test("duplicate campaign names are both listed and clicked by href identity", () => {
  const clicked = [];
  const makeRow = (campaignId) => {
    const anchor = {
      href: `https://advertising.coupang.com/marketing/campaign/${campaignId}/product`,
      click() {
        clicked.push(campaignId);
      },
    };
    const title = {
      closest(selector) {
        return selector === "a[href]" ? anchor : null;
      },
      innerText: "동일 캠페인명",
      querySelector() {
        return null;
      },
    };
    const cells = ["동일 캠페인명", "ON", "운영중"].map((innerText) => ({
      innerText,
      querySelector() {
        return null;
      },
    }));
    return {
      querySelector(selector) {
        if (selector === ".dashboard-title") return title;
        if (selector.includes("a[href")) return anchor;
        return null;
      },
      querySelectorAll(selector) {
        return selector === "[role='gridcell']" ? cells : [];
      },
    };
  };
  const rows = [makeRow("100"), makeRow("200")];
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? rows : [];
    },
  };
  const contract = loadContract({
    document: {
      querySelector(selector) {
        return selector.includes(".rt-table") ? grid : null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  const inspection = contract.inspectCampaignsFromDashboard();
  assert.equal(inspection.titledRowCount, 2);
  assert.equal(inspection.missingIdentityNames.length, 0);
  assert.deepEqual(
    [...inspection.campaigns].map((campaign) => campaign.identity),
    ["campaign:100", "campaign:200"],
  );
  assert.equal(contract.clickCampaignAnchor(inspection.campaigns[0]), true);
  assert.equal(contract.clickCampaignAnchor(inspection.campaigns[1]), true);
  assert.deepEqual(clicked, ["100", "200"]);
});

test("current dashboard linkless campaign anchor is clicked before provider identity is accepted", async () => {
  const clicked = [];
  const location = {
    href: "https://advertising.coupang.com/marketing/dashboard/sales",
    pathname: "/marketing/dashboard/sales",
    search: "",
    hash: "",
  };
  const makeRow = (rowIndex) => {
    const name = "동일 캠페인명";
    const anchor = {
      innerText: name,
      getAttribute() {
        return null;
      },
      closest(selector) {
        return selector === "a" ? this : null;
      },
      querySelector() {
        return null;
      },
      click() {
        clicked.push(rowIndex);
        location.href =
          `https://advertising.coupang.com/marketing/dashboard/sales/` +
          `campaign/${100 + rowIndex}/group/${300 + rowIndex}/product` +
          "?internalChannel=click_campaign_name";
      },
    };
    const cells = [`${name}수정삭제`, "ON", "운영중"].map((innerText) => ({
      innerText,
      textContent: innerText,
      querySelector() {
        return null;
      },
    }));
    return {
      querySelector(selector) {
        if (selector === "[data-bigfoot-component='campaign_name'] a") {
          return anchor;
        }
        return null;
      },
      querySelectorAll(selector) {
        return selector === "[role='gridcell']" ? cells : [];
      },
    };
  };
  const rows = [makeRow(0), makeRow(1)];
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? rows : [];
    },
  };
  const contract = loadContract({
    location,
    document: {
      querySelector(selector) {
        return selector.includes(".rt-table") ? grid : null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  const inspection = contract.inspectCampaignsFromDashboard();
  assert.equal(inspection.titledRowCount, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(inspection.missingIdentityNames)),
    ["동일 캠페인명", "동일 캠페인명"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(inspection.campaigns.map((campaign) => ({
      identity: campaign.identity,
      name: campaign.name,
      rowIndex: campaign.rowIndex,
      requiresIdentityProbe: campaign.requiresIdentityProbe,
    })))),
    [
      {
        identity: null,
        name: "동일 캠페인명",
        rowIndex: 0,
        requiresIdentityProbe: true,
      },
      {
        identity: null,
        name: "동일 캠페인명",
        rowIndex: 1,
        requiresIdentityProbe: true,
      },
    ],
  );
  assert.equal(contract.campaignIdentityCoverage(inspection).complete, true);
  const probe = await contract.probeCampaignIdentityByNavigation(
    inspection.campaigns[1],
  );
  assert.deepEqual(clicked, [1]);
  assert.equal(probe.ok, true);
  assert.equal(probe.navigated, true);
  assert.equal(probe.campaign.identity, "campaign:101");
  assert.equal(probe.campaign.campaignId, "101");
  assert.equal(probe.campaign.requiresIdentityProbe, false);
  assert.equal(
    probe.campaign.discoveredByNavigation,
    true,
    "same-document navigation must retain the linkless dashboard origin",
  );
  const completedNavigationKeys = new Set();
  assert.equal(
    contract.persistTerminalLinklessNavigation(
      probe.campaign,
      completedNavigationKeys,
    ),
    inspection.campaigns[1].navigationKey,
  );
  assert.match(probe.campaign.href, /\/campaign\/101\/group\/301\/product/);
  assert.equal(
    contract.campaignUsesDetailReport({
      ...probe.campaign,
      onOff: "OFF",
    }),
    true,
  );
  assert.notEqual(
    contract.campaignAttemptKey(inspection.campaigns[0]),
    contract.campaignAttemptKey(inspection.campaigns[1]),
  );
  assert.notEqual(
    contract.campaignAttemptKey(inspection.campaigns[0]),
    contract.campaignAttemptKey({
      ...inspection.campaigns[0],
      navigationKey: undefined,
      pageNumber: 2,
    }),
  );
});

test("linkless AI smart campaign stays roster-only without identity navigation", () => {
  let clickCount = 0;
  const name = "AI스마트광고(wing)";
  const anchor = {
    innerText: name,
    getAttribute(attribute) {
      return attribute === "href" ? "" : null;
    },
    closest(selector) {
      return selector === "a" ? this : null;
    },
    querySelector() {
      return null;
    },
    click() {
      clickCount += 1;
    },
  };
  const cells = [`${name}수정삭제`, "ON", "운영중"].map((innerText) => ({
    innerText,
    textContent: innerText,
    querySelector() {
      return null;
    },
  }));
  const row = {
    querySelector(selector) {
      return selector === "[data-bigfoot-component='campaign_name'] a"
        ? anchor
        : null;
    },
    querySelectorAll(selector) {
      return selector === "[role='gridcell']" ? cells : [];
    },
  };
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? [row] : [];
    },
  };
  const contract = loadContract({
    document: {
      querySelector(selector) {
        return selector.includes(".rt-table") ? grid : null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  const inspection = contract.inspectCampaignsFromDashboard();

  assert.deepEqual(JSON.parse(JSON.stringify(inspection.campaigns)), []);
  assert.deepEqual(
    JSON.parse(JSON.stringify(inspection.rawOnlyCampaigns)),
    [{
      rowIndex: 0,
      name,
      onOff: "ON",
      status: "운영중",
      cells: [`${name}수정삭제`, "ON", "운영중"],
    }],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignIdentityCoverage(inspection))),
    { complete: true, error: null, missingCount: 1, rawOnlyCount: 1 },
  );
  assert.equal(clickCount, 0);
});

test("AI스마트광고(HUB) automated campaigns skip detail collection and are handled roster-only", () => {
  const contract = loadContract();
  // 자동화 광고(AI스마트광고/HUB)는 상세에 상품별 일별 실적이 없어 상세 진입 시
  // sweep 이 "진행 31/279 같은 위치에서 반복되어 중단"으로 막혔다. 이름으로 감지해
  // 상세 없이 roster 만 저장(metadata-only)하고 넘어간다.
  assert.equal(
    contract.campaignUsesDetailReport({ name: "AI스마트광고(HUB)", hasDetailHref: true }),
    false,
  );
  assert.equal(
    contract.campaignUsesDetailReport({ name: "AI 스마트 광고", hasDetailHref: true }),
    false,
  );
  // 일반 캠페인은 그대로 상세 수집.
  assert.equal(
    contract.campaignUsesDetailReport({ name: "쿠팡윙 집중광고", hasDetailHref: true }),
    true,
  );
  assert.equal(
    contract.campaignUsesDetailReport({ name: "매출 TOP 제품", hasDetailHref: true }),
    true,
  );
  // 상세 URL 자체가 없는 캠페인은 여전히 metadata-only.
  assert.equal(
    contract.campaignUsesDetailReport({ name: "상세없음", hasDetailHref: false }),
    false,
  );
});

test("a linkless probe failure is reconciled by its navigation key after provider identity resolves", () => {
  const contract = loadContract();
  const pending = {
    identity: null,
    navigationKey: "dashboard-campaign\u001f1\u001f0\u001f캠페인",
    name: "캠페인",
  };
  const failed = contract.reconcileCampaignFailureState(
    [],
    pending,
    "campaign_identity_navigation_timeout",
  );

  assert.equal(failed.failed, 1);
  assert.equal(failed.errors[0].identity, undefined);
  assert.equal(failed.errors[0].navigationKey, pending.navigationKey);

  const resolved = contract.campaignWithIdentityFromHref(
    pending,
    "https://advertising.coupang.com/marketing/dashboard/sales/campaign/200/group/300/product",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(
      contract.reconcileCampaignFailureState(failed.errors, resolved),
    )),
    { errors: [], failed: 0 },
  );
});

test("a linkless campaign resumes from its full-document detail URL", () => {
  const values = new Map();
  const sessionStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  const contract = loadContract({ sessionStorage });
  const pending = {
    identity: null,
    campaignId: null,
    href: "",
    hasDetailHref: null,
    requiresIdentityProbe: true,
    navigationKey: "dashboard-campaign\u001f1\u001f2\u001f쿠팡윙 집중광고",
    pageNumber: 1,
    rowIndex: 2,
    name: "쿠팡윙 집중광고",
    onOff: "ON",
    status: "운영 중",
  };
  const detailUrl =
    "https://advertising.coupang.com/marketing/dashboard/sales/" +
    "campaign/102284299/group/202471278/product?internalChannel=click_campaign_name";

  assert.equal(contract.savePendingCampaignNavigation(pending), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignResumedFromDetailHref(detailUrl))),
    {
      ...pending,
      campaignId: "102284299",
      href: detailUrl,
      identity: "campaign:102284299",
      hasDetailHref: true,
      discoveredByNavigation: true,
      requiresIdentityProbe: false,
    },
  );

  contract.clearPendingCampaignNavigation();
  assert.equal(contract.loadPendingCampaignNavigation(), null);
  assert.equal(contract.campaignResumedFromDetailHref(detailUrl), null);
});

test("linkless campaign identity probes expose a row-unique progress label before full-document navigation", () => {
  const contract = loadContract();
  const first = {
    name: "동일 캠페인명",
    pageNumber: 1,
    rowIndex: 0,
  };
  const second = {
    name: "동일 캠페인명",
    pageNumber: 1,
    rowIndex: 1,
  };

  assert.equal(
    contract.campaignIdentityProbeProgressLabel(first),
    "동일 캠페인명 · 상세 식별 이동 (1페이지 1행)",
  );
  assert.equal(
    contract.campaignIdentityProbeProgressLabel(second),
    "동일 캠페인명 · 상세 식별 이동 (1페이지 2행)",
  );
  assert.notEqual(
    contract.campaignIdentityProbeProgressLabel(first),
    contract.campaignIdentityProbeProgressLabel(second),
  );

  const reportIndex = source.indexOf(
    "label: campaignIdentityProbeProgressLabel(camp)",
  );
  const probeIndex = source.indexOf(
    "await probeCampaignIdentityByNavigation(camp, 20000)",
  );
  assert.ok(reportIndex >= 0, "identity-probe progress must be reported");
  assert.ok(probeIndex >= 0, "identity navigation call must exist");
  assert.ok(
    reportIndex < probeIndex,
    "identity-probe progress must be persisted before navigation can unload the document",
  );
});

test("dashboard row whose anchor resolves to the list remains raw-only while identified rows stay collectible", () => {
  const makeRow = ({ name, href }) => {
    const anchor = {
      href,
      getAttribute() {
        return href;
      },
    };
    const title = {
      closest(selector) {
        return selector === "a[href]" ? anchor : null;
      },
      innerText: name,
      querySelector() {
        return null;
      },
    };
    const cells = [name, "ON", "운영중"].map((innerText) => ({
      innerText,
      textContent: innerText,
      querySelector() {
        return null;
      },
    }));
    return {
      querySelector(selector) {
        if (selector === ".dashboard-title") return title;
        if (selector.includes("a[href")) return anchor;
        return null;
      },
      querySelectorAll(selector) {
        return selector === "[role='gridcell']" ? cells : [];
      },
    };
  };
  const rows = [
    makeRow({
      name: "일반 캠페인",
      href: "https://advertising.coupang.com/marketing/campaign/100/product",
    }),
    makeRow({
      name: "AI스마트광고(wing)",
      href: "https://advertising.coupang.com/marketing/dashboard/sales",
    }),
  ];
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? rows : [];
    },
  };
  const contract = loadContract({
    document: {
      querySelector(selector) {
        return selector.includes(".rt-table") ? grid : null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  const inspection = contract.inspectCampaignsFromDashboard();
  assert.deepEqual(
    JSON.parse(JSON.stringify(
      inspection.campaigns.map((campaign) => campaign.identity),
    )),
    ["campaign:100"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(inspection.missingIdentityNames)),
    ["AI스마트광고(wing)"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(
      inspection.rawOnlyCampaigns.map((campaign) => ({
        name: campaign.name,
        onOff: campaign.onOff,
        status: campaign.status,
      })),
    )),
    [{ name: "AI스마트광고(wing)", onOff: "ON", status: "운영중" }],
  );
  assert.equal(contract.campaignIdentityCoverage(inspection).complete, true);
});

test("empty placeholder href does not become a raw-only campaign through URL resolution", () => {
  const resolvedDashboardHref =
    "https://advertising.coupang.com/marketing/dashboard/sales";
  const anchor = {
    href: resolvedDashboardHref,
    getAttribute(name) {
      return name === "href" ? "" : null;
    },
  };
  const title = {
    closest(selector) {
      return selector === "a[href]" ? anchor : null;
    },
    innerText: "링크 로딩 중 캠페인",
    querySelector() {
      return null;
    },
  };
  const cells = ["링크 로딩 중 캠페인", "ON", "운영중"].map((innerText) => ({
    innerText,
    textContent: innerText,
    querySelector() {
      return null;
    },
  }));
  const row = {
    querySelector(selector) {
      if (selector === ".dashboard-title") return title;
      if (selector.includes("a[href")) return anchor;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[role='gridcell']" ? cells : [];
    },
  };
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? [row] : [];
    },
  };
  const contract = loadContract({
    document: {
      querySelector(selector) {
        return selector.includes(".rt-table") ? grid : null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  const inspection = contract.inspectCampaignsFromDashboard();
  assert.equal(inspection.rawOnlyCampaigns.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignIdentityCoverage(inspection))),
    {
      complete: false,
      error: "campaign_identity_missing",
      missingCount: 1,
      rawOnlyCount: 0,
    },
  );
});

test("dashboard row with no anchor still fails closed as possible DOM drift", () => {
  const title = {
    closest() {
      return null;
    },
    innerText: "일반 캠페인",
    querySelector() {
      return null;
    },
  };
  const cells = ["일반 캠페인", "ON", "운영중"].map((innerText) => ({
    innerText,
    textContent: innerText,
    querySelector() {
      return null;
    },
  }));
  const row = {
    querySelector(selector) {
      return selector === ".dashboard-title" ? title : null;
    },
    querySelectorAll(selector) {
      return selector === "[role='gridcell']" ? cells : [];
    },
  };
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? [row] : [];
    },
  };
  const contract = loadContract({
    document: {
      querySelector(selector) {
        return selector.includes(".rt-table") ? grid : null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  const inspection = contract.inspectCampaignsFromDashboard();
  assert.equal(inspection.rawOnlyCampaigns.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignIdentityCoverage(inspection))),
    {
      complete: false,
      error: "campaign_identity_missing",
      missingCount: 1,
      rawOnlyCount: 0,
    },
  );
});

test("campaign detail requires matching identity and rows or explicit empty-state", () => {
  const contract = loadContract();
  const ready = {
    onDashboardList: false,
    identityMatches: true,
    hasDashboardCampaignRows: false,
    surfaceKind: "rows",
  };

  assert.equal(contract.campaignDetailReady(ready), true);
  assert.equal(contract.campaignDetailReady({ ...ready, surfaceKind: "empty" }), true);
  assert.equal(contract.campaignDetailReady({ ...ready, surfaceKind: "loading" }), false);
  assert.equal(contract.campaignDetailReady({ ...ready, identityMatches: false }), false);
  assert.equal(contract.campaignDetailReady({ ...ready, hasDashboardCampaignRows: true }), false);
});

test("dashboard campaign rows fail closed only when missing identity evidence is not preserved", () => {
  const contract = loadContract();

  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignIdentityCoverage({
      campaigns: [{ identity: "campaign:100" }],
      titledRowCount: 2,
      missingIdentityNames: ["href 없는 캠페인"],
    }))),
    {
      complete: false,
      error: "campaign_identity_missing",
      missingCount: 1,
      rawOnlyCount: 0,
    },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignIdentityCoverage({
      campaigns: [
        { identity: "campaign:100", name: "동일 캠페인명" },
        { identity: "campaign:200", name: "동일 캠페인명" },
      ],
      titledRowCount: 2,
      missingIdentityNames: [],
      rawOnlyCampaigns: [],
    }))),
    { complete: true, error: null, missingCount: 0, rawOnlyCount: 0 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignIdentityCoverage({
      campaigns: [{ identity: "campaign:100" }],
      titledRowCount: 2,
      missingIdentityNames: ["AI스마트광고"],
      rawOnlyCampaigns: [{ name: "AI스마트광고" }],
    }))),
    { complete: true, error: null, missingCount: 1, rawOnlyCount: 1 },
  );
});

test("campaign without provider identity is preserved as raw-only evidence without inventing an identity", () => {
  const contract = loadContract();
  const rawOnly = {
    rowIndex: 2,
    name: "AI스마트광고(wing)",
    onOff: "ON",
    status: "운영중",
    cells: ["AI스마트광고(wing)", "ON", "운영중"],
  };
  const rows = contract.buildDashboardRawOnlyRows([rawOnly]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(rows.rawRows)),
    [{
      campaignName: "AI스마트광고(wing)",
      dashboardOnOff: "ON",
      dashboardStatus: "운영중",
      dashboardCells: ["AI스마트광고(wing)", "ON", "운영중"],
      _campaignOnly: true,
      _rawOnly: true,
    }],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(rows.normalizedRows)),
    [{
      pageType: "campaign",
      campaignId: null,
      campaignIdentity: null,
      campaignName: "AI스마트광고(wing)",
      onOff: "ON",
      status: "운영중",
      _campaignOnly: true,
      _rawOnly: true,
    }],
  );
  assert.equal(
    contract.dashboardRawOnlyKey(rawOnly, 3),
    contract.dashboardRawOnlyKey({ ...rawOnly }, 3),
  );
  assert.notEqual(
    contract.dashboardRawOnlyKey(rawOnly, 3),
    contract.dashboardRawOnlyKey(rawOnly, 4),
  );
});

test("raw-only campaign completion remains visible as a warning label", () => {
  const contract = loadContract();

  assert.equal(
    contract.dashboardSweepCompletionLabel(0, 2),
    "광고 동기화 완료 · 2개는 식별자 없어 원본만 보존",
  );
  assert.equal(
    contract.dashboardSweepCompletionLabel(0, 0),
    "광고 동기화 완료",
  );
  assert.equal(
    contract.dashboardSweepCompletionLabel(1, 2),
    "일부 캠페인 동기화 실패",
  );
});

test("campaign is completed only after save and failed in-flight work retries after reload", () => {
  const contract = loadContract();
  const campaigns = [
    { identity: "campaign:100" },
    { identity: "campaign:200" },
  ];
  const completedSeen = new Set();
  const attemptedThisRun = new Set(["campaign:100"]);

  assert.deepEqual(
    [...contract.filterPendingCampaigns(campaigns, completedSeen, attemptedThisRun)]
      .map((campaign) => campaign.identity),
    ["campaign:200"],
  );
  assert.deepEqual(
    [...contract.filterPendingCampaigns(campaigns, completedSeen, new Set())]
      .map((campaign) => campaign.identity),
    ["campaign:100", "campaign:200"],
    "reload clears only in-flight attempts, so an unsaved campaign is retried",
  );
  completedSeen.add("campaign:100");
  assert.deepEqual(
    [...contract.filterPendingCampaigns(campaigns, completedSeen, new Set())]
      .map((campaign) => campaign.identity),
    ["campaign:200"],
    "a server-saved campaign stays completed across reload",
  );
  const saveIndex = source.lastIndexOf("if (json?.success)");
  assert.ok(source.indexOf("seen.add(camp.identity)", saveIndex) > saveIndex);
  assert.ok(source.indexOf("saveSeen(seen)", saveIndex) > saveIndex);
});

test("a persisted linkless campaign navigation key is skipped after dashboard reload", () => {
  const values = new Map();
  const contract = loadContract({
    sessionStorage: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      removeItem(key) {
        values.delete(key);
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
    },
  });
  const navigationKey =
    "dashboard-campaign\u001f1\u001f0\u001f링크 없는 캠페인";
  const campaign = {
    identity: null,
    name: "링크 없는 캠페인",
    navigationKey,
    requiresIdentityProbe: true,
  };

  assert.deepEqual(
    contract.filterPendingCampaigns(
      [campaign],
      new Set(["campaign:100"]),
      new Set(),
      new Set(),
    ),
    [campaign],
    "provider identity alone cannot match a linkless row after reload",
  );
  const terminalKeys = new Set();
  assert.equal(
    contract.persistTerminalLinklessNavigation(campaign, terminalKeys),
    navigationKey,
  );
  assert.deepEqual(
    contract.filterPendingCampaigns(
      [campaign],
      new Set(["campaign:100"]),
      new Set(),
      terminalKeys,
    ),
    [],
    "the terminal linkless row stays completed across reload",
  );
  assert.deepEqual(
    JSON.parse(
      values.get("kiditem_ad_sweep_completed_navigation_keys_v1"),
    ),
    [navigationKey],
  );
});

test("a pending linkless campaign returned to the dashboard becomes terminal and the next row remains collectible", () => {
  const values = new Map();
  const sessionStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  const contract = loadContract({
    location: {
      href:
        "https://advertising.coupang.com/marketing/dashboard/sales" +
        "#kiditemAdSync=1",
      pathname: "/marketing/dashboard/sales",
      search: "",
      hash: "#kiditemAdSync=1",
    },
    sessionStorage,
  });
  const firstKey =
    "dashboard-campaign\u001f1\u001f0\u001f첫 캠페인";
  const secondKey =
    "dashboard-campaign\u001f1\u001f1\u001f두 번째 캠페인";
  const thirdKey =
    "dashboard-campaign\u001f1\u001f2\u001f세 번째 캠페인";
  const first = {
    identity: "campaign:100",
    name: "첫 캠페인",
    navigationKey: firstKey,
    discoveredByNavigation: true,
    requiresIdentityProbe: false,
  };
  const second = {
    identity: null,
    name: "두 번째 캠페인",
    navigationKey: secondKey,
    pageNumber: 1,
    rowIndex: 1,
    discoveredByNavigation: true,
    requiresIdentityProbe: true,
  };
  const third = {
    identity: null,
    name: "세 번째 캠페인",
    navigationKey: thirdKey,
    pageNumber: 1,
    rowIndex: 2,
    requiresIdentityProbe: true,
  };
  const completedNavigationKeys = new Set([firstKey]);

  assert.equal(contract.savePendingCampaignNavigation(second), true);
  const handoff = contract.campaignNavigationHandoff(
    "https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1",
  );
  assert.equal(handoff.state, "returned_to_dashboard");
  assert.equal(handoff.campaign.navigationKey, secondKey);

  assert.equal(
    contract.persistTerminalLinklessNavigation(
      handoff.campaign,
      completedNavigationKeys,
    ),
    secondKey,
  );
  contract.clearPendingCampaignNavigation();
  const failure = contract.reconcileCampaignFailureState(
    [],
    handoff.campaign,
    "campaign_identity_navigation_returned_to_dashboard",
  );
  const failedWorkKeys = contract.unresolvedCampaignWorkKeys(failure.errors);

  assert.deepEqual(
    JSON.parse(
      values.get("kiditem_ad_sweep_completed_navigation_keys_v1"),
    ),
    [firstKey, secondKey],
  );
  assert.equal(contract.loadPendingCampaignNavigation(), null);
  assert.deepEqual(
    contract.filterPendingCampaigns(
      [second, third],
      new Set([first.identity]),
      new Set(),
      completedNavigationKeys,
    ),
    [third],
    "dashboard reload must skip the terminal second row and continue with the third",
  );
  assert.equal(
    contract.campaignDateWorkUnits({
      completedCampaignDateKeys: new Set(),
      completedCampaignIdentities: new Set([first.identity]),
      failedCampaignKeys: failedWorkKeys,
      rawOnlyCampaignCount: 0,
    }),
    62,
    "one completed and one terminally failed campaign advances 31-day work from 31 to 62",
  );
});

test("a linkless detail handoff can be terminalized after detail readiness fails", () => {
  const values = new Map();
  const sessionStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  const contract = loadContract({ sessionStorage });
  const pending = {
    identity: null,
    name: "상세 실패 캠페인",
    navigationKey:
      "dashboard-campaign\u001f1\u001f1\u001f상세 실패 캠페인",
    pageNumber: 1,
    rowIndex: 1,
    requiresIdentityProbe: true,
  };
  const detailUrl =
    "https://advertising.coupang.com/marketing/dashboard/sales/" +
    "campaign/200/group/300/product";
  const terminalKeys = new Set();

  contract.savePendingCampaignNavigation(pending);
  const handoff = contract.campaignNavigationHandoff(detailUrl);
  assert.equal(handoff.state, "detail");
  assert.equal(handoff.campaign.identity, "campaign:200");
  assert.equal(
    contract.persistTerminalLinklessNavigation(
      handoff.campaign,
      terminalKeys,
    ),
    pending.navigationKey,
  );
  const failure = contract.reconcileCampaignFailureState(
    [],
    handoff.campaign,
    "campaign_detail_identity_or_surface_timeout",
  );

  assert.equal(terminalKeys.has(pending.navigationKey), true);
  assert.equal(failure.failed, 1);
  assert.equal(
    contract.campaignDateWorkUnits({
      completedCampaignDateKeys: new Set(),
      completedCampaignIdentities: new Set(),
      failedCampaignKeys: contract.unresolvedCampaignWorkKeys(failure.errors),
      rawOnlyCampaignCount: 0,
    }),
    31,
  );
});

test("successful resume clears the prior campaign error and recalculates failed", () => {
  const contract = loadContract();
  const campaign = { identity: "campaign:100", name: "재시도 캠페인" };
  const loadedErrors = contract.normalizeSweepErrors([
    { identity: "campaign:100", name: campaign.name, error: "first timeout" },
    { identity: "campaign:100", name: campaign.name, error: "latest timeout" },
  ]);

  assert.equal(loadedErrors.length, 1, "the resumed campaign has one unresolved failure");
  assert.equal(loadedErrors[0].error, "latest timeout");

  const resumedSuccess = contract.reconcileCampaignFailureState(
    loadedErrors,
    campaign,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(resumedSuccess)), {
    errors: [],
    failed: 0,
  });
  assert.equal(resumedSuccess.failed === 0, true, "the final sweep can return success");

  const saveIndex = source.lastIndexOf("if (json?.success)");
  const reconciliationIndex = source.indexOf(
    "reconcileCampaignFailureState(errors, camp)",
    saveIndex,
  );
  const syncedIndex = source.indexOf("synced++;", saveIndex);
  assert.ok(reconciliationIndex > saveIndex && reconciliationIndex < syncedIndex);
  assert.match(source, /let failed = errors\.length;/);
});

test("a day-level campaign failure is left for the end-of-sweep retry instead of ending the sweep", () => {
  const contract = loadContract();
  const campaign = {
    identity: "campaign:100",
    name: "부분 수집 캠페인",
    navigationKey: "dashboard-campaign\u001f1\u001f1\u001f부분 수집 캠페인",
    requiresIdentityProbe: true,
  };
  const failure = contract.reconcileCampaignFailureState(
    [],
    campaign,
    "date_picker_failed",
    { businessDate: "2026-07-06", retryable: true },
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.unresolvedCampaignWorkKeys(failure.errors))),
    [],
    "retryable missing dates must not count as terminal campaign work",
  );

  const failureBranchStart = source.indexOf("} else if (campaignFailure) {");
  const dashboardReturnStart = source.indexOf(
    "// 2e) 대시보드로 복귀",
    failureBranchStart,
  );
  const failureBranch = source.slice(failureBranchStart, dashboardReturnStart);
  assert.ok(failureBranchStart > 0 && dashboardReturnStart > failureBranchStart);
  assert.match(failureBranch, /retryable: true/);
  assert.match(failureBranch, /recordCampaignFailure\(/);
  assert.doesNotMatch(failureBranch, /return \{/, "the sweep moves on to the next campaign");
});

test("content waits through the extension worker instead of a throttled page timer", async () => {
  let pendingDelay = null;
  const contract = loadContract({
    sendMessage(message, callback) {
      if (message?.action === "waitForAdCollectorDelay") {
        pendingDelay = { message, callback };
        return;
      }
      callback?.({ success: true });
    },
  });

  const waiting = contract.sleep(600);
  assert.deepEqual(
    JSON.parse(JSON.stringify(pendingDelay?.message)),
    { action: "waitForAdCollectorDelay", milliseconds: 600 },
  );
  pendingDelay.callback({ success: true });
  await waiting;
});

test("successful sweep clears a prior dashboard identity error but keeps unresolved campaign errors", () => {
  const contract = loadContract();
  const remaining = contract.clearResolvedDashboardSweepErrors([
    { name: "_dashboard", error: "campaign_identity_missing" },
    {
      identity: "campaign:100",
      name: "일반 캠페인",
      error: "date_picker_failed",
    },
  ]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(remaining)),
    [{
      identity: "campaign:100",
      name: "일반 캠페인",
      error: "date_picker_failed",
    }],
  );
});

test("the campaign failure reason names a few campaigns and the latest Coupang alert within the owner's limit", () => {
  const contract = loadContract();
  const errors = ["A 캠페인", "B 캠페인", "C 캠페인", "D 캠페인", "E 캠페인"].map((name, index) => ({
    identity: `campaign:${index + 1}`,
    name,
    error: "campaign_detail_identity_or_surface_timeout",
    ...(index === 3 ? { dialogKind: "alert", dialogMessage: "일시적인 오류가 발생했습니다." } : {}),
  }));

  assert.equal(
    contract.campaignSweepFailureReason(errors),
    "쿠팡 광고 캠페인 5개를 불러오지 못했습니다: A 캠페인, B 캠페인, C 캠페인 외 2개. 쿠팡 알림: '일시적인 오류가 발생했습니다.'",
  );
  assert.equal(
    contract.campaignSweepFailureReason([{ identity: "campaign:1", name: "A", error: "x" }]),
    "쿠팡 광고 캠페인 1개를 불러오지 못했습니다: A.",
  );
  const bounded = contract.campaignSweepFailureReason(errors.map((entry) => ({
    ...entry,
    name: "긴".repeat(200),
    dialogKind: "confirm",
    dialogMessage: "알림".repeat(200),
  })));
  assert.ok(bounded.length <= 300, `the owner failure message allows 300 characters, got ${bounded.length}`);
});

test("dashboard sweep failures read as Korean reasons and quote the Coupang dialog", () => {
  const contract = loadContract();

  assert.equal(
    contract.dashboardSweepErrorReason("dashboard_next_page_not_loaded", { kind: "alert", message: "세션이 만료되었습니다." }),
    "쿠팡 광고 대시보드의 다음 페이지를 불러오지 못했습니다. 쿠팡 알림: '세션이 만료되었습니다.'",
  );
  assert.equal(
    contract.dashboardSweepErrorReason("dashboard_return_after_identity_probe_failed", { kind: "confirm", message: "이동할까요?" }),
    "쿠팡 광고 캠페인 화면에서 대시보드로 돌아오지 못했습니다. 쿠팡 확인 창: '이동할까요?'",
  );
  for (const code of [
    "campaign_identity_missing",
    "dashboard_pagination_unverified",
    "dashboard_page_navigation_failed",
    "dashboard_page_number_not_increased",
    "dashboard_pagination_limit_exceeded",
    "an_unknown_failure",
    "constructor",
  ]) {
    const reason = contract.dashboardSweepErrorReason(code);
    assert.equal(typeof reason, "string", code);
    assert.doesNotMatch(reason, /[a-z]+_[a-z]+/, `${code} must not reach the screen as an English code`);
  }

  const sweepErrorReturn = source.slice(
    source.indexOf("if (sweepError) {"),
    source.indexOf("if (totalDiscovered === 0 && rawOnlyCampaigns === 0)"),
  );
  assert.match(
    sweepErrorReturn,
    /const sweepErrorReason = dashboardSweepErrorReason\(sweepError, sweepDialog\);[\s\S]*error: sweepErrorReason,/,
  );
});

test("only a campaign with no detail report gets a metadata-only envelope", () => {
  const contract = loadContract();
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.buildCampaignReportAuthorityEnvelope(
      { name: "No detail", onOff: "OFF", hasDetailHref: false },
      "2026-07-17",
    ))),
    { campaignReportScope: "single_campaign_metadata_raw" },
  );
});

test("an OFF campaign with a verified detail report is authoritative for one exact day", () => {
  const contract = loadContract();
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.buildCampaignReportAuthorityEnvelope(
      { name: "Recently paused", onOff: "OFF", hasDetailHref: true },
      "2026-07-17",
    ))),
    {
      campaignReportScope: "single_campaign_authoritative",
      period: "1d",
      periodLabel: "2026-07-17",
      startDate: "2026-07-17",
      endDate: "2026-07-17",
      dateFrom: "2026-07-17",
      dateTo: "2026-07-17",
    },
  );
});

test("campaign daily window contains 31 exact business dates ending yesterday", () => {
  const contract = loadContract();
  const dates = [
    ...contract.buildRollingCampaignBusinessDates("2026-03-01"),
  ];

  assert.equal(dates.length, 31);
  assert.equal(dates[0], "2026-03-01");
  assert.equal(dates[1], "2026-02-28");
  assert.equal(dates.at(-1), "2026-01-30");
  assert.equal(new Set(dates).size, 31);

  const leapDates = [
    ...contract.buildRollingCampaignBusinessDates("2024-03-01", 3),
  ];
  assert.deepEqual(leapDates, [
    "2024-03-01",
    "2024-02-29",
    "2024-02-28",
  ]);
});

test("profitability slices accept a contiguous server-owned window of at most 31 days", () => {
  const contract = loadContract();
  const slice = contract.normalizeProfitabilitySlice({
    sliceId: "2025-06-27_2025-06-29",
    startDate: "2025-06-27",
    endDate: "2025-06-29",
    businessDates: ["2025-06-27", "2025-06-28", "2025-06-29"],
  });

  assert.deepEqual({ ...slice }, {
    sliceId: "2025-06-27_2025-06-29",
    startDate: "2025-06-27",
    endDate: "2025-06-29",
    businessDates: ["2025-06-27", "2025-06-28", "2025-06-29"],
  });
  assert.equal(contract.normalizeProfitabilitySlice({
    startDate: "2025-06-27",
    endDate: "2025-06-29",
    businessDates: ["2025-06-27", "2025-06-29"],
  }), null);
});

test("profitability manual sync keeps the owner plan only in its live message", () => {
  assert.doesNotMatch(
    source,
    /PROFITABILITY_SLICE_KEY|saveProfitabilitySlice|loadProfitabilitySlice/,
  );
  assert.match(
    source,
    /runSyncOnce\(msg\.syncMode, msg\.environmentId, \{\s*profitabilitySlice: msg\.profitabilitySlice,\s*profitabilityAccount: msg\.profitabilityAccount,/,
  );
  assert.match(
    source,
    /KidItemProfitabilityReport\.run\(\{\s*profitabilitySlice: profitabilityInput\?\.profitabilitySlice \|\| null,\s*profitabilityAccount: profitabilityInput\?\.profitabilityAccount \|\| null,/,
  );
});

test("yesterday follows the Asia/Seoul boundary regardless of browser timezone", () => {
  const contract = loadContract();

  assert.equal(
    contract.getYesterdayYmd("2026-07-24T14:59:59.999Z"),
    "2026-07-23",
    "one millisecond before Korean midnight is still July 24 in Seoul",
  );
  assert.equal(
    contract.getYesterdayYmd("2026-07-24T15:00:00.000Z"),
    "2026-07-24",
    "Korean midnight advances the server-aligned yesterday",
  );
  assert.equal(
    contract.getYesterdayYmd("2026-07-25T00:00:00+09:00"),
    "2026-07-24",
    "an equivalent offset-bearing instant produces the same business date",
  );
});

test("campaign daily coverage is terminal only for a contiguous 31-day window", () => {
  const contract = loadContract();
  const dates = [
    ...contract.buildRollingCampaignBusinessDates("2026-07-24"),
  ];
  const complete = {
    ...contract.campaignDailyCoverage(dates),
  };
  const missingOne = {
    ...contract.campaignDailyCoverage(dates.filter((date) => date !== "2026-07-10")),
  };
  const duplicate = {
    ...contract.campaignDailyCoverage([...dates, dates[0]]),
  };

  assert.deepEqual(complete, {
    campaignDailyCollectionComplete: true,
    campaignDailyWindowDays: 31,
    campaignDailyFrom: "2026-06-24",
    campaignDailyTo: "2026-07-24",
  });
  assert.equal(missingOne.campaignDailyCollectionComplete, false);
  assert.equal(missingOne.campaignDailyWindowDays, 30);
  assert.equal(duplicate.campaignDailyCollectionComplete, false);
});

test("campaign daily retry skips exact dates already saved in the same run", () => {
  const contract = loadContract();
  const campaign = { identity: "campaign:100" };
  const dates = [
    ...contract.buildRollingCampaignBusinessDates("2026-07-24", 3),
  ];
  const completed = new Set([
    contract.campaignBusinessDateKey(campaign, "2026-07-24"),
    contract.campaignBusinessDateKey(campaign, "2026-07-23"),
  ]);

  assert.deepEqual(
    [
      ...contract.filterPendingCampaignBusinessDates(
        campaign,
        dates,
        completed,
      ),
    ],
    ["2026-07-22"],
  );
  assert.equal(
    contract.campaignBusinessDateKey({ identity: null }, "2026-07-22"),
    "",
  );
});

test("each selected daily report must reset pagination to page one", () => {
  const contract = loadContract();

  assert.equal(
    contract.dailyReportSelectionSettled(
      "2026.07.24 ~ 2026.07.24",
      "2026-07-24",
      { currentPage: 1 },
    ),
    true,
  );
  assert.equal(
    contract.dailyReportSelectionSettled(
      "2026.07.24 ~ 2026.07.24",
      "2026-07-24",
      { currentPage: 2 },
    ),
    false,
  );
  assert.equal(
    contract.dailyReportSelectionSettled(
      "2026.07.23 ~ 2026.07.23",
      "2026-07-24",
      { currentPage: 1 },
    ),
    false,
  );
});

test("daily pagination reset writes the provider jump input and waits for page-one rows", async () => {
  const contract = loadContract();
  const input = {};
  let page = 3;
  let signature = "page-3";
  let writes = 0;

  const reset = await contract.resetReportPaginationToFirstPage({
    readSnapshot() {
      return reportSnapshot(page, 3, [signature]);
    },
    findPageInput() {
      return input;
    },
    writePageInput(candidate, nextPage) {
      assert.equal(candidate, input);
      assert.equal(nextPage, 1);
      writes += 1;
      page = 1;
      signature = "page-1";
      return true;
    },
    minAttempts: 1,
    wait: async () => {},
  });

  assert.equal(reset, true);
  assert.equal(writes, 1);
});

test("daily pagination reset fails closed when page one cannot be selected", async () => {
  const contract = loadContract();
  const reset = await contract.resetReportPaginationToFirstPage({
    readSnapshot() {
      return reportSnapshot(2, 2, ["page-2"]);
    },
    findPageInput() {
      return null;
    },
  });

  assert.equal(reset, false);
});

test("31-day campaign collection stays inside one detail visit and saves resume keys", () => {
  const detailIndex = source.indexOf(
    "const detail = await waitForCampaignDetailPage",
  );
  const dateLoopIndex = source.indexOf(
    "dateIndex < pendingBusinessDates.length",
    detailIndex,
  );
  const dateSelectionIndex = source.indexOf(
    "await setDateRange(businessDate)",
    dateLoopIndex,
  );
  const resumeKeyIndex = source.indexOf(
    "completedCampaignDateKeys.add",
    dateSelectionIndex,
  );
  const dashboardReturnIndex = source.indexOf(
    "const backOk = await returnToDashboard",
    resumeKeyIndex,
  );

  assert.ok(detailIndex >= 0);
  assert.ok(dateLoopIndex > detailIndex);
  assert.ok(dateSelectionIndex > dateLoopIndex);
  assert.ok(resumeKeyIndex > dateSelectionIndex);
  assert.ok(dashboardReturnIndex > resumeKeyIndex);
});

test("no-detail campaign descriptor preserves identity and state without invented metrics", () => {
  const contract = loadContract();
  const descriptor = contract.buildCampaignOnlyRows({
    identity: "campaign:200",
    campaignId: "200",
    href: "https://advertising.coupang.com/marketing/campaign/200/product",
    name: "동일 캠페인명",
    onOff: "OFF",
    status: "일시정지",
  });
  const normalized = descriptor.normalizedRows[0];

  assert.equal(
    contract.campaignUsesDetailReport({
      onOff: "OFF",
      hasDetailHref: false,
    }),
    false,
  );
  assert.equal(
    contract.campaignUsesDetailReport({
      onOff: "OFF",
      hasDetailHref: true,
    }),
    true,
  );
  assert.equal(contract.campaignUsesDetailReport({ onOff: "ON" }), true);
  assert.equal(descriptor.rawRows[0]._campaignOnly, true);
  assert.equal(descriptor.rawRows[0].campaignIdentity, "campaign:200");
  assert.equal(normalized._campaignOnly, true);
  assert.equal(normalized.campaignIdentity, "campaign:200");
  assert.equal(normalized.onOff, "OFF");
  for (const key of ["spend", "revenue", "impressions", "clicks", "conversions", "orders"]) {
    assert.equal(Object.hasOwn(normalized, key), false);
  }
});

test("daily dashboard and campaign sweep publish disjoint server projection scopes", () => {
  assert.match(
    source,
    /campaignReportScope:\s*targetDate\s*\?\s*"multi_campaign_raw"\s*:\s*undefined/,
  );
  assert.match(
    source,
    /campaignReportScope:\s*"single_campaign_authoritative"/,
  );
  assert.match(
    source,
    /campaignReportScope:\s*"single_campaign_metadata_raw"/,
  );
});

test("campaign requests carry the browser collection run while other producers stay unchanged", () => {
  const contract = loadContract();
  const campaignPayload = {
    type: "ad_campaign",
    source: "advertising",
  };
  const otherPayload = {
    type: "raw_scrape",
    source: "advertising",
  };

  assert.deepEqual(
    { ...contract.withCollectionRunId(campaignPayload, " run-123 ", 4) },
    {
      ...campaignPayload,
      collectionRunId: "run-123",
      collectionAttempt: 4,
    },
  );
  assert.equal(
    contract.withCollectionRunId(otherPayload, "run-123"),
    otherPayload,
  );
  assert.equal(
    contract.withCollectionRunId(campaignPayload, ""),
    campaignPayload,
  );
});

test("campaign sweep progress total never decreases and current never exceeds total", () => {
  const contract = loadContract();
  const firstTotal = contract.estimateSweepProgressTotal({
    current: 1,
    pageRemainingIncludingCurrent: 11,
    explicitTotal: null,
    previousTotal: 0,
  });
  const secondTotal = contract.estimateSweepProgressTotal({
    current: 2,
    pageRemainingIncludingCurrent: 9,
    explicitTotal: null,
    previousTotal: firstTotal,
  });
  const normalized = contract.normalizeSweepProgress(
    { current: 12, total: 10 },
    { current: 2, total: secondTotal },
  );

  assert.equal(firstTotal, 11);
  assert.equal(secondTotal, 11);
  assert.equal(normalized.current, 12);
  assert.equal(normalized.total, 12);
  assert.ok(normalized.current <= normalized.total);
});

test("campaign date work advances per saved day while completed remains campaign-scoped", () => {
  const contract = loadContract();
  const partialKeys = [
    contract.campaignBusinessDateKey(
      { identity: "campaign:partial" },
      "2026-07-24",
    ),
    contract.campaignBusinessDateKey(
      { identity: "campaign:partial" },
      "2026-07-23",
    ),
    contract.campaignBusinessDateKey(
      { identity: "campaign:done" },
      "2026-07-24",
    ),
  ];
  const current = contract.campaignDateWorkUnits({
    completedCampaignDateKeys: partialKeys,
    completedCampaignIdentities: new Set(["campaign:done"]),
    failedCampaignKeys: [],
    rawOnlyCampaignCount: 1,
  });
  const total = contract.estimateSweepDateWorkTotal({
    current,
    campaignTotal: 4,
    previousTotal: 93,
  });

  assert.equal(current, 64, "31 done + 31 raw-only + 2 partial dates");
  assert.equal(total, 124);
  assert.match(source, /completed\s*=\s*synced/);
});

test("31-day sweep uses bounded resumable date slices and finalizes only after pending dates clear", () => {
  assert.match(
    source,
    /MAX_DAILY_WORK_UNITS_PER_INVOCATION\s*=\s*12/,
  );
  assert.match(
    source,
    /MAX_DAILY_SLICE_WALL_MS\s*=\s*20\s*\*\s*60\s*\*\s*1000/,
  );
  assert.match(
    source,
    /resumeAfterDateBudget\s*=\s*true/,
  );
  assert.match(
    source,
    /remainingCampaignDates\.length\s*===\s*0/,
  );
  assert.doesNotMatch(source, /buildCampaignSweepMarkerPayload|_SWEEP_COMPLETE/);
  assert.match(source, /campaignReceipt:\s*\{\s*complete:\s*failed === 0/);

  const dashboardReturnBlock = source.indexOf(
    "// 2e) 대시보드로 복귀",
  );
  const budgetClearIndex = source.indexOf(
    "if (resumeAfterDateBudget) {",
    dashboardReturnBlock,
  );
  const pendingClearIndex = source.indexOf(
    "clearPendingCampaignNavigation();",
    budgetClearIndex,
  );
  const returnToDashboardIndex = source.indexOf(
    "returnToDashboard(20000)",
    dashboardReturnBlock,
  );
  assert.ok(dashboardReturnBlock > 0);
  assert.ok(
    budgetClearIndex > dashboardReturnBlock &&
      pendingClearIndex > budgetClearIndex &&
      pendingClearIndex < returnToDashboardIndex,
    "an intentional date-slice return clears pending before dashboard navigation",
  );
});

// Regression: 상세 페이지가 없는 캠페인(AI스마트광고 등)의 anchor 는 대시보드
// 목록 URL 로 resolve 된다. 그 URL 을 identity 로 쓰면 그런 캠페인들이 전부
// 하나의 identity 로 붕괴해 서버에서 같은 target_key 를 덮어쓴다.
// 실측(2026-07-19): 캠페인 팩트가 `campaign:href:.../dashboard/sales` 1행만
// 남고 전부 0원이었다.
test("dashboard list url never becomes a campaign identity", () => {
  const contract = loadContract();
  const listHref = "https://advertising.coupang.com/marketing/dashboard/sales";

  const smartWing = contract.campaignIdentityFromHref(listHref, "AI스마트광고(wing)");
  const smartHub = contract.campaignIdentityFromHref(listHref, "AI스마트광고(HUB)");

  assert.notEqual(smartWing, "href:https://advertising.coupang.com/marketing/dashboard/sales");
  assert.notEqual(smartHub, "href:https://advertising.coupang.com/marketing/dashboard/sales");
  // 표시명은 identity가 아니다. 상세 href/id가 없는 행은 raw evidence로만
  // 남고 authoritative campaign projection에서는 제외된다.
  assert.equal(smartWing, null);
  assert.equal(smartHub, null);

  // 이름조차 없으면 identity 를 만들지 않는다(=수집 큐에서 제외).
  assert.equal(contract.campaignIdentityFromHref(listHref, ""), null);
});

// Regression: 상세 URL 이 없는 캠페인을 상세 리포트 대상으로 잡으면 sweep 이
// 도달할 수 없는 화면을 계속 기다린다. 사용자가 본 "처리 0.0개/분 /
// 완료 예상 1437시간 6분" 증상.
test("campaigns without a detail url never enter the detail-report path", () => {
  const contract = loadContract();

  assert.equal(
    contract.campaignUsesDetailReport({ onOff: "ON", hasDetailHref: false }),
    false,
  );
  assert.equal(
    contract.campaignUsesDetailReport({ onOff: "ON", hasDetailHref: true }),
    true,
  );
  // 현재 ON/OFF는 과거 실적의 근거가 아니다. 상세 URL 부재가 확인되지 않은
  // 기존 호출은 fail-open to detail so an OFF campaign's history is not lost.
  assert.equal(contract.campaignUsesDetailReport({ onOff: "ON" }), true);
  assert.equal(contract.campaignUsesDetailReport({ onOff: "OFF" }), true);
  assert.equal(
    contract.campaignUsesDetailReport({ onOff: "OFF", hasDetailHref: true }),
    true,
  );
});

// Regression: 백그라운드(가려진) 창에서 수집이 실패하던 직접 원인.
//
// 수집 창은 focused:false 로 열린다. 다른 창에 가려지면 Chrome 은 hidden 으로
// 보고 타이머를 클램프하고, 5분 넘게 hidden 이면 intensive throttling 으로
// nested timer 예산이 분당 1회까지 떨어진다. 기존 대기 루프는 전부
// `while (Date.now() - start < timeoutMs) { ... await sleep(300) }` 라서
// sleep(300) 이 60초가 되면 조건을 딱 한 번 검사하고 만료됐다.
//
// pollUntil 은 벽시계 예산과 별개로 최소 시도 횟수를 보장한다.
test("waits survive background timer throttling instead of giving up after one try", async () => {
  const contract = loadContract();

  // 스로틀된 시계: sleep 한 번이 60초로 늘어난다(예산 15초를 즉시 초과).
  let clock = 0;
  const throttledWait = async () => {
    clock += 60000;
  };
  const now = () => clock;

  let attempts = 0;
  const settlesOnFifthAttempt = () => {
    attempts += 1;
    return attempts >= 5;
  };

  const result = await contract.pollUntil(settlesOnFifthAttempt, {
    timeoutMs: 15000,
    intervalMs: 300,
    now,
    wait: throttledWait,
  });

  // 예전 루프였다면 1회 시도 후 타임아웃했다.
  assert.equal(result, true);
  assert.equal(attempts, 5);
});

test("pollUntil still gives up once the budget and the attempt floor are both spent", async () => {
  const contract = loadContract();

  let clock = 0;
  const throttledWait = async () => {
    clock += 60000;
  };
  let attempts = 0;
  const neverSettles = () => {
    attempts += 1;
    return false;
  };

  const result = await contract.pollUntil(neverSettles, {
    timeoutMs: 15000,
    intervalMs: 300,
    minAttempts: 6,
    now: () => clock,
    wait: throttledWait,
  });

  // 무한 루프가 아니라 실패를 돌려준다. 실패는 조용히 성공이 되지 않는다.
  assert.equal(result, null);
  assert.equal(attempts, 6);
});

const CLAIM_REFUSED_WARNING =
  "실행 보고가 거절된 승인 액션 1개는 광고센터에 쓰지 않고 건너뛰었습니다. 다른 실행이 맡았거나 이미 닫힌 실행 시도입니다.";
const CLAIM_UNREPORTED_WARNING =
  "시작 보고 전달에 실패한 승인 액션 1개는 광고센터에 쓰지 않고 건너뛰었습니다. 서버에 실행 중으로 남았다면 실행 기한(30분)이 지나 실패로 바뀐 뒤 다시 승인할 수 있습니다.";
// The refused report says nothing about Coupang, so the warning does not state the change as fact.
const DONE_REFUSED_WARNING =
  "승인 액션 1개는 광고센터에 반영됐을 수 있지만 완료 보고가 거절됐습니다. 실행 기한이 지났거나 새 실행 시도로 바뀌었으니 다시 승인하기 전에 광고센터에서 확인해 주세요.";
const UNRECORDED_ACTION_WARNING =
  "승인 액션 1개는 광고센터에 이미 반영됐을 수 있지만 실행 기록을 남기지 못했습니다. 다시 승인하기 전에 광고센터에서 확인해 주세요.";
// The code the server refuses the claim of an action the operator applies by
// hand with (KID-138 decision A), read from the server's own lifecycle policy.
const MANUAL_ACTION_CODE = fs
  .readFileSync(
    path.join(repoRoot, "apps/server/src/advertising/domain/execution-task-lifecycle.ts"),
    "utf8",
  )
  .match(/export const EXECUTION_REPORT_MANUAL_ACTION\s*=\s*'([^']+)'/)?.[1];
const manualActionWarning = (count) =>
  `자동 실행하지 않는 승인 액션 ${count}개(키워드 끄기·입찰가·일예산)는 광고센터에 쓰지 않았습니다. 광고센터에서 직접 처리해 주세요.`;
const WRITE_DEADLINE_MS = 10 * 60 * 1000;
const WRITE_DEADLINE_FAILURE = "실행 기한(10분)이 지나 광고센터에 쓰지 않았습니다.";
const CONFIRM_DEADLINE_FAILURE =
  "실행 기한(10분)이 지나 확인 단계에서 멈췄습니다. 광고센터에 반영됐을 수 있으니 다시 승인하기 전에 확인해 주세요.";
const CONFIRM_STOP_WARNING =
  "승인 액션 1개는 확인 단계에서 실행 기한(10분)이 지나 멈췄습니다. 광고센터에 반영됐을 수 있으니 다시 승인하기 전에 광고센터에서 확인해 주세요.";
const CAMPAIGN_ROSTER_UNREAD_FAILURE =
  "광고센터 캠페인 목록을 끝까지 읽지 못해 같은 이름의 캠페인이 있는지 확인하지 못했습니다. 캠페인을 만들지 않았습니다.";
const CAMPAIGN_NAME_MISSING_FAILURE =
  "캠페인 이름이 없습니다. 전략 탭에서 캠페인 이름을 넣어 다시 생성해주세요.";

/** The worker's answer to a report the server accepted. */
const REPORT_ACCEPTED = { success: true, ok: true, status: 201, body: {} };

/**
 * The worker's answer to a report the server refused with 409. The worker
 * answers every HTTP status with success:true because the request completed,
 * and the server's global filter puts the refusal code on the body.
 */
function reportRefused(code) {
  return {
    success: true,
    ok: false,
    status: 409,
    body: { message: "실행 보고를 반영할 수 없습니다.", ...(code ? { code } : {}) },
  };
}

/**
 * One server behind several ad-center tabs. It fences an attempt the way the
 * lifecycle policy does: the first running report starts it, and another
 * running report for the same attempt is refused.
 */
function sharedClaimServer() {
  const log = [];
  const claimed = new Set();
  return {
    log,
    respondAs: (tab) => (report) => {
      const refused = report.action === "markRunning" && claimed.has(report.id);
      if (report.action === "markRunning" && !refused) claimed.add(report.id);
      log.push(`${tab}:${report.action}:${refused ? 409 : 201}`);
      return refused ? reportRefused() : REPORT_ACCEPTED;
    },
  };
}

/** A clock the content script reads through `Date`, moved by the test instead of waiting. */
function controllableClock(startMs = Date.UTC(2026, 8, 15, 6, 0, 0)) {
  let nowMs = startMs;
  const RealDate = Date;
  class ClockDate extends RealDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [nowMs]));
    }

    static now() {
      return nowMs;
    }
  }
  return {
    Date: ClockDate,
    advance(ms) {
      nowMs += ms;
    },
  };
}

function dispatchExecuteApprovedAdActions({ messageListeners }, actions) {
  return new Promise((resolve, reject) => {
    const message = { action: "executeApprovedAdActions", payload: { actions } };
    if (!messageListeners.some((listener) => listener(message, {}, resolve) === true)) {
      reject(new Error("executeApprovedAdActions has no listener"));
    }
  });
}

// Campaign registration is the one action type the extension still executes
// (KID-138 decision A), so the claim and report cases below run on it. It is
// also the one action a retry could duplicate: an attempt left running and
// released may already have created the campaign, so the executor reads the ad
// center's campaign roster before creating.

const CREATE_CAMPAIGN_ACTION = {
  id: "action-create-campaign",
  executionTaskId: "task-create-campaign",
  actionType: "create_campaign",
  targetLabel: "봄 신상 캠페인",
  payload: {
    campaignName: "봄 신상 캠페인",
    adGroupName: "A등급_그룹",
    listings: [{ listingId: "listing-1", label: "봄 원피스" }],
    dailyBudget: 30000,
    operationMode: "AI 스마트광고",
  },
};

/** Another registration, for runs that list several. */
function createCampaignAction(key, campaignName) {
  return {
    ...CREATE_CAMPAIGN_ACTION,
    id: `action-${key}`,
    executionTaskId: `task-${key}`,
    targetLabel: campaignName,
    payload: { ...CREATE_CAMPAIGN_ACTION.payload, campaignName },
  };
}

function campaignRosterResponse(campaigns) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ campaigns, pageInfo: { hasNextPage: false } }),
  };
}

/** An ad center holding none of the campaigns the cases register. */
function unrelatedCampaignRoster() {
  return campaignRosterResponse([
    { id: 104640375, name: "쿠팡윙 집중광고", isActive: true, groupList: [] },
  ]);
}

/**
 * An ad-center tab on the campaign registration form. `respond` answers each
 * report the executor sends, as the extension worker would, and may throw like
 * a lost request. `pageReads` counts the executor's page queries after load.
 */
function openCampaignRegistrationTab({
  roster,
  stalledOnProductSelectMs = 0,
  confirmation = false,
  stalledAfterCompleteMs = 0,
  respond = () => REPORT_ACCEPTED,
}) {
  const clock = controllableClock();
  const events = [];
  const reports = [];
  const badges = [];
  const pageReads = { count: 0 };
  const clicks = { complete: 0, confirm: 0 };
  // 완료 may ask for confirmation before it registers the campaign.
  const registerButton = { innerText: "등록", click: () => { clicks.confirm += 1; } };
  const confirmationDialog = {
    offsetParent: {},
    querySelectorAll: (selector) =>
      (selector === "button, a, [role='button'], [role='tab']" ? [registerButton] : []),
  };
  let stalledAfterComplete = false;
  const field = (placeholder) => ({
    value: "",
    getAttribute: (name) => (name === "placeholder" ? placeholder : null),
    dispatchEvent() {},
    closest: () => null,
  });
  const nameInput = field("캠페인 이름을 입력해주세요");
  const searchInput = field("판매 상품을 검색해주세요");
  const adGroupInput = field("광고 그룹 이름을 입력해주세요");
  const budgetInput = field("예)30,000");
  // The tab stalls while it selects products; the 완료 click creates the campaign.
  const selectButton = { innerText: "상품 선택", click: () => clock.advance(stalledOnProductSelectMs) };
  const productRow = { innerText: "봄 원피스", querySelectorAll: () => [selectButton] };
  const completeButton = { innerText: "완료", click: () => { clicks.complete += 1; } };
  const tab = loadContract({
    exposeRuntime: true,
    location: {
      href: "https://advertising.coupang.com/marketing/campaign/registration",
      pathname: "/marketing/campaign/registration",
      search: "",
      hash: "",
    },
    globals: {
      Date: clock.Date,
      HTMLInputElement: function HTMLInputElement() {},
      KeyboardEvent: class KeyboardEvent {
        constructor(type) {
          this.type = type;
        }
      },
      AbortController: class AbortController {
        constructor() {
          this.signal = {};
        }

        abort() {}
      },
      fetch: async (url, init) => {
        assert.equal(url, "/marketing/tetris-api/campaigns");
        events.push(`roster:isDeleted=${JSON.parse(init.body).isDeleted}`);
        return roster;
      },
      showBadge: (text, color) => badges.push({ text, color }),
    },
    document: {
      body: { innerText: "", querySelector: () => null, querySelectorAll: () => [] },
      title: "광고센터",
      querySelector: (selector) => {
        pageReads.count += 1;
        if (selector === "#reg_ad_group_name") return adGroupInput;
        if (selector === '[data-testid="budget-input"]') return budgetInput;
        return null;
      },
      querySelectorAll: (selector) => {
        pageReads.count += 1;
        if (selector === "input") return [nameInput, searchInput, adGroupInput, budgetInput];
        if (selector === 'li[data-bigfoot-component="vendor_item"]') return [productRow];
        if (selector === "button, a, [role='button'], [role='tab']") return [completeButton];
        if (confirmation && clicks.complete > 0 && selector.includes("[role='dialog']")) {
          return [confirmationDialog];
        }
        return [];
      },
    },
    sendMessage: async (message, callback) => {
      if (message?.action === "waitForAdCollectorDelay") {
        // The tab stalls in the wait between the 완료 click and the confirmation click.
        if (stalledAfterCompleteMs > 0 && clicks.complete === 1 && !stalledAfterComplete) {
          stalledAfterComplete = true;
          clock.advance(stalledAfterCompleteMs);
        }
        callback?.();
        return undefined;
      }
      assert.equal(message?.action, "kiditemApiRequest");
      const report = JSON.parse(message.init.body);
      events.push(`${report.action}:${report.executionTaskId}`);
      reports.push(report);
      return respond(report);
    },
  });
  // Only what the executor reads counts, not what the script read as it loaded.
  pageReads.count = 0;
  return { tab, events, reports, badges, pageReads, clicks, nameInput };
}

test("the extension counts a refused claim apart by the same manual-action code the server sends", () => {
  assert.ok(MANUAL_ACTION_CODE, "the server's lifecycle policy exports EXECUTION_REPORT_MANUAL_ACTION");
  assert.equal(source.match(/const MANUAL_ACTION_REFUSAL_CODE = "([^"]+)"/)?.[1], MANUAL_ACTION_CODE);
});

test("a rejected running report stops the approved action before any Coupang write", async () => {
  const rejected = createCampaignAction("rejected", "거절된 캠페인");
  const accepted = createCampaignAction("accepted", "승인된 캠페인");
  const page = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    // The server refuses every report for the cancelled execution with 409.
    respond: (report) => (report.id === rejected.id ? reportRefused() : REPORT_ACCEPTED),
  });

  const response = await dispatchExecuteApprovedAdActions(page.tab, [rejected, accepted]);

  // The refused action reads nothing and registers nothing: the one roster
  // read and the one registration belong to the accepted action. A refused
  // report ends this executor's reporting for the action: a failure report
  // would move an attempt that is not its own.
  assert.deepEqual(page.events, [
    "markRunning:task-rejected",
    "markRunning:task-accepted",
    "roster:isDeleted=false",
    "markDone:task-accepted",
  ]);
  assert.equal(page.clicks.complete, 1, "only the accepted action registers its campaign");
  assert.equal(page.nameInput.value, "승인된 캠페인");
  // The refusal is surfaced, not counted as a silent skip.
  assert.deepEqual({ ...response }, {
    success: true,
    executed: 1,
    skipped: 1,
    warning: CLAIM_REFUSED_WARNING,
  });
});

test("a refused done report after the Coupang change warns to check the ad center and sends no failure report", async () => {
  const page = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    // After a won claim no other executor can move the attempt, so a 409 here
    // means the attempt changed on the server meanwhile. The executor must
    // still send nothing more for it.
    respond: (report) => (report.action === "markDone" ? reportRefused() : REPORT_ACCEPTED),
  });

  const response = await dispatchExecuteApprovedAdActions(page.tab, [CREATE_CAMPAIGN_ACTION]);

  assert.equal(page.clicks.complete, 1, "the approved registration reached Coupang once");
  // A failure report after the refused outcome would move an attempt that is
  // no longer this executor's.
  assert.deepEqual(page.reports.map((report) => report.action), ["markRunning", "markDone"]);
  // The change reached Coupang, so the action counts as executed but not
  // recorded, and the refusal is a warning rather than a silent skip.
  assert.deepEqual({ ...response }, {
    success: true,
    executed: 0,
    executedUnrecorded: 1,
    skipped: 0,
    warning: DONE_REFUSED_WARNING,
  });
});

test("a start report whose response is lost or fails skips the action without a Coupang write and warns that the report was not delivered", async () => {
  const claimOutcomes = [
    () => {
      // The extension reloaded, or its worker stopped, while claiming.
      throw new Error("Could not establish connection. Receiving end does not exist.");
    },
    () => ({ success: true, ok: false, status: 502, body: { message: "Bad gateway" } }),
  ];
  for (const claimOutcome of claimOutcomes) {
    const page = openCampaignRegistrationTab({
      roster: unrelatedCampaignRoster(),
      respond: (report) => (report.action === "markRunning" ? claimOutcome() : REPORT_ACCEPTED),
    });

    const response = await dispatchExecuteApprovedAdActions(page.tab, [CREATE_CAMPAIGN_ACTION]);

    // Nothing more is reported or read: the server may have started the
    // attempt, and a failure report could move it while another executor works it.
    assert.deepEqual(page.events, ["markRunning:task-create-campaign"]);
    assert.equal(page.pageReads.count, 0, "an unconfirmed claim never reads the page for the action");
    assert.equal(page.clicks.complete, 0, "an unconfirmed claim never reaches Coupang");
    assert.equal(page.nameInput.value, "");
    assert.deepEqual({ ...response }, {
      success: true,
      executed: 0,
      skipped: 1,
      warning: CLAIM_UNREPORTED_WARNING,
    });
  }
});

test("an approved action listed without an execution attempt id is skipped before its claim, with a warning to check the versions", async () => {
  const page = openCampaignRegistrationTab({ roster: unrelatedCampaignRoster() });
  // An older server lists no attempt id; an approved action without an attempt lists null.
  const { executionTaskId: _omitted, ...withoutAttemptId } = createCampaignAction("without-attempt-id", "시도 id 없는 캠페인");

  const response = await dispatchExecuteApprovedAdActions(page.tab, [
    withoutAttemptId,
    { ...createCampaignAction("null-attempt-id", "시도 id가 null인 캠페인"), executionTaskId: null },
    // An id made only of spaces names no attempt either.
    { ...createCampaignAction("blank-attempt-id", "시도 id가 빈 캠페인"), executionTaskId: "   " },
  ]);

  // Nothing is claimed or read: a report that names no attempt cannot be fenced to one.
  assert.deepEqual(page.events, []);
  assert.equal(page.pageReads.count, 0);
  assert.equal(page.clicks.complete, 0);
  assert.deepEqual({ ...response }, {
    success: true,
    executed: 0,
    skipped: 3,
    warning:
      "실행 시도 id가 없는 승인 액션 3개는 광고센터에 쓰지 않고 건너뛰었습니다. 확장과 서버 버전이 같은지 확인하고 다시 승인해 주세요.",
  });
});

test("a second executor whose roster read would fail is refused at its claim and reads and reports nothing else", async () => {
  const server = sharedClaimServer();
  const first = openCampaignRegistrationTab({
    // The first tab's ad center already has the campaign, so it ends done without the form.
    roster: campaignRosterResponse([
      { id: 104640999, name: "봄 신상 캠페인", isActive: true, groupList: [] },
    ]),
    respond: server.respondAs("first"),
  });
  const second = openCampaignRegistrationTab({
    roster: { ok: false, status: 503, text: async () => "" },
    respond: server.respondAs("second"),
  });

  const [firstResponse, secondResponse] = await Promise.all([
    dispatchExecuteApprovedAdActions(first.tab, [CREATE_CAMPAIGN_ACTION]),
    dispatchExecuteApprovedAdActions(second.tab, [CREATE_CAMPAIGN_ACTION]),
  ]);

  assert.deepEqual(second.events, ["markRunning:task-create-campaign"], "the refused executor never reads the roster");
  assert.equal(second.pageReads.count, 0, "the refused executor never reads the page for the action");
  // A failure report from the second executor would close the first
  // executor's attempt while it is still working it.
  assert.deepEqual(server.log, [
    "first:markRunning:201",
    "second:markRunning:409",
    "first:markDone:201",
  ]);
  assert.deepEqual({ ...firstResponse }, { success: true, executed: 1, skipped: 0 });
  assert.deepEqual({ ...secondResponse }, {
    success: true,
    executed: 0,
    skipped: 1,
    warning: CLAIM_REFUSED_WARNING,
  });
});

test("an approved action the extension has no executor for, including a keyword pause, bid or budget change an older server still hands out, is claimed and then reported failed as unsupported without reading the page", async () => {
  const page = openCampaignRegistrationTab({ roster: unrelatedCampaignRoster() });
  const unsupported = [
    { id: "action-pause", executionTaskId: "task-pause", actionType: "pause_keyword", targetLabel: "콩순이 비눗방울", payload: { keyword: "콩순이 비눗방울" } },
    { id: "action-bid", executionTaskId: "task-bid", actionType: "change_bid", targetLabel: "비눗방울", currentValue: 700, proposedValue: 600 },
    { id: "action-budget", executionTaskId: "task-budget", actionType: "change_daily_budget", targetLabel: "집중 캠페인", currentValue: 30000, proposedValue: 20000 },
    // A type a newer server might list.
    { id: "action-roas", executionTaskId: "task-roas", actionType: "change_target_roas", targetLabel: "집중 캠페인", currentValue: 300, proposedValue: 350 },
  ];

  const response = await dispatchExecuteApprovedAdActions(page.tab, unsupported);

  // Each failure report names the attempt its claim named.
  assert.deepEqual(
    page.reports.map((report) => [report.action, report.executionTaskId, report.errorMessage]),
    unsupported.flatMap((action) => [
      ["markRunning", action.executionTaskId, undefined],
      ["markFailed", action.executionTaskId, `지원하지 않는 액션: ${action.actionType}`],
    ]),
  );
  assert.equal(page.pageReads.count, 0, "no action without an executor reads or writes the page");
  assert.equal(page.clicks.complete, 0);
  assert.deepEqual({ ...response }, { success: true, executed: 0, skipped: 4 });
});

test("a claim the server refuses for an action applied by hand is counted apart with a warning to apply it in the ad center, and nothing else is read or reported (KID-138 decision A)", async () => {
  const page = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    respond: (report) =>
      (report.action === "markRunning" ? reportRefused(MANUAL_ACTION_CODE) : REPORT_ACCEPTED),
  });

  // The extension keeps no list of these types; the server's refusal decides.
  const response = await dispatchExecuteApprovedAdActions(page.tab, [
    { id: "action-pause", executionTaskId: "task-pause", actionType: "pause_keyword", targetLabel: "콩순이 비눗방울", payload: { keyword: "콩순이 비눗방울" } },
    { id: "action-budget", executionTaskId: "task-budget", actionType: "change_daily_budget", targetLabel: "집중 캠페인", currentValue: 30000, proposedValue: 20000 },
  ]);

  // The server already closed each attempt, so no failure report follows.
  assert.deepEqual(page.events, ["markRunning:task-pause", "markRunning:task-budget"]);
  assert.equal(page.pageReads.count, 0, "a refused claim never reads the page");
  assert.deepEqual({ ...response }, {
    success: true,
    executed: 0,
    skipped: 2,
    warning: manualActionWarning(2),
  });
  assert.deepEqual(page.badges.at(-1), { text: `⚠️ ${manualActionWarning(2)}`, color: "#f59e0b" });
});

test("a claim refused for an action applied by hand, or for an attempt another executor owns, does not stop the next registration from reaching its done report", async () => {
  const owned = createCampaignAction("owned", "다른 실행이 맡은 캠페인");
  const next = createCampaignAction("next", "다음 차례 캠페인");
  const page = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    respond: (report) => {
      if (report.action !== "markRunning") return REPORT_ACCEPTED;
      if (report.id === "action-bid") return reportRefused(MANUAL_ACTION_CODE);
      if (report.id === owned.id) return reportRefused("EXECUTION_REPORT_INVALID_TRANSITION");
      return REPORT_ACCEPTED;
    },
  });

  const response = await dispatchExecuteApprovedAdActions(page.tab, [
    { id: "action-bid", executionTaskId: "task-bid", actionType: "change_bid", targetLabel: "비눗방울", currentValue: 700, proposedValue: 600 },
    owned,
    next,
  ]);

  assert.deepEqual(page.events, [
    "markRunning:task-bid",
    "markRunning:task-owned",
    "markRunning:task-next",
    "roster:isDeleted=false",
    "markDone:task-next",
  ]);
  assert.equal(page.clicks.complete, 1, "only the next action registers its campaign");
  assert.equal(page.nameInput.value, "다음 차례 캠페인");
  assert.deepEqual({ ...response }, {
    success: true,
    executed: 1,
    skipped: 2,
    warning: `${manualActionWarning(1)} ${CLAIM_REFUSED_WARNING}`,
  });
});

test("a claim refused with 409 skips only that action, and the next approved action still runs through its done report", async () => {
  const refused = createCampaignAction("refused", "다른 실행이 맡은 캠페인");
  const next = createCampaignAction("next", "다음 차례 캠페인");
  const page = openCampaignRegistrationTab({
    // The next campaign already exists, so its registration ends done without the form.
    roster: campaignRosterResponse([
      { id: 104640999, name: "다음 차례 캠페인", isActive: true, groupList: [] },
    ]),
    // The first action's attempt is not this executor's to claim (KID-138 decision 3).
    respond: (report) => (report.id === refused.id ? reportRefused() : REPORT_ACCEPTED),
  });

  const response = await dispatchExecuteApprovedAdActions(page.tab, [refused, next]);

  assert.deepEqual(page.events, [
    "markRunning:task-refused",
    "markRunning:task-next",
    "roster:isDeleted=false",
    "markDone:task-next",
  ]);
  assert.equal(page.clicks.complete, 0, "no campaign is created");
  assert.deepEqual({ ...response }, {
    success: true,
    executed: 1,
    skipped: 1,
    warning: CLAIM_REFUSED_WARNING,
  });
});

test("a second executor refused at its running report leaves Coupang untouched and cannot fail the first executor's attempt", async () => {
  const server = sharedClaimServer();
  const first = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    respond: server.respondAs("first"),
  });
  const second = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    respond: server.respondAs("second"),
  });

  const [firstResponse, secondResponse] = await Promise.all([
    dispatchExecuteApprovedAdActions(first.tab, [CREATE_CAMPAIGN_ACTION]),
    dispatchExecuteApprovedAdActions(second.tab, [CREATE_CAMPAIGN_ACTION]),
  ]);

  assert.equal(second.clicks.complete, 0, "the refused executor must not register the campaign");
  assert.equal(second.nameInput.value, "", "the refused executor leaves the registration form untouched");
  assert.equal(first.clicks.complete, 1, "the executor that started the attempt still registers it");
  // The refused executor sends nothing after its refusal.
  assert.deepEqual(server.log, [
    "first:markRunning:201",
    "second:markRunning:409",
    "first:markDone:201",
  ]);
  assert.deepEqual({ ...firstResponse }, { success: true, executed: 1, skipped: 0 });
  assert.deepEqual({ ...secondResponse }, {
    success: true,
    executed: 0,
    skipped: 1,
    warning: CLAIM_REFUSED_WARNING,
  });
});

test("a repeated Run in the same tab joins the approved-action execution already in flight", async () => {
  const page = openCampaignRegistrationTab({ roster: unrelatedCampaignRoster() });
  const actions = [CREATE_CAMPAIGN_ACTION];

  const [first, second] = await Promise.all([
    dispatchExecuteApprovedAdActions(page.tab, actions),
    dispatchExecuteApprovedAdActions(page.tab, actions),
  ]);

  assert.equal(page.clicks.complete, 1, "one approved registration completes once");
  assert.deepEqual(page.reports.map((report) => report.action), ["markRunning", "markDone"]);
  assert.deepEqual({ ...first }, { success: true, executed: 1, skipped: 0 });
  assert.deepEqual({ ...second }, { ...first });
});

test("a Run in the same tab with other actions is refused while an execution is in flight", async () => {
  const page = openCampaignRegistrationTab({ roster: unrelatedCampaignRoster() });

  const inFlight = dispatchExecuteApprovedAdActions(page.tab, [
    createCampaignAction("in-flight", "진행 중인 캠페인"),
  ]);
  const refused = await dispatchExecuteApprovedAdActions(page.tab, [
    createCampaignAction("other", "다른 캠페인"),
  ]);

  // The popup shows `error` as the run's result, so the operator sees why the
  // second list did not run instead of the first run's counts.
  assert.deepEqual({ ...refused }, {
    success: false,
    error: "이미 다른 승인 액션 실행이 진행 중입니다. 끝난 뒤 다시 실행해 주세요.",
  });
  assert.deepEqual({ ...(await inFlight) }, { success: true, executed: 1, skipped: 0 });
  assert.equal(page.clicks.complete, 1, "only the in-flight action registered its campaign");
  assert.equal(page.nameInput.value, "진행 중인 캠페인");
  assert.deepEqual(
    page.reports.map((report) => `${report.id}:${report.action}`),
    ["action-in-flight:markRunning", "action-in-flight:markDone"],
  );
});

async function registerCampaignWithDoneReport(doneReport) {
  const page = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    respond: (report) => (report.action === "markDone" ? doneReport() : REPORT_ACCEPTED),
  });
  const response = await dispatchExecuteApprovedAdActions(page.tab, [CREATE_CAMPAIGN_ACTION]);
  return { page, response };
}

test("a done report lost in transport after the Coupang change sends no failure report and reports the action executed but not recorded", async () => {
  const { page, response } = await registerCampaignWithDoneReport(() => {
    // The extension reloaded, or its worker stopped, while reporting.
    throw new Error("Could not establish connection. Receiving end does not exist.");
  });

  assert.equal(page.clicks.complete, 1, "the registration reached Coupang");
  // A failure report would invite approving the action again and registering twice.
  assert.deepEqual(page.reports.map((report) => report.action), ["markRunning", "markDone"]);
  assert.deepEqual({ ...response }, {
    success: true,
    executed: 0,
    executedUnrecorded: 1,
    skipped: 0,
    warning: UNRECORDED_ACTION_WARNING,
  });
});

test("a done report that gets a 500 after the Coupang change is handled like a lost report", async () => {
  const { page, response } = await registerCampaignWithDoneReport(
    () => ({ success: true, ok: false, status: 500, body: { message: "Internal server error" } }),
  );

  assert.equal(page.clicks.complete, 1, "the registration reached Coupang");
  assert.deepEqual(page.reports.map((report) => report.action), ["markRunning", "markDone"]);
  assert.deepEqual({ ...response }, {
    success: true,
    executed: 0,
    executedUnrecorded: 1,
    skipped: 0,
    warning: UNRECORDED_ACTION_WARNING,
  });
});

test("create_campaign reports done without creating when the ad center already has a campaign with that name", async () => {
  const page = openCampaignRegistrationTab({
    roster: campaignRosterResponse([
      { id: 104640375, name: "쿠팡윙 집중광고", isActive: true, groupList: [] },
      { id: 104640999, name: "봄 신상 캠페인", isActive: false, groupList: [] },
    ]),
  });

  const response = await dispatchExecuteApprovedAdActions(page.tab, [CREATE_CAMPAIGN_ACTION]);

  // The roster is read only after the claim is accepted.
  assert.deepEqual(page.events, [
    "markRunning:task-create-campaign",
    "roster:isDeleted=false",
    "markDone:task-create-campaign",
  ]);
  assert.deepEqual(page.reports.at(-1).afterJson, {
    note: "campaign_already_exists",
    campaignName: "봄 신상 캠페인",
    campaignId: "104640999",
  });
  assert.equal(page.nameInput.value, "", "the registration form is left untouched");
  assert.equal(page.clicks.complete, 0, "no second campaign is created");
  assert.deepEqual({ ...response }, { success: true, executed: 1, skipped: 0 });
});

test("create_campaign treats a requested name that differs only in spacing as the ad center's campaign", async () => {
  const page = openCampaignRegistrationTab({
    roster: campaignRosterResponse([
      { id: 104640999, name: "봄 신상 캠페인", isActive: true, groupList: [] },
    ]),
  });
  const spaced = {
    ...CREATE_CAMPAIGN_ACTION,
    targetLabel: " 봄  신상 캠페인 ",
    payload: { ...CREATE_CAMPAIGN_ACTION.payload, campaignName: " 봄  신상 캠페인 " },
  };

  const response = await dispatchExecuteApprovedAdActions(page.tab, [spaced]);

  assert.deepEqual(page.events, [
    "markRunning:task-create-campaign",
    "roster:isDeleted=false",
    "markDone:task-create-campaign",
  ]);
  assert.deepEqual(page.reports.at(-1).afterJson, {
    note: "campaign_already_exists",
    campaignName: "봄 신상 캠페인",
    campaignId: "104640999",
  });
  assert.equal(page.clicks.complete, 0, "no second campaign is created for a spacing variant");
  assert.deepEqual({ ...response }, { success: true, executed: 1, skipped: 0 });
});

test("create_campaign reports failure without creating when the campaign roster cannot be read to the end", async () => {
  const page = openCampaignRegistrationTab({
    roster: { ok: false, status: 503, text: async () => "" },
  });

  const response = await dispatchExecuteApprovedAdActions(page.tab, [CREATE_CAMPAIGN_ACTION]);

  assert.deepEqual(page.events, [
    "markRunning:task-create-campaign",
    "roster:isDeleted=false",
    "markFailed:task-create-campaign",
  ]);
  assert.equal(page.reports.at(-1).errorMessage, CAMPAIGN_ROSTER_UNREAD_FAILURE);
  assert.equal(page.nameInput.value, "");
  assert.equal(page.clicks.complete, 0, "a campaign is never created without the same-name check");
  assert.deepEqual({ ...response }, { success: true, executed: 0, skipped: 1 });
});

test("create_campaign without a campaign name reports failure before reading the roster or touching the form", async () => {
  const page = openCampaignRegistrationTab({
    roster: campaignRosterResponse([
      { id: 104640375, name: "쿠팡윙 집중광고", isActive: true, groupList: [] },
    ]),
  });
  const unnamed = {
    ...CREATE_CAMPAIGN_ACTION,
    targetLabel: "",
    payload: { ...CREATE_CAMPAIGN_ACTION.payload, campaignName: "   " },
  };

  const response = await dispatchExecuteApprovedAdActions(page.tab, [unnamed]);

  assert.deepEqual(page.events, [
    "markRunning:task-create-campaign",
    "markFailed:task-create-campaign",
  ]);
  assert.equal(page.reports.at(-1).errorMessage, CAMPAIGN_NAME_MISSING_FAILURE);
  assert.equal(page.nameInput.value, "", "the registration form is left untouched");
  assert.equal(page.clicks.complete, 0);
  assert.deepEqual({ ...response }, { success: true, executed: 0, skipped: 1 });
});

test("create_campaign completes a new campaign within 10 minutes of its claim, and past that it is reported failed before completing", async () => {
  const onTime = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    stalledOnProductSelectMs: WRITE_DEADLINE_MS,
  });
  const onTimeResponse = await dispatchExecuteApprovedAdActions(onTime.tab, [CREATE_CAMPAIGN_ACTION]);
  assert.equal(onTime.nameInput.value, "봄 신상 캠페인");
  assert.equal(onTime.clicks.complete, 1);
  assert.deepEqual(onTime.events, [
    "markRunning:task-create-campaign",
    "roster:isDeleted=false",
    "markDone:task-create-campaign",
  ]);
  assert.deepEqual({ ...onTimeResponse }, { success: true, executed: 1, skipped: 0 });

  const late = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    stalledOnProductSelectMs: WRITE_DEADLINE_MS + 1,
  });
  const lateResponse = await dispatchExecuteApprovedAdActions(late.tab, [CREATE_CAMPAIGN_ACTION]);
  assert.equal(late.clicks.complete, 0, "a campaign past its write deadline is never completed");
  assert.deepEqual(late.events, [
    "markRunning:task-create-campaign",
    "roster:isDeleted=false",
    "markFailed:task-create-campaign",
  ]);
  assert.equal(late.reports.at(-1).errorMessage, WRITE_DEADLINE_FAILURE);
  assert.deepEqual({ ...lateResponse }, { success: true, executed: 0, skipped: 1 });
});

test("create_campaign confirms the registration within 10 minutes of its claim, and past that it stops at the confirmation saying the campaign may exist", async () => {
  const onTime = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    confirmation: true,
    stalledAfterCompleteMs: WRITE_DEADLINE_MS,
  });
  const onTimeResponse = await dispatchExecuteApprovedAdActions(onTime.tab, [CREATE_CAMPAIGN_ACTION]);
  assert.deepEqual(onTime.clicks, { complete: 1, confirm: 1 });
  assert.deepEqual(onTime.events, [
    "markRunning:task-create-campaign",
    "roster:isDeleted=false",
    "markDone:task-create-campaign",
  ]);
  assert.deepEqual({ ...onTimeResponse }, { success: true, executed: 1, skipped: 0 });
  assert.deepEqual(onTime.badges.at(-1), { text: "✅ 승인 액션 1개 실행 완료", color: "#22c55e" });

  const late = openCampaignRegistrationTab({
    roster: unrelatedCampaignRoster(),
    confirmation: true,
    stalledAfterCompleteMs: WRITE_DEADLINE_MS + 1,
  });
  const lateResponse = await dispatchExecuteApprovedAdActions(late.tab, [CREATE_CAMPAIGN_ACTION]);
  assert.deepEqual(late.clicks, { complete: 1, confirm: 0 }, "a confirmation past its write deadline must not be clicked");
  assert.deepEqual(late.events, [
    "markRunning:task-create-campaign",
    "roster:isDeleted=false",
    "markFailed:task-create-campaign",
  ]);
  // 완료 may already have registered the campaign, so the failure says so and
  // the run warns instead of counting a plain skip, and the ad-center badge
  // takes its warning form.
  assert.equal(late.reports.at(-1).errorMessage, CONFIRM_DEADLINE_FAILURE);
  assert.deepEqual({ ...lateResponse }, {
    success: true,
    executed: 0,
    skipped: 1,
    warning: CONFIRM_STOP_WARNING,
  });
  assert.deepEqual(late.badges.at(-1), { text: `⚠️ ${CONFIRM_STOP_WARNING}`, color: "#f59e0b" });
});
