import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// 사방넷 송신 기록 가져오기(KID-246). 목록 원문에는 몰 로그인 ID와 비밀번호 칸이 함께
// 오므로, 확장은 고른 칸만 넘기고 세션 토큰은 주입 함수 밖으로 내지 않는다.

const attemptId = "11111111-1111-4111-8111-111111111111";
const token = "22222222-2222-4222-8222-222222222222";
const KIDSNOTE = "33333333-3333-4333-8333-333333333333";
const ELEVENST = "44444444-4444-4444-8444-444444444444";
const ORIGIN = "https://sbadmin08.sabangnet.co.kr";
const LIST_PATH = "/prod-api/customer/mall/MallProductUpdate/getMallProductUpdateLists";
const SESSION = "Bearer sabangnet-session-value";

const plan = {
  sourceType: "sabangnet_mall_listings",
  parserVersion: "sabangnet-mall-listings-v1",
  sourceOrigin: ORIGIN,
  listPath: LIST_PATH,
  pageSize: 500,
  dateFrom: "20000101",
  dateTo: "20260917",
  malls: [
    { mallKey: "kidsnote", channelAccountId: KIDSNOTE, sabangnetShopIds: ["shop0472"] },
    { mallKey: "11st", channelAccountId: ELEVENST, sabangnetShopIds: ["shop0464", "shop0003"] },
  ],
};

const control = {
  attemptId,
  attemptToken: token,
  state: "RUNNING",
  generation: "1",
  expiresAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  errorCode: null,
  errorMessage: null,
  plan,
};

function record(serial, overrides = {}) {
  return {
    type: "data",
    prdRegsTrnmSrno: serial,
    shmaId: "shop0472",
    shmaNm: "키즈노트(신)",
    shmaPrdNo: `KN-${serial}`,
    prdNo: "103177",
    modlNm: "10162-1",
    onsfPrdCd: "8806381806625",
    prdNm: "할로윈  아트 네일팁",
    sepr: 1950,
    prdSplyStsCdNm: "공급중",
    prdRegsFstTrnmDt: "20260914 13:47",
    // 원문에 섞여 오는 로그인 칸 — 절대 넘기지 않는다.
    shmaCnctnLoginId: "seller-login",
    ecptPwd: "not-for-kiditem",
    dcptPwd: "not-for-kiditem",
    ...overrides,
  };
}

function page(total, list) {
  return { code: 20000, data: { metaData: { total }, list } };
}

function loadSource(files) {
  const context = vm.createContext({ Date, Map, Set, URL, setTimeout, clearTimeout, structuredClone });
  for (const file of files) {
    vm.runInContext(readFileSync(new URL(file, import.meta.url), "utf8"), context);
  }
  return context;
}

async function runReader({ pages, cookie = `other=1; Authorization=${encodeURIComponent(SESSION)}`, origin = ORIGIN, status = 200 }) {
  const context = loadSource(["../kiditem-os/background/orders/sabangnet-mall-listings.js"]);
  const requests = [];
  const pageContext = vm.createContext({
    AbortController,
    JSON,
    Number,
    String,
    Array,
    Set,
    setTimeout: (callback) => setTimeout(callback, 0),
    clearTimeout,
    location: new URL(`${origin}/`),
    document: { cookie },
    decodeURIComponent,
    fetch: async (pathname, init) => {
      const body = JSON.parse(init.body);
      requests.push({ pathname, headers: init.headers, body, credentials: init.credentials });
      const next = typeof pages === "function" ? pages(body.currentPage) : pages[body.currentPage - 1];
      return {
        ok: status < 400,
        status,
        redirected: false,
        async text() {
          return JSON.stringify(next);
        },
      };
    },
  });
  const reader = vm.runInContext(
    `(${context.KidItemSabangnetMallListings.readSabangnetMallListings.toString()})`,
    pageContext,
  );
  const result = await reader(structuredClone(plan), 1000, 0);
  return { result: JSON.parse(JSON.stringify(result)), requests };
}

