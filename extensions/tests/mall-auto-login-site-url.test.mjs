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
