// 올웨이즈(alwayzseller.ilevit.com) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js` `readAlwayzListings` 이식, 본문 그대로).
// 사이트 `extensions/src/sites/always/listings.ts`가 상품 조회/수정 화면 탭에 `page-call/bridge.js`와 함께 주입하고 `always.listings`를
// 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양(`{success, snapshot}` 또는 `{success: false, errorCode, stage}`) 그대로다 — 토큰은 싣지 않는다.
(function installAlwayzListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  /**
   * 올웨이즈 판매자센터 상품 목록(라이브 2026-09-19). 상품 조회/수정 화면이 부르는 백엔드 목록 API 를 **화면 안에서**
   * 부른다 — 인증 토큰은 이 화면의 localStorage 에 있고 x-access-token 으로 싣는다. 토큰은 이 함수 밖으로 나가지
   * 않는다. 먼저 전체 수(`v2/count-request`)를 읽고 1쪽부터 쪽을 다 돈다(`v2/list-request`, page 는 1부터).
   * 상품코드는 몰 상품 고유번호(`_id`), 상태는 soldOut 한 칸(품절 · 판매중)이다.
   */
  async function readAlwayzListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const BACKEND = "https://alwayz-seller-back.ilevit.com";
    const TOKEN_KEY = "@alwayz@seller@token@";
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function text(value, maximum) {
      if (typeof value !== "string") return null;
      const normalized = value.replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }

    const token = (() => {
      try {
        return localStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    })();
    if (!token) return fail("mall_login_required");

    async function post(path, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${BACKEND}${path}`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "x-access-token": token },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    // 등록일은 한국 날짜로 둔다(몰 화면이 그렇게 보인다).
    function koreanDay(value) {
      const time = Date.parse(String(value ?? ""));
      if (!Number.isFinite(time)) return null;
      return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }

    try {
      const condition = { type: "item", itemCondition: {} };
      const count = await post("/sellers/items/v2/count-request", { condition });
      if (Number(count.status) !== 200 || !Number.isInteger(count.data) || count.data < 0) drift("count");
      const total = count.data;
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");

      const rows = [];
      const seen = new Set();
      for (let page = 1; page <= totalPages; page += 1) {
        if (page > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const list = await post("/sellers/items/v2/list-request", { condition, page, pageLimit: plan.pageSize });
        if (Number(list.status) !== 2000 || !Array.isArray(list.data?.itemsInfo)) drift("list");
        for (const item of list.data.itemsInfo) {
          const mallProductCode = text(String(item?._id ?? ""), 60);
          if (!mallProductCode || !/^[0-9a-f]{24}$/i.test(mallProductCode)) drift("item_id");
          if (seen.has(mallProductCode)) continue;
          seen.add(mallProductCode);
          const productName = text(item.itemTitle, 400);
          if (!productName) drift("item_title");
          if (typeof item.soldOut !== "boolean") drift("sold_out");
          const price = Number(item.teamPurchasePrice);
          const image = Array.isArray(item.mainImageUris) ? item.mainImageUris[0] : null;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // [코드기입] 칸. 판매자가 적어 둔 코드가 있으면 그 코드로 잇는다(지금은 전부 비어 있다).
            sellerCode: text(item.manualItemCode, 60),
            salePrice: Number.isInteger(price) && price >= 0 && price <= 1_000_000_000 ? price : null,
            statusWords: [item.soldOut ? "품절" : "판매중"],
            registeredOn: koreanDay(item.createdAt),
            ...(typeof image === "string" && /^https:\/\//.test(image) && image.length <= 2000 ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
      // 읽는 사이 상품이 늘거나 줄면 한 번에 찍은 목록이 아니다.
      if (rows.length !== total) return fail("mall_total_changed");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: total,
            recordsRead: rows.length,
            pagesRead: totalPages,
            totalPages,
            detailsRead: 0,
            detailsMissing: 0,
          },
          rows,
          proof: { mallKey: plan.mallKey, pageSize: plan.pageSize, validatedList: true },
        },
      };
    } catch (error) {
      if (error?.name === "AbortError") return fail("mall_timeout");
      if (error?.message === "LOGIN_REQUIRED") return fail("mall_login_required");
      if (error?.message === "INVALID_RESPONSE") return fail("mall_invalid_snapshot");
      if (error?.message?.startsWith("CONTRACT_DRIFT:")) {
        return fail("mall_contract_drift", error.message.slice("CONTRACT_DRIFT:".length, 160));
      }
      return fail("mall_network_failed");
    }
  }

  calls["always.listings"] = (args) => readAlwayzListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
