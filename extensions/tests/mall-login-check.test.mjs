import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * 몰 로그인 상태 확인이 **웹에게 하는 말**(`checkMallLogin`).
 *
 * 어디를 열어 무엇을 보고 판정하는지는 이제 몰 세션 모듈 하나가 안다(KID-254) — 그 판정은
 * [mall-session.test.mjs](./mall-session.test.mjs) 가 스펙에 적힌 몰 전부로 돌린다.
 * 여기 남은 것은 두 가지다. 모듈의 세 답(`in` · `out` · `unknown`)을 웹이 읽는 말로 옮기는
 * 자리와, 화면을 들여다보는 주입 스크립트가 아무것도 건드리지 않는다는 사실.
 *
 * 사장님: "로그인됨 / 인증 필요 / 로그인 필요 3가지 아냐?" — 웹에게는 그 셋뿐이다. 가리지
 * 못한 몰은 사람이 몰에 들어가 봐야 하므로 로그인 필요로 답하고 이유를 그대로 싣는다.
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

/** 모듈이 낸 판정 하나를 들려주고, 웹에게 나가는 답을 받는다. */
function answerFor(found) {
  const asked = [];
  const context = {
    mallSession: () => ({
      checkLogin: async (mallKey, siteUrl) => {
        asked.push({ mallKey, siteUrl });
        return found;
      },
    }),
  };
  vm.createContext(context);
  vm.runInContext(extractFunction("checkMallLogin", { async: true }), context);
  return {
    asked,
    check: (mallKey, siteUrl = "") =>
      vm.runInContext(
        `checkMallLogin(${JSON.stringify(mallKey)}, ${JSON.stringify(siteUrl)})`,
        context,
      ),
  };
}

test("⭐ 로그인됨과 인증 필요는 그대로, 모른다는 로그인 필요로 옮겨 간다", async () => {
  const signedIn = answerFor({ verdict: "in", reason: "admin_page" });
  assert.deepEqual({ ...(await signedIn.check("onch")) }, {
    success: true,
    mallKey: "onch",
    state: "signed_in",
    reason: "admin_page",
  });

  const verify = answerFor({ verdict: "out", reason: "verification_required" });
  assert.equal((await verify.check("kidkids")).state, "verification_required");

  const signedOut = answerFor({ verdict: "out", reason: "login_page" });
  assert.equal((await signedOut.check("kidsnote")).state, "signed_out");

  // 확인 불가는 웹에 없다. 이유는 그대로 실어 보내 무엇 때문인지 알 수 있게 한다.
  for (const reason of ["login_page_not_reachable", "no_login_address"]) {
    const blind = answerFor({ verdict: "unknown", reason });
    assert.deepEqual({ ...(await blind.check("kakao")) }, {
      success: true,
      mallKey: "kakao",
      state: "signed_out",
      reason,
    });
  }
});

test("확인은 몰 키와 사장님이 저장한 사이트 주소만 넘긴다", async () => {
  const { asked, check } = answerFor({ verdict: "in", reason: "admin_page" });
  await check("always", "https://alwayzseller.ilevit.com/login");
  assert.deepEqual(asked, [{ mallKey: "always", siteUrl: "https://alwayzseller.ilevit.com/login" }]);
});

test("the page check never fills or presses anything", () => {
  const inspect = extractFunction("inspectMallLoginScreen");
  assert.doesNotMatch(inspect, /\.value\s*=|\.click\(|dispatchEvent|submit/);
});

test("the worker advertises the three-state check", () => {
  assert.match(source, /mallLoginCheckV2: true/);
  assert.match(source, /msg\?\.action === "checkMallLogin"/);
});

/**
 * 확인용으로 여는 탭은 확장 권한 안의 주소만 열고, 본 뒤에는 반드시 닫는다. 여는 일과 닫는
 * 일은 드라이버가 하므로 그 자리가 실제로 권한을 묻고 탭을 지우는지 본다.
 */
test("⭐ 드라이버는 권한을 물어보고 우리가 연 탭을 반드시 지운다", () => {
  const driver = extractFunction("createMallSessionDriver");
  assert.match(driver, /chrome\.permissions\.contains\(\{ origins: \[`\$\{origin\}\/\*`\] \}\)/);
  assert.match(driver, /if \(keepOpen\) return;/);
  assert.match(driver, /forgetOrderCollectionTab\(tab\?\.id\)/);
  assert.match(driver, /await chrome\.tabs\.remove\(tab\.id\)/);
  // 화면을 들여다보기만 한다 — 값을 넣거나 누르는 주입은 로그인 갈래에만 있다.
  const inspectScreen = driver.slice(driver.indexOf("async inspectScreen("));
  assert.match(inspectScreen, /func: inspectMallLoginScreen/);
  assert.doesNotMatch(inspectScreen.slice(0, inspectScreen.indexOf("probe:")), /args: \[credentials\]/);
});
