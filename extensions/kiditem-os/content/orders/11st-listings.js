// 11번가 셀러오피스(soffice.11st.co.kr) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js` `read11stListings` 이식,
// 본문 그대로). 사이트 `extensions/src/sites/11st/listings.ts`가 상품조회/수정 화면 탭에 `page-call/bridge.js`와 함께 주입하고
// `11st.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양 그대로다.
(function install11stListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 11번가 셀러오피스(상품조회/수정) 안에서 돈다. 목록 조회(`getSellProductListJSON`)를 검색 폼 기본값 그대로(상품번호
  // 칸만 비움) 100개씩 앞에서부터 읽는다(라이브 2026-09-19: 900개 = 9쪽). 이 조회의 TOTAL_COUNT 는 전체 수가 아니라
  // "한 쪽 + 1"(다음이 있다는 표시)이라, 한 쪽이 덜 차면 끝이다. 판매상태 코드는 목록 화면의 표 그대로다.
  async function read11stListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const STATUS = { 101: "승인대기", 102: "전시전", 103: "판매중", 104: "품절", 105: "판매중지", 106: "판매종료", 108: "판매금지", 109: "승인거부" };
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

    async function list(start) {
      const params = new URLSearchParams({
        method: "getSellProductListJSON", srchTyp: "prdNew", start: String(start), limit: String(plan.pageSize),
        prdNo: "", prdNm: "", searchType: "PRDNO", dateType: "CREATE", category1: "", category2: "", category3: "",
        category4: "", chkSelStatCds: "", selMthdCd: "", createDt: "", createDtTo: "", stckQty: "", remainSelDt: "",
        premiumAplDt: "", dlvCstInstBasiCd: "", dlvCstPayTypCd: "", premiumPlusAplDt: "", dlvClf: "", dlvClfDtl: "",
        data: "", searchListingItemClsf: "", mobilePrdYn: "", shopNo: "", prdTypCd: "", omPrdYn: "", svcAreaCd: "",
        isPaging: "Y", reglDlvYn: "N", mnbdClfCd: "", stdPrdYn: "", sendClfCd: "ALL", selStopRsnCd: "",
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`/product/SellProductAjaxAction.tmall?${params.toString()}`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || /login/i.test(landed.pathname)) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const body = (await response.text()).trim();
        if (!/^[({]/.test(body)) {
          if (/login|로그인/i.test(body)) throw new Error("LOGIN_REQUIRED");
          throw new Error("INVALID_RESPONSE");
        }
        let json = null;
        try {
          json = JSON.parse(body.replace(/^\(/, "").replace(/\)$/, ""));
        } catch {
          throw new Error("INVALID_RESPONSE");
        }
        if (!Array.isArray(json?.DATA_LIST)) drift("data_list");
        return json.DATA_LIST;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const rows = [];
      const seen = new Set();
      let pages = 0;
      for (let start = 0; ; start += plan.pageSize) {
        if (pages >= PAGE_LIMIT) drift("page_limit");
        if (pages > 0 && requestDelayMs > 0) await wait(requestDelayMs);
        const items = await list(start);
        pages += 1;
        for (const item of items) {
          const mallProductCode = String(item?.prdNo ?? "");
          if (!/^\d{6,12}$/.test(mallProductCode)) drift("prd_no");
          // 앞에서부터 세는 쪽이라, 읽는 사이 상품이 늘면 같은 상품이 다음 쪽에 또 온다.
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(item.prdNm, 400);
          if (!productName) drift("prd_nm");
          const status = STATUS[String(item.selStatCd ?? "")];
          if (!status) drift("sel_stat_cd");
          const amount = Number(item.selPrc);
          const registered = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(String(item.createDt ?? ""));
          const sellerCode = text(String(item.sellerPrdCd ?? ""), 60);
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // 판매자 상품코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다.
            sellerCode: sellerCode && sellerCode !== "null" ? sellerCode : null,
            salePrice: Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null,
            statusWords: [status],
            registeredOn: registered ? `${registered[1]}-${registered[2]}-${registered[3]}` : null,
          });
          if (rows.length > ROW_LIMIT) drift("row_limit");
        }
        if (items.length < plan.pageSize) break;
      }
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      // 전체 수를 따로 주지 않는 목록이다 — 끝까지 읽은 줄 수가 전체다. 쪽 수는 그 수로 센다.
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

  calls["11st.listings"] = (args) => read11stListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
