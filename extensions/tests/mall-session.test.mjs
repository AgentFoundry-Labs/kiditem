import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * 몰 세션 모듈(KID-254) — 옛 수집 경로가 저장 자격으로 로그인하러 "어디로 들어가나" 를 몰 한 줄로 답한다.
 *
 * 로그인 상태 확인(`checkMallLogin`)과 로그인 테스트는 새 런타임(`extensions/src/sites/mall-session`, KID-366)으로
 * 옮겼다. 여기 남은 문은 옛 수집 경로의 `ensureLoggedIn`(`ok · rejected · unknown`) 하나다. 탭을 열고 스크립트를 넣고
 * 알림 창을 삼키는 일은 모듈 안쪽의 드라이버 자리이고, 이 테스트는 그 자리에 가짜를 끼워 스펙에 적힌 몰 전부를 돌린다.
 */
const source = readFileSync(
  new URL("../kiditem-os/background/orders/mall-session.js", import.meta.url),
  "utf8",
);

function loadModule() {
  const sandbox = { URL, Date, Object, Array, Number, String, Boolean, JSON, Error, RegExp, Promise };
  vm.runInNewContext(source, sandbox);
  return sandbox.KidItemMallSession;
}

const MallSession = loadModule();

/** 서버가 관찰 기록에서 받아 주는 이유 코드 모양(`mall-operation-outcomes.ts`). */
const REASON_CODE = /^[a-z][a-z0-9_]{0,63}$/;

const CREDENTIALS = Object.freeze({ loginId: "configured-id", password: "configured-password" });

/**
 * 스펙에 적힌 몰과 고정 로그인 입구가 있는지(`true`). 없으면 사장님이 계정에 적어 둔 사이트 주소로 들어간다.
 * 몰이 빠지면 그 몰은 옛 경로의 자동 로그인을 잃으므로 목록을 손으로 적어 둔다.
 */
const FIXED_LOGIN = Object.freeze({
  kidsnote: true, kkomangse: true, onch: true, domeggook: true, kidkids: true, boribori: true, art09: true,
  "haebub-mall": true, "icecream-mall": true, "teacher-mall": true, "gs-shop": true, "lotte-on": true,
  "coupang-direct": true, coupang: true,
  always: false, kakao: false, rocket: false, "benepia-mul": false, ssg: false, thirtymall: false,
});

/**
 * 가짜 드라이버. 진짜 드라이버가 크롬에 대고 하는 일(탭 열기 · 프레임에 스크립트 넣기 ·
 * 알림 창 삼키기)을 각본으로 대신한다. 시계도 여기 있어서
 * 제한시간까지 기다리는 갈래도 실제로 기다리지 않고 돈다.
 */
function fakeDriver({
  // 로그인 폼을 채울 때 차례로 나오는 프레임 결과. `null` 은 주입이 막힌 경우다.
  fills = [{ state: "no-login-form" }],
  formRemains = false,
  dialog = null,
  tabUrl = "https://example.invalid/admin",
  openResult = null,
} = {}) {
  const calls = {
    opened: [], closed: [], watched: [], filled: [], active: 0,
  };
  let clock = 1_700_000_000_000;
  let fillIndex = 0;
  const next = (list, index) => list[Math.min(index, list.length - 1)];
  const driver = {
    now: () => clock,
    async delay(ms) {
      clock += ms;
    },
    async withTimeout(promise) {
      return promise;
    },
    async waitReady() {},
    async ensureActive() {
      calls.active += 1;
    },
    async cancelledResult(error) {
      return { success: false, errorCode: "COLLECTION_CANCELLED", error: String(error?.message || "gone") };
    },
    async openTab(url, collection) {
      calls.opened.push({ url, collection });
      if (openResult) return openResult;
      return { tab: { id: 77, windowId: 1 } };
    },
    async closeTab(tab, options) {
      calls.closed.push({ id: tab?.id, ...options });
    },
    async tabUrl() {
      return typeof tabUrl === "function" ? tabUrl() : tabUrl;
    },
    async watchDialogs(tabId) {
      calls.watched.push(tabId);
    },
    async takeDialog() {
      return dialog;
    },
    async fillLoginForm(tabId, credentials) {
      calls.filled.push({ tabId, credentials });
      const answer = next(fills, fillIndex);
      fillIndex += 1;
      return answer === null ? { unreachable: true } : { frames: [answer].flat() };
    },
    async loginFormRemains() {
      return formRemains;
    },
  };
  return { driver, calls, session: MallSession.create({ driver }) };
}

// ── 몰 한 줄 스펙 ────────────────────────────────────────────────────────────

