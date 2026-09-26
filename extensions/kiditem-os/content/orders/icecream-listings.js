// 아이스크림몰(po.i-screammall.co.kr) 등록 상품 목록 읽기(ISOLATED world, KID-363 L2 — 옛 `mall-admin-listings.js` `readIcecreamListings` 이식, 본문 그대로).
// 사이트 `extensions/src/sites/icecream-mall`의 `readListings`가 그 몰 관리자 화면 탭에 `page-call/bridge.js`와 함께 주입하고
// `icecream-mall.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양(`{success, snapshot: {collection, rows, proof}}` 또는
// `{success: false, errorCode, stage}`) 그대로다 — 원문 응답·토큰은 싣지 않는다.
(function installIcecreamListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 아이스크림 PO 안에서 돈다. 상품 정보 관리 화면이 부르는 목록 조회를 같은 검색 폼(보안
  // 서명 포함)으로 기간 없이 부르고, 셀피아 상품 이름은 상품 보기(type=R)의 고시 '품명 및
  // 모델명'(174)에서 읽는다. 목록 원문은 넘기지 않는다.
  async function readIcecreamListings(plan, requestTimeoutMs, requestDelayMs, concurrency) {
    const LIST_PATH = "/goods/goodsMgmt.getGoodsList.do";
    const VIEW_PATH = "/goods/goodsCommon.goodsView.do";
    const PAGE_LIMIT = 1000;
    const ROW_LIMIT = 20_000;
    const MAX_LIST_CHARS = 64 * 1024 * 1024;
    const MAX_VIEW_CHARS = 8 * 1024 * 1024;
    const NAME_NOTICE = /"goodsNotiItemCd"\s*:\s*"174"\s*,\s*"notiItemCmt"\s*:\s*"((?:[^"\\]|\\.)*)"/;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    function text(value, maximum) {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const normalized = String(value).replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }
    function price(value) {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : null;
    }
    function isoDate(value) {
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
      return match ? match[1] : null;
    }

    async function get(path, headers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(path, {
          credentials: "include",
          cache: "no-store",
          headers,
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== plan.sourceOrigin || /login/i.test(landed.pathname)) {
          throw new Error("LOGIN_REQUIRED");
        }
        if (!response.ok) throw new Error("NETWORK_FAILED");
        return await response.text();
      } finally {
        clearTimeout(timer);
      }
    }

    function rowFrom(item) {
      if (!item || typeof item !== "object" || Array.isArray(item)) drift("row");
      const code = text(item.goodsNo, 30);
      if (!code || !/^\d+$/.test(code)) drift("goods_no");
      const productName = text(item.goodsNm, 400);
      if (!productName) drift("goods_name");
      const saleStatus = text(item.saleStatNm, 20);
      if (!saleStatus) drift("sale_status");
      if (item.dispYn !== "Y" && item.dispYn !== "N") drift("display");
      return {
        mallProductCode: code,
        productName,
        sellpiaName: null,
        // 업체상품코드. 등록할 때 셀피아 코드를 심어 두면 목록에 그대로 실려 온다.
        sellerCode: text(item.entrGoodsNo, 60),
        salePrice: price(item.salePrc),
        statusWords: [saleStatus, item.dispYn === "Y" ? "전시" : "전시안함"],
        registeredOn: isoDate(item.aprvDt) ?? isoDate(item.sysRegDtm),
      };
    }

    try {
      if (location.origin !== plan.sourceOrigin) return fail("mall_login_required");
      const form = document.getElementById("goodsInfoGridForm");
      if (!form) {
        return document.querySelector('input[type="password"]')
          ? fail("mall_login_required")
          : fail("mall_contract_drift", "search_form");
      }
      // 화면의 조회 버튼과 같은 순서 — 기간 조건, 검색 폼 전체, 쪽 크기와 쪽 번호.
      const searchForm = new URLSearchParams();
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string") searchForm.append(name, value);
      }
      const today = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const endOfToday = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}T23:59:59`;

      async function readList(pageIdx) {
        const params = new URLSearchParams({
          goodsStartDtm: "2000-01-01T00:00:00",
          goodsEndDtm: endOfToday,
          goodsDtmIgnoreOption: "check",
        });
        for (const [name, value] of searchForm) params.append(name, value);
        params.append("rowsPerPage", String(plan.pageSize));
        params.append("pageIdx", String(pageIdx));
        const body = await get(`${LIST_PATH}?${params}`, { Accept: "application/json" });
        if (body.length > MAX_LIST_CHARS) throw new Error("INVALID_RESPONSE");
        let json;
        try {
          json = JSON.parse(body);
        } catch {
          if (/type=["']?password/i.test(body)) throw new Error("LOGIN_REQUIRED");
          drift("json");
        }
        if (json?.succeeded === false) drift("succeeded");
        const total = Number(json?.totalCount);
        if (!Number.isSafeInteger(total) || total < 0) drift("total");
        if (!Array.isArray(json?.payloads)) drift("payloads");
        return { total, list: json.payloads };
      }

      const first = await readList(1);
      if (first.total > ROW_LIMIT) return fail("mall_invalid_snapshot", "row_limit");
      const pages = Math.max(1, Math.ceil(first.total / plan.pageSize));
      if (pages > PAGE_LIMIT) return fail("mall_invalid_snapshot", "page_limit");
      const seen = new Set();
      const rows = [];
      for (let pageIdx = 1; pageIdx <= pages; pageIdx += 1) {
        if (pageIdx > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const page = pageIdx === 1 ? first : await readList(pageIdx);
        if (page.total !== first.total) return fail("mall_total_changed");
        const expected = pageIdx < pages ? plan.pageSize : first.total - plan.pageSize * (pages - 1);
        if (page.list.length !== expected) drift("page_size");
        for (const item of page.list) {
          const row = rowFrom(item);
          if (seen.has(row.mallProductCode)) return fail("mall_total_changed");
          seen.add(row.mallProductCode);
          rows.push(row);
        }
      }

      let detailsRead = 0;
      let detailsMissing = 0;
      let cursor = 0;
      let halted = false;
      async function detailWorker() {
        while (!halted && cursor < rows.length) {
          const row = rows[cursor];
          cursor += 1;
          try {
            const params = new URLSearchParams({ type: "R", goodsNo: row.mallProductCode });
            const html = await get(`${VIEW_PATH}?${params}`);
            if (html.length > MAX_VIEW_CHARS) throw new Error("INVALID_RESPONSE");
            if (!html.includes("goodsNotiItemCd") && /type=["']?password/i.test(html)) {
              throw new Error("LOGIN_REQUIRED");
            }
            const notice = NAME_NOTICE.exec(html);
            row.sellpiaName = notice ? text(JSON.parse(`"${notice[1]}"`), 400) : null;
            detailsRead += 1;
          } catch (error) {
            if (error?.message === "LOGIN_REQUIRED") {
              halted = true;
              throw error;
            }
            // 상세 하나를 못 읽어도 목록은 온전하다. 그 상품은 상품명으로만 잇는다.
            detailsMissing += 1;
          }
          if (requestDelayMs > 0) await wait(requestDelayMs);
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, detailWorker));

      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: first.total,
            recordsRead: rows.length,
            pagesRead: pages,
            totalPages: pages,
            detailsRead,
            detailsMissing,
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

  calls["icecream-mall.listings"] = (args) => readIcecreamListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
