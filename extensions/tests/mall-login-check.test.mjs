import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * 몰 로그인 상태 확인(`checkMallLogin`). 사장님: "로그인됨 / 인증 필요 / 로그인 필요 3가지
 * 아냐?" — 조용히 읽어 확실하면 그 답을 쓰고, 아니면 관리자 화면을 백그라운드 탭에 열어
 * 로그인 폼 · 인증 화면이 뜨는지 본 뒤 닫는다. 아이디 · 비밀번호는 넣지도 누르지도 않는다.
 */
const source = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);

function extractFunction(name, { async = false } = {}) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        const body = source.slice(start, index + 1);
        return async ? `async ${body}` : body;
      }
    }
  }
  throw new Error(`${name} closing brace not found`);
}

function extractConst(name) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} not found`);
  const end = source.indexOf(";\n", start);
  return source.slice(start, end + 1);
}

/**
 * `passive` 는 조용히 읽는 확인의 답, `screens` 는 탭에서 차례로 보는 화면(프레임 결과 또는
 * `BLOCKED`), `finalUrl` 은 탭이 머문 주소다.
 */
const BLOCKED = Symbol("blocked");

function load({
  passive,
  probeUrl = null,
  screens = [],
  finalUrl = "https://example.invalid/admin",
  title = "",
  allowed = true,
}) {
  const calls = { created: [], removed: [], remembered: [], forgotten: [], permissions: [], looks: 0 };
  let look = 0;
  // 가짜 시계 — 기다리는 만큼만 흐른다. 화면을 못 보는 동안 창이 닫힐 때까지 다시 보는지 잰다.
  let clock = 0;
  const context = {
    URL,
    Date: { now: () => clock },
    Number,
    Promise,
    setTimeout,
    clearTimeout,
    Error,
    COUPANG_DIRECT_LOGIN_URL: "https://supplier.coupang.com/po-web/app/purchase-order/list",
    chrome: {
      permissions: {
        async contains(request) {
          calls.permissions.push(request);
          return allowed;
        },
      },
      tabs: {
        async create(options) {
          calls.created.push(options);
          return { id: 77, windowId: 1 };
        },
        async remove(tabId) {
          calls.removed.push(tabId);
        },
        async get() {
          return { id: 77, url: finalUrl, title };
        },
      },
      scripting: {
        async executeScript() {
          const screen = screens[Math.min(look, screens.length - 1)];
          look += 1;
          calls.looks = look;
          if (screen === BLOCKED || screen === undefined) throw new Error("Cannot access contents of the page");
          return screen.map((result) => ({ result }));
        },
      },
    },
    mallSessionProbe: () => ({
      probe: async (mallKey) => ({ success: true, mallKey, ...passive }),
      urlOf: () => probeUrl,
    }),
    rememberOrderCollectionTab: (tabId) => calls.remembered.push(tabId),
    forgetOrderCollectionTab: (tabId) => calls.forgotten.push(tabId),
    waitForTabReady: async () => undefined,
    delay: async (ms) => {
      clock += ms;
    },
    inspectMallLoginScreen: () => undefined,
  };
  vm.createContext(context);
  for (const name of [
    "MALL_LOGIN_CHECK_URLS",
    "MALL_SIGNED_IN_TITLES",
    "LOGIN_SCREEN_LOOK_WINDOW_MS",
    "LOGIN_SCREEN_URL",
    "VERIFY_SCREEN_URL",
  ]) {
    vm.runInContext(extractConst(name).replace(/^const /, "var "), context);
  }
  vm.runInContext(extractFunction("savedMallLoginUrl"), context);
  vm.runInContext(extractFunction("withTimeout"), context);
  vm.runInContext(extractFunction("lookAtMallLoginScreen", { async: true }), context);
  vm.runInContext(extractFunction("checkMallLoginOnScreen", { async: true }), context);
  vm.runInContext(extractFunction("checkMallLogin", { async: true }), context);
  return { context, calls, check: (mallKey, siteUrl = "") => vm.runInContext(`checkMallLogin(${JSON.stringify(mallKey)}, ${JSON.stringify(siteUrl)})`, context) };
}

test("a definite quiet answer is used as is — no tab opens", async () => {
  const signedIn = load({ passive: { state: "signed_in", reason: "admin_page" } });
  assert.equal((await signedIn.check("onch")).state, "signed_in");
  assert.equal(signedIn.calls.created.length, 0);

  const verify = load({ passive: { state: "signed_out", reason: "verification_required" } });
  assert.equal((await verify.check("kidkids")).state, "verification_required");

  const signedOut = load({ passive: { state: "signed_out", reason: "login_page" } });
  assert.equal((await signedOut.check("kidsnote")).state, "signed_out");
  assert.equal(signedOut.calls.created.length, 0);
});

test("⭐ when the quiet read cannot tell, the admin screen is opened in the background and closed", async () => {
  const { calls, check } = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [[{ loginForm: false, verification: false }]],
  });

  const result = await check("always", "https://alwayzseller.ilevit.com/login");

  assert.equal(result.state, "signed_in");
  // 로그인 화면 주소(저장된 사이트 주소)보다 로그인해야 열리는 관리자 첫 화면을 먼저 연다.
  assert.equal(calls.created[0].url, "https://alwayzseller.ilevit.com/");
  assert.equal(calls.created[0].active, false);
  assert.deepEqual(calls.removed, [77]);
  assert.deepEqual(calls.forgotten, [77]);
});

test("⭐ a login form on the screen is sign-in needed, a code screen is verification needed", async () => {
  const signedOut = load({
    passive: { state: "unknown", reason: "unrecognized_page" },
    probeUrl: "https://partners.gsshop.com/logistics/partner-logistics-mng",
    screens: [[{ loginForm: true, verification: false }]],
  });
  assert.deepEqual(
    { ...(await signedOut.check("gs-shop")) },
    { success: true, mallKey: "gs-shop", state: "signed_out", reason: "login_page" },
  );
  assert.equal(signedOut.calls.created[0].url, "https://partners.gsshop.com/logistics/partner-logistics-mng");

  const verify = load({
    passive: { state: "unknown", reason: "unrecognized_page" },
    probeUrl: "https://partners.gsshop.com/logistics/partner-logistics-mng",
    screens: [[{ loginForm: false, verification: true }]],
  });
  assert.equal((await verify.check("gs-shop")).state, "verification_required");
});

test("a screen that moved to a login address on another domain is sign-in needed even if we cannot look in", async () => {
  const { check } = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [BLOCKED],
    finalUrl: "https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth",
  });
  assert.equal((await check("coupang")).state, "signed_out");
});

test("a screen we could not look into at all is sign-in needed with the reason", async () => {
  const { check } = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [BLOCKED, BLOCKED],
  });
  const result = await check("kakao");
  assert.equal(result.state, "signed_out");
  assert.equal(result.reason, "login_page_not_reachable");
});

test("Kakao opens the seller dashboard — its root bounces to the public site outside our reach", async () => {
  const { check, calls } = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [[{ loginForm: false, verification: false }]],
    finalUrl: "https://shopping-seller.kakao.com/display/store-seller/dashboard",
  });
  assert.equal((await check("kakao")).state, "signed_in");
  assert.equal(calls.created[0].url, "https://shopping-seller.kakao.com/display/store-seller/dashboard");
});

test("⭐ a look that could not see the screen does not erase the admin screen seen before", async () => {
  const admin = [{ loginForm: false, verification: false }];
  const { check } = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [admin, BLOCKED],
  });
  const result = await check("always");
  assert.equal(result.state, "signed_in");
  assert.equal(result.reason, "admin_page");
});

test("⭐ a slow admin screen is looked at again until it answers — not given up after two looks", async () => {
  const admin = [{ loginForm: false, verification: false }];
  const { check, calls } = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [BLOCKED, BLOCKED, BLOCKED, admin, admin],
  });
  assert.equal((await check("always")).state, "signed_in");
  assert.equal(calls.looks, 5);
});

test("a screen we never see is given up when the look window closes", async () => {
  const { check, calls } = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [BLOCKED],
  });
  assert.equal((await check("always")).reason, "login_page_not_reachable");
  // 20초 창을 2초 간격으로 — 끝없이 두드리지 않는다.
  assert.ok(calls.looks > 2 && calls.looks <= 12, `looks ${calls.looks}`);
});

test("⭐ a frozen Wing page is signed in when its title carries the seller name", async () => {
  const frozen = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [BLOCKED],
    finalUrl: "https://wing.coupang.com/",
    title: "Coupang Wing - 판매자, 주식회사",
  });
  assert.deepEqual({ ...(await frozen.check("coupang")) }, {
    success: true,
    mallKey: "coupang",
    state: "signed_in",
    reason: "admin_title",
  });

  // 판매자 이름이 없는 제목(로그인 전 껍데기)이나 다른 몰의 제목은 증거가 아니다.
  const shell = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [BLOCKED],
    finalUrl: "https://wing.coupang.com/",
    title: "Coupang Wing",
  });
  assert.equal((await shell.check("coupang")).reason, "login_page_not_reachable");
  const otherMall = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [BLOCKED],
    title: "Coupang Wing - 판매자, 주식회사",
  });
  assert.equal((await otherMall.check("always")).reason, "login_page_not_reachable");
});

test("a tab already heading to a login address is sign-in needed", async () => {
  const { context, check } = load({
    passive: { state: "unknown", reason: "no_passive_check" },
    screens: [[{ loginForm: false, verification: false }]],
    finalUrl: "https://alwayzseller.ilevit.com/",
  });
  context.chrome.tabs.get = async () => ({
    id: 77,
    url: "https://alwayzseller.ilevit.com/",
    pendingUrl: "https://alwayzseller.ilevit.com/login",
  });
  assert.equal((await check("always")).reason, "login_page");
});

test("no address to open, or an address outside the extension's reach, opens nothing", async () => {
  const noAddress = load({ passive: { state: "unknown", reason: "no_passive_check" } });
  const none = await noAddress.check("one-polaris");
  assert.equal(none.state, "signed_out");
  assert.equal(none.reason, "no_login_address");
  assert.equal(noAddress.calls.created.length, 0);

  const outside = load({ passive: { state: "unknown", reason: "no_passive_check" }, allowed: false });
  const blocked = await outside.check("yoons", "https://unknown-mall.example/admin");
  assert.equal(blocked.reason, "login_page_not_reachable");
  assert.equal(outside.calls.created.length, 0);
  // VM 안에서 만든 객체라 모양만 맞춰 본다.
  assert.equal(JSON.stringify(outside.calls.permissions), JSON.stringify([{ origins: ["https://unknown-mall.example/*"] }]));
});

test("the page check never fills or presses anything", () => {
  const inspect = extractFunction("inspectMallLoginScreen");
  assert.doesNotMatch(inspect, /\.value\s*=|\.click\(|dispatchEvent|submit/);
});

test("the worker advertises the three-state check", () => {
  assert.match(source, /mallLoginCheckV2: true/);
  assert.match(source, /msg\?\.action === "checkMallLogin"/);
});
