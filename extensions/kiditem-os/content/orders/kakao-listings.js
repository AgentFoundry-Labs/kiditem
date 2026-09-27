// 카카오 톡스토어 판매자센터(shopping-seller.kakao.com) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js`
// `readKakaoListings` 이식, 본문 그대로). 사이트 `extensions/src/sites/kakao/listings.ts`가 상품조회 화면 탭에 `page-call/bridge.js`와
// 함께 주입하고 `kakao.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양 그대로다.
(function installKakaoListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 카카오 톡스토어 판매자센터 안에서 돈다. 상품조회 화면이 부르는 목록 API(`GET /api/tstore/products`)를 100개씩 0쪽부터
  // 읽는다(라이브 2026-09-19: 386개 = 4쪽). 몰 상품코드는 톡스토어 상품번호(id)이고, 상태는 판매상태(판매중 · 판매중지 ·
  // 품절 · 판매금지)와 전시(전시함 · 전시안함) 두 칸이다.
  async function readKakaoListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
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

    async function list(page) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const params = new URLSearchParams({ size: String(plan.pageSize), page: String(page) });
        const response = await fetch(`/api/tstore/products?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || response.status === 401 || response.status === 403) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        if (!Array.isArray(json.contents)) drift("contents");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const first = await list(0);
      const total = first.totalCount;
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const seen = new Set();
      for (let page = 0; page < totalPages; page += 1) {
        if (page > 0 && requestDelayMs > 0) await wait(requestDelayMs);
        const answer = page === 0 ? first : await list(page);
        if (answer.totalCount !== total) return fail("mall_total_changed");
        for (const product of answer.contents) {
          const mallProductCode = String(product?.id ?? "");
          if (!/^\d{5,12}$/.test(mallProductCode)) drift("product_id");
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(product.name, 400);
          if (!productName) drift("product_name");
          const sale = text(product.displayedSaleStatus, 20);
          const shown = text(product.displayStatus, 20);
          if (!sale || !shown) drift("status");
          const digits = String(product.salePrice ?? "").replace(/[,\s원]/g, "");
          const amount = /^\d{1,10}$/.test(digits) ? Number(digits) : null;
          const code = text(product.storeManagementCode, 60);
          const registered = /^(\d{4}-\d{2}-\d{2})/.exec(String(product.createdAt ?? ""));
          const image = typeof product.imageUrl === "string" && /^https:\/\//.test(product.imageUrl)
            && product.imageUrl.length <= 2000 ? product.imageUrl : null;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // 판매자관리코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다(비었으면 "-").
            sellerCode: code && code !== "-" ? code : null,
            salePrice: amount !== null && amount <= 1_000_000_000 ? amount : null,
            statusWords: [sale, shown],
            registeredOn: registered ? registered[1] : null,
            ...(image ? { imageUrl: image } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
      }
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

  calls["kakao.listings"] = (args) => readKakaoListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
