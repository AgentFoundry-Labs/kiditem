// 아트공구(zzogzzog1.cafe24.com) 등록 상품 목록 읽기(ISOLATED world, KID-363 L2 — 옛 `mall-admin-listings.js` `readArt09Listings` 이식, 본문 그대로).
// 사이트 `extensions/src/sites/art09`의 `readListings`가 그 몰 관리자 화면 탭에 `page-call/bridge.js`와 함께 주입하고
// `art09.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양(`{success, snapshot: {collection, rows, proof}}` 또는
// `{success: false, errorCode, stage}`) 그대로다 — 원문 응답·토큰은 싣지 않는다.
(function installArt09Listings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  /**
   * 아트공구(카페24 공급사 관리자) 상품목록(라이브 2026-09-19: 550개). 목록 화면(ProductManage)을 100개씩 1쪽부터
   * 끝까지 읽는다 — 등록일 순으로 쪽을 돌아도 겹치지 않았다(6쪽에 고유 550개). 줄의 체크박스가 상품번호와
   * 진열 · 판매 상태를 들고 있고([판매함] · [판매안함] 버튼도 이 값을 읽는다), 이름은 상품명 링크, 값은 '판매가'
   * 칸이다. 셀피아 이름도 자체상품코드 칸도 목록에 없어 상품명으로만 잇는다.
   */
  async function readArt09Listings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const LIST_PATH = "/disp/admin/shop1/product/ProductManage";
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const MAX_PAGE_BYTES = 16 * 1024 * 1024;
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
    function price(value) {
      const normalized = String(value ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return parsed <= 1_000_000_000 ? parsed : null;
    }
    function counter(doc) {
      const value = Number(String(doc.querySelector(".total strong")?.textContent || "").replace(/[^\d]/g, ""));
      return Number.isSafeInteger(value) ? value : null;
    }

    async function page(number) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const params = new URLSearchParams({ orderby: "regist_d", limit: String(plan.pageSize), page: String(number) });
        const response = await fetch(`${LIST_PATH}?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        // 로그인이 풀렸으면 목록 화면이 아닌 곳(로그인)으로 넘어간다.
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || landed.pathname.toLowerCase() !== LIST_PATH.toLowerCase()) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const body = await response.text();
        if (body.length > MAX_PAGE_BYTES) throw new Error("INVALID_RESPONSE");
        const doc = new DOMParser().parseFromString(body, "text/html");
        if (!doc.querySelector("#eProductSearchForm")) throw new Error("LOGIN_REQUIRED");
        return doc;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      if (location.origin !== plan.sourceOrigin) return fail("mall_login_required");
      const first = await page(1);
      const total = counter(first);
      if (total === null || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");

      const rows = [];
      const seen = new Set();
      for (let number = 1; number <= totalPages; number += 1) {
        if (number > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const doc = number === 1 ? first : await page(number);
        // 읽는 사이 상품이 늘거나 줄면 한 번에 찍은 목록이 아니다.
        if (counter(doc) !== total) return fail("mall_total_changed");
        const boxes = [...doc.querySelectorAll("input._product_no")];
        if (boxes.length === 0) {
          if (total === 0) break;
          drift("goods_table");
        }
        const table = boxes[0].closest("table");
        const headers = [...(table?.tHead?.rows?.[0]?.cells || [])]
          .map((cell) => cell.textContent.replace(/\s+/g, " ").trim());
        const priceIndex = headers.indexOf("판매가");
        if (priceIndex < 0) drift("column:판매가");
        for (const box of boxes) {
          const mallProductCode = text(String(box.value ?? ""), 60);
          if (!mallProductCode || !/^\d{1,12}$/.test(mallProductCode)) drift("product_no");
          // 쪽이 겹치면 정렬이 흔들린 것이다 — 빠진 상품이 있다는 뜻이라 저장하지 않는다.
          if (seen.has(mallProductCode)) drift("page_overlap");
          seen.add(mallProductCode);
          const row = box.closest("tr");
          const productName = text(row?.querySelector("a.ec-product-list-productname")?.textContent, 400);
          if (!productName) drift("product_name");
          const display = box.getAttribute("is_display");
          const selling = box.getAttribute("is_selling");
          if (!/^[TF]$/.test(display || "") || !/^[TF]$/.test(selling || "")) drift("state");
          const source = row.querySelector("img")?.getAttribute("src") || "";
          const imageUrl = source.startsWith("//") ? `https:${source}` : source;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode: null,
            salePrice: price(row.cells[priceIndex]?.textContent),
            statusWords: [selling === "T" ? "판매함" : "판매안함", display === "T" ? "진열함" : "진열안함"],
            registeredOn: null,
            ...(/^https:\/\//.test(imageUrl) && imageUrl.length <= 2000 ? { imageUrl } : {}),
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

  calls["art09.listings"] = (args) => readArt09Listings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
