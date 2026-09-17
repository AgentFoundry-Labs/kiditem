import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} closing brace not found`);
}

const source = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);

const NO_ANSWER = Symbol("no answer");

/**
 * 저장된 계정으로 로그인하는 것은 이제 몰 세션 모듈이고(KID-254), 프레임에 스크립트를 넣고
 * 알림 창을 삼키는 일은 worker.js 의 드라이버다. 둘을 붙여 돌리되, 이미 열린 탭 위에서
 * 로그인하는 길로 부른다 — 상품등록 폼이 로그인 풀린 화면을 만났을 때 가는 그 길이다.
 *
 * `checkResults` 는 제출 뒤 로그인 폼 확인(`detectOnly`)이 차례로 받을 답이다. `NO_ANSWER` 는
 * 알림 창이 떠 확인 스크립트가 돌아오지 않는 경우다. 시계는 테스트가 들고 있어
 * 제한시간까지 기다리는 갈래도 실제로 기다리지 않는다.
 */
function loadMallLogin({
  scanResults,
  tabUrls,
  checkResults = [{ state: "no-login-form" }],
  // 몰이 알림 창으로 남긴 문장. 페이지 컨텍스트(MAIN)에서 읽어 온다.
  dialogs = [],
  // 확장에 그 주소 권한이 없어 주입 자체가 막히는 경우.
  blockInjection = false,
}) {
  let scanIndex = 0;
  let checkIndex = 0;
  let urlIndex = 0;
  let clock = 1_700_000_000_000;
  const context = vm.createContext({
    URL, Date, Object, Array, JSON, Error, RegExp, Promise, Number, String, Boolean,
    setTimeout, clearTimeout, TextDecoder, AbortController,
    fetch: async () => {
      throw new Error("unexpected fetch");
    },
    autoSubmitIcecreamMallLogin: () => undefined,
    inspectMallLoginScreen: () => undefined,
    chrome: {
      scripting: {
        async executeScript(options) {
          if (blockInjection) {
            throw new Error("Cannot access contents of the page. Extension manifest must request permission to access the respective host.");
          }
          if (options?.world === "MAIN") {
            return options.func?.name === "readMallLoginDialogs"
              ? [{ result: dialogs }]
              : [{ result: true }];
          }
          if (options?.args?.[1]?.detectOnly) {
            const result = checkResults[Math.min(checkIndex, checkResults.length - 1)];
            checkIndex += 1;
            if (result === NO_ANSWER) return new Promise(() => {});
            return [{ result }];
          }
          const result = scanResults[Math.min(scanIndex, scanResults.length - 1)];
          scanIndex += 1;
          return [{ result }];
        },
      },
      tabs: {
        async get() {
          const url = tabUrls[Math.min(urlIndex, tabUrls.length - 1)];
          urlIndex += 1;
          return { id: 17, url };
        },
      },
    },
    delay: async () => undefined,
    waitForTabReady: async () => undefined,
  });
  context.globalThis = context;
  const asyncSource = (name) => extractFunction(source, name).replace(/^function /, "async function ");
  vm.runInContext(extractFunction(source, "withTimeout"), context);
  vm.runInContext(asyncSource("loginFormRemainsAfterSubmit"), context);
  vm.runInContext(extractFunction(source, "installMallLoginDialogRecorder"), context);
  vm.runInContext(extractFunction(source, "readMallLoginDialogs"), context);
  // 이 둘은 worker 에서 `async function` 이라 추출한 뒤 다시 async 로 되살린다.
  vm.runInContext(asyncSource("recordMallLoginDialogs"), context);
  vm.runInContext(asyncSource("takeMallLoginDialog"), context);
  for (const file of ["mall-session-probe.js", "mall-session.js"]) {
    vm.runInContext(
      readFileSync(new URL(`../kiditem-os/background/orders/${file}`, import.meta.url), "utf8"),
      context,
    );
  }
  vm.runInContext(extractFunction(source, "createMallSessionDriver"), context);
  context.fakeClock = {
    now: () => clock,
    delay: async (ms) => {
      clock += ms;
    },
  };
  const session = vm.runInContext(
    "KidItemMallSession.create({ driver: { ...createMallSessionDriver(), ...fakeClock } })",
    context,
  );
  return {
    login: (tabId, credentials, mallKey) =>
      session.ensureLoggedIn(mallKey, credentials, { tab: { id: tabId } }),
    getScanCount: () => scanIndex,
    getCheckCount: () => checkIndex,
  };
}

const CREDENTIALS = { loginId: "configured-id", password: "configured-password" };

test("⭐ a login form that stays after the submit is reported as unverified, not as a wrong password", async () => {
  // 몰마다 로그인 뒤 화면이 다르다(관리자 화면에 비밀번호 칸이 남거나 알림 창이 뜬다).
  // 확장이 실패로 단정하면 멀쩡히 로그인된 몰이 '직접 로그인 필요'로 굳는다 — 2026-09-16 라이브.
  const { login, getCheckCount } = loadMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://po.i-screammall.co.kr/login.do"],
    checkResults: [{ state: "login-form" }],
  });

  const result = await login(17, CREDENTIALS, "icecream-mall");

  assert.equal(result.success, true, "판정은 웹이 한다");
  assert.equal(result.submitted, true);
  assert.equal(result.verified, false);
  assert.equal(result.verifyReason, "login_form_remains");
  assert.equal(getCheckCount(), 3, "넘어가는 중일 수 있어 몇 번 더 본다");
  assert.ok(!JSON.stringify(result).includes("configured-password"));
});

test("a login whose form disappears after submitting is verified", async () => {
  const { login } = loadMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://po.i-screammall.co.kr/main.do"],
    checkResults: [{ state: "login-form" }, { state: "no-login-form" }],
  });

  const result = await login(17, CREDENTIALS, "icecream-mall");

  assert.equal(result.success, true);
  assert.equal(result.submitted, true);
  assert.equal(result.verified, true);
});

test("⭐ a page that stops answering after the submit (an alert) stays unverified", async () => {
  const { login } = loadMallLogin({
    scanResults: [{ state: "submitted", method: "onclick-handler" }],
    tabUrls: ["https://shop.kidsnote.com/_manage/"],
    checkResults: [NO_ANSWER],
  });

  const result = await login(17, CREDENTIALS, "kidsnote");

  assert.equal(result.success, true);
  assert.equal(result.verified, false);
});

test("kidkids waits through the initial management redirect and submits the eventual login form", async () => {
  const { login, getScanCount } = loadMallLogin({
    scanResults: [{ state: "no-login-form" }, { state: "submitted" }],
    tabUrls: [
      "https://partner.kidkids.net/new/pages/logis/management.htm",
      "https://www.kidkids.net/join/partner_login.htm",
    ],
  });

  const result = await login(
    17,
    { loginId: "configured-id", password: "configured-password" },
    "kidkids",
  );

  assert.equal(result.success, true);
  assert.equal(result.submitted, true);
  assert.equal(getScanCount(), 2);
});

test("kidkids personal verification is returned as an operator login requirement", async () => {
  const { login } = loadMallLogin({
    scanResults: [{ state: "no-login-form" }],
    tabUrls: ["https://partner.kidkids.net/new/pages/security/verify_user.htm"],
  });

  const result = await login(
    17,
    { loginId: "configured-id", password: "configured-password" },
    "kidkids",
  );

  assert.equal(result.success, false);
  assert.equal(result.pendingLogin, true);
  assert.match(result.error, /본인 인증/);
});

/**
 * 키즈노트처럼 알림 창으로 답하는 몰이 많다. 백그라운드 탭의 알림 창은 사장님께 보이지 않으므로,
 * 그 문장을 결과에 실어 "왜 안 됐는지"를 화면이 말할 수 있게 한다.
 */
test("⭐ the mall's own answer comes back with the unverified login", async () => {
  const { login } = loadMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://shop.kidsnote.com/_manage/?body=3010"],
    checkResults: [{ state: "login-form" }],
    dialogs: ["아이디 또는 비밀번호가 일치하지 않습니다."],
  });

  const result = await login(17, CREDENTIALS, "kidsnote");

  assert.equal(result.submitted, true);
  assert.equal(result.verified, false);
  assert.equal(result.mallMessage, "아이디 또는 비밀번호가 일치하지 않습니다.");
});

test("a login with nothing to say carries no message", async () => {
  const { login } = loadMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://shop.kidsnote.com/_manage/?body=3010"],
    checkResults: [{ state: "no-login-form" }],
  });

  const result = await login(17, CREDENTIALS, "kidsnote");

  assert.equal(result.verified, true);
  assert.equal(result.mallMessage, undefined);
});

/**
 * 쿠팡처럼 로그인 화면이 다른 도메인으로 넘어가는 몰은 확장에 그 주소 권한이 없으면 주입 자체가
 * 막힌다. 그때 '이미 로그인됨' 으로 답하면 아무도 로그인하지 않은 채 수집이 굴러가 "로그인 필요"
 * 로 끝난다 — 이유를 그대로 말해야 사장님이 손을 쓸 수 있다.
 */
test("⭐ a login page the extension cannot reach is reported, not called signed in", async () => {
  const { login } = loadMallLogin({
    scanResults: [],
    tabUrls: ["https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth"],
    blockInjection: true,
  });

  const result = await login(17, CREDENTIALS, "coupang-direct");

  assert.equal(result.success, false);
  assert.equal(result.pendingLogin, true);
  assert.equal(result.errorCode, "login_page_not_reachable");
  assert.match(result.error, /xauth\.coupang\.com/);
});

test("a mall whose screen answers 'no login form' is still read as already signed in", async () => {
  const { login } = loadMallLogin({
    scanResults: [{ state: "no-login-form" }],
    tabUrls: ["https://shop.kidsnote.com/_manage/"],
  });

  const result = await login(17, CREDENTIALS, "kidsnote");

  assert.equal(result.success, true);
  assert.equal(result.reason, "already_signed_in");
});
