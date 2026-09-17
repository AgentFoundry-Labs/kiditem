import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../kiditem-os/background/orders/mall-session-probe.js", import.meta.url),
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
    timeoutMs: 1000,
  });
  // vm 안에서 만든 객체는 Object.prototype 이 달라 deepStrictEqual 이 어긋난다. 평범한 객체로 옮긴다.
  const probe = { probe: async (mallKey) => ({ ...(await inner.probe(mallKey)) }), malls: inner.malls };
  return { probe, calls };
}

test("a mall without a passive check is never fetched", async () => {
  const { probe, calls } = probeWith(() => {
    throw new Error("unexpected fetch");
  });
  // 올웨이즈는 로그인 표시가 브라우저 저장소(JWT)에 있어 쿠키 읽기로는 확인할 수 없다.
  assert.deepEqual(await probe.probe("always"), {
    success: true,
    mallKey: "always",
    state: "unknown",
    reason: "no_passive_check",
  });
  assert.deepEqual(await probe.probe("__proto__"), {
    success: true,
    mallKey: "__proto__",
    state: "unknown",
    reason: "no_passive_check",
  });
  assert.equal(calls.length, 0);
});

test("a probe is one read-only GET with the operator's cookies — it never logs in", async () => {
  const { probe, calls } = probeWith(() =>
    page("https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1", '{"dat":[]}'),
  );
  const result = await probe.probe("domeggook");
  assert.equal(result.state, "signed_in");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal("body" in calls[0].init, false);
});

test("domeggook HTML login page means signed out", async () => {
  const { probe } = probeWith(() =>
    page("https://domeggook.com/sc/excel/getOrderList", '<html><form><input type="password"></form></html>'),
  );
  assert.equal((await probe.probe("domeggook")).state, "signed_out");
});

/** 라이브 실측(2026-09-12): 로그아웃이어도 200 이고, 몸통만 "로그인이 필요합니다" 라고 답한다. */
test("domeggook answers 200 with res:false once the session is gone", async () => {
  const { probe } = probeWith(() =>
    page("https://www.domeggook.com/sc/excel/getOrderList", '{"res":false,"msg":"로그인이 필요합니다"}'),
  );
  assert.deepEqual(await probe.probe("domeggook"), {
    success: true,
    mallKey: "domeggook",
    state: "signed_out",
    reason: "login_required_response",
  });
});

test("onch reads the supplier order page, which bounces to the login page when signed out", async () => {
  const out = probeWith(() => page("https://www.onch3.co.kr/login/login_web.php?referer_url=x", "<html></html>"));
  assert.equal((await out.probe.probe("onch")).state, "signed_out");
  const inside = probeWith(() =>
    page("https://www.onch3.co.kr/supplier/orders.php?state=all", '<a href="/logout.php">로그아웃</a>'),
  );
  assert.equal((await inside.probe.probe("onch")).state, "signed_in");
});

/** 티쳐몰 로그인 화면은 http:// 를 한 번 거친다. 그 주소는 권한 밖이라 따라갈 수 없다. */
test("teacher-mall: an unreachable http login hop still reads as signed out", async () => {
  const { probe, calls } = probeWith((_url, init) => {
    if (init.redirect === "follow") throw new TypeError("Failed to fetch");
    return { type: "opaqueredirect", status: 0, url: "", arrayBuffer: async () => new ArrayBuffer(0) };
  });
  assert.deepEqual(await probe.probe("teacher-mall"), {
    success: true,
    mallKey: "teacher-mall",
    state: "signed_out",
    reason: "redirected_away",
  });
  assert.equal(calls.length, 2);
});

