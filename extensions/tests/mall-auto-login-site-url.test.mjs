import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * 폼 자동 로그인은 몰마다 고정 주소를 적어 둔 몰(12곳)에서만 돌았다. 나머지 몰
 * (올웨이즈 · 떠리몰 · 신세계 · 11번가 · 스마트스토어 · 지마켓 · 옥션 …)은 아이디와 비밀번호가
 * 저장돼 있어도 `unsupported_mall` 로 조용히 지나가, 수집기가 연 로그인 화면에 크롬이 채워 둔
 * 값만 남고 아무도 로그인 버튼을 누르지 않았다. 사장님: "지금 왜 다 로그인을 못하냐? 버튼을
 * 눌러야지".
 *
 * 이제 고정 주소가 없으면 쇼핑몰 계정에 저장된 사이트 주소로 들어간다.
 */
const workerSource = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);
const moduleSource = readFileSync(
  new URL("../kiditem-os/background/orders/mall-session.js", import.meta.url),
  "utf8",
);

function loadMallSession() {
  const sandbox = { URL, Date, Object, Array, JSON, Error, RegExp, Promise };
  vm.runInNewContext(moduleSource, sandbox);
  return sandbox.KidItemMallSession;
}

const MallSession = loadMallSession();

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

test("⭐ a mall without a fixed login address uses the site address saved in its account", () => {
  const call = MallSession.savedSiteUrl;

  assert.equal(call({ siteUrl: "https://alwayzseller.ilevit.com/login" }), "https://alwayzseller.ilevit.com/login");
  assert.equal(call({ siteUrl: " https://partner.shopby.co.kr/login " }), "https://partner.shopby.co.kr/login");
  assert.equal(call({ siteUrl: "http://po.ssgadm.com/" }), "http://po.ssgadm.com/");
});

test("only an address the operator saved is opened — anything else is no address at all", () => {
  const call = MallSession.savedSiteUrl;

  for (const siteUrl of [undefined, null, "", "   ", "shop.example.com", "javascript:alert(1)", "data:text/html,x", 42]) {
    assert.equal(call({ siteUrl }), null, `refused: ${String(siteUrl)}`);
  }
  assert.equal(call(undefined), null);
  assert.equal(call({}), null);
});

/**
 * 고정 로그인 주소가 없는 몰은 이제 스펙의 `loginUrl: null` 로 적힌다(KID-254).
 * 그 몰은 저장된 사이트 주소로 들어가고, 그것도 없으면 시도하지 않는다.
 */
test("the login path falls back to that address and still refuses when there is none", async () => {
  const opened = [];
  const driver = fakeLoginDriver(opened);
  const session = MallSession.create({ driver });
  const credentials = { loginId: "id", password: "pw", siteUrl: "https://partner.shopby.co.kr/login" };

  await session.ensureLoggedIn("thirtymall", credentials);
  assert.deepEqual(opened, ["https://partner.shopby.co.kr/login"]);

  const nowhere = await session.ensureLoggedIn("thirtymall", { loginId: "id", password: "pw" });
  assert.equal(nowhere.reason, "unsupported_mall");
  assert.equal(nowhere.success, true);
  assert.equal(nowhere.submitted, false);
  assert.deepEqual(opened, ["https://partner.shopby.co.kr/login"], "주소가 없으면 탭도 열지 않는다");
});

/** 주소를 고르는 것만 보는 가짜 드라이버 — 화면은 이미 로그인된 것으로 둔다. */
function fakeLoginDriver(opened) {
  let clock = 0;
  return {
    now: () => clock,
    delay: async (ms) => {
      clock += ms;
    },
    withTimeout: async (promise) => promise,
    waitReady: async () => undefined,
    ensureActive: async () => undefined,
    cancelledResult: async () => ({ success: false, errorCode: "COLLECTION_CANCELLED" }),
    hasPermission: async () => true,
    openTab: async (url) => {
      opened.push(url);
      return { tab: { id: 1 } };
    },
    closeTab: async () => undefined,
    tabUrl: async () => "",
    watchDialogs: async () => undefined,
    takeDialog: async () => null,
    fillLoginForm: async () => ({ frames: [{ state: "no-login-form" }] }),
    loginFormRemains: async () => false,
    inspectScreen: async () => ({ href: "", frames: [] }),
    probe: async () => ({ verdict: "unknown", reason: "no_passive_check" }),
  };
}

