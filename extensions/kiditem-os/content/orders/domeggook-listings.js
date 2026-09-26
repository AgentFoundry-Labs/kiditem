// 도매꾹(www.domeggook.com) 등록 상품 목록 읽기(ISOLATED world, KID-363 L2 — 옛 `mall-admin-listings.js` `readDomeggookListings` 이식, 본문 그대로).
// 사이트 `extensions/src/sites/domeggook`의 `readListings`가 그 몰 관리자 화면 탭에 `page-call/bridge.js`와 함께 주입하고
// `domeggook.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양(`{success, snapshot: {collection, rows, proof}}` 또는
// `{success: false, errorCode, stage}`) 그대로다 — 원문 응답·토큰은 싣지 않는다.
(function installDomeggookListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 도매꾹 상품공급사센터 안에서 돈다. 상품조회/수정 목록(`/sc/item/lstAll`)이 부르는 목록 조회(`/sc/item/lst`, JSON)를
  // 검색 폼 기본값 그대로(상품번호 칸만 비움) 한 쪽 500개씩 읽는다(라이브 2026-09-19: 493개 = 1쪽). 답의 `cnt` 가 전체 수다.
  // 몰 상품코드는 도매꾹 상품번호(no)이고, 상태는 진행상태(진행중 · 기간종료 · 승인대기)와 진열(진열함 · 진열안함) 두 칸이다.
  async function readDomeggookListings(plan, requestTimeoutMs, requestDelayMs, _concurrency) {
    const ROW_LIMIT = 20_000;
    const PAGE_LIMIT = 1_000;
    const BASE = [["ktype", "no"], ["nos", ""], ["ttl", ""], ["st", ""], ["chn[]", "dome"], ["chn[]", "supply"],
      ["sec[]", "sell"], ["sec[]", "shop"], ["ca1", "00"], ["ca2", "00"], ["ca3", "00"], ["ca4", "00"], ["idx", ""],
      ["qty", ""], ["disp", ""], ["rmp", ""], ["format", "grid"], ["so", "rd"]];
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
      const digits = String(value ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(digits)) return null;
      const amount = Number(digits);
      return amount <= 1_000_000_000 ? amount : null;
    }

    function imageOf(html) {
      const match = /(?:src|href)=["'](https:\/\/[^"']+\.(?:jpe?g|png|gif|webp)[^"']*)["']/i.exec(String(html ?? ""));
      return match && match[1].length <= 2000 ? match[1] : null;
    }

    async function list(page) {
      const params = new URLSearchParams();
      for (const [key, value] of BASE) params.append(key, value);
      params.append("pg", String(page));
      params.append("sz", String(plan.pageSize));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetch(`/sc/item/lst?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest" },
          signal: controller.signal,
        });
        const landed = new URL(response.url || location.href, location.href);
        if (landed.origin !== location.origin || /login/i.test(landed.pathname)) throw new Error("LOGIN_REQUIRED");
        if (!response.ok) throw new Error("NETWORK_FAILED");
        const json = await response.json().catch(() => null);
        if (!json || typeof json !== "object") throw new Error("INVALID_RESPONSE");
        if (json.res !== true) {
          if (/로그인|login/i.test(String(json.msg ?? ""))) throw new Error("LOGIN_REQUIRED");
          drift("res");
        }
        if (!Array.isArray(json.dat)) drift("dat");
        return json;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const first = await list(1);
      const total = Number(first.cnt);
      if (!Number.isInteger(total) || total < 0) drift("total");
      if (total > ROW_LIMIT) drift("row_limit");
      const totalPages = Math.max(1, Math.ceil(total / plan.pageSize));
      if (totalPages > PAGE_LIMIT) drift("page_limit");
      const rows = [];
      const seen = new Set();
      for (let page = 1; page <= totalPages; page += 1) {
        if (page > 1 && requestDelayMs > 0) await wait(requestDelayMs);
        const answer = page === 1 ? first : await list(page);
        if (Number(answer.cnt) !== total) return fail("mall_total_changed");
        for (const item of answer.dat) {
          const mallProductCode = String(item?.no ?? "");
          if (!/^\d{5,10}$/.test(mallProductCode)) drift("item_no");
          if (seen.has(mallProductCode)) return fail("mall_total_changed");
          seen.add(mallProductCode);
          const productName = text(item.title, 400);
          if (!productName) drift("title");
          const progress = text(item.status, 20);
          const shown = text(item.disp, 20);
          if (!progress || !shown) drift("status");
          const registered = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(String(item.dateReg ?? ""));
          const image = imageOf(item.img);
          rows.push({
            mallProductCode,
            productName,
            sellpiaName: null,
            // 자체상품코드 칸. 셀피아 코드를 심어 두면 코드로 잇는다(지금은 전부 비어 있다).
            sellerCode: text(item.code, 60),
            salePrice: price(item.amt_dome),
            statusWords: [progress, shown],
            registeredOn: registered ? `${registered[1]}-${registered[2]}-${registered[3]}` : null,
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

  calls["domeggook.listings"] = (args) => readDomeggookListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
