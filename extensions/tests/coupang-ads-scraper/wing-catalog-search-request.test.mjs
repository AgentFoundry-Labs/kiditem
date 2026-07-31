import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/worker.js",
    import.meta.url,
  ),
  "utf8",
);

function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

function createHarness({ cookie }) {
  const requests = [];
  const context = vm.createContext({
    AbortSignal: {
      timeout: (timeoutMs) => ({ timeoutMs }),
    },
    document: { cookie },
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) =>
            name.toLowerCase() === "content-type"
              ? "application/json;charset=UTF-8"
              : null,
        },
        text: async () =>
          JSON.stringify({
            result: [{ productId: 123, productName: "슬라임" }],
          }),
      };
    },
  });
  vm.runInContext(
    `${functionSource(
      "executeWingCatalogSearchInPage",
      "executeWingCatalogSearch",
    )}\nglobalThis.runSearch = executeWingCatalogSearchInPage;`,
    context,
  );
  return { context, requests };
}

test("Wing catalog search mirrors the page XSRF request contract", async () => {
  const { context, requests } = createHarness({
    cookie: "locale=ko_KR; XSRF-TOKEN=wing%2Ftoken%3D; other=value",
  });
  const payload = {
    keyword: "슬라임",
    excludedProductIds: [],
    searchPage: 0,
    searchOrder: "DEFAULT",
    sortType: "DEFAULT",
  };

  const response = await context.runSearch(
    payload,
    "/tenants/seller-web/pre-matching/search",
  );

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "/tenants/seller-web/pre-matching/search",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(requests[0].init.headers)),
    {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": "wing/token=",
    },
  );
  assert.equal(requests[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(requests[0].init.body), payload);
  assert.equal(requests[0].init.signal.timeoutMs, 20000);
  assert.equal(response.ok, true);
  assert.equal(response.body.result[0].productName, "슬라임");
});

test("Wing catalog search stops before fetch when the page XSRF token is missing", async () => {
  const { context, requests } = createHarness({
    cookie: "locale=ko_KR; other=value",
  });

  const response = await context.runSearch(
    { keyword: "슬라임" },
    "/tenants/seller-web/pre-matching/search",
  );

  assert.equal(requests.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    ok: false,
    status: 0,
    contentType: "",
    body: null,
    errorCode: "wing_xsrf_token_missing",
    error:
      "Wing 검색 인증 토큰을 찾지 못했습니다. Wing 탭을 새로고침하거나 다시 로그인해 주세요.",
  });
});
