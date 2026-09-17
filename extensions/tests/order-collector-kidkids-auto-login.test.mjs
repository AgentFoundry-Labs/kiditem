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
 * `checkResults` 는 제출 뒤 로그인 폼 확인(`detectOnly`)이 차례로 받을 답이다. `NO_ANSWER` 는
 * 알림 창이 떠 확인 스크립트가 돌아오지 않는 경우다.
 */
function loadEnsureMallLogin({
  scanResults,
  tabUrls,
  checkResults = [{ state: "no-login-form" }],
  // 몰이 알림 창으로 남긴 문장. 페이지 컨텍스트(MAIN)에서 읽어 온다.
  dialogs = [],
}) {
  let scanIndex = 0;
  let checkIndex = 0;
  let urlIndex = 0;
  const context = vm.createContext({
    autoSubmitIcecreamMallLogin: () => undefined,
    chrome: {
      scripting: {
        async executeScript(options) {
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
    setTimeout,
    clearTimeout,
  });
  const asyncSource = (name) => extractFunction(source, name).replace(/^function /, "async function ");
  vm.runInContext(extractFunction(source, "withTimeout"), context);
  vm.runInContext(asyncSource("loginFormRemainsAfterSubmit"), context);
  vm.runInContext(extractFunction(source, "installMallLoginDialogRecorder"), context);
  vm.runInContext(extractFunction(source, "readMallLoginDialogs"), context);
  // 이 둘은 worker 에서 `async function` 이라 추출한 뒤 다시 async 로 되살린다.
  vm.runInContext(asyncSource("recordMallLoginDialogs"), context);
  vm.runInContext(asyncSource("takeMallLoginDialog"), context);
  const ensureMallLogin = vm.runInContext(`(${asyncSource("ensureMallLogin")})`, context);
  return { ensureMallLogin, getScanCount: () => scanIndex, getCheckCount: () => checkIndex };
}

const CREDENTIALS = { loginId: "configured-id", password: "configured-password" };

test("⭐ a login form that stays after the submit is reported as unverified, not as a wrong password", async () => {
  // 몰마다 로그인 뒤 화면이 다르다(관리자 화면에 비밀번호 칸이 남거나 알림 창이 뜬다).
  // 확장이 실패로 단정하면 멀쩡히 로그인된 몰이 '직접 로그인 필요'로 굳는다 — 2026-09-16 라이브.
  const { ensureMallLogin, getCheckCount } = loadEnsureMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://po.i-screammall.co.kr/login.do"],
    checkResults: [{ state: "login-form" }],
  });

  const result = await ensureMallLogin(17, CREDENTIALS, "icecream-mall");

  assert.equal(result.success, true, "판정은 웹이 한다");
  assert.equal(result.submitted, true);
  assert.equal(result.verified, false);
  assert.equal(result.verifyReason, "login_form_remains");
  assert.equal(getCheckCount(), 3, "넘어가는 중일 수 있어 몇 번 더 본다");
  assert.ok(!JSON.stringify(result).includes("configured-password"));
});

test("a login whose form disappears after submitting is verified", async () => {
  const { ensureMallLogin } = loadEnsureMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://po.i-screammall.co.kr/main.do"],
    checkResults: [{ state: "login-form" }, { state: "no-login-form" }],
  });

  const result = await ensureMallLogin(17, CREDENTIALS, "icecream-mall");

  assert.equal(result.success, true);
  assert.equal(result.submitted, true);
  assert.equal(result.verified, true);
});

test("⭐ a page that stops answering after the submit (an alert) stays unverified", async () => {
  const { ensureMallLogin } = loadEnsureMallLogin({
    scanResults: [{ state: "submitted", method: "onclick-handler" }],
    tabUrls: ["https://shop.kidsnote.com/_manage/"],
    checkResults: [NO_ANSWER],
  });

  const result = await ensureMallLogin(17, CREDENTIALS, "kidsnote");

  assert.equal(result.success, true);
  assert.equal(result.verified, false);
});

test("kidkids waits through the initial management redirect and submits the eventual login form", async () => {
  const { ensureMallLogin, getScanCount } = loadEnsureMallLogin({
    scanResults: [{ state: "no-login-form" }, { state: "submitted" }],
    tabUrls: [
      "https://partner.kidkids.net/new/pages/logis/management.htm",
      "https://www.kidkids.net/join/partner_login.htm",
    ],
  });

  const result = await ensureMallLogin(
    17,
    { loginId: "configured-id", password: "configured-password" },
    "kidkids",
  );

  assert.equal(result.success, true);
  assert.equal(result.submitted, true);
  assert.equal(getScanCount(), 2);
});

test("kidkids personal verification is returned as an operator login requirement", async () => {
  const { ensureMallLogin } = loadEnsureMallLogin({
    scanResults: [{ state: "no-login-form" }],
    tabUrls: ["https://partner.kidkids.net/new/pages/security/verify_user.htm"],
  });

  const result = await ensureMallLogin(
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
  const { ensureMallLogin } = loadEnsureMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://shop.kidsnote.com/_manage/?body=3010"],
    checkResults: [{ state: "login-form" }],
    dialogs: ["아이디 또는 비밀번호가 일치하지 않습니다."],
  });

  const result = await ensureMallLogin(17, CREDENTIALS, "kidsnote");

  assert.equal(result.submitted, true);
  assert.equal(result.verified, false);
  assert.equal(result.mallMessage, "아이디 또는 비밀번호가 일치하지 않습니다.");
});

test("a login with nothing to say carries no message", async () => {
  const { ensureMallLogin } = loadEnsureMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://shop.kidsnote.com/_manage/?body=3010"],
    checkResults: [{ state: "no-login-form" }],
  });

  const result = await ensureMallLogin(17, CREDENTIALS, "kidsnote");

  assert.equal(result.verified, true);
  assert.equal(result.mallMessage, undefined);
});
