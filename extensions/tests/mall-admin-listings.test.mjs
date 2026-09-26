import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

// 몰 관리자 화면에서 등록 상품을 직접 가져온다(KID-246 2단계). 목록과 상품 보기만 GET 으로
// 읽고, 고른 칸만 owner 에 넘긴다.

const attemptId = "11111111-1111-4111-8111-111111111111";
const token = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const KIDKIDS = "https://partner.kidkids.net";
const ICECREAM = "https://po.i-screammall.co.kr";
const { DOMParser } = new JSDOM("").window;

const kidkidsPlan = {
  sourceType: "mall_admin_listings",
  parserVersion: "mall-admin-listings-v1",
  mallKey: "kidkids",
  channelAccountId: ACCOUNT,
  sourceOrigin: KIDKIDS,
  pageSize: 20000,
};
const icecreamPlan = {
  ...kidkidsPlan,
  mallKey: "icecream-mall",
  sourceOrigin: ICECREAM,
  pageSize: 10000,
};

function loadSource(files) {
  const context = vm.createContext({ Date, Map, Set, URL, setTimeout, clearTimeout, structuredClone });
  for (const file of files) {
    vm.runInContext(readFileSync(new URL(file, import.meta.url), "utf8"), context);
  }
  return context;
}



// owner 시험은 옛 경로에 남은 몰(올웨이즈)로 돈다 — 1차 몰 넷은 실행 kind로 옮겼다(KID-363).
function ownerFixture({ plan = alwayzPlan, pageToken = "eyJ-page-token", requestHook } = {}) {
  const context = loadSource([
    "../kiditem-os/background/collection-session.js",
    "../kiditem-os/background/sourcing/source-attempt-wire.js",
    "../kiditem-os/background/orders/mall-admin-listings.js",
    "../kiditem-os/background/orders/mall-admin-listings-source-owner.js",
  ]);
  const storage = {};
  const calls = [];
  const created = [];
  const removedTabs = [];
  let nextTab = 40;
  const items = [alwayzItem(1)];
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
      get: async (id) => ({ id, windowId: 7, status: "complete", url: `${ALWAYZ}/` }),
      remove: async (id) => { removedTabs.push(id); },
      update: async () => undefined,
    },
    windows: { update: async () => undefined },
    scripting: {
      executeScript: async ({ func, args }) => {
        const page = vm.createContext({
          Date, Map, Set, URL, JSON, Number, Array, String, Math,
          AbortController,
          setTimeout: (callback) => setTimeout(callback, 0),
          clearTimeout,
          localStorage: { getItem: (key) => (key === "@alwayz@seller@token@" ? pageToken : null) },
          fetch: async (url, init) => {
            const parsed = new URL(url);
            const body = JSON.parse(init.body);
            if (parsed.pathname === "/sellers/items/v2/count-request") {
              return { ok: true, status: 200, json: async () => ({ status: 200, data: items.length }) };
            }
            const start = (body.page - 1) * body.pageLimit;
            return { ok: true, status: 200, json: async () => ({ status: 2000, data: { itemsInfo: items.slice(start, start + body.pageLimit) } }) };
          },
        });
        const injected = vm.runInContext(`(${func.toString()})`, page);
        return [{ result: await injected(...args) }];
      },
    },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: "sessions",
    webUrlPatterns: [],
  });
  const collector = context.KidItemMallAdminListings.create({ chrome, requestDelayMs: 0 });
  const current = {
    attemptId,
    attemptToken: token,
    state: "RUNNING",
    generation: "1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    plan: structuredClone(plan),
  };
  const owner = context.KidItemMallAdminListingsSourceOwner.create({
    chrome,
    sessions,
    collect: collector.collect,
    mallName: collector.mallName,
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

test("owner — 계획대로 한 번 읽어 쓰기 토큰과 함께 통째로 올리고 탭을 닫는다", async () => {
  const f = ownerFixture();
  const result = JSON.parse(JSON.stringify(await f.owner.run({ environmentId: "office", attemptId })));
  assert.deepEqual(result, { success: true, attemptId, terminalState: "COMPLETE" });
  assert.deepEqual(JSON.parse(JSON.stringify(f.created)), [{
    url: `${ALWAYZ}/items/management`,
    active: false,
  }]);
  assert.equal(f.calls.length, 2);
  const upload = f.calls[1];
  assert.equal(upload.path, `/api/channels/mall-admin-listings/attempts/${attemptId}`);
  assert.equal(upload.method, "PUT");
  assert.equal(upload.headers["x-source-attempt-token"], token);
  const body = JSON.parse(upload.body);
  assert.equal(body.collection.collectionRunId, attemptId);
  assert.equal(body.collection.recordsRead, 1);
  assert.equal(body.rows.length, 1);
  assert.deepEqual(f.removedTabs, [41]);
  assert.equal((await f.sessions.list()).length, 0);
  assert.equal(JSON.stringify(f.storage).includes(token), false);
});

test("owner — 몰 로그인이 필요하면 실패로 남기고 로그인할 탭을 남긴다", async () => {
  const f = ownerFixture({ pageToken: null });
  const result = JSON.parse(JSON.stringify(await f.owner.run({ environmentId: "office", attemptId })));
  assert.equal(result.terminalState, "FAILED");
  assert.equal(result.errorCode, "mall_login_required");
  assert.match(result.error, /^올웨이즈 로그인이 필요합니다/);
  const failure = f.calls.find((call) => call.method === "POST");
  assert.equal(failure.path, `/api/channels/mall-admin-listings/attempts/${attemptId}/fail`);
  assert.equal(JSON.parse(failure.body).code, "mall_login_required");
  assert.deepEqual(f.removedTabs, []);
  const [session] = await f.sessions.list();
  assert.equal(session.attention?.reason, "marketplace_login");
});

test("owner — 읽기기가 모르는 몰 · 주소의 계획은 읽지 않고 실패로 남긴다", async () => {
  const f = ownerFixture({ plan: { ...alwayzPlan, sourceOrigin: "https://evil.example" } });
  const result = JSON.parse(JSON.stringify(await f.owner.run({ environmentId: "office", attemptId })));
  assert.equal(result.errorCode, "mall_contract_drift");
  assert.deepEqual(f.created, []);
});

test("시작 메시지는 시도 ID 만 싣는다", () => {
  const context = loadSource(["../kiditem-os/background/orders/mall-admin-listings-source-owner.js"]);
  const { parseStart } = context.KidItemMallAdminListingsSourceOwner;
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseStart({ action: "collectMallAdminListings", attemptId }))),
    { attemptId },
  );
  assert.throws(() => parseStart({ action: "collectMallAdminListings", attemptId, mallKey: "kidkids" }));
  assert.throws(() => parseStart({ action: "collectMallAdminListings", attemptId: "x" }));
});