test("the login test carries the saved address through and checks its type", () => {
  const start = workerSource.indexOf('if (msg?.action === "testMallLogin")');
  assert.notEqual(start, -1);
  const block = workerSource.slice(start, workerSource.indexOf("\n  if (msg?.action ===", start + 1));
  assert.match(block, /credentials\.siteUrl === undefined \|\| typeof credentials\.siteUrl === "string"/);
  assert.match(block, /\.\.\.\(credentials\.siteUrl \? \{ siteUrl: credentials\.siteUrl \} : \{\}\)/);
});

/**
 * 몰은 대개 알림 창(`alert`)으로 답한다. 백그라운드 탭의 알림 창은 그 탭의 스크립트를 멈춰
 * 우리가 확인도 못 하게 만들고, 사장님께는 값만 채워진 로그인 화면만 남는다. 그래서 우리 로그인
 * 동안에는 알림 창 대신 문장을 모아 결과에 싣는다.
 */
test("⭐ the mall's own answer is captured instead of a dialog nobody sees", () => {
  const install = extractFunction(workerSource, "installMallLoginDialogRecorder");
  const read = extractFunction(workerSource, "readMallLoginDialogs");
  const context = { window: { alert: () => { throw new Error("native alert would block the tab"); } } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${install}
${read}
installMallLoginDialogRecorder();`, context);

  context.window.alert("아이디 또는 비밀번호가 일치하지 않습니다.");
  const messages = vm.runInContext("readMallLoginDialogs()", context);

  assert.equal(messages.length, 1);
  assert.equal(messages[0], "아이디 또는 비밀번호가 일치하지 않습니다.");
  // 읽고 나면 원래 alert 으로 돌려놓는다 — 우리 로그인이 끝난 뒤의 화면은 몰의 것이다.
  assert.throws(() => context.window.alert("x"), /native alert/);
});

test("⭐ the login path swallows dialogs before filling and carries the first line back", async () => {
  const order = [];
  const driver = {
    ...fakeLoginDriver([]),
    watchDialogs: async () => order.push("watch"),
    fillLoginForm: async () => {
      order.push("fill");
      return { frames: [{ state: "submitted", method: "exact-text" }] };
    },
    takeDialog: async () => {
      order.push("take");
      return "아이디 또는 비밀번호가 일치하지 않습니다.";
    },
  };

  const result = await MallSession.create({ driver })
    .ensureLoggedIn("onch", { loginId: "id", password: "pw" });

  // 채우기 전에 삼켜 두지 않으면 알림 창이 그 탭을 멈춰 확인조차 못 한다.
  assert.deepEqual(order, ["watch", "fill", "take"]);
  assert.equal(result.mallMessage, "아이디 또는 비밀번호가 일치하지 않습니다.");
});

/** 알림 창을 삼키고 되돌리는 일은 여전히 드라이버(worker.js)의 일이다. */
test("the driver swallows dialogs before filling and reads them back", () => {
  const driver = extractFunction(workerSource, "createMallSessionDriver");
  assert.match(driver, /watchDialogs: \(tabId\) => recordMallLoginDialogs\(tabId\)/);
  assert.match(driver, /takeDialog: \(tabId\) => takeMallLoginDialog\(tabId\)/);
});

test("the dialog recorder runs in the page world — an isolated override would not be seen", () => {
  const record = extractFunction(workerSource, "recordMallLoginDialogs");
  const take = extractFunction(workerSource, "takeMallLoginDialog");
  assert.match(record, /world: "MAIN"/);
  assert.match(take, /world: "MAIN"/);
});

test("쿠팡 윙도 자동 로그인 표에 있다 — 로그인 화면이 다른 도메인이어도", () => {
  // 윙 첫 화면은 로그아웃이면 `xauth.coupang.com` 판매자 로그인으로 넘어간다. 두 주소 모두
  // manifest 권한에 있고, 공용 폼 채우기가 모든 프레임을 훑으므로 그대로 채워진다
  // (사장님 2026-09-22: "자동로그인 만들어").
  const ensure = extractFunction(workerSource, "ensureMallLoggedIn");
  assert.match(ensure, /coupang: WING_LOGIN_URL,/);
  assert.match(workerSource, /const WING_LOGIN_URL = "https:\/\/wing\.coupang\.com\/";/);
  const manifest = readFileSync(
    new URL("../kiditem-os/manifest.json", import.meta.url),
    "utf8",
  );
  assert.ok(manifest.includes("https://xauth.coupang.com/*"), "xauth 호스트 권한이 있어야 한다");
  assert.ok(manifest.includes("https://wing.coupang.com/*"), "wing 호스트 권한이 있어야 한다");
});
