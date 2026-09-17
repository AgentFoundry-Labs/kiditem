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

function savedMallLoginUrl() {
  const context = { URL };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(workerSource, "savedMallLoginUrl")}\nglobalThis.call = savedMallLoginUrl;`, context);
  return context.call;
}

test("⭐ a mall without a fixed login address uses the site address saved in its account", () => {
  const call = savedMallLoginUrl();

  assert.equal(call({ siteUrl: "https://alwayzseller.ilevit.com/login" }), "https://alwayzseller.ilevit.com/login");
  assert.equal(call({ siteUrl: " https://partner.shopby.co.kr/login " }), "https://partner.shopby.co.kr/login");
  assert.equal(call({ siteUrl: "http://po.ssgadm.com/" }), "http://po.ssgadm.com/");
});

test("only an address the operator saved is opened — anything else is no address at all", () => {
  const call = savedMallLoginUrl();

  for (const siteUrl of [undefined, null, "", "   ", "shop.example.com", "javascript:alert(1)", "data:text/html,x", 42]) {
    assert.equal(call({ siteUrl }), null, `refused: ${String(siteUrl)}`);
  }
  assert.equal(call(undefined), null);
  assert.equal(call({}), null);
});

test("the login path falls back to that address and still refuses when there is none", () => {
  const ensure = extractFunction(workerSource, "ensureMallLoggedIn");
  assert.match(ensure, /const url = urls\[mallKey\] \|\| savedMallLoginUrl\(credentials\);/);
  assert.match(ensure, /if \(!url\) return \{ success: true, submitted: false, reason: "unsupported_mall" \};/);
});

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

test("the login path records dialogs before filling and carries the first line back", () => {
  const ensure = extractFunction(workerSource, "ensureMallLogin");
  assert.match(ensure, /await recordMallLoginDialogs\(tabId\);/);
  assert.match(ensure, /const mallMessage = await takeMallLoginDialog\(tabId\);/);
  assert.match(ensure, /\.\.\.\(mallMessage \? \{ mallMessage \} : \{\}\)/);
});

test("the dialog recorder runs in the page world — an isolated override would not be seen", () => {
  const record = extractFunction(workerSource, "recordMallLoginDialogs");
  const take = extractFunction(workerSource, "takeMallLoginDialog");
  assert.match(record, /world: "MAIN"/);
  assert.match(take, /world: "MAIN"/);
});
