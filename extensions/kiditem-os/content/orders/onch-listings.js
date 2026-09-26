// 온채널 공급사(www.onch3.co.kr) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js` `readOnchannelListings` 이식,
// 본문 그대로). 사이트 `extensions/src/sites/onch/listings.ts`가 등록 상품 관리 화면 탭에 `page-call/bridge.js`와 함께 주입하고
// `onch.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양 그대로다.
(function installOnchannelListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 온채널 공급사 안에서 돈다. 등록 상품 관리 화면이 쪽마다 15줄을 HTML 로 주고, 쪽 수는
  // 쪽 번호 링크가 말한다. 셀피아 이름도 자체코드 칸도 없어 상품명으로만 잇는다 — 상태 칸은
  // 판매상태와 재고상태를 함께 담는다(`판매중 / 일시품절`).
  async function readOnchannelListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const LIST_PATH = "/products_management.php";
    const ROW_LIMIT = 20_000;
    const MAX_PAGE_BYTES = 8 * 1024 * 1024;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };

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

    async function getPage(page) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`${LIST_PATH}?page=${page}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || /login/i.test(landed.pathname)) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const body = await response.text();
        if (body.length > MAX_PAGE_BYTES) throw new Error("INVALID_RESPONSE");
        return new DOMParser().parseFromString(body, "text/html");
      } finally {
        clearTimeout(timer);
      }
    }

    // 상품 줄만 담긴 표. 상품코드 칸(3번째)이 `CH` 로 시작하는 표를 고른다 — 화면의 다른
    // 표(검색 · 안내)를 잡으면 줄 수가 맞아도 내용이 비어 온다.
    function goodsTable(doc) {
      const tables = [...doc.querySelectorAll("table")];
      return tables.find((table) => [...table.rows].slice(1).some(
        (row) => /^CH\d+$/.test((row.cells[2]?.textContent || "").trim()),
      )) || null;
    }

    function maxPage(doc) {
      const pages = [...doc.querySelectorAll("a")]
        .map((anchor) => Number((anchor.getAttribute("href") || "").match(/[?&]page=(\d+)/)?.[1] || 0))
        .filter((value) => Number.isSafeInteger(value) && value > 0);
      return pages.length > 0 ? Math.max(...pages) : 1;
    }

    try {
      const first = await getPage(1);
      const totalPages = maxPage(first);
      if (totalPages < 1 || totalPages > 1_000) drift("total_pages");
      const rows = [];
      const seen = new Set();
      let pagesRead = 0;
      for (let page = 1; page <= totalPages; page += 1) {
        const doc = page === 1 ? first : await getPage(page);
        pagesRead += 1;
        const table = goodsTable(doc);
        // 마지막 쪽 뒤에 빈 쪽이 오는 일은 없다. 표가 없으면 화면이 바뀐 것이다.
        if (!table) drift("goods_table");
        for (const row of [...table.rows].slice(1)) {
          const cells = row.cells;
          const mallProductCode = text(cells[2]?.textContent, 60);
          if (!mallProductCode || !/^CH\d+$/.test(mallProductCode)) continue;
          if (seen.has(mallProductCode)) continue;
          seen.add(mallProductCode);
          const productName = text(cells[5]?.textContent, 400);
          if (!productName) drift("goods_name");
          // `판매중 / 일시품절` 처럼 판매상태와 재고상태가 한 칸에 온다. 둘 다 남긴다.
          const statusWords = (cells[3]?.textContent || "")
            .split(/\s*\n\s*|\s{2,}/)
            .map((word) => text(word, 20))
            .filter(Boolean)
            .slice(0, 4);
          if (statusWords.length === 0) drift("status");
          const imageUrl = cells[4]?.querySelector("img")?.getAttribute("src") || null;
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode: null,
            salePrice: price(cells[7]?.textContent),
            statusWords,
            registeredOn: null,
            ...(imageUrl && /^https:\/\//.test(imageUrl) ? { imageUrl } : {}),
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
        if (page < totalPages && requestDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
        }
      }
      if (rows.length === 0) drift("empty_list");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: rows.length,
            recordsRead: rows.length,
            pagesRead,
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

  calls["onch.listings"] = (args) => readOnchannelListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
