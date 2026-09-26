// 꼬망세(EduPre 입점관리자 nstore.edupre.co.kr) 등록 상품 목록 읽기(ISOLATED world, KID-381 — 옛 `mall-admin-listings.js`
// `readKkomangseListings` 이식, 본문 그대로). 사이트 `extensions/src/sites/kkomangse/listings.ts`가 배송상품 목록 화면 탭에
// `page-call/bridge.js`와 함께 주입하고 `kkomangse.listings`를 부른다. 조회만 한다. 답은 옛 읽기기의 결과 모양 그대로다.
(function installKkomangseListings() {
  "use strict";
  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});
  // 옛 수집기의 요청 제한·간격·동시 수(30초 · 150ms · 3).
  const REQUEST_TIMEOUT_MS = 30000;
  const REQUEST_DELAY_MS = 150;
  const CONCURRENCY = 3;

  // 꼬망세(EduPre) 입점관리자 안에서 돈다. 배송상품 목록이 `listmaxcount` 로 한 쪽 크기를
  // 정해 줘서 전체를 한 번에 받는다(라이브 2026-09-18: 2,602개). 셀피아 이름도 자체코드
  // 칸도 없어 상품명으로만 잇는다.
  async function readKkomangseListings(plan, requestTimeoutMs, _requestDelayMs, _concurrency) {
    const LIST_PATH = "/subAdmin/_product.list.php";
    const ROW_LIMIT = 20_000;
    const MAX_LIST_BYTES = 32 * 1024 * 1024;
    const CODE = /chk_pcode\[([A-Za-z0-9-]{1,60})\]/;
    const fail = (errorCode, stage) => ({ success: false, errorCode, ...(stage ? { stage } : {}) });
    const drift = (stage) => {
      throw new Error(`CONTRACT_DRIFT:${stage}`);
    };

    function text(value, maximum) {
      if (typeof value !== "string") return null;
      const normalized = value.replace(/\s+/g, " ").trim();
      return normalized && normalized.length <= maximum ? normalized : null;
    }
    // 판매가 칸은 정가와 실제 판매가를 위아래로 담는다. 아래(마지막) 값이 실제로 파는 값이다.
    function price(cell) {
      const amounts = (cell?.textContent || "").match(/[\d,]+\s*원/g) || [];
      const last = amounts[amounts.length - 1];
      const normalized = String(last ?? "").replace(/[,\s원]/g, "");
      if (!/^\d{1,10}$/.test(normalized)) return null;
      const parsed = Number(normalized);
      return parsed <= 1_000_000_000 ? parsed : null;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      let doc;
      try {
        const response = await fetch(`${LIST_PATH}?listmaxcount=${plan.pageSize}`, {
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
        if (body.length > MAX_LIST_BYTES) throw new Error("INVALID_RESPONSE");
        doc = new DOMParser().parseFromString(body, "text/html");
      } finally {
        clearTimeout(timer);
      }

      // 상품 줄에는 상품코드를 담은 체크박스가 있다. 그 체크박스를 가진 표가 상품 목록이다 —
      // 검색 폼의 표도 줄이 많아 줄 수로 고르면 엉뚱한 표를 잡는다.
      const table = [...doc.querySelectorAll("table")].find(
        (candidate) => candidate.querySelector('input[name^="chk_pcode["]'),
      );
      if (!table) drift("goods_table");

      const rows = [];
      const seen = new Set();
      for (const row of [...table.rows].slice(1)) {
        const checkbox = row.querySelector('input[name^="chk_pcode["]');
        const mallProductCode = text(CODE.exec(checkbox?.getAttribute("name") || "")?.[1], 60);
        if (!mallProductCode || seen.has(mallProductCode)) continue;
        seen.add(mallProductCode);
        const cells = row.cells;
        // 상품정보 칸에 상품명 · 상품코드 · 몰 내부번호가 함께 온다. 이름만 남긴다 —
        // 끝에 붙는 `[17726127426200]` 를 떼지 않으면 셀피아 이름과 영영 맞지 않는다
        // (라이브 2026-09-18: 판매중 449개 중 9개만 이어졌다).
        const info = (cells[3]?.textContent || "").replace(/\s+/g, " ").trim();
        const productName = text(
          info.replace(mallProductCode, " ").replace(/\[\s*\d{7,20}\s*\]/g, " "),
          400,
        );
        if (!productName) drift("goods_name");
        const status = text(cells[2]?.textContent, 20);
        if (!status) drift("status");
        const imageUrl = cells[3]?.querySelector("img")?.getAttribute("src") || null;
        rows.push({
          mallProductCode,
          productName,
          sellpiaName: null,
          sellerCode: null,
          salePrice: price(cells[5]),
          statusWords: [status],
          registeredOn: null,
          ...(imageUrl && /^https:\/\//.test(imageUrl) ? { imageUrl } : {}),
        });
        if (rows.length > ROW_LIMIT) drift("row_limit");
      }
      if (rows.length === 0) drift("empty_list");
      // 한 쪽에 다 담겼는지 — 쪽 크기만큼 꽉 찼으면 뒤가 잘렸다는 뜻이다.
      if (rows.length >= plan.pageSize) drift("row_count");
      rows.sort((left, right) => left.mallProductCode.localeCompare(right.mallProductCode));
      return {
        success: true,
        snapshot: {
          collection: {
            totalRecords: rows.length,
            recordsRead: rows.length,
            pagesRead: 1,
            totalPages: 1,
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

  calls["kkomangse.listings"] = (args) => readKkomangseListings(args && args.plan, REQUEST_TIMEOUT_MS, REQUEST_DELAY_MS, CONCURRENCY);
})();
