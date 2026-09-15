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
function loadEnsureMallLogin({ scanResults, tabUrls, checkResults = [{ state: "no-login-form" }] }) {
  let scanIndex = 0;
  let checkIndex = 0;
  let urlIndex = 0;
  const context = vm.createContext({
    autoSubmitIcecreamMallLogin: () => undefined,
    chrome: {
      scripting: {
        async executeScript(options) {
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
  const ensureMallLogin = vm.runInContext(`(${asyncSource("ensureMallLogin")})`, context);
  return { ensureMallLogin, getScanCount: () => scanIndex, getCheckCount: () => checkIndex };
}

const CREDENTIALS = { loginId: "configured-id", password: "configured-password" };

test("⭐ a password the mall rejects leaves the login form, so the submit is a failure, not a success", async () => {
  // 성공으로 돌려주면 웹이 자동 로그인 차단을 풀고, 다음 수집이 같은 비밀번호를 또 제출한다.
  const { ensureMallLogin, getCheckCount } = loadEnsureMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://po.i-screammall.co.kr/login.do"],
    checkResults: [{ state: "login-form" }],
  });

  const result = await ensureMallLogin(17, CREDENTIALS, "icecream-mall");

  assert.equal(result.success, false);
  assert.equal(result.submitted, true);
  assert.equal(result.errorCode, "login_rejected");
  assert.notEqual(result.pendingLogin, true, "인증 대기가 아니라 비밀번호 문제로 알린다");
  assert.equal(getCheckCount(), 3, "넘어가는 중일 수 있어 몇 번 더 보고 판정한다");
  assert.ok(!JSON.stringify(result).includes("configured-password"));
});

test("a login whose form disappears after submitting succeeds", async () => {
  const { ensureMallLogin } = loadEnsureMallLogin({
    scanResults: [{ state: "submitted", method: "exact-text" }],
    tabUrls: ["https://po.i-screammall.co.kr/main.do"],
    checkResults: [{ state: "login-form" }, { state: "no-login-form" }],
  });

  const result = await ensureMallLogin(17, CREDENTIALS, "icecream-mall");

  assert.equal(result.success, true);
  assert.equal(result.submitted, true);
});

test("⭐ a page that stops answering after the submit (an alert) counts as a rejected login", async () => {
  const { ensureMallLogin } = loadEnsureMallLogin({
    scanResults: [{ state: "submitted", method: "onclick-handler" }],
    tabUrls: ["https://shop.kidsnote.com/_manage/"],
    checkResults: [NO_ANSWER],
  });

  const result = await ensureMallLogin(17, CREDENTIALS, "kidsnote");

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "login_rejected");
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
