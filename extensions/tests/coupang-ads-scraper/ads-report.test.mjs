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
// The server decides which actions those are, so the warning names no type.
const manualActionWarning = (count) =>
  `자동 실행하지 않는 승인 액션 ${count}개는 광고센터에 쓰지 않았습니다. 광고센터에서 직접 처리해 주세요.`;
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
    // Every wait of the executor ends at once; the tab stalls in the wait
    // between the 완료 click and the confirmation click.
    setTimeout: (callback) => {
      if (stalledAfterCompleteMs > 0 && clicks.complete === 1 && !stalledAfterComplete) {
        stalledAfterComplete = true;
        clock.advance(stalledAfterCompleteMs);
      }
      queueMicrotask(callback);
      return 0;
    },
    sendMessage: async (message) => {
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