test("⭐ 세 표에 있던 몰이 모두 한 스펙 표에 있다", () => {
  assert.deepEqual([...MallSession.malls].sort(), Object.keys(FIXED_LOGIN).sort());
  assert.ok(MallSession.malls.length >= 16, "합집합은 16개 이상이어야 한다");
});

test("⭐ 스펙 한 줄은 로그인 입구와 입력칸을 적는다 — 고정 입구가 없는 몰은 저장된 사이트 주소로 들어간다", () => {
  for (const [mallKey, fixed] of Object.entries(FIXED_LOGIN)) {
    const spec = MallSession.SPECS[mallKey];
    assert.ok(spec, `${mallKey} 스펙 없음`);
    if (fixed) assert.match(spec.loginUrl, /^https:\/\//, `${mallKey} loginUrl`);
    else assert.equal(spec.loginUrl, null, `${mallKey} loginUrl`);
    assert.ok(spec.fields === null || Array.isArray(spec.fields), `${mallKey} fields`);
  }
});

test("채울 로그인 폼이 없는 몰은 그렇게 적혀 있다 — 고정 로그인 주소도 두지 않는다", () => {
  // 카카오는 토큰, 올웨이즈는 브라우저 저장소(JWT)라 채울 폼이 없다.
  for (const mallKey of ["kakao", "always"]) {
    assert.equal(MallSession.SPECS[mallKey].fields, null);
    assert.equal(MallSession.SPECS[mallKey].loginUrl, null);
  }
  // vm 안에서 만든 배열은 prototype 이 달라 펼쳐서 견준다.
  assert.deepEqual([...MallSession.SPECS.art09.fields], ["supplierLoginId", "loginId", "password"]);
  assert.deepEqual([...MallSession.SPECS.onch.fields], ["loginId", "password"]);
});

// ── 이유 코드 한 벌 ──────────────────────────────────────────────────────────

test("⭐ 이유 코드는 두 문이 함께 쓰는 한 벌이고, 서버가 받아 주는 모양이다", () => {
  const codes = Object.values(MallSession.REASONS);
  assert.ok(codes.length > 0);
  for (const code of codes) assert.match(code, REASON_CODE, `이유 코드 모양: ${code}`);
  assert.equal(new Set(codes).size, codes.length, "중복된 이유 코드");
  assert.equal(Object.isFrozen(MallSession.REASONS), true);
  // 두 문이 실제로 같은 벌에서 답한다.
  for (const shared of ["verification_required", "login_page_not_reachable", "already_signed_in"]) {
    assert.ok(codes.includes(shared), `공통 이유 코드 누락: ${shared}`);
  }
});

// ── 저장된 계정으로 로그인 ───────────────────────────────────────────────────

test("⭐ 로그인 폼을 채워 눌렀는데 폼이 남으면 거절이다 — 비밀번호가 틀렸다고 단정하지는 않는다", async () => {
  const { session, calls } = fakeDriver({
    fills: [{ state: "submitted", method: "exact-text" }],
    formRemains: true,
    dialog: "아이디 또는 비밀번호가 일치하지 않습니다.",
  });

  const result = await session.ensureLoggedIn("onch", CREDENTIALS);

  assert.equal(result.verdict, "rejected");
  assert.equal(result.reason, "login_form_remains");
  // 웹이 읽는 모양은 그대로다 — 재시도 · 차단 규칙은 웹에 남아 있다.
  assert.equal(result.success, true);
  assert.equal(result.submitted, true);
  assert.equal(result.verified, false);
  assert.equal(result.mallMessage, "아이디 또는 비밀번호가 일치하지 않습니다.");
  assert.equal(result.method, "exact-text");
  // 사람이 그 화면을 봐야 하므로 탭을 남긴다.
  assert.deepEqual(calls.closed, [{ id: 77, collection: null, keepOpen: true }]);
});

test("⭐ 눌렀고 로그인 화면이 사라졌으면 됐다 — 탭은 닫는다", async () => {
  const { session, calls } = fakeDriver({
    fills: [{ state: "submitted", method: "form-submit" }],
    formRemains: false,
  });

  const result = await session.ensureLoggedIn("onch", CREDENTIALS);

  assert.equal(result.verdict, "ok");
  assert.equal(result.reason, "form_submitted");
  assert.equal(result.verified, true);
  assert.deepEqual(calls.closed, [{ id: 77, collection: null, keepOpen: false }]);
});

test("⭐ 알림 창은 채우기 전에 미리 삼켜 둔다 — 백그라운드 탭의 알림 창은 그 탭을 멈춘다", async () => {
  const { session, calls } = fakeDriver({ fills: [{ state: "submitted", method: "form-submit" }] });
  await session.ensureLoggedIn("onch", CREDENTIALS);
  assert.deepEqual(calls.watched, [77]);
});

test("로그인 폼이 어디에도 없으면 이미 로그인된 세션이다", async () => {
  const { session } = fakeDriver({ fills: [{ state: "no-login-form" }] });
  const result = await session.ensureLoggedIn("onch", CREDENTIALS);
  assert.equal(result.verdict, "ok");
  assert.equal(result.reason, "already_signed_in");
  assert.equal(result.submitted, false);
});

test("⭐ 화면을 한 번도 들여다보지 못했으면 모른다 — 이미 로그인됨으로 넘기지 않는다", async () => {
  const { session } = fakeDriver({ fills: [null], tabUrl: "https://xauth.coupang.com/login" });
  const result = await session.ensureLoggedIn("coupang-direct", CREDENTIALS);
  assert.equal(result.verdict, "unknown");
  assert.equal(result.reason, "login_page_not_reachable");
  assert.equal(result.loginPageUnreachable, true);
  assert.equal(result.errorCode, "login_page_not_reachable");
});

test("폼은 봤는데 다 채우지 못했으면 모른다 — 사람이 그 탭에서 마저 로그인한다", async () => {
  const { session, calls } = fakeDriver({
    fills: [{ state: "incomplete", reason: "id-input-not-found" }],
  });
  const result = await session.ensureLoggedIn("onch", CREDENTIALS);
  assert.equal(result.verdict, "unknown");
  assert.equal(result.reason, "login_form_incomplete");
  assert.equal(result.pendingLogin, true);
  assert.deepEqual(calls.closed, [{ id: 77, collection: null, keepOpen: true }]);
});

test("아이디 · 비밀번호가 없거나 들어갈 주소가 없으면 탭도 열지 않고 모른다고 답한다", async () => {
  const noCredentials = fakeDriver({});
  const empty = await noCredentials.session.ensureLoggedIn("onch", null);
  assert.equal(empty.verdict, "unknown");
  assert.equal(empty.reason, "no_credentials");
  assert.equal(noCredentials.calls.opened.length, 0);

  const noAddress = fakeDriver({});
  const nowhere = await noAddress.session.ensureLoggedIn("ssg", CREDENTIALS);
  assert.equal(nowhere.verdict, "unknown");
  assert.equal(nowhere.reason, "unsupported_mall");
  assert.equal(noAddress.calls.opened.length, 0);
});

test("고정 로그인 주소가 없는 몰은 계정에 저장된 사이트 주소로 들어간다", async () => {
  const { session, calls } = fakeDriver({ fills: [{ state: "no-login-form" }] });
  await session.ensureLoggedIn("ssg", { ...CREDENTIALS, siteUrl: "https://po.ssgadm.com/login" });
  assert.equal(calls.opened[0].url, "https://po.ssgadm.com/login");
});

test("탭을 열지 못하면 모른다 — 수집이 취소됐으면 열어 둔 탭을 남기지 않는다", async () => {
  const unavailable = fakeDriver({ openResult: { unavailable: true } });
  const failed = await unavailable.session.ensureLoggedIn("onch", CREDENTIALS);
  assert.equal(failed.verdict, "unknown");
  assert.equal(failed.reason, "login_tab_unavailable");
  assert.equal(failed.success, false);

  const cancelled = fakeDriver({ openResult: { cancelled: true } });
  const stopped = await cancelled.session.ensureLoggedIn("onch", CREDENTIALS, { collection: { attemptId: "a1" } });
  assert.equal(stopped.verdict, "unknown");
  assert.equal(stopped.reason, "collection_cancelled");
  assert.equal(stopped.errorCode, "COLLECTION_CANCELLED");
});

/** 채울 로그인 폼이 있는 몰. 나머지 둘은 아래 따로 본다. */
const FORM_MALLS = MallSession.malls.filter((key) => MallSession.SPECS[key].fields !== null);

test("⭐ 폼이 있는 몰은 하나도 빠짐없이 세 답 중 하나를 낸다 (로그인)", async () => {
  const credentials = { ...CREDENTIALS, siteUrl: "https://saved.example/admin" };
  assert.equal(FORM_MALLS.length, 18);
  for (const mallKey of FORM_MALLS) {
    const ok = fakeDriver({ fills: [{ state: "submitted", method: "form-submit" }], formRemains: false });
    assert.equal((await ok.session.ensureLoggedIn(mallKey, credentials)).verdict, "ok", `${mallKey} ok`);
    assert.equal(
      ok.calls.opened[0].url,
      MallSession.SPECS[mallKey].loginUrl ?? "https://saved.example/admin",
      `${mallKey} loginUrl`,
    );

    const rejected = fakeDriver({ fills: [{ state: "submitted", method: "form-submit" }], formRemains: true });
    assert.equal(
      (await rejected.session.ensureLoggedIn(mallKey, credentials)).verdict,
      "rejected",
      `${mallKey} rejected`,
    );

    const blind = fakeDriver({ fills: [null] });
    assert.equal(
      (await blind.session.ensureLoggedIn(mallKey, credentials)).verdict,
      "unknown",
      `${mallKey} unknown`,
    );
  }
});

/**
 * 카카오(토큰)와 올웨이즈(브라우저 저장소 JWT)는 확장이 채울 로그인 폼이 없다. 탭을 열어도
 * 넣을 칸이 없어 "폼을 못 봤다 = 이미 로그인됨" 으로 새고, 그러면 아무도 로그인하지 않은 채
 * 수집이 굴러가 "로그인 필요" 로 끝난다 — 스펙의 `fields: null` 이 그것을 멈췐 세운다.
 */
test("⭐ 채울 로그인 폼이 없는 몰은 탭도 열지 않고 그렇게 말한다", async () => {
  const credentials = { ...CREDENTIALS, siteUrl: "https://saved.example/admin" };
  for (const mallKey of ["kakao", "always"]) {
    const driven = fakeDriver({ fills: [{ state: "submitted", method: "form-submit" }] });

    const result = await driven.session.ensureLoggedIn(mallKey, credentials);

    assert.equal(result.verdict, "unknown", `${mallKey} verdict`);
    assert.equal(result.reason, "no_login_form", `${mallKey} reason`);
    assert.deepEqual(driven.calls.opened, [], `${mallKey} 탭`);
    assert.deepEqual(driven.calls.filled, [], `${mallKey} 폼 채움`);
    // 웹은 이것을 "할 일 없음" 으로 읽고 자동 로그인을 막지 않는다 — 임의로 바꾸지 않는다.
    assert.equal(result.success, true, `${mallKey} success`);
    assert.equal(result.submitted, false, `${mallKey} submitted`);
  }
});

test("⭐ 두 문이 내는 이유 코드는 모두 그 한 벌 안에 있다", async () => {
  const codes = new Set(Object.values(MallSession.REASONS));
  const seen = new Set();
  const credentials = { ...CREDENTIALS, siteUrl: "https://saved.example/admin" };
  const scripts = [
    { fills: [{ state: "submitted", method: "form-submit" }], formRemains: true },
    { fills: [{ state: "submitted", method: "form-submit" }], formRemains: false },
    { fills: [{ state: "no-login-form" }] },
    { fills: [{ state: "incomplete", reason: "id-input-not-found" }] },
    { fills: [null] },
    { openResult: { unavailable: true } },
  ];
  for (const script of scripts) {
    for (const mallKey of [...MallSession.malls, "one-polaris"]) {
      seen.add((await fakeDriver(script).session.ensureLoggedIn(mallKey, credentials)).reason);
      seen.add((await fakeDriver(script).session.ensureLoggedIn(mallKey, null)).reason);
    }
  }
  for (const reason of seen) {
    assert.ok(codes.has(reason), `이유 코드 한 벌 밖: ${reason}`);
  }
});

// ── 키드키즈: 로그인 뒤 본인확인 화면 ────────────────────────────────────────

test("⭐ 키드키즈 본인확인 화면은 거절이다 — 사람이 인증해야 끝난다", async () => {
  const { session } = fakeDriver({
    fills: [{ state: "no-login-form" }],
    tabUrl: "https://partner.kidkids.net/security/verify_user.htm",
  });
  const result = await session.ensureLoggedIn("kidkids", CREDENTIALS);
  assert.equal(result.verdict, "rejected");
  assert.equal(result.reason, "verification_required");
  assert.equal(result.pendingLogin, true);
});

test("키드키즈는 출고관리 화면에 머무는 것을 확인한 뒤에야 이미 로그인됨으로 본다", async () => {
  const { session, calls } = fakeDriver({
    fills: [{ state: "no-login-form" }],
    tabUrl: "https://partner.kidkids.net/new/pages/logis/management.htm",
  });
  const result = await session.ensureLoggedIn("kidkids", CREDENTIALS);
  assert.equal(result.verdict, "ok");
  assert.equal(result.reason, "already_signed_in");
  // 한 번 보고 끝내지 않는다 — 클라이언트 리다이렉트로 로그인 화면이 뒤늦게 뜬다.
  assert.ok(calls.filled.length > 1, "한 번만 보고 넘기면 자동 로그인을 건너뛴다");
});
