import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * 조용한 로그인 확인 — 몰마다 정해진 읽기 전용 주소 하나를 사용자 쿠키로 한 번 읽는다.
 *
 * 어느 주소를 읽고 무엇을 로그인 표시로 볼지는 몰 세션 모듈의 한 줄 스펙이 정한다(KID-254).
 * 여기서 보는 것은 그 한 번의 읽기가 실제로 어떻게 일어나는가와, 스펙의 로그인 표시가
 * 라이브 화면을 제대로 가리는가다. 판정은 `in` · `out` · `unknown` 셋 중 하나다.
 */
const source = readFileSync(
  new URL("../kiditem-os/background/orders/mall-session-probe.js", import.meta.url),
  "utf8",
);
const moduleSource = readFileSync(
  new URL("../kiditem-os/background/orders/mall-session.js", import.meta.url),
  "utf8",
);
const workerSource = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);
const serviceWorkerSource = readFileSync(
  new URL("../kiditem-os/background/service-worker.js", import.meta.url),
  "utf8",
);

function loadProbeModule() {
  const sandbox = { TextDecoder, AbortController, URL, setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox);
  return sandbox.KidItemMallSessionProbe;
}

function loadMallSession() {
  const sandbox = { URL, Date, Object, Array, JSON, Error, RegExp, Promise };
  vm.runInNewContext(moduleSource, sandbox);
  return sandbox.KidItemMallSession;
}

const MallSession = loadMallSession();