test("JSON without the signed-in shape is not proof of a session", async () => {
  const { probe } = probeWith(() =>
    page("https://domeggook.com/sc/excel/getOrderList", '{"result":"fail","msg":"session"}'),
  );
  assert.deepEqual(await probe.probe("domeggook"), {
    success: true,
    mallKey: "domeggook",
    state: "unknown",
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
  assert.equal((await empty.probe.probe("kidkids")).state, "signed_in");
  const login = probeWith(() => page("https://www.kidkids.net/join/partner_login.htm", "<html></html>"));
  assert.equal((await login.probe.probe("kidkids")).state, "signed_out");
  const passwordOnList = probeWith(() =>
    page("https://partner.kidkids.net/logis/logis_index.htm", '<form><input type="password"></form>'),
  );
  assert.equal((await passwordOnList.probe.probe("kidkids")).state, "signed_out");
});

test("Cafe24 stays on the order list only while signed in", async () => {
  const stays = probeWith(() =>
    page("https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1", "<html>로그인 <input type=password></html>"),
  );
  assert.deepEqual(
    { state: (await stays.probe.probe("art09")).state },
    { state: "signed_in" },
    "Cafe24 admin pages contain login text and password inputs even when signed in",
  );

  const redirected = probeWith(() => page("https://zzogzzog1.cafe24.com/admin/php/login.php", "<html></html>"));
  assert.equal((await redirected.probe.probe("art09")).state, "signed_out");
});

test("a login redirect to a host outside the permissions still reads as signed out", async () => {
  const { probe, calls } = probeWith((_url, init) => {
    if (init.redirect === "follow") throw new TypeError("Failed to fetch");
    return { type: "opaqueredirect", status: 0, url: "", arrayBuffer: async () => new ArrayBuffer(0) };
  });
  const result = await probe.probe("art09");
  assert.deepEqual(result, { success: true, mallKey: "art09", state: "signed_out", reason: "redirected_away" });
  assert.deepEqual(calls.map((call) => call.init.redirect), ["follow", "manual"]);
});

test("kidkids identity verification is a login stop, not a success", async () => {
  const { probe } = probeWith(() => page("https://partner.kidkids.net/security/verify_user.htm", "<html>본인확인</html>"));
  assert.deepEqual(await probe.probe("kidkids"), {
    success: true,
    mallKey: "kidkids",
    state: "signed_out",
    reason: "verification_required",
  });
});

test("ice-scream mall: login form redirect is signed out; a logout link is signed in", async () => {
  const out = probeWith(() => page("https://po.i-screammall.co.kr/loginForm.do", "<html></html>"));
  assert.equal((await out.probe.probe("icecream-mall")).state, "signed_out");
  const inside = probeWith(() => page("https://po.i-screammall.co.kr/main.do", '<a href="/logout.do">로그아웃</a>'));
  assert.equal((await inside.probe.probe("icecream-mall")).state, "signed_in");
});

test("without a signed-in marker or a login signal the verdict stays unknown", async () => {
  const { probe } = probeWith(() => page("https://shop.teacherville.co.kr/selleradmin/order/catalog", "<html>잠시 후 다시</html>"));
  assert.deepEqual(await probe.probe("teacher-mall"), {
    success: true,
    mallKey: "teacher-mall",
    state: "unknown",
    reason: "unrecognized_page",
  });
});

test("401 and 403 are signed out; a network failure stays unknown", async () => {
  const unauthorized = probeWith(() => page("https://www.onch3.co.kr/access/x", "", 401));
  assert.equal((await unauthorized.probe.probe("onch")).state, "signed_out");
  const offline = probeWith(() => {
    throw new TypeError("offline");
  });
  assert.deepEqual(await offline.probe.probe("kidsnote"), {
    success: true,
    mallKey: "kidsnote",
    state: "unknown",
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
  assert.equal(result.state, "signed_in");
  assert.deepEqual(Object.keys(result).sort(), ["mallKey", "reason", "state", "success"]);
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
  assert.equal((await probe.probe("haebub-mall")).state, "signed_in");
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
      success: true,
      mallKey,
      state: "signed_out",
      reason: "login_page",
    });
  }
});

test("the worker advertises exactly the malls the probe can check and loads the module", () => {
  const match = workerSource.match(/mallSessionProbeMalls:\s*\[([^\]]*)\]/);
  assert.ok(match, "mallSessionProbeMalls capability missing");
  const advertised = [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).sort();
  assert.deepEqual(advertised, [...loadProbeModule().malls].sort());
  assert.match(workerSource, /msg\?\.action === "probeMallSession"/);
  assert.match(workerSource, /mallSessionProbeV1: true/);
  assert.match(serviceWorkerSource, /"orders\/mall-session-probe\.js"/);
});
