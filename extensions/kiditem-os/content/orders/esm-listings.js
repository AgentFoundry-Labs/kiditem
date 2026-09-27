// 지마켓 · 옥션(ESM Plus item.esmplus.com) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js` `readEsmListings`
// 이식, 본문 그대로). 사이트 `extensions/src/sites/gmarket/listings.ts`·`sites/auction/listings.ts`가 상품 조회/수정 화면 탭에
// `page-call/bridge.js`와 함께 주입하고 `esm.listings`를 부른다 — 어느 사이트 것을 고를지는 plan의 몰 키다. 조회만 한다.
(function installEsmListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 지마켓 · 옥션(ESM Plus 상품 조회/수정) 안에서 돈다. 목록 검색(`POST /api/ea/goods/search`)을 검색 조건 없이 500개씩
  // 1쪽부터 읽는다(라이브 2026-09-19: 마스터 1,584개 = 4쪽, 지마켓 934 · 옥션 754). 한 마스터가 두 사이트에 함께 있을 수
  // 있어 계획의 몰(gmarket → gmkt, auction → iac)에 올라간 것만 고른다. 몰 상품코드는 사방넷이 쓰던 모양 그대로
  // `{사이트상품번호}_{마스터상품번호}` 이고, 사방넷이 사이트 번호만 준 상품이 있어 그 번호를 다른 코드로 함께 싣는다.
  // 판매상태 코드는 목록 화면의 칸 그대로다(01 등록대기 · 11 판매가능 · 21 판매중지 · 22 판매불가 · 31 SKU품절).
  async function readEsmListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const SITE = { gmarket: "gmkt", auction: "iac" }[plan.mallKey];
    const STATUS = { "01": "등록대기", 11: "판매중", 21: "판매중지", 22: "판매불가", 31: "SKU품절" };
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

    async function search(pageIndex) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch("/api/ea/goods/search", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
          body: JSON.stringify({
            query: { goodsIds: "", sellStatus: [], category: {}, registrationDate: {}, shipping: {}, additionalService: [] },
            pageIndex,
            pageSize: plan.pageSize,
          }),
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || /login|signin/i.test(landed.pathname)) throw new Error("LOGIN_REQUIRED");
        if (response.status === 401 || response.status === 403) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        const data = json.data;
        if (!data || !Array.isArray(data.items)) drift("items");
        return data;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      if (!SITE) drift("site");
      const first = await search(1);
      const total = first.totalCount;
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const masterPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (masterPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const masters = new Set();
      const seen = new Set();
      for (let pageIndex = 1; pageIndex <= masterPages; pageIndex += 1) {
        if (pageIndex > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const data = pageIndex === 1 ? first : await search(pageIndex);
        if (data.totalCount !== total) return fail("mall_total_changed");
        for (const item of data.items) {
          const goodsNo = String(item?.goodsNo ?? "");
          if (!/^\d{6,12}$/.test(goodsNo)) drift("goods_no");
          if (masters.has(goodsNo)) return fail("mall_total_changed");
          masters.add(goodsNo);
          const siteNo = item?.siteGoodsNo?.[SITE];
          if (siteNo === null || siteNo === undefined || siteNo === "") continue;
          const siteGoodsNo = String(siteNo);
          if (!/^[A-Z]?\d{6,12}$/.test(siteGoodsNo)) drift("site_goods_no");
          const mallProductCode = `${siteGoodsNo}_${goodsNo}`;
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(item.goodsName, 400);
          if (!productName) drift("goods_name");
          const status = STATUS[String(item?.sellStatus?.[SITE] ?? "")];
          if (!status) drift("sell_status");
          const amount = Number(item?.price?.[SITE]);
          const registered = /^(\d{4}-\d{2}-\d{2})/.exec(String(item.createdDate ?? ""));
          const image = typeof item.imgUrl === "string" && /^https?:\/\//.test(item.imgUrl)
            ? item.imgUrl.replace(/^http:\/\//, "https://")
            : null;
          rows.push({
            mallProductCode,
            // 사방넷은 마스터 번호 없이 사이트 번호만 준 상품이 있다 — 그 번호로 이미 이어진 리스팅을 쓴다.
            alternateCodes: [siteGoodsNo],
            productName,
            sellpiaName: null,
            // 판매자관리코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다.
            sellerCode: text(item.managedCode, 60),
            salePrice: Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null,
            statusWords: [status],
            registeredOn: registered ? registered[1] : null,
            ...(image && image.length <= 2000 ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
      if (masters.size !== total) return fail("mall_total_changed");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      // 마스터 목록을 끝까지 읽고 이 사이트 것만 골랐다 — 이 몰의 전체는 고른 줄 수다.
      const totalPages = Math.max(1, Math.ceil(rows.length / plan.pageSize));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: rows.length,
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

  calls["esm.listings"] = (args) => readEsmListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