function page(url, body, status = 200) {
  const bytes = new TextEncoder().encode(body);
  return {
    url,
    status,
    type: "basic",
    ok: status >= 200 && status < 300,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function probeWith(responder) {
  const calls = [];
  const inner = loadProbeModule().create({
    fetch: async (url, init) => {
      calls.push({ url, init });
      return responder(url, init);
    },
    // 주소와 로그인 표시는 몰 세션 모듈의 한 줄 스펙에서만 나온다 — 여기 따로 적지 않는다.
    specs: MallSession.SPECS,
    reasons: MallSession.REASONS,
    timeoutMs: 1000,
  });
  // vm 안에서 만든 객체는 Object.prototype 이 달라 deepStrictEqual 이 어긋난다. 평범한 객체로 옮긴다.
  const probe = { probe: async (mallKey) => ({ ...(await inner.probe(mallKey)) }) };
  return { probe, calls };
}

test("a mall without a passive check is never fetched", async () => {
  const { probe, calls } = probeWith(() => {
    throw new Error("unexpected fetch");
  });
  // 올웨이즈는 로그인 표시가 브라우저 저장소(JWT)에 있어 쿠키 읽기로는 확인할 수 없다.
  // 스펙에 `loggedInSignal` 이 없는 몰은 조용히 가릴 수 없다 — 화면을 열어 보는 것은 모듈의 일이다.
  assert.deepEqual(await probe.probe("always"), {
    verdict: "unknown",
    reason: "no_passive_check",
  });
  assert.deepEqual(await probe.probe("__proto__"), {
    verdict: "unknown",
    reason: "no_passive_check",
  });
  assert.equal(calls.length, 0);
});

test("a probe is one read-only GET with the operator's cookies — it never logs in", async () => {
  const { probe, calls } = probeWith(() =>
    page("https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1", '{"dat":[]}'),
  );
  const result = await probe.probe("domeggook");
  assert.equal(result.verdict, "in");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal("body" in calls[0].init, false);
});

test("domeggook HTML login page means signed out", async () => {
  const { probe } = probeWith(() =>
    page("https://domeggook.com/sc/excel/getOrderList", '<html><form><input type="password"></form></html>'),
  );
  assert.equal((await probe.probe("domeggook")).verdict, "out");
});

/** 라이브 실측(2026-09-12): 로그아웃이어도 200 이고, 몸통만 "로그인이 필요합니다" 라고 답한다. */
test("domeggook answers 200 with res:false once the session is gone", async () => {
  const { probe } = probeWith(() =>
    page("https://www.domeggook.com/sc/excel/getOrderList", '{"res":false,"msg":"로그인이 필요합니다"}'),
  );
  assert.deepEqual(await probe.probe("domeggook"), {
    verdict: "out",
    reason: "login_required_response",
  });
});

test("onch reads the supplier order page, which bounces to the login page when signed out", async () => {
  const out = probeWith(() => page("https://www.onch3.co.kr/login/login_web.php?referer_url=x", "<html></html>"));
  assert.equal((await out.probe.probe("onch")).verdict, "out");
  const inside = probeWith(() =>
    page("https://www.onch3.co.kr/supplier/orders.php?state=all", '<a href="/logout.php">로그아웃</a>'),
  );
  assert.equal((await inside.probe.probe("onch")).verdict, "in");
});

/** 티쳐몰 로그인 화면은 http:// 를 한 번 거친다. 그 주소는 권한 밖이라 따라갈 수 없다. */
test("teacher-mall: an unreachable http login hop still reads as signed out", async () => {
  const { probe, calls } = probeWith((_url, init) => {
    if (init.redirect === "follow") throw new TypeError("Failed to fetch");
    return { type: "opaqueredirect", status: 0, url: "", arrayBuffer: async () => new ArrayBuffer(0) };
  });
  assert.deepEqual(await probe.probe("teacher-mall"), {
    verdict: "out",
    reason: "redirected_away",
  });
  assert.equal(calls.length, 2);
});

test("JSON without the signed-in shape is not proof of a session", async () => {
  const { probe } = probeWith(() =>
    page("https://domeggook.com/sc/excel/getOrderList", '{"result":"fail","msg":"session"}'),
  );
  assert.deepEqual(await probe.probe("domeggook"), {
    verdict: "unknown",
    reason: "unrecognized_page",
  });
});

test("kidkids: an empty list page is still signed in; the partner login page is not", async () => {
  const empty = probeWith(() =>
    page(
      "https://partner.kidkids.net/logis/logis_index.htm?from_logis_index=Y&page_view_cnt=1",
      "<html><table></table></html>",
    ),
  );
  assert.equal((await empty.probe.probe("kidkids")).verdict, "in");
  const login = probeWith(() => page("https://www.kidkids.net/join/partner_login.htm", "<html></html>"));
  assert.equal((await login.probe.probe("kidkids")).verdict, "out");
  const passwordOnList = probeWith(() =>
    page("https://partner.kidkids.net/logis/logis_index.htm", '<form><input type="password"></form>'),
  );
  assert.equal((await passwordOnList.probe.probe("kidkids")).verdict, "out");
});

test("Cafe24 stays on the order list only while signed in", async () => {
  const stays = probeWith(() =>
    page("https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1", "<html>로그인 <input type=password></html>"),
  );
  assert.deepEqual(
    { verdict: (await stays.probe.probe("art09")).verdict },
    { verdict: "in" },
    "Cafe24 admin pages contain login text and password inputs even when signed in",
  );

  const redirected = probeWith(() => page("https://zzogzzog1.cafe24.com/admin/php/login.php", "<html></html>"));
  assert.equal((await redirected.probe.probe("art09")).verdict, "out");
});

test("a login redirect to a host outside the permissions still reads as signed out", async () => {
  const { probe, calls } = probeWith((_url, init) => {
    if (init.redirect === "follow") throw new TypeError("Failed to fetch");
    return { type: "opaqueredirect", status: 0, url: "", arrayBuffer: async () => new ArrayBuffer(0) };
  });
  const result = await probe.probe("art09");
  assert.deepEqual(result, { verdict: "out", reason: "redirected_away" });
  assert.deepEqual(calls.map((call) => call.init.redirect), ["follow", "manual"]);
});

test("kidkids identity verification is a login stop, not a success", async () => {
  const { probe } = probeWith(() => page("https://partner.kidkids.net/security/verify_user.htm", "<html>본인확인</html>"));
  assert.deepEqual(await probe.probe("kidkids"), {
    verdict: "out",
    reason: "verification_required",
  });
});

test("ice-scream mall: login form redirect is signed out; a logout link is signed in", async () => {
  const out = probeWith(() => page("https://po.i-screammall.co.kr/loginForm.do", "<html></html>"));
  assert.equal((await out.probe.probe("icecream-mall")).verdict, "out");
  const inside = probeWith(() => page("https://po.i-screammall.co.kr/main.do", '<a href="/logout.do">로그아웃</a>'));
  assert.equal((await inside.probe.probe("icecream-mall")).verdict, "in");
});

test("without a signed-in marker or a login signal the verdict stays unknown", async () => {
  const { probe } = probeWith(() => page("https://shop.teacherville.co.kr/selleradmin/order/catalog", "<html>잠시 후 다시</html>"));
  assert.deepEqual(await probe.probe("teacher-mall"), {
    verdict: "unknown",
    reason: "unrecognized_page",
  });
});

test("401 and 403 are signed out; a network failure stays unknown", async () => {
  const unauthorized = probeWith(() => page("https://www.onch3.co.kr/access/x", "", 401));
  assert.equal((await unauthorized.probe.probe("onch")).verdict, "out");
  const offline = probeWith(() => {
    throw new TypeError("offline");
  });
  assert.deepEqual(await offline.probe.probe("kidsnote"), {
    verdict: "unknown",
    reason: "network_error",
  });
});

test("⭐ a probe answer carries only the verdict — never URLs, bodies, or headers", async () => {
  const { probe } = probeWith(() =>
    page(
      "https://shop.kidsnote.com/_manage/?body=3010&token=abc",
      "<table><tr><th>주문번호</th><td>010-1234-5678</td></tr></table>",
    ),
  );
  const result = await probe.probe("kidsnote");
  assert.equal(result.verdict, "in");
  assert.deepEqual(Object.keys(result).sort(), ["reason", "verdict"]);
  assert.equal(JSON.stringify(result).includes("http"), false);
  assert.equal(JSON.stringify(result).includes("010"), false);
});

test("EUC-KR admin pages keep their Korean markers", async () => {
  // "<a>로그아웃</a>" in EUC-KR — 로(B7CE) 그(B1D7) 아(BEC6) 웃(BFF4).
  const bytes = Uint8Array.from([
    0x3c, 0x61, 0x3e, 0xb7, 0xce, 0xb1, 0xd7, 0xbe, 0xc6, 0xbf, 0xf4, 0x3c, 0x2f, 0x61, 0x3e,
  ]);
  const { probe } = probeWith(() => ({
    url: "https://mallseller.genimarket.co.kr/mall/order/basket_list.php",
    status: 200,
    type: "basic",
    ok: true,
    arrayBuffer: async () => bytes.buffer.slice(0),
  }));
  assert.equal((await probe.probe("haebub-mall")).verdict, "in");
});

/**
 * 로그인 화면 주소는 몰마다 글자가 다르다. 한 몰이라도 빠지면 그 몰은 '로그인 필요' 대신
 * '확인 불가'로 서서, 사장님은 무엇을 해야 하는지 알 수 없다(2026-09-16 실측한 다섯 몰).
 */
test("⭐ malls that bounce to their own login screen read as signed out, whatever the path is called", async () => {
  const bounced = {
    boribori: "https://seller-club.co.kr/login",
    "lotte-on": "https://store.lotteon.com/cm/main/login_SO.wsp",
    "gs-shop": "https://partners.gsshop.com/sign-in",
    ssg: "https://po.ssgadm.com/authentication/login.ssg?retUrl=https://po.ssgadm.com/",
    thirtymall: "https://partner.shopby.co.kr/login",
  };
  for (const [mallKey, finalUrl] of Object.entries(bounced)) {
    const { probe } = probeWith(() => ({
      url: finalUrl,
      status: 200,
      type: "basic",
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("<html><body>로그인</body></html>").buffer,
    }));
    assert.deepEqual(await probe.probe(mallKey), {
      verdict: "out",
      reason: "login_page",
    });
  }
});

/**
 * 조용히 확인할 수 있는 몰 목록은 스펙에서 나와야 한다. 손으로 적어 두면 몰을 붙인 날 이
 * 줄만 옛말이 되고, 웹은 그 몰을 모른다고 읽는다(KID-250 · KID-254).
 */
test("the worker advertises the passive malls from the spec and loads both modules", () => {
  const line = workerSource.match(/mallSessionProbeMalls: [^\n]*(\n[^\n]*){0,2}/)?.[0] ?? "";
  assert.match(line, /KidItemMallSession\.passiveMalls/, "the advertised list must be derived, not hand-written");
  assert.deepEqual(
    [...MallSession.passiveMalls].sort(),
    [...MallSession.malls].filter((key) => typeof MallSession.SPECS[key].loggedInSignal === "function").sort(),
  );
  assert.match(workerSource, /msg\?\.action === "probeMallSession"/);
  assert.match(workerSource, /mallSessionProbeV1: true/);
  assert.match(serviceWorkerSource, /"orders\/mall-session-probe\.js"/);
  assert.match(serviceWorkerSource, /"orders\/mall-session\.js"/);
});

/** 조용한 읽기는 이유 코드를 지어내지 않는다 — 모듈이 건네준 한 벌에서만 답한다. */
test("⭐ the probe answers only with the module's shared reason codes", async () => {
  const codes = new Set(Object.values(MallSession.REASONS));
  const scripts = [
    () => page("https://www.onch3.co.kr/login/login_web.php", "<html></html>"),
    () => page("https://www.onch3.co.kr/supplier/orders.php", "로그아웃"),
    () => page("https://www.onch3.co.kr/x", "", 401),
    () => page("https://www.onch3.co.kr/x", "<html>잠시 후</html>"),
    () => {
      throw new TypeError("offline");
    },
  ];
  for (const responder of scripts) {
    for (const mallKey of [...MallSession.malls, "one-polaris"]) {
      const { probe } = probeWith(responder);
      const result = await probe.probe(mallKey);
      assert.ok(["in", "out", "unknown"].includes(result.verdict), `${mallKey} verdict: ${result.verdict}`);
      assert.ok(codes.has(result.reason), `${mallKey} 이유 코드 한 벌 밖: ${result.reason}`);
    }
  }
});
