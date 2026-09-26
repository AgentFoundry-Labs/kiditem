// 롯데ON 판매자센터(store.lotteon.com) 등록 상품 목록 읽기(MAIN world, KID-381 — 옛 `mall-admin-listings.js` `readLotteonListings` 이식,
// 본문 그대로). 요청 머리를 붙이는 화면 함수(`gcm._sbm_setRequestHeader`)와 로그인 정보(`gcm.user`)가 페이지 변수라 MAIN world다.
// 사이트 `extensions/src/sites/lotte-on/listings.ts`가 판매자센터 탭(열린 탭을 재사용 — 탭마다 로그인)에 `page-call/bridge.js`·
// `page-call/runner.js`와 함께 주입하고 `lotte-on.listings`를 부른다. 조회만 한다. 토큰은 답에 싣지 않는다.
(function installLotteonListings() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 롯데ON 판매자센터 화면 안(MAIN)에서 돈다. 상품 조회(`selectProductList`, soapi)를 우리 거래처(화면의 로그인 정보
  // `gcm.user` 의 거래처그룹 · 거래처번호)로 좁혀 100개씩 1쪽부터 전체 수(`totalCount`)만큼 읽는다 — 거래처 없이 부르면 롯데ON
  // 전체 상품(1억 건대)이 온다(라이브 2026-09-19). 롯데ON 은 탭마다 로그인이라 로그인된 판매자센터 탭을 빌려 읽는다. 요청 머리
  // (토큰 · 시간대 · 기기)는 화면이 요청마다 쓰는 함수(`gcm._sbm_setRequestHeader`)로 붙이고 토큰은 밖으로 나가지 않는다. 몰
  // 상품코드는 판매자상품번호(spdNo, `LO…`)다. 모든 줄이 우리 거래처 것인지 확인한다.
  async function readLotteonListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const API = "https://soapi.lotteon.com/soapi/v1/product/information/selectProductList";
    const STATUS = { SALE: "판매중", SOUT: "품절", STP: "판매중지", END: "판매종료" };
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

    function first(row, keys) {
      for (const key of keys) {
        const value = row?.[key];
        if (value !== undefined && value !== null && value !== "") return value;
      }
      return null;
    }

    try {
      const deadline = Date.now() + 20_000;
      const ready = () => typeof gcm !== "undefined" && gcm && typeof gcm._sbm_setRequestHeader === "function"
        && Boolean(sessionStorage.getItem("AuthToken"));
      while (!ready()) {
        if (/login/i.test(location.href) || Date.now() > deadline) return fail("mall_login_required");
        await wait(500);
      }
      // 로그인 화면에도 토큰 칸이 있다 — 거래처 정보가 없으면 로그인되지 않은 탭이다.
      if (/login/i.test(location.href)) return fail("mall_login_required");
      let trade = null;
      try {
        trade = { trGrpCd: gcm.user.getTrGrpCd(), trNo: gcm.user.getTrNo() };
      } catch {
        trade = null;
      }
      if (!trade || !trade.trNo || !trade.trGrpCd) return fail("mall_login_required");
      const post = (body) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", API, true);
        xhr.timeout = requestTimeoutMs;
        xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
        xhr.setRequestHeader("Accept", "application/json");
        gcm._sbm_setRequestHeader(xhr);
        xhr.onload = () => {
          if (xhr.status === 401 || xhr.status === 403) return reject(new Error("LOGIN_REQUIRED"));
          if (xhr.status < 200 || xhr.status >= 300) return reject(new Error("NETWORK_FAILED"));
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("INVALID_RESPONSE"));
          }
        };
        xhr.ontimeout = () => reject(Object.assign(new Error("timeout"), { name: "AbortError" }));
        xhr.onerror = () => reject(new Error("NETWORK_FAILED"));
        xhr.send(JSON.stringify(body));
      });

      const rows = [];
      const seen = new Set();
      let total = null;
      let totalPages = 1;
      for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
        if (pageNo > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const json = await post({ ...trade, pageNo, rowsPerPage: plan.pageSize });
        if (json?.returnCode !== "SUCCESS") drift("return_code");
        if (!Array.isArray(json.data)) drift("data");
        const count = Number(json.totalCount);
        if (!Number.isInteger(count) || count < 0) drift("total");
        if (total === null) {
          // 우리 거래처로 좁혔는데도 몇만 건이면 좁히기가 먹지 않은 것이다 — 남의 상품을 읽지 않는다.
          if (count > ROW_LIMIT) drift("row_limit");
          total = count;
          totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
          if (totalPages > PAGE_LIMIT) drift("page_limit");
        } else if (count !== total) {
          return fail("mall_total_changed");
        }
        for (const item of json.data) {
          if (String(item?.trNo ?? "") !== String(trade.trNo)) drift("trade_scope");
          const mallProductCode = String(item?.spdNo ?? "");
          if (!/^LO\d{4,20}$/.test(mallProductCode)) drift("spd_no");
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(String(first(item, ["spdNm", "pdNm", "prdNm", "sitmNm"]) ?? ""), 400);
          if (!productName) drift("product_name");
          const code = String(item.slStatCd ?? "");
          const status = STATUS[code] ?? text(String(first(item, ["slStatNm", "slStatCdNm"]) ?? code), 20);
          if (!status) drift("sl_stat_cd");
          const amount = Number(first(item, ["slPrc", "salePrc", "dcPrc"]));
          const registered = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(first(item, ["regDttm", "regDt", "fstRegDttm"]) ?? ""));
          const sellerCode = text(String(first(item, ["epdNo", "eitmNo", "trPdNo"]) ?? ""), 60);
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            sellerCode,
            salePrice: Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000_000 ? amount : null,
            statusWords: [status],
            registeredOn: registered ? `${registered[1]}-${registered[2]}-${registered[3]}` : null,
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

  calls["lotte-on.listings"] = (args) => readLotteonListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
