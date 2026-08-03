import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const source = fs.readFileSync(
  path.join(repoRoot, "extensions/kiditem-os/content/coupang/ads-report.js"),
  "utf8",
);

test("managed daily collection wins the legacy hash auto-start race", () => {
  assert.match(
    source,
    /legacyBatchAutoStartDelayMs = isLegacyBatchMode \? 6000 : 3000/,
  );
  assert.match(
    source,
    /isLegacyBatchMode && activeCollectionRunId !== null/,
  );
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
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener() {} },
        sendMessage:
          options.sendMessage ||
          ((_message, callback) => callback?.({ success: true })),
      },
      storage: { local: { set() {} } },
    },
    console,
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
    setTimeout: options.setTimeout || (() => 0),
    clearTimeout() {},
    setInterval: options.setInterval || (() => 0),
    clearInterval() {},
    showBadge() {},
    URL,
    URLSearchParams,
  });
  context.window = context;
  context.window.location = location;
  vm.runInContext(source, context, { filename: "ads-report.js" });
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
  assert.match(source, /const isLegacyBatchMode\s*=/);
  assert.doesNotMatch(
    source,
    /const isLegacyBatchMode\s*=[\s\S]{0,160}kiditemAdSync=1/,
  );
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

test("manual sync adopts an unowned auto-triggered run instead of ad_sync_already_running", () => {
  const contract = loadContract();
  // 자동 트리거(#targetDate)는 runId 없이(activeRunId=null) currentSync 를 먼저
  // 점유한다. 배경 드라이버가 실제 runId 로 보낸 요청은 거절되지 않고 이어받아야
  // ad_sync_already_running 으로 헛돌지 않는다.
  const adopted = contract.manualSyncAdmission({
    syncRunning: true,
    activeRunId: null,
    activeAttempt: 1,
    requestedRunId: "run-web",
    requestedAttempt: 1,
  });
  assert.equal(adopted.accepted, true);
  assert.equal(adopted.shareCurrent, true);
  assert.equal(adopted.error, null);
  assert.equal(adopted.runId, "run-web");

  // 주인이 있는(runId 다른) 진행 중 수집은 여전히 보호된다.
  const stillRejected = contract.manualSyncAdmission({
    syncRunning: true,
    activeRunId: "run-a",
    activeAttempt: 1,
    requestedRunId: "run-b",
    requestedAttempt: 1,
  });
  assert.equal(stillRejected.accepted, false);
  assert.equal(stillRejected.error, "ad_sync_already_running");
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

test("daily conversion-rate fallback uses orders, not sales quantity", () => {
  const contract = loadContract();
  const daily = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [
      {
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
  assert.equal(daily.conversionRate, 7.5);
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

test("empty target date builds an explicit all-zero daily fact", () => {
  const contract = loadContract();
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.buildCoupangAdsDailyRow("2026-07-01", [], {}))),
    {
      date: "2026-07-01",
      adSpend: 0,
      adRevenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      roas: 0,
      ctr: 0,
      conversionRate: 0,
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
  assert.equal(unobserved.adSpend, 12_000);
  assert.equal(unobserved.adRevenue, 34_000);
  assert.equal(unobserved.impressions, 120);
  assert.equal(unobserved.clicks, 12);
  assert.equal(unobserved.conversions, 4);
  assert.equal(unobserved.orders, 3);
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

test("partial campaign collection failure stops for operator retry without terminalizing", () => {
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
  assert.match(failureBranch, /recordCampaignFailure\([\s\S]*false,/);
  assert.match(failureBranch, /success: false/);
  assert.match(failureBranch, /광고센터 상태를 확인한 뒤 광고 동기화를 다시 실행/);
  assert.doesNotMatch(failureBranch, /resumeRequired: true/);
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
  const dailyPayload = {
    type: "coupang_ads_daily",
    source: "coupang_ads",
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
    contract.withCollectionRunId(dailyPayload, "run-123"),
    dailyPayload,
  );
  assert.equal(
    contract.withCollectionRunId(campaignPayload, ""),
    campaignPayload,
  );
});

test("successful campaign sweep marker distinguishes exact and identity-incomplete rosters", () => {
  const contract = loadContract();
  const campaignBusinessDates =
    contract.buildRollingCampaignBusinessDates("2026-07-24");
  const exact = contract.buildCampaignSweepMarkerPayload({
    campaignCount: 9,
    rawOnlyCampaignCount: 0,
    campaignBusinessDates,
  });
  const incomplete = contract.buildCampaignSweepMarkerPayload({
    campaignCount: 8,
    rawOnlyCampaignCount: 1,
    campaignBusinessDates,
  });
  const legacyOneDay = contract.buildCampaignSweepMarkerPayload({
    campaignCount: 9,
    rawOnlyCampaignCount: 0,
  });

  assert.equal(exact.type, "ad_campaign");
  assert.equal(exact.campaignReportScope, "multi_campaign_raw");
  assert.equal(exact.campaignSweepComplete, true);
  assert.equal(exact.campaignIdentityComplete, true);
  assert.equal(exact.campaignCount, 9);
  assert.equal(exact.campaignDailyCollectionComplete, true);
  assert.equal(exact.campaignDailyWindowDays, 31);
  assert.equal(exact.campaignDailyFrom, "2026-06-24");
  assert.equal(exact.campaignDailyTo, "2026-07-24");
  assert.deepEqual([...exact.data], []);
  assert.deepEqual([...exact.normalizedRows], []);

  assert.equal(incomplete.campaignSweepComplete, true);
  assert.equal(incomplete.campaignIdentityComplete, false);
  assert.equal(incomplete.rawOnlyCampaignCount, 1);

  assert.equal(
    legacyOneDay.campaignDailyCollectionComplete,
    false,
    "an old one-day sweep marker must not qualify as a fresh 31-day sync",
  );
  assert.equal(legacyOneDay.campaignDailyWindowDays, 0);
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
  const markerIndex = source.indexOf("buildCampaignSweepMarkerPayload({", 3500);
  const finalizationIndex = source.lastIndexOf(
    "buildCampaignSweepMarkerPayload({",
  );
  const clearIndex = source.indexOf("clearSweepState();", finalizationIndex);
  assert.ok(markerIndex >= 0);
  assert.ok(finalizationIndex > markerIndex);
  assert.ok(clearIndex > finalizationIndex);

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