test("읽기기 몰 표가 서버 계약과 같고, 두 몰 호스트가 권한에 있으며, producer 는 Channels 것이다", () => {
  const contract = readFileSync(
    new URL("../../packages/shared/src/schemas/mall-admin-listings.ts", import.meta.url),
    "utf8",
  );
  const collector = readFileSync(
    new URL("../kiditem-os/background/orders/mall-admin-listings.js", import.meta.url),
    "utf8",
  );
  // 1차 몰 넷(키드키즈 · 아이스크림몰 · 아트공구 · 도매꾹)은 실행 kind의 사이트 `readListings`로 옮겨 이 읽기기 표에 없다(KID-363).
  for (const origin of [KIDKIDS, ICECREAM, "https://zzogzzog1.cafe24.com", "https://www.domeggook.com"]) {
    assert.match(contract, new RegExp(`origin: '${origin}'`));
    assert.doesNotMatch(collector, new RegExp(`origin: "${origin}"`));
  }
  for (const [origin, contractSize, collectorSize] of [["https://alwayzseller.ilevit.com", "100", "100"], ["https://partner.shopby.co.kr", "100", "100"],
    ["https://shop.kidsnote.com", "100", "100"], ["https://soffice.11st.co.kr", "100", "100"],
    ["https://item.esmplus.com", "500", "500"], ["https://shopping-seller.kakao.com", "100", "100"], ["https://store.lotteon.com", "100", "100"],
    ["https://sell.smartstore.naver.com", "100", "100"], ["https://shop.teacherville.co.kr", "100", "100"]]) {
    assert.match(contract, new RegExp(`origin: '${origin}'`));
    assert.match(collector, new RegExp(`origin: "${origin}"`));
    assert.match(contract, new RegExp(`pageSize: ${contractSize},`));
    assert.match(collector, new RegExp(`pageSize: ${collectorSize},`));
  }
  const manifest = JSON.parse(readFileSync(new URL("../kiditem-os/manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.host_permissions.includes(`${KIDKIDS}/*`));
  assert.ok(manifest.host_permissions.includes("https://*.i-screammall.co.kr/*"));
  assert.ok(manifest.host_permissions.includes("https://alwayzseller.ilevit.com/*"));
  assert.ok(manifest.host_permissions.includes("https://alwayz-seller-back.ilevit.com/*"));
  assert.ok(manifest.host_permissions.includes("https://zzogzzog1.cafe24.com/*"));
  assert.ok(manifest.host_permissions.includes("https://partner.shopby.co.kr/*"));
  for (const host of ["https://*.domeggook.com/*", "https://shop.kidsnote.com/*", "https://soffice.11st.co.kr/*", "https://item.esmplus.com/*",
    "https://shopping-seller.kakao.com/*", "https://store.lotteon.com/*", "https://soapi.lotteon.com/*", "https://sell.smartstore.naver.com/*",
    "https://shop.teacherville.co.kr/*"]) {
    assert.ok(manifest.host_permissions.includes(host), host);
  }
  const owners = readFileSync(
    new URL("../kiditem-os/background/source-owner-manifest.js", import.meta.url),
    "utf8",
  );
  assert.match(owners, /"orders\.mall_admin_listings": "channels"/);
  const worker = readFileSync(new URL("../kiditem-os/background/orders/worker.js", import.meta.url), "utf8");
  assert.match(worker, /mallAdminListingsSourceOwnerV1: true/);
  // 사방넷으로만 가져오던 몰은 이 기능이 있는 확장부터 읽는다 — 웹이 그 몰을 가져오기 전에 확인한다.
  assert.match(worker, /mallAdminListingsMallsV2: true/);
  assert.match(worker, /mallAdminListingsMallsV3: true/);
  assert.match(contract, /capability: 'mallAdminListingsMallsV2'/);
  assert.match(contract, /capability: 'mallAdminListingsMallsV3'/);
  assert.match(worker, /collectMallAdminListings: \{/);
  assert.match(worker, /session\?\.producer === "orders\.mall_admin_listings"/);
});

// 올웨이즈 — 판매자센터 화면 안에서 백엔드 목록 API 를 쪽마다 읽는다(라이브 2026-09-19: 197개 = 100 + 97).
const ALWAYZ = "https://alwayzseller.ilevit.com";
const alwayzPlan = { ...kidkidsPlan, mallKey: "always", sourceOrigin: ALWAYZ, pageSize: 100 };

function alwayzItem(index, overrides = {}) {
  const id = `668b81adc75f21b22efa${index.toString(16).padStart(4, "0")}`;
  return {
    _id: id,
    itemTitle: `[키드아이템] 상품 ${index}`,
    soldOut: index % 3 === 0,
    teamPurchasePrice: 8500,
    createdAt: "2024-07-08T16:05:33.157Z",
    mainImageUris: ["https://alwayz-product-images.ilevit.com/a.jpg"],
    manualItemCode: null,
    ...overrides,
  };
}

async function runAlwayzReader({ items, token: pageToken = "eyJ-page-token", totalShift = 0 } = {}) {
  const requests = [];
  const context = loadSource(["../kiditem-os/background/orders/mall-admin-listings.js"]);
  const pageContext = vm.createContext({
    Date, Map, Set, URL, JSON, Number, Array, String, Math,
    AbortController,
    setTimeout: (callback) => setTimeout(callback, 0),
    clearTimeout,
    localStorage: { getItem: (key) => (key === "@alwayz@seller@token@" ? pageToken : null) },
    fetch: async (url, init) => {
      const parsed = new URL(url);
      const body = JSON.parse(init.body);
      requests.push({ path: parsed.pathname, body, token: init.headers["x-access-token"] });
      if (parsed.pathname === "/sellers/items/v2/count-request") {
        return { ok: true, status: 200, json: async () => ({ status: 200, data: items.length + totalShift }) };
      }
      const start = (body.page - 1) * body.pageLimit;
      return { ok: true, status: 200, json: async () => ({ status: 2000, data: { itemsInfo: items.slice(start, start + body.pageLimit) } }) };
    },
  });
  const reader = vm.runInContext(`(${context.KidItemMallAdminListings.readAlwayzListings.toString()})`, pageContext);
  const result = await reader(structuredClone(alwayzPlan), 1000, 0, 1);
  return { result: JSON.parse(JSON.stringify(result)), requests };
}

test("⭐ 올웨이즈 — 전체 수를 읽고 1쪽부터 100개씩 다 돌며, 품절 여부를 상태로, 고른 칸만 넘긴다", async () => {
  const items = Array.from({ length: 197 }, (_, index) => alwayzItem(index));
  const { result, requests } = await runAlwayzReader({ items });
  assert.equal(result.success, true);
  assert.deepEqual(requests.map((request) => [request.path, request.body.page ?? null]), [
    ["/sellers/items/v2/count-request", null],
    ["/sellers/items/v2/list-request", 1],
    ["/sellers/items/v2/list-request", 2],
  ]);
  assert.ok(requests.every((request) => request.token === "eyJ-page-token"), "토큰은 화면 안 요청 헤더에만 실린다");
  assert.ok(!JSON.stringify(result).includes("eyJ-page-token"), "결과에 토큰이 없다");
  const { rows, collection } = result.snapshot;
  assert.equal(rows.length, 197);
  assert.deepEqual(collection, { totalRecords: 197, recordsRead: 197, pagesRead: 2, totalPages: 2, detailsRead: 0, detailsMissing: 0 });
  const first = rows.find((row) => row.productName === "[키드아이템] 상품 0");
  assert.deepEqual(first, {
    mallProductCode: first.mallProductCode,
    productName: "[키드아이템] 상품 0",
    sellpiaName: null,
    sellerCode: null,
    salePrice: 8500,
    statusWords: ["품절"],
    registeredOn: "2024-07-09",
    imageUrl: "https://alwayz-product-images.ilevit.com/a.jpg",
  });
  assert.deepEqual(rows.find((row) => row.productName === "[키드아이템] 상품 1").statusWords, ["판매중"]);
});

test("올웨이즈 — 토큰이 없으면 로그인이 필요하다고 답하고, 읽는 사이 수가 바뀌면 저장하지 않는다", async () => {
  const noToken = await runAlwayzReader({ items: [alwayzItem(1)], token: null });
  assert.deepEqual(noToken.result, { success: false, errorCode: "mall_login_required" });
  assert.equal(noToken.requests.length, 0);
  const shifted = await runAlwayzReader({ items: [alwayzItem(1), alwayzItem(2)], totalShift: 1 });
  assert.deepEqual(shifted.result, { success: false, errorCode: "mall_total_changed" });
});


// 떠리몰(샵바이 파트너 어드민) — 목록 화면이 부르는 상품 검색 API 를 겉 화면 안에서 100개씩 읽는다(라이브 2026-09-19: 479개 = 5쪽).
const SHOPBY = "https://partner.shopby.co.kr";
const thirtymallPlan = { ...kidkidsPlan, mallKey: "thirtymall", sourceOrigin: SHOPBY, pageSize: 100 };

function shopbyProduct(index, overrides = {}) {
  return {
    mallProductNo: 132150000 + index,
    mallNo: 78859,
    productName: `야광 안테나 지시봉 ${index} (24개) (업체별도 무료배송)`,
    applyStatusType: "FINISHED",
    saleStatusType: "ON_SALE",
    saleSettingStatusType: "AVAILABLE_FOR_SALE",
    isSoldOut: false,
    salePrice: 8000,
    productManagementCd: "",
    registerDateTime: "2026-08-10 15:12:20",
    mainImageUrl: "//shopby-images.cdn-nhncommerce.com/a.jpg",
    ...overrides,
  };
}

async function runThirtymallReader({ products, cookie = "a=1; SHOPBY_PARTNER_SESSAT=tok-page-123; b=2", totalShift = 0, status = 200 } = {}) {
  const requests = [];
  const context = loadSource(["../kiditem-os/background/orders/mall-admin-listings.js"]);
  const pageContext = vm.createContext({
    Date, Map, Set, URL, JSON, Number, Array, String, Math,
    AbortController,
    setTimeout: (callback) => setTimeout(callback, 0),
    clearTimeout,
    decodeURIComponent,
    document: { cookie },
    fetch: async (url, init) => {
      const parsed = new URL(url);
      const body = JSON.parse(init.body);
      requests.push({ origin: parsed.origin, path: parsed.pathname, method: init.method, headers: init.headers, body });
      if (status !== 200) return { ok: false, status, json: async () => ({ code: "A0003" }) };
      const total = products.length + totalShift;
      const start = (body.page - 1) * body.size;
      return {
        ok: true,
        status: 200,
        json: async () => ({ totalCount: total, totalPage: Math.max(1, Math.ceil(total / body.size)), contents: products.slice(start, start + body.size), lastId: null }),
      };
    },
  });
  const reader = vm.runInContext(`(${context.KidItemMallAdminListings.readThirtymallListings.toString()})`, pageContext);
  const result = await reader(structuredClone(thirtymallPlan), 1000, 0, 1);
  return { result: JSON.parse(JSON.stringify(result)), requests };
}

test("⭐ 떠리몰 — 검색 API 를 100개씩 1쪽부터 다 돌고, 승인 · 판매설정 · 판매상태 · 품절을 몰 글자로, 고른 칸만 넘긴다", async () => {
  const products = Array.from({ length: 205 }, (_, index) => shopbyProduct(index));
  products[1] = shopbyProduct(1, { saleSettingStatusType: "STOP_SELLING" });
  products[2] = shopbyProduct(2, { saleSettingStatusType: "PROHIBITION_SALE", isSoldOut: true });
  products[3] = shopbyProduct(3, { applyStatusType: "APPROVAL_REJECTION", saleStatusType: "PRE_APPROVAL_STATUS" });
  products[4] = shopbyProduct(4, { isSoldOut: true, productManagementCd: "INV-10471-1" });
  const { result, requests } = await runThirtymallReader({ products });
  assert.equal(result.success, true);
  assert.deepEqual(requests.map((request) => [request.origin, request.path, request.method, request.body.page]), [
    ["https://admin-api.e-ncp.com", "/products/search", "POST", 1],
    ["https://admin-api.e-ncp.com", "/products/search", "POST", 2],
    ["https://admin-api.e-ncp.com", "/products/search", "POST", 3],
  ]);
  for (const request of requests) {
    assert.equal(request.headers.accessToken, "tok-page-123");
    assert.equal(request.headers.Version, "1.0");
    // 화면 주소가 없으면 샵바이가 403 "권한이 없습니다" 로 막는다.
    assert.equal(request.headers.ClientLocation, "https://partner-remote.shopby.co.kr/product/management/list");
    assert.deepEqual(request.body.mallNos, [78859]);
    assert.equal(request.body.size, 100);
    assert.deepEqual(request.body.periodInfo, { type: "REGISTER_DATE", period: { startYmdt: "2000-01-01 00:00:00", endYmdt: "2999-12-31 23:59:59" } });
    assert.deepEqual(request.body.saleSettingStatus, { isAll: true, types: [] });
  }
  assert.ok(!JSON.stringify(result).includes("tok-page-123"), "결과에 토큰이 없다");
  const { rows, collection } = result.snapshot;
  assert.equal(rows.length, 205);
  assert.deepEqual(collection, { totalRecords: 205, recordsRead: 205, pagesRead: 3, totalPages: 3, detailsRead: 0, detailsMissing: 0 });
  const byCode = new Map(rows.map((row) => [row.mallProductCode, row]));
  assert.deepEqual(byCode.get("132150000"), {
    mallProductCode: "132150000",
    // 몰이 모든 상품에 붙이는 "(업체별도 무료배송)"은 뗀다.
    productName: "야광 안테나 지시봉 0 (24개)",
    sellpiaName: null,
    sellerCode: null,
    salePrice: 8000,
    statusWords: ["판매중"],
    registeredOn: "2026-08-10",
    // 스킴 없이 오는 사진 주소는 https 로 채운다.
    imageUrl: "https://shopby-images.cdn-nhncommerce.com/a.jpg",
  });
  assert.deepEqual(byCode.get("132150001").statusWords, ["판매중지"]);
  assert.deepEqual(byCode.get("132150002").statusWords, ["판매금지", "품절"]);
  assert.deepEqual(byCode.get("132150003").statusWords, ["승인거부"]);
  assert.deepEqual(byCode.get("132150004").statusWords, ["품절"]);
  assert.equal(byCode.get("132150004").sellerCode, "INV-10471-1");
});

test("떠리몰 — 로그인 쿠키가 없거나 401 이면 로그인이 필요하고, 403 · 모르는 상태 · 수 변화는 저장하지 않는다", async () => {
  const noCookie = await runThirtymallReader({ products: [shopbyProduct(1)], cookie: "a=1" });
  assert.deepEqual(noCookie.result, { success: false, errorCode: "mall_login_required" });
  assert.equal(noCookie.requests.length, 0);
  const expired = await runThirtymallReader({ products: [shopbyProduct(1)], status: 401 });
  assert.deepEqual(expired.result, { success: false, errorCode: "mall_login_required" });
  const forbidden = await runThirtymallReader({ products: [shopbyProduct(1)], status: 403 });
  assert.deepEqual(forbidden.result, { success: false, errorCode: "mall_contract_drift", stage: "forbidden" });
  const unknown = await runThirtymallReader({ products: [shopbyProduct(1, { saleSettingStatusType: "SOMETHING_NEW" })] });
  assert.deepEqual(unknown.result, { success: false, errorCode: "mall_contract_drift", stage: "sale_setting" });
  const shifted = await runThirtymallReader({ products: [shopbyProduct(1), shopbyProduct(2)], totalShift: 1 });
  assert.deepEqual(shifted.result, { success: false, errorCode: "mall_total_changed" });
});

// ── 사방넷으로만 가져오던 몰(2026-09-19) — 몰 상품코드가 사방넷 모양 그대로여야 이어진 레시피를 그대로 쓴다. ──

function pageContextFor(origin, extra = {}) {
  return vm.createContext({
    Date, Map, Set, URL, URLSearchParams, JSON, Number, Array, String, Math, Object, RegExp,
    AbortController,
    setTimeout: (callback) => setTimeout(callback, 0),
    clearTimeout,
    DOMParser,
    location: new URL(`${origin}/`),
    ...extra,
  });
}

function readerIn(context, name) {
  const source = loadSource(["../kiditem-os/background/orders/mall-admin-listings.js"]);
  return vm.runInContext(`(${source.KidItemMallAdminListings[name].toString()})`, context);
}

const planFor = (mallKey, sourceOrigin, pageSize) => ({ ...kidkidsPlan, mallKey, sourceOrigin, pageSize });
const jsonAnswer = (url, payload, status = 200) => ({ ok: status >= 200 && status < 300, status, url, json: async () => payload, text: async () => JSON.stringify(payload) });


test("⭐ 11번가 — 전체 수를 주지 않는 목록을 한 쪽이 덜 찰 때까지 읽고, 판매상태 코드를 화면 글자로 넘긴다", async () => {
  const ST11 = "https://soffice.11st.co.kr";
  const codes = { 0: "103", 1: "105", 2: "108", 3: "104" };
  const items = Array.from({ length: 150 }, (_, index) => ({
    prdNo: String(3352000000 + index),
    prdNm: `상품 ${index}`,
    selStatCd: codes[index] ?? "103",
    selPrc: 5000,
    createDt: "2026/08/10",
    sellerPrdCd: index === 0 ? "8801234567890" : null,
  }));
  const starts = [];
  const context = pageContextFor(ST11, {
    fetch: async (url) => {
      const parsed = new URL(url, `${ST11}/`);
      const start = Number(parsed.searchParams.get("start"));
      const limit = Number(parsed.searchParams.get("limit"));
      starts.push([start, limit, parsed.searchParams.get("prdNo")]);
      // TOTAL_COUNT 는 "한 쪽 + 1" 이다 — 믿지 않는다.
      const payload = { TOTAL_COUNT: String(limit + 1), DATA_LIST: items.slice(start, start + limit) };
      return { ok: true, status: 200, url: parsed.href, text: async () => `(${JSON.stringify(payload)})` };
    },
  });
  const result = JSON.parse(JSON.stringify(await readerIn(context, "read11stListings")(planFor("11st", ST11, 100), 1000, 0, 1)));
  assert.equal(result.success, true);
  assert.deepEqual(starts, [[0, 100, ""], [100, 100, ""]]);
  const byCode = new Map(result.snapshot.rows.map((row) => [row.mallProductCode, row]));
  assert.deepEqual(byCode.get("3352000000").statusWords, ["판매중"]);
  assert.equal(byCode.get("3352000000").sellerCode, "8801234567890");
  assert.deepEqual(byCode.get("3352000001").statusWords, ["판매중지"]);
  assert.deepEqual(byCode.get("3352000002").statusWords, ["판매금지"]);
  assert.deepEqual(byCode.get("3352000003").statusWords, ["품절"]);
  assert.equal(byCode.get("3352000001").registeredOn, "2026-08-10");
  assert.deepEqual(result.snapshot.collection, { totalRecords: 150, recordsRead: 150, pagesRead: 2, totalPages: 2, detailsRead: 0, detailsMissing: 0 });
});

test("⭐ 지마켓 · 옥션 — 마스터 목록을 끝까지 읽고 그 사이트 것만, 사방넷 모양 `{사이트번호}_{마스터번호}` 로 넘긴다", async () => {
  const ESM = "https://item.esmplus.com";
  const items = [
    { goodsNo: "9000000001", goodsName: "둘 다", siteGoodsNo: { gmkt: "2057000001", iac: "F209000001" }, sellStatus: { gmkt: "11", iac: "21" }, price: { gmkt: 5000, iac: 5100 }, managedCode: "1234-1", createdDate: "2026-08-10 10:00:00", imgUrl: "http://gdimg.gmarket.co.kr/a.jpg" },
    { goodsNo: "9000000002", goodsName: "지마켓만", siteGoodsNo: { gmkt: "2057000002", iac: null }, sellStatus: { gmkt: "31", iac: null }, price: { gmkt: 3000, iac: null }, managedCode: "", createdDate: "2026-08-11 10:00:00", imgUrl: null },
    { goodsNo: "9000000003", goodsName: "옥션만", siteGoodsNo: { gmkt: null, iac: "C302000003" }, sellStatus: { gmkt: null, iac: "22" }, price: { gmkt: null, iac: 2000 }, managedCode: null, createdDate: "2026-08-12 10:00:00", imgUrl: null },
  ];
  const run = async (mallKey) => {
    const context = pageContextFor(ESM, {
      fetch: async (url, init) => {
        const body = JSON.parse(init.body);
        const start = (body.pageIndex - 1) * body.pageSize;
        return jsonAnswer(new URL(url, `${ESM}/`).href, { resultCode: 0, data: { totalCount: items.length, pageSize: body.pageSize, pageIndex: body.pageIndex, items: items.slice(start, start + body.pageSize) } });
      },
    });
    return JSON.parse(JSON.stringify(await readerIn(context, "readEsmListings")(planFor(mallKey, ESM, 500), 1000, 0, 1)));
  };
  const gmarket = await run("gmarket");
  assert.equal(gmarket.success, true);
  assert.deepEqual(gmarket.snapshot.rows.map((row) => [row.mallProductCode, row.alternateCodes, row.statusWords[0]]), [
    ["2057000001_9000000001", ["2057000001"], "판매중"],
    ["2057000002_9000000002", ["2057000002"], "SKU품절"],
  ]);
  assert.equal(gmarket.snapshot.rows[0].imageUrl, "https://gdimg.gmarket.co.kr/a.jpg");
  assert.equal(gmarket.snapshot.rows[0].sellerCode, "1234-1");
  assert.equal(gmarket.snapshot.collection.totalRecords, 2);
  const auction = await run("auction");
  assert.deepEqual(auction.snapshot.rows.map((row) => [row.mallProductCode, row.statusWords[0], row.salePrice]), [
    ["C302000003_9000000003", "판매불가", 2000],
    ["F209000001_9000000001", "판매중지", 5100],
  ]);
});

test("⭐ 카카오 톡스토어 — 목록 API 를 100개씩 0쪽부터 읽고, 판매상태 · 전시를 몰 글자로 넘긴다", async () => {
  const KAKAO = "https://shopping-seller.kakao.com";
  const contents = Array.from({ length: 120 }, (_, index) => ({
    id: String(793412000 + index),
    name: `상품 ${index}`,
    displayedSaleStatus: index === 1 ? "판매중지" : "판매중",
    displayStatus: index === 2 ? "전시안함" : "전시함",
    salePrice: "4900",
    storeManagementCode: index === 0 ? "1234-1" : "-",
    createdAt: "2026-08-10 10:00:00",
    imageUrl: "https://st.kakaocdn.net/a.jpg",
  }));
  const pages = [];
  const context = pageContextFor(KAKAO, {
    fetch: async (url) => {
      const parsed = new URL(url, `${KAKAO}/`);
      const page = Number(parsed.searchParams.get("page"));
      const size = Number(parsed.searchParams.get("size"));
      pages.push(page);
      return jsonAnswer(parsed.href, { contents: contents.slice(page * size, page * size + size), totalCount: contents.length, last: (page + 1) * size >= contents.length });
    },
  });
  const result = JSON.parse(JSON.stringify(await readerIn(context, "readKakaoListings")(planFor("kakao", KAKAO, 100), 1000, 0, 1)));
  assert.equal(result.success, true);
  assert.deepEqual(pages, [0, 1]);
  const byCode = new Map(result.snapshot.rows.map((row) => [row.mallProductCode, row]));
  assert.deepEqual(byCode.get("793412000").statusWords, ["판매중", "전시함"]);
  assert.equal(byCode.get("793412000").sellerCode, "1234-1");
  assert.equal(byCode.get("793412001").sellerCode, null);
  assert.deepEqual(byCode.get("793412001").statusWords, ["판매중지", "전시함"]);
  assert.deepEqual(byCode.get("793412002").statusWords, ["판매중", "전시안함"]);
  assert.equal(result.snapshot.rows.length, 120);
});

test("⭐ 키즈노트 — 판매 상품 내역을 100개씩 전체 수만큼 읽고, 상태 칸을 머리 이름으로 찾아 넘긴다", async () => {
  const KIDSNOTE = "https://shop.kidsnote.com";
  const total = 130;
  const pageHtml = (page) => {
    const rows = Array.from({ length: total }, (_, index) => index).slice((page - 1) * 100, page * 100).map((index) => `
      <tr><td><input type="checkbox" name="check_pno[]" value="${155000 + index}"></td><td>${index}</td>
      <td><img src="https://kids-wi.kakaocdn.net/dn/${index}.jpg"></td>
      <td><div class="box_setup"><a href="#">상품 ${index}</a><a href="#">복사</a></div></td>
      <td>26/08/10</td><td>1,200 원</td><td>2,000 원</td><td>0 원</td>
      <td>${index === 1 ? "품절" : index === 2 ? "숨김" : "정상"}</td><td></td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>999</td></tr>`).join("");
    return `<html><body><p>현재 검색된 모든 상품(${total}개)의</p><form name="prdFrm"><table>
      <tr><th></th><th>번호</th><th>이미지</th><th>상품명</th><th>등록일</th><th>판매가</th><th>소비자가</th><th>적립금</th><th>상태</th><th>판매설정</th><th>조회</th><th>주문</th><th>판매</th><th>관심</th><th>담기</th><th>재고</th></tr>
      ${rows}</table></form></body></html>`;
  };
  const pages = [];
  const context = pageContextFor(KIDSNOTE, {
    fetch: async (url) => {
      const parsed = new URL(url, `${KIDSNOTE}/`);
      pages.push([parsed.searchParams.get("body"), parsed.searchParams.get("row"), parsed.searchParams.get("page")]);
      const page = Number(parsed.searchParams.get("page"));
      return { ok: true, status: 200, url: parsed.href, text: async () => pageHtml(page) };
    },
  });
  const result = JSON.parse(JSON.stringify(await readerIn(context, "readKidsnoteListings")(planFor("kidsnote", KIDSNOTE, 100), 1000, 0, 1)));
  assert.equal(result.success, true);
  assert.deepEqual(pages, [["2010", "100", "1"], ["2010", "100", "2"]]);
  const byCode = new Map(result.snapshot.rows.map((row) => [row.mallProductCode, row]));
  assert.deepEqual(byCode.get("155000"), {
    mallProductCode: "155000",
    productName: "상품 0",
    sellpiaName: null,
    sellerCode: null,
    salePrice: 1200,
    statusWords: ["정상"],
    registeredOn: "2026-08-10",
    imageUrl: "https://kids-wi.kakaocdn.net/dn/0.jpg",
  });
  assert.deepEqual(byCode.get("155001").statusWords, ["품절"]);
  assert.deepEqual(byCode.get("155002").statusWords, ["숨김"]);
  assert.deepEqual(result.snapshot.collection, { totalRecords: 130, recordsRead: 130, pagesRead: 2, totalPages: 2, detailsRead: 0, detailsMissing: 0 });
});

test("롯데ON — 화면 함수로 머리를 붙여 상품 조회를 한 쪽이 덜 찰 때까지 읽는다(토큰은 밖으로 나가지 않는다)", async () => {
  const LOTTE = "https://store.lotteon.com";
  const data = Array.from({ length: 3 }, (_, index) => ({ spdNo: `LO21000000${index}`, trNo: "0012345", spdNm: `상품 ${index}`, slStatCd: ["SALE", "SOUT", "END"][index], slPrc: 3000 }));
  const sent = [];
  let answerTotal = data.length;
  let answerRows = data;
  class FakeXhr {
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    send(body) {
      sent.push(JSON.parse(body));
      this.status = 200;
      this.responseText = JSON.stringify({ returnCode: "SUCCESS", totalCount: answerTotal, data: answerRows });
      setTimeout(() => this.onload(), 0);
    }
  }
  const makeContext = (user) => pageContextFor(LOTTE, {
    gcm: {
      _sbm_setRequestHeader: (xhr) => xhr.setRequestHeader("Authorization", "Bearer secret"),
      user,
    },
    sessionStorage: { getItem: (key) => (key === "AuthToken" ? "secret" : null) },
    XMLHttpRequest: FakeXhr,
  });
  const ours = { getTrGrpCd: () => "SR", getTrNo: () => "0012345" };
  const result = JSON.parse(JSON.stringify(await readerIn(makeContext(ours), "readLotteonListings")(planFor("lotte-on", LOTTE, 100), 1000, 0, 1)));
  assert.equal(result.success, true);
  // 우리 거래처로 좁힌다 — 거래처 없이 부르면 롯데ON 전체 상품이 온다.
  assert.deepEqual(sent, [{ trGrpCd: "SR", trNo: "0012345", pageNo: 1, rowsPerPage: 100 }]);
  assert.deepEqual(result.snapshot.rows.map((row) => [row.mallProductCode, row.statusWords[0]]), [
    ["LO210000000", "판매중"], ["LO210000001", "품절"], ["LO210000002", "판매종료"],
  ]);
  assert.ok(!JSON.stringify(result).includes("secret"), "결과에 토큰이 없다");
  assert.equal(result.snapshot.collection.totalRecords, 3);

  // 로그인 정보(거래처)가 없는 탭은 로그인이 필요하다 — 좁히지 못한 채 읽지 않는다.
  sent.length = 0;
  const noUser = JSON.parse(JSON.stringify(await readerIn(makeContext({ getTrNo: () => { throw new Error("no user"); } }), "readLotteonListings")(planFor("lotte-on", LOTTE, 100), 1000, 0, 1)));
  assert.deepEqual(noUser, { success: false, errorCode: "mall_login_required" });
  assert.equal(sent.length, 0);
  // 좁혔는데도 몇만 건이거나 남의 거래처 줄이 오면 멈춘다.
  answerTotal = 164_084_736;
  const huge = JSON.parse(JSON.stringify(await readerIn(makeContext(ours), "readLotteonListings")(planFor("lotte-on", LOTTE, 100), 1000, 0, 1)));
  assert.deepEqual(huge, { success: false, errorCode: "mall_contract_drift", stage: "row_limit" });
  answerTotal = 1;
  answerRows = [{ ...data[0], trNo: "9999999" }];
  const foreign = JSON.parse(JSON.stringify(await readerIn(makeContext(ours), "readLotteonListings")(planFor("lotte-on", LOTTE, 100), 1000, 0, 1)));
  assert.deepEqual(foreign, { success: false, errorCode: "mall_contract_drift", stage: "trade_scope" });
});

test("⭐ 티쳐몰 — 칸 머리(상품명이 두 칸을 덮는다)로 판매가 · 상태 · 노출을 찾고, 이름 링크만 상품명으로 넘긴다", async () => {
  const TEACHER = "https://shop.teacherville.co.kr";
  const row = (index, state, shown) => `
    <tr><td><input type="checkbox" name="goods_seq[]" value="${1117000 + index}"></td><td></td><td class="page_no">${index}</td>
      <td><a href="#"><img src="https://shop.teacherville.co.kr/data/${index}.jpg"></a></td>
      <td><a href="#">[상품번호: ${1117000 + index}]</a><a href="#">상품 ${index} (1p)</a></td>
      <td>900</td><td>2,000</td><td>1,500</td><td>40 %</td><td>[1] 10 / 10</td><td>-</td><td>택배(2500)</td><td>0 0</td>
      <td>2026-08-10 10:00:00 2026-08-11 10:00:00</td><td><span>${state[0]}</span><span>${state[1]}</span></td><td>${shown}</td><td></td></tr>
    <tr><td colspan="17">옵션</td></tr>`;
  const html = `<html><body><table>
    <tr><th></th><th></th><th>번호</th><th colspan="2">상품명</th><th>공급가</th><th>정가</th><th>판매가</th><th>마진율</th><th>재고/가용</th><th>재고판매</th><th>배송</th><th>구매/PV</th><th>등록일▼ /수정일</th><th>상태</th><th>노출</th><th>관리</th></tr>
    ${row(0, ["승인", "정상"], "노출")}${row(1, ["미승인", "판매중지"], "노출")}${row(2, ["승인", "재고확보중"], "미노출")}
  </table></body></html>`;
  const pages = [];
  const context = pageContextFor(TEACHER, {
    fetch: async (url) => {
      const parsed = new URL(url, `${TEACHER}/`);
      pages.push([parsed.searchParams.get("page"), parsed.searchParams.get("perpage")]);
      return { ok: true, status: 200, url: parsed.href, text: async () => html };
    },
  });
  const result = JSON.parse(JSON.stringify(await readerIn(context, "readTeacherListings")(planFor("teacher-mall", TEACHER, 100), 1000, 0, 1)));
  assert.equal(result.success, true);
  assert.deepEqual(pages, [["1", "100"]]);
  const byCode = new Map(result.snapshot.rows.map((item) => [item.mallProductCode, item]));
  assert.deepEqual(byCode.get("1117000"), {
    mallProductCode: "1117000",
    productName: "상품 0 (1p)",
    sellpiaName: null,
    sellerCode: null,
    salePrice: 1500,
    statusWords: ["승인", "정상", "노출"],
    registeredOn: "2026-08-10",
    imageUrl: "https://shop.teacherville.co.kr/data/0.jpg",
  });
  assert.deepEqual(byCode.get("1117001").statusWords, ["미승인", "판매중지", "노출"]);
  assert.deepEqual(byCode.get("1117002").statusWords, ["승인", "재고확보중", "미노출"]);
});

test("스마트스토어 — 화면의 $http 로 원상품 목록을 읽고, 채널상품번호를 코드로 · 원상품번호를 다른 코드로 넘긴다", async () => {
  const NAVER = "https://sell.smartstore.naver.com";
  const content = [
    { id: 10091000001, productName: "상품 A", productStatusType: "SALE", salePrice: 5000, singleChannelProducts: [{ channelProductNo: 5441000001 }], sellerManagementCode: "1234-1", regDate: "2026-08-10T10:00:00", representImageUrl: "https://shop-phinf.pstatic.net/a.jpg" },
    { id: 10091000002, productName: "상품 B", productStatusType: "SUSPENSION", salePrice: 6000, singleChannelProducts: [{ channelProductNo: 5441000002 }] },
  ];
  const calls = [];
  const $http = async (config) => {
    calls.push(config.data);
    // 원상품 목록 답은 전체 수를 `total` 에 싣는다(공개 번들 app.js).
    return { status: 200, data: { content, pageable: { page: 0, size: 100 }, total: content.length } };
  };
  const context = pageContextFor(NAVER, {
    document: { body: {} },
    window: { angular: { element: () => ({ injector: () => ({ get: () => $http }) }) } },
  });
  context.location = { hostname: "sell.smartstore.naver.com", href: `${NAVER}/#/products/origin-list` };
  const result = JSON.parse(JSON.stringify(await readerIn(context, "readSmartstoreListings")(planFor("smartstore", NAVER, 100), 1000, 0, 1)));
  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    searchPeriodType: "PROD_REG_DAY",
    searchKeywordType: "CHANNEL_PRODUCT_NO",
    searchOrderType: "REG_DATE",
    searchKeyword: "",
    searchDynamicPricingType: "ALL",
    page: 0,
    size: 100,
  }]);
  assert.equal(result.snapshot.rows[0].imageUrl, "https://shop-phinf.pstatic.net/a.jpg");
  assert.deepEqual(result.snapshot.rows.map((row) => [row.mallProductCode, row.alternateCodes, row.statusWords[0]]), [
    ["5441000001", ["10091000001"], "판매중"],
    ["5441000002", ["10091000002"], "판매중지"],
  ]);
  assert.equal(result.snapshot.rows[0].sellerCode, "1234-1");
});

test("롯데ON — 탭마다 로그인이라 로그인된 판매자센터 탭을 빌려 화면 안(MAIN)에서 읽고, 탭을 만들지도 닫지도 않는다", async () => {
  const LOTTE = "https://store.lotteon.com";
  const context = loadSource(["../kiditem-os/background/orders/mall-admin-listings.js"]);
  const created = [];
  const injected = [];
  const snapshot = {
    collection: { totalRecords: 0, recordsRead: 0, pagesRead: 1, totalPages: 1, detailsRead: 0, detailsMissing: 0 },
    rows: [],
    proof: { mallKey: "lotte-on", pageSize: 100, validatedList: true },
  };
  const chrome = {
    tabs: {
      query: async () => [
        { id: 7, status: "complete", url: `${LOTTE}/cm/main/login_SO.wsp` },
        { id: 8, status: "complete", url: `${LOTTE}/cm/main/index_SO.wsp` },
      ],
      create: async (details) => { created.push(details); return { id: 99, windowId: 1 }; },
      get: async (id) => ({ id, status: "complete" }),
    },
    scripting: {
      executeScript: async (details) => {
        injected.push({ tabId: details.target.tabId, world: details.world });
        return [{ result: { success: true, snapshot } }];
      },
    },
  };
  const collector = context.KidItemMallAdminListings.create({ chrome, requestDelayMs: 0 });
  const attachments = [];
  const result = await collector.collect(planFor("lotte-on", LOTTE, 100), {
    assertActive: async () => true,
    attachTab: async (tab) => { attachments.push(tab); return true; },
    detachTab: async () => undefined,
  });
  assert.equal(result.success, true);
  assert.deepEqual(injected, [{ tabId: 8, world: "MAIN" }]);
  assert.deepEqual(created, []);
  assert.deepEqual(attachments, []);
});