test("reads every page, keeps only chosen columns, and never forwards login fields", async () => {
  const firstPage = [
    record("5010000003"),
    // 기록마다 끼어 오는 실패 이력 줄은 기록이 아니다.
    { type: "message", prdRegsFailMsg: "승인 완료 후 수정 가능합니다.", shmaId: null },
    record("5010000002", { shmaId: "shop0464", shmaPrdNo: "8123", prdSplyStsCdNm: "일시중지", modlNm: null, sepr: "" }),
    record("5010000001", { shmaId: "shop0075", shmaPrdNo: "CP-1" }),
  ];
  const secondPage = [
    record("5010000000", { shmaId: "shop0003", shmaPrdNo: "" }),
  ];
  const pages = (current) => (current === 1
    ? page(501, [...firstPage, ...Array.from({ length: 497 }, (_, index) =>
        record(String(4000000000 + index), { shmaId: "shop0100" }))])
    : page(501, secondPage));

  const { result, requests } = await runReader({ pages });
  assert.equal(result.success, true);
  assert.deepEqual(result.snapshot.collection, {
    totalRecords: 501,
    recordsRead: 501,
    pagesRead: 2,
    totalPages: 2,
    truncated: false,
    skippedByShop: { shop0075: 1, shop0100: 497 },
    missingMallCode: 1,
  });
  assert.deepEqual(result.snapshot.proof, {
    dateFrom: "20000101",
    dateTo: "20260917",
    pageSize: 500,
    validatedList: true,
  });
  assert.deepEqual(result.snapshot.rows, [
    {
      sendSerial: "5010000002",
      sabangnetShopId: "shop0464",
      mallProductCode: "8123",
      sabangnetProductNo: "103177",
      modelName: null,
      ownProductCode: "8806381806625",
      productName: "할로윈 아트 네일팁",
      salePrice: null,
      supplyStatus: "일시중지",
      firstSentAt: "20260914 13:47",
    },
    {
      sendSerial: "5010000003",
      sabangnetShopId: "shop0472",
      mallProductCode: "KN-5010000003",
      sabangnetProductNo: "103177",
      modelName: "10162-1",
      ownProductCode: "8806381806625",
      productName: "할로윈 아트 네일팁",
      salePrice: 1950,
      supplyStatus: "공급중",
      firstSentAt: "20260914 13:47",
    },
  ]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("not-for-kiditem"), false);
  assert.equal(serialized.includes("seller-login"), false);
  assert.equal(serialized.includes("sabangnet-session-value"), false);

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.pathname, LIST_PATH);
    assert.equal(request.headers.Authorization, SESSION);
    assert.equal(request.credentials, "same-origin");
    assert.equal(request.body.startDate, "20000101");
    assert.equal(request.body.endDate, "20260917");
    assert.equal(request.body.pageSize, 500);
    assert.equal(request.body.searchDateType, "PRD_REGS_FST_TRNM_DT");
    assert.equal(request.body.mode, "search");
  }
  assert.deepEqual(requests.map((request) => request.body.currentPage), [1, 2]);
});

test("an empty list is one page read, not a failure", async () => {
  const { result } = await runReader({ pages: [page(0, [])] });
  assert.equal(result.success, true);
  assert.deepEqual(result.snapshot.collection.totalPages, 1);
  assert.deepEqual(result.snapshot.rows, []);
});

test("a missing session, a token error, or a foreign page asks for login", async () => {
  assert.equal((await runReader({ pages: [page(0, [])], cookie: "other=1" })).result.errorCode,
    "sabangnet_login_required");
  assert.equal((await runReader({ pages: [{ code: 50014, message: "Token expired" }] })).result.errorCode,
    "sabangnet_login_required");
  assert.equal((await runReader({ pages: [page(0, [])], status: 401 })).result.errorCode,
    "sabangnet_login_required");
  assert.equal((await runReader({ pages: [page(0, [])], origin: "https://www.sabangnet.co.kr" })).result.errorCode,
    "sabangnet_login_required");
});

test("stops when the total moves between pages or a page comes back short", async () => {
  const full = Array.from({ length: 500 }, (_, index) => record(String(1000 + index)));
  const moved = await runReader({
    pages: (current) => (current === 1 ? page(501, full) : page(502, [record("9999")])),
  });
  assert.equal(moved.result.errorCode, "sabangnet_total_changed");

  const short = await runReader({
    pages: (current) => (current === 1 ? page(600, full.slice(0, 100)) : page(600, [])),
  });
  assert.deepEqual(
    { errorCode: short.result.errorCode, stage: short.result.stage },
    { errorCode: "sabangnet_contract_drift", stage: "page_size" },
  );

  const unknownCode = await runReader({ pages: [{ code: 40000 }] });
  assert.deepEqual(
    { errorCode: unknownCode.result.errorCode, stage: unknownCode.result.stage },
    { errorCode: "sabangnet_contract_drift", stage: "code" },
  );
});

function ownerFixture({ pages, requestHook } = {}) {
  const context = loadSource([
    "../kiditem-os/background/collection-session.js",
    "../kiditem-os/background/sourcing/source-attempt-wire.js",
    "../kiditem-os/background/orders/sabangnet-mall-listings.js",
    "../kiditem-os/background/orders/sabangnet-mall-listings-source-owner.js",
  ]);
  const storage = {};
  const calls = [];
  const created = [];
  const removedTabs = [];
  let nextTab = 40;
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(storage[key]) }),
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (key) => { delete storage[key]; },
      },
    },
    tabs: {
      query: async () => [],
      create: async (details) => {
        created.push(details);
        return { id: ++nextTab, windowId: 7 };
      },
      get: async (id) => ({ id, windowId: 7, status: "complete", url: `${ORIGIN}/` }),
      remove: async (id) => { removedTabs.push(id); },
      update: async () => undefined,
    },
    windows: { update: async () => undefined },
    scripting: {
      executeScript: async ({ func, args }) => {
        const isolated = vm.createContext({
          AbortController,
          setTimeout: (callback) => setTimeout(callback, 0),
          clearTimeout,
          location: new URL(`${ORIGIN}/#/dashboard`),
          document: { cookie: `Authorization=${encodeURIComponent(SESSION)}` },
          decodeURIComponent,
          fetch: async (_pathname, init) => {
            const body = JSON.parse(init.body);
            const next = pages ? pages(body.currentPage) : page(1, [record("5010000001")]);
            return { ok: true, status: 200, redirected: false, text: async () => JSON.stringify(next) };
          },
        });
        const injected = vm.runInContext(`(${func.toString()})`, isolated);
        return [{ result: await injected(...args) }];
      },
    },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: "sessions",
    webUrlPatterns: [],
  });
  const collector = context.KidItemSabangnetMallListings.create({ chrome, pageDelayMs: 0 });
  const current = structuredClone(control);
  const owner = context.KidItemSabangnetMallListingsSourceOwner.create({
    chrome,
    sessions,
    collect: collector.collect,
    request: async (environmentId, path, init) => {
      calls.push({ environmentId, path, ...init });
      const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
      if (requestHook) {
        const handled = await requestHook({ path, init, response });
        if (handled) return handled;
      }
      if (init.method !== "GET") {
        current.state = init.method === "PUT" ? "COMPLETE" : "FAILED";
        if (current.state === "FAILED") {
          const failure = JSON.parse(init.body);
          current.errorCode = failure.code;
          current.errorMessage = failure.message;
        }
      }
      return response(structuredClone(current));
    },
  });
  return { owner, sessions, calls, created, removedTabs, storage };
}

test("the owner reads once, uploads the whole snapshot with the attempt token, and closes its tab", async () => {
  const f = ownerFixture();
  const result = JSON.parse(JSON.stringify(await f.owner.run({ environmentId: "office", attemptId })));
  assert.deepEqual(result, { success: true, attemptId, terminalState: "COMPLETE" });
  // VM 안에서 만든 객체라 모양만 맞춰 본다.
  assert.deepEqual(JSON.parse(JSON.stringify(f.created)), [{ url: `${ORIGIN}/`, active: false }]);
  assert.equal(f.calls.length, 2);
  const upload = f.calls[1];
  assert.equal(upload.path, `/api/channels/sabangnet-listings/attempts/${attemptId}`);
  assert.equal(upload.method, "PUT");
  assert.equal(upload.headers["x-source-attempt-token"], token);
  const body = JSON.parse(upload.body);
  assert.equal(body.collection.collectionRunId, attemptId);
  assert.equal(body.collection.recordsRead, 1);
  assert.deepEqual(body.rows.map((row) => row.mallProductCode), ["KN-5010000001"]);
  assert.equal(upload.body.includes("not-for-kiditem"), false);
  assert.deepEqual(f.removedTabs, [41]);
  assert.equal((await f.sessions.list()).length, 0);
  assert.equal(JSON.stringify(f.storage).includes(token), false);
  assert.equal(JSON.stringify(f.storage).includes("sabangnet-session-value"), false);
});

test("a Sabangnet login failure is recorded and leaves the tab open for the operator", async () => {
  const f = ownerFixture({ pages: () => ({ code: 50008, message: "Illegal token" }) });
  const result = JSON.parse(JSON.stringify(await f.owner.run({ environmentId: "office", attemptId })));
  assert.equal(result.terminalState, "FAILED");
  assert.equal(result.errorCode, "sabangnet_login_required");
  const failure = f.calls.find((call) => call.method === "POST");
  assert.equal(failure.path, `/api/channels/sabangnet-listings/attempts/${attemptId}/fail`);
  assert.equal(JSON.parse(failure.body).code, "sabangnet_login_required");
  assert.deepEqual(f.removedTabs, []);
  const [session] = await f.sessions.list();
  assert.equal(session.attention?.reason, "marketplace_login");
});

test("the start message carries only the attempt id", () => {
  const context = loadSource(["../kiditem-os/background/orders/sabangnet-mall-listings-source-owner.js"]);
  const { parseStart } = context.KidItemSabangnetMallListingsSourceOwner;
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseStart({ action: "collectSabangnetMallListings", attemptId }))),
    { attemptId },
  );
  assert.throws(() => parseStart({ action: "collectSabangnetMallListings", attemptId, plan }));
  assert.throws(() => parseStart({ action: "collectSabangnetMallListings", attemptId: "x" }));
});

test("the manifest opens only the Sabangnet admin host and the producer belongs to Channels", () => {
  const manifest = JSON.parse(readFileSync(new URL("../kiditem-os/manifest.json", import.meta.url), "utf8"));
  const sabangnetHosts = manifest.host_permissions.filter((host) => host.includes("sabangnet"));
  assert.deepEqual(sabangnetHosts, [`${ORIGIN}/*`]);
  const owners = readFileSync(
    new URL("../kiditem-os/background/source-owner-manifest.js", import.meta.url),
    "utf8",
  );
  assert.match(owners, /"orders\.sabangnet_mall_listings": "channels"/);
  const worker = readFileSync(new URL("../kiditem-os/background/orders/worker.js", import.meta.url), "utf8");
  assert.match(worker, /sabangnetMallListingsSourceOwnerV1: true/);
  assert.match(worker, /collectSabangnetMallListings: \{/);
});
